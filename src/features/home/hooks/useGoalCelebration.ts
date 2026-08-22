'use client';

import { useRef, useCallback } from 'react';
import { playSuccessChime } from '@/lib/sound';
import { hapticSuccess } from '@/lib/haptics';

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
      hapticSuccess();
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
