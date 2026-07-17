/**
 * strength-block-to-plan — adapter: StrengthBlockResult → WorkoutPlan (Phase 3c).
 *
 * StrengthRunner consumes a parks `WorkoutPlan` (route.types) with 'station'
 * segments of enriched parks `Exercise`. The generator emits `WorkoutExercise`
 * (generator type) wrapping a CONTENT `Exercise` + a prescription (sets / reps /
 * rest / isTimeBased). This maps one block → one single-station WorkoutPlan.
 *
 * LOCAL + MINIMAL — no dependency on the protocol-blocks branch's mapper. Media
 * resolution reuses the shared Bunny helpers (exercise.types + bunny.config) so the
 * hybrid player resolves Bunny previews exactly like the regular strength path.
 */

import type { WorkoutExercise as GeneratedExercise } from '../logic/workout-generator.types';
import type { StrengthBlockResult } from '../core/pipeline/strength-block.service';
import type {
  WorkoutPlan,
  WorkoutSegment,
  Exercise as PlanExercise,
} from '@/features/parks/core/types/route.types';
import { resolvePreviewForLang } from '@/features/content/exercises/core/exercise.types';
import { buildBunnyStreamUrl, buildBunnyThumbnailUrl } from '@/lib/bunny/bunny.config';

/** Localized name off the content exercise (Firestore doc shape — dynamic access). */
function exName(we: GeneratedExercise): string {
  const ex = we.exercise as any;
  return ex?.content?.name?.he ?? ex?.content?.name ?? ex?.name?.he ?? ex?.name ?? ex?.id ?? 'תרגיל';
}

function exMedia(we: GeneratedExercise): { videoUrl?: string; imageUrl?: string; bunnyVideoId?: string } {
  const ex = we.exercise as any;
  // Bunny preview (NEW field) of the selected method, ABOVE the legacy root chain —
  // mirrors enrichExercise (A2). Carries the bare bunnyVideoId on the flat plan
  // exercise so the player resolves the network-aware ADAPTIVE stream (not fixed 360p)
  // and a Bunny-only exercise plays instead of showing an image. Legacy-only exercises
  // yield undefined here and fall through to the exact original chain (byte-identical).
  const bunnyPreview = resolvePreviewForLang(we.method?.media as any);
  const bunnyVideoId: string | undefined = bunnyPreview?.videoId ?? undefined;
  const bunnyStreamUrl: string | undefined = bunnyVideoId ? buildBunnyStreamUrl(bunnyVideoId) : undefined;
  const bunnyThumbUrl: string | undefined =
    bunnyPreview?.thumbnailUrl ?? (bunnyVideoId ? buildBunnyThumbnailUrl(bunnyVideoId) : undefined);
  const videoUrl: string | undefined = bunnyStreamUrl ?? ex?.media?.videoUrl ?? ex?.media?.mainVideoUrl ?? undefined;
  const imageUrl: string | undefined = bunnyThumbUrl ?? ex?.media?.imageUrl ?? videoUrl ?? undefined;
  return {
    ...(videoUrl ? { videoUrl } : {}),
    ...(imageUrl ? { imageUrl } : {}),
    ...(bunnyVideoId ? { bunnyVideoId } : {}),
  };
}

/** Display "3×8-12 חזרות" / "3×45 שניות" from the prescription. */
function prescriptionLabel(we: GeneratedExercise): { reps?: string; duration?: string } {
  const setsPrefix = we.sets ? `${we.sets}×` : '';
  const r = we.repsRange;
  const core = r ? (r.min !== r.max ? `${r.min}-${r.max}` : `${r.min}`) : `${we.reps}`;
  return we.isTimeBased
    ? { duration: `${setsPrefix}${core} שניות` }
    : { reps: `${setsPrefix}${core} חזרות` };
}

/** One generator exercise → one enriched parks Exercise (conditional spread).
 *  `preserveRole=false` (budget-split) forces 'main' — byte-identical to the
 *  historical single-segment plan. `preserveRole=true` (full-park) keeps the engine
 *  role so the warmup is distinguishable (StrengthRunner detects warmup by role /
 *  segment-title; the run-path filter strips it when the user skipped it). */
