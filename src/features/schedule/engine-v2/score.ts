/**
 * Soft preferences S1–S13 (§4.3) — penalty weights, lowest total wins. Pure.
 *
 * The score is split in a run part (fixed once the runs are placed — a lower bound the
 * search prunes with) and a strength part.
 */
import { PRIORITY_TUNING, STREAK_COMFORT, W } from './config';
import { canonicalSlug, H6_PATTERNS, HEAVY_LEGS, MODERATE_LEGS, SKILL_CNS, SPREAD_PATTERN_LOAD } from './programProfiles';
import { gapDays, isKeyRun, isLongRun, isQualityRun, nextDay, type Grid } from './rules';
import type { SchedulePriority, TrainingLevel } from './types';
import type { Unit } from './units';

export interface ScoreCtx {
  priority: SchedulePriority;
  longRunDay: number | null;
  /** identity → per-day count of the existing week (S4). */
  existing: Map<string, number[]> | null;
  moveWeight: number;
  streakComfort: number;
  /** Main sessions in the week (S6 small-week rule). */
  totalSessions: number;
  /** Days that are history: never counted as moves. */
  frozen: readonly boolean[];
}

export type Breakdown = Record<string, number>;

const add = (b: Breakdown, k: string, v: number) => {
  if (v) b[k] = (b[k] ?? 0) + v;
};

export function streakComfortOf(levels: { strength: TrainingLevel | null; running: TrainingLevel | null }): number {
  const values = [levels.strength, levels.running].filter((l): l is TrainingLevel => !!l).map((l) => STREAK_COMFORT[l]);
  return values.length ? Math.max(...values) : STREAK_COMFORT.intermediate;
}

function identitiesOf(u: Unit): string[] {
  if (u.kind === 'run') return [`run:${u.slot}`];
  return u.slugs.map((s) => `strength:${canonicalSlug(s)}`);
}

/** S4: sessions not on a day the existing week had them. */
function movedCount(grid: Grid, existing: Map<string, number[]>, frozen: readonly boolean[]): number {
  const placed = new Map<string, number[]>();
  for (let d = 0; d < 7; d++) {
    if (frozen[d]) continue;
    for (const u of [grid.run[d], grid.strength[d]]) {
      if (!u) continue;
      for (const id of identitiesOf(u)) {
        const arr = placed.get(id) ?? Array(7).fill(0);
        arr[d]++;
        placed.set(id, arr);
      }
    }
  }
  let moved = 0;
  for (const [id, have] of Array.from(existing.entries())) {
    const p = placed.get(id);
    if (!p) continue;
    let kept = 0;
    let totalP = 0;
    let totalE = 0;
    for (let d = 0; d < 7; d++) {
      if (frozen[d]) continue;
      kept += Math.min(p[d], have[d]);
      totalP += p[d];
      totalE += have[d];
    }
    moved += Math.min(totalP, totalE) - kept;
  }
  return moved;
}

export function scoreRuns(grid: Grid, ctx: ScoreCtx, b: Breakdown): number {
  let t = 0;
  // S1 long run on the target day.
  const L = grid.run.findIndex((u) => isLongRun(u));
  if (L >= 0 && ctx.longRunDay !== null) {
    const v = W.S1_LONG_RUN_DAY * Math.abs(L - ctx.longRunDay);
    add(b, 'S1', v);
    t += v;
  }
  for (let d = 0; d < 7; d++) {
    const n = nextDay(d);
    if (n === null) continue;
    const a = grid.run[d];
    const c = grid.run[n];
    // S8 long right after quality / quality right after long.
    if ((isQualityRun(a) && isLongRun(c)) || (isLongRun(a) && isQualityRun(c))) {
      add(b, 'S8', W.S8_LONG_AFTER_QUALITY);
      t += W.S8_LONG_AFTER_QUALITY;
    }
    // S9 adjacent hard run days (linear pairs only).
    if (d < 6 && isKeyRun(a) && isKeyRun(c)) {
      add(b, 'S9', W.S9_ADJACENT_HARD);
      t += W.S9_ADJACENT_HARD;
    }
  }
  return t;
}

