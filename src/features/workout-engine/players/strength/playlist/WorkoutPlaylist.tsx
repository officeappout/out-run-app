'use client';

/**
 * WorkoutPlaylist — Orchestrator / dispatch loop.
 *
 * Walks the flattened workout, builds sub-groups, then for each group
 * picks the right Lego block component to render:
 *
 *   group.isSuperSet                    → <SupersetBlockGroup>
 *   warmup / cooldown segment           → <WorkoutBlockCard> (legacy)
 *   group with one main-segment ex.     → <StrengthExerciseCard>
 *   group.blockType === 'running_*'     → <RunningIntervalBlock> (future)
 *
 * All flattening, grouping, set-status, and log-lookup logic lives in
 * `./utils/*` so this file is small and easy to extend.
 */

import React, { useMemo, useRef, useEffect } from 'react';
import { motion, LayoutGroup } from 'framer-motion';
import type { WorkoutPlan } from '@/features/parks';
import type { ExerciseResultLog } from '../hooks/useWorkoutStateMachine';
import WorkoutBlockCard from './WorkoutBlockCard';
import StrengthExerciseCard from './blocks/StrengthExerciseCard';
import SupersetBlockGroup from './blocks/SupersetBlockGroup';
import {
  flattenWorkoutToExercises,
  buildMainSubGroups,
  resolveExImage,
} from './utils/grouping.utils';
import { getBlockStatus } from './utils/set-status.utils';
import {
  buildLogLookup,
  getLogEntry,
  getLoggedReps,
  getLoggedRepsSide,
} from './utils/log-lookup.utils';
import type {
  BlockStatus,
  ExerciseEntry,
  FlatExercise,
  SubGroup,
} from './types';

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
  handleRepetitionSave: (
    reps: number,
    sideData?: { left: number; right: number },
    forceSkipRest?: boolean,
    editSetIndex?: number,
  ) => void;
  onSkipRest?: () => void;
}

