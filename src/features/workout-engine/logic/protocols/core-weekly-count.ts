/**
 * Core weekly target wiring (owner 27.10.2026, R31): how many core sets the user did this week,
 * and the week's core target. Feeds WorkoutGenerationContext.weeklyCoreTarget / weeklyCoreSets
 * (see core-weekly-target.ts for the gate itself).
 *
 * Counting rules (owner 27.10.2026):
 *  - a core exercise counts its completed sets;
 *  - a core tabata block (4 minutes) counts as 4 sets, whatever its member / round count;
 *  - a core follow-along (the 4-minute video) counts as 4 sets;
 *  - the optional 8-minute core card counts as 8.
 *
 * Pure. Nothing here reads storage; callers pass the data they already hold.
 */
import {
  CORE_BLOCK_SET_EQUIVALENT,
  OPTIONAL_CORE_CARD_MINUTES,
  coreSetsOfOptionalCard,
} from './core-weekly-target';

/** Same muscle -> core mapping the completion screen uses for domainSets.core. */
const CORE_MUSCLES = new Set(['core', 'abs', 'obliques']);

/**
 * Weekly core set target by core level. Mirrors GlobalLevelConfig.weeklyTargetCore defaults
 * (global-training-config.service.ts: L1-5 -> 4, L6-12 -> 6, L13+ -> 8), the source #888 names.
 * That service is deprecated and reads Firestore, so the tier is kept here as a pure function.
 */
export function defaultWeeklyCoreTarget(level: number | null | undefined): number {
  const l = Number.isFinite(level as number) && (level as number) > 0 ? (level as number) : 1;
  return l <= 5 ? 4 : l <= 12 ? 6 : 8;
}

// ── Completion side: core sets of ONE finished workout ─────────────────────

export interface CompletedPlanExercise {
  id: string;
  sets?: number;
  muscleGroups?: string[];
  exerciseRole?: string;
  isFollowAlong?: boolean;
}

export interface CompletedPlanSegment {
  id?: string;
  protocol?: string;
  exercises?: CompletedPlanExercise[];
}

function isCoreExercise(ex: CompletedPlanExercise): boolean {
  const first = ex.muscleGroups?.[0]?.toLowerCase();
  return !!first && CORE_MUSCLES.has(first);
}

function isWarmupOrCooldown(ex: CompletedPlanExercise): boolean {
  return ex.exerciseRole === 'warmup' || ex.exerciseRole === 'cooldown';
}

/**
 * Core sets one finished workout counts for. `setsDone` maps exercise id -> sets actually done
 * (the exercise log); when an id is missing the planned sets are used, same as domainSets.
 */
export function coreSetsOfCompletedPlan(
  segments: readonly CompletedPlanSegment[] | null | undefined,
  setsDone: ReadonlyMap<string, number>,
): number {
  let total = 0;
  for (const segment of segments ?? []) {
    const exercises = (segment.exercises ?? []).filter((ex) => !isWarmupOrCooldown(ex));
    const done = (ex: CompletedPlanExercise) => setsDone.get(ex.id) ?? ex.sets ?? 0;
    if (segment.protocol === 'tabata' || segment.id === 'seg-tabata') {
      // One 4-minute block = 4 sets, once, when any core member was done.
      if (exercises.some((ex) => isCoreExercise(ex) && done(ex) > 0)) total += CORE_BLOCK_SET_EQUIVALENT;
      continue;
    }
    for (const ex of exercises) {
      if (!isCoreExercise(ex)) continue;
      const sets = done(ex);
      if (sets <= 0) continue;
      total += ex.isFollowAlong ? CORE_BLOCK_SET_EQUIVALENT : sets;
    }
  }
  return total;
}

// ── Week side: core sets done this week ────────────────────────────────────

/** The parts of WeeklyVolumeStore's SessionLog this count reads. */
export interface CoreSessionLogLike {
  completedAt: Date | string;
  isRecovery?: boolean;
  /** Core sets recorded at completion (coreSetsOfCompletedPlan). */
  coreSets?: number;
  domainSets?: Record<string, number>;
  /** 'core_card' = the optional short core card (counts by minutes, 8 min -> 8). */
  sessionKind?: 'core_card';
  durationMinutes?: number;
}

/**
 * Start of the app's week: Sunday 00:00 local time (same convention as
 * useWeeklyVolumeStore.getCurrentWeekStart).
 */
export function startOfWeekSunday(now: Date): Date {
  const start = new Date(now);
  start.setDate(now.getDate() - now.getDay());
  start.setHours(0, 0, 0, 0);
  return start;
}

/** Core sets one logged session counts for. */
export function coreSetsOfSessionLog(log: CoreSessionLogLike): number {
  if (log.sessionKind === 'core_card') {
    return coreSetsOfOptionalCard(log.durationMinutes ?? OPTIONAL_CORE_CARD_MINUTES);
  }
  if (typeof log.coreSets === 'number' && Number.isFinite(log.coreSets)) return Math.max(0, log.coreSets);
  // Logs written before coreSets existed: the anatomical domain count (recovery excluded, as
  // everywhere else in the weekly volume).
  if (log.isRecovery) return 0;
  return Math.max(0, log.domainSets?.core ?? 0);
}

/** Core sets done in the current week (Sunday start) across the given session logs. */
export function countCoreSetsThisWeek(
  logs: readonly CoreSessionLogLike[] | null | undefined,
  now: Date = new Date(),
): number {
  const start = startOfWeekSunday(now).getTime();
  let total = 0;
  for (const log of logs ?? []) {
    if (!log) continue;
    const when = new Date(log.completedAt).getTime();
    if (Number.isNaN(when) || when < start) continue;
    total += coreSetsOfSessionLog(log);
  }
  return total;
}
