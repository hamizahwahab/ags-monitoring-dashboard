/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

/// <reference path="../types/electron.d.ts" />

import { useState, useEffect, useRef } from 'react';
import NotificationPanel from '@/components/NotificationPanel';
import CrisisPanel from '@/components/CrisisPanel';
import CycleSprayingPanel from '@/components/CycleSprayingPanel';
import { playSiren, playTing } from '@/components/Siren';
import { API_URL, CRISIS_API_URL, API_CONFIG } from '@/config/api';
import { Notification, Crisis } from '@/types';

export default function Home() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [crises, setCrises] = useState<Crisis[]>([]);
  const [isMaximized, setIsMaximized] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // Track latest IDs for polling-based sound detection
  const latestNotifIdRef = useRef<number>(-1);
  const latestCrisisIdRef = useRef<number>(-1);

  // Fetch initial notifications (IPC first, HTTP fallback)
  const fetchNotifications = async () => {
    try {
      const ts = new Date().toISOString();
      if (typeof window !== 'undefined' && window.electronAPI) {
        console.log(`[RENDERER-IPC] ${ts} Fetching notifications via IPC...`);
        const data = await window.electronAPI.getNotifications();
        const items = data || [];
        // Check if there are new items (for polling sound)
        if (items.length > 0) {
          const maxId = Math.max(...items.map((n: Notification) => n.id));
          if (maxId > latestNotifIdRef.current && latestNotifIdRef.current !== -1) {
            playTing();
          }
          latestNotifIdRef.current = maxId;
        }
        setNotifications(items);
        console.log(`[RENDERER-IPC] ${ts} Fetched ${items.length} notifications`);
      } else {
        console.log(`[RENDERER-IPC] ${ts} electronAPI unavailable, falling back to HTTP...`);
        const response = await fetch(API_URL, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });
        if (!response.ok) return;
        const data = await response.json();
        const items = Array.isArray(data) ? data : [];
        // Check if there are new items (for polling sound)
        if (items.length > 0) {
          const maxId = Math.max(...items.map((n: Notification) => n.id));
          if (maxId > latestNotifIdRef.current && latestNotifIdRef.current !== -1) {
            playTing();
          }
          latestNotifIdRef.current = maxId;
        }
        setNotifications(items);
        console.log(`[RENDERER-IPC] ${ts} HTTP fallback: fetched ${items.length} notifications`);
      }
    } catch (err) {
      console.log(`[RENDERER] ${new Date().toISOString()} Fetch notifications error:`, err);
    }
  };

  // Fetch initial crises (IPC first, HTTP fallback)
  const fetchCrises = async () => {
    try {
      const ts = new Date().toISOString();
      if (typeof window !== 'undefined' && window.electronAPI) {
        console.log(`[RENDERER-IPC] ${ts} Fetching crises via IPC...`);
        const data = await window.electronAPI.getCrises();
        const items = data || [];
        // Check if there are new items (for polling sound)
        if (items.length > 0) {
          const maxId = Math.max(...items.map((c: Crisis) => c.id));
          if (maxId > latestCrisisIdRef.current && latestCrisisIdRef.current !== -1) {
            playSiren();
          }
          latestCrisisIdRef.current = maxId;
        }
        setCrises(items);
        console.log(`[RENDERER-IPC] ${ts} Fetched ${items.length} crises`);
      } else {
        console.log(`[RENDERER-IPC] ${ts} electronAPI unavailable, falling back to HTTP...`);
        const response = await fetch(CRISIS_API_URL, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });
        if (!response.ok) return;
        const data = await response.json();
        const items = Array.isArray(data) ? data : [];
        // Check if there are new items (for polling sound)
        if (items.length > 0) {
          const maxId = Math.max(...items.map((c: Crisis) => c.id));
          if (maxId > latestCrisisIdRef.current && latestCrisisIdRef.current !== -1) {
            playSiren();
          }
          latestCrisisIdRef.current = maxId;
        }
        setCrises(items);
        console.log(`[RENDERER-IPC] ${ts} HTTP fallback: fetched ${items.length} crises`);
      }
    } catch (err) {
      console.log(`[RENDERER] ${new Date().toISOString()} Fetch crises error:`, err);
    }
  };

  // Delete a crisis
  const onResolveCrisis = async (id: number) => {
    try {
      if (window.electronAPI) {
        await (window.electronAPI as any).deleteCrisis(id);
        // Remove from local state
        setCrises(prev => prev.filter(c => c.id !== id));
      }
    } catch (err) {
      console.log('Resolving crisis:', err);
    }
  };

  // Window control handlers
  const handleMinimize = () => { if (window.electronAPI) window.electronAPI.minimizeWindow(); };
  const handleMaximize = async () => {
    if (window.electronAPI) {
      await window.electronAPI.maximizeWindow();
      const max = await window.electronAPI.isMaximized();
      setIsMaximized(max);
    }
  };
  const handleClose = () => { if (window.electronAPI) window.electronAPI.closeWindow(); };
  const handleFullscreen = () => {
    if (window.electronAPI) window.electronAPI.setFullscreen(!isFullscreen);
  };

