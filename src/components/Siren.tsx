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
 * Fetches siren.mp3 and plays it through Web Audio API.
 * (Avoids <audio> element issues on file:// protocol.)
 */
export function playSiren(): void {
  try {
    const ctx = getAudioContext();
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
  } catch (err) {
    console.log('[AUDIO] Siren error:', err);
  }
}
