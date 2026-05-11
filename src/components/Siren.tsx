'use client';

import { useEffect } from 'react';

// Generate unique audio URL to bypass cache
const getSirenUrl = () => `/siren.mp3?t=${Date.now()}`;

export default function Siren() {
  useEffect(() => {
    // Preload audio when component mounts with cache bypass
    const audio = new Audio(getSirenUrl());
    audio.preload = 'auto';
    
    // Load the audio
    audio.load();
    
    // Listen for new notifications and play siren
    if (window.electronAPI) {
      window.electronAPI.onNewNotification(() => {
        audio.currentTime = 0;
        audio.play().catch(err => {
          console.log('Siren play failed:', err);
        });
      });
      
      // Also play siren for new crises
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window.electronAPI as any).onNewCrisis(() => {
        audio.currentTime = 0;
        audio.play().catch(err => {
          console.log('Siren play failed:', err);
        });
      });
    }
  }, []);

  return null;
}

// Export playSiren function for manual triggering
export function playSiren() {
  const audio = new Audio(getSirenUrl());
  audio.currentTime = 0;
  audio.play().catch(err => {
    console.log('Siren play failed:', err);
  });
}