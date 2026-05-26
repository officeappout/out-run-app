'use client';

import React, { useCallback, useMemo } from 'react';
import { Loader2, Share2, Heart, ArrowDownCircle } from 'lucide-react';
import {
  type Exercise as FirestoreExercise,
  getLocalizedText,
} from '@/features/content/exercises';
import type {
  GeneratedWorkout,
  WorkoutExercise as EngineWorkoutExercise,
} from '@/features/workout-engine/logic/WorkoutGenerator';
import { useCachedMediaMap } from '@/features/favorites/hooks/useCachedMedia';
import DifficultyBolts from '@/features/workout-engine/components/DifficultyBolts';
import DrawerEquipmentBadge from '../DrawerEquipmentBadge';
import DrawerMuscleBadge from '../DrawerMuscleBadge';
import DownloadProgressCircle from '../DownloadProgressCircle';
import ExerciseCard from './ExerciseCard';
import PyramidStepCard from './PyramidStepCard';
import SectionHeader from './SectionHeader';
import { groupExercisesIntoSections } from '../../utils/section-grouping.utils';
import {
  collectEquipment,
  collectMuscles,
} from '../../utils/equipment-collection.utils';
import { resolveExerciseImage } from '../../utils/exercise-display.utils';
import type { PyramidStep, WorkoutActions } from '../../types';

// Local duplicate of the orchestrator's pill border constant.  Tiny one-line
// string — duplicated rather than imported to keep this module self-contained
// (no circular import with WorkoutPreviewDrawer.tsx).
const PILL_BORDER_DRAWER = '0.5px solid #E0E9FF';

export interface GeneratedWorkoutExerciseListProps {
  generatedWorkout: GeneratedWorkout;
  /**
   * Full Firestore exercise documents.  Indexed by id at lookup time so
   * the pyramid step tap handler can resolve a step's `exerciseId` to its
   * OWN video / coaching cues — not the parent seed's.  May be empty while
   * the pool is still loading; in that case the handler falls back to the
   * parent wrapper (legacy behaviour).
   */
  exercisePool: FirestoreExercise[];
  onSwap?: (exercise: FirestoreExercise, level: number) => void;
  /** Per-step swap with twin-sync for pyramid exercises. */
  onSwapPyramidStep?: (
    parent: EngineWorkoutExercise,
    stepIndex: number,
  ) => void;
  onExerciseTap?: (ex: EngineWorkoutExercise) => void;
  /** Warmup accordion — collapse/expand of the cards body. */
  isWarmupExpanded: boolean;
  /** Warmup accordion — whether the warmup block runs at all. */
  isWarmupActive: boolean;
  onToggleWarmupExpanded: () => void;
  onToggleWarmupActive: () => void;
  actions?: WorkoutActions;
}

/**
 * Renders the entire generated-workout body inside the drawer's scroll
 * area:
 *
 *   1. Top action row — difficulty / duration pills + share / favorite /
 *      download buttons.
 *   2. Description paragraph.
 *   3. Equipment chips strip.
 *   4. Muscles chips strip.
 *   5. Section blocks (warmup, supersets, pyramids, straight sets) —
 *      each rendered via `<SectionHeader />` followed by the appropriate
 *      `<ExerciseCard />` or `<PyramidStepCard />` cards.
 *   6. Optional volume-adjustment badge (autoregulation feedback).
 *
 * All heavy data shaping (section grouping, equipment collection, media
 * URL cache map) is memoised against `generatedWorkout.exercises` so the
 * outer scroll-driven parent re-renders don't recompute them.
 */
