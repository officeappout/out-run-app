'use client';

import { useMemo } from 'react';
import type { MutableRefObject } from 'react';
import type { PyramidStep } from '@/features/workout-engine/logic/workout-generator.types';
import { resolveTutorialForLang } from '@/features/content/exercises/core/exercise.types';
import type { ExternalVideo } from '@/features/content/exercises/core/exercise.types';

/**
 * useExerciseDerivedValues — all 20+ display-value memos in one isolated hook
 * (Refactoring Step SM-3).
 *
 * Absorbs every pure derivation from section [E] of useWorkoutStateMachine.ts:
 * exerciseType, isFollowAlongMode, exerciseDuration, segmentRestTime,
 * targetReps, repsRangeMin, repsRangeMax, dynamicTarget, autoCompleteTime,
 * totalExercises, globalExerciseIndex, progressBars, exerciseName,
 * executionSteps, exerciseGoal, muscleGroups, exerciseVideoUrl, nextExercise,
 * repsOrDurationText, lastSavedReps, setsForCurrentExercise, isUnilateralTimed.
 *
 * Zero state, zero side-effects — every value is a pure derivation of inputs.
 * Callers own the cursor state; this hook only reads it.
 *
 * `NextExerciseInfo` is defined here (it was previously in the orchestrator)
 * and re-exported from `useWorkoutStateMachine.ts` for backward compatibility.
 */

// ============================================================================
// SHARED TYPES (exported so orchestrator can re-export them for back-compat)
// ============================================================================

export interface NextExerciseInfo {
  name: string;
  videoUrl: string | null;
  /** Bare Bunny video UUID — used by useNetworkAwareStreamUrl for quality selection. */
  bunnyVideoId: string | null;
  imageUrl: string | null;
  equipment: string[];
  reps?: string;
  duration?: string;
  exerciseType: string;
  executionSteps: string[];
  muscleGroups: { primary: string[]; secondary: string[] };
  exerciseGoal: string | null;
  /** Notification text from the matching execution method */
  notificationText: string | null;
}

// ============================================================================
// HOOK TYPES
// ============================================================================

export interface ExerciseDerivedValuesInput {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  workout: any;
  currentSegmentIndex: number;
  currentExerciseIndex: number;
  currentSetIndex: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  activeExercise: any; // WorkoutExercise | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  currentSegment: any; // WorkoutSegment | undefined
  exerciseHistoryMap?: Record<string, number[]>;
  /** Active pyramid step from usePyramidManager (null for non-pyramid sets). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pyramidStep: any; // PyramidStep | null
  /** Reactive counter — bumped on every log save; drives globalExerciseIndex recompute. */
  logVersion: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  exerciseLogRef: MutableRefObject<any[]>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getExercises: (seg: any) => any[] | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getSetsForExercise: (ex: any) => number;
}

export interface ExerciseDerivedValuesResult {
  isFollowAlongMode: boolean;
  exerciseType: 'reps' | 'time' | 'follow-along';
  /** True when the active exercise is unilateral AND time-based (two-phase timer). */
  isUnilateralTimed: boolean;
  segmentRestTime: number;
  exerciseDuration: number;
  targetReps: number | null;
  repsRangeMin: number | null;
  repsRangeMax: number | null;
  dynamicTarget: number | null;
  autoCompleteTime: number;
  /** Total "steps" = sum of (sets per exercise) across all segments. */
  totalExercises: number;
  /** Monotonic log-based set counter — never decreases on A↔B superset swaps. */
  globalExerciseIndex: number;
  progressBars: Array<{ isActive: boolean; isCurrent: boolean }>;
  exerciseName: string;
  executionSteps: string[];
  exerciseGoal: string | null;
  muscleGroups: { primary: string[]; secondary: string[] };
  exerciseVideoUrl: string | null;
  /** Bare Bunny video UUID for the active exercise — drives network-aware resolution. */
  exerciseBunnyVideoId: string | null;
  /** Long-form instructional video for the active exercise, if uploaded. Drives the "צפה בהסבר המלא" CTA. */
  exerciseFullTutorial: ExternalVideo | null;
  nextExercise: NextExerciseInfo;
  repsOrDurationText: string;
  /** Last confirmed reps for the current exercise (previous set), for picker pre-fill. */
  lastSavedReps: number | null;
  /** Total sets for the active exercise (drives round pills + totalRounds). */
  setsForCurrentExercise: number;
}

// ============================================================================
// HOOK
// ============================================================================

