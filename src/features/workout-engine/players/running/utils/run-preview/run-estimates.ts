/**
 * Time / distance / pace estimates for a planned run (pure).
 *
 * Templates give each block EITHER a time or a distance. To show "41′ ·
 * ~6.4 ק״מ" we fill the missing side from the block's pace: its target
 * band's middle (the same band the live player uses —
 * resolveBlockTargetPace), else the easy zone for effort blocks, else a
 * walking pace for rests.
 */

import type { RunBlock } from '../../types/run-block.type';
import type { ComputedPaceZone, RunZoneType } from '../../../../core/types/running.types';
import { isRestBlock, isShortLeg, resolveBlockTargetPace } from '../../lib/planned-rep-results';

export interface RunPaceContext {
  /** sec/km; 0 = unknown (no pace profile yet). */
  basePace: number;
  zones: Record<RunZoneType, ComputedPaceZone> | null;
}

/** ~6 km/h — rests and walk legs. */
export const WALK_PACE_SEC_PER_KM = 600;

/** Target band of a pace block, or null (effort block / no profile). */
export function blockTargetBand(block: RunBlock, ctx: RunPaceContext): { min: number; max: number } | null {
  if ((block.blockMode ?? 'pace') === 'effort') return null;
  const t = resolveBlockTargetPace(block, ctx.basePace, ctx.zones);
  return t.min > 0 && t.max > 0 ? { min: Math.min(t.min, t.max), max: Math.max(t.min, t.max) } : null;
}

/** The pace (sec/km) used to convert time ↔ distance for one block, or null when unknown. */
export function estimatePaceFor(block: RunBlock, ctx: RunPaceContext): number | null {
  if (isRestBlock(block)) return WALK_PACE_SEC_PER_KM;
  const band = blockTargetBand(block, ctx);
  if (band) return (band.min + band.max) / 2;
  const easy = ctx.zones?.easy;
  if (easy && easy.minPace > 0 && easy.maxPace > 0) return (easy.minPace + easy.maxPace) / 2;
  if (ctx.basePace > 0) return Math.round(ctx.basePace * 1.15);
  return null;
}

export function estimateBlockSeconds(block: RunBlock, ctx: RunPaceContext): number | null {
  if (block.durationSeconds && block.durationSeconds > 0) return block.durationSeconds;
  if (block.distanceMeters && block.distanceMeters > 0) {
    const pace = estimatePaceFor(block, ctx);
    return pace ? Math.round((block.distanceMeters / 1000) * pace) : null;
  }
  return 0;
}

export function estimateBlockMeters(block: RunBlock, ctx: RunPaceContext): number | null {
  if (block.distanceMeters && block.distanceMeters > 0) return block.distanceMeters;
  if (block.durationSeconds && block.durationSeconds > 0) {
    const pace = estimatePaceFor(block, ctx);
    return pace ? Math.round((block.durationSeconds / pace) * 1000) : null;
  }
  return 0;
}

export interface RunTotals {
  /** Sum of all blocks (estimated where a block only has a distance); null if any block couldn't be estimated. */
  seconds: number | null;
  meters: number | null;
}

export function estimateRunTotals(blocks: readonly RunBlock[], ctx: RunPaceContext): RunTotals {
  let seconds: number | null = 0;
  let meters: number | null = 0;
  for (const b of blocks) {
    const s = estimateBlockSeconds(b, ctx);
    const m = estimateBlockMeters(b, ctx);
    seconds = seconds == null || s == null ? null : seconds + s;
    meters = meters == null || m == null ? null : meters + m;
  }
  return { seconds, meters };
}

// ── The main rep ─────────────────────────────────────────────────────────

function sameShape(a: RunBlock, b: RunBlock): boolean {
  return (
    a.type === b.type &&
    a.zoneType === b.zoneType &&
    (a.distanceMeters ?? 0) === (b.distanceMeters ?? 0) &&
    (a.durationSeconds ?? 0) === (b.durationSeconds ?? 0) &&
    (a.blockMode ?? 'pace') === (b.blockMode ?? 'pace')
  );
}

/** Work blocks of the main set — not wrappers, not rests, not warm-up/cool-down. */
export function coreWorkBlocks(blocks: readonly RunBlock[]): RunBlock[] {
  return blocks.filter(
    (b) =>
      !b._isDynamicWrapper &&
      !b._isSynthesizedRest &&
      (b.type === 'interval' || b.type === 'run'),
  );
}

export interface MainRep {
  block: RunBlock;
  /** How many reps share this exact shape. */
  count: number;
}

/** The most repeated work-block shape (first wins ties); null without work blocks. */
export function findMainRep(blocks: readonly RunBlock[]): MainRep | null {
  const work = coreWorkBlocks(blocks);
  let best: MainRep | null = null;
  const seen: MainRep[] = [];
  for (const b of work) {
    const hit = seen.find((g) => sameShape(g.block, b));
    if (hit) hit.count++;
    else seen.push({ block: b, count: 1 });
  }
  for (const g of seen) if (!best || g.count > best.count) best = g;
  return best;
}

export interface RepTarget {
  /** Target band (sec/km), null for effort blocks / no profile / legs under 400 m. */
  band: { min: number; max: number } | null;
  /** Middle of the band, sec/km ("4:50"). */
  paceSec: number | null;
  /** Expected time of one distance rep, seconds ("~1:56" per 400 m). */
  repSeconds: number | null;
}

/**
 * Target for one rep of the main set. Owner rule: legs under 400 m get no
 * pace — they keep only the expected rep time.
 */
export function repTarget(block: RunBlock, ctx: RunPaceContext): RepTarget {
  const band = blockTargetBand(block, ctx);
  const mid = band ? Math.round((band.min + band.max) / 2) : null;
  const repSeconds = mid && block.distanceMeters && block.distanceMeters > 0
    ? Math.round((block.distanceMeters / 1000) * mid)
    : null;
  if (isShortLeg(block)) return { band: null, paceSec: null, repSeconds };
  return { band, paceSec: mid, repSeconds };
}
