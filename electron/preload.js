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
});