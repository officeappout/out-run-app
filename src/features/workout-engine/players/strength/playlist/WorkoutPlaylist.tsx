'use client';

/**
 * WorkoutPlaylist — The "Base Layer" beneath the Framer Motion Top Layer.
 *
 * Renders every exercise as a WorkoutBlockCard, reflecting the state
 * machine position. Manages the DataEntryModal for secondary rep/time
 * editing via pill taps.
 *
 * Smart-scrolls the active card into view on segment/exercise transitions.
 */

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { motion, LayoutGroup } from 'framer-motion';
import type { WorkoutPlan, WorkoutSegment, Exercise as WorkoutExercise } from '@/features/parks';
import type { ExerciseResultLog } from '../hooks/useWorkoutStateMachine';
import WorkoutBlockCard, { BlockStatus, ExerciseEntry } from './WorkoutBlockCard';
import DataEntryModal from './DataEntryModal';
import { resolveExerciseMedia } from '@/features/workout-engine/shared/utils/media-resolution.utils';

// ── Helpers ──────────────────────────────────────────────────────────────────

function getExercises(segment: WorkoutSegment | undefined): WorkoutExercise[] | null {
  if (!segment) return null;
  const seg = segment as any;
  if (Array.isArray(seg.exercises)) return seg.exercises;
  if (Array.isArray(seg.items)) return seg.items;
  if (Array.isArray(seg.list)) return seg.list;
  if (Array.isArray(seg.workout_exercises)) return seg.workout_exercises;
  if (Array.isArray(seg.workoutExercises)) return seg.workoutExercises;
  return null;
}

function resolveExImage(ex: WorkoutExercise): string | undefined {
  // Pre-resolved image from home/page.tsx flattening takes priority
  if (ex.imageUrl) return ex.imageUrl;
  if (ex.videoUrl) return ex.videoUrl;

  // Fall through to shared 5-level deep search
  const raw = ex as any;
  const { imageUrl } = resolveExerciseMedia(raw, raw.method ?? null);
  if (imageUrl) return imageUrl;

  const name = typeof ex.name === 'string' ? ex.name : (raw.name?.he || ex.id);
  console.error(`[Media FAIL] No media found for playlist exercise: ${name}`);
  return undefined;
}

function getSetsForExercise(ex: WorkoutExercise | null | undefined): number {
  if (!ex) return 1;
  if (typeof ex.sets === 'number' && ex.sets > 1) return ex.sets;
  const repsStr = ex.reps;
  if (repsStr) {
    const m = repsStr.match(/^(\d+)\s*[xX×]/);
    if (m) return parseInt(m[1], 10);
  }
  return 1;
}

function parseTargetReps(ex: WorkoutExercise): number {
  if (ex.repsRange?.min) return ex.repsRange.min;
  const repsStr = ex.reps ?? '';
  const stripped = repsStr.replace(/^\d+\s*[xX×]\s*/, '');
  const match = stripped.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 10;
}

// ── Flat exercise entry ──────────────────────────────────────────────────────

interface FlatExercise {
  key: string;
  segmentIndex: number;
  exerciseIndex: number;
  exercise: WorkoutExercise;
  sets: number;
  targetReps: number;
  repsText: string;
  exerciseType: 'reps' | 'time';
  restDuration: number;
  segmentTitle: string;
}

// ── Props ────────────────────────────────────────────────────────────────────

interface WorkoutPlaylistProps {
  workout: WorkoutPlan;
  currentSegmentIndex: number;
  currentExerciseIndex: number;
  currentSetIndex: number;
  workoutState: string;
  isPaused: boolean;
  restTimeLeft: number;
  formatTime: (s: number) => string;
  exerciseLog: ExerciseResultLog[];
  handleRepetitionSave: (reps: number, sideData?: { left: number; right: number }, forceSkipRest?: boolean, editSetIndex?: number) => void;
  onSkipRest?: () => void;
}

