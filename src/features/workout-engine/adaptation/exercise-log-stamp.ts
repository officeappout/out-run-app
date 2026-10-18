/**
 * Rep-data honesty (soft-adaptation Phase 0) — PURE helpers that stamp the
 * per-exercise strength log with the context it was prescribed under, and
 * keep per-set provenance (was this number typed by the user, or just the
 * prefilled target saved with one tap?).
 *
 * Every field is optional and only ever ADDED (conditional spread — never an
 * undefined value: Firestore rejects undefined inside array elements). Docs
 * saved before this existed simply lack the keys.
 */
import { MG_TO_DOMAIN } from '@/features/workout-engine/shared/constants/domain-mapping.constants';
import type { CoachHintMark, RepsSource } from './adaptation.types';

// ── Generator WorkoutExercise → runner plan Exercise ───────────────────────

/** Minimal slice of the generator's WorkoutExercise the stamp reads. */
export interface StampableWorkoutExercise {
  exercise: { id: string; movementGroup?: string | null };
  programLevel?: number;
  levelDelta?: number;
  wasSwapped?: boolean;
  swappedFromId?: string;
  userDomainLevel?: number;
  swappedToLevel?: number;
}

/** Plan-level adaptation context carried on the runner's parks `Exercise`. */
export interface PlanAdaptationStamp {
  domain?: string;
  exerciseLevel?: number;
  userDomainLevel?: number;
  wasSwapped?: true;
  swappedFromId?: string;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function domainOfMovementGroup(mg: string | null | undefined): string | undefined {
  return mg ? MG_TO_DOMAIN[mg] : undefined;
}

/**
 * Spread into each runner-plan exercise by the plan mappers
 * (buildRunnerWorkoutPlanFromGenerated, home/page.tsx, strength-block-to-plan).
 * userDomainLevel = programLevel − levelDelta, valid only while the entry
 * is unswapped (deriveSwappedEntry rewrites programLevel but keeps
 * levelDelta) — swap paths stamp userDomainLevel explicitly instead.
 */
export function adaptationStampForPlan(we: StampableWorkoutExercise): PlanAdaptationStamp {
  const out: PlanAdaptationStamp = {};
  const domain = domainOfMovementGroup(we.exercise?.movementGroup);
  if (domain) out.domain = domain;
  const exerciseLevel = isNum(we.swappedToLevel) ? we.swappedToLevel : we.programLevel;
  if (isNum(exerciseLevel) && exerciseLevel > 0) out.exerciseLevel = exerciseLevel;
  const userDomainLevel = isNum(we.userDomainLevel)
    ? we.userDomainLevel
    : !we.wasSwapped && isNum(we.programLevel) && isNum(we.levelDelta)
      ? we.programLevel - we.levelDelta
      : undefined;
  if (isNum(userDomainLevel) && userDomainLevel > 0) out.userDomainLevel = userDomainLevel;
  if (we.wasSwapped) out.wasSwapped = true;
  if (we.swappedFromId) out.swappedFromId = we.swappedFromId;
  return out;
}

/**
 * Swap bookkeeping for a generator WorkoutExercise being replaced in place.
 * Keeps the ORIGINAL prescribed exercise across repeated swaps and freezes
 * the user's domain level from before the swap. A same-exercise method swap
 * (swap-all location) changes nothing here.
 */
export function swapStampForEntry(
  oldWE: StampableWorkoutExercise,
  newExerciseId: string,
  toLevel?: number,
): { swappedFromId?: string; userDomainLevel?: number; swappedToLevel?: number } {
  if (!oldWE?.exercise || oldWE.exercise.id === newExerciseId) {
    return {
      ...(oldWE?.swappedFromId ? { swappedFromId: oldWE.swappedFromId } : {}),
      ...(isNum(oldWE?.userDomainLevel) ? { userDomainLevel: oldWE.userDomainLevel } : {}),
    };
  }
  const udl = adaptationStampForPlan(oldWE).userDomainLevel;
  return {
    swappedFromId: oldWE.swappedFromId ?? oldWE.exercise.id,
    ...(isNum(udl) ? { userDomainLevel: udl } : {}),
    ...(isNum(toLevel) ? { swappedToLevel: toLevel } : {}),
  };
}

// ── Runner plan Exercise → per-exercise log entry ──────────────────────────

/** Minimal slice of the runner plan's parks `Exercise` the log stamp reads. */
export interface StampablePlanExercise {
  id?: string;
  exerciseRole?: string;
  repsRange?: { min: number; max: number };
  domain?: string;
  exerciseLevel?: number;
  userDomainLevel?: number;
  wasSwapped?: boolean;
  swappedFromId?: string;
}

export interface ExerciseLogStamp {
  domain?: string;
  exerciseLevel?: number;
  userDomainLevel?: number;
  prescribedRange?: { min: number; max: number };
  role?: string;
  wasSwapped?: true;
  swappedFromId?: string;
}

/** Stamp taken from the plan when a log entry is FIRST created. */
export function logStampFromPlanExercise(ex: StampablePlanExercise | null | undefined): ExerciseLogStamp {
  if (!ex) return {};
  const out: ExerciseLogStamp = {};
  if (ex.domain) out.domain = ex.domain;
  if (isNum(ex.exerciseLevel)) out.exerciseLevel = ex.exerciseLevel;
  if (isNum(ex.userDomainLevel)) out.userDomainLevel = ex.userDomainLevel;
  const r = ex.repsRange;
  if (r && isNum(r.min) && isNum(r.max)) out.prescribedRange = { min: r.min, max: r.max };
  if (ex.exerciseRole) out.role = ex.exerciseRole;
  if (ex.wasSwapped) out.wasSwapped = true;
  if (ex.swappedFromId && ex.swappedFromId !== ex.id) out.swappedFromId = ex.swappedFromId;
  return out;
}

// ── Per-set provenance ─────────────────────────────────────────────────────

/**
 * The coach hint the log drawer shows for a saved value — same comparison
 * LogDrawerContent always made (reps exercises only; time never hints).
 */
export function deriveCoachHint(
  value: number,
  rangeMin: number | null | undefined,
  rangeMax: number | null | undefined,
  unitType: 'reps' | 'time',
): 'fail' | 'overachieve' | null {
  if (unitType !== 'reps') return null;
  if (rangeMin != null && value < rangeMin) return 'fail';
  if (rangeMax != null && value > rangeMax) return 'overachieve';
  return null;
}

/**
 * Fallback provenance when the caller didn't say: a value equal to the
 * set's prescribed target is indistinguishable from "tapped save on the
 * prefilled default", so it is conservatively labelled 'default'.
 */
export function inferRepsSource(value: number, target: number | null | undefined): RepsSource {
  return target != null && value === target ? 'default' : 'edited';
}

export interface SetMetaCarrier {
  confirmedReps: number[];
  repsSource?: RepsSource[];
  coachHints?: CoachHintMark[];
}

/** Pad a parallel array to `len` (entries restored from an older checkpoint). */
function padTo<T>(arr: T[] | undefined, len: number, fill: T): T[] {
  const out = arr ? [...arr] : [];
  while (out.length < len) out.push(fill);
  return out;
}

/**
 * Record provenance for set `index` (call AFTER confirmedReps was written,
 * so index < confirmedReps.length). Mutates `entry` — the state machine's
 * log ref is a mutable container by design.
 */
export function recordSetMeta(
  entry: SetMetaCarrier,
  index: number,
  source: RepsSource,
  hint: 'fail' | 'overachieve' | null | undefined,
): void {
  const len = Math.max(entry.confirmedReps.length, index + 1);
  const sources = padTo(entry.repsSource, len, 'default' as RepsSource);
  const hints = padTo(entry.coachHints, len, 'none' as CoachHintMark);
  sources[index] = source;
  hints[index] = hint ?? 'none';
  entry.repsSource = sources.slice(0, len);
  entry.coachHints = hints.slice(0, len);
}
