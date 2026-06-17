require('dotenv').config();

const { app, BrowserWindow, ipcMain, session, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const initSqlJs = require('sql.js');
const { MongoClient } = require('mongodb');

// Allow audio autoplay without user gesture (needed for TV dashboard)
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// MongoDB connection
let mongoClient = null;
let mongoConnecting = false;

function setupMongoListeners(client) {
  // Log connection state changes (invisible to UI, visible in dev console)
  client.on('connectionPoolReady', () => console.log('[MONGO] Pool ready'));
  client.on('connectionPoolClosed', () => console.log('[MONGO] Pool closed'));
  client.on('serverHeartbeatSucceeded', () => { /* silent */ });
  client.on('serverHeartbeatFailed', (event) => {
    console.log(`[MONGO] Heartbeat failed: ${event.failure?.message || 'unknown'}`);
  });

  // Auto-reconnect if topology is destroyed (rare in v7, but safe guard)
  client.on('topologyClosed', async () => {
    console.log('[MONGO] Topology closed — scheduling reconnect...');
    // Don't attempt immediate reconnect; wait and let the driver retry.
    // If this fires repeatedly, escalation is needed, but for a TV dashboard
    // the next polling will just return [] and try again.
  });
}

async function connectMongo() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.log('[MONGO] No MONGODB_URI in .env — skipping MongoDB connection');
    return null;
  }
  try {
    const client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 10000,  // wait 10s to find a server
      heartbeatFrequencyMS: 10000,      // check every 10s
      retryWrites: false,               // read-only, no writes
    });
    setupMongoListeners(client);
    await client.connect();
    console.log('[MONGO] Connected successfully');
    mongoConnecting = false;
    return client;
  } catch (err) {
    console.log('[MONGO] Connection failed:', err.message);
    mongoConnecting = false;
    return null;
  }
}

// Periodic health check — reconnects if client was lost
function startMongoHealthCheck() {
  setInterval(async () => {
    if (mongoConnecting) return; // already attempting
    if (!mongoClient) {
      // Client never connected or was null — try now
      mongoConnecting = true;
      console.log('[MONGO] Health-check: attempting connection...');
      mongoClient = await connectMongo();
      if (mongoClient) {
        console.log('[MONGO] Health-check: reconnected successfully');
      }
    } else {
      // Client exists — ping to verify it's alive
      try {
        await mongoClient.db('admin').command({ ping: 1 });
      } catch {
        // Ping failed — client might be in bad state, try replacing it
        console.log('[MONGO] Health-check: ping failed, will reconnect on next check');
        mongoClient = null;
      }
    }
  }, 60000); // check every 60 seconds
}

let mainWindow;
let db;
let dbPath;
let pushCounter = 0; // Incremented on every IPC push for debugging

// Check if running in dev mode (passed via command line)
const isDevMode = process.argv.includes('--dev');
const HTTP_PORT = 8001;
const API_KEY = process.env.API_KEY || 'AGS-DASHBOARD-2026'; // Use env var or default

// Helper to check API key
function isValidApiKey(req) {
  // Allow all requests in dev mode
  if (isDevMode) return true;
  
  const apiKey = req.headers['x-api-key'];
  return apiKey === API_KEY;
}

