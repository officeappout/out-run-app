/**
 * generate_workout (client tool) — last-mile shaping of the engine's workout for a chat
 * request. Pure (no Firebase); the duration estimator is passed in so tests can run it
 * with the real engine function or a stub.
 *
 * Owner review 18.10.2026 found three gaps between what the user asked the chat for and
 * what the engine shipped:
 *   1. Body-area focus: "אימון בטן" must be core only. The engine's strict-domain path now
 *      refuses the domain-blind backfill, but other passes (blast / protocol paths) can
 *      still add an off-area main exercise, so the AI path drops off-area mains as long as
 *      at least one on-area main remains, and tops up from the engine's own reserve pool.
 *   2. Short sessions: a 10-minute request shipped ONE or TWO main exercises, because the
 *      engine prices every set with the full strength rest staircase. For short chat
 *      requests (≤ 15 min) the session becomes a short circuit: at least 3 main exercises
 *      (4 from 11 minutes), 2 rounds each, rest capped at CIRCUIT_REST_SEC. Exercises come
 *      from the engine's own reserve (already level-, location- and gear-gated).
 *   3. Titles: metadata titles are picked by persona and situation ("שחרור גב אחרי שמירה"
 *      for a non-reservist), so AI-built workouts get a title from the request itself.
 *
 * Everything that changed is reported back (`ShapingReport`) so Kelly says the real
 * minutes and the review log shows what was done.
 */
import type { GeneratedWorkout, WorkoutExercise } from '@/features/workout-engine/logic/workout-generator.types';
import { MG_TO_DOMAIN } from '@/features/workout-engine/shared/constants/domain-mapping.constants';

/** Skill movement groups → the base area they train. */
const SKILL_PARENT: Record<string, string> = {
  planche: 'push',
  handstand_pushup: 'push',
  front_lever: 'pull',
  back_lever: 'pull',
  one_arm_pullup: 'pull',
  muscle_up: 'pull',
  human_flag: 'core',
};

export const SHORT_SESSION_MAX_MIN = 15;
export const CIRCUIT_ROUNDS = 2;
export const CIRCUIT_REST_SEC = 30;

export function minMainExercisesFor(durationMin: number): number {
  if (durationMin > SHORT_SESSION_MAX_MIN) return 0;
  return durationMin <= 10 ? 3 : 4;
}

/** The base area (push / pull / legs / core) an exercise trains, from its movement group. */
export function baseDomainOf(ex: Pick<WorkoutExercise, 'exercise'>): string | null {
  const mg = ex.exercise?.movementGroup as string | undefined;
  if (!mg) return null;
  const d = MG_TO_DOMAIN[mg];
  if (!d) return null;
  return SKILL_PARENT[d] ?? d;
}

/** True when the exercise trains one of the requested areas (skill domains count as their own name too). */
export function matchesRequested(ex: Pick<WorkoutExercise, 'exercise'>, domains: readonly string[]): boolean {
  if (domains.length === 0) return true;
  const mg = ex.exercise?.movementGroup as string | undefined;
  const direct = mg ? MG_TO_DOMAIN[mg] : undefined;
  const base = baseDomainOf(ex);
  return (direct !== undefined && domains.includes(direct)) || (base !== null && domains.includes(base));
}

/** The exercise's chosen method is for this location (the same truth the card shows). */
export function methodFitsLocation(ex: Pick<WorkoutExercise, 'method'>, location: string): boolean {
  const m = ex.method as { location?: string; locationMapping?: string[] } | null | undefined;
  if (!m) return false;
  return m.location === location || (Array.isArray(m.locationMapping) && m.locationMapping.includes(location));
}

const isMain = (e: WorkoutExercise) => e.exerciseRole !== 'warmup' && e.exerciseRole !== 'cooldown';

export interface ShapingReport {
  requestedMinutes: number;
  /** Off-area main exercises removed (names). */
  removedOffDomain: string[];
  /** Main exercises added from the engine's reserve (names). */
  addedFromReserve: string[];
  /** The short-circuit format was applied. */
  shortCircuit: boolean;
  /** Fewer main exercises than the short-session minimum were available. */
  shortOfMinimum: boolean;
  titleReplaced: boolean;
}

export interface ShapeOptions {
  durationMin: number;
  /** The requested location; reserve exercises must carry a method for it. */
  location: string;
  domains: readonly string[];
  title: string;
  nameOf: (ex: WorkoutExercise) => string;
  estimateMinutes: (exercises: WorkoutExercise[]) => number;
}

