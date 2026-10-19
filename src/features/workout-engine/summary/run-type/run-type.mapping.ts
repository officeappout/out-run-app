/**
 * Home v2 (enable_home_v2) — the run summary by workout type (boards
 * R4-prop-easy / -intervals / -long / -splits, F-1f / F-1g). Pure, no
 * React: the kind, hero, rings, km-split rows, course rail and program
 * progress, all from data the summary already has (the saved doc + its
 * optional `runMeta`, and the running program on the user profile).
 * Anything missing is left out — never invented.
 */
import type { MetricRing } from '@/components/ui/v2/MetricRings';
import type { RepPaceRow } from '@/components/ui/v2/RepPaceTable';
import { programRingModel, type ProgramRingModel } from '@/components/ui/v2/summary';
import type {
  PlannedBlockRecord,
  RunSummaryMeta,
  WorkoutHistoryEntry,
} from '@/features/workout-engine/core/services/storage.service';
import type { ActiveRunningProgram, WorkoutCategory } from '@/features/workout-engine/core/types/running.types';
import { RUNNING_WORKOUT_CATEGORY_LABELS_HE } from '@/lib/running-workout-labels';
import {
  fmtBand,
  fmtClock,
  fmtDistance,
  fmtPace,
  repSummary,
} from '@/features/workout-engine/players/running/lib/planned-rep-results';
import { splitPaceSec, splitsFromLaps, type KmSplit } from '@/features/workout-engine/players/running/lib/km-splits';
import { RING_COLORS, paceLabel, timeLabel } from '../v2-summary.mapping';

export type RunSummaryKind = 'intervals' | 'easy' | 'long' | 'free';

type RunLike = Pick<WorkoutHistoryEntry, 'distance' | 'duration' | 'pace' | 'laps' | 'blockResults' | 'runMeta' | 'elevationGain'>;

const LONG_CATEGORIES = new Set(['long_run']);

/**
 * Which summary a run gets. Reps (≥ 2 per-rep records) ⇒ intervals; a long
 * run (category or week slot) ⇒ long; any other planned run ⇒ easy (one
 * band to hold); no plan data ⇒ free (today's layout).
 */
export function runSummaryKind(w: RunLike): RunSummaryKind {
  const m = w.runMeta;
  const reps = w.blockResults?.length ?? 0;
  if (reps >= 2) return 'intervals';
  if (m && (LONG_CATEGORIES.has(m.category ?? '') || m.slotType === 'long_run')) return 'long';
  if (m && (m.category || m.slotType || m.workoutId)) return 'easy';
  return 'free';
}

export function categoryLabel(category: string | undefined): string | null {
  if (!category) return null;
  return RUNNING_WORKOUT_CATEGORY_LABELS_HE[category as WorkoutCategory] ?? null;
}

// ── Hero ──────────────────────────────────────────────────────────────────

export interface RunHero {
  /** "אינטרוולים קצרים" / "ריצה ארוכה" / "ריצה". */
  label: string;
  /** "6 × 400 מ׳" — intervals with equal reps only; null ⇒ distance. */
  repsTitle: string | null;
}

/** "6 × 400 מ׳" / "5 × 3 דק׳" when every rep shares one planned length. */
export function repsTitle(records: readonly PlannedBlockRecord[] | null | undefined, plannedReps?: number): string | null {
  const list = records ?? [];
  if (list.length < 2) return null;
  const n = plannedReps && plannedReps >= list.length ? plannedReps : list.length;
  const d = list[0].plannedDistanceMeters;
  if (d && list.every((r) => r.plannedDistanceMeters === d)) return `${n} × ${fmtDistance(d)}`;
  const t = list[0].plannedDurationSeconds;
  if (t && list.every((r) => r.plannedDurationSeconds === t)) {
    return t % 60 === 0 ? `${n} × ${t / 60} דק׳` : `${n} × ${fmtClock(t)}`;
  }
  return null;
}

export function runHero(w: RunLike, kind: RunSummaryKind): RunHero {
  const cat = categoryLabel(w.runMeta?.category);
  const fallback = kind === 'intervals' ? 'אינטרוולים' : kind === 'long' ? 'ריצה ארוכה' : kind === 'easy' ? 'ריצה קלה' : 'ריצה';
  return {
    label: cat ?? (w.runMeta?.title || fallback),
    repsTitle: kind === 'intervals' ? repsTitle(w.blockResults, w.runMeta?.plannedReps) : null,
  };
}

