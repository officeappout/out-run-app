/**
 * The runner's edits of today's run on the overview (boards M-6a, M-7a…7d,
 * enable_home_v2) and how they make the workout the player runs. Pure.
 *
 *   variant  קליל / מאוזן / עוצמתי — the plan's three main-set structures
 *   swap     a whole other main set ("החלף מקטע"); wins over the variant
 *            (the selector then shows the manual state)
 *   paces    per-target pace bands ("התאם קצב"), this workout only
 *
 * applyRunEdits: base → structure (swap, else variant) → paces. The same
 * function runs on the map before start and for an autoStart link, so what
 * the overview shows is what the player gets. The URL form keeps the edits
 * when home's overview hands over to the map.
 */

import type { RunBlock } from '../../types/run-block.type';
import type { RunPaceContext } from '../run-preview/run-estimates';
import { applyRunVariant, isRunVariantKey, type RunVariantKey } from './run-variants';
import { applyMainSet, decodeMainSet, encodeMainSet, mainSetTitle, readMainSet } from './run-main-set';
import { applyPaceOverrides, isPaceBand, type PaceBand, type PaceOverrides } from './run-pace-override';

export interface RunEdits {
  variant: RunVariantKey;
  /** encodeMainSet() of the swapped-in main set, or null. */
  swap: string | null;
  paces: PaceOverrides;
}

export const NO_RUN_EDITS: RunEdits = { variant: 'planned', swap: null, paces: {} };

/** Swap or pace edits ("מותאם"); a level alone is part of the plan. */
export function isCustomized(edits: RunEdits): boolean {
  return !!edits.swap || Object.keys(edits.paces).length > 0;
}

export function withVariant(edits: RunEdits, variant: RunVariantKey): RunEdits {
  // Picking a level returns to one of the plan's structures (board M-7c note).
  return { ...edits, variant, swap: null };
}

export function withSwap(edits: RunEdits, swap: string | null): RunEdits {
  return { ...edits, swap };
}

export function withPace(edits: RunEdits, key: string, band: PaceBand | null): RunEdits {
  const paces = { ...edits.paces };
  if (band) paces[key] = { min: Math.round(band.min), max: Math.round(band.max) };
  else delete paces[key];
  return { ...edits, paces };
}

/** The structure the overview shows: the swap applied to the planned set, else the variant. */
export function structureBlocks(base: readonly RunBlock[], edits: RunEdits, ctx: RunPaceContext): {
  blocks: RunBlock[];
  swap: { from: string; to: string } | null;
} {
  const spec = decodeMainSet(edits.swap);
  const src = spec ? readMainSet(base) : null;
  if (spec && src && spec.unit === src.spec.unit) {
    const before = readMainSet(applyRunVariant({ blocks: [...base] }, edits.variant, ctx).blocks);
    return {
      blocks: applyMainSet(base, src, spec),
      swap: { from: mainSetTitle((before ?? src).spec), to: mainSetTitle(spec) },
    };
  }
  return { blocks: applyRunVariant({ blocks: [...base] }, edits.variant, ctx).blocks, swap: null };
}

/** The workout as it will run (same object without edits). */
export function applyRunEdits<W extends { blocks: RunBlock[]; mainSwap?: { from: string; to: string } }>(
  workout: W,
  edits: RunEdits | null | undefined,
  ctx: RunPaceContext,
): W {
  if (!edits || (edits.variant === 'planned' && !isCustomized(edits))) return workout;
  const { blocks, swap } = structureBlocks(workout.blocks, edits, ctx);
  const out: W = { ...workout, blocks: applyPaceOverrides(blocks, edits.paces) };
  if (swap) out.mainSwap = swap;
  return out;
}

// ── URL form (home overview → map) ───────────────────────────────────────

/** "main.interval_short:280-290,warmup.easy:370-385". */
export function encodePaces(paces: PaceOverrides): string {
  return Object.keys(paces)
    .filter((k) => isPaceBand(paces[k]))
    .map((k) => `${k}:${Math.round(paces[k].min)}-${Math.round(paces[k].max)}`)
    .join(',');
}

export function decodePaces(raw: string | null | undefined): PaceOverrides {
  const out: Record<string, PaceBand> = {};
  for (const part of (raw ?? '').split(',')) {
    const m = /^([a-z]+\.[a-z_]+):(\d{2,4})-(\d{2,4})$/.exec(part.trim());
    if (!m) continue;
    const band = { min: Number(m[2]), max: Number(m[3]) };
    if (isPaceBand(band)) out[m[1]] = band;
  }
  return out;
}

export interface RunEditParams {
  variant?: string | null;
  swap?: string | null;
  pace?: string | null;
}

export function runEditsToParams(edits: RunEdits): Record<string, string> {
  const p: Record<string, string> = {};
  if (edits.variant !== 'planned') p.variant = edits.variant;
  if (edits.swap && decodeMainSet(edits.swap)) p.swap = edits.swap;
  const paces = encodePaces(edits.paces);
  if (paces) p.pace = paces;
  return p;
}

export function readRunEditParams(params: RunEditParams): RunEdits {
  const spec = decodeMainSet(params.swap);
  return {
    variant: isRunVariantKey(params.variant) ? params.variant : 'planned',
    swap: spec ? encodeMainSet(spec) : null,
    paces: decodePaces(params.pace),
  };
}
