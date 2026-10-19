/**
 * Planned run — per-rep results and the v2 live-screen helpers (pure, no React).
 *
 * One module feeds the live player (current rep vs target, the recovery
 * screen's last-rep chip, the session list's result boxes), the record
 * saved with the workout (`blockResults`, see PlannedBlockRecord) and the
 * summary's per-rep table — so the three can never disagree.
 *
 * Owner rule: legs shorter than 400 m get NO pace — not live, not stored,
 * not in the summary. They show distance left + time instead.
 */

import type { RunBlock } from '../types/run-block.type';
import type { ComputedPaceZone, RunZoneType } from '../../../core/types/running.types';
import type { PlannedBlockRecord } from '../../../core/services/storage.service';
import type { PlannedBlockResult } from '../../../core/services/pace-self-correction.service';

export type { PlannedBlockRecord };

// ── Thresholds ────────────────────────────────────────────────────────────

/** Legs shorter than this get no pace (owner rule). */
export const SHORT_LEG_METERS = 400;
/**
 * Time-based legs have no planned distance; under this many seconds they
 * are treated as short too (≈ 400 m even at a fast pace). Interpretation of
 * the 400 m rule for time-based blocks.
 */
export const SHORT_LEG_SECONDS = 90;
/** Below this much recorded movement an average pace is GPS noise. */
export const MIN_PACE_METERS = 50;

// ── Block classification ─────────────────────────────────────────────────

/** A "rep": the blocks the runner is judged on (not warm-up/cool-down/recovery/walk). */
export function isWorkBlock(b: RunBlock | null | undefined): boolean {
  if (!b || b._isSynthesizedRest) return false;
  return b.type === 'interval' || b.type === 'run';
}

/** Rest-like blocks — the live card shows the recovery countdown screen. */
export function isRestBlock(b: RunBlock | null | undefined): boolean {
  if (!b) return false;
  return !!b._isSynthesizedRest || b.type === 'recovery' || b.type === 'walk';
}

/** Under 400 m (or under 90 s when time-based) ⇒ no pace anywhere. */
export function isShortLeg(b: RunBlock | null | undefined): boolean {
  if (!b) return false;
  if (b.distanceMeters && b.distanceMeters > 0) return b.distanceMeters < SHORT_LEG_METERS;
  if (b.durationSeconds && b.durationSeconds > 0) return b.durationSeconds < SHORT_LEG_SECONDS;
  return false;
}

// ── Target pace ───────────────────────────────────────────────────────────

/**
 * Target band (sec/km) of a block — zone first, then the percentage rule.
 * Same resolution usePlannedRunEngine has always used; {0,0} = no target.
 */
export function resolveBlockTargetPace(
  block: RunBlock | null | undefined,
  basePace: number,
  zones: Record<RunZoneType, ComputedPaceZone> | null,
): { min: number; max: number } {
  if (!block || !(basePace > 0)) return { min: 0, max: 0 };
  if (block.zoneType && zones) {
    const z = zones[block.zoneType];
    if (z) return { min: z.minPace, max: z.maxPace };
  }
  if (block.targetPacePercentage) {
    return {
      min: Math.round((basePace * block.targetPacePercentage.min) / 100),
      max: Math.round((basePace * block.targetPacePercentage.max) / 100),
    };
  }
  return { min: 0, max: 0 };
}

// ── In-range classification ──────────────────────────────────────────────

export type PaceBand = 'in' | 'fast' | 'slow';

export interface PaceClass {
  band: PaceBand;
  /** Whole seconds outside the band: + slower, − faster, 0 inside. */
  deltaSec: number;
}

/**
 * Where a pace sits against its band, compared in WHOLE seconds (what the
 * runner sees: 4:58 vs a 4:55 max = "slow by 3"). null when either side is
 * missing.
 */
export function classifyPace(paceSec: number, minSec: number, maxSec: number): PaceClass | null {
  if (!(paceSec > 0) || !Number.isFinite(paceSec) || !(minSec > 0) || !(maxSec > 0)) return null;
  const p = Math.round(paceSec);
  const lo = Math.round(Math.min(minSec, maxSec));
  const hi = Math.round(Math.max(minSec, maxSec));
  if (p < lo) return { band: 'fast', deltaSec: p - lo };
  if (p > hi) return { band: 'slow', deltaSec: p - hi };
  return { band: 'in', deltaSec: 0 };
}