export function useExerciseDerivedValues({
  workout,
  currentSegmentIndex,
  currentExerciseIndex,
  currentSetIndex,
  activeExercise,
  currentSegment,
  exerciseHistoryMap,
  pyramidStep,
  logVersion,
  exerciseLogRef,
  getExercises,
  getSetsForExercise,
}: ExerciseDerivedValuesInput): ExerciseDerivedValuesResult {

  // ── Total sets for the currently active exercise ────────────────────────
  const setsForCurrentExercise = useMemo(() => {
    const segment = workout.segments[currentSegmentIndex];
    const exercises = getExercises(segment);
    const ex = exercises?.[currentExerciseIndex] ?? activeExercise;
    return getSetsForExercise(ex);
  }, [workout, currentSegmentIndex, currentExerciseIndex, activeExercise, getExercises, getSetsForExercise]);

  // ── Follow-along detection ──────────────────────────────────────────────
  const isFollowAlongMode = useMemo(() => {
    const title = (currentSegment as any)?.title || '';
    if (title.includes('חימום') || title.toLowerCase().includes('warmup')) return true;
    if (title.includes('קירור') || title.toLowerCase().includes('cooldown')) return true;
    if (activeExercise?.exerciseRole === 'warmup' || activeExercise?.exerciseRole === 'cooldown') return true;
    return activeExercise?.isFollowAlong === true;
  }, [activeExercise, currentSegment]);

  // ── Exercise type resolution ────────────────────────────────────────────
  const exerciseType = useMemo<'reps' | 'time' | 'follow-along'>(() => {
    if (isFollowAlongMode) return 'follow-along';
    if (activeExercise?.exerciseType === 'time') return 'time';
    if (activeExercise?.exerciseType === 'reps') return 'reps';
    if ((currentSegment as any)?.target?.type === 'reps') return 'reps';
    if ((currentSegment as any)?.target?.type === 'time') return 'time';
    if (activeExercise?.reps) return 'reps';
    if (activeExercise?.duration) return 'time';
    return 'reps';
  }, [activeExercise, currentSegment, isFollowAlongMode]);

  // Unilateral timed exercises need a two-phase (right → left) timer sequence.
  const isUnilateralTimed = activeExercise?.symmetry === 'unilateral' && exerciseType === 'time';

  // ── Segment rest time ───────────────────────────────────────────────────
  const segmentRestTime = useMemo(() => {
    if (isFollowAlongMode) return 0;
    const exerciseRest = (activeExercise as any)?.restSeconds;
    if (typeof exerciseRest === 'number' && exerciseRest > 0) return exerciseRest;
    const segment = workout.segments[currentSegmentIndex];
    if (typeof segment?.restBetweenExercises === 'number') return segment.restBetweenExercises;
    return 90;
  }, [workout, currentSegmentIndex, isFollowAlongMode, activeExercise]);

  // ── Exercise duration (time exercises + pyramid hold override) ──────────
  const exerciseDuration = useMemo(() => {
    // Pyramid/Max-Set step: each step carries its own hold target.
    if ((pyramidStep as PyramidStep | null)?.targetHold != null) {
      return (pyramidStep as PyramidStep).targetHold!;
    }
    if (exerciseType === 'time' || exerciseType === 'follow-along') {
      if ((currentSegment as any)?.target?.type === 'time') return (currentSegment as any).target.value;
      const durationStr = activeExercise?.duration;
      if (durationStr) {
        const match = durationStr.match(/(\d+)/);
        return match ? parseInt(match[1], 10) : 30;
      }
      return 30;
    }
    return 0;
  }, [exerciseType, currentSegment, activeExercise, pyramidStep]);

  // ── Reps parsing intermediates ──────────────────────────────────────────
  /** Strip round multiplier ("3x8" → "8", "3x6-8" → "6-8") before parsing. */
  const strippedReps = useMemo(() => {
    const raw = activeExercise?.reps;
    if (!raw) return raw;
    return raw.replace(/^\d+\s*[xX×]\s*/, '');
  }, [activeExercise]);

  // ── Target reps ─────────────────────────────────────────────────────────
  const targetReps = useMemo(() => {
    // Pyramid step takes absolute priority — each set has its own target.
    const step = pyramidStep as PyramidStep | null;
    if (step) {
      if (typeof step.targetReps === 'number') return step.targetReps;
      if (typeof step.targetHold === 'number') return step.targetHold;
    }
    // Repetition Pyramid (same exercise, varying reps via repsSequence)
    const repsSeq = (activeExercise as any)?.repsSequence as number[] | undefined;
    if (repsSeq && repsSeq.length > 0 && currentSetIndex < repsSeq.length) {
      return repsSeq[currentSetIndex];
    }
    if (exerciseType === 'reps') {
      if (strippedReps) {
        const match = strippedReps.match(/(\d+)/);
        return match ? parseInt(match[1], 10) : null;
      }
      if ((currentSegment as any)?.target?.type === 'reps') return (currentSegment as any).target.value;
    }
    return null;
  }, [exerciseType, currentSegment, strippedReps, pyramidStep, activeExercise, currentSetIndex]);

  /**
   * Upper bound of the reps range.
   * Prefers structured `repsRange.max` from the engine, falls back to string parsing.
   */
  const repsRangeMax = useMemo(() => {
    if (exerciseType !== 'reps') return null;
    const structured = (activeExercise as any)?.repsRange?.max as number | undefined;
    if (typeof structured === 'number') return structured;
    if (!strippedReps) return null;
    const match = strippedReps.match(/(\d+)\s*[-–]\s*(\d+)/);
    if (!match) return null;
    return parseInt(match[2], 10);
  }, [exerciseType, activeExercise, strippedReps]);

  /**
   * Lower bound of the reps range — the strict minimum the user should hit.
   * Prefers structured `repsRange.min`, falls back to `targetReps`.
   */
  const repsRangeMin = useMemo(() => {
    if (exerciseType !== 'reps') return null;
    const structured = (activeExercise as any)?.repsRange?.min as number | undefined;
    if (typeof structured === 'number') return structured;
    return targetReps;
  }, [exerciseType, activeExercise, targetReps]);

  /**
   * Smart target: if all last-session sets hit `targetReps`, nudge up by 1
   * (clamped to `repsRangeMax`). Otherwise stays at `targetReps`.
   */
  const dynamicTarget = useMemo(() => {
    if (targetReps === null) return null;
    if (!activeExercise || !exerciseHistoryMap) return targetReps;
    const lastReps = exerciseHistoryMap[activeExercise.id];
    if (!lastReps || lastReps.length === 0) return targetReps;
    const allHitTarget = lastReps.every((r) => r >= targetReps);
    if (!allHitTarget) return targetReps;
    const ceiling = repsRangeMax ?? targetReps;
    return Math.min(targetReps + 1, ceiling);
  }, [targetReps, activeExercise, exerciseHistoryMap, repsRangeMax]);

  const autoCompleteTime = useMemo(() => {
    if (exerciseType === 'time' && exerciseDuration > 0) return exerciseDuration;
    if (exerciseType === 'reps' && targetReps && targetReps > 0) {
      return Math.max(targetReps * 2.5 + 5, 10);
    }
    return 30;
  }, [exerciseType, targetReps, exerciseDuration]);

  // ── Progress tracking ───────────────────────────────────────────────────
  /**
   * Total "steps" = sum of (sets per exercise) across all segments.
   * Each exercise contributes its own set count.
   */
  const totalExercises = useMemo(
    () =>
      workout.segments.reduce((total: number, segment: any) => {
        const exercises = getExercises(segment);
        if (!exercises) return total;
        return total + exercises.reduce((sum: number, ex: any) => sum + getSetsForExercise(ex), 0);
      }, 0),
    [workout, getExercises, getSetsForExercise],
  );

  /**
   * Monotonic chronological set counter — total confirmed set saves so far.
   *
   * Formula counts confirmed log entries rather than deriving from cursor
   * indices: non-monotonic on A↔B superset swaps (the old formula would
   * flash forward then backward in the story bars).  logVersion bumps on
   * every save so this memo always reflects the live log state.
   */
  const globalExerciseIndex = useMemo(
    () => exerciseLogRef.current.reduce((total: number, entry: any) => total + entry.confirmedReps.length, 0),
    [logVersion], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const progressBars = useMemo(
    () =>
      Array.from({ length: totalExercises }, (_, i) => ({
        isActive: i < globalExerciseIndex,
        isCurrent: i === globalExerciseIndex,
      })),
    [totalExercises, globalExerciseIndex],
  );

  // ── Exercise display values ─────────────────────────────────────────────
  const exerciseName = useMemo(
    () => (pyramidStep as PyramidStep | null)?.name || activeExercise?.name || 'טוען...',
    [activeExercise, pyramidStep],
  );

  const executionSteps = useMemo(() => {
    if (Array.isArray(activeExercise?.highlights)) return activeExercise.highlights as string[];
    if (Array.isArray(activeExercise?.instructions)) return activeExercise.instructions as string[];
    return [] as string[];
  }, [activeExercise]);

  const exerciseGoal = useMemo(
    () => (activeExercise?.goal || activeExercise?.description || null) as string | null,
    [activeExercise],
  );

  const muscleGroups = useMemo<{ primary: string[]; secondary: string[] }>(() => {
    if (!activeExercise?.muscleGroups || !Array.isArray(activeExercise.muscleGroups)) {
      return { primary: [], secondary: [] };
    }
    return {
      primary: activeExercise.muscleGroups[0] ? [activeExercise.muscleGroups[0]] : [],
      secondary: activeExercise.muscleGroups.slice(1),
    };
  }, [activeExercise]);

  /**
   * Exhaustive media resolution (5-level search):
   * 1. pyramidStep.videoSrc (per-step variant video — takes priority)
   * 2. exercise.videoUrl (pre-resolved by home/page.tsx)
   * 3. All execution_methods — first mainVideoUrl or videoUrl
   * 4. exercise-level media.videoUrl / media.mainVideoUrl
   * 5. exercise.imageUrl → Firestore field aliases (coverImage, thumbnailUrl)
   */
  const exerciseVideoUrl = useMemo(() => {
    const pyramidVideoSrc = (pyramidStep as PyramidStep | null)?.videoSrc ?? null;
    if (pyramidVideoSrc) return pyramidVideoSrc;
    if (activeExercise?.videoUrl) return activeExercise.videoUrl as string;
    const raw = activeExercise as any;
    const methods = raw?.execution_methods || raw?.executionMethods || raw?.methods || [];
    for (const m of methods) {
      const url = m?.media?.mainVideoUrl || m?.media?.videoUrl;
      if (url) return url as string;
    }
    if (raw?.media?.videoUrl) return raw.media.videoUrl as string;
    if (raw?.media?.mainVideoUrl) return raw.media.mainVideoUrl as string;
    if (activeExercise?.imageUrl) return activeExercise.imageUrl as string;
    if (raw?.media?.imageUrl) return raw.media.imageUrl as string;
    if (raw?.coverImage) return raw.coverImage as string;
    if (raw?.thumbnailUrl) return raw.thumbnailUrl as string;

    const name = typeof activeExercise?.name === 'string'
      ? activeExercise.name
      : (raw?.name?.he || activeExercise?.id || 'unknown');
    console.error(`[Media FAIL] No media found for active exercise: ${name}`);
    return null;
  }, [activeExercise, pyramidStep]);

  /**
   * Bare Bunny video UUID for the active exercise.
   * Primary source: method.media.previewVideo.he.videoId (written by sync-media-status.js).
   * Fallback: UUID extracted from mainVideoUrl path segment.
   * Null for YouTube / legacy URLs — the network-aware hook is a no-op in those cases.
   */
  const exerciseBunnyVideoId = useMemo((): string | null => {
    const raw = activeExercise as any;
    // Carried by the plan flatten (A2) — survives execution_methods stripping, so the
    // enriched live card resolves the network-aware Bunny stream instead of a fixed-360p
    // legacy URL. Legacy-only exercises have no carried id and fall through unchanged.
    if (raw?.bunnyVideoId && typeof raw.bunnyVideoId === 'string') return raw.bunnyVideoId;
    const methods = raw?.execution_methods || raw?.executionMethods || raw?.methods || [];
    for (const m of methods) {
      const vid = m?.media?.previewVideo?.he?.videoId ?? m?.media?.bunnyVideoId_mainVideoUrl;
      if (vid && typeof vid === 'string') return vid;
    }
    // Fallback: extract UUID from the mainVideoUrl path
    const mainUrl: string | undefined =
      raw?.media?.mainVideoUrl || methods[0]?.media?.mainVideoUrl;
    if (mainUrl) {
      const m = mainUrl.match(/\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\//i);
      if (m) return m[1];
    }
    return null;
  }, [activeExercise]);

  /**
   * Long-form instructional video ("full tutorial") for the active exercise.
   * Searched per execution method first (Lego-block: video binds to the method),
   * then falls back to the exercise-root media slot. Resolves the HE track (with
   * the built-in HE fallback in resolveTutorialForLang). Null when none uploaded —
   * the "צפה בהסבר המלא" CTA is hidden in that case.
   */
  const exerciseFullTutorial = useMemo((): ExternalVideo | null => {
    const raw = activeExercise as any;
    // Preferred: the value pre-resolved at plan-build time (enrichExercise /
    // convertExercisesToWorkoutPlan). The flattened plan Exercise carries no
    // execution_methods, so this is the ONLY source on the active-session path.
    if (raw?.fullTutorial?.videoId) return raw.fullTutorial as ExternalVideo;
    // Fallback for any entry path that passes a full Firestore exercise.
    const methods = raw?.execution_methods || raw?.executionMethods || raw?.methods || [];
    for (const m of methods) {
      const t = resolveTutorialForLang(m?.media, 'he');
      if (t?.videoId) return t;
    }
    const rootTutorial = resolveTutorialForLang(raw?.media, 'he');
    return rootTutorial?.videoId ? rootTutorial : null;
  }, [activeExercise]);

  /**
   * nextExercise — look-ahead for the rest-screen preview.
   *
   * Priority order:
   *   1. Superset A→B or B→A based on pairedWith position
   *   2. Straight sets: more sets → same exercise; else next exercise / segment
   *
   * Pyramid look-ahead: when the next step is the SAME exercise, swaps the
   * displayed name/video to the upcoming pyramid variant.
   */
  const nextExercise = useMemo<NextExerciseInfo>(() => {
    const currentExercises = getExercises(currentSegment);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let exercise: any = null;

    const currentEx = currentExercises?.[currentExerciseIndex] ?? null;
    const setsForCurrent = getSetsForExercise(currentEx);

    // ── Superset: predict next based on pair position ──────────────────────
    const pairedId = (currentEx as any)?.pairedWith as string | null | undefined;
    if (pairedId && currentExercises) {
      const pairedIndex = currentExercises.findIndex((e: any) => e.id === pairedId);
      if (pairedIndex !== -1) {
        const isFirstInPair = pairedIndex > currentExerciseIndex;
        if (isFirstInPair) {
          exercise = currentExercises[pairedIndex]; // A → B (same round)
        } else {
          if (currentSetIndex < setsForCurrent - 1) {
            exercise = currentExercises[pairedIndex]; // B → A (next round)
          } else {
            exercise = currentExercises[currentExerciseIndex + 1] ?? null;
            if (!exercise) {
              for (let i = currentSegmentIndex + 1; i < workout.segments.length; i++) {
                const nextExercises = getExercises(workout.segments[i]);
                if (nextExercises && nextExercises.length > 0) { exercise = nextExercises[0]; break; }
              }
            }
          }
        }
      }
    } else if (currentSetIndex < setsForCurrent - 1) {
      exercise = currentEx; // more sets of same exercise
    } else if (currentExercises && currentExerciseIndex + 1 < currentExercises.length) {
      exercise = currentExercises[currentExerciseIndex + 1];
    } else {
      for (let i = currentSegmentIndex + 1; i < workout.segments.length; i++) {
        const nextExercises = getExercises(workout.segments[i]);
        if (nextExercises && nextExercises.length > 0) { exercise = nextExercises[0]; break; }
      }
    }

    // ── Pyramid look-ahead ─────────────────────────────────────────────────
    // When the next exercise is the SAME object (continuing pyramid), override
    // name/video with the upcoming pyramid step so the rest-screen preview
    // shows the next variant rather than the current one.
    const nextPyramidStep: PyramidStep | null = (() => {
      if (exercise !== currentEx) return null;
      const seq = (currentEx as any)?.pyramidSequence as PyramidStep[] | undefined;
      if (!seq || seq.length === 0) return null;
      return seq[currentSetIndex + 1] ?? null;
    })();

    const nextSteps: string[] = (() => {
      if (Array.isArray(exercise?.highlights)) return exercise.highlights as string[];
      if (Array.isArray(exercise?.instructions)) return exercise.instructions as string[];
      return [];
    })();

    const nextMuscles = (() => {
      if (!exercise?.muscleGroups || !Array.isArray(exercise.muscleGroups)) {
        return { primary: [] as string[], secondary: [] as string[] };
      }
      return {
        primary: exercise.muscleGroups[0] ? [exercise.muscleGroups[0]] : [],
        secondary: exercise.muscleGroups.slice(1) as string[],
      };
    })();

    const resolvedMedia = (() => {
      if (!exercise) return { video: null, image: null, bunnyVideoId: null };
      const raw = exercise as any;
      const methods: any[] = raw.execution_methods || raw.executionMethods || [];
      let video: string | null = exercise.videoUrl || null;
      let image: string | null = exercise.imageUrl || null;
      // Prefer the id carried through the flatten (A2), so a Bunny-only NEXT exercise
      // whose execution_methods were stripped still yields a Bunny id for the rest-preview.
      let bunnyVideoId: string | null = (raw.bunnyVideoId as string | undefined) ?? null;
      if (!video || !image || !bunnyVideoId) {
        for (const m of methods) {
          if (!video) video = m?.media?.mainVideoUrl || m?.media?.videoUrl || null;
          if (!image) image = m?.media?.imageUrl || null;
          if (!bunnyVideoId) {
            bunnyVideoId =
              m?.media?.previewVideo?.he?.videoId ??
              m?.media?.bunnyVideoId_mainVideoUrl ??
              null;
          }
        }
      }
      // Fallback: extract UUID from mainVideoUrl path
      if (!bunnyVideoId && video) {
        const match = video.match(/\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\//i);
        if (match) bunnyVideoId = match[1];
      }
      if (!image && raw.media?.imageUrl) image = raw.media.imageUrl;
      if (!image && video) image = video;
      return { video, image, bunnyVideoId };
    })();

    return {
      name: nextPyramidStep?.name || exercise?.name || 'סיום האימון',
      videoUrl: nextPyramidStep?.videoSrc || resolvedMedia.video,
      bunnyVideoId: resolvedMedia.bunnyVideoId,
      imageUrl: resolvedMedia.image,
      equipment: exercise?.equipment || [],
      reps: exercise?.reps,
      duration: exercise?.duration,
      exerciseType: exercise?.exerciseType || 'reps',
      executionSteps: nextSteps,
      muscleGroups: nextMuscles,
      exerciseGoal: exercise?.goal || exercise?.description || null,
      notificationText: (() => {
        const methods =
          (exercise as any)?.execution_methods ||
          (exercise as any)?.executionMethods ||
          [];
        for (const m of methods) {
          const nt = m.notificationText;
          if (!nt) continue;
          if (typeof nt === 'string') return nt;
          if (typeof nt.he === 'string' && nt.he.trim()) return nt.he as string;
          if (typeof nt.en === 'string' && nt.en.trim()) return nt.en as string;
          if (typeof nt.male === 'string' && nt.male.trim()) return nt.male as string;
          if (typeof nt.female === 'string' && nt.female.trim()) return nt.female as string;
        }
        return null;
      })(),
    };
  }, [workout, currentSegment, currentExerciseIndex, currentSegmentIndex, currentSetIndex, getSetsForExercise, getExercises]);

  // ── Coaching label (shown on the active exercise card) ──────────────────
  const repsOrDurationText = useMemo(() => {
    const step = pyramidStep as PyramidStep | null;
    if (step) {
      const val = step.targetHold ?? step.targetReps;
      const unit = step.targetHold != null ? 'שניות' : 'חזרות';
      return val != null ? `${val} ${unit}` : '';
    }
    if (exerciseType === 'time') return activeExercise?.duration || '';
    if (exerciseType === 'reps') return strippedReps || '';
    return '';
  }, [activeExercise, exerciseType, strippedReps, pyramidStep]);

  /**
   * Last confirmed reps for the current exercise (most recent entry in the log).
   * Used by the picker to default to the last saved value on subsequent sets.
   * `currentSetIndex` is in the dep array to force a re-read when the set
   * advances (even though the log is a ref — logVersion would also work).
   */
  const lastSavedReps = useMemo(() => {
    if (!activeExercise) return null;
    const segId = workout.segments[currentSegmentIndex]?.id || String(currentSegmentIndex);
    const entry = exerciseLogRef.current.find(
      (e: any) => e.exerciseId === activeExercise.id && e.segmentId === segId,
    );
    if (entry && entry.confirmedReps.length > 0) {
      return entry.confirmedReps[entry.confirmedReps.length - 1] as number;
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeExercise, workout.segments, currentSegmentIndex, currentSetIndex]);

  // ── Return ──────────────────────────────────────────────────────────────

  return {
    isFollowAlongMode,
    exerciseType,
    isUnilateralTimed,
    segmentRestTime,
    exerciseDuration,
    targetReps,
    repsRangeMin,
    repsRangeMax,
    dynamicTarget,
    autoCompleteTime,
    totalExercises,
    globalExerciseIndex,
    progressBars,
    exerciseName,
    executionSteps,
    exerciseGoal,
    muscleGroups,
    exerciseVideoUrl,
    exerciseBunnyVideoId,
    exerciseFullTutorial,
    nextExercise,
    repsOrDurationText,
    lastSavedReps,
    setsForCurrentExercise,
  };
}