async function createWindow() {
  // Detect external display (TV) — auto-fullscreen on secondary monitor
  const displays = screen.getAllDisplays();
  const primaryDisplay = screen.getPrimaryDisplay();
  const externalDisplay = displays.find(d => d.id !== primaryDisplay.id);

  const windowOptions = {
    width: 1920,
    height: 1080,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  };

  // If an external display (TV) is connected, position window there
  if (externalDisplay) {
    windowOptions.x = externalDisplay.bounds.x;
    windowOptions.y = externalDisplay.bounds.y;
    console.log(`[STARTUP] External display detected at (${externalDisplay.bounds.x}, ${externalDisplay.bounds.y}) — will auto-fullscreen`);
  } else {
    console.log('[STARTUP] No external display detected — using primary monitor');
  }

  mainWindow = new BrowserWindow(windowOptions);

  if (externalDisplay) {
    // TV — go fullscreen immediately (header will be hidden via the fullscreen listener)
    mainWindow.setFullScreen(true);
  } else {
    // Single monitor — start maximized with header visible
    mainWindow.maximize();
  }

  // Notify renderer on fullscreen changes (F11, etc.)
  mainWindow.on('enter-full-screen', () => {
    if (mainWindow) {
      mainWindow.webContents.send('window:fullscreenChanged', true);
    }
  });
  mainWindow.on('leave-full-screen', () => {
    if (mainWindow) {
      mainWindow.webContents.send('window:fullscreenChanged', false);
    }
  });

  // In dev mode, load from localhost:3000, otherwise load static files
  if (isDevMode) {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools(); // Open DevTools for debugging
  } else {
    mainWindow.loadFile(path.join(__dirname, '../out/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  
  // Set Content Security Policy
  // NOTE: Skip CSP for file:// requests because Chromium's site isolation
  // crashes with a CHECK failure when CSP is applied to opaque origins (file://).
  // All our requests go to localhost:8001 which only accepts valid API keys
  // for write operations. Read operations are unrestricted for display purposes.
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    if (details.url.startsWith('file://')) {
      callback({ responseHeaders: details.responseHeaders });
      return;
    }

    const cspSources = [
      "default-src 'self'",
      `script-src 'self'${isDevMode ? " 'unsafe-inline' 'unsafe-eval'" : ''}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self'",
      `connect-src 'self' http://localhost:* http://127.0.0.1:* ws://localhost:* ws://127.0.0.1:* wss://localhost:* wss://127.0.0.1:*`,
    ].join('; ');

    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [cspSources],
      },
    });
  });
}

async function initDatabase() {
  const SQL = await initSqlJs();
  dbPath = path.join(app.getPath('userData'), 'notifications.db');
  
  // Load existing database or create new one
  let data = null;
  if (fs.existsSync(dbPath)) {
    data = fs.readFileSync(dbPath);
  }
  
  db = new SQL.Database(data);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      priority TEXT DEFAULT 'critical',
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Crises table for crisis panel
  db.run(`
    CREATE TABLE IF NOT EXISTS crises (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      severity TEXT DEFAULT 'high',
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Cycle spraying table
  db.run(`
    CREATE TABLE IF NOT EXISTS cycle_spraying (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      field TEXT NOT NULL,
      plot TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  saveDatabase();
  console.log('Database initialized at:', dbPath);
}


function saveDatabase() {
  if (db && dbPath) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  }
}

// Delete notifications older than 1 hour
function cleanupExpiredNotifications() {
  if (!db) return;
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const stmt = db.prepare('DELETE FROM notifications WHERE created_at < ?');
    stmt.run([oneHourAgo]);
    stmt.free();
    const changes = db.getRowsModified();
    if (changes > 0) {
      saveDatabase();
      const ts = new Date().toISOString();
      console.log(`[CLEANUP] ${ts} Cleaned up ${changes} expired notification(s) — sending refresh`);
      if (mainWindow && mainWindow.webContents && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('notification:refresh');
      }
    }
  } catch (err) {
    console.error('Error cleaning up expired notifications:', err);
  }
}

// Save notification to database and notify renderer
function handleNewNotification(notification) {
  const createdAt = new Date().toISOString();
  const stmt = db.prepare('INSERT INTO notifications (title, message, priority, created_at) VALUES (?, ?, ?, ?)');
  stmt.run([notification.title, notification.message, notification.priority || 'critical', createdAt]);
  stmt.free();
  
  const lastId = db.exec('SELECT last_insert_rowid()')[0].values[0][0];
  
  // Use parameterized query (defense in depth)
  const fetchStmt = db.prepare('SELECT * FROM notifications WHERE id = ?');
  fetchStmt.bind([lastId]);
  const result = [];
  while (fetchStmt.step()) {
    result.push(fetchStmt.getAsObject());
  }
  fetchStmt.free();
  
  saveDatabase();
  
  if (result.length > 0) {
    const newNotification = result[0];
    
    if (mainWindow && mainWindow.webContents && !mainWindow.isDestroyed()) {
      pushCounter++;
      const ts = new Date().toISOString();
      console.log(`[PUSH-#${pushCounter}] ${ts} Sending notification:new (id=${newNotification.id}, title="${notification.title}")`);
      mainWindow.webContents.send('notification:new', newNotification);
      mainWindow.webContents.send('notification:refresh');
      console.log(`[PUSH-#${pushCounter}] ${ts} Sending notification:refresh`);
    } else {
      console.log(`[IPC-DEBUG] ${new Date().toISOString()} MainWindow not ready, notification saved to DB only`);
    }
    
    return newNotification;
  }
  return null;
}