export function scoreFull(grid: Grid, ctx: ScoreCtx): { total: number; breakdown: Breakdown } {
  const b: Breakdown = {};
  scoreRuns(grid, ctx, b);
  const tuning = PRIORITY_TUNING[ctx.priority];
  let doubles = 0;
  for (let d = 0; d < 7; d++) {
    const s = grid.strength[d];
    const r = grid.run[d];
    if (s && r) {
      doubles++;
      if (!isQualityRun(r)) add(b, 'S5', W.S5_DOUBLE_NOT_QUALITY);
      if (s.load.cns >= SKILL_CNS && s.isSkill) add(b, 'S12', W.S12_SKILL_WITH_RUN);
      if (s.isSkill) add(b, 'P_SKILL_WITH_RUN', tuning.skillWithRun);
      if (isKeyRun(r)) add(b, 'P_STRENGTH_AFTER_KEY', tuning.strengthAfterKeyRun);
      add(b, 'P_DOUBLE', tuning.doubleDay);
      add(b, 'TIE_DOUBLE', W.TIE_DOUBLE_DAY);
    }
    if (s) {
      // S7 moderate legs the day before a key run (heavy legs is H3).
      const n = nextDay(d);
      if (n !== null && s.load.legs >= MODERATE_LEGS && isKeyRun(grid.run[n])) add(b, 'S7', W.S7_MODERATE_LEGS_BEFORE_KEY);
      // S9 (cross-domain part): heavy legs the day after the long run — two leg-heavy days in a row.
      if (d > 0 && s.load.legs >= HEAVY_LEGS && isLongRun(grid.run[d - 1])) add(b, 'S9', W.S9_ADJACENT_HARD);
    }
  }
  // Variant swaps.
  for (let d = 0; d < 7; d++) {
    if (grid.strength[d]?.variantOf) add(b, 'VARIANT', W.VARIANT_SWAP);
  }
  // S6 small week: at most one double.
  if (ctx.totalSessions <= W.S6_SMALL_WEEK_SESSIONS && doubles > 1) add(b, 'S6', W.S6_EXTRA_DOUBLE_SMALL_WEEK * (doubles - 1));
  // S9 adjacent hard strength days + same-pattern sessions under the ideal gap; tie spread.
  const sd = [0, 1, 2, 3, 4, 5, 6].filter((d) => grid.strength[d]);
  for (let i = 0; i < sd.length; i++) {
    for (let j = i + 1; j < sd.length; j++) {
      const a = grid.strength[sd[i]]!;
      const c = grid.strength[sd[j]]!;
      const gap = gapDays(sd[i], sd[j]);
      if (sd[j] - sd[i] === 1 && a.intensity === 'hard' && c.intensity === 'hard') add(b, 'S9', W.S9_ADJACENT_HARD);
      const shares = H6_PATTERNS.some((p) => a.load[p] >= SPREAD_PATTERN_LOAD && c.load[p] >= SPREAD_PATTERN_LOAD);
      if (shares && gap * 24 < Math.max(a.idealRecH, c.idealRecH)) add(b, 'S9', W.S9_ADJACENT_HARD);
      if (a.identity === c.identity && gap > 0) add(b, 'TIE_SPREAD', W.TIE_SPREAD / gap);
    }
  }
  // S10 consecutive training days over comfort (linear).
  let streak = 0;
  let best = 0;
  for (let d = 0; d < 7; d++) {
    streak = grid.run[d] || grid.strength[d] ? streak + 1 : 0;
    best = Math.max(best, streak);
  }
  if (best > ctx.streakComfort) add(b, 'S10', W.S10_STREAK * (best - ctx.streakComfort));
  // S4 keep the user's days.
  if (ctx.existing) add(b, 'S4', ctx.moveWeight * movedCount(grid, ctx.existing, ctx.frozen));

  const total = Object.values(b).reduce((s, v) => s + v, 0);
  return { total, breakdown: b };
}

/** S4 + run part only (lower bound once runs are placed). */
export function scoreRunBound(grid: Grid, ctx: ScoreCtx): number {
  const b: Breakdown = {};
  return scoreRuns(grid, ctx, b);
}

/**
 * Deterministic tie-break key, compared day by day from Sunday: a strength session earlier
 * in the week wins (higher-priority program first), and on a strength day "no run" beats
 * "with a run" (separate days first). Codes: strength 'a'+rank or 'z'; run '0' or 'b'+rank.
 */
export function gridKey(grid: Grid): string {
  let key = '';
  for (let d = 0; d < 7; d++) {
    const s = grid.strength[d];
    const r = grid.run[d];
    key += s ? `a${String(s.rank).padStart(3, '0')}${s.variantOf ? 'v' : 'u'}` : 'z000u';
    key += r ? `b${r.rank}` : '00';
  }
  return key;
}
