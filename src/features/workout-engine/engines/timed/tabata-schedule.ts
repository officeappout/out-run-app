/**
 * tabata-schedule — the interval list and the time → position mapping.
 *
 * The ORDER of members comes from the strength player's own tabata head
 * (tabataIntervalInfo / tabataRoundsPerMember), walked exactly the way
 * tabataAdvance walks it — cycle-major A→B→A→B by default, exercise-major
 * A→A→B→B for the park-machine block, a unilateral member costing two
 * consecutive intervals (right, then left). Timing matches the player:
 * work → rest after every interval except the last (no trailing rest).
 */
import { tabataIntervalInfo, tabataRoundsPerMember } from '../../players/strength/protocols/tabata.advance';
import type { TabataProtocolConfig } from '../../core/types/protocol.types';
import type { TabataInterval, TimedItem } from './timed.types';

export function tabataCosts(items: readonly TimedItem[]): number[] {
  return items.map((it) => (it.isUnilateral ? 2 : 1));
}

/** Every work interval in play order, with its member and side. */
export function buildTabataIntervals(items: readonly TimedItem[], config: TabataProtocolConfig): TabataInterval[] {
  const out: TabataInterval[] = [];
  if (items.length === 0 || !(config.rounds > 0)) return out;
  const costs = tabataCosts(items);
  const orderMode = config.orderMode ?? 'cycle-major';
  let ex = 0;
  let set = 0;
  // Hard stop: every visit adds ≥1 interval, so `rounds` visits always suffice.
  for (let guard = 0; guard <= config.rounds && out.length < config.rounds; guard++) {
    const { isLastInterval } = tabataIntervalInfo({ costs, exerciseIndex: ex, setIdx: set, rounds: config.rounds, orderMode });
    const cost = costs[ex] ?? 1;
    for (let c = 0; c < cost && out.length < config.rounds; c++) {
      out.push({ index: out.length, itemIndex: ex, side: cost === 2 ? (c === 0 ? 'right' : 'left') : null });
    }
    if (isLastInterval) break;
    if (orderMode === 'exercise-major') {
      if (set + 1 < tabataRoundsPerMember(config.rounds, costs)) set += 1;
      else {
        ex += 1;
        set = 0;
        if (ex >= items.length) break;
      }
    } else if (ex < items.length - 1) {
      ex += 1;
    } else {
      ex = 0;
      set += 1;
    }
  }
  return out;
}

/** Whole block length: n×work + (n−1)×rest. */
export function tabataTotalMs(config: TabataProtocolConfig, intervalCount: number): number {
  if (intervalCount <= 0) return 0;
  return (intervalCount * config.workSec + (intervalCount - 1) * Math.max(0, config.restSec)) * 1000;
}

export interface TabataPosition {
  /** Interval index (the one working, or the one just finished during its rest). */
  index: number;
  phase: 'work' | 'rest' | 'done';
  phaseElapsedMs: number;
  phaseRemainingMs: number;
}

export function tabataPositionAt(config: TabataProtocolConfig, intervalCount: number, activeMs: number): TabataPosition {
  const workMs = config.workSec * 1000;
  const restMs = Math.max(0, config.restSec) * 1000;
  const total = tabataTotalMs(config, intervalCount);
  if (intervalCount <= 0 || activeMs >= total) {
    return { index: Math.max(0, intervalCount - 1), phase: 'done', phaseElapsedMs: 0, phaseRemainingMs: 0 };
  }
  const cycle = workMs + restMs;
  const k = Math.min(intervalCount - 1, Math.floor(activeMs / cycle));
  const within = activeMs - k * cycle;
  if (within < workMs) return { index: k, phase: 'work', phaseElapsedMs: within, phaseRemainingMs: workMs - within };
  return { index: k, phase: 'rest', phaseElapsedMs: within - workMs, phaseRemainingMs: cycle - within };
}

/** Active ms at which interval `k`'s work starts. */
export function tabataWorkStartMs(config: TabataProtocolConfig, k: number): number {
  return k * (config.workSec + Math.max(0, config.restSec)) * 1000;
}
