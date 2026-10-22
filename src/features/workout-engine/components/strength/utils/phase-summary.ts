/**
 * phase-summary — pure projection of a finished strength session into
 * phases (warm-up / main / cool-down) → blocks (the plan's real segments) →
 * exercises → per-set "done vs planned" marks.
 *
 * Used only by the home-v2 summary (enable_home_v2). No React, no Firebase.
 *
 * Sources, in order of trust:
 *   1. `segments` — the workout plan's real segments (live flow). Gives the
 *      phase, block title, protocol, planned set count, per-set targets and
 *      unit (reps / seconds), resolved with the SAME helpers the runner uses
 *      (resolveSetTarget / effectiveSetsForExercise).
 *   2. `rawLog` — what was actually confirmed per set (and the runner's own
 *      targetReps, used as a fallback per-set target).
 *   3. `completedExercises` — the only source for saved/history workouts
 *      without a plan snapshot (docs saved before 22.10.2026): phases come
 *      from the exercise category, planned sets are unknown (null) and
 *      nothing is invented. Newer docs carry a compact plan snapshot
 *      (history/summary-snapshot.ts) that is restored into `segments`.
 *
 * No weight is shown: the strength runner never logs a load per set.
 */
import type { CompletedExercise } from './summary.utils';
import {
  effectiveSetsForExercise,
  resolveSetTarget,
} from '@/features/workout-engine/players/strength/logic/set-target.utils';

export type SummaryPhase = 'warmup' | 'main' | 'cooldown';
export type SetUnit = 'reps' | 'seconds' | 'unknown';
export type SetMark = 'full' | 'partial' | 'missed';
export type ExerciseStatus = 'done' | 'partial' | 'skipped';

export interface SetSummary {
  /** Performed value (reps or seconds); null when the planned set wasn't done. */
  done: number | null;
  /** Planned target for this set, when the plan defines one. */
  target: number | null;
  mark: SetMark;
}

export interface ExerciseSummary {
  key: string;
  name: string;
  unit: SetUnit;
  /** Planned set count; null when unknown (history, AMRAP, swapped-in). */
  plannedSets: number | null;
  doneSets: number;
  /** Sum of performed values (reps or seconds). */
  total: number;
  sets: SetSummary[];
  status: ExerciseStatus;
  /** Best set this session minus best set of the previous session (only when > 0). */
  improvedBy: number | null;
  /** Best set this session / last session (null when unknown) — for "פעם קודמת X · היום Y". */
  best: number | null;
  previousBest: number | null;
  /** Exercise image from the plan (live flow only). */
  imageUrl?: string;
  /** The plan slot was swapped mid-workout (plan `wasSwapped`). Shown only under enable_swap_fixes_v1. */
  swapped?: boolean;
}

export interface BlockSummary {
  id: string;
  title: string;
  protocol?: string;
  exercises: ExerciseSummary[];
}

export interface PhaseTotals {
  setsDone: number;
  /** Null when any exercise in the phase has an unknown planned count. */
  setsPlanned: number | null;
  reps: number;
  /** Seconds of timed work (holds / intervals) actually performed. */
  workSeconds: number;
  exercisesDone: number;
  exercisesTotal: number;
}

export interface PhaseSummary {
  phase: SummaryPhase;
  blocks: BlockSummary[];
  totals: PhaseTotals;
}

export interface SessionTotals extends PhaseTotals {
  /** 0–100, only when every planned count is known. */
  completionPercent: number | null;
}

// Minimal structural types (keeps this file free of the parks barrel).
export interface PlanExercise {
  id: string;
  name: string;
  imageUrl?: string;
  reps?: string;
  duration?: string;
  sets?: number;
  exerciseType?: 'reps' | 'time';
  exerciseRole?: string;
  isTimeBased?: boolean;
  wasSwapped?: boolean;
  repsSequence?: number[];
  pyramidSequence?: unknown[];
  /**
   * History parity (enable_history_summary_parity): restored from the saved
   * plan snapshot. When present they replace the derived planned-set count /
   * per-set targets, so the saved workout redraws exactly as it was shown.
   */
  plannedSets?: number | null;
  setTargets?: (number | null)[];
}

