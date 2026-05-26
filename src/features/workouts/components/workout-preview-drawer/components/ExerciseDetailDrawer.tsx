'use client';

import React, { useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getLocalizedText } from '@/features/content/exercises';
import { resolveExerciseMedia } from '@/features/workout-engine/shared/utils/media-resolution.utils';
import ExerciseDetailContent, {
  type ProgramRef,
} from '@/features/workout-engine/players/strength/components/ExerciseDetailContent';
import type { WorkoutExercise as EngineWorkoutExercise } from '@/features/workout-engine/logic/WorkoutGenerator';

interface ExerciseDetailDrawerProps {
  /**
   * The exercise to render in the detail sheet, or `null` when the sheet
   * should be closed.  When `null`, the drawer renders nothing — the
   * data-resolution work (cue parsing, program lookup, notes flattening)
   * is gated behind a `useMemo` so it never runs on parent re-renders
   * caused by unrelated state changes (scrollY, audio toggle, favorites, …).
   */
  detailExercise: EngineWorkoutExercise | null;
  /**
   * Cached programId → Hebrew label map populated once by the orchestrator
   * via `getCachedPrograms()`.  Used to resolve `targetPrograms[*].programId`
   * into a user-facing label.
   */
  programMap: Record<string, string>;
  /**
   * Called when the user dismisses the sheet (backdrop tap, drag-down,
   * or handle tap).
   */
  onDismiss: () => void;
}

// ── Resolved-view-model -----------------------------------------------------
// All the strings / arrays the JSX needs, computed once per `detailExercise`.
interface ResolvedDetailView {
  name: string;
  heroVideoUrl: string | null;
  heroPosterUrl: string | undefined;
  ytUrl: string | null;
  eqIds: string[];
  primary: string | null;
  secondary: string[];
  allCues: string[];
  goalText: string | null;
  descriptionText: string | null;
  instructionsText: string | null;
  notesArr: string[];
  resolvedPrograms: ProgramRef[];
}

/**
 * Resolve every field the detail sheet needs from the raw engine wrapper.
 * Pure function — safe to memoise on `[detailExercise, programMap]`.
 */
function buildDetailView(
  detailExercise: EngineWorkoutExercise,
  programMap: Record<string, string>,
): ResolvedDetailView {
  const exercise = detailExercise.exercise;
  const method = detailExercise.method;

  const name = typeof exercise.name === 'string'
    ? exercise.name
    : getLocalizedText(exercise.name, 'he');

  const methodMedia = method?.media || exercise.execution_methods?.[0]?.media;
  const heroVideoUrl = methodMedia?.mainVideoUrl || exercise.media?.videoUrl || null;
  const { imageUrl: heroPosterUrl } = resolveExerciseMedia(
    exercise as any,
    method as any,
  );

  const ytUrl =
    methodMedia?.instructionalVideos?.[0]?.url ||
    exercise.execution_methods?.[0]?.media?.instructionalVideos?.[0]?.url ||
    null;

  const eqIds: string[] = [
    ...(method?.gearIds ?? []),
    ...(method?.equipmentIds ?? []),
  ].filter((v, i, a) => a.indexOf(v) === i);

  const primary = exercise.primaryMuscle || null;
  const secondary = exercise.secondaryMuscles?.filter((m: string) => m !== primary) || [];

  // ── Coaching cues (deduplicated across 3 sources) ─────────────────────
  const allCues: string[] = [];
  const contentCues = exercise.content?.specificCues;
  if (contentCues) {
    for (const c of contentCues) {
      const text = typeof c === 'string' ? c : (c as any)?.he || (c as any)?.male || '';
      if (text) allCues.push(text);
    }
  }
  const methodCues = method?.specificCues;
  if (methodCues) {
    for (const c of methodCues) {
      const text = typeof c === 'string' ? c : (c as any)?.he || (c as any)?.male || '';
      if (text && !allCues.includes(text)) allCues.push(text);
    }
  }
  const highlights = method?.highlights || exercise.content?.highlights;
  if (highlights) {
    for (const h of highlights) {
      const text = typeof h === 'string' ? h : (h as any)?.he || (h as any)?.male || '';
      if (text && !allCues.includes(text)) allCues.push(text);
    }
  }

  const goalText =
    (typeof exercise.content?.goal === 'string'
      ? exercise.content.goal
      : (exercise.content?.goal as any)?.he || null) || null;

  const descriptionText = (() => {
    const d = exercise.content?.description;
    if (!d) return null;
    if (typeof d === 'string') return d;
    return (d as any)?.he || null;
  })();

  const instructionsText = (() => {
    const inst = exercise.content?.instructions;
    if (!inst) return null;
    if (typeof inst === 'string') return inst;
    return (inst as any)?.he || null;
  })();

  const notesArr: string[] = [];
  const rawNotes = exercise.content?.notes;
  if (rawNotes && Array.isArray(rawNotes)) {
    for (const n of rawNotes) {
      const text = typeof n === 'string' ? n : (n as any)?.he || '';
      if (text) notesArr.push(text);
    }
  }

  // ── Resolve programs from targetPrograms (multi-program with levels) ──
  const resolvedPrograms: ProgramRef[] = [];
  if (exercise.targetPrograms && exercise.targetPrograms.length > 0) {
    for (const tp of exercise.targetPrograms) {
      const label = programMap[tp.programId] || programMap[tp.programId.toLowerCase()] || tp.programId;
      resolvedPrograms.push({ name: label, level: tp.level });
    }
  } else if (exercise.programIds && exercise.programIds.length > 0) {
    for (const pid of exercise.programIds) {
      const label = programMap[pid] || programMap[pid.toLowerCase()] || pid;
      resolvedPrograms.push({ name: label, level: detailExercise.programLevel ?? 1 });
    }
  }

  return {
    name,
    heroVideoUrl,
    heroPosterUrl,
    ytUrl,
    eqIds,
    primary,
    secondary,
    allCues,
    goalText,
    descriptionText,
    instructionsText,
    notesArr,
    resolvedPrograms,
  };
}

