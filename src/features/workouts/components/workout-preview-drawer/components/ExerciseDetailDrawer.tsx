'use client';

import React, { useCallback, useMemo, useRef } from 'react';
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useTransform,
  useDragControls,
  animate,
} from 'framer-motion';
import { useSheetScrollChain } from '@/hooks/useSheetScrollChain';
import { getLocalizedText } from '@/features/content/exercises';
import { resolveExerciseMedia } from '@/features/workout-engine/shared/utils/media-resolution.utils';
import ExerciseDetailContent, {
  type ProgramRef,
} from '@/features/workout-engine/players/strength/components/ExerciseDetailContent';
import type { WorkoutExercise as EngineWorkoutExercise } from '@/features/workout-engine/logic/WorkoutGenerator';

// ── Snap / gesture constants ─────────────────────────────────────────────────
/** px below the fully-expanded anchor at initial open (≈ 10 vh → 85 vh visible of 95 vh sheet). */
const PEEK_Y_PX =
  typeof window !== 'undefined' ? Math.round(window.innerHeight * 0.10) : 81;
const CLOSE_THRESHOLD = 120;  // px dragged down from wherever to dismiss
const EXPAND_THRESHOLD = 60;  // px dragged up to snap fully open
const SPRING = { type: 'spring', damping: 40, stiffness: 260, mass: 0.8 } as const;

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
 * Architecture: 85vh initial peek → drag up to 95vh expansion → drag down to dismiss.
 * Opacity fades only after the user drags past the 85vh resting anchor.
 * Scroll-chain gesture (pull-to-dismiss from scrollTop=0) is handled by
 * `useSheetScrollChain` on the inner scroll container.
 */
function ExerciseDetailDrawerImpl({
  detailExercise,
  programMap,
  onDismiss,
}: ExerciseDetailDrawerProps) {
  const isOpen = detailExercise !== null;

  // ── MotionValues (GPU compositor thread, zero React re-renders) ────────────
  const y = useMotionValue(0);
  // Opacity is 1.0 at the resting 85vh anchor; fades only as the user drags past it.
  const opacity = useTransform(y, [PEEK_Y_PX, PEEK_Y_PX + 220], [1, 0]);

  // ── Drag controls — only the handle pill initiates dragging ───────────────
  const dragControls = useDragControls();
  const scrollRef = useRef<HTMLDivElement>(null);
  useSheetScrollChain({ isOpen, y, onClose: onDismiss, scrollRef, snapBackY: PEEK_Y_PX });

  // ── Three-state snap: expand (y→0) · peek (y→PEEK_Y) · dismiss ───────────
  const handleDragEnd = useCallback(
    (_: any, info: any) => {
      const offset = info.offset.y;
      const velocity = info.velocity.y;
      if (offset > CLOSE_THRESHOLD || velocity > 500) {
        onDismiss();
      } else if (offset < -EXPAND_THRESHOLD) {
        animate(y, 0, SPRING);
      } else {
        animate(y, PEEK_Y_PX, SPRING);
      }
    },
    [onDismiss, y],
  );

  // ── View-model: heavy string resolution, memoised per exercise ────────────
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
            Detail Drawer — 95vh height, rests at 85vh via PEEK_Y_PX y-offset.
            ──────────────────────────────────────────────────────────────────
            • Outer motion.div owns `drag="y"` but only listens via dragControls
              so the drag handle is the sole gesture entry point.
            • Inner scroll container has overscroll-contain + useSheetScrollChain
              for pull-to-dismiss from content top.
            • Opacity fades only when dragging below the 85vh anchor.
          */}
          <motion.div
            drag="y"
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 500 }}
            dragElastic={{ top: 0.08, bottom: 0 }}
            dragMomentum={false}
            onDragEnd={handleDragEnd}
            initial={{ y: '100%' }}
            animate={{ y: PEEK_Y_PX }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 36, stiffness: 320, mass: 0.7 }}
            className="fixed bottom-0 left-0 right-0 z-[200] bg-white dark:bg-slate-900 shadow-2xl rounded-t-[24px] flex flex-col overflow-hidden"
            style={{
              height: '95vh',
              fontFamily: 'var(--font-simpler)',
              y,
              opacity,
              willChange: 'transform',
            }}
          >
            {/* Background shield — fills the overflow gap above the rounded edge
                so rapid downward drags never expose the raw white viewport beneath */}
            <div className="absolute -top-12 left-0 right-0 h-12 bg-white dark:bg-slate-900 rounded-t-[24px] pointer-events-none" />

            {/* Drag handle pill — absolute-positioned so it never shifts content */}
            <div
              className="absolute top-0 left-0 right-0 z-10 flex justify-center pt-3 pb-4 cursor-grab active:cursor-grabbing"
              onPointerDown={(e) => dragControls.start(e)}
              style={{ touchAction: 'none' }}
            >
              <div className="w-10 h-1.5 rounded-full bg-gray-300 dark:bg-gray-600" />
            </div>

            {/* Scroll container — video is the first child, flush to the top edge.
                The absolute handle pill floats over it (same pattern as WorkoutPreviewDrawer). */}
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto overscroll-contain pb-12"
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