// ── Rings ─────────────────────────────────────────────────────────────────

function avg(nums: number[]): number | null {
  return nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
}

/** Main band of a steady run (first target band of its reps). */
export function mainBand(meta: RunSummaryMeta | undefined): { min: number; max: number } | null {
  const z = meta?.zones?.[0];
  return z && z.minPaceSec > 0 && z.maxPaceSec > 0 ? { min: z.minPaceSec, max: z.maxPaceSec } : null;
}

/** Share of scored time inside the band (0–100), or null without an accumulator. */
export function timeInZonePct(meta: RunSummaryMeta | undefined): number | null {
  const t = meta?.timeInZone;
  if (!t || !(t.totalSec > 0)) return null;
  return Math.max(0, Math.min(100, Math.round((t.inSec / t.totalSec) * 100)));
}

export function runTypeRings(w: RunLike, kind: RunSummaryKind): MetricRing[] {
  const km = w.distance ?? 0;
  const distance: MetricRing = {
    key: 'distance',
    value: km > 0 ? km.toFixed(2) : '--',
    unit: 'ק״מ',
    label: 'מרחק',
    pct: km > 0 ? 100 : 0,
    color: RING_COLORS.distance,
  };
  const time: MetricRing = {
    key: 'time',
    value: timeLabel(w.duration),
    label: 'זמן',
    pct: (w.duration ?? 0) > 0 ? 100 : 0,
    color: RING_COLORS.time,
  };
  const pace: MetricRing = {
    key: 'pace',
    value: paceLabel(w.pace),
    unit: 'דק׳/ק״מ',
    label: 'קצב ממוצע',
    pct: (w.pace ?? 0) > 0 ? 100 : 0,
    color: RING_COLORS.pace,
  };

  if (kind === 'intervals') {
    const recs = w.blockResults ?? [];
    const planned = w.runMeta?.plannedReps && w.runMeta.plannedReps >= recs.length ? w.runMeta.plannedReps : recs.length;
    const s = repSummary(recs);
    const repPace = avg(recs.map((r) => r.avgPaceSec ?? 0).filter((p) => p > 0));
    const d = recs[0]?.plannedDistanceMeters;
    return [
      {
        key: 'reps',
        value: `${recs.length}/${planned}`,
        unit: 'חזרות',
        label: 'חזרות',
        sub: d && recs.every((r) => r.plannedDistanceMeters === d) ? fmtDistance(d) : null,
        pct: planned > 0 ? Math.min(100, Math.round((recs.length / planned) * 100)) : 0,
        color: RING_COLORS.distance,
      },
      {
        key: 'repPace',
        value: repPace ? fmtPace(repPace) : '--',
        unit: 'דק׳/ק״מ',
        label: 'קצב חזרה',
        sub: s.label,
        pct: s.scored > 0 ? Math.round((s.inRange / s.scored) * 100) : repPace ? 100 : 0,
        color: RING_COLORS.pace,
      },
      { ...distance, sub: (w.duration ?? 0) > 0 ? timeLabel(w.duration) : null },
    ];
  }

  if (kind === 'easy') {
    const band = mainBand(w.runMeta);
    const tiz = timeInZonePct(w.runMeta);
    return [
      distance,
      { ...pace, sub: band ? `טווח ${fmtBand(band.min, band.max)}` : null },
      tiz !== null
        ? { key: 'zone', value: `${tiz}%`, label: 'זמן בטווח', pct: tiz, color: RING_COLORS.segments }
        : time,
    ];
  }

  // long + free: distance · time · pace.
  return [distance, time, pace];
}

// ── Per-km splits ────────────────────────────────────────────────────────

/** Auto-km laps first, then the GPS-trace splits saved in runMeta. */
export function resolveKmSplits(w: RunLike): KmSplit[] | null {
  const fromLaps = splitsFromLaps(w.laps);
  if (fromLaps && fromLaps.length >= 2) return fromLaps;
  const saved = w.runMeta?.kmSplits;
  if (Array.isArray(saved) && saved.length >= 2) {
    const ok = saved.filter((s) => s && s.km > 0 && s.sec > 0);
    return ok.length >= 2 ? ok : null;
  }
  return null;
}