// Save crisis to database and notify renderer
function handleNewCrisis(crisis) {
  try {
    const createdAt = new Date().toISOString();
    const stmt = db.prepare('INSERT INTO crises (title, description, severity, created_at) VALUES (?, ?, ?, ?)');
    stmt.run([crisis.title, crisis.description, crisis.severity || 'high', createdAt]);
    stmt.free();
    
    const lastId = db.exec('SELECT last_insert_rowid()')[0].values[0][0];
    
    // Use parameterized query (defense in depth)
    const fetchStmt = db.prepare('SELECT * FROM crises WHERE id = ?');
    fetchStmt.bind([lastId]);
    const result = [];
    while (fetchStmt.step()) {
      result.push(fetchStmt.getAsObject());
    }
    fetchStmt.free();
    
    saveDatabase();
    
    if (result.length > 0) {
      const newCrisis = result[0];
      
      if (mainWindow && mainWindow.webContents && !mainWindow.isDestroyed()) {
        pushCounter++;
        const ts = new Date().toISOString();
        console.log(`[PUSH-#${pushCounter}] ${ts} Sending crisis:new (id=${newCrisis.id}, title="${crisis.title}")`);
        mainWindow.webContents.send('crisis:new', newCrisis);
        mainWindow.webContents.send('crisis:refresh');
        console.log(`[PUSH-#${pushCounter}] ${ts} Sending crisis:refresh`);
      }
      
      return newCrisis;
    }
  } catch (err) {
    console.error('Error saving crisis:', err);
  }
  return null;
}

// Save cycle spraying plot to database and notify renderer
function handleNewSprayingPlot(plot) {
  try {
    const createdAt = new Date().toISOString();
    const stmt = db.prepare('INSERT INTO cycle_spraying (field, plot, status, created_at) VALUES (?, ?, ?, ?)');
    stmt.run([plot.field, plot.plot || '', plot.status || 'pending', createdAt]);
    stmt.free();
    
    const lastId = db.exec('SELECT last_insert_rowid()')[0].values[0][0];
    
    const fetchStmt = db.prepare('SELECT * FROM cycle_spraying WHERE id = ?');
    fetchStmt.bind([lastId]);
    const result = [];
    while (fetchStmt.step()) {
      result.push(fetchStmt.getAsObject());
    }
    fetchStmt.free();
    
    saveDatabase();
    
    if (result.length > 0) {
      const newPlot = result[0];
      
      if (mainWindow && mainWindow.webContents && !mainWindow.isDestroyed()) {
        pushCounter++;
        const ts = new Date().toISOString();
        console.log(`[PUSH-#${pushCounter}] ${ts} Sending cycle-spraying:new (id=${newPlot.id}, field="${plot.field}", plot="${plot.plot}")`);
        mainWindow.webContents.send('cycle-spraying:new', newPlot);
        mainWindow.webContents.send('cycle-spraying:refresh');
        console.log(`[PUSH-#${pushCounter}] ${ts} Sending cycle-spraying:refresh`);
      }
      
      return newPlot;
    }
  } catch (err) {
    console.error('Error saving cycle spraying plot:', err);
  }
  return null;
}

