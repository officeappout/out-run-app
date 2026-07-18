'use client';

/**
 * ExerciseDetailDrawer — workout-preview exercise detail ("Spotify Track Page").
 *
 * Unified with the library ExerciseDetailSheet: a single immersive 95vh bottom
 * sheet with ONE vertical scroll conduit wrapping MasterExerciseView. No peek
 * snap points, no nested scroll-chain hook — a clean drag-down dismisses.
 *
 * The engine passes a WorkoutExercise wrapper; we unwrap `.exercise` (+ method
 * location) and hand it straight to MasterExerciseView, which owns all data
 * resolution (video, muscles, equipment, progression chain, history).
 */

import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import type { Exercise, ExecutionMethod } from '@/features/content/exercises';
import MasterExerciseView from '@/features/content/exercises/client/components/MasterExerciseView';
import type { WorkoutExercise as EngineWorkoutExercise } from '@/features/workout-engine/logic/WorkoutGenerator';

interface ExerciseDetailDrawerProps {
  /** The exercise to render, or `null` when the sheet should be closed. */
  detailExercise: EngineWorkoutExercise | null;
  /** Cached programId → Hebrew label map for the track capsule. */
  programMap: Record<string, string>;
  /** Called on dismissal (backdrop tap, drag-down, handle). */
  onDismiss: () => void;
  /**
   * OPTIONAL method-writer (workout-preview single-swap; gated by SWAP_ALL_ENABLED).
   * The parent binds it to THIS `detailExercise` and persists the pick to the live
   * workout. Absent → MEV stays read-only.
   */
  onMethodChange?: (method: ExecutionMethod, methodIdx: number) => void;
}

function ExerciseDetailDrawerImpl({
  detailExercise,
  programMap,
  onDismiss,
  onMethodChange,
}: ExerciseDetailDrawerProps) {
  const router = useRouter();

  const exercise = (detailExercise?.exercise ?? null) as Exercise | null;

  // Location comes from the chosen execution method (home / park / gym).
  // Fall back to locationMapping[0] when the scalar `location` is stale/missing
  // so a park-only-mapped method is not mislabeled as its creation-time scalar.
  const filterLocation = useMemo<'home' | 'park' | 'gym' | null>(() => {
    const loc = detailExercise?.method?.location ?? detailExercise?.method?.locationMapping?.[0];
    return loc === 'home' || loc === 'park' || loc === 'gym' ? loc : null;
  }, [detailExercise]);

  const handleNavigateToAnalytics = (exerciseId: string, exerciseName: string) => {
    router.push(`/profile/exercise/${exerciseId}?name=${encodeURIComponent(exerciseName)}`);
  };

  return (
    <AnimatePresence>
      {detailExercise && exercise && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.5 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={onDismiss}
            className="fixed inset-0 bg-black z-[200]"
          />

          {/* Single immersive sheet — drag the whole sheet down to dismiss. */}
          <motion.div
            key="master-drawer"
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.2}
            onDragEnd={(_, info) => { if (info.offset.y > 140) onDismiss(); }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 36, stiffness: 320, mass: 0.7 }}
            className="fixed bottom-0 left-0 right-0 z-[200] bg-white dark:bg-slate-900 shadow-2xl rounded-t-[24px] flex flex-col overflow-hidden"
            style={{ height: '95vh', fontFamily: 'var(--font-simpler)' }}
            dir="rtl"
          >
            {/* Drag handle pill */}
            <div className="flex justify-center pt-3 pb-2 flex-shrink-0">
              <div className="w-10 h-1.5 rounded-full bg-gray-300 dark:bg-gray-600" />
            </div>

            {/* ── SINGLE conduit scroll ── */}
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
              <MasterExerciseView
                exercise={exercise}
                filterLocation={filterLocation}
                programLabels={programMap}
                onNavigateToAnalytics={handleNavigateToAnalytics}
                onMethodChange={onMethodChange}
              />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

const ExerciseDetailDrawer = React.memo(ExerciseDetailDrawerImpl);
ExerciseDetailDrawer.displayName = 'ExerciseDetailDrawer';

export default ExerciseDetailDrawer;
