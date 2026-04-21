'use client';

import { useEffect, useRef } from 'react';

let sirenAudio: HTMLAudioElement | null = null;

export const playSiren = () => {
  try {
    // Audio should already be preloaded
    if (sirenAudio) {
      sirenAudio.currentTime = 0;
      sirenAudio.play();
    }
  } catch (err) {
    console.log('Audio play failed:', err);
  }
};

export default function Siren() {
  // Preload audio on mount
  useEffect(() => {
    // Preload the audio file
    sirenAudio = new Audio('/siren.mp3');
    sirenAudio.load();
  }, []);

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.onNewNotification(() => {
        playSiren();
      });
    }
  }, []);

  return null;
}