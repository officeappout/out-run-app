/**
 * Handstand Triad session skeleton. Pure.
 *
 * Built from the 42 legacy handstand workouts (levels 1–10), which all share
 * the same blocks:
 *   1. warmup (fixed: scapulae + wrists, 41/42 workouts)
 *   2. shoulder mobility  → M
 *   3. skill / balance    → B
 *   4. shoulder strength  → S
 *   5. core & body line   → S
 *   6. cooldown (fixed: upper-body stretches)
 *
 * Weakest axis gets priority: +1 set and, in a full session, a second
 * exercise. The strongest axis gets maintenance volume (2 sets). All equal →
 * no emphasis.
 *
 * 'block' mode is the short insert inside another workout (owner, 30.10:
 * handstand works both standalone and as a block): warmup + the weakest
 * axis's block + the next weakest.
 *
 * Volume here is a default (3 sets per exercise). Frequency and minutes per
 * general calisthenics level are still to be decided with the owner.
 */
import { rankAxes } from './triad-levels';
import type { TriadAxis, TriadBlock, TriadBlockKind, TriadPlanMode, TriadValues } from './triad.types';

export const BASE_SETS = 3;
export const WEAKEST_EXTRA_SETS = 1;
export const STRONGEST_SETS = 2;

const AXIS_BLOCKS: { kind: TriadBlockKind; axis: TriadAxis }[] = [
  { kind: 'mobility', axis: 'mobility' },
  { kind: 'balance', axis: 'balance' },
  { kind: 'strength', axis: 'strength' },
  { kind: 'line', axis: 'strength' },
];

function axisBlock(kind: TriadBlockKind, axis: TriadAxis, levels: TriadValues, mode: TriadPlanMode): TriadBlock {
  const { weakest, strongest } = rankAxes(levels);
  // The line block is accessory work; emphasis goes to the main strength block only.
  const emphasisApplies = kind !== 'line';
  if (emphasisApplies && axis === weakest) {
    return { kind, axis, slots: mode === 'session' ? 2 : 1, sets: BASE_SETS + WEAKEST_EXTRA_SETS, emphasis: 'weakest' };
  }
  if (emphasisApplies && axis === strongest) {
    return { kind, axis, slots: 1, sets: STRONGEST_SETS, emphasis: 'strongest' };
  }
  return { kind, axis, slots: 1, sets: BASE_SETS };
}

export function buildTriadPlan(levels: TriadValues, mode: TriadPlanMode = 'session'): TriadBlock[] {
  const warmup: TriadBlock = { kind: 'warmup', slots: 1, sets: 1 };
  if (mode === 'session') {
    return [
      warmup,
      ...AXIS_BLOCKS.map(({ kind, axis }) => axisBlock(kind, axis, levels, mode)),
      { kind: 'cooldown', slots: 1, sets: 1 },
    ];
  }
  // Short insert: the two weakest axes, weakest first (mobility → balance → strength on ties).
  const order: TriadAxis[] = ['mobility', 'balance', 'strength'];
  const byNeed = [...order].sort((a, b) => levels[a] - levels[b] || order.indexOf(a) - order.indexOf(b));
  return [warmup, ...byNeed.slice(0, 2).map((axis) => axisBlock(axis, axis, levels, mode))];
}