export interface KmSplitModel {
  rows: RepPaceRow[];
  band: { min: number; max: number } | null;
  /** "הכי מהיר: ק״מ 12". */
  fastestLabel: string | null;
  /** Pace of the last FULL km ("ק״מ אחרון"). */
  lastKmPace: string | null;
}

export function kmSplitModel(splits: readonly KmSplit[] | null, band: { min: number; max: number } | null): KmSplitModel | null {
  if (!splits || splits.length < 2) return null;
  let prev = 0;
  const items = splits.map((s) => {
    const p = splitPaceSec(s, prev);
    const full = Math.abs(s.km - prev - 1) < 0.051;
    prev = s.km;
    return { s, p, full };
  });
  const fullOnes = items.filter((x) => x.full && x.p);
  const fastest = fullOnes.length > 0 ? fullOnes.reduce((a, b) => ((b.p as number) < (a.p as number) ? b : a)) : null;
  const rows: RepPaceRow[] = items.map((x, i) => {
    const isFast = fastest === x;
    const inBand = band && x.p ? x.p >= band.min && x.p <= band.max : null;
    const label = x.full ? String(Math.round(x.s.km)) : x.s.km.toFixed(1);
    return {
      key: `km-${i}`,
      n: x.full ? Math.round(x.s.km) : Number(x.s.km.toFixed(1)),
      title: fmtClock(x.s.sec),
      sub: x.full ? `ק״מ ${label}` : `${label} ק״מ (חלקי)`,
      ...(isFast ? { status: 'הכי מהיר' } : {}),
      tone: isFast ? 'best' : inBand === null ? 'none' : inBand ? 'in' : 'off',
      value: x.p ? fmtPace(x.p) : '--:--',
      paceSec: x.p,
      ...(x.p ? { paceLabel: fmtPace(x.p) } : {}),
    };
  });
  const lastFull = [...items].reverse().find((x) => x.full && x.p);
  return {
    rows,
    band,
    fastestLabel: fastest ? `הכי מהיר: ק״מ ${Math.round(fastest.s.km)}` : null,
    lastKmPace: lastFull?.p ? fmtPace(lastFull.p) : null,
  };
}

// ── Course rail (intervals) ──────────────────────────────────────────────

export interface CourseItem {
  id: string;
  label: string;
  detail?: string;
}

function minutesLabel(sec: number): string {
  return `${Math.max(1, Math.round(sec / 60))} דק׳`;
}

/** Warm-up · reps in groups of three · cool-down (R4-prop-intervals "מהלך האימון"). */
export function courseItems(w: RunLike): CourseItem[] {
  const recs = w.blockResults ?? [];
  if (recs.length === 0) return [];
  const out: CourseItem[] = [];
  const m = w.runMeta;
  if (m?.warmup) {
    out.push({
      id: 'warmup',
      label: 'חימום',
      detail: [minutesLabel(m.warmup.durationSeconds), m.warmup.distanceMeters > 0 ? fmtDistance(m.warmup.distanceMeters) : null]
        .filter(Boolean)
        .join(' · '),
    });
  }
  for (let i = 0; i < recs.length; i += 3) {
    const g = recs.slice(i, i + 3);
    const a = g[0].rep > 0 ? g[0].rep : i + 1;
    const b = g[g.length - 1].rep > 0 ? g[g.length - 1].rep : i + g.length;
    out.push({
      id: `reps-${i}`,
      label: a === b ? `חזרה ${a}` : `חזרות ${a}–${b}`,
      detail: g.map((r) => (r.avgPaceSec ? fmtPace(r.avgPaceSec) : fmtClock(r.durationSeconds))).join(' · '),
    });
  }
  if (m?.cooldown) {
    out.push({
      id: 'cooldown',
      label: 'שחרור',
      detail: [minutesLabel(m.cooldown.durationSeconds), m.cooldown.distanceMeters > 0 ? fmtDistance(m.cooldown.distanceMeters) : null]
        .filter(Boolean)
        .join(' · '),
    });
  }
  return out;
}