export default function WorkoutPlaylist({
  workout,
  currentSegmentIndex,
  currentExerciseIndex,
  currentSetIndex,
  workoutState,
  isPaused,
  restTimeLeft,
  formatTime,
  exerciseLog,
  handleRepetitionSave,
  onSkipRest,
}: WorkoutPlaylistProps) {
  // ── Flatten workout segments into exercise list ─────────────────────────
  const flatExercises: FlatExercise[] = useMemo(() => {
    const result: FlatExercise[] = [];
    workout.segments.forEach((seg, si) => {
      const exercises = getExercises(seg);
      if (!exercises) return;
      exercises.forEach((ex, ei) => {
        const sets = getSetsForExercise(ex);
        const isTime = ex.exerciseType === 'time' || ex.isTimeBased === true;
        const rest = (ex as any).restSeconds ?? seg.restBetweenExercises ?? 30;
        result.push({
          key: `${si}-${ei}`,
          segmentIndex: si,
          exerciseIndex: ei,
          exercise: ex,
          sets,
          targetReps: parseTargetReps(ex),
          repsText: ex.reps || ex.duration || '',
          exerciseType: isTime ? 'time' : 'reps',
          restDuration: typeof rest === 'number' ? rest : 30,
          segmentTitle: seg.title || '',
        });
      });
    });
    return result;
  }, [workout]);

  // ── DataEntryModal state ────────────────────────────────────────────────
  const [modalOpen, setModalOpen] = useState(false);
  const [modalExercise, setModalExercise] = useState<FlatExercise | null>(null);
  const [modalSetIndex, setModalSetIndex] = useState(0);

  const openModal = useCallback((fe: FlatExercise, setIdx: number) => {
    setModalExercise(fe);
    setModalSetIndex(setIdx);
    setModalOpen(true);
  }, []);

  // ── Build logged-reps lookup (stores full entry for side-data access) ───
  const logLookup = useMemo(() => {
    const map = new Map<string, ExerciseResultLog>();
    exerciseLog.forEach(entry => {
      const key = `${entry.exerciseId}::${entry.segmentId}`;
      map.set(key, entry);
    });
    return map;
  }, [exerciseLog]);

  // ── Group flat exercises by segment ────────────────────────────────────
  const groupedSegments = useMemo(() => {
    const groups: Array<{
      segmentIndex: number;
      segmentTitle: string;
      segmentIcon: string;
      exercises: FlatExercise[];
    }> = [];

    workout.segments.forEach((seg, si) => {
      const exercises = flatExercises.filter(fe => fe.segmentIndex === si);
      if (exercises.length > 0) {
        const rawSeg = seg as any;
        groups.push({
          segmentIndex: si,
          segmentTitle: seg.title || '',
          segmentIcon: rawSeg.icon || '💪',
          exercises,
        });
      }
    });

    return groups;
  }, [workout.segments, flatExercises]);

  // ── Smart scroll to active card ─────────────────────────────────────────
  const activeCardRef = useRef<HTMLDivElement>(null);
  const prevActiveKey = useRef('');

  useEffect(() => {
    const key = `${currentSegmentIndex}-${currentExerciseIndex}`;
    if (key !== prevActiveKey.current) {
      prevActiveKey.current = key;
      const t = setTimeout(() => {
        activeCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 520);
      return () => clearTimeout(t);
    }
  }, [currentSegmentIndex, currentExerciseIndex]);

  // ── Determine card status ───────────────────────────────────────────────
  function getBlockStatus(fe: FlatExercise): BlockStatus {
    if (
      fe.segmentIndex < currentSegmentIndex ||
      (fe.segmentIndex === currentSegmentIndex && fe.exerciseIndex < currentExerciseIndex)
    ) {
      return 'completed';
    }
    if (
      fe.segmentIndex === currentSegmentIndex &&
      fe.exerciseIndex === currentExerciseIndex
    ) {
      return 'active';
    }
    return 'upcoming';
  }

  // ── Get logged reps arrays for an exercise ──────────────────────────────
  function getLogEntry(fe: FlatExercise): ExerciseResultLog | undefined {
    const segId = workout.segments[fe.segmentIndex]?.id || String(fe.segmentIndex);
    const key = `${fe.exercise.id}::${segId}`;
    return logLookup.get(key);
  }

  function getLoggedReps(fe: FlatExercise): (number | null)[] {
    const entry = getLogEntry(fe);
    if (!entry) return new Array(fe.sets).fill(null);
    return Array.from({ length: fe.sets }, (_, i) => entry.confirmedReps[i] ?? null);
  }

  function getLoggedRepsSide(fe: FlatExercise, side: 'right' | 'left'): (number | null)[] {
    const entry = getLogEntry(fe);
    if (!entry) return new Array(fe.sets).fill(null);
    const arr = side === 'right' ? entry.confirmedRepsRight : entry.confirmedRepsLeft;
    if (!arr) return new Array(fe.sets).fill(null);
    return Array.from({ length: fe.sets }, (_, i) => arr[i] ?? null);
  }

  // ── Modal save handler ─────────────────────────────────────────────────
  const handleModalSave = useCallback(
    (value: number, sideData?: { left: number; right: number }) => {
      handleRepetitionSave(value, sideData, undefined, modalSetIndex);
    },
    [handleRepetitionSave, modalSetIndex],
  );

  return (
    <div className="h-full overflow-y-auto pb-20" dir="rtl">
      <div className="pt-14 px-4">
        {/* Title */}
        <h2
          className="text-xl font-bold text-slate-900 dark:text-white mb-1"
          style={{ fontFamily: 'var(--font-simpler)' }}
        >
          רשימת התרגילים
        </h2>
        <p
          className="text-sm text-slate-400 dark:text-slate-500 mb-5"
          style={{ fontFamily: 'var(--font-simpler)' }}
        >
          {flatExercises.length} תרגילים · {workout.name}
        </p>

        {/* Exercises grouped by segment */}
        <LayoutGroup>
        <div className="space-y-5">
          {groupedSegments.map(({ segmentIndex, segmentTitle, segmentIcon, exercises }) => {
            const isWarmupGroup = segmentTitle.includes('חימום') || segmentTitle.toLowerCase().includes('warmup');
            const isCooldownGroup = segmentTitle.includes('שחרור') || segmentTitle.includes('קירור') || segmentTitle.toLowerCase().includes('cooldown');

            return (
              <div key={segmentIndex}>
                {/* Segment header */}
                <div className="flex items-center gap-2 mb-2.5 px-1">
                  <span className="text-base leading-none">{segmentIcon}</span>
                  <span
                    className={[
                      'text-sm font-bold',
                      isWarmupGroup
                        ? 'text-amber-600 dark:text-amber-400'
                        : isCooldownGroup
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-slate-700 dark:text-slate-300',
                    ].join(' ')}
                    style={{ fontFamily: 'var(--font-simpler)' }}
                  >
                    {segmentTitle}
                  </span>
                  <span
                    className="text-xs text-slate-400 dark:text-slate-500"
                    style={{ fontFamily: 'var(--font-simpler)' }}
                  >
                    · {exercises.length} {exercises.length === 1 ? 'תרגיל' : 'תרגילים'}
                  </span>
                </div>

                {/* Render cards — grouped for warmup/cooldown/superset, individual otherwise */}
                {(() => {
                  const hasSuperSet = exercises.some(fe => !!(fe.exercise as any).pairedWith);
                  const shouldGroup = isWarmupGroup || isCooldownGroup || hasSuperSet;

                  if (shouldGroup) {
                    const statuses = exercises.map(fe => getBlockStatus(fe));
                    const cardStatus: BlockStatus = statuses.includes('active')
                      ? 'active'
                      : statuses.every(s => s === 'completed')
                        ? 'completed'
                        : 'upcoming';
                    const isCardActive = cardStatus === 'active';
                    const activeIdx = exercises.findIndex(fe => getBlockStatus(fe) === 'active');
                    const isCardResting = isCardActive && workoutState === 'RESTING';

                    const entries: ExerciseEntry[] = exercises.map((fe) => ({
                      exerciseId: fe.exercise.id,
                      exerciseName: fe.exercise.name,
                      imageUrl: resolveExImage(fe.exercise),
                      sets: fe.sets,
                      repsText: fe.repsText,
                      exerciseType: fe.exerciseType,
                      targetReps: fe.targetReps,
                      status: getBlockStatus(fe),
                      currentSetIndex: getBlockStatus(fe) === 'active' ? currentSetIndex : 0,
                      loggedReps: getLoggedReps(fe),
                      loggedRepsRight: getLoggedRepsSide(fe, 'right'),
                      loggedRepsLeft: getLoggedRepsSide(fe, 'left'),
                      restDuration: fe.restDuration,
                      onPillTap: (setIdx: number) => openModal(fe, setIdx),
                      ...((isWarmupGroup || isCooldownGroup) && {
                        onDirectComplete: () => handleRepetitionSave(fe.targetReps, undefined, true),
                      }),
                    }));

                    return (
                      <motion.div
                        layout="position"
                        layoutId={`seg-${segmentIndex}`}
                        ref={isCardActive ? activeCardRef : undefined}
                      >
                        <WorkoutBlockCard
                          exercises={entries}
                          segmentTitle={segmentTitle}
                          cardStatus={cardStatus}
                          activeExerciseIndex={activeIdx}
                          isResting={isCardResting}
                          restTimeLeft={isCardResting ? restTimeLeft : undefined}
                          formatTime={formatTime}
                          exerciseRole={(exercises[0]?.exercise as any)?.exerciseRole}
                          isSuperSet={hasSuperSet}
                          onSkipRest={onSkipRest}
                        />
                      </motion.div>
                    );
                  }

                  return (
                    <div className="space-y-2">
                      {exercises.map((fe) => {
                        const status = getBlockStatus(fe);
                        const isExActive = status === 'active';
                        const isExResting = isExActive && workoutState === 'RESTING';

                        const exRole = (fe.exercise as any)?.exerciseRole;
                        const isWarmupOrCooldown = exRole === 'warmup' || exRole === 'cooldown';

                        const entry: ExerciseEntry = {
                          exerciseId: fe.exercise.id,
                          exerciseName: fe.exercise.name,
                          imageUrl: resolveExImage(fe.exercise),
                          sets: fe.sets,
                          repsText: fe.repsText,
                          exerciseType: fe.exerciseType,
                          targetReps: fe.targetReps,
                          status,
                          currentSetIndex: isExActive ? currentSetIndex : 0,
                          loggedReps: getLoggedReps(fe),
                          loggedRepsRight: getLoggedRepsSide(fe, 'right'),
                          loggedRepsLeft: getLoggedRepsSide(fe, 'left'),
                          restDuration: fe.restDuration,
                          onPillTap: (setIdx: number) => openModal(fe, setIdx),
                          ...(isWarmupOrCooldown && {
                            onDirectComplete: () => handleRepetitionSave(fe.targetReps, undefined, true),
                          }),
                        };

                        return (
                          <motion.div
                            key={fe.key}
                            layout="position"
                            layoutId={`ex-${fe.key}`}
                            ref={isExActive ? activeCardRef : undefined}
                          >
                            <WorkoutBlockCard
                              exercises={[entry]}
                              segmentTitle={segmentTitle}
                              cardStatus={status}
                              activeExerciseIndex={isExActive ? 0 : -1}
                              isResting={isExResting}
                              restTimeLeft={isExResting ? restTimeLeft : undefined}
                              formatTime={formatTime}
                              exerciseRole={(fe.exercise as any)?.exerciseRole}
                              isSuperSet={false}
                              onSkipRest={onSkipRest}
                            />
                          </motion.div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
        </LayoutGroup>
      </div>

      {/* ── DataEntryModal ─────────────────────────────────────────────────── */}
      <DataEntryModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        exerciseName={modalExercise?.exercise.name ?? ''}
        exerciseType={modalExercise?.exerciseType ?? 'reps'}
        targetReps={modalExercise?.targetReps ?? 10}
        lastSavedReps={
          modalExercise
            ? getLoggedReps(modalExercise)[modalSetIndex] ?? null
            : null
        }
        setIndex={modalSetIndex}
        handleRepetitionSave={handleModalSave}
        isUnilateral={modalExercise?.exercise.symmetry === 'unilateral'}
      />
    </div>
  );
}
