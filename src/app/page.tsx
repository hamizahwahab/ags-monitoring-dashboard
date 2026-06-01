/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

/// <reference path="../types/electron.d.ts" />

import { useState, useEffect } from 'react';
import NotificationPanel from '@/components/NotificationPanel';
import CrisisPanel from '@/components/CrisisPanel';
import CycleSprayingPanel from '@/components/CycleSprayingPanel';
import { playSiren } from '@/components/Siren';
import { API_URL, CRISIS_API_URL, API_CONFIG } from '@/config/api';
import { Notification, Crisis } from '@/types';

export default function Home() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [crises, setCrises] = useState<Crisis[]>([]);

  // Fetch initial notifications (IPC first, HTTP fallback)
  const fetchNotifications = async () => {
    try {
      if (typeof window !== 'undefined' && window.electronAPI) {
        const data = await window.electronAPI.getNotifications();
        setNotifications(data || []);
      } else {
        const response = await fetch(API_URL, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });
        if (!response.ok) return;
        const data = await response.json();
        setNotifications(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.log('Fetching notifications:', err);
    }
  };

  // Fetch initial crises (IPC first, HTTP fallback)
  const fetchCrises = async () => {
    try {
      if (typeof window !== 'undefined' && window.electronAPI) {
        const data = await window.electronAPI.getCrises();
        setCrises(data || []);
      } else {
        const response = await fetch(CRISIS_API_URL, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });
        if (!response.ok) return;
        const data = await response.json();
        setCrises(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.log('Fetching crises:', err);
    }
  };

  // Resolve a crisis
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

useEffect(() => {
    // Initial fetch
    fetchNotifications();
    fetchCrises();
    
    // Set up polling if configured (fallback in case IPC push fails)
    let pollInterval: NodeJS.Timeout | null = null;
    if (API_CONFIG.POLL_INTERVAL > 0) {
      pollInterval = setInterval(() => {
        console.log('Polling for new notifications...');
        fetchNotifications();
        console.log('Polling for new crises...');
        fetchCrises();
      }, API_CONFIG.POLL_INTERVAL);
    }
    
    // Listen for IPC push notifications
    if (typeof window !== 'undefined' && window.electronAPI) {
      window.electronAPI.onNewNotification((notification: Notification) => {
        setNotifications(prev => {
          if (prev.some(n => n.id === notification.id)) {
            return prev;
          }
          playSiren();
          return [notification, ...prev];
        });
      });
      
      window.electronAPI.onRefreshNotifications(() => {
        fetchNotifications();
      });

      // Listen for IPC push crises
      (window.electronAPI as any).onNewCrisis((crisis: Crisis) => {
        setCrises(prev => {
          if (prev.some(c => c.id === crisis.id)) {
            return prev;
          }
          playSiren();
          return [crisis, ...prev];
        });
      });
      
      (window.electronAPI as any).onRefreshCrises(() => {
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
      }
    };

  }, []);

  return (
    <main className="flex flex-col h-screen bg-[var(--tv-bg)] text-white overflow-hidden select-none">
      
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