// HTTP Server for Push Notifications
function startHttpServer() {
  const server = http.createServer((req, res) => {
    // CORS - needed for frontend to fetch from API (different port)
    const origin = req.headers.origin;
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
return;
    }

    const url = req.url.split('?')[0]; // Remove query params

    // GET /api/crises/:id - Get crisis by ID
    if (req.method === 'GET' && url.startsWith('/api/crises/')) {
      const idStr = url.split('/api/crises/')[1];
      const id = parseInt(idStr);
      
      // Validate ID is a positive integer
      if (isNaN(id) || id <= 0 || !Number.isInteger(id)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid ID' }));
        return;
      }
      
      try {
        const stmt = db.prepare('SELECT * FROM crises WHERE id = ?');
        stmt.bind([id]);
        const results = [];
        while (stmt.step()) {
          results.push(stmt.getAsObject());
        }
        stmt.free();
        
        if (results.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Crisis not found' }));
          return;
        }
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(results[0]));
      } catch (err) {
        console.error('Error fetching crisis:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to fetch crisis' }));
      }
      return;
    }

    // GET /api/notifications - Get all notifications
    if (req.method === 'GET' && url === '/api/notifications') {
      // Clean up expired notifications before returning
      cleanupExpiredNotifications();
      try {
        const results = db.exec('SELECT * FROM notifications ORDER BY created_at DESC');
        if (results.length === 0) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify([]));
          return;
        }
        
        const columns = results[0].columns;
        const notifications = results[0].values.map(row => {
          const obj = {};
          columns.forEach((col, i) => obj[col] = row[i]);
          return obj;
        });
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(notifications));
      } catch (err) {
        console.error('Error fetching notifications:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to fetch notifications' }));
      }
      return;
    }

    // GET /api/crises - Get all active crises
    if (req.method === 'GET' && url === '/api/crises') {
      try {
        const results = db.exec('SELECT * FROM crises WHERE status = \'active\' ORDER BY created_at DESC');
        if (results.length === 0) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify([]));
          return;
        }
        
        const columns = results[0].columns;
        const crises = results[0].values.map(row => {
          const obj = {};
          columns.forEach((col, i) => obj[col] = row[i]);
          return obj;
        });
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(crises));
      } catch (err) {
        console.error('Error fetching crises:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to fetch crises' }));
      }
      return;
    }

    // GET /api/notifications/:id - Get notification by ID
    if (req.method === 'GET' && url.startsWith('/api/notifications/')) {
      const idStr = url.split('/api/notifications/')[1];
      const id = parseInt(idStr);
      
      // Validate ID is a positive integer
      if (isNaN(id) || id <= 0 || !Number.isInteger(id)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid ID' }));
        return;
      }
      
      try {
        const stmt = db.prepare('SELECT * FROM notifications WHERE id = ?');
        stmt.bind([id]);
        const results = [];
        while (stmt.step()) {
          results.push(stmt.getAsObject());
        }
        stmt.free();
        
        if (results.length === 0) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Notification not found' }));
          return;
        }
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(results[0]));
      } catch (err) {
        console.error('Error fetching notification:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to fetch notification' }));
      }
      return;
    }
    
    // POST /api/notifications - Add new notification
    if (req.method === 'POST' && url === '/api/notifications') {
      // Check API key
      if (!isValidApiKey(req)) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
      }
      
      let body = '';
      
      req.on('data', chunk => {
        body += chunk.toString();
      });
      
      req.on('end', () => {
        try {
          const notification = JSON.parse(body);
          
          // Validate required fields
          if (!notification.title || !notification.message) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing title or message' }));
            return;
          }
          
          // Validate max length (prevent buffer overflow)
          if (notification.title.length > 200 || notification.message.length > 200) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Title or message too long (max 200 chars)' }));
            return;
          }
          
          const newNotification = handleNewNotification(notification);
          
          if (!newNotification) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to create notification' }));
            return;
          }
          
          const notificationId = newNotification.id;
          
          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            success: true, 
            id: notificationId,
            message: 'Notification created successfully'
          }));
          
          console.log(`[HTTP] ${new Date().toISOString()} POST /api/notifications - title="${notification.title}", message="${notification.message}"`);
          
        } catch (err) {
          console.error('Error creating notification:', err);
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON' }));
        }
      });
      return;
    }

    // POST /api/crises - Add new crisis
    if (req.method === 'POST' && url === '/api/crises') {
      // Check API key
      if (!isValidApiKey(req)) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
      }
      
      let body = '';
      
      req.on('data', chunk => {
        body += chunk.toString();
      });
      
      req.on('end', () => {
        try {
          const crisis = JSON.parse(body);
          
          if (!crisis.title || !crisis.description) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing title or description' }));
            return;
          }
          
          // Validate max length (prevent buffer overflow)
          if (crisis.title.length > 200 || crisis.description.length > 200) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Title or description too long (max 200 chars)' }));
            return;
          }
          
          const newCrisis = handleNewCrisis(crisis);
          
          if (!newCrisis) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to create crisis' }));
            return;
          }
          
          const crisisId = newCrisis.id;
          
          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            success: true, 
            id: crisisId,
            message: 'Crisis created successfully'
          }));
          
          console.log(`[HTTP] ${new Date().toISOString()} POST /api/crises - title="${crisis.title}", description="${crisis.description}"`);
          
        } catch (err) {
          console.log('Error creating crisis:', err);
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON' }));
        }
      });