/** "בטווח" / "איטי ב-3 שנ׳" / "מהיר ב-4 שנ׳". */
export function paceClassText(c: PaceClass | null): string {
  if (!c) return '';
  if (c.band === 'in') return 'בטווח';
  const s = Math.abs(c.deltaSec);
  return c.band === 'slow' ? `איטי ב-${s} שנ׳` : `מהיר ב-${s} שנ׳`;
}

/** Colours of the three states (always paired with an icon + text in the UI). */
export const PACE_BAND_COLORS: Record<PaceBand, { fg: string; text: string; bg: string }> = {
  in: { fg: '#10b981', text: '#047857', bg: '#ecfdf5' },
  fast: { fg: '#f97316', text: '#c2410c', bg: '#fff7ed' },
  slow: { fg: '#e5484d', text: '#c0392b', bg: '#fdeceb' },
};

// ── Per-block records ─────────────────────────────────────────────────────

export type TargetResolver = (block: RunBlock) => { min: number; max: number };

/**
 * One record per finished block, in the order the runner did them. A block
 * jumped back to is counted once (first visit). `workOnly` keeps only reps —
 * what is saved with the workout. Records never hold `undefined` values.
 */
export function buildBlockRecords(
  blocks: readonly RunBlock[],
  results: readonly PlannedBlockResult[],
  resolveTarget: TargetResolver,
  { workOnly = true }: { workOnly?: boolean } = {},
): PlannedBlockRecord[] {
  const { byIndex: repNumber } = repNumbers(blocks);
  const seen = new Set<number>();
  const out: PlannedBlockRecord[] = [];
  for (const r of results) {
    const b = blocks[r.blockIndex];
    if (!b || seen.has(r.blockIndex)) continue;
    const work = isWorkBlock(b);
    if (workOnly && !work) continue;
    seen.add(r.blockIndex);
    out.push(blockRecord(b, r, repNumber.get(r.blockIndex) ?? 0, resolveTarget));
  }
  return out;
}

/** The record of one block from its actuals (also used for the live block). */
export function blockRecord(
  b: RunBlock,
  r: PlannedBlockResult,
  rep: number,
  resolveTarget: TargetResolver,
): PlannedBlockRecord {
  const seconds = Math.max(0, Math.round(Number.isFinite(r.elapsedSeconds) ? r.elapsedSeconds : 0));
  const meters = Math.max(0, Math.round(Number.isFinite(r.elapsedMeters) ? r.elapsedMeters : 0));
  const rec: PlannedBlockRecord = {
    blockIndex: r.blockIndex,
    rep,
    label: b.label ?? '',
    distanceMeters: meters,
    durationSeconds: seconds,
  };
  if (b.distanceMeters && b.distanceMeters > 0) rec.plannedDistanceMeters = b.distanceMeters;
  if (b.durationSeconds && b.durationSeconds > 0) rec.plannedDurationSeconds = b.durationSeconds;

  const paceScored = !isShortLeg(b) && (b.blockMode ?? 'pace') === 'pace' && !b._isSynthesizedRest;
  if (!paceScored) return rec;

  const t = resolveTarget(b);
  if (t.min > 0 && t.max > 0) {
    rec.targetMinPaceSec = Math.round(t.min);
    rec.targetMaxPaceSec = Math.round(t.max);
  }
  if (meters >= MIN_PACE_METERS && seconds > 0) {
    rec.avgPaceSec = Math.round(seconds / (meters / 1000));
    const c = rec.targetMinPaceSec ? classifyPace(rec.avgPaceSec, rec.targetMinPaceSec, rec.targetMaxPaceSec ?? 0) : null;
    if (c) {
      rec.inRange = c.band === 'in';
      rec.paceDeltaSec = c.deltaSec;
    }
  }
  return rec;
}

/** Band of a stored record, or null when it was not scored. */
export function recordClass(rec: PlannedBlockRecord): PaceClass | null {
  if (rec.inRange === undefined || rec.paceDeltaSec === undefined) return null;
  if (rec.inRange) return { band: 'in', deltaSec: 0 };
  return { band: rec.paceDeltaSec > 0 ? 'slow' : 'fast', deltaSec: rec.paceDeltaSec };
}

