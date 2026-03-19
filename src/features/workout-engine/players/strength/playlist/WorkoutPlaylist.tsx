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
import type { WorkoutPlan, WorkoutSegment, Exercise as WorkoutExercise } from '@/features/parks';
import type { ExerciseResultLog } from '../hooks/useWorkoutStateMachine';
import WorkoutBlockCard, { BlockStatus } from './WorkoutBlockCard';
import DataEntryModal from './DataEntryModal';

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
  handleRepetitionSave: (reps: number, sideData?: { left: number; right: number }) => void;
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

  // ── Build logged-reps lookup ────────────────────────────────────────────
  const logLookup = useMemo(() => {
    const map = new Map<string, number[]>();
    exerciseLog.forEach(entry => {
      const key = `${entry.exerciseId}::${entry.segmentId}`;
      map.set(key, entry.confirmedReps);
    });
    return map;
  }, [exerciseLog]);

  // ── Smart scroll to active card ─────────────────────────────────────────
  const activeCardRef = useRef<HTMLDivElement>(null);
  const prevActiveKey = useRef('');

  useEffect(() => {
    const key = `${currentSegmentIndex}-${currentExerciseIndex}`;
    if (key !== prevActiveKey.current) {
      prevActiveKey.current = key;
      requestAnimationFrame(() => {
        activeCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
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

  // ── Get logged reps array for an exercise ───────────────────────────────
  function getLoggedReps(fe: FlatExercise): (number | null)[] {
    const segId = workout.segments[fe.segmentIndex]?.id || String(fe.segmentIndex);
    const key = `${fe.exercise.id}::${segId}`;
    const reps = logLookup.get(key);
    if (!reps) return new Array(fe.sets).fill(null);
    return Array.from({ length: fe.sets }, (_, i) => reps[i] ?? null);
  }

  // ── Modal save handler ─────────────────────────────────────────────────
  const handleModalSave = useCallback(
    (value: number, sideData?: { left: number; right: number }) => {
      handleRepetitionSave(value, sideData);
    },
    [handleRepetitionSave],
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

        {/* Exercise cards */}
        <div className="space-y-3">
          {flatExercises.map((fe) => {
            const status = getBlockStatus(fe);
            const isActive = status === 'active';
            const isResting = isActive && workoutState === 'RESTING';
            const loggedReps = getLoggedReps(fe);

            return (
              <div
                key={fe.key}
                ref={isActive ? activeCardRef : undefined}
              >
                <WorkoutBlockCard
                  exerciseId={fe.exercise.id}
                  exerciseName={fe.exercise.name}
                  imageUrl={fe.exercise.imageUrl}
                  sets={fe.sets}
                  repsText={fe.repsText}
                  exerciseType={fe.exerciseType}
                  targetReps={fe.targetReps}
                  status={status}
                  currentSetIndex={isActive ? currentSetIndex : 0}
                  loggedReps={loggedReps}
                  restTimeLeft={isResting ? restTimeLeft : undefined}
                  isResting={isResting}
                  formatTime={formatTime}
                  restDuration={fe.restDuration}
                  onPillTap={(setIdx) => openModal(fe, setIdx)}
                />
              </div>
            );
          })}
        </div>
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