return;
    }
    
    // DELETE /api/crises/:id - Delete specific crisis
    if (req.method === 'DELETE' && url.startsWith('/api/crises/')) {
      // Check API key
      if (!isValidApiKey(req)) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
      }
      
      const idStr = url.split('/api/crises/')[1];
      
      // Skip if it's "all" - handle that separately below
      if (idStr === 'all') {
        // Let it pass through to next handler
      } else {
        const id = parseInt(idStr);
        
        if (isNaN(id) || id <= 0 || !Number.isInteger(id)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid ID' }));
          return;
        }
        
        try {
          // Check if crisis exists
          const checkStmt = db.prepare('SELECT id FROM crises WHERE id = ?');
          checkStmt.bind([id]);
          const exists = checkStmt.step();
          checkStmt.free();
          
          if (!exists) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Crisis not found' }));
            return;
          }
          
          db.run('DELETE FROM crises WHERE id = ?', [id]);
          saveDatabase();
          
          if (mainWindow && mainWindow.webContents && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('crisis:refresh');
          }
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, message: `Crisis ${id} deleted` }));
        } catch (err) {
          console.error('Error deleting crisis:', err);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Failed to delete crisis' }));
        }
        return;
      }
    }
    
    // DELETE /api/crises/all - Clear all crises
    if (req.method === 'DELETE' && url === '/api/crises/all') {
      // Check API key
      if (!isValidApiKey(req)) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
      }
      
      try {
        db.run('DELETE FROM crises');
        saveDatabase();
        
        if (mainWindow && mainWindow.webContents && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('crisis:refresh');
        }
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'All crises cleared' }));
      } catch (err) {
        console.error('Error clearing crises:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to clear crises' }));
      }
      return;
    }
    
    // DELETE /api/notifications/all - Clear all notifications
    if (req.method === 'DELETE' && url === '/api/notifications/all') {
      // Check API key
      if (!isValidApiKey(req)) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
      }
      
      try {
        db.run('DELETE FROM notifications');
        saveDatabase();
        
        // Notify renderer to refresh
        if (mainWindow && mainWindow.webContents && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('notification:refresh');
        }
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'All notifications cleared' }));
      } catch (err) {
        console.error('Error clearing notifications:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to clear notifications' }));
      }
      return;
    }
    
    // DELETE /api/notifications/:id - Delete specific notification
    if (req.method === 'DELETE' && url.startsWith('/api/notifications/')) {
      // Check API key
      if (!isValidApiKey(req)) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
      }
      
      const idStr = url.split('/api/notifications/')[1];
      const id = parseInt(idStr);
      
      // Validate ID is a positive integer
      if (isNaN(id) || id <= 0 || !Number.isInteger(id)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid ID' }));
        return;
      }
      
      // Check if notification exists (using prepared statement)
      try {
        const checkStmt = db.prepare('SELECT id FROM notifications WHERE id = ?');
        checkStmt.bind([id]);
        const exists = checkStmt.step();
        checkStmt.free();
        
        if (!exists) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Notification not found' }));
          return;
        }
        
        // Delete and save
        db.run('DELETE FROM notifications WHERE id = ?', [id]);
        const changes = db.getRowsModified();
        
        if (changes > 0) {
          saveDatabase();
          
          // Notify renderer to refresh
          if (mainWindow && mainWindow.webContents && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('notification:refresh');
          }
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, message: `Notification ${id} deleted` }));
        } else {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Failed to delete notification' }));
        }
      } catch (err) {
        console.error('Error deleting notification:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to delete notification' }));
      }
      return;
    }
    
    // GET /api/cycle-spraying - Get all cycle spraying plots
    if (req.method === 'GET' && url === '/api/cycle-spraying') {
      try {
        const results = db.exec('SELECT * FROM cycle_spraying ORDER BY field ASC, plot ASC');
        if (results.length === 0) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify([]));
          return;
        }
        
        const columns = results[0].columns;
        const plots = results[0].values.map(row => {
          const obj = {};
          columns.forEach((col, i) => obj[col] = row[i]);
          return obj;
        });
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(plots));
      } catch (err) {
        console.error('Error fetching cycle spraying plots:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to fetch cycle spraying plots' }));
      }
      return;
    }

    // POST /api/cycle-spraying - Add new cycle spraying plot
    if (req.method === 'POST' && url === '/api/cycle-spraying') {
      if (!isValidApiKey(req)) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
      }
      
      let body = '';
      
      req.on('data', chunk => {
        body += chunk.toString();
      });
      
      req.on('end', () => {
        try {
          const plot = JSON.parse(body);
          
          if (!plot.field) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing field' }));
            return;
          }
          
          if (plot.field.length > 200 || (plot.plot && plot.plot.length > 200)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Field or plot too long (max 200 chars)' }));
            return;
          }
          
          const newPlot = handleNewSprayingPlot(plot);
          
          if (!newPlot) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to create cycle spraying plot' }));
            return;
          }
          
          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            success: true, 
            id: newPlot.id,
            message: 'Cycle spraying plot created successfully'
          }));
          
          console.log(`[HTTP] ${new Date().toISOString()} POST /api/cycle-spraying - field="${plot.field}", plot="${plot.plot}"`);
          
        } catch (err) {
          console.error('Error creating cycle spraying plot:', err);
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON' }));
        }
      });
      return;
    }

    // DELETE /api/cycle-spraying/all - Clear all cycle spraying plots
    if (req.method === 'DELETE' && url === '/api/cycle-spraying/all') {
      if (!isValidApiKey(req)) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
      }
      
      try {
        db.run('DELETE FROM cycle_spraying');
        saveDatabase();
        
        if (mainWindow && mainWindow.webContents && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('cycle-spraying:refresh');
        }
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'All cycle spraying plots cleared' }));
      } catch (err) {
        console.error('Error clearing cycle spraying plots:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to clear cycle spraying plots' }));
      }
      return;
    }

    // DELETE /api/cycle-spraying/:id - Delete specific cycle spraying plot
    if (req.method === 'DELETE' && url.startsWith('/api/cycle-spraying/')) {
      if (!isValidApiKey(req)) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
      }
      
      const idStr = url.split('/api/cycle-spraying/')[1];
      const id = parseInt(idStr);
      
      if (isNaN(id) || id <= 0 || !Number.isInteger(id)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid ID' }));
        return;
      }
      
      try {
        const checkStmt = db.prepare('SELECT id FROM cycle_spraying WHERE id = ?');
        checkStmt.bind([id]);
        const exists = checkStmt.step();
        checkStmt.free();
        
        if (!exists) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Cycle spraying plot not found' }));
          return;
        }
        
        db.run('DELETE FROM cycle_spraying WHERE id = ?', [id]);
        const changes = db.getRowsModified();
        
        if (changes > 0) {
          saveDatabase();
          
          if (mainWindow && mainWindow.webContents && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('cycle-spraying:refresh');
          }
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, message: `Cycle spraying plot ${id} deleted` }));
        } else {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Failed to delete cycle spraying plot' }));
        }
      } catch (err) {
        console.error('Error deleting cycle spraying plot:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to delete cycle spraying plot' }));
      }
      return;
    }

    // 404 for unknown routes
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });
  
  server.listen(HTTP_PORT, '0.0.0.0', () => {
    console.log(`HTTP Server running on http://0.0.0.0:${HTTP_PORT}`);
    console.log(`POST notification to: http://YOUR_IP:${HTTP_PORT}/api/notifications`);
  });
  
  server.on('error', (err) => {
    console.error('HTTP Server error:', err);
  });
}