// ── Program progress (running plan) ──────────────────────────────────────

export interface RunPlanProgress {
  name: string;
  /** "שבוע 3/8". */
  weekLabel: string;
  /** "אימון 2 מתוך 4 השבוע". */
  positionLabel: string;
  /** "הבא: אינטרוולים קצרים" — null at the end of the plan. */
  nextLabel: string | null;
  ring: ProgramRingModel;
  gain: number;
}

type ScheduleEntry = ActiveRunningProgram['schedule'][number];

/**
 * Where this run sits in the running program — by its saved position
 * (week/day), not by `status` (program sessions are not marked complete on
 * the live finish yet, so counting `completed` would under-report). Ring =
 * share of the plan's sessions up to and including this one; today's share
 * is the green gain. null when the program or the position is unknown.
 */
export function runPlanProgress(
  program: Pick<ActiveRunningProgram, 'schedule'> | null | undefined,
  position: { week: number; day: number } | null | undefined,
  programName?: string | null,
): RunPlanProgress | null {
  const schedule = program?.schedule;
  if (!schedule || schedule.length === 0 || !position) return null;
  const sorted = [...schedule].sort((a, b) => a.week - b.week || a.day - b.day);
  const idx = sorted.findIndex((e) => e.week === position.week && e.day === position.day);
  if (idx < 0) return null;
  const weeks = Math.max(...sorted.map((e) => e.week));
  const week = sorted.filter((e) => e.week === position.week);
  const posInWeek = week.findIndex((e) => e.day === position.day) + 1;
  const next: ScheduleEntry | undefined = sorted[idx + 1];
  const nextName = next ? categoryLabel(next.category) ?? next.workoutName ?? null : null;
  const total = sorted.length;
  const pct = ((idx + 1) / total) * 100;
  const gain = 100 / total;
  return {
    name: programName?.trim() || 'תוכנית ריצה',
    weekLabel: `שבוע ${position.week}/${weeks}`,
    positionLabel: `אימון ${posInWeek} מתוך ${week.length} השבוע`,
    nextLabel: nextName ? `הבא: ${nextName}` : null,
    ring: programRingModel(pct, gain, false),
    gain,
  };
}

// ── Whole model ──────────────────────────────────────────────────────────

export interface RunTypeExtra {
  key: string;
  label: string;
  value: string;
}

export interface RunTypeModel {
  kind: RunSummaryKind;
  hero: RunHero;
  rings: MetricRing[];
  splits: KmSplitModel | null;
  /** Splits came from the auto-km laps (the laps list would repeat them). */
  splitsFromLaps: boolean;
  course: CourseItem[];
  plan: RunPlanProgress | null;
  /** Long run: ascent · last km. */
  extras: RunTypeExtra[];
}

export interface RunPlanInput {
  program?: Pick<ActiveRunningProgram, 'schedule'> | null;
  programName?: string | null;
}

export function runTypeModel(w: RunLike, planInput?: RunPlanInput | null): RunTypeModel {
  const kind = runSummaryKind(w);
  const rawSplits = kind === 'intervals' ? null : resolveKmSplits(w);
  const lapSplits = splitsFromLaps(w.laps);
  const splits = kmSplitModel(rawSplits, kind === 'free' ? null : mainBand(w.runMeta));
  const extras: RunTypeExtra[] = [];
  if (kind === 'long') {
    if ((w.elevationGain ?? 0) > 0) extras.push({ key: 'ascent', label: 'עלייה', value: `+${Math.round(w.elevationGain as number)} מ׳` });
    if (splits?.lastKmPace) extras.push({ key: 'lastKm', label: 'ק״מ אחרון', value: splits.lastKmPace });
  }
  return {
    kind,
    hero: runHero(w, kind),
    rings: runTypeRings(w, kind),
    splits,
    splitsFromLaps: !!rawSplits && !!lapSplits && lapSplits.length >= 2,
    course: kind === 'intervals' ? courseItems(w) : [],
    plan: planInput ? runPlanProgress(planInput.program, w.runMeta?.plan, planInput.programName) : null,
    extras,
  };
}
