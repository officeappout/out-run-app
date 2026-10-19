/**
 * The main set of a planned run as a small spec (board M-7b, enable_home_v2) —
 * read it from the blocks, write a different one back. Pure.
 *
 *   6 × 400 מ׳ · 90″  ⇄  { unit: 'm', reps: [400 ×6], recoverySec: 90 }
 *
 * Only a main set the variant selector can also read (findRepeatRun: one
 * contiguous, evenly spaced run of the same rep) has a spec. Writing keeps
 * the rep's own block (zone, mode, colour → the runner's paces), clones the
 * rest block for the recoveries, and leaves warm-up / strides / cool-down
 * untouched. The spec is URL-safe (`encodeMainSet`) so a swap chosen on
 * home's overview travels to the map with the link.
 */

import type { RunBlock } from '../../types/run-block.type';
import { isRestBlock } from '../../lib/planned-rep-results';
import { estimatePaceFor, WALK_PACE_SEC_PER_KM, type RunPaceContext } from '../run-preview/run-estimates';
import { cleanBlockLabel, fmtMeters, fmtSeconds } from '../run-preview/run-title';
import { findRepeatRun } from './run-variants';

export type MainSetUnit = 'm' | 's';

export interface MainSetSpec {
  /** Rep sizes are metres ('m') or seconds ('s'). */
  unit: MainSetUnit;
  /** One size per rep, in order ([400 ×6], or a pyramid [200, 400, 600, 400, 200]). */
  reps: number[];
  /** Recovery between two reps (none after the last). */
  recoverySec: number;
}

export interface MainSetSource {
  /** Index of the first rep's work block. */
  start: number;
  /** Index after the last rep's work block. */
  end: number;
  work: RunBlock;
  rest: RunBlock | null;
  spec: MainSetSpec;
}

const MAX_REPS = 20;

export function readMainSet(blocks: readonly RunBlock[]): MainSetSource | null {
  const run = findRepeatRun(blocks);
  if (!run) return null;
  const work = blocks[run.starts[0]];
  const unit: MainSetUnit | null = work.durationSeconds && work.durationSeconds > 0 ? 's'
    : work.distanceMeters && work.distanceMeters > 0 ? 'm' : null;
  if (!unit) return null;
  const size = unit === 's' ? work.durationSeconds! : work.distanceMeters!;
  const rests = blocks.slice(run.starts[0] + 1, run.starts[1]).filter(isRestBlock);
  const recoverySec = rests.reduce((s, b) => s + (b.durationSeconds && b.durationSeconds > 0
    ? b.durationSeconds
    : b.distanceMeters ? Math.round((b.distanceMeters / 1000) * WALK_PACE_SEC_PER_KM) : 0), 0);
  return { start: run.starts[0], end: run.end, work, rest: rests[0] ?? null, spec: { unit, reps: run.starts.map(() => size), recoverySec } };
}

// ── URL form ─────────────────────────────────────────────────────────────

/** "m:600.600.600.600~120". */
export function encodeMainSet(spec: MainSetSpec): string {
  return `${spec.unit}:${spec.reps.map((r) => Math.round(r)).join('.')}~${Math.round(spec.recoverySec)}`;
}

export function decodeMainSet(raw: string | null | undefined): MainSetSpec | null {
  const m = /^(m|s):(\d+(?:\.\d+)*)~(\d+)$/.exec(raw ?? '');
  if (!m) return null;
  const reps = m[2].split('.').map(Number);
  const recoverySec = Number(m[3]);
  if (reps.length < 1 || reps.length > MAX_REPS || reps.some((r) => !(r > 0) || r > 20000) || recoverySec > 900) return null;
  return { unit: m[1] as MainSetUnit, reps, recoverySec };
}

// ── Writing a spec ───────────────────────────────────────────────────────

const REP_SUFFIX = /\(\d+\/\d+\)\s*$/;

export function sizeLabel(unit: MainSetUnit, size: number): string {
  return unit === 'm' ? fmtMeters(size) : fmtSeconds(size);
}

function workLabel(src: MainSetSource, size: number, k: number, n: number): string {
  const clean = cleanBlockLabel(src.work.label);
  const sizeOnly = !clean || /^\d/.test(clean);
  const text = sizeOnly ? sizeLabel(src.spec.unit, size) : clean;
  return REP_SUFFIX.test(src.work.label) ? `${text} (${k}/${n})` : text;
}

function restBlock(src: MainSetSource, sec: number, i: number): RunBlock {
  if (src.rest) return { ...src.rest, id: `${src.rest.id}~x${i}`, durationSeconds: sec, distanceMeters: undefined };
  return { id: `${src.work.id}~xr${i}`, type: 'recovery', label: 'התאוששות', durationSeconds: sec, colorHex: '#94A3B8', _isSynthesizedRest: true };
}

/** The blocks with the main set replaced by `spec` (unchanged when the units differ). */
export function applyMainSet(blocks: readonly RunBlock[], src: MainSetSource, spec: MainSetSpec): RunBlock[] {
  if (spec.unit !== src.spec.unit || spec.reps.length === 0) return [...blocks];
  const n = spec.reps.length;
  const out: RunBlock[] = [];
  spec.reps.forEach((size, i) => {
    out.push({
      ...src.work,
      id: `${src.work.id}~x${i}`,
      label: workLabel(src, size, i + 1, n),
      distanceMeters: spec.unit === 'm' ? size : undefined,
      durationSeconds: spec.unit === 's' ? size : undefined,
    });
    if (i < n - 1 && spec.recoverySec > 0) out.push(restBlock(src, spec.recoverySec, i));
  });
  return [...blocks.slice(0, src.start), ...out, ...blocks.slice(src.end)];
}

// ── Reading a spec ───────────────────────────────────────────────────────

export function isUniform(spec: MainSetSpec): boolean {
  return spec.reps.every((r) => r === spec.reps[0]);
}

/** Up-and-down (200-400-600-400-200) vs. a ladder (400-800-1200). */
function shapeName(spec: MainSetSpec): string {
  const r = spec.reps;
  const peak = r.indexOf(Math.max(...r));
  return peak === r.length - 1 ? 'סולם' : 'פירמידה';
}

/** "4 × 600 מ׳" / "5 × 3 דק׳" / "פירמידה". */
export function mainSetTitle(spec: MainSetSpec): string {
  return isUniform(spec) ? `${spec.reps.length} × ${sizeLabel(spec.unit, spec.reps[0])}` : shapeName(spec);
}

/** 90 → "90″", 120 → "2′", 150 → "2:30′". */
export function recoveryText(sec: number): string {
  if (sec < 120 && sec % 60 !== 0) return `${sec}″`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s ? `${m}:${String(s).padStart(2, '0')}′` : `${m}′`;
}

/** Seconds of the main set at the runner's pace (reps + recoveries); null without a pace. */
export function mainSetSeconds(work: RunBlock, spec: MainSetSpec, ctx: RunPaceContext): number | null {
  let sec = spec.recoverySec * Math.max(0, spec.reps.length - 1);
  if (spec.unit === 's') return sec + spec.reps.reduce((a, r) => a + r, 0);
  const pace = estimatePaceFor({ ...work, durationSeconds: undefined, distanceMeters: 1000 }, ctx);
  if (!pace) return null;
  for (const r of spec.reps) sec += (r / 1000) * pace;
  return Math.round(sec);
}

export function mainSetVolume(spec: MainSetSpec): number {
  return spec.reps.reduce((a, r) => a + r, 0);
}
