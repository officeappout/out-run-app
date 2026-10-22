/**
 * Streak flames (home v2) — pure logic, zero React. Which flame(s) a day
 * earned, and which runs of days the streak capsule wraps.
 *
 * Plain .ts so it is unit-testable and importable from both the weekly strip
 * and the month grid.
 */

import { MAINTENANCE_COLOR, TRACK_COLORS, TRACK_RGB } from './track-colors';

export type FlameTone = 'strength' | 'cardio' | 'steps' | 'maintenance';

/** Display order when a day blends several activities. */
export const FLAME_TONE_ORDER: FlameTone[] = ['strength', 'cardio', 'steps', 'maintenance'];

/** rgb (for soft washes), hex (dots/strokes), Hebrew label. Hexes from the shared track map (track-colors). */
export const FLAME_TONES: Record<FlameTone, { rgb: string; hex: string; label: string }> = {
  strength: { rgb: TRACK_RGB.strength, hex: TRACK_COLORS.strength, label: 'כוח' },
  cardio: { rgb: TRACK_RGB.run, hex: TRACK_COLORS.run, label: 'אירובי' },
  steps: { rgb: TRACK_RGB.walk, hex: TRACK_COLORS.walk, label: 'צעדים' },
  maintenance: { rgb: '168,85,247', hex: MAINTENANCE_COLOR, label: 'גמישות' },
};

/** Recoloured copies of the app's LottieFiles flame (public/assets/animations/flames). */
const BASE = '/assets/animations/flames/';
const BLENDS = new Set(['strength-cardio', 'strength-steps', 'cardio-steps', 'strength-cardio-steps']);

export function sortTones(tones: Iterable<FlameTone>): FlameTone[] {
  const set = new Set(tones);
  return FLAME_TONE_ORDER.filter((t) => set.has(t));
}

/** The Lottie for a set of tones: one colour, or a shipped blend, else the first tone. */
export function flameSrc(tones: FlameTone[]): string {
  const t = sortTones(tones);
  if (t.length === 0) return `${BASE}strength.lottie`;
  if (t.length > 1) {
    const key = t.filter((x) => x !== 'maintenance').join('-');
    if (BLENDS.has(key)) return `${BASE}${key}.lottie`;
  }
  return `${BASE}${t[0]}.lottie`;
}

/** Map a flame-asset bucket (day-display.utils' FlameKey) to a tone. */
export function toneFromFlameKey(key: string | null | undefined): FlameTone {
  switch (key) {
    case 'endurance':
    case 'intensity':
    case 'play':
      return 'cardio';
    case 'steps':
      return 'steps';
    case 'maintenance':
      return 'maintenance';
    default:
      return 'strength';
  }
}

/** Map an activity category ('strength' | 'cardio' | 'maintenance') to a tone. */
export function toneFromCategory(category: string | null | undefined): FlameTone {
  if (category === 'cardio') return 'cardio';
  if (category === 'maintenance') return 'maintenance';
  if (category === 'steps') return 'steps';
  return 'strength';
}

export type StreakCell = 'done' | 'rest' | 'other';

/**
 * Runs the capsule wraps: 2+ consecutive done days; a single rest day
 * between two done days keeps the run going (it sits inside the capsule).
 * Returns inclusive index ranges in the order given (Sunday first).
 */
export function streakRuns(cells: StreakCell[]): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  let start = -1;
  let last = -1;
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    if (c === 'done') {
      if (start < 0) start = i;
      last = i;
    } else if (c === 'rest' && start >= 0 && cells[i + 1] === 'done') {
      continue;
    } else if (start >= 0) {
      if (last > start) out.push({ from: start, to: last });
      start = -1;
    }
  }
  if (start >= 0 && last > start) out.push({ from: start, to: last });
  return out;
}

/** Capsule fill + hairline: a soft wash blending each day's tone, stronger toward today. */
export function capsuleBackground(tones: FlameTone[]): string {
  const k = tones.length;
  const stop = (alpha: (i: number) => number) =>
    tones
      .map((t, i) => `rgba(${FLAME_TONES[t].rgb},${alpha(i).toFixed(2)}) ${k === 1 ? 0 : Math.round((i / (k - 1)) * 100)}%`)
      .join(', ');
  const fill = `linear-gradient(270deg, ${stop((i) => 0.11 + (0.12 * i) / Math.max(1, k - 1))})`;
  const edge = `linear-gradient(270deg, ${stop((i) => 0.28 + (0.3 * i) / Math.max(1, k - 1))})`;
  return `${fill} padding-box, linear-gradient(#fff,#fff) padding-box, ${edge} border-box`;
}