// ── Rep summary ───────────────────────────────────────────────────────────

export interface RepSummary {
  reps: number;
  /** Reps that had a target and an average pace. */
  scored: number;
  inRange: number;
  /** "5/6 בטווח", or null when nothing was scored. */
  label: string | null;
}

export function repSummary(records: readonly PlannedBlockRecord[] | null | undefined): RepSummary {
  const list = records ?? [];
  const scored = list.filter((r) => r.inRange !== undefined);
  const inRange = scored.filter((r) => r.inRange).length;
  return {
    reps: list.length,
    scored: scored.length,
    inRange,
    label: scored.length > 0 ? `${inRange}/${scored.length} בטווח` : null,
  };
}

// ── Live pace scale ───────────────────────────────────────────────────────

export interface PaceScaleGeometry {
  /** Left edge of the target band, % of the track (left = fast). */
  bandLeft: number;
  bandWidth: number;
  /** Marker position %, or null without a current pace. */
  marker: number | null;
}

/**
 * Track geometry for the fast ↔ slow scale: the band sits in the middle
 * with twice its width (min 20 s) of room on each side; the marker clamps
 * to the track ends.
 */
export function paceScaleGeometry(minSec: number, maxSec: number, currentSec: number): PaceScaleGeometry {
  const lo0 = Math.min(minSec, maxSec);
  const hi0 = Math.max(minSec, maxSec);
  const range = Math.max(1, hi0 - lo0);
  const pad = Math.max(range * 2, 20);
  const lo = lo0 - pad;
  const total = range + 2 * pad;
  const marker =
    currentSec > 0 && Number.isFinite(currentSec)
      ? Math.max(0, Math.min(100, ((currentSec - lo) / total) * 100))
      : null;
  return { bandLeft: (pad / total) * 100, bandWidth: (range / total) * 100, marker };
}

// ── v2 block colours (one palette for bars, cart ring, list rails) ────────

export const V2_BLOCK_COLORS = {
  wrapper: '#bfe48a',
  easy: '#84cc16',
  fast: '#e5484d',
  tempo: '#f97316',
  rest: '#a9b7c2',
  walk: '#f59e0b',
} as const;

function zoneColor(z: RunZoneType | undefined): string | null {
  switch (z) {
    case 'tempo':
    case 'fartlek_medium':
      return V2_BLOCK_COLORS.tempo;
    case 'interval_long':
    case 'interval_short':
    case 'sprint':
    case 'fartlek_fast':
      return V2_BLOCK_COLORS.fast;
    case 'easy':
    case 'long_run':
    case 'jogging':
      return V2_BLOCK_COLORS.easy;
    case 'recovery':
      return V2_BLOCK_COLORS.rest;
    case 'walk':
      return V2_BLOCK_COLORS.walk;
    default:
      return null;
  }
}

/** The approved flows palette (runcanvas NOTES "One palette on every board"). */
export function v2BlockColor(b: RunBlock): string {
  if (b._isSynthesizedRest || b.type === 'recovery') return V2_BLOCK_COLORS.rest;
  if (b.type === 'warmup' || b.type === 'cooldown') return V2_BLOCK_COLORS.wrapper;
  if (b.type === 'walk') return V2_BLOCK_COLORS.walk;
  if (b.type === 'interval') return zoneColor(b.zoneType) ?? V2_BLOCK_COLORS.fast;
  return zoneColor(b.zoneType) ?? V2_BLOCK_COLORS.easy;
}

// ── Session sections (the list layer behind the player) ──────────────────

export interface PlanSections {
  /** Block indices before the first rep. */
  warmup: number[];
  /** First rep … last rep (recoveries in between included). */
  main: number[];
  /** After the last rep. */
  cooldown: number[];
}

export function planSections(blocks: readonly RunBlock[]): PlanSections {
  const work = blocks.map((b, i) => (isWorkBlock(b) ? i : -1)).filter((i) => i >= 0);
  const all = blocks.map((_, i) => i);
  if (work.length === 0) return { warmup: [], main: all, cooldown: [] };
  const first = work[0];
  const last = work[work.length - 1];
  return {
    warmup: all.filter((i) => i < first),
    main: all.filter((i) => i >= first && i <= last),
    cooldown: all.filter((i) => i > last),
  };
}

