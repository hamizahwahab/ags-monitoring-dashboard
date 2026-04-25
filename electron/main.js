const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const initSqlJs = require('sql.js');

let mainWindow;
let db;
let dbPath;

// Check if running in dev mode (passed via command line)
const isDevMode = process.argv.includes('--dev');
const HTTP_PORT = 8001;
const API_KEY = process.env.API_KEY || 'ASG-DASHBOARD-2024'; // Use env var or default

// Helper to check API key
function isValidApiKey(req) {
  // Allow all requests in dev mode
  if (isDevMode) return true;
  
  const apiKey = req.headers['x-api-key'];
  return apiKey === API_KEY;
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    fullscreen: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
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

// Debounced save - save every 30 seconds instead of every write
let saveTimeout = null;
const SAVE_INTERVAL = 30000; // 30 seconds

function saveDatabaseDebounced() {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }
  saveTimeout = setTimeout(() => {
    console.log('Saving database (debounced)...');
    saveDatabase();
    saveTimeout = null;
  }, SAVE_INTERVAL);
}

// Save notification to database and notify renderer
function handleNewNotification(notification) {
  const createdAt = new Date().toISOString();
  const stmt = db.prepare('INSERT INTO notifications (title, message, priority, created_at) VALUES (?, ?, ?, ?)');
  stmt.run([notification.title, notification.message, notification.priority || 'critical', createdAt]);
  stmt.free();
  
  const lastId = db.exec('SELECT last_insert_rowid()')[0].values[0][0];
  const result = db.exec(`SELECT * FROM notifications WHERE id = ${lastId}`);
  
  saveDatabaseDebounced();
  
  if (result.length > 0) {
    const columns = result[0].columns;
    const newNotification = {};
    columns.forEach((col, i) => newNotification[col] = result[0].values[0][i]);
    
    if (mainWindow && mainWindow.webContents && !mainWindow.isDestroyed()) {
      mainWindow.webContents.once('did-finish-load', () => {
        mainWindow.webContents.send('notification:new', newNotification);
        mainWindow.webContents.send('notification:refresh');
      });
      mainWindow.webContents.send('notification:new', newNotification);
      mainWindow.webContents.send('notification:refresh');
    } else {
      console.log('MainWindow not ready, notification saved to DB only');
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
    const result = db.exec(`SELECT * FROM crises WHERE id = ${lastId}`);
    
    saveDatabaseDebounced();
    
    if (result.length > 0) {
      const columns = result[0].columns;
      const newCrisis = {};
      columns.forEach((col, i) => newCrisis[col] = result[0].values[0][i]);
      
      if (mainWindow && mainWindow.webContents && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('crisis:new', newCrisis);
        mainWindow.webContents.send('crisis:refresh');
      }
      
      return newCrisis;
    }
  } catch (err) {
    console.error('Error saving crisis:', err);
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
    
    // GET /api/notifications - Get all notifications
    if (req.method === 'GET' && url === '/api/notifications') {
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
          if (notification.title.length > 200 || notification.message.length > 1000) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Title or message too long' }));
            return;
          }
          
          const newNotification = handleNewNotification(notification);
          const notificationId = newNotification.id;
          
          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            success: true, 
            id: notificationId,
            message: 'Notification created successfully'
          }));
          
          console.log('New notification received:', notification.title);
          
        } catch (err) {
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
          
          const newCrisis = handleNewCrisis(crisis);
          const crisisId = newCrisis.id;
          
          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            success: true, 
            id: crisisId,
            message: 'Crisis created successfully'
          }));
          
          console.log('New crisis received:', crisis.title);
          
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON' }));
        }
      });
      return;
    }

        // DELETE /api/crises/:id - Resolve specific crisis
    if (req.method === 'DELETE' && url.startsWith('/api/crises/')) {
      // Check API key
      if (!isValidApiKey(req)) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
      }
      
      const idStr = url.split('/api/crises/')[1];
      const id = parseInt(idStr);
      
      if (isNaN(id) || id <= 0 || !Number.isInteger(id)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid ID' }));
        return;
      }
      
      try {
        db.run('UPDATE crises SET status = \'resolved\' WHERE id = ?', [id]);
        saveDatabase();
        
        if (mainWindow && mainWindow.webContents && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('crisis:refresh');
        }
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: `Crisis ${id} resolved` }));
      } catch (err) {
        console.error('Error resolving crisis:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to resolve crisis' }));
      }
      return;
    }

    // DELETE /api/notifications - Clear all notifications
    if (req.method === 'DELETE' && url === '/api/notifications') {
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
    const results = db.exec('SELECT * FROM crises WHERE status = \'active\' ORDER BY created_at DESC');
    if (results.length === 0) return [];
    
    const columns = results[0].columns;
    return results[0].values.map(row => {
      const obj = {};
      columns.forEach((col, i) => obj[col] = row[i]);
      return obj;
    });
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
    db.run(`UPDATE crises SET status = 'resolved' WHERE id = ?`, [id]);
    saveDatabase();
    if (mainWindow && mainWindow.webContents && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('crisis:refresh');
    }
  });

  ipcMain.handle('db:clearAll', () => {
    db.run('DELETE FROM notifications');
    saveDatabase();
  });
  
  // Get server info
  ipcMain.handle('server:getInfo', () => {
    return {
      port: HTTP_PORT,
      ip: '0.0.0.0'
    };
  });
}

app.whenReady().then(async () => {
  await initDatabase();
  setupIPC();
  startHttpServer();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // Save immediately on close (clear debounce timer first)
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }
  saveDatabase();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
