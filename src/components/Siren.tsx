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
 * Sound: Quick bright ping, 300ms, sine wave with fade-out.
 */
export function playTing(): void {
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    // Quick bright ping: A5 -> A6 sweep
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.1);
    osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.25);

    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.35);
  } catch (err) {
    console.log('[AUDIO] Ting play failed:', err);
  }
}

/**
 * Play siren sound for crisis alerts.
 * Uses siren.mp3 from the public folder.
 */
export function playSiren(): void {
  try {
    const audio = new Audio(`/siren.mp3?t=${Date.now()}`);
    audio.currentTime = 0;
    audio.volume = 0.6;
    audio.play().catch(err => {
      console.log('[AUDIO] Siren play failed:', err);
    });
  } catch (err) {
    console.log('[AUDIO] Siren error:', err);
  }
}