function setupIPC() {
  ipcMain.handle('db:getNotifications', () => {
    const ts = new Date().toISOString();
    console.log(`[IPC-HANDLER] ${ts} Renderer called db:getNotifications`);
    cleanupExpiredNotifications();
    const results = db.exec('SELECT * FROM notifications ORDER BY created_at DESC');
    if (results.length === 0) return [];
    
    const columns = results[0].columns;
    return results[0].values.map(row => {
      const obj = {};
      columns.forEach((col, i) => obj[col] = row[i]);
      return obj;
    });
  });
  
  ipcMain.handle('db:getCrises', () => {
    const ts = new Date().toISOString();
    console.log(`[IPC-HANDLER] ${ts} Renderer called db:getCrises`);
    const results = db.exec('SELECT * FROM crises WHERE status = \'active\' ORDER BY created_at DESC');
    if (results.length === 0) return [];
    
    const columns = results[0].columns;
    return results[0].values.map(row => {
      const obj = {};
      columns.forEach((col, i) => obj[col] = row[i]);
      return obj;
    });
  });

  ipcMain.handle('db:getCrisisById', (event, id) => {
    const stmt = db.prepare('SELECT * FROM crises WHERE id = ?');
    stmt.bind([id]);
    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results.length > 0 ? results[0] : null;
  });

  ipcMain.handle('db:addNotification', (event, notification) => {
    return handleNewNotification(notification);
  });

  ipcMain.handle('db:addCrisis', (event, crisis) => {
    return handleNewCrisis(crisis);
  });
  
  ipcMain.handle('db:deleteNotification', (event, id) => {
    db.run(`DELETE FROM notifications WHERE id = ?`, [id]);
    saveDatabase();
  });

  ipcMain.handle('db:deleteCrisis', (event, id) => {
    db.run('DELETE FROM crises WHERE id = ?', [id]);
    saveDatabase();
    if (mainWindow && mainWindow.webContents && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('crisis:refresh');
    }
  });

  ipcMain.handle('db:clearAllCrises', () => {
    db.run('DELETE FROM crises');
    saveDatabase();
  });

  ipcMain.handle('db:clearAll', () => {
    db.run('DELETE FROM notifications');
    saveDatabase();
  });

  ipcMain.handle('db:getCycleSpraying', () => {
    const ts = new Date().toISOString();
    console.log(`[IPC-HANDLER] ${ts} Renderer called db:getCycleSpraying`);
    const results = db.exec('SELECT * FROM cycle_spraying ORDER BY field ASC, plot ASC');
    if (results.length === 0) return [];
    
    const columns = results[0].columns;
    return results[0].values.map(row => {
      const obj = {};
      columns.forEach((col, i) => obj[col] = row[i]);
      return obj;
    });
  });

  ipcMain.handle('db:addSprayingPlot', (event, plot) => {
    return handleNewSprayingPlot(plot);
  });

  ipcMain.handle('db:deleteSprayingPlot', (event, id) => {
    db.run('DELETE FROM cycle_spraying WHERE id = ?', [id]);
    saveDatabase();
    if (mainWindow && mainWindow.webContents && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('cycle-spraying:refresh');
    }
  });

  ipcMain.handle('db:clearAllSprayingPlots', () => {
    db.run('DELETE FROM cycle_spraying');
    saveDatabase();
    if (mainWindow && mainWindow.webContents && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('cycle-spraying:refresh');
    }
  });
  
  // Window controls
  ipcMain.handle('window:minimize', () => {
    if (mainWindow) mainWindow.minimize();
  });
  
  ipcMain.handle('window:maximize', () => {
    if (mainWindow) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    }
  });
  
  ipcMain.handle('window:close', () => {
    if (mainWindow) mainWindow.close();
  });
  
  ipcMain.handle('window:isMaximized', () => {
    return mainWindow ? mainWindow.isMaximized() : false;
  });
  
  ipcMain.handle('window:setFullscreen', (_, fullscreen) => {
    if (mainWindow) mainWindow.setFullScreen(fullscreen);
  });
  
  // Get server info
  ipcMain.handle('server:getInfo', () => {
    return {
      port: HTTP_PORT,
      ip: '0.0.0.0'
    };
  });

  // Read siren.mp3 audio file and return as base64 data URL
  // (Avoids file:// fetch restrictions in Chromium)
  ipcMain.handle('get-siren-audio', () => {
    const audioPath = path.join(__dirname, '..', 'out', 'siren.mp3');
    try {
      const data = fs.readFileSync(audioPath);
      const base64 = data.toString('base64');
      return `data:audio/mpeg;base64,${base64}`;
    } catch (err) {
      console.error('[AUDIO] Failed to read siren.mp3:', err);
      return null;
    }
  });

  // Fetch spraying plots from MongoDB (read-only)
  ipcMain.handle('mongo:getSprayingPlots', async () => {
    if (!mongoClient) {
      console.log('[MONGO] Not connected — returning empty');
      return [];
    }
    try {
      const db = mongoClient.db('office');

      // Fetch all plots for name lookup
      const plots = await db.collection('o_plots').find({}).toArray();
      const plotMap = {};
      for (const plot of plots) {
        plotMap[plot._id.toString()] = plot.name;
      }

      // Fetch all active schedules
      const schedules = await db.collection('o_schedules').find({ status: 'ACTIVE' }).toArray();

      // Fetch all active reports
      const reports = await db.collection('o_scheduleplotreports').find({ status: 'ACTIVE' }).toArray();

      // Build report map: scheduleId (as string) -> reports[]
      const reportMap = {};
      for (const report of reports) {
        const sid = report.scheduleId.toString();
        if (!reportMap[sid]) reportMap[sid] = [];
        reportMap[sid].push(report);
      }

      const now = new Date();
      const results = [];

      for (const schedule of schedules) {
        const sid = schedule._id.toString();
        const scheduleReports = reportMap[sid] || [];

        // Check if there's a report with percentageComplete = 100 (completed — skip)
        const hasComplete = scheduleReports.some(r =>
          r.percentageComplete && r.percentageComplete.toString() === '100'
        );
        if (hasComplete) continue;

        // Check if there's a report with percentageComplete !== 100 → pending (yellow)
        const hasIncomplete = scheduleReports.some(r =>
          r.percentageComplete && r.percentageComplete.toString() !== '100'
        );
        if (hasIncomplete) {
          results.push({
            id: sid,
            field: plotMap[schedule.plotId.toString()] || schedule.plotId.toString(),
            plot: '',
            status: 'pending',
            created_at: schedule.scheduledate,
          });
          continue;
        }

        // No report — check scheduled date
        if (!schedule.scheduledate) continue;
        const scheduledDate = new Date(schedule.scheduledate);
        const diffDays = Math.floor((now - scheduledDate) / (1000 * 60 * 60 * 24));

        if (diffDays <= 0) continue; // Not yet due — skip

        if (diffDays === 1) {
          // 1 day late → pending (yellow)
          results.push({
            id: sid,
            field: plotMap[schedule.plotId.toString()] || schedule.plotId.toString(),
            plot: '',
            status: 'pending',
            created_at: schedule.scheduledate,
          });
        } else if (diffDays >= 2) {
          // 2+ days late → overdue (red)
          results.push({
            id: sid,
            field: plotMap[schedule.plotId.toString()] || schedule.plotId.toString(),
            plot: '',
            status: 'overdue',
            created_at: schedule.scheduledate,
          });
        }
      }

      return results;
    } catch (err) {
      console.error('[MONGO] getSprayingPlots failed:', err.message);
      return [];
    }
  });
}

app.whenReady().then(async () => {
  await initDatabase();

  // Connect to MongoDB early so it's ready before the window loads
  mongoClient = await connectMongo();
  startMongoHealthCheck();

  setupIPC();
  startHttpServer();
  createWindow();

  // Log API key source (don't log the actual key for security)
  const keySource = process.env.API_KEY ? '.env file / system env' : 'default (AGS-DASHBOARD-2026)';
  console.log(`[STARTUP] ${new Date().toISOString()} API key source: ${keySource}`);
  console.log(`[STARTUP] ${new Date().toISOString()} dbPath: ${dbPath}`);
  console.log(`[STARTUP] ${new Date().toISOString()} isDevMode: ${isDevMode}`);

  // Run notification cleanup every 5 minutes
  setInterval(cleanupExpiredNotifications, 5 * 60 * 1000);
  console.log('Notification auto-cleanup scheduled (every 5 min, expires after 1 hour)');

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  saveDatabase();
  // Close MongoDB connection
  if (mongoClient) {
    mongoClient.close().catch(() => {});
    mongoClient = null;
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
