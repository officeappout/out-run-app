/**
 * Hard constraints H1–H9 (§4.2) as small pure predicates over a week grid, shared by the
 * search (incremental), the makeup policy and the final validator. H10 (race) is out of
 * scope for this PR (owner, 19.10.2026).
 */
import { isKeySlot, isQualitySlot, RUN_STREAK_CAP, WRAP_WEEK } from './config';
import { canonicalSlug, H6_PATTERNS, HEAVY_LEGS, isMuscleUp, isOapu, SHARED_PATTERN_LOAD, SKILL_CNS } from './programProfiles';
import type { TrainingLevel } from './types';
import type { Unit } from './units';

/** One week: at most one run and one main strength unit per day (H9 by construction). */
export interface Grid {
  run: Array<Unit | null>;
  strength: Array<Unit | null>;
}

export const emptyGrid = (): Grid => ({ run: Array(7).fill(null), strength: Array(7).fill(null) });
export const cloneGrid = (g: Grid): Grid => ({ run: [...g.run], strength: [...g.strength] });

export type HardRuleId = 'H1' | 'H2' | 'H3' | 'H4' | 'H5' | 'H6' | 'H7' | 'H8' | 'H9';

export interface HardViolation {
  rule: HardRuleId;
  days: number[];
}

/** Circular day distance when the week repeats, linear otherwise. */
export function gapDays(a: number, b: number): number {
  const d = Math.abs(a - b);
  return WRAP_WEEK ? Math.min(d, 7 - d) : d;
}

/** Days from `a` forward to `b` (1..6), or Infinity when b is not after a in a linear week. */
export function forwardDays(a: number, b: number): number {
  if (WRAP_WEEK) return (((b - a) % 7) + 7) % 7;
  return b > a ? b - a : Infinity;
}

export function nextDay(d: number): number | null {
  if (d < 6) return d + 1;
  return WRAP_WEEK ? 0 : null;
}

export function prevDay(d: number): number | null {
  if (d > 0) return d - 1;
  return WRAP_WEEK ? 6 : null;
}

export const isKeyRun = (u: Unit | null | undefined): boolean => !!u && u.kind === 'run' && isKeySlot(u.slot);
export const isQualityRun = (u: Unit | null | undefined): boolean => !!u && u.kind === 'run' && isQualitySlot(u.slot);
export const isLongRun = (u: Unit | null | undefined): boolean => !!u && u.kind === 'run' && u.slot === 'long_run';

/** H2: strength never on the long-run day. */
export function breaksH2(strength: Unit, run: Unit | null): boolean {
  return isLongRun(run);
}

/** H3: heavy legs (≥0.8) never the day before a quality / long run (Sat → Sun included). */
export function breaksH3(strength: Unit, day: number, grid: Grid): boolean {
  if (strength.load.legs < HEAVY_LEGS) return false;
  const n = nextDay(day);
  return n !== null && isKeyRun(grid.run[n]);
}

/** H3 seen from a key run placed at `day`: heavy legs the day before it. */
export function keyRunBreaksH3(day: number, grid: Grid): boolean {
  const p = prevDay(day);
  return p !== null && (grid.strength[p]?.load.legs ?? 0) >= HEAVY_LEGS;
}

/** H4: quality runs ≥48h apart. */
export function breaksH4(day: number, other: number): boolean {
  return gapDays(day, other) < 2;
}

const hasSlug = (u: Unit, pred: (s: string) => boolean) => u.slugs.some(pred);

