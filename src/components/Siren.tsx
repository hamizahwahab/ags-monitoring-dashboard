'use client';

// Web Audio API context (lazy init) — works around autoplay restrictions
let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  // Resume if suspended (Chromium autoplay policy)
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

/**
 * Play a short "ting" notification sound.
 * Uses Web Audio API — no external file needed.
 * Sound: 1200Hz sine tone, 1.5s fade out.
 */
export function playTing(): void {
  try {
    const ctx = getAudioContext();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(1200, ctx.currentTime);

    gainNode.gain.setValueAtTime(1, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.5);

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 1.5);
  } catch (err) {
    console.log('[AUDIO] Ting play failed:', err);
  }
}

/**
 * Play siren sound for crisis alerts.
 * Loads siren.mp3 via IPC bridge (main process reads file) and plays through Web Audio API.
 * Falls back to fetch() if IPC unavailable (browser dev mode).
 */
export function playSiren(): void {
  try {
    const ctx = getAudioContext();

    // Helper: decode and play the audio buffer
    const playBuffer = (dataUrl: string) => {
      // Convert base64 data URL to ArrayBuffer
      const byteStr = atob(dataUrl.split(',')[1]);
      const buf = new ArrayBuffer(byteStr.length);
      const view = new Uint8Array(buf);
      for (let i = 0; i < byteStr.length; i++) {
        view[i] = byteStr.charCodeAt(i);
      }
      ctx.decodeAudioData(buf)
        .then(audioBuf => {
          const source = ctx.createBufferSource();
          source.buffer = audioBuf;
          const gain = ctx.createGain();
          gain.gain.setValueAtTime(0.5, ctx.currentTime);
          source.connect(gain);
          gain.connect(ctx.destination);
          source.start();
        })
        .catch(err => console.log('[AUDIO] Siren decode failed:', err));
    };

    // Try IPC first (Electron), fall back to fetch (browser dev mode)
    if (typeof window !== 'undefined' && (window as any).electronAPI?.getSirenAudio) {
      (window as any).electronAPI.getSirenAudio().then((dataUrl: string | null) => {
        if (dataUrl) {
          playBuffer(dataUrl);
        } else {
          console.log('[AUDIO] IPC returned null, trying fetch fallback...');
          fetchSirenFallback(ctx);
        }
      });
    } else {
      fetchSirenFallback(ctx);
    }
  } catch (err) {
    console.log('[AUDIO] Siren error:', err);
  }
}

/** Fallback: fetch siren.mp3 via HTTP (works in dev mode on localhost:3000) */
function fetchSirenFallback(ctx: AudioContext): void {
  fetch('/siren.mp3')
    .then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.arrayBuffer();
    })
    .then(buf => ctx.decodeAudioData(buf))
    .then(audioBuf => {
      const source = ctx.createBufferSource();
      source.buffer = audioBuf;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.5, ctx.currentTime);
      source.connect(gain);
      gain.connect(ctx.destination);
      source.start();
    })
    .catch(err => console.log('[AUDIO] Siren fetch/decode failed:', err));
}
