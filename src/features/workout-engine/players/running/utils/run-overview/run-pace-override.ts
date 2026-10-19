/**
 * "התאם קצב" — the run overview's per-workout pace edit (board M-7a,
 * enable_home_v2). Pure.
 *
 * A pace on the axis belongs to a TARGET: the phase + zone of the blocks it
 * describes ("main.interval_short" = every rep of the main set). The runner
 * nudges the band ±5″; the override is written onto those blocks as
 * `RunBlock.paceOverride` (resolveBlockTargetPace honours it, so the live
 * player targets it) — for this workout only, never the profile.
 *
 * The personal range is the planned band with 5″ of slack each side
 * (4:45–4:55 → 4:40–5:00); outside it the sheet warns but still saves.
 */

import type { RunBlock } from '../../types/run-block.type';
import { isRestBlock, isShortLeg } from '../../lib/planned-rep-results';
import { blockTargetBand, type RunPaceContext } from '../run-preview/run-estimates';
import { blockPhase } from '../run-preview/run-strip';
import { blockSizeLabel } from '../run-preview/run-title';

/** sec/km; min = the faster end. */
export interface PaceBand { min: number; max: number }
/** Target key → the runner's band. */
export type PaceOverrides = Readonly<Record<string, PaceBand>>;

export const PACE_STEP_SEC = 5;
export const PERSONAL_SLACK_SEC = 5;
/** Never edit past 2:00 or 15:00 per km. */
const FASTEST = 120;
const SLOWEST = 900;

export function isPaceBand(v: unknown): v is PaceBand {
  const b = v as PaceBand | null;
  return !!b && typeof b === 'object' && Number.isFinite(b.min) && Number.isFinite(b.max) && b.min > 0 && b.max >= b.min;
}

export function sameBand(a: PaceBand | null | undefined, b: PaceBand | null | undefined): boolean {
  return !!a && !!b && Math.round(a.min) === Math.round(b.min) && Math.round(a.max) === Math.round(b.max);
}

/** The edit target of a block ("warmup.easy", "main.interval_short"); null for rests / effort blocks. */
export function paceTargetKey(b: RunBlock | null | undefined): string | null {
  if (!b || isRestBlock(b) || (b.blockMode ?? 'pace') === 'effort') return null;
  return `${blockPhase(b)}.${b.zoneType ?? 'x'}`;
}

/** Both ends moved by `deltaSec` (− = faster), kept inside 2:00–15:00 /km. */
export function shiftBand(band: PaceBand, deltaSec: number): PaceBand {
  const width = band.max - band.min;
  const min = Math.min(SLOWEST - width, Math.max(FASTEST, Math.round(band.min + deltaSec)));
  return { min, max: min + width };
}

/** The runner's acceptable range around a planned band (±5″). */
export function personalRange(planned: PaceBand): PaceBand {
  return { min: planned.min - PERSONAL_SLACK_SEC, max: planned.max + PERSONAL_SLACK_SEC };
}

/** 'fast' / 'slow' when the band leaves the personal range; null inside. */
export function paceVerdict(band: PaceBand, range: PaceBand): 'fast' | 'slow' | null {
  if (band.min < range.min) return 'fast';
  if (band.max > range.max) return 'slow';
  return null;
}

export interface ZoneBarSpan { right: number; width: number }

/**
 * The sheet's zone bar (RTL: fast on the right): the personal range and the
 * chosen band as percent spans of a track that covers both with 30″ margin.
 */
export function paceZoneBar(range: PaceBand, band: PaceBand): { range: ZoneBarSpan; band: ZoneBarSpan } {
  const lo = Math.min(range.min, band.min) - 30;
  const hi = Math.max(range.max, band.max) + 30;
  const pct = (p: number) => ((p - lo) / (hi - lo)) * 100;
  const span = (b: PaceBand, minWidth: number): ZoneBarSpan => ({
    right: Math.round(pct(b.min) * 10) / 10,
    width: Math.round(Math.max(minWidth, pct(b.max) - pct(b.min)) * 10) / 10,
  });
  return { range: span(range, 2), band: span(band, 6) };
}

/** Blocks with the overrides written on (same array when there are none). */
export function applyPaceOverrides(blocks: RunBlock[], overrides: PaceOverrides | null | undefined): RunBlock[] {
  const keys = overrides ? Object.keys(overrides).filter((k) => isPaceBand(overrides[k])) : [];
  if (keys.length === 0) return blocks;
  return blocks.map((b) => {
    const k = paceTargetKey(b);
    if (!k || !keys.includes(k)) return b;
    const o = overrides![k];
    return { ...b, paceOverride: { min: Math.round(o.min), max: Math.round(o.max) } };
  });
}

export function hasPaceOverride(blocks: readonly RunBlock[] | null | undefined): boolean {
  return !!blocks?.some((b) => isPaceBand(b.paceOverride));
}

/** Distinct overridden bands by target, in plan order (runMeta.paceOverrides). */
export function paceOverridesOf(blocks: readonly RunBlock[]): { key: string; minPaceSec: number; maxPaceSec: number }[] {
  const out: { key: string; minPaceSec: number; maxPaceSec: number }[] = [];
  for (const b of blocks) {
    const k = paceTargetKey(b);
    if (!k || !isPaceBand(b.paceOverride) || out.some((o) => o.key === k)) continue;
    out.push({ key: k, minPaceSec: Math.round(b.paceOverride.min), maxPaceSec: Math.round(b.paceOverride.max) });
  }
  return out;
}

export interface PaceEditTarget {
  key: string;
  /** The plan's band for this target (the reset value). */
  planned: PaceBand;
  /** What the workout runs now (the override, else planned). */
  current: PaceBand;
  edited: boolean;
  /** "חזרות 400 מ׳ · 6 ×" / "חימום" / "שחרור" / "ריצה". */
  subtitle: string;
  /** One rep's distance, for "~1:50 לחזרה" (distance reps only). */
  repMeters: number | null;
}

/**
 * Everything the sheet needs for one target, from the workout as it will
 * run (`blocks`, overrides applied) — null when the target has no band.
 */
export function paceEditTarget(blocks: readonly RunBlock[], key: string, ctx: RunPaceContext): PaceEditTarget | null {
  const own = blocks.filter((b) => paceTargetKey(b) === key);
  const first = own.find((b) => !isShortLeg(b)) ?? own[0];
  if (!first) return null;
  const planned = blockTargetBand({ ...first, paceOverride: undefined }, ctx);
  if (!planned) return null;
  const current = isPaceBand(first.paceOverride) ? { ...first.paceOverride } : planned;
  const phase = blockPhase(first);
  const sizes = Array.from(new Set(own.map((b) => blockSizeLabel(b))));
  let subtitle = phase === 'warmup' ? 'חימום' : phase === 'cooldown' ? 'שחרור' : 'ריצה';
  if (phase === 'main' && own.length > 1) subtitle = sizes.length === 1 ? `חזרות ${sizes[0]} · ${own.length} ×` : `חזרות · ${own.length} ×`;
  const uniformMeters = own.every((b) => b.distanceMeters && !b.durationSeconds && b.distanceMeters === first.distanceMeters);
  return {
    key,
    planned,
    current,
    edited: !sameBand(current, planned),
    subtitle,
    repMeters: phase === 'main' && uniformMeters ? first.distanceMeters ?? null : null,
  };
}