function toPlanExercise(we: GeneratedExercise, preserveRole: boolean): PlanExercise {
  const { reps, duration } = prescriptionLabel(we);
  return {
    id: we.exercise.id,
    name: exName(we),
    exerciseRole: preserveRole ? (we.exerciseRole ?? 'main') : 'main',
    exerciseType: we.isTimeBased ? 'time' : 'reps',
    isTimeBased: we.isTimeBased,
    sets: we.sets,
    restSeconds: we.restSeconds,
    ...(we.repsRange ? { repsRange: we.repsRange } : {}),
    ...(reps ? { reps } : {}),
    ...(duration ? { duration } : {}),
    ...(we.isGoalExercise ? { isGoalExercise: true } : {}),
    ...(we.rampedTarget != null ? { rampedTarget: we.rampedTarget } : {}),
    ...exMedia(we),
  };
}

/** Warmup segment id — matches the strip predicate the runner (active/page) uses. */
const WARMUP_SEGMENT_ID = 'warmup-segment';

export interface StrengthBlockPlanOptions {
  id?: string;
  name?: string;
  location?: WorkoutPlan['workoutLocation'];
  /**
   * Full-park GATE. When true: preserve exerciseRole, split warmup-role exercises into
   * their own 'warmup-segment' (title 'חימום'), and carry `isWarmupActive`. When
   * false/omitted (budget-split + every legacy caller): the historical single
   * 'hybrid-station' segment with 'main'-forced roles and `isWarmupActive:false` —
   * byte-identical, so budget-split runtime never moves.
   */
  fullPark?: boolean;
  /** Full-park only: false = the user skipped the warmup (carried onto the plan). */
  isWarmupActive?: boolean;
}

/**
 * Wrap a strength block as a WorkoutPlan for StrengthRunner. Blocks force straight
 * sets (no appliedProtocol). See `fullPark` for the two plan shapes.
 */
export function strengthBlockToWorkoutPlan(
  block: StrengthBlockResult,
  options: StrengthBlockPlanOptions = {},
): WorkoutPlan {
  const totalDuration = Math.round((block.estimatedDurationSec ?? 0) / 60) || 10;
  const name = options.name ?? 'תחנת כוח';

  // ── Budget-split + legacy callers: historical single-segment plan (byte-identical). ──
  if (!options.fullPark) {
    const exercises = block.exercises.map((we) => toPlanExercise(we, false));
    const segment: WorkoutSegment = {
      id: 'hybrid-station', type: 'station', title: name, icon: '💪',
      target: { type: 'reps', value: 12 }, exercises, isCompleted: false, restBetweenExercises: 10,
    };
    return {
      id: options.id ?? 'hybrid-station-plan', name, segments: [segment],
      totalDuration, difficulty: 'medium', trainingType: 'strength',
      workoutLocation: options.location ?? 'park', isWarmupActive: false,
    };
  }

  // ── Full-park: preserve roles + split the warmup into its own segment. ──
  const warmupEx = block.exercises.filter((we) => we.exerciseRole === 'warmup').map((we) => toPlanExercise(we, true));
  const restEx = block.exercises.filter((we) => we.exerciseRole !== 'warmup').map((we) => toPlanExercise(we, true));
  const segments: WorkoutSegment[] = [];
  if (warmupEx.length > 0) {
    segments.push({
      id: WARMUP_SEGMENT_ID, type: 'station', title: 'חימום', icon: '🤸',
      target: { type: 'reps', value: 12 }, exercises: warmupEx, isCompleted: false, restBetweenExercises: 10,
    });
  }
  segments.push({
    id: 'hybrid-station', type: 'station', title: name, icon: '💪',
    target: { type: 'reps', value: 12 }, exercises: restEx, isCompleted: false, restBetweenExercises: 10,
  });
  return {
    id: options.id ?? 'hybrid-station-plan', name, segments,
    totalDuration, difficulty: 'medium', trainingType: 'strength',
    workoutLocation: options.location ?? 'park', isWarmupActive: options.isWarmupActive ?? true,
  };
}