/** Inserts `added` right after the last main exercise (before the cooldown). */
function insertMains(exercises: WorkoutExercise[], added: WorkoutExercise[]): WorkoutExercise[] {
  if (added.length === 0) return exercises;
  let lastMain = -1;
  exercises.forEach((e, i) => {
    if (isMain(e)) lastMain = i;
  });
  const at = lastMain === -1 ? exercises.filter((e) => e.exerciseRole === 'warmup').length : lastMain + 1;
  return [...exercises.slice(0, at), ...added, ...exercises.slice(at)];
}

/** Mutates and returns `workout`. */
export function shapeAiWorkout(workout: GeneratedWorkout, o: ShapeOptions): { workout: GeneratedWorkout; report: ShapingReport } {
  const report: ShapingReport = {
    requestedMinutes: o.durationMin,
    removedOffDomain: [],
    addedFromReserve: [],
    shortCircuit: false,
    shortOfMinimum: false,
    titleReplaced: false,
  };
  let reserve = [...(workout.reserveExercises ?? [])];
  const used = new Set(workout.exercises.map((e) => e.exercise?.id));
  const takeReserve = (n: number): WorkoutExercise[] => {
    const out: WorkoutExercise[] = [];
    for (const r of reserve) {
      if (out.length >= n) break;
      if (used.has(r.exercise?.id) || !matchesRequested(r, o.domains)) continue;
      if (!methodFitsLocation(r, o.location)) continue;
      // Follow-along / tabata reinforcement items aren't stations of a circuit.
      if ((r.exercise as { exerciseRole?: string } | undefined)?.exerciseRole === 'reinforcement' || r.protocolBlock) continue;
      used.add(r.exercise?.id);
      out.push({ ...r, exerciseRole: 'main' });
    }
    const taken = new Set(out.map((e) => e.exercise?.id));
    reserve = reserve.filter((r) => !taken.has(r.exercise?.id));
    return out;
  };

  // 1. Body-area focus.
  if (o.domains.length > 0) {
    const mains = workout.exercises.filter(isMain);
    const on = mains.filter((e) => matchesRequested(e, o.domains));
    if (on.length > 0 && on.length < mains.length) {
      const off = new Set(mains.filter((e) => !matchesRequested(e, o.domains)));
      report.removedOffDomain = Array.from(off).map(o.nameOf);
      workout.exercises = workout.exercises
        .filter((e) => !off.has(e))
        .map((e) => (e.pairedWith && Array.from(off).some((x) => x.exercise?.id === e.pairedWith) ? { ...e, pairedWith: undefined } : e));
      const refill = takeReserve(off.size);
      report.addedFromReserve.push(...refill.map(o.nameOf));
      workout.exercises = insertMains(workout.exercises, refill);
    }
  }

  // 2. Short sessions → a short circuit with a real minimum of exercises.
  const minMain = minMainExercisesFor(o.durationMin);
  if (minMain > 0) {
    const have = workout.exercises.filter(isMain).length;
    if (have < minMain) {
      const added = takeReserve(minMain - have);
      report.addedFromReserve.push(...added.map(o.nameOf));
      workout.exercises = insertMains(workout.exercises, added);
    }
    const mains = workout.exercises.filter(isMain);
    report.shortOfMinimum = mains.length < minMain;
    if (mains.length >= 2 && !mains.some((e) => e.protocolBlock)) {
      workout.exercises = workout.exercises.map((e) =>
        isMain(e)
          ? {
              ...e,
              sets: Math.min(e.sets, CIRCUIT_ROUNDS),
              restSeconds: Math.min(e.restSeconds ?? CIRCUIT_REST_SEC, CIRCUIT_REST_SEC),
              reasoning: [...(e.reasoning ?? []), 'ai_coach:short_circuit'],
            }
          : e,
      );
      workout.structure = 'circuit';
      report.shortCircuit = true;
    }
  }

  workout.reserveExercises = reserve.length ? reserve : undefined;
  if (report.removedOffDomain.length || report.addedFromReserve.length || report.shortCircuit) {
    workout.estimatedDuration = o.estimateMinutes(workout.exercises);
    workout.totalPlannedSets = workout.exercises.reduce((s, e) => s + (e.sets ?? 0), 0);
  }

  // 3. Title from the request.
  if (o.title && workout.title !== o.title) {
    workout.title = o.title;
    report.titleReplaced = true;
  }
  return { workout, report };
}
