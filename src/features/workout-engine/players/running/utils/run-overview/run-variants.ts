/**
 * Run overview variant selector (board M-6a, enable_home_v2) — pure.
 *
 * Three versions of today's run: lighter · as planned · harder.
 *   • A repeated main set (6 × 400, 2 × 10′ tempo):
 *       ≥ 4 reps → ±2 reps            (4 × 400 · 6 × 400 · 8 × 400)
 *       2–3 reps → lighter = each rep 80 % (2 × 8′), harder = +1 rep (3 × 10′)
 *   • One steady main block (easy / long): the main time (or distance)
 *     scaled to a round 5 minutes — 35′ → 30′ / 45′.
 * Warm-up, strides and cool-down are never touched. New blocks get unique ids.
 * null when the workout has no main set to vary.
 */

import type { RunBlock } from '../../types/run-block.type';
import { isRestBlock } from '../../lib/planned-rep-results';
import { coreWorkBlocks, estimateBlockSeconds, findMainRep, type RunPaceContext } from '../run-preview/run-estimates';
import { blockPhase } from '../run-preview/run-strip';
import { blockSizeLabel, cleanBlockLabel } from '../run-preview/run-title';

export type RunVariantKey = 'lighter' | 'planned' | 'harder';
export const RUN_VARIANT_KEYS: readonly RunVariantKey[] = ['lighter', 'planned', 'harder'];

export interface RunVariant {
  key: RunVariantKey;
  blocks: RunBlock[];
  /** "4 × 400" / "2 × 8" / "30 דק׳" (the caller appends the minutes). */
  label: string;
  /** 1..3 — the bolts on the selector. */
  level: 1 | 2 | 3;
}

const LEVEL: Record<RunVariantKey, 1 | 2 | 3> = { lighter: 1, planned: 2, harder: 3 };

export function isRunVariantKey(v: unknown): v is RunVariantKey {
  return v === 'lighter' || v === 'planned' || v === 'harder';
}

/** "400 מ׳" → "400", "10 דק׳" → "10" (the selector drops the unit, board M-6a). */
export function bareSize(b: RunBlock): string {
  return blockSizeLabel(b).replace(/\s*(מ׳|דק׳|שנ׳|ק״מ)$/u, '').trim();
}

function sameShape(a: RunBlock, b: RunBlock): boolean {
  return (
    a.type === b.type &&
    a.zoneType === b.zoneType &&
    (a.distanceMeters ?? 0) === (b.distanceMeters ?? 0) &&
    (a.durationSeconds ?? 0) === (b.durationSeconds ?? 0) &&
    (a.blockMode ?? 'pace') === (b.blockMode ?? 'pace')
  );
}

let seq = 0;
const reId = (b: RunBlock, tag: string): RunBlock => ({ ...b, id: `${b.id}~${tag}${++seq}` });

interface RepeatRun {
  /** Index of each rep's work block, in order. */
  starts: number[];
  /** Index after the last rep's work block. */
  end: number;
}

/** The main rep's occurrences, when they form ONE contiguous, evenly spaced run (work [+ rests]). */
function findRepeatRun(blocks: readonly RunBlock[]): RepeatRun | null {
  const main = findMainRep(blocks.filter((b) => blockPhase(b) === 'main'));
  if (!main || main.count < 2) return null;
  const starts: number[] = [];
  blocks.forEach((b, i) => {
    if (blockPhase(b) === 'main' && !b._isSynthesizedRest && (b.type === 'interval' || b.type === 'run') && sameShape(b, main.block)) starts.push(i);
  });
  if (starts.length < 2) return null;
  const gap = starts[1] - starts[0];
  for (let i = 1; i < starts.length; i++) {
    if (starts[i] - starts[i - 1] !== gap) return null;
    // Between two reps only rests may sit.
    for (let j = starts[i - 1] + 1; j < starts[i]; j++) if (!isRestBlock(blocks[j])) return null;
  }
  return { starts, end: starts[starts.length - 1] + 1 };
}

function withReps(blocks: readonly RunBlock[], run: RepeatRun, reps: number, tag: string): RunBlock[] {
  const { starts, end } = run;
  const unit = blocks.slice(starts[0], starts[1]); // work + its rests
  const lastWork = blocks.slice(starts[starts.length - 1], end);
  const middle: RunBlock[] = [];
  for (let r = 0; r < reps - 1; r++) {
    const src = r < starts.length - 1 ? blocks.slice(starts[r], starts[r + 1]) : unit.map((b) => reId(b, tag));
    middle.push(...src);
  }
  middle.push(...lastWork);
  // Keep materializeWorkout's "(k/n)" rep suffix true for the new count.
  const work = blocks[starts[0]];
  let k = 0;
  const renumbered = middle.map((b) => {
    if (!sameShape(b, work) || b._isSynthesizedRest) return b;
    k += 1;
    return REP_SUFFIX.test(b.label) ? { ...b, label: `${cleanBlockLabel(b.label)} (${k}/${reps})` } : b;
  });
  return [...blocks.slice(0, starts[0]), ...renumbered, ...blocks.slice(end)];
}

