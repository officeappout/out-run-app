/**
 * Intensity profile strip — one bar per block, width = minutes, height =
 * effort, colour = the v2 block palette (pure).
 *
 * Colours come from v2BlockColor (the approved flows palette the live
 * player already paints with), except rests: on a white card they use the
 * light #dfe7ed of the R1 boards (#a9b7c2 is for the story-bar track).
 */

import type { RunBlock } from '../../types/run-block.type';
import { isRestBlock, v2BlockColor } from '../../lib/planned-rep-results';
import { isStrideBlock } from './run-sections';
import { estimateBlockSeconds, type RunPaceContext } from './run-estimates';
import { roundMinutes } from './run-title';

export const STRIP_REST_COLOR = '#dfe7ed';

export type RunPhase = 'warmup' | 'main' | 'cooldown';

/** Warm-up = warm-up blocks + every dynamic wrapper before the core (strides too); cool-down = cool-down blocks. */
export function blockPhase(b: RunBlock): RunPhase {
  if (b.type === 'cooldown') return 'cooldown';
  if (b.type === 'warmup' || b._isDynamicWrapper) return 'warmup';
  return 'main';
}

/** Bar height 0–100 by effort. */
export function intensityHeight(b: RunBlock): number {
  if (isRestBlock(b)) return 22;
  if (b.type === 'warmup' || b.type === 'cooldown') return 40;
  if (isStrideBlock(b)) return 80;
  if ((b.blockMode ?? 'pace') === 'effort') {
    const lvl = b.effortConfig?.effortLevel;
    return lvl === 'max' ? 100 : lvl === 'hard' ? 85 : 55;
  }
  switch (b.zoneType) {
    case 'sprint':
    case 'interval_short':
      return 100;
    case 'interval_long':
    case 'fartlek_fast':
      return 88;
    case 'tempo':
    case 'fartlek_medium':
      return 75;
    case 'walk':
      return 30;
    default:
      return b.type === 'interval' ? 100 : 55;
  }
}

export function stripColor(b: RunBlock): string {
  return isRestBlock(b) ? STRIP_REST_COLOR : v2BlockColor(b);
}

export interface StripSegment {
  key: string;
  color: string;
  /** flex-grow — minutes, at least 0.4 so a 20″ stride still shows. */
  flex: number;
  /** 0–100. */
  height: number;
  phase: RunPhase;
}

export function buildIntensityStrip(blocks: readonly RunBlock[], ctx: RunPaceContext): StripSegment[] {
  return blocks.map((b, i) => {
    const seconds = estimateBlockSeconds(b, ctx) ?? 60;
    return {
      key: b.id || String(i),
      color: stripColor(b),
      flex: Math.max(0.4, Math.round((seconds / 60) * 10) / 10),
      height: intensityHeight(b),
      phase: blockPhase(b),
    };
  });
}

/** Minutes per phase (estimated). */
export function phaseMinutes(blocks: readonly RunBlock[], ctx: RunPaceContext): Record<RunPhase, number> {
  const sec: Record<RunPhase, number> = { warmup: 0, main: 0, cooldown: 0 };
  for (const b of blocks) sec[blockPhase(b)] += estimateBlockSeconds(b, ctx) ?? 0;
  return { warmup: roundMinutes(sec.warmup), main: roundMinutes(sec.main), cooldown: roundMinutes(sec.cooldown) };
}

/**
 * The labels under the strip: "חימום · 12′" · "עיקר · 6 חזרות" · "שחרור · 8′".
 * `mainLabel` is the middle one's name (kind-specific, e.g. "טמפו").
 */
export function stripPhaseLabels(
  blocks: readonly RunBlock[],
  ctx: RunPaceContext,
  opts: { reps: number; mainLabel?: string },
): string[] {
  const m = phaseMinutes(blocks, ctx);
  const out: string[] = [];
  if (m.warmup > 0) out.push(`חימום · ${m.warmup}′`);
  if (m.main > 0) out.push(opts.reps >= 2 ? `עיקר · ${opts.reps} חזרות` : `${opts.mainLabel ?? 'עיקר'} · ${m.main}′`);
  if (m.cooldown > 0) out.push(`שחרור · ${m.cooldown}′`);
  return out;
}
