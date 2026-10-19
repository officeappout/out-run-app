/**
 * Continuous run (free run · planned easy / tempo / long) — the v2 live
 * player's pure logic (no React). Boards R2-prop-easy, U-B1…U-B3, U-C1/C2.
 *
 *   • which planned runs are "continuous" (one steady block, wrappers aside)
 *   • the planned zone handed to the continuous UI
 *   • a SMOOTHED "in zone" flag — 15 s rolling pace + hysteresis, so a GPS
 *     wobble at the band edge never makes the chip flicker
 *   • the time-in-zone accumulator
 *   • the swipe pages and the hero metric
 *   • lap rows for the list behind the player (no pace under 400 m)
 *
 * Owner rule (shared with planned-rep-results): legs shorter than 400 m get
 * no pace anywhere.
 */

import type { RunBlock } from '../types/run-block.type';
import type { ComputedPaceZone, RunZoneType } from '../../../core/types/running.types';
import {
  SHORT_LEG_METERS,
  V2_BLOCK_COLORS,
  blockDisplayLabel,
  fmtClock,
  fmtDistance,
  fmtPace,
  isShortLeg,
  resolveBlockTargetPace,
  v2BlockColor,
} from './planned-rep-results';

// ── Which plans are continuous ────────────────────────────────────────────

/** Warm-up / cool-down / auto-injected wrappers (strides included) and synthesized rests. */
export function isWrapperBlock(b: RunBlock): boolean {
  return b.type === 'warmup' || b.type === 'cooldown' || !!b._isDynamicWrapper || !!b._isSynthesizedRest;
}

/**
 * Index of the plan's single steady block, or -1 when the plan is not
 * continuous. Continuous = after dropping the wrappers exactly ONE block is
 * left, it is a run (or a single interval-typed block, e.g. a race-pace
 * tempo), paced (not effort), and not a short leg.
 */
export function continuousMainIndex(blocks: readonly RunBlock[] | null | undefined): number {
  if (!blocks || blocks.length === 0) return -1;
  const core = blocks.map((b, i) => (isWrapperBlock(b) ? -1 : i)).filter((i) => i >= 0);
  if (core.length !== 1) return -1;
  const b = blocks[core[0]];
  if (b.type !== 'run' && b.type !== 'interval') return -1;
  if ((b.blockMode ?? 'pace') === 'effort') return -1;
  if (isShortLeg(b)) return -1;
  return core[0];
}

export function isContinuousPlan(blocks: readonly RunBlock[] | null | undefined): boolean {
  return continuousMainIndex(blocks) >= 0;
}

/**
 * Readable text colour (on white) for a block's v2 colour — the palette's
 * light greens / ambers fail contrast as text, so each maps to its dark step.
 */
export function v2BlockTextColor(b: RunBlock): string {
  switch (v2BlockColor(b)) {
    case V2_BLOCK_COLORS.wrapper:
    case V2_BLOCK_COLORS.easy:
      return '#4d7c0f';
    case V2_BLOCK_COLORS.tempo:
      return '#c2410c';
    case V2_BLOCK_COLORS.fast:
      return '#c0392b';
    case V2_BLOCK_COLORS.walk:
      return '#b45309';
    default:
      return '#4b5a66';
  }
}

// ── The planned zone ─────────────────────────────────────────────────────

export interface ZoneTarget {
  /** sec/km, min < max. */
  minSec: number;
  maxSec: number;
  /** "ריצה קלה" / "טמפו" … */
  label: string;
  /** Profile-3 runners see the zone name, never the numbers. */
  showNumbers: boolean;
}

const ZONE_LABELS: Partial<Record<RunZoneType, string>> = {
  walk: 'הליכה',
  jogging: 'ג׳וגינג',
  recovery: 'התאוששות',
  easy: 'ריצה קלה',
  long_run: 'ריצה ארוכה',
  fartlek_medium: 'פארטלק',
  tempo: 'טמפו',
  fartlek_fast: 'פארטלק מהיר',
  interval_long: 'אינטרוול',
  interval_short: 'אינטרוול',
  sprint: 'ספרינט',
};