useEffect(() => {
    // Initial fetch
    fetchNotifications();
    fetchCrises();
    
    // Check window state for header maximize button
    if (window.electronAPI) {
      window.electronAPI.isMaximized().then(setIsMaximized);
      window.electronAPI.onFullscreenChange(setIsFullscreen);
    }
    
    // Set up polling if configured (fallback in case IPC push fails)
    let pollInterval: NodeJS.Timeout | null = null;
    if (API_CONFIG.POLL_INTERVAL > 0) {
      pollInterval = setInterval(() => {
        const ts = new Date().toISOString();
        console.log(`[RENDERER-POLL] ${ts} Poll interval fired (${API_CONFIG.POLL_INTERVAL}ms) — fetching...`);
        fetchNotifications();
        fetchCrises();
      }, API_CONFIG.POLL_INTERVAL);
    }
    
    // Listen for IPC push notifications
    if (typeof window !== 'undefined' && window.electronAPI) {
      window.electronAPI.onNewNotification((notification: Notification) => {
        const ts = new Date().toISOString();
        console.log(`[RENDERER-IPC] ${ts} Received notification:new (id=${notification.id}, title="${notification.title}")`);
        setNotifications(prev => {
          if (prev.some(n => n.id === notification.id)) {
            console.log(`[RENDERER-IPC] ${ts} Duplicate notification (id=${notification.id}), skipping`);
            return prev;
          }
          // Update latest ID ref so polling doesn't replay sound
          if (notification.id > latestNotifIdRef.current) {
            latestNotifIdRef.current = notification.id;
          }
          playTing();
          return [notification, ...prev];
        });
      });
      
      window.electronAPI.onRefreshNotifications(() => {
        const ts = new Date().toISOString();
        console.log(`[RENDERER-IPC] ${ts} Received notification:refresh — fetching...`);
        fetchNotifications();
      });

      // Listen for IPC push crises
      (window.electronAPI as any).onNewCrisis((crisis: Crisis) => {
        const ts = new Date().toISOString();
        console.log(`[RENDERER-IPC] ${ts} Received crisis:new (id=${crisis.id}, title="${crisis.title}")`);
        setCrises(prev => {
          if (prev.some(c => c.id === crisis.id)) {
            console.log(`[RENDERER-IPC] ${ts} Duplicate crisis (id=${crisis.id}), skipping`);
            return prev;
          }
          // Update latest ID ref so polling doesn't replay sound
          if (crisis.id > latestCrisisIdRef.current) {
            latestCrisisIdRef.current = crisis.id;
          }
          playSiren();
          return [crisis, ...prev];
        });
      });
      
      (window.electronAPI as any).onRefreshCrises(() => {
        const ts = new Date().toISOString();
        console.log(`[RENDERER-IPC] ${ts} Received crisis:refresh — fetching...`);
        fetchCrises();
      });
    }
    
    // Cleanup on unmount
    return () => {
      if (pollInterval) {
        clearInterval(pollInterval);
      }
      if (typeof window !== 'undefined' && window.electronAPI) {
        window.electronAPI.removeNewNotificationListener();
        (window.electronAPI as any).removeNewCrisisListener();
        window.electronAPI.removeFullscreenChangeListener();
      }
    };

  }, []);

  return (
    <main className="flex flex-col h-screen bg-[var(--tv-bg)] text-white overflow-hidden select-none">
      
      {/* DRAGGABLE HEADER BAR — hidden when in fullscreen mode */}
      {!isFullscreen && (
        <header className="flex items-center h-9 bg-[var(--tv-panel)] border-b border-white/5 shrink-0"
                style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
          
          {/* Title */}
          <div className="flex items-center gap-2 px-4">
            <span className="w-2 h-2 rounded-full bg-[var(--critical-border)]"></span>
            <span className="text-sm font-semibold text-[var(--tv-text)] tracking-wide">Dashboard 1</span>
          </div>
          
          {/* Spacer */}
          <div className="flex-1"></div>
          
          {/* Window Controls */}
          <div className="flex h-full" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            {/* Minimize */}
            <button onClick={handleMinimize}
                    className="flex items-center justify-center w-11 h-full text-[var(--tv-text-muted)] hover:text-white hover:bg-white/10 transition-colors"
                    title="Minimize">
              <svg width="12" height="12" viewBox="0 0 12 12">
                <rect x="1" y="5.5" width="10" height="1" fill="currentColor"/>
              </svg>
            </button>
            
            {/* Maximize / Restore */}
            <button onClick={handleMaximize}
                    className="flex items-center justify-center w-11 h-full text-[var(--tv-text-muted)] hover:text-white hover:bg-white/10 transition-colors"
                    title={isMaximized ? 'Restore' : 'Maximize'}>
              {isMaximized ? (
                <svg width="12" height="12" viewBox="0 0 12 12">
                  <rect x="2" y="0.5" width="9" height="9" rx="0.5" fill="none" stroke="currentColor" strokeWidth="1"/>
                  <rect x="0.5" y="2" width="9" height="9" rx="0.5" fill="none" stroke="currentColor" strokeWidth="1"/>
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 12 12">
                  <rect x="1" y="1" width="10" height="10" rx="0.5" fill="none" stroke="currentColor" strokeWidth="1.2"/>
                </svg>
              )}
            </button>
            
            {/* Enter Fullscreen */}
            <button onClick={handleFullscreen}
                    className="flex items-center justify-center w-11 h-full text-[var(--tv-text-muted)] hover:text-white hover:bg-white/10 transition-colors"
                    title="Enter Fullscreen (F11)">
              <svg width="14" height="14" viewBox="0 0 16 16">
                <polyline points="2,6 2,2 6,2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square"/>
                <polyline points="10,2 14,2 14,6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square"/>
                <polyline points="14,10 14,14 10,14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square"/>
                <polyline points="6,14 2,14 2,10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square"/>
                <line x1="2" y1="2" x2="6" y2="6" stroke="currentColor" strokeWidth="1.2"/>
                <line x1="10" y1="6" x2="14" y2="2" stroke="currentColor" strokeWidth="1.2"/>
                <line x1="14" y1="14" x2="10" y2="10" stroke="currentColor" strokeWidth="1.2"/>
                <line x1="6" y1="10" x2="2" y2="14" stroke="currentColor" strokeWidth="1.2"/>
              </svg>
            </button>
            
            {/* Close */}
            <button onClick={handleClose}
                    className="flex items-center justify-center w-11 h-full text-[var(--tv-text-muted)] hover:text-white hover:bg-red-500/80 transition-colors"
                    title="Close">
              <svg width="12" height="12" viewBox="0 0 12 12">
                <line x1="1" y1="1" x2="11" y2="11" stroke="currentColor" strokeWidth="1.2"/>
                <line x1="11" y1="1" x2="1" y2="11" stroke="currentColor" strokeWidth="1.2"/>
              </svg>
            </button>
          </div>
        </header>
      )}
      
      {/* FULLSCREEN HOVER STRIP — thin overlay when in fullscreen; hover to reveal exit button */}
      {isFullscreen && (
        <div className="fixed top-0 left-0 right-0 h-2 z-50 group cursor-default"
             style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <div className="flex items-center justify-end h-8 bg-[var(--tv-panel)]/90 backdrop-blur-sm border-b border-white/5 px-2">
              <button onClick={handleFullscreen}
                      className="flex items-center gap-1.5 px-3 h-full text-xs text-[var(--tv-text-muted)] hover:text-white transition-colors"
                      title="Exit Fullscreen (F11)">
                <svg width="12" height="12" viewBox="0 0 16 16">
                  <polyline points="2,6 2,2 6,2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square"/>
                  <polyline points="10,2 14,2 14,6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square"/>
                  <polyline points="14,10 14,14 10,14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square"/>
                  <polyline points="6,14 2,14 2,10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square"/>
                  <line x1="6" y1="6" x2="2" y2="2" stroke="currentColor" strokeWidth="1.2"/>
                  <line x1="14" y1="2" x2="10" y2="6" stroke="currentColor" strokeWidth="1.2"/>
                  <line x1="10" y1="10" x2="14" y2="14" stroke="currentColor" strokeWidth="1.2"/>
                  <line x1="2" y1="14" x2="6" y2="10" stroke="currentColor" strokeWidth="1.2"/>
                </svg>
                <span>Exit Fullscreen</span>
              </button>
            </div>
          </div>
        </div>
      )}
      
      <div className="flex flex-1 overflow-hidden">
        {/* CRISIS SIDEBAR (Left) - hidden when no crises */}
        {crises.length > 0 && (
          <aside className="w-[25%] flex flex-col bg-tv-panel border-r border-white/3 shadow-[10px_0_30px_rgba(0,0,0,0.5)]">
            <CrisisPanel crises={crises} onResolveCrisis={onResolveCrisis} />
          </aside>
        )}
        
        {/* MAIN CONTENT - Cycle Spraying */}
        <div className={crises.length > 0 ? 'w-[50%]' : 'w-[75%]'}>
          <CycleSprayingPanel />
        </div>
        
        {/* NOTIFICATION SIDEBAR (Right 25%) */}
        <aside className="w-[25%] flex flex-col bg-tv-panel border-l border-white/3 shadow-[-10px_0_30px_rgba(0,0,0,0.5)]">
          <NotificationPanel notifications={notifications} />
        </aside>
      </div>
    </main>
  );
}