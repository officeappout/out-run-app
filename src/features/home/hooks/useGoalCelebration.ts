'use client';

import { useRef, useCallback } from 'react';

// ════════════════════════════════════════════════════════════════════
// SESSION KEY HELPERS — fire once per metric per calendar day
// ════════════════════════════════════════════════════════════════════

function getTodayKey(metric: string): string {
  const today = new Date().toISOString().split('T')[0];
  return `goal_celebrated_${metric}_${today}`;
}

function hasAlreadyCelebrated(metric: string): boolean {
  if (typeof window === 'undefined') return true;
  return sessionStorage.getItem(getTodayKey(metric)) === 'true';
}

function markCelebrated(metric: string): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(getTodayKey(metric), 'true');
}

// ════════════════════════════════════════════════════════════════════
// WEB AUDIO API — Apple-style ascending success chime
// ════════════════════════════════════════════════════════════════════

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return null;
    audioCtx = new AC();
  }
  return audioCtx;
}

/**
 * Synthesises a light, airy C-E-G major triad chime using sine
 * oscillators with quick attack and gentle exponential decay.
 * Total duration ≈ 1 s.  Zero dependencies.
 */
function playSuccessChime(): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  // Resume if suspended (browser autoplay policy)
  if (ctx.state === 'suspended') ctx.resume();

  const now = ctx.currentTime;

  // ── Master gain (overall volume — keep it subtle) ──
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.32, now);
  master.gain.setValueAtTime(0.32, now + 0.85);
  master.gain.exponentialRampToValueAtTime(0.001, now + 1.0);
  master.connect(ctx.destination);

  // Helper: spawn a sine note with quick attack + exponential decay
  const spawnNote = (freq: number, startOffset: number, peakGain: number, decayEnd: number) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now + startOffset);
    gain.gain.setValueAtTime(0, now + startOffset);
    gain.gain.linearRampToValueAtTime(peakGain, now + startOffset + 0.025);   // 25 ms attack
    gain.gain.exponentialRampToValueAtTime(0.001, now + decayEnd);             // smooth decay
    osc.connect(gain);
    gain.connect(master);
    osc.start(now + startOffset);
    osc.stop(now + decayEnd + 0.02);
  };

  // ── Three ascending notes — C6 → E6 → G6 (major triad) ──
  spawnNote(1046.50, 0,    0.55, 0.65);   // C6  — root
  spawnNote(1318.51, 0.09, 0.45, 0.78);   // E6  — major third
  spawnNote(1567.98, 0.17, 0.30, 0.92);   // G6  — fifth (softest)
}

// ════════════════════════════════════════════════════════════════════
// HAPTIC FEEDBACK — celebratory triple-pulse
// ════════════════════════════════════════════════════════════════════

function triggerCelebrationHaptic(): void {
  if (typeof window === 'undefined') return;
  if ('vibrate' in navigator) {
    navigator.vibrate([15, 40, 15, 40, 30]);
  }
}

// ════════════════════════════════════════════════════════════════════
// CONFETTI — dual-burst with brand colours
// ════════════════════════════════════════════════════════════════════

async function fireConfetti(): Promise<void> {
  try {
    const confetti = (await import('canvas-confetti')).default;

    // Primary burst
    confetti({
      particleCount: 60,
      spread: 55,
      origin: { y: 0.35 },
      colors: ['#00C9F2', '#5BC2F2', '#10B981', '#34D399', '#fbbf24', '#f472b6'],
      ticks: 120,
      gravity: 1.2,
      scalar: 0.9,
      drift: 0,
    });

    // Secondary sparkle burst — slight offset for depth
    setTimeout(() => {
      confetti({
        particleCount: 35,
        spread: 70,
        origin: { y: 0.35, x: 0.4 },
        colors: ['#00C9F2', '#10B981', '#fbbf24'],
        ticks: 100,
        gravity: 1.4,
        scalar: 0.7,
      });
    }, 150);
  } catch {
    // canvas-confetti unavailable — fail silently
  }
}

// ════════════════════════════════════════════════════════════════════
// HOOK — useGoalCelebration
// ════════════════════════════════════════════════════════════════════

export function useGoalCelebration() {
  /** In-memory guard so we never double-fire even within one render cycle */
  const firedRef = useRef<Set<string>>(new Set());

  /**
   * Trigger a 360° sensory reward (Sound + Haptic + Confetti).
   *
   * Fires **once per metric per calendar day** — safe to call on every render.
   *
   * @param metric   Unique key, e.g. `'steps'` or `'active_minutes'`
   * @param delayMs  Optional delay (ms) to sync with ring-fill animation
   */
  const celebrate = useCallback((metric: string, delayMs = 0) => {
    // Guard 1: already fired in this component lifecycle
    if (firedRef.current.has(metric)) return;
    // Guard 2: already fired today (survives navigation)
    if (hasAlreadyCelebrated(metric)) return;

    firedRef.current.add(metric);
    markCelebrated(metric);

    const fire = () => {
      playSuccessChime();
      triggerCelebrationHaptic();
      fireConfetti();
    };

    if (delayMs > 0) {
      setTimeout(fire, delayMs);
    } else {
      fire();
    }
  }, []);

  return { celebrate };
}
