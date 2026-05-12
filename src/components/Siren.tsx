'use client';

// Generate unique audio URL to bypass cache
const getSirenUrl = () => `/siren.mp3?t=${Date.now()}`;

// Export playSiren function for manual triggering
export function playSiren() {
  const audio = new Audio(getSirenUrl());
  audio.currentTime = 0;
  audio.play().catch(err => {
    console.log('Siren play failed:', err);
  });
}