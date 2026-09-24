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
import { resolveExerciseMedia } from '@/features/workout-engine/shared/utils/media-resolution.utils';
import type { ExternalVideo } from '@/features/content/exercises/core/exercise.types';

/** Localized name off the content exercise (Firestore doc shape — dynamic access). */
function exName(we: GeneratedExercise): string {
  const ex = we.exercise as any;
  return ex?.content?.name?.he ?? ex?.content?.name ?? ex?.name?.he ?? ex?.name ?? ex?.id ?? 'תרגיל';
}

function exMedia(we: GeneratedExercise): { videoUrl?: string; imageUrl?: string; bunnyVideoId?: string; fullTutorial?: ExternalVideo | null } {
  // Centralised through resolveExerciseMedia: it reads the ENGINE-selected method's Bunny
  // id from ALL slots (previewVideo → bunnyVideoId_mainVideoUrl → mainVideoUrl) before root,
  // and returns the bare id for adaptive playback + a same-method Bunny thumbnail.
  // #3: also carry fullTutorial — resolveExerciseMedia already resolves it (identical to
  // buildRunnerWorkoutPlanFromGenerated:141). Dropping it here is why the "צפה בהסבר המלא"
  // CTA was missing on hybrid-station main + warmup exercises. Purely additive.
  const { videoUrl, imageUrl, bunnyVideoId, fullTutorial } = resolveExerciseMedia(we.exercise as any, we.method as any);
  return {
    ...(videoUrl ? { videoUrl } : {}),
    ...(imageUrl ? { imageUrl } : {}),
    ...(bunnyVideoId ? { bunnyVideoId } : {}),
    ...(fullTutorial ? { fullTutorial } : {}),
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
 * sets (no appliedProtocol) — UNLESS `block.tabataBlocks` is present (22.09.2026,
 * field-test docs 32/33), in which case each tabata block becomes its own
 * 'station' segment carrying `protocol:'tabata'` + `protocolConfig` (fields
 * WorkoutSegment already defines — the player already dispatches on them
 * generically, per that type's own doc comment; this mapper previously just
 * never populated them for the hybrid path). See `fullPark` for the two
 * (pre-existing) straight-sets plan shapes.
 */
export function strengthBlockToWorkoutPlan(
  block: StrengthBlockResult,
  options: StrengthBlockPlanOptions = {},
): WorkoutPlan {
  const totalDuration = Math.round((block.estimatedDurationSec ?? 0) / 60) || 10;
  const name = options.name ?? 'תחנת כוח';

  // ── Locked station (domain-assessment gate, David 23-24.09.2026) — this
  // station's domain(s) aren't assessed and no equipment-based alternative
  // applied. Zero exercises BY DESIGN (not the same as an empty/skipped
  // station — the caller keeps this segment in the plan; the run screen
  // renders a lock card off `needsAssessment` instead of exercise content).
  if (block.needsAssessment) {
    const segment: WorkoutSegment = {
      id: 'hybrid-station-locked', type: 'station', title: name, icon: '🔒',
      target: { type: 'reps', value: 0 }, exercises: [], isCompleted: false, restBetweenExercises: 0,
      needsAssessment: block.needsAssessment,
    };
    return {
      id: options.id ?? 'hybrid-station-plan', name, segments: [segment],
      totalDuration: 0, difficulty: 'medium', trainingType: 'strength',
      workoutLocation: options.location ?? 'park', isWarmupActive: false,
    };
  }

  // ── Tabata blocks (core-station wiring, 22.09.2026) — one segment per
  // block, each scoped to its own exerciseIds slice, in play order. Rest
  // between blocks (station-core-tabata.ts's
  // REST_BETWEEN_STATION_TABATA_BLOCKS_SEC) is already folded into
  // block.estimatedDurationSec by the caller — this mapper doesn't need to
  // know that number, only that consecutive segments ARE the blocks in
  // order. Takes priority over `fullPark` (tabata stations are a
  // budget-split/route-stops-only feature today per David's decision —
  // full_park_workout never sets block.tabataBlocks, since it doesn't call
  // dispatchStopContent's 'core' branch at all).
  if (block.tabataBlocks && block.tabataBlocks.length > 0) {
    const byId = new Map(block.exercises.map((we) => [we.exercise.id, we]));
    const segments: WorkoutSegment[] = block.tabataBlocks.map((spec, i) => {
      const members = spec.exerciseIds
        .map((id) => byId.get(id))
        .filter((we): we is GeneratedExercise => we != null)
        .map((we) => toPlanExercise(we, false));
      const multi = block.tabataBlocks!.length > 1;
      return {
        id: `hybrid-station-tabata-${i}`,
        type: 'station',
        title: multi ? `${name} — סבב ${i + 1} מתוך ${block.tabataBlocks!.length}` : name,
        icon: '⏱️',
        target: { type: 'time', value: spec.config.workSec * spec.config.rounds },
        exercises: members,
        isCompleted: false,
        restBetweenExercises: 0, // tabata's own rest (spec.config.restSec) is the player's interval clock, not an inter-exercise pause
        protocol: 'tabata',
        protocolConfig: spec.config,
        // Equipment-tabata nudge (domain-assessment gate, David 23-24.09.2026):
        // real content from real machines, with an invite to also assess the
        // bodyweight complement. Additive — never on the pre-existing core-tabata path.
        ...(block.assessmentNudge ? { assessmentNudge: block.assessmentNudge } : {}),
      };
    });
    return {
      id: options.id ?? 'hybrid-station-plan', name, segments,
      totalDuration, difficulty: 'medium', trainingType: 'strength',
      workoutLocation: options.location ?? 'park', isWarmupActive: false,
    };
  }

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
