/// <reference types="next" />
/// <reference types="next/image-types/global" />

import type { Notification, Crisis, SprayingPlot } from './index';

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
  getCycleSpraying: () => Promise<SprayingPlot[]>;
  addSprayingPlot: (plot: { field: string; plot?: string; status?: 'overdue' | 'pending' }) => Promise<SprayingPlot>;
  deleteSprayingPlot: (id: number) => Promise<void>;
  clearAllSprayingPlots: () => Promise<void>;
  onNewSprayingPlot: (callback: (plot: SprayingPlot) => void) => void;
  onRefreshSprayingPlots: (callback: () => void) => void;
  removeNewSprayingPlotListener: () => void;
  // Window controls
  minimizeWindow: () => Promise<void>;
  maximizeWindow: () => Promise<void>;
  closeWindow: () => Promise<void>;
  isMaximized: () => Promise<boolean>;
  setFullscreen: (fullscreen: boolean) => Promise<void>;
  onFullscreenChange: (callback: (fullscreen: boolean) => void) => void;
  removeFullscreenChangeListener: () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};