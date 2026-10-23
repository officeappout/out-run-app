import { TOGETHER_CONFIG } from './config';
import type { TogetherKind } from './types';

/**
 * The system decides how a group trains (owner, 22.10 — no same/each toggle):
 *   similar level  → the SAME workout, one shared clock;
 *   different      → each at their own level, same structure + duration,
 *                    personal reps / paces.
 * The lobby only explains the choice in one line (see `explainDecision`).
 */

export type TogetherMode = 'same' | 'each';

export interface LevelPerson {
  /** strength / AMRAP / EMOM: programme level (strengthLevelOf); null = unknown. */
  level?: number | null;
  /** run / walk / bike: average pace, seconds per km; null / 0 = unknown. */
  paceSecPerKm?: number | null;
}

export interface TogetherDecision {
  mode: TogetherMode;
  /** What the decision was based on. */
  basis: 'level' | 'pace' | 'unknown';
  /** Level: max − min. Pace: slowest ÷ fastest (1 = identical). */
  spread: number;
  /** How many people had usable data. */
  known: number;
  /** Level basis: the range. Pace basis: fastest / slowest. */
  low: number | null;
  high: number | null;
}

const finitePositive = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

/** Strength-like: levels within `maxSpread` of each other train the same workout. */
export function decideByLevel(levels: Array<number | null | undefined>, maxSpread: number = TOGETHER_CONFIG.maxLevelSpread): TogetherDecision {
  const known = levels.filter((l): l is number => typeof l === 'number' && Number.isFinite(l));
  if (known.length < 2) {
    return { mode: 'same', basis: 'unknown', spread: 0, known: known.length, low: known[0] ?? null, high: known[0] ?? null };
  }
  const low = Math.min(...known);
  const high = Math.max(...known);
  const spread = high - low;
  return { mode: spread <= maxSpread ? 'same' : 'each', basis: 'level', spread, known: known.length, low, high };
}

/** Run-like: paces within `maxRatio` (slowest ÷ fastest) share one workout. */
export function decideByPace(paces: Array<number | null | undefined>, maxRatio: number = TOGETHER_CONFIG.maxPaceRatio): TogetherDecision {
  const known = paces.filter(finitePositive);
  if (known.length < 2) {
    return { mode: 'same', basis: 'unknown', spread: 1, known: known.length, low: known[0] ?? null, high: known[0] ?? null };
  }
  const fastest = Math.min(...known);
  const slowest = Math.max(...known);
  const ratio = slowest / fastest;
  return { mode: ratio <= maxRatio ? 'same' : 'each', basis: 'pace', spread: ratio, known: known.length, low: fastest, high: slowest };
}

/** One entry point for the lobby. */
export function decideTogetherMode(kind: TogetherKind, people: LevelPerson[]): TogetherDecision {
  return kind === 'run'
    ? decideByPace(people.map((p) => p.paceSecPerKm))
    : decideByLevel(people.map((p) => p.level));
}

/** Which lobby sentence to show (keys live in messages/he/together.json). */
export type DecisionCopyKey = 'lobby.explain.same' | 'lobby.explain.sameLevel' | 'lobby.explain.eachLevel' | 'lobby.explain.eachPace' | 'lobby.explain.unknown';

export function explainDecision(d: TogetherDecision): { key: DecisionCopyKey; params: Record<string, string | number> } {
  if (d.basis === 'unknown') return { key: 'lobby.explain.unknown', params: {} };
  if (d.mode === 'same') {
    return d.basis === 'level'
      ? { key: 'lobby.explain.sameLevel', params: { level: d.low ?? 0 } }
      : { key: 'lobby.explain.same', params: {} };
  }
  if (d.basis === 'level') return { key: 'lobby.explain.eachLevel', params: { low: d.low ?? 0, high: d.high ?? 0 } };
  return { key: 'lobby.explain.eachPace', params: {} };
}
