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