export default function WorkoutPlaylist({
  workout,
  currentSegmentIndex,
  currentExerciseIndex,
  currentSetIndex,
  workoutState,
  restTimeLeft,
  formatTime,
  exerciseLog,
  handleRepetitionSave,
  onSkipRest,
}: WorkoutPlaylistProps) {
  // ── Flat representation & lookups ────────────────────────────────
  const flatExercises = useMemo(
    () => flattenWorkoutToExercises(workout),
    [workout],
  );

  const logLookup = useMemo(() => buildLogLookup(exerciseLog), [exerciseLog]);

  // Bound helpers for the status computation.
  const confirmedSetsLookup = (fe: FlatExercise) => {
    const entry = getLogEntry(fe, workout, logLookup);
    return entry?.confirmedReps.length ?? 0;
  };
  const statusOf = (fe: FlatExercise): BlockStatus =>
    getBlockStatus(
      fe,
      { segmentIndex: currentSegmentIndex, exerciseIndex: currentExerciseIndex },
      confirmedSetsLookup,
    );

  // ── Group flat exercises by segment ──────────────────────────────
  const groupedSegments = useMemo(() => {
    const groups: Array<{
      segmentIndex: number;
      segmentTitle: string;
      segmentIcon: string;
      exercises: FlatExercise[];
    }> = [];
    workout.segments.forEach((seg, si) => {
      const exercises = flatExercises.filter((fe) => fe.segmentIndex === si);
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

  const subGroupsMap = useMemo(() => {
    const m = new Map<number, SubGroup[]>();
    for (const { segmentIndex, exercises } of groupedSegments) {
      m.set(segmentIndex, buildMainSubGroups(exercises));
    }
    return m;
  }, [groupedSegments]);

  // ── Smart scroll to active card ──────────────────────────────────
  const activeCardRef = useRef<HTMLDivElement>(null);
  const prevActiveKey = useRef('');

  useEffect(() => {
    const key = `${currentSegmentIndex}-${currentExerciseIndex}`;
    if (key !== prevActiveKey.current) {
      prevActiveKey.current = key;
      const t = setTimeout(() => {
        activeCardRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }, 520);
      return () => clearTimeout(t);
    }
  }, [currentSegmentIndex, currentExerciseIndex]);

  // ── ExerciseEntry builder shared across all dispatch branches ────
  const buildEntry = (
    fe: FlatExercise,
    overrideStatus?: BlockStatus,
    overrideCurrentSetIndex?: number,
  ): ExerciseEntry => {
    const status = overrideStatus ?? statusOf(fe);
    const isCursorHere =
      fe.segmentIndex === currentSegmentIndex &&
      fe.exerciseIndex === currentExerciseIndex;
    return {
      exerciseId: fe.exercise.id,
      exerciseName: fe.exercise.name,
      imageUrl: resolveExImage(fe.exercise),
      sets: fe.sets,
      repsText: fe.repsText,
      exerciseType: fe.exerciseType,
      targetReps: fe.targetReps,
      status,
      currentSetIndex:
        overrideCurrentSetIndex ?? (isCursorHere ? currentSetIndex : 0),
      loggedReps: getLoggedReps(fe, workout, logLookup),
      loggedRepsRight: getLoggedRepsSide(fe, workout, logLookup, 'right'),
      loggedRepsLeft: getLoggedRepsSide(fe, workout, logLookup, 'left'),
      restDuration: fe.restDuration,
      // Legacy callback kept for WorkoutBlockCard (warmup) — the new
      // Lego blocks use the dedicated `onSaveSet` path instead.
      onPillTap: () => {},
      onDirectComplete: () =>
        handleRepetitionSave(fe.targetReps, undefined, true),
      repsSequence: fe.repsSequence,
      pyramidSequence: fe.pyramidSequence,
    };
  };

  return (
    <div
      className="flex-1 overflow-y-auto max-h-full scrollbar-none pb-[env(safe-area-inset-bottom,24px)]"
      dir="rtl"
    >
      <div className="pt-14 px-4">
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

        <LayoutGroup>
          <div className="space-y-5">
            {groupedSegments.map(
              ({ segmentIndex, segmentTitle, segmentIcon, exercises }) => {
                const isWarmupGroup =
                  segmentTitle.includes('חימום') ||
                  segmentTitle.toLowerCase().includes('warmup');
                const isCooldownGroup =
                  segmentTitle.includes('שחרור') ||
                  segmentTitle.includes('קירור') ||
                  segmentTitle.toLowerCase().includes('cooldown');

                return (
                  <div key={segmentIndex}>
                    {/* Segment header */}
                    <div className="flex items-center gap-2 mb-2.5 px-1">
                      <span className="text-base leading-none">
                        {segmentIcon}
                      </span>
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
                        · {exercises.length}{' '}
                        {exercises.length === 1 ? 'תרגיל' : 'תרגילים'}
                      </span>
                    </div>

                    {/* ── Dispatch ────────────────────────────────── */}
                    {isWarmupGroup || isCooldownGroup
                      ? renderWarmupCard({
                          exercises,
                          segmentTitle,
                          segmentIndex,
                        })
                      : renderMainSubGroups(segmentIndex)}
                  </div>
                );
              },
            )}
          </div>
        </LayoutGroup>
      </div>
    </div>
  );

  // ── Renderers (defined inside the component so they close over
  //    handleRepetitionSave / workoutState / etc. without prop drilling) ──

  function renderWarmupCard(args: {
    exercises: FlatExercise[];
    segmentTitle: string;
    segmentIndex: number;
  }) {
    const { exercises, segmentTitle, segmentIndex } = args;
    const statuses = exercises.map((fe) => statusOf(fe));
    const cardStatus: BlockStatus = statuses.includes('active')
      ? 'active'
      : statuses.every((s) => s === 'completed')
        ? 'completed'
        : 'upcoming';
    const isCardActive = cardStatus === 'active';
    const activeIdx = exercises.findIndex((fe) => statusOf(fe) === 'active');
    const isCardResting = isCardActive && workoutState === 'RESTING';

    const entries: ExerciseEntry[] = exercises.map((fe) => {
      const entry = buildEntry(fe);
      // Warmup/cooldown rows use the modal-less direct-complete path,
      // so the legacy onPillTap callback stays a no-op here.
      return {
        ...entry,
        currentSetIndex: statusOf(fe) === 'active' ? currentSetIndex : 0,
      };
    });

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
          isSuperSet={false}
          onSkipRest={onSkipRest}
        />
      </motion.div>
    );
  }

  function renderMainSubGroups(segmentIndex: number) {
    const subGroups = subGroupsMap.get(segmentIndex) ?? [];

    return (
      <div className="space-y-2">
        {subGroups.map((group) => {
          const statuses = group.exercises.map((fe) => statusOf(fe));
          const cardStatus: BlockStatus = statuses.includes('active')
            ? 'active'
            : statuses.every((s) => s === 'completed')
              ? 'completed'
              : 'upcoming';
          const isCardActive = cardStatus === 'active';
          const isCardResting = isCardActive && workoutState === 'RESTING';

          // Cursor-exact active index inside this group.
          const activeIdx = (() => {
            const exact = group.exercises.findIndex(
              (fe) =>
                fe.segmentIndex === currentSegmentIndex &&
                fe.exerciseIndex === currentExerciseIndex,
            );
            return exact >= 0
              ? exact
              : group.exercises.findIndex((fe) => statusOf(fe) === 'active');
          })();

          const entries = group.exercises.map((fe) => buildEntry(fe));

          // ── Superset dispatch ──────────────────────────────
          if (group.isSuperSet && entries.length >= 2) {
            return (
              <motion.div
                key={group.key}
                layout="position"
                layoutId={`grp-${group.key}`}
                ref={isCardActive ? activeCardRef : undefined}
              >
                <SupersetBlockGroup
                  exercises={entries}
                  cardStatus={cardStatus}
                  activeExerciseIndex={activeIdx}
                  isResting={isCardResting}
                  restTimeLeft={isCardResting ? restTimeLeft : undefined}
                  formatTime={formatTime}
                  onSkipRest={onSkipRest}
                  onSaveSet={(_exerciseIdx, setIndex, reps, sideData) =>
                    handleRepetitionSave(reps, sideData, undefined, setIndex)
                  }
                />
              </motion.div>
            );
          }

          // ── Solo strength exercise dispatch ────────────────
          const soloEntry = entries[0];
          if (!soloEntry) return null;
          return (
            <motion.div
              key={group.key}
              layout="position"
              layoutId={`grp-${group.key}`}
              ref={isCardActive ? activeCardRef : undefined}
            >
              <StrengthExerciseCard
                entry={soloEntry}
                isTurnActive={activeIdx === 0}
                onSaveSet={(setIndex, reps, sideData) =>
                  handleRepetitionSave(reps, sideData, undefined, setIndex)
                }
                isResting={isCardResting}
                restTimeLeft={isCardResting ? restTimeLeft : undefined}
                restDuration={soloEntry.restDuration}
                formatTime={formatTime}
                onSkipRest={onSkipRest}
              />
            </motion.div>
          );
        })}
      </div>
    );
  }
}