/** Hebrew name of a zone type ("ריצה קלה", "טמפו"), or null when unknown. */
export function zoneTypeLabel(z: RunZoneType | null | undefined): string | null {
  return (z && ZONE_LABELS[z]) || null;
}

export function zoneLabel(b: RunBlock): string {
  return (b.zoneType && ZONE_LABELS[b.zoneType]) || blockDisplayLabel(b);
}

/**
 * The target zone of a block for the continuous UI, or null (no base pace,
 * effort block, short leg, synthesized rest — nothing to judge against).
 */
export function continuousZone(
  b: RunBlock | null | undefined,
  basePace: number,
  zones: Record<RunZoneType, ComputedPaceZone> | null,
  showNumbers: boolean,
): ZoneTarget | null {
  if (!b || b._isSynthesizedRest || isShortLeg(b) || (b.blockMode ?? 'pace') === 'effort') return null;
  const t = resolveBlockTargetPace(b, basePace, zones);
  if (!(t.min > 0) || !(t.max > 0)) return null;
  return {
    minSec: Math.min(t.min, t.max),
    maxSec: Math.max(t.min, t.max),
    label: zoneLabel(b),
    showNumbers,
  };
}

// ── Smoothed "in zone" (rolling pace + hysteresis) ───────────────────────

export type ZoneStatus = 'unknown' | 'in' | 'fast' | 'slow';

export interface ZoneTrackerOptions {
  /** Rolling window, in ACTIVE seconds (pauses don't age it). Default 15. */
  windowSec: number;
  /** Samples needed in the window before any verdict. Default 5. */
  minSamples: number;
  /** Once in the zone, leave only when the rolling pace is this many s/km beyond the band. Default 5. */
  hysteresisSec: number;
}

export const ZONE_TRACKER_DEFAULTS: ZoneTrackerOptions = { windowSec: 15, minSamples: 5, hysteresisSec: 5 };

export interface ZoneTrackerState {
  samples: { t: number; paceSec: number }[];
  /** Mean pace over the window (sec/km), null without valid samples. */
  rollingPaceSec: number | null;
  status: ZoneStatus;
}

export function createZoneTracker(): ZoneTrackerState {
  return { samples: [], rollingPaceSec: null, status: 'unknown' };
}

/** Plausible running/walking pace: 2:00–20:00 per km. Anything else is GPS noise / standing. */
export function isValidPace(paceSec: number): boolean {
  return Number.isFinite(paceSec) && paceSec >= 120 && paceSec <= 1200;
}

/** Status transition with hysteresis (pure; exported for tests). */
export function nextZoneStatus(prev: ZoneStatus, rolling: number, zone: ZoneTarget, hysteresisSec: number): ZoneStatus {
  const { minSec: lo, maxSec: hi } = zone;
  if (prev === 'in') {
    if (rolling < lo - hysteresisSec) return 'fast';
    if (rolling > hi + hysteresisSec) return 'slow';
    return 'in';
  }
  if (rolling >= lo && rolling <= hi) return 'in';
  return rolling < lo ? 'fast' : 'slow';
}

/**
 * Feed one pace sample (t = active seconds of the session). Invalid paces
 * are dropped (they age out instead of dragging the mean). Without a zone
 * the status stays 'unknown' but the rolling pace is still kept.
 */
export function pushPaceSample(
  state: ZoneTrackerState,
  t: number,
  paceSec: number,
  zone: ZoneTarget | null,
  opts: ZoneTrackerOptions = ZONE_TRACKER_DEFAULTS,
): ZoneTrackerState {
  const samples = state.samples.filter((s) => s.t > t - opts.windowSec && s.t <= t);
  if (isValidPace(paceSec)) samples.push({ t, paceSec });
  if (samples.length === 0) return { samples, rollingPaceSec: null, status: 'unknown' };
  const rolling = samples.reduce((a, s) => a + s.paceSec, 0) / samples.length;
  if (!zone || samples.length < opts.minSamples) {
    return { samples, rollingPaceSec: rolling, status: zone && state.status !== 'unknown' ? state.status : 'unknown' };
  }
  return { samples, rollingPaceSec: rolling, status: nextZoneStatus(state.status, rolling, zone, opts.hysteresisSec) };
}