/** 1-based rep number of every work block (index → rep), and the total. */
export function repNumbers(blocks: readonly RunBlock[]): { byIndex: Map<number, number>; total: number } {
  const byIndex = new Map<number, number>();
  let n = 0;
  blocks.forEach((b, i) => {
    if (isWorkBlock(b)) byIndex.set(i, ++n);
  });
  return { byIndex, total: n };
}

// ── Formatting ────────────────────────────────────────────────────────────

/** sec/km → "4:51". */
export function fmtPace(sec: number | null | undefined): string {
  if (!sec || !Number.isFinite(sec) || sec <= 0) return '--:--';
  let m = Math.floor(sec / 60);
  let s = Math.round(sec % 60);
  if (s === 60) {
    m += 1;
    s = 0;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** seconds → "0:58" / "1:02:03". */
export function fmtClock(sec: number | null | undefined): string {
  const t = Number.isFinite(sec) && (sec as number) > 0 ? Math.floor(sec as number) : 0;
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

/** metres → "400 מ׳" / "1.2 ק״מ". */
export function fmtDistance(m: number | null | undefined): string {
  const v = Number.isFinite(m) && (m as number) > 0 ? (m as number) : 0;
  if (v >= 1000) return `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)} ק״מ`;
  return `${Math.round(v)} מ׳`;
}

/** "4:45–4:55". */
export function fmtBand(minSec?: number, maxSec?: number): string {
  if (!minSec || !maxSec) return '';
  return `${fmtPace(minSec)}–${fmtPace(maxSec)}`;
}

// ── Live card mode ────────────────────────────────────────────────────────

/**
 * What the v2 live card leads with for the current block:
 *   recovery  — rest / recovery / walk: big countdown + next-rep card
 *   short     — leg under 400 m: distance left + time, NO pace (owner rule)
 *   effort    — effort-mode block: remaining + effort level, no band
 *   pace      — pace block with a target band: pace huge + the scale
 *   pace_free — pace block without a band (no basePace): pace huge only
 */
export type LiveCardMode = 'none' | 'recovery' | 'short' | 'effort' | 'pace' | 'pace_free';

export function liveCardMode(b: RunBlock | null | undefined, hasTarget: boolean): LiveCardMode {
  if (!b) return 'none';
  if (isRestBlock(b)) return 'recovery';
  if (isShortLeg(b)) return 'short';
  if ((b.blockMode ?? 'pace') === 'effort') return 'effort';
  return hasTarget ? 'pace' : 'pace_free';
}

const LABEL_MAP: Record<string, string> = {
  surge: 'ספרינט',
  sprint: 'ספרינט',
  recovery: 'התאוששות',
  warmup: 'חימום',
  'warm-up': 'חימום',
  cooldown: 'שחרור',
  'cool-down': 'שחרור',
  run: 'ריצה',
  walk: 'הליכה',
  strides: 'מתגברות',
};

/** Hebrew display name for template labels that arrive in English. */
export function blockDisplayLabel(b: RunBlock): string {
  const raw = (b.label ?? '').trim();
  const lower = raw.toLowerCase();
  for (const [eng, heb] of Object.entries(LABEL_MAP)) {
    if (lower.startsWith(eng)) return heb;
  }
  if (raw) return raw;
  return b.type === 'warmup' ? 'חימום' : b.type === 'cooldown' ? 'שחרור' : b._isSynthesizedRest || b.type === 'recovery' ? 'התאוששות' : 'ריצה';
}

// ── Block advance ─────────────────────────────────────────────────────────

/**
 * Where advanceBlock moves the plan: the next index — `total` (one past the
 * last block) means the plan is COMPLETE, which usePlannedRunEngine reports
 * as isWorkoutComplete and PlannedRunActive auto-finishes on. null = nothing
 * to advance (no blocks, or already complete).
 */
export function advanceTarget(currentIndex: number, total: number): number | null {
  if (!(total > 0) || currentIndex >= total) return null;
  return Math.max(0, currentIndex) + 1;
}