const REP_SUFFIX = /\(\d+\/\d+\)\s*$/;

const roundTo = (n: number, step: number) => Math.max(step, Math.round(n / step) * step);

function scaleBlock(b: RunBlock, f: number): RunBlock {
  return {
    ...b,
    durationSeconds: b.durationSeconds != null ? roundTo(b.durationSeconds * f, 30) : undefined,
    distanceMeters: b.distanceMeters != null ? roundTo(b.distanceMeters * f, 100) : undefined,
  };
}

function repeatVariants(blocks: readonly RunBlock[], run: RepeatRun): RunVariant[] {
  const count = run.starts.length;
  const work = blocks[run.starts[0]];
  let lighter: RunBlock[];
  let lighterLabel: string;
  let harder: RunBlock[];
  let harderLabel: string;
  if (count >= 4) {
    lighter = withReps(blocks, run, count - 2, 'l');
    lighterLabel = `${count - 2} × ${bareSize(work)}`;
    harder = withReps(blocks, run, count + 2, 'h');
    harderLabel = `${count + 2} × ${bareSize(work)}`;
  } else {
    const repIdx = new Set(run.starts);
    lighter = blocks.map((b, i) => (repIdx.has(i) ? scaleBlock(b, 0.8) : b));
    lighterLabel = `${count} × ${bareSize(lighter[run.starts[0]])}`;
    harder = withReps(blocks, run, count + 1, 'h');
    harderLabel = `${count + 1} × ${bareSize(work)}`;
  }
  return [
    { key: 'lighter', blocks: lighter, label: lighterLabel, level: LEVEL.lighter },
    { key: 'planned', blocks: [...blocks], label: `${count} × ${bareSize(work)}`, level: LEVEL.planned },
    { key: 'harder', blocks: harder, label: harderLabel, level: LEVEL.harder },
  ];
}

function steadyVariants(blocks: readonly RunBlock[], ctx: RunPaceContext): RunVariant[] | null {
  const mainIdx = blocks.map((b, i) => (blockPhase(b) === 'main' && !isRestBlock(b) ? i : -1)).filter((i) => i >= 0);
  if (mainIdx.length === 0) return null;
  const mainSec = mainIdx.reduce((s, i) => s + (estimateBlockSeconds(blocks[i], ctx) ?? 0), 0);
  if (mainSec <= 0) return null;
  const plannedMin = Math.round(mainSec / 60);
  let lightMin = roundTo(plannedMin * 0.85, 5);
  let hardMin = roundTo(plannedMin * 1.3, 5);
  if (lightMin >= plannedMin) lightMin = Math.max(5, plannedMin - 5);
  if (hardMin <= plannedMin) hardMin = plannedMin + 5;
  const scaled = (min: number) => {
    const f = min / (mainSec / 60);
    const idx = new Set(mainIdx);
    return blocks.map((b, i) => (idx.has(i) ? scaleBlock(b, f) : b));
  };
  return [
    { key: 'lighter', blocks: scaled(lightMin), label: `${lightMin} דק׳`, level: LEVEL.lighter },
    { key: 'planned', blocks: [...blocks], label: `${plannedMin} דק׳`, level: LEVEL.planned },
    { key: 'harder', blocks: scaled(hardMin), label: `${hardMin} דק׳`, level: LEVEL.harder },
  ];
}

export function buildRunVariants(blocks: readonly RunBlock[], ctx: RunPaceContext): RunVariant[] | null {
  if (!blocks.length || coreWorkBlocks(blocks).length === 0) return null;
  const run = findRepeatRun(blocks);
  if (run) return repeatVariants(blocks, run);
  // A repeated set we can't vary safely (mixed / pyramid) → no selector.
  const main = findMainRep(blocks.filter((b) => blockPhase(b) === 'main'));
  if (main && main.count >= 2) return null;
  return steadyVariants(blocks, ctx);
}

/** The chosen variant's blocks applied to a workout (same object for 'planned' / no variants). */
export function applyRunVariant<W extends { blocks: RunBlock[] }>(
  workout: W,
  key: RunVariantKey | null | undefined,
  ctx: RunPaceContext,
): W {
  if (!key || key === 'planned') return workout;
  const v = buildRunVariants(workout.blocks, ctx)?.find((x) => x.key === key);
  return v ? { ...workout, blocks: v.blocks } : workout;
}
