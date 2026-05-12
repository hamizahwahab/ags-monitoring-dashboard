/// <reference types="next" />
/// <reference types="next/image-types/global" />

import type { Notification, Crisis } from './index';

interface ElectronAPI {
  getNotifications: () => Promise<Notification[]>;
  addNotification: (notification: { title: string; message: string; priority: string }) => Promise<Notification>;
  deleteNotification: (id: number) => Promise<void>;
  clearAllNotifications: () => Promise<void>;
  onNewNotification: (callback: (notification: Notification) => void) => void;
  onRefreshNotifications: (callback: () => void) => void;
  removeNewNotificationListener: () => void;
  getCrises: () => Promise<Crisis[]>;
  addCrisis: (crisis: { title: string; description: string; severity?: 'high' | 'medium' | 'low' }) => Promise<Crisis>;
  deleteCrisis: (id: number) => Promise<void>;
  clearAllCrises: () => Promise<void>;
  getCrisisById: (id: number) => Promise<Crisis | null>;
  onNewCrisis: (callback: (crisis: Crisis) => void) => void;
  onRefreshCrises: (callback: () => void) => void;
  removeNewCrisisListener: () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};