/**
 * The week search: backtracking over specific days. Runs first (by slot — never by
 * position), then strength around them. Hard rules prune; soft rules score the leaves;
 * ties break on a deterministic key. Pure and bounded (SEARCH_NODE_BUDGET).
 */
import { SEARCH_NODE_BUDGET } from './config';
import { profileOf } from './programProfiles';
import {
  breaksH2,
  breaksH3,
  breaksH4,
  breaksH6,
  breaksH7,
  cloneGrid,
  isKeyRun,
  isQualityRun,
  keyRunBreaksH3,
  longestRunStreak,
  nextDay,
  type Grid,
} from './rules';
import { gridKey, scoreFull, scoreRunBound, type Breakdown, type ScoreCtx } from './score';
import type { Unit } from './units';

export interface SearchCtx {
  open: readonly boolean[];
  maxPerDay: number;
  maxTrainingDays?: number;
  runCap: number;
  score: ScoreCtx;
  /** Pre-filled (frozen / history) grid. */
  base: Grid;
}

export interface SearchResult {
  grid: Grid;
  total: number;
  breakdown: Breakdown;
  key: string;
  truncated: boolean;
}

const variantCache = new Map<string, Unit>();
function variantOfUnit(u: Unit): Unit | null {
  if (!u.variant) return null;
  const cached = variantCache.get(u.id + '>' + u.variant);
  if (cached) return cached;
  const prof = profileOf(u.variant);
  const v: Unit = {
    ...u,
    slugs: [u.variant],
    load: prof.load,
    intensity: prof.intensity,
    minRecH: prof.minRecoveryHours,
    idealRecH: prof.idealRecoveryHours,
    variant: undefined,
    variantOf: u.slugs[0],
  };
  variantCache.set(u.id + '>' + u.variant, v);
  return v;
}

/** Search the best grid for this unit set. `budgetBest` = a total to beat (pruning). */
export function searchWeek(runs: Unit[], strength: Unit[], ctx: SearchCtx, extraCost: number, budgetBest: number): SearchResult | null {
  const runOrder = [...runs].sort((a, b) => (a.fixedDow !== undefined ? -1 : 0) - (b.fixedDow !== undefined ? -1 : 0) || a.rank - b.rank);
  const strOrder = [...strength].sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id));
  const grid = cloneGrid(ctx.base);
  let best: SearchResult | null = null;
  let bestTotal = budgetBest;
  let leaves = 0;
  let truncated = false;

  const occupied = (d: number) => (grid.run[d] ? 1 : 0) + (grid.strength[d] ? 1 : 0);
  const trainingDays = () => {
    let n = 0;
    for (let d = 0; d < 7; d++) if (grid.run[d] || grid.strength[d]) n++;
    return n;
  };

  const consider = () => {
    leaves++;
    if (leaves > SEARCH_NODE_BUDGET) {
      truncated = true;
      return;
    }
    if (ctx.maxTrainingDays !== undefined && trainingDays() > ctx.maxTrainingDays) return;
    const { total, breakdown } = scoreFull(grid, ctx.score);
    const all = total + extraCost;
    if (all > bestTotal + 1e-9) return;
    const key = gridKey(grid);
    if (best && Math.abs(all - bestTotal) <= 1e-9 && key >= best.key) return;
    bestTotal = all;
    best = { grid: cloneGrid(grid), total: all, breakdown, key, truncated: false };
  };

  const placeStrength = (i: number, minDayBySame: Map<string, number>) => {
    if (truncated) return;
    if (i === strOrder.length) {
      consider();
      return;
    }
    const u = strOrder[i];
    const from = minDayBySame.get(u.identity) ?? 0;
    for (let d = from; d < 7; d++) {
      if (!ctx.open[d] || grid.strength[d]) continue;
      if (occupied(d) + 1 > ctx.maxPerDay) continue;
      if (breaksH2(u, grid.run[d])) continue;
      const options: Unit[] = [u];
      const n = nextDay(d);
      const keyTomorrow = n !== null && isKeyRun(grid.run[n]);
      const v = keyTomorrow ? variantOfUnit(u) : null;
      if (v) options.push(v);
      for (const cand of options) {
        if (breaksH3(cand, d, grid)) continue;
        let ok = true;
        for (let e = 0; e < 7 && ok; e++) {
          const o = grid.strength[e];
          if (!o || e === d) continue;
          if (breaksH6(cand, d, o, e) || breaksH7(cand, d, o, e)) ok = false;
        }
        if (!ok) continue;
        grid.strength[d] = cand;
        const prev = minDayBySame.get(u.identity);
        minDayBySame.set(u.identity, d + 1);
        placeStrength(i + 1, minDayBySame);
        if (prev === undefined) minDayBySame.delete(u.identity);
        else minDayBySame.set(u.identity, prev);
        grid.strength[d] = null;
        if (truncated) return;
      }
    }
  };

  const placeRun = (i: number, minDayBySame: Map<string, number>) => {
    if (truncated) return;
    if (i === runOrder.length) {
      if (longestRunStreak(grid) > ctx.runCap) return;
      if (scoreRunBound(grid, ctx.score) + extraCost > bestTotal + 1e-9) return;
      placeStrength(0, new Map());
      return;
    }
    const u = runOrder[i];
    const from = minDayBySame.get(u.identity) ?? 0;
    for (let d = from; d < 7; d++) {
      if (u.fixedDow !== undefined ? d !== u.fixedDow : !ctx.open[d]) continue;
      if (grid.run[d]) continue;
      if (occupied(d) + 1 > ctx.maxPerDay) continue;
      if (isKeyRun(u) && keyRunBreaksH3(d, grid)) continue;
      if (u.slot === 'long_run' && grid.strength[d]) continue;
      if (isQualityRun(u)) {
        let clash = false;
        for (let e = 0; e < 7; e++) if (e !== d && isQualityRun(grid.run[e]) && breaksH4(d, e)) clash = true;
        if (clash) continue;
      }
      grid.run[d] = u;
      const prev = minDayBySame.get(u.identity);
      minDayBySame.set(u.identity, d + 1);
      placeRun(i + 1, minDayBySame);
      if (prev === undefined) minDayBySame.delete(u.identity);
      else minDayBySame.set(u.identity, prev);
      grid.run[d] = null;
      if (truncated) return;
    }
  };

  placeRun(0, new Map());
  if (best) (best as SearchResult).truncated = truncated;
  return best;
}
