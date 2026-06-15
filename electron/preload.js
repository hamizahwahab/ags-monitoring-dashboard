const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getNotifications: () => ipcRenderer.invoke('db:getNotifications'),
  addNotification: (notification) => ipcRenderer.invoke('db:addNotification', notification),
  deleteNotification: (id) => ipcRenderer.invoke('db:deleteNotification', id),
  clearAllNotifications: () => ipcRenderer.invoke('db:clearAll'),
  onNewNotification: (callback) => {
    ipcRenderer.on('notification:new', (event, notification) => callback(notification));
  },
  onRefreshNotifications: (callback) => {
    ipcRenderer.on('notification:refresh', () => callback());
  },
  removeNewNotificationListener: () => {
    ipcRenderer.removeAllListeners('notification:new');
    ipcRenderer.removeAllListeners('notification:refresh');
  },
  getCrises: () => ipcRenderer.invoke('db:getCrises'),
  getCrisisById: (id) => ipcRenderer.invoke('db:getCrisisById', id),
  addCrisis: (crisis) => ipcRenderer.invoke('db:addCrisis', crisis),
  deleteCrisis: (id) => ipcRenderer.invoke('db:deleteCrisis', id),
  clearAllCrises: () => ipcRenderer.invoke('db:clearAllCrises'),
  onNewCrisis: (callback) => {
    ipcRenderer.on('crisis:new', (event, crisis) => callback(crisis));
  },
  onRefreshCrises: (callback) => {
    ipcRenderer.on('crisis:refresh', () => callback());
  },
  removeNewCrisisListener: () => {
    ipcRenderer.removeAllListeners('crisis:new');
    ipcRenderer.removeAllListeners('crisis:refresh');
  },
  getCycleSpraying: () => ipcRenderer.invoke('db:getCycleSpraying'),
  addSprayingPlot: (plot) => ipcRenderer.invoke('db:addSprayingPlot', plot),
  deleteSprayingPlot: (id) => ipcRenderer.invoke('db:deleteSprayingPlot', id),
  clearAllSprayingPlots: () => ipcRenderer.invoke('db:clearAllSprayingPlots'),
  onNewSprayingPlot: (callback) => {
    ipcRenderer.on('cycle-spraying:new', (event, plot) => callback(plot));
  },
  onRefreshSprayingPlots: (callback) => {
    ipcRenderer.on('cycle-spraying:refresh', () => callback());
  },
  removeNewSprayingPlotListener: () => {
    ipcRenderer.removeAllListeners('cycle-spraying:new');
    ipcRenderer.removeAllListeners('cycle-spraying:refresh');
  },
  // Window controls
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window:maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  setFullscreen: (fullscreen) => ipcRenderer.invoke('window:setFullscreen', fullscreen),
  onFullscreenChange: (callback) => {
    ipcRenderer.on('window:fullscreenChanged', (_event, value) => callback(value));
  },
  removeFullscreenChangeListener: () => {
    ipcRenderer.removeAllListeners('window:fullscreenChanged');
  },
  // Audio — load siren.mp3 as base64 data URL (avoids file:// fetch restrictions)
  getSirenAudio: () => ipcRenderer.invoke('get-siren-audio'),
});