/**
 * Animated bottom-sheet showing rich detail for one exercise.
 *
 * Wrapped in `React.memo` and gated on `detailExercise !== null`.  The
 * heavy field resolution (`buildDetailView`) is wrapped in `useMemo` so
 * it runs exactly once per opened exercise — no more re-evaluating
 * 100+ lines of string parsing on every scroll-Y tick.
 */
function ExerciseDetailDrawerImpl({
  detailExercise,
  programMap,
  onDismiss,
}: ExerciseDetailDrawerProps) {
  // Drag-to-dismiss: trigger close on a deep drag-down or fast flick.
  const handleDragEnd = useCallback(
    (_: any, info: { offset: { y: number }; velocity: { y: number } }) => {
      if (info.offset.y > 100 || info.velocity.y > 350) {
        onDismiss();
      }
    },
    [onDismiss],
  );

  // Resolve only when `detailExercise` is present; result is `null` when closed.
  const view = useMemo<ResolvedDetailView | null>(
    () => (detailExercise ? buildDetailView(detailExercise, programMap) : null),
    [detailExercise, programMap],
  );

  return (
    <AnimatePresence>
      {detailExercise && view && (
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

          {/*
            Detail Drawer — Dynamic Height (Fit Content, capped at 90vh).
            ─────────────────────────────────────────────────────────────
            • motion.div is `flex flex-col` with NO explicit height; the
              browser sizes it to its children up to `maxHeight: 90vh`.
            • Drag handle is `flex-shrink-0` — keeps its 24px no matter what.
            • Scroll container is the natural-flex child with `min-h-0`
              + `overflow-y-auto` → it reports content height to the parent
              while still allowing internal scrolling once the cap is hit.
            • A short, lean exercise (only video + muscles) opens as a small
              drawer; rich exercises grow up to 90vh and scroll past that.
          */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 36, stiffness: 320, mass: 0.7 }}
            className="fixed bottom-0 left-0 right-0 z-[200] bg-white dark:bg-slate-900 shadow-2xl rounded-t-[20px] flex flex-col"
            style={{
              maxHeight: '90vh',
              fontFamily: 'var(--font-simpler)',
            }}
          >
            {/* Drag handle — only dismisses (no snap toggle); part of flex layout */}
            <motion.div
              drag="y"
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={0.5}
              onDragEnd={handleDragEnd}
              onClick={onDismiss}
              className="flex-shrink-0 flex justify-center pt-2.5 pb-1.5 cursor-grab active:cursor-grabbing select-none"
              style={{ touchAction: 'none' }}
            >
              <div className="w-10 h-1.5 rounded-full bg-gray-300 dark:bg-gray-600" />
            </motion.div>

            {/* Scroll container — fits content; scrolls internally past 90vh.
                WHITE_FADE on ExerciseDetailContent's hero already smooths
                the boundary as the user scrolls text content over it. */}
            <div
              className="overflow-y-auto overscroll-contain pb-6"
              style={{ minHeight: 0 }}
            >
              <ExerciseDetailContent
                exerciseName={view.name}
                videoUrl={view.heroVideoUrl}
                posterUrl={view.heroPosterUrl}
                youtubeUrl={view.ytUrl}
                programs={view.resolvedPrograms.length > 0 ? view.resolvedPrograms : undefined}
                equipment={view.eqIds.length > 0 ? view.eqIds : undefined}
                primaryMuscle={view.primary}
                secondaryMuscles={view.secondary.length > 0 ? view.secondary : undefined}
                cues={view.allCues.length > 0 ? view.allCues : undefined}
                goal={view.goalText}
                description={view.descriptionText}
                instructions={view.instructionsText}
                notes={view.notesArr.length > 0 ? view.notesArr : undefined}
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