export default function GeneratedWorkoutExerciseList({
  generatedWorkout,
  exercisePool,
  onSwap,
  onSwapPyramidStep,
  onExerciseTap,
  isWarmupExpanded,
  isWarmupActive,
  onToggleWarmupExpanded,
  onToggleWarmupActive,
  actions,
}: GeneratedWorkoutExerciseListProps) {
  const sections = useMemo(
    () => groupExercisesIntoSections(generatedWorkout.exercises),
    [generatedWorkout.exercises],
  );
  const equipment = useMemo(
    () => collectEquipment(generatedWorkout.exercises),
    [generatedWorkout.exercises],
  );
  const muscles = useMemo(
    () => collectMuscles(generatedWorkout.exercises),
    [generatedWorkout.exercises],
  );

  // ── Pyramid Step → Full Exercise Lookup ──────────────────────────────────
  // Build an id-indexed map of the global Firestore pool so each pyramid
  // step card can synthesise its OWN EngineWorkoutExercise wrapper at tap
  // time.  Without this, every step closes over the parent `ex` from the
  // outer .flatMap, hijacking the detail drawer to the parent seed.
  const exercisePoolById = useMemo(() => {
    const m = new Map<string, FirestoreExercise>();
    for (const ex of exercisePool) m.set(ex.id, ex);
    return m;
  }, [exercisePool]);

  const handlePyramidStepTap = useCallback(
    (
      parent: EngineWorkoutExercise,
      step: { exerciseId: string; level?: number },
    ) => {
      if (!onExerciseTap) return;
      if (step.exerciseId === parent.exercise.id) {
        onExerciseTap(parent);
        return;
      }
      const stepExercise = exercisePoolById.get(step.exerciseId);
      if (!stepExercise) {
        console.warn(
          `[PyramidStepTap] No pool entry for step.exerciseId="${step.exerciseId}" — ` +
            `falling back to parent "${parent.exercise.id}".`,
        );
        onExerciseTap(parent);
        return;
      }
      const stepMethod =
        stepExercise.execution_methods?.find((m) => m.location === 'home') ??
        stepExercise.execution_methods?.[0] ??
        parent.method;
      const synthesized: EngineWorkoutExercise = {
        ...parent,
        exercise: stepExercise,
        method: stepMethod as any,
        programLevel: step.level ?? parent.programLevel,
      };
      onExerciseTap(synthesized);
    },
    [exercisePoolById, onExerciseTap],
  );

  const allMediaUrls = useMemo(() => {
    const urls: (string | null)[] = [];
    for (const ex of generatedWorkout.exercises) {
      urls.push(resolveExerciseImage(ex));
    }
    return urls;
  }, [generatedWorkout.exercises]);
  const cachedMediaMap = useCachedMediaMap(allMediaUrls);

  const displayText = generatedWorkout.logicCue || generatedWorkout.description;
  const diff = generatedWorkout.difficulty;
  const dur = generatedWorkout.estimatedDuration;

  return (
    <div dir="rtl">
      {/* ── Top row: [Difficulty · Duration] ←→ [Share · Heart · Download] ── */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {diff != null && (
            <div
              className="flex-shrink-0 bg-white dark:bg-slate-800/90 shadow-sm rounded-lg px-3 py-1.5"
              style={{ border: PILL_BORDER_DRAWER }}
            >
              <DifficultyBolts difficulty={diff as 1 | 2 | 3} size="md" />
            </div>
          )}
          {dur != null && dur > 0 && (
            <div
              className="flex-shrink-0 flex items-center gap-1.5 bg-white dark:bg-slate-800/90 shadow-sm rounded-lg px-3 py-1.5"
              style={{ border: PILL_BORDER_DRAWER }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-slate-400 flex-shrink-0"
              >
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <span className="text-[13px] font-normal text-gray-800 dark:text-gray-100">
                {dur} דק&apos;
              </span>
            </div>
          )}
        </div>

        {actions && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={actions.onShare}
              disabled={actions.isSharing}
              className="w-10 h-10 flex items-center justify-center rounded-full active:scale-90 transition-all disabled:opacity-50"
              aria-label="שתף"
            >
              {actions.isSharing ? (
                <Loader2 size={20} className="animate-spin text-gray-400" />
              ) : (
                <Share2 size={20} strokeWidth={1.8} className="text-gray-500" />
              )}
            </button>
            <button
              onClick={actions.onToggleFavorite}
              disabled={actions.isFavToggling}
              className="w-10 h-10 flex items-center justify-center rounded-full active:scale-90 transition-all disabled:opacity-50"
              aria-label={actions.isFav ? 'הסר ממועדפים' : 'מועדפים'}
            >
              {actions.isFavToggling ? (
                <Loader2 size={20} className="animate-spin text-gray-400" />
              ) : (
                <Heart
                  size={20}
                  strokeWidth={1.8}
                  className={
                    actions.isFav ? 'text-red-500 fill-red-500' : 'text-gray-500'
                  }
                />
              )}
            </button>
            <button
              onClick={actions.onDownload}
              disabled={
                actions.isFavToggling ||
                actions.isFavDownloading ||
                actions.isFavDownloaded
              }
              className="w-10 h-10 flex items-center justify-center rounded-full active:scale-90 transition-all disabled:opacity-50 relative"
              aria-label="הורדה לאופליין"
            >
              {actions.isFavDownloading ? (
                <DownloadProgressCircle progress={actions.downloadProgress} />
              ) : actions.isFavDownloaded ? (
                <ArrowDownCircle
                  size={21}
                  className="text-emerald-500 fill-emerald-100"
                />
              ) : (
                <ArrowDownCircle
                  size={20}
                  strokeWidth={1.8}
                  className="text-gray-500"
                />
              )}
            </button>
          </div>
        )}
      </div>

      {/* ── Workout description ── */}
      {displayText && (
        <p className="text-slate-600 dark:text-slate-400 text-right leading-relaxed text-sm mb-3">
          {displayText}
        </p>
      )}

      {/* ── ציוד (Equipment) ── */}
      {equipment.length > 0 && (
        <section className="mb-4">
          <h3
            className="text-right text-[15px] font-semibold text-slate-900 dark:text-white mb-2"
            style={{ fontFamily: 'var(--font-simpler)' }}
          >
            ציוד
          </h3>
          <div
            className="flex flex-nowrap gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 pb-1"
            dir="rtl"
          >
            {equipment.map((eq) => (
              <DrawerEquipmentBadge key={eq.id} id={eq.id} label={eq.label} />
            ))}
            <div className="flex-shrink-0 w-2" aria-hidden />
          </div>
        </section>
      )}

      {/* ── שרירים (Muscles) ── */}
      {muscles.length > 0 && (
        <section className="mb-4">
          <h3
            className="text-right text-[15px] font-semibold text-slate-900 dark:text-white mb-2"
            style={{ fontFamily: 'var(--font-simpler)' }}
          >
            שרירים
          </h3>
          <div className="flex flex-wrap gap-2" dir="rtl">
            {muscles.map((m) => (
              <DrawerMuscleBadge key={m} muscle={m} />
            ))}
          </div>
        </section>
      )}

      {/* ── Exercise Sections (חימום, סופר-סט, סט רגיל, מתיחות) ── */}
      {sections.map((section) => {
        const isSuperset = section.id.startsWith('superset');
        const isPyramidSection = section.id.startsWith('pyramid');
        const isWarmup = section.id === 'warmup';
        const showCards = !isWarmup || (isWarmupActive && isWarmupExpanded);

        return (
          <section key={section.id} className="mb-8">
            <SectionHeader
              section={section}
              isWarmup={isWarmup}
              isSuperset={isSuperset}
              isPyramidSection={isPyramidSection}
              isWarmupActive={isWarmupActive}
              isWarmupExpanded={isWarmupExpanded}
              onToggleWarmupExpanded={onToggleWarmupExpanded}
              onToggleWarmupActive={onToggleWarmupActive}
            />

            {showCards && (
              <div
                className={
                  isSuperset
                    ? 'border-r-[3px] border-cyan-400/70 dark:border-cyan-600/50 pr-3 mr-1 space-y-2'
                    : 'space-y-3'
                }
              >
                {section.exercises.flatMap((ex, idx) => {
                  const pyramidSeq = (ex as any).pyramidSequence as
                    | PyramidStep[]
                    | undefined;
                  const isPyramid =
                    Array.isArray(pyramidSeq) && pyramidSeq.length > 0;
                  const isGoal = ex.isGoalExercise === true;
                  const uniLabel =
                    ex.exercise.symmetry === 'unilateral' ? ' (לכל צד)' : '';
                  const parentImageUrl = resolveExerciseImage(ex);
                  const parentName =
                    typeof ex.exercise.name === 'string'
                      ? ex.exercise.name
                      : getLocalizedText(ex.exercise.name, 'he');

                  if (isPyramid) {
                    return pyramidSeq!.map((step, stepIdx) => {
                      const stepImage =
                        step.imageUrl || step.videoSrc || parentImageUrl;
                      const cachedStepImage =
                        cachedMediaMap.get(stepImage) || stepImage;
                      return (
                        <PyramidStepCard
                          key={`${ex.exercise.id}-${idx}-step-${stepIdx}`}
                          parentEx={ex}
                          step={step}
                          stepIdx={stepIdx}
                          cachedImageUrl={cachedStepImage}
                          isSuperset={isSuperset}
                          isGoal={isGoal}
                          uniLabel={uniLabel}
                          parentName={parentName}
                          onTap={handlePyramidStepTap}
                          onSwapStep={onSwapPyramidStep}
                        />
                      );
                    });
                  }

                  const cachedImage =
                    cachedMediaMap.get(parentImageUrl) || parentImageUrl;
                  return [
                    <ExerciseCard
                      key={`${ex.exercise.id}-${idx}`}
                      exercise={ex}
                      cachedImageUrl={cachedImage}
                      isSuperset={isSuperset}
                      onTap={onExerciseTap}
                      onSwap={onSwap}
                    />,
                  ];
                })}
              </div>
            )}
          </section>
        );
      })}

      {/* ── Volume Badge ── */}
      {generatedWorkout.volumeAdjustment && (
        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl mb-4">
          <p className="text-xs font-bold text-blue-700 dark:text-blue-300">
            {generatedWorkout.volumeAdjustment.badge}
          </p>
          <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">
            Sets: {generatedWorkout.volumeAdjustment.originalSets} →{' '}
            {generatedWorkout.volumeAdjustment.adjustedSets} (-
            {generatedWorkout.volumeAdjustment.reductionPercent}%)
          </p>
        </div>
      )}
    </div>
  );
}
