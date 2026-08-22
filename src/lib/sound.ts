'use client';

/**
 * Shared UI sound utility — one AudioContext singleton + oscillator helper,
 * replacing what used to be independently duplicated in useGoalCelebration.ts
 * and useWorkoutTimers.ts. Only add sounds here that are genuinely reused
 * across features; a component's own bespoke countdown beep (e.g.
 * useWorkoutTimers.ts's rest-timer beeps) can stay local if nothing else
 * needs it.
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx || audioCtx.state === 'closed') {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return null;
    audioCtx = new AC();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

/** Short sine-wave blip — used for oscillator-based tones below. */
function playTone(frequency: number, durationMs: number, volume = 0.5): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = frequency;
    osc.type = 'sine';
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationMs / 1000);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + durationMs / 1000);
  } catch {
    /* ignore */
  }
}

/**
 * Short, high-pitched picker-wheel "tick" — for scrolling/ticking through
 * discrete values (rep counter, time picker). Deliberately quiet and brief
 * so it doesn't become fatiguing during a fast scroll.
 */
export function playTick(): void {
  playTone(1000, 15, 0.2);
}

/**
 * Apple-style ascending C6→E6→G6 major-triad success chime. Total duration
 * ≈ 1s. Moved here from useGoalCelebration.ts (previously duplicated with a
 * near-identical AudioContext in useWorkoutTimers.ts) so every "success"
 * moment in the app reuses the same asset.
 */
export function playSuccessChime(): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.32, now);
  master.gain.setValueAtTime(0.32, now + 0.85);
  master.gain.exponentialRampToValueAtTime(0.001, now + 1.0);
  master.connect(ctx.destination);

  const spawnNote = (freq: number, startOffset: number, peakGain: number, decayEnd: number) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now + startOffset);
    gain.gain.setValueAtTime(0, now + startOffset);
    gain.gain.linearRampToValueAtTime(peakGain, now + startOffset + 0.025); // 25ms attack
    gain.gain.exponentialRampToValueAtTime(0.001, now + decayEnd); // smooth decay
    osc.connect(gain);
    gain.connect(master);
    osc.start(now + startOffset);
    osc.stop(now + decayEnd + 0.02);
  };

  spawnNote(1046.5, 0, 0.55, 0.65); // C6 — root
  spawnNote(1318.51, 0.09, 0.45, 0.78); // E6 — major third
  spawnNote(1567.98, 0.17, 0.3, 0.92); // G6 — fifth (softest)
}