/** Whole seconds outside the band for the chip ("איטי ב-6 שנ׳"); 0 inside. */
export function zoneDeltaSec(status: ZoneStatus, rolling: number | null, zone: ZoneTarget | null): number {
  if (!zone || rolling === null || status === 'in' || status === 'unknown') return 0;
  return status === 'fast' ? Math.round(zone.minSec - rolling) : Math.round(rolling - zone.maxSec);
}

/** Chip text for a smoothed status. */
export function zoneStatusText(status: ZoneStatus, rolling: number | null, zone: ZoneTarget | null): string {
  if (!zone || status === 'unknown') return '';
  if (status === 'in') return `בטווח · ${zone.label}`;
  const d = Math.max(1, zoneDeltaSec(status, rolling, zone));
  return status === 'fast' ? `מהיר ב-${d} שנ׳` : `איטי ב-${d} שנ׳`;
}

// ── Time in zone ─────────────────────────────────────────────────────────

export interface ZoneTimeAcc {
  /** Seconds with a verdict (status ≠ unknown). */
  scoredSec: number;
  /** Seconds in the zone. */
  inSec: number;
}

export const EMPTY_ZONE_TIME: ZoneTimeAcc = { scoredSec: 0, inSec: 0 };

/** Add dt active seconds (clamped 0–5, so a frozen tab can't add minutes at once). */
export function accumulateZoneTime(acc: ZoneTimeAcc, status: ZoneStatus, dtSec: number): ZoneTimeAcc {
  const dt = Number.isFinite(dtSec) ? Math.max(0, Math.min(5, dtSec)) : 0;
  if (dt === 0 || status === 'unknown') return acc;
  return { scoredSec: acc.scoredSec + dt, inSec: acc.inSec + (status === 'in' ? dt : 0) };
}

/** The store / run-summary shape (`useRunningPlayer.timeInZone`, runMeta.timeInZone): scored seconds = totalSec. */
export function toTimeInZone(acc: ZoneTimeAcc): { inSec: number; totalSec: number } {
  return { inSec: acc.inSec, totalSec: acc.scoredSec };
}

/** 0–100, or null before 10 scored seconds. */
export function zoneTimePercent(acc: ZoneTimeAcc): number | null {
  if (acc.scoredSec < 10) return null;
  return Math.round((acc.inSec / acc.scoredSec) * 100);
}

// ── Swipe pages ──────────────────────────────────────────────────────────

export type ContinuousPage = 'main' | 'pace' | 'distance';

/** The pace page only exists when a live pace may be shown (not on legs under 400 m). */
export function continuousPages(showLivePace: boolean): ContinuousPage[] {
  return showLivePace ? ['main', 'pace', 'distance'] : ['main', 'distance'];
}

/**
 * Page after a horizontal swipe (RTL: page 1 sits on the right, so dragging
 * the card RIGHTWARDS reveals the next page). Clamped, never wraps.
 */
export function swipePage(page: number, count: number, offsetX: number, velocityX: number): number {
  const last = Math.max(0, count - 1);
  let p = Math.max(0, Math.min(last, page));
  if (offsetX > 50 || velocityX > 500) p = Math.min(last, p + 1);
  else if (offsetX < -50 || velocityX < -500) p = Math.max(0, p - 1);
  return p;
}

/** Keeps the page in range when the page list shrinks (e.g. entering a short leg). */
export function clampPage(page: number, count: number): number {
  return Math.max(0, Math.min(Math.max(0, count - 1), page));
}

// ── Hero metric + goal ───────────────────────────────────────────────────