/** H6 (+ FIX-01): same-pattern recovery between two strength units on different days. */
export function breaksH6(a: Unit, da: number, b: Unit, db: number): boolean {
  if (da === db) return false;
  const gapH = gapDays(da, db) * 24;
  const need = Math.max(a.minRecH, b.minRecH);
  for (const p of H6_PATTERNS) {
    if (a.load[p] >= SHARED_PATTERN_LOAD && b.load[p] >= SHARED_PATTERN_LOAD && gapH < need) return true;
  }
  // FIX-01: after a one-arm pull-up, any pull ≥ 72h later.
  if (hasSlug(a, isOapu) && b.load.pull >= SHARED_PATTERN_LOAD && forwardDays(da, db) < 3) return true;
  if (hasSlug(b, isOapu) && a.load.pull >= SHARED_PATTERN_LOAD && forwardDays(db, da) < 3) return true;
  return false;
}

/** H7: after a muscle-up, no other cns ≥ 0.7 skill within 48h. */
export function breaksH7(a: Unit, da: number, b: Unit, db: number): boolean {
  if (da === db) return false;
  const after = (x: Unit, dx: number, y: Unit, dy: number) =>
    hasSlug(x, isMuscleUp) &&
    y.load.cns >= SKILL_CNS &&
    !y.slugs.every((s) => canonicalSlug(s) === 'handstand') &&
    forwardDays(dx, dy) <= 2;
  return after(a, da, b, db) || after(b, db, a, da);
}

/** H8: longest streak of run days (linear, like RUN-04). */
export function longestRunStreak(grid: Grid): number {
  let best = 0;
  let cur = 0;
  for (let d = 0; d < 7; d++) {
    cur = grid.run[d] ? cur + 1 : 0;
    best = Math.max(best, cur);
  }
  return best;
}

export function runStreakCap(level: TrainingLevel | null): number {
  return RUN_STREAK_CAP[level ?? 'intermediate'];
}

export interface CapacityCtx {
  open: readonly boolean[];
  maxPerDay: number;
  maxTrainingDays?: number;
  /** Days whose content is history (frozen): skip H1 for them. */
  frozen?: readonly boolean[];
}

/** Full validation of a finished grid. */
export function checkHardRules(grid: Grid, cap: CapacityCtx, runLevel: TrainingLevel | null): HardViolation[] {
  const out: HardViolation[] = [];
  let trainingDays = 0;
  for (let d = 0; d < 7; d++) {
    const n = (grid.run[d] ? 1 : 0) + (grid.strength[d] ? 1 : 0);
    if (n > 0) trainingDays++;
    if (cap.frozen?.[d]) continue;
    if (n > 0 && !cap.open[d] && grid.run[d]?.fixedDow !== d) out.push({ rule: 'H1', days: [d] });
    if (n > cap.maxPerDay) out.push({ rule: 'H1', days: [d] });
  }
  if (cap.maxTrainingDays !== undefined && trainingDays > cap.maxTrainingDays) out.push({ rule: 'H1', days: [] });
  for (let d = 0; d < 7; d++) {
    const s = grid.strength[d];
    if (s && breaksH2(s, grid.run[d])) out.push({ rule: 'H2', days: [d] });
    if (s && breaksH3(s, d, grid)) out.push({ rule: 'H3', days: [d, nextDay(d)!] });
  }
  const q = [0, 1, 2, 3, 4, 5, 6].filter((d) => isQualityRun(grid.run[d]));
  for (let i = 0; i < q.length; i++)
    for (let j = i + 1; j < q.length; j++) if (breaksH4(q[i], q[j])) out.push({ rule: 'H4', days: [q[i], q[j]] });
  const s = [0, 1, 2, 3, 4, 5, 6].filter((d) => grid.strength[d]);
  for (let i = 0; i < s.length; i++)
    for (let j = i + 1; j < s.length; j++) {
      const a = grid.strength[s[i]]!;
      const b = grid.strength[s[j]]!;
      if (breaksH6(a, s[i], b, s[j])) out.push({ rule: 'H6', days: [s[i], s[j]] });
      if (breaksH7(a, s[i], b, s[j])) out.push({ rule: 'H7', days: [s[i], s[j]] });
    }
  if (longestRunStreak(grid) > runStreakCap(runLevel)) out.push({ rule: 'H8', days: [] });
  return out;
}
