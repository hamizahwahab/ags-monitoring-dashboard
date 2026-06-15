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
 * Uses Web Audio API — no external file needed.
 * Sound: Two detuned sawtooth oscillators with frequency warble (police siren style).
 */
export function playSiren(): void {
  try {
    const ctx = getAudioContext();

    // Master gain
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.2, ctx.currentTime);
    masterGain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 2);
    masterGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 2.8);
    masterGain.connect(ctx.destination);

    // Create two detuned sawtooth oscillators for a rich siren effect
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc2.type = 'sawtooth';
    osc1.detune.setValueAtTime(-5, ctx.currentTime); // Slightly detuned
    osc2.detune.setValueAtTime(5, ctx.currentTime);

    // Frequency warble: sweep between 400Hz and 800Hz (like a police siren)
    const warbleDuration = 2.5; // Full cycle time
    const halfCycle = warbleDuration / 2;
    const startTime = ctx.currentTime;

    // 4 complete warbles over ~2 seconds
    for (let i = 0; i < 4; i++) {
      const t = startTime + i * halfCycle;
      osc1.frequency.setValueAtTime(400, t);
      osc1.frequency.linearRampToValueAtTime(800, t + halfCycle * 0.45);
      osc1.frequency.linearRampToValueAtTime(400, t + halfCycle);
    }
    osc2.frequency.setValueAtTime(600, startTime);
    osc2.frequency.linearRampToValueAtTime(1000, startTime + 0.3);

    // Connect: osc1 + osc2 -> masterGain -> destination
    osc1.connect(masterGain);
    osc2.connect(masterGain);

    osc1.start(startTime);
    osc2.start(startTime);
    osc1.stop(startTime + 2.5);
    osc2.stop(startTime + 2.5);
  } catch (err) {
    console.log('[AUDIO] Siren play failed:', err);
  }
}
