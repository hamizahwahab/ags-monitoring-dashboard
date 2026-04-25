'use client';

import { useEffect } from 'react';

export default function Siren() {
  useEffect(() => {
    // Preload audio when component mounts
    const audio = new Audio('/siren.mp3');
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
    }
  }, []);

  return null;
}

// Export playSiren function for manual triggering
export function playSiren() {
  const audio = new Audio('/siren.mp3');
  audio.currentTime = 0;
  audio.play().catch(err => {
    console.log('Siren play failed:', err);
  });
}