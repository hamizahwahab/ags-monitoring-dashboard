/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

/// <reference path="../types/electron.d.ts" />

import { useState, useEffect, useRef } from 'react';
import NotificationPanel from '@/components/NotificationPanel';
import CrisisPanel from '@/components/CrisisPanel';
import Siren, { playSiren } from '@/components/Siren';
import { API_URL, CRISIS_API_URL, API_CONFIG } from '@/config/api';
import { Notification, Crisis } from '@/types';

export default function Home() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const lastFetchedIds = useRef<Set<number>>(new Set());
  const [crises, setCrises] = useState<Crisis[]>([]);
  const lastFetchedCrisisIds = useRef<Set<number>>(new Set());

  // Fetch initial notifications
  const fetchNotifications = async () => {
    try {
      const response = await fetch(API_URL, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) return;
      
      const data = await response.json();
      
      let newNotifications: Notification[] = [];
      
      if (Array.isArray(data)) {
        newNotifications = data;
      }
      
      // Update last fetched IDs
      newNotifications.forEach(n => lastFetchedIds.current.add(n.id));
      
      setNotifications(newNotifications);
      
    } catch (err) {
      console.log('Fetching notifications:', err);
    }
  };

  // Fetch initial crises
  const fetchCrises = async () => {
    try {
      const response = await fetch(CRISIS_API_URL, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) return;
      
      const data = await response.json();
      
      let newCrises: Crisis[] = [];
      
      if (Array.isArray(data)) {
        newCrises = data;
      }
      
      // Update last fetched IDs
      newCrises.forEach(c => lastFetchedCrisisIds.current.add(c.id));
      
      setCrises(newCrises);
      
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
    };

  }, []);

  return (
    <main className="flex flex-col h-screen bg-[#050505] text-white overflow-hidden select-none">
      <Siren />
      
      <div className="flex flex-1 overflow-hidden">
        {/* CRISIS SIDEBAR (Left 25%) */}
        <aside className="w-[25%] flex flex-col bg-[#0d0d0d] border-r border-white/3 shadow-[10px_0_30px_rgba(0,0,0,0.5)]">
          <CrisisPanel crises={crises} onResolveCrisis={onResolveCrisis} />
        </aside>
        
        {/* MAIN CONTENT (Center 50%) - Empty */}
        <div className="w-[50%] bg-[#0a0a0a]">
        </div>
        
        {/* NOTIFICATION SIDEBAR (Right 25%) */}
        <aside className="w-[25%] flex flex-col bg-[#0d0d0d] border-l border-white/3 shadow-[-10px_0_30px_rgba(0,0,0,0.5)]">
          <NotificationPanel notifications={notifications} />
        </aside>
      </div>
    </main>
  );
}