export interface PlanSegment {
  id: string;
  title?: string;
  target?: { type?: string; value?: number };
  exercises?: PlanExercise[];
  protocol?: string;
  protocolConfig?: object;
  /** History parity: the phase saved with the plan snapshot (wins over detection). */
  phase?: SummaryPhase;
}

export interface RawLogEntry {
  exerciseId: string;
  exerciseName: string;
  segmentId: string;
  confirmedReps: number[];
  targetReps: number;
}

export interface BuildPhaseSummaryInput {
  completedExercises: CompletedExercise[];
  rawLog?: RawLogEntry[];
  segments?: PlanSegment[];
  /** exerciseId → last session's per-set values (Progression Memory). */
  previousSets?: Record<string, number[]>;
}

const PHASE_ORDER: SummaryPhase[] = ['warmup', 'main', 'cooldown'];

/** Same title/id detection the summary mapping + runner use, plus exerciseRole. */
export function segmentPhase(segment: PlanSegment): SummaryPhase {
  if (segment.phase) return segment.phase;
  const id = segment.id.toLowerCase();
  const title = segment.title ?? '';
  const roles = (segment.exercises ?? []).map((e) => e.exerciseRole);
  const allRole = (r: string[]) => roles.length > 0 && roles.every((x) => !!x && r.includes(x));
  if (id.includes('warmup') || title.includes('חימום') || allRole(['warmup'])) return 'warmup';
  if (
    id.includes('cooldown') ||
    title.includes('קירור') ||
    title.includes('מתיחות') ||
    title.includes('שחרור') ||
    allRole(['cooldown', 'recovery'])
  ) {
    return 'cooldown';
  }
  return 'main';
}

export function exerciseUnit(ex: PlanExercise, segment: PlanSegment): SetUnit {
  if (ex.exerciseType === 'time' || ex.isTimeBased) return 'seconds';
  if (ex.exerciseType === 'reps') return 'reps';
  if (segment.target?.type === 'reps') return 'reps';
  if (segment.target?.type === 'time') return 'seconds';
  if (ex.reps) return 'reps';
  if (ex.duration) return 'seconds';
  return 'reps';
}

function parseFirstInt(s: string | undefined): number | null {
  const m = s?.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

export function planTargetForSet(
  ex: PlanExercise,
  segment: PlanSegment,
  unit: SetUnit,
  setIndex: number,
): number | null {
  const t = resolveSetTarget(ex, setIndex);
  if (t.source === 'pyramid') return t.reps ?? t.hold;
  if (t.source === 'repsSequence') return t.reps;
  if (unit === 'reps') {
    if (t.source === 'repsString') return t.reps;
    if (segment.target?.type === 'reps' && typeof segment.target.value === 'number') return segment.target.value;
    return null;
  }
  if (segment.target?.type === 'time' && typeof segment.target.value === 'number') return segment.target.value;
  return parseFirstInt(ex.duration);
}

/** Planned sets per member for block-scoped protocols; null when open-ended. */
export function blockPlannedSets(segment: PlanSegment): number | null | undefined {
  const cfg = (segment.protocolConfig ?? {}) as Record<string, unknown>;
  const members = Math.max(1, segment.exercises?.length ?? 1);
  if (segment.protocol === 'tabata' && typeof cfg.rounds === 'number') return Math.ceil(cfg.rounds / members);
  if (segment.protocol === 'emom' && typeof cfg.totalIntervals === 'number') {
    return Math.ceil(cfg.totalIntervals / members);
  }
  if (segment.protocol === 'amrap') return null;
  return undefined; // exercise-scoped → per-exercise count
}

export function blockTarget(segment: PlanSegment, unit: SetUnit): number | null | undefined {
  const cfg = (segment.protocolConfig ?? {}) as Record<string, unknown>;
  if (segment.protocol === 'tabata' && unit === 'seconds' && typeof cfg.workSec === 'number') return cfg.workSec;
  return undefined;
}

/** Planned set count of a plan exercise (saved snapshot value wins). */
export function planExercisePlannedSets(ex: PlanExercise, blockSets: number | null | undefined): number | null {
  if (ex.plannedSets !== undefined) return ex.plannedSets;
  return blockSets === undefined ? effectiveSetsForExercise(ex) : blockSets;
}

/** The plan's own target for set i (null = unknown; the caller falls back to the log's targetReps). */
export function planExerciseSetTarget(
  ex: PlanExercise,
  segment: PlanSegment,
  unit: SetUnit,
  bTarget: number | null | undefined,
  setIndex: number,
): number | null {
  if (ex.setTargets) return ex.setTargets[setIndex] ?? null;
  return bTarget !== undefined ? bTarget : planTargetForSet(ex, segment, unit, setIndex);
}

export function markFor(done: number | null, target: number | null): SetMark {
  if (done === null || done <= 0) return 'missed';
  if (target === null || target <= 0) return 'full';
  return done >= target ? 'full' : 'partial';
}

function buildExercise(args: {
  key: string;
  name: string;
  unit: SetUnit;
  plannedSets: number | null;
  done: number[];
  targetFor: (i: number) => number | null;
  previous?: number[];
  imageUrl?: string;
}): ExerciseSummary {
  const { key, name, unit, plannedSets, done, targetFor, previous, imageUrl } = args;
  const count = Math.max(done.length, plannedSets ?? 0);
  const sets: SetSummary[] = [];
  for (let i = 0; i < count; i++) {
    const d = i < done.length ? done[i] : null;
    const target = targetFor(i);
    sets.push({ done: d, target, mark: markFor(d, target) });
  }
  const doneSets = done.filter((v) => v > 0).length;
  const total = done.reduce((a, b) => a + b, 0);
  const allFull = sets.length > 0 && sets.every((s) => s.mark === 'full');
  const status: ExerciseStatus = doneSets === 0 ? 'skipped' : allFull ? 'done' : 'partial';
  let improvedBy: number | null = null;
  const best = done.length > 0 ? Math.max(...done) : null;
  const previousBest = previous && previous.length > 0 ? Math.max(...previous) : null;
  if (best !== null && previousBest !== null) {
    const delta = best - previousBest;
    if (delta > 0) improvedBy = delta;
  }
  return {
    key,
    name,
    unit,
    plannedSets,
    doneSets,
    total,
    sets,
    status,
    improvedBy,
    best,
    previousBest,
    ...(imageUrl ? { imageUrl } : {}),
  };
}

function totalsFor(blocks: BlockSummary[]): PhaseTotals {
  const exs = blocks.flatMap((b) => b.exercises);
  const unknown = exs.some((e) => e.plannedSets === null);
  return {
    setsDone: exs.reduce((a, e) => a + e.doneSets, 0),
    setsPlanned: unknown ? null : exs.reduce((a, e) => a + (e.plannedSets ?? 0), 0),
    reps: exs.filter((e) => e.unit !== 'seconds').reduce((a, e) => a + e.total, 0),
    workSeconds: exs.filter((e) => e.unit === 'seconds').reduce((a, e) => a + e.total, 0),
    exercisesDone: exs.filter((e) => e.status !== 'skipped').length,
    exercisesTotal: exs.length,
  };
}

function categoryPhase(c: CompletedExercise['category']): SummaryPhase {
  return c === 'warmup' ? 'warmup' : c === 'stretch' ? 'cooldown' : 'main';
}

export function buildPhaseSummary({
  completedExercises,
  rawLog = [],
  segments,
  previousSets,
}: BuildPhaseSummaryInput): PhaseSummary[] {
  const byPhase = new Map<SummaryPhase, BlockSummary[]>();
  const push = (phase: SummaryPhase, block: BlockSummary) => {
    if (block.exercises.length === 0) return;
    byPhase.set(phase, [...(byPhase.get(phase) ?? []), block]);
  };

  if (segments && segments.length > 0) {
    const logKey = (seg: string, ex: string) => `${seg}:${ex}`;
    const logMap = new Map(rawLog.map((e) => [logKey(e.segmentId, e.exerciseId), e]));
    const used = new Set<string>();

    for (const segment of segments) {
      const planEx = segment.exercises ?? [];
      const exercises: ExerciseSummary[] = [];
      const blockSets = blockPlannedSets(segment);
      for (const ex of planEx) {
        const key = logKey(segment.id, ex.id);
        const entry = logMap.get(key);
        if (entry) used.add(key);
        const unit = exerciseUnit(ex, segment);
        const bTarget = blockTarget(segment, unit);
        exercises.push(
          buildExercise({
            key,
            name: entry?.exerciseName ?? ex.name,
            unit,
            plannedSets: planExercisePlannedSets(ex, blockSets),
            done: entry?.confirmedReps ?? [],
            targetFor: (i) =>
              planExerciseSetTarget(ex, segment, unit, bTarget, i) ??
              (entry && entry.targetReps > 0 ? entry.targetReps : null),
            previous: previousSets?.[ex.id],
            imageUrl: ex.imageUrl,
          }),
        );
        if (ex.wasSwapped) exercises[exercises.length - 1].swapped = true;
      }
      // Swapped-in exercises: logged under this segment but not in its plan.
      for (const entry of rawLog) {
        const key = logKey(entry.segmentId, entry.exerciseId);
        if (entry.segmentId !== segment.id || used.has(key)) continue;
        used.add(key);
        exercises.push(
          buildExercise({
            key,
            name: entry.exerciseName,
            unit: 'unknown',
            plannedSets: null,
            done: entry.confirmedReps,
            targetFor: () => (entry.targetReps > 0 ? entry.targetReps : null),
            previous: previousSets?.[entry.exerciseId],
          }),
        );
      }
      push(segmentPhase(segment), {
        id: segment.id,
        title: segment.title ?? '',
        protocol: segment.protocol,
        exercises,
      });
    }

    // Log entries whose segment isn't in the plan at all.
    const orphans = rawLog.filter((e) => !used.has(logKey(e.segmentId, e.exerciseId)));
    if (orphans.length > 0) {
      push('main', {
        id: 'other',
        title: '',
        exercises: orphans.map((entry) =>
          buildExercise({
            key: logKey(entry.segmentId, entry.exerciseId),
            name: entry.exerciseName,
            unit: 'unknown',
            plannedSets: null,
            done: entry.confirmedReps,
            targetFor: () => (entry.targetReps > 0 ? entry.targetReps : null),
            previous: previousSets?.[entry.exerciseId],
          }),
        ),
      });
    }
  } else {
    // History / no plan: category → phase, nothing planned is invented.
    const targetById = new Map(rawLog.map((e) => [e.exerciseId, e.targetReps]));
    for (const phase of PHASE_ORDER) {
      const list = completedExercises.filter((e) => categoryPhase(e.category) === phase);
      push(phase, {
        id: phase,
        title: '',
        exercises: list.map((e) => {
          const t = targetById.get(e.id);
          return buildExercise({
            key: e.id,
            name: e.name,
            unit: 'unknown',
            plannedSets: null,
            done: e.sets,
            targetFor: () => (t && t > 0 ? t : null),
            previous: previousSets?.[e.id],
          });
        }),
      });
    }
  }

  return PHASE_ORDER.filter((p) => byPhase.has(p)).map((phase) => {
    const blocks = byPhase.get(phase)!;
    return { phase, blocks, totals: totalsFor(blocks) };
  });
}

export function sessionTotals(phases: PhaseSummary[]): SessionTotals {
  const t = totalsFor(phases.flatMap((p) => p.blocks));
  const completionPercent =
    t.setsPlanned && t.setsPlanned > 0 ? Math.min(100, Math.round((t.setsDone / t.setsPlanned) * 100)) : null;
  return { ...t, completionPercent };
}

/** "m:ss" for work-seconds totals (e.g. 95 → "1:35"). */
export function formatWorkSeconds(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}`;
}