export interface ContinuousGoal {
  type: 'time' | 'distance';
  /** seconds or km. */
  target: number;
  /** seconds or km so far. */
  current: number;
}

/** Big number on the main page: the goal's own dimension; no goal ⇒ distance (today's free-run hero). */
export function heroKind(goal: ContinuousGoal | null): 'time' | 'distance' {
  return goal?.type === 'time' ? 'time' : 'distance';
}

/** Goal of a planned block (time- or distance-based), from its live elapsed values. */
export function blockGoal(b: RunBlock | null | undefined, elapsedSec: number, elapsedMeters: number): ContinuousGoal | null {
  if (!b) return null;
  if (b.durationSeconds && b.durationSeconds > 0) return { type: 'time', target: b.durationSeconds, current: Math.max(0, elapsedSec) };
  if (b.distanceMeters && b.distanceMeters > 0) {
    return { type: 'distance', target: b.distanceMeters / 1000, current: Math.max(0, elapsedMeters) / 1000 };
  }
  return null;
}

export interface GoalView {
  /** "יעד 35 דק׳" / "יעד 5 ק״מ". */
  targetText: string;
  /** "נותרו 14:34 דק׳" / "נותרו 1.6 ק״מ" / "הגעת ליעד". */
  remainingText: string;
  /** 0–1. */
  progress: number;
  percent: number;
  done: boolean;
}

export function goalView(goal: ContinuousGoal): GoalView {
  const ratio = goal.target > 0 ? goal.current / goal.target : 0;
  const progress = Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : 0));
  const done = ratio >= 1;
  const left = Math.max(0, goal.target - goal.current);
  const targetText =
    goal.type === 'time'
      ? `יעד ${Math.round(goal.target / 60)} דק׳`
      : `יעד ${Number.isInteger(goal.target) ? goal.target : goal.target.toFixed(1)} ק״מ`;
  const remainingText = done
    ? 'הגעת ליעד'
    : goal.type === 'time'
      ? `נותרו ${fmtClock(left)} דק׳`
      : left < 1
        ? `נותרו ${fmtDistance(left * 1000)}`
        : `נותרו ${left.toFixed(2)} ק״מ`;
  return { targetText, remainingText, progress, percent: Math.round(progress * 100), done };
}

// ── Laps (the list behind the free-run player) ───────────────────────────

export interface LapInput {
  id: string;
  lapNumber: number;
  distanceMeters: number;
  durationSeconds: number;
  isActive: boolean;
}

export interface LapRow {
  id: string;
  n: number;
  distanceText: string;
  timeText: string;
  /** Average pace of the lap — null under 400 m (owner rule) or without movement. */
  paceText: string | null;
  active: boolean;
}

/** Average pace sec/km of a leg, or null when it is under 400 m. */
export function legPaceSec(distanceMeters: number, durationSeconds: number): number | null {
  if (!(distanceMeters >= SHORT_LEG_METERS) || !(durationSeconds > 0)) return null;
  return durationSeconds / (distanceMeters / 1000);
}

export function lapRows(laps: readonly LapInput[] | null | undefined): LapRow[] {
  return (laps ?? []).map((l) => {
    const m = Number.isFinite(l.distanceMeters) ? Math.max(0, l.distanceMeters) : 0;
    const s = Number.isFinite(l.durationSeconds) ? Math.max(0, l.durationSeconds) : 0;
    const pace = legPaceSec(m, s);
    return {
      id: l.id,
      n: l.lapNumber,
      distanceText: (m / 1000).toFixed(2),
      timeText: fmtClock(s),
      paceText: pace === null ? null : fmtPace(pace),
      active: !!l.isActive,
    };
  });
}

/** Average pace of the whole session (sec/km), 0 before 50 m. */
export function avgPaceSec(durationSec: number, distanceKm: number): number {
  if (!(distanceKm > 0.05) || !(durationSec > 0)) return 0;
  return durationSec / distanceKm;
}
