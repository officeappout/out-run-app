'use client';

/**
 * WorkoutBlockCard — Segment-level card in the workout playlist.
 *
 * Renders one or more exercises from the same workout segment inside
 * a single white card. Each exercise gets its own inner tinted block.
 * A single rest progress bar sits at the bottom, visible only during RESTING.
 *
 * Pro-Active Navigation:
 *  - Auto-scrolls to the next exercise within a grouped card on focus shift.
 *  - Validates pill taps and pulses the correct target on wrong tap.
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, ChevronUp, Info, Dumbbell, RotateCcw, SkipForward } from 'lucide-react';
import confetti from 'canvas-confetti';
import SetPillsGrid, { SetPillData } from './SetPillsGrid';

export type BlockStatus = 'completed' | 'active' | 'upcoming';

export interface ExerciseEntry {
  exerciseId: string;
  exerciseName: string;
  imageUrl?: string | null;
  sets: number;
  repsText: string;
  exerciseType: 'reps' | 'time';
  targetReps: number;
  status: BlockStatus;
  currentSetIndex: number;
  loggedReps: (number | null)[];
  loggedRepsRight?: (number | null)[];
  loggedRepsLeft?: (number | null)[];
  restDuration: number;
  onPillTap: (setIndex: number) => void;
  onDirectComplete?: () => void;
}

export interface WorkoutBlockCardProps {
  exercises: ExerciseEntry[];
  segmentTitle: string;
  cardStatus: BlockStatus;
  activeExerciseIndex: number;
  isResting: boolean;
  restTimeLeft?: number;
  formatTime?: (s: number) => string;
  exerciseRole?: string;
  isSuperSet: boolean;
  onSkipRest?: () => void;
}

/**
 * Returns the index of the first set that hasn't been completed yet,
 * considering both logged reps (DataEntryModal) and the state machine index.
 * Returns -1 if every set is done.
 */
function findFirstIncompleteSet(entry: ExerciseEntry): number {
  for (let j = 0; j < entry.sets; j++) {
    if (entry.loggedReps[j] === null && j >= entry.currentSetIndex) {
      return j;
    }
  }
  return -1;
}

function buildPills(entry: ExerciseEntry): SetPillData[] {
  const isCompleted = entry.status === 'completed';
  const isEntryActive = entry.status === 'active';
  const firstIncompleteSet = isEntryActive ? findFirstIncompleteSet(entry) : -1;

  return Array.from({ length: entry.sets }, (_, i): SetPillData => {
    let pillStatus: 'completed' | 'active' | 'upcoming';
    if (isCompleted) {
      pillStatus = 'completed';
    } else if (isEntryActive) {
      if (firstIncompleteSet === -1) {
        pillStatus = 'completed';
      } else if (i < firstIncompleteSet) {
        pillStatus = 'completed';
      } else if (i === firstIncompleteSet) {
        pillStatus = 'active';
      } else {
        pillStatus = 'upcoming';
      }
    } else {
      pillStatus = 'upcoming';
    }
    return {
      setIndex: i,
      status: pillStatus,
      targetReps: entry.targetReps,
      loggedReps: entry.loggedReps[i] ?? null,
      loggedRepsRight: entry.loggedRepsRight?.[i] ?? null,
      loggedRepsLeft: entry.loggedRepsLeft?.[i] ?? null,
      isTimeBased: entry.exerciseType === 'time',
    };
  });
}

export default function WorkoutBlockCard({
  exercises,
  segmentTitle,
  cardStatus,
  activeExerciseIndex,
  isResting,
  restTimeLeft,
  formatTime,
  exerciseRole,
  isSuperSet,
  onSkipRest,
}: WorkoutBlockCardProps) {
  const isActive = cardStatus === 'active';
  const isCompleted = cardStatus === 'completed';
  const [expanded, setExpanded] = useState(isActive);
  const manualOverride = useRef(false);
  const prevCardStatus = useRef(cardStatus);

  useEffect(() => {
    if (cardStatus === prevCardStatus.current) return;
    prevCardStatus.current = cardStatus;
    manualOverride.current = false;

    if (isActive) setExpanded(true);
    else if (isCompleted) setExpanded(false);
  }, [cardStatus, isActive, isCompleted]);

  const toggleExpanded = useCallback(() => {
    manualOverride.current = true;
    setExpanded(prev => !prev);
  }, []);

  // ── Guide-pulse state (orange shake on wrong pill tap) ──────────────────
  const [guidePulse, setGuidePulse] = useState<{ exerciseIdx: number; setIdx: number } | null>(null);
  const exerciseRowRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const prevActiveExIdx = useRef(activeExerciseIndex);

  // Auto-scroll to the new active exercise within a grouped card
  useEffect(() => {
    if (exercises.length <= 1) return;
    if (activeExerciseIndex < 0 || activeExerciseIndex === prevActiveExIdx.current) return;
    prevActiveExIdx.current = activeExerciseIndex;
    const t = setTimeout(() => {
      exerciseRowRefs.current.get(activeExerciseIndex)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }, 520);
    return () => clearTimeout(t);
  }, [activeExerciseIndex, exercises.length]);

  // Fallback timeout — clear pulse even if onAnimationEnd doesn't fire
  useEffect(() => {
    if (!guidePulse) return;
    const t = setTimeout(() => setGuidePulse(null), 1200);
    return () => clearTimeout(t);
  }, [guidePulse]);

  // ── Localized confetti on exercise completion ───────────────────────────
  const confettiFired = useRef<Set<string> | null>(null);
  const confettiCanvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());

  if (!confettiFired.current) {
    confettiFired.current = new Set(
      exercises.filter(e => e.status === 'completed').map(e => e.exerciseId),
    );
  }

  useEffect(() => {
    exercises.forEach((entry, idx) => {
      if (confettiFired.current!.has(entry.exerciseId)) return;

      const allDone =
        entry.status === 'completed' ||
        (entry.sets > 0 && entry.loggedReps.every(r => r !== null));
      if (!allDone) return;

      confettiFired.current!.add(entry.exerciseId);

      const canvas = confettiCanvasRefs.current.get(idx);
      if (!canvas) return;

      const localConfetti = confetti.create(canvas, { resize: true });
      localConfetti({
        particleCount: 45,
        spread: 50,
        origin: { x: 0.5, y: 0.45 },
        colors: ['#00BAF7', '#0CF2E3', '#FFD700', '#FFFFFF'],
        startVelocity: 14,
        gravity: 1.4,
        scalar: 0.7,
        ticks: 70,
        disableForReducedMotion: true,
      });
    });
  }, [exercises]);

  // ── Pill-tap validation ─────────────────────────────────────────────────
  const handlePillTap = useCallback(
    (exerciseIdx: number, setIdx: number) => {
      const entry = exercises[exerciseIdx];
      if (!entry) return;

      // Completed exercise → all pills re-editable
      if (entry.status === 'completed') {
        entry.onPillTap(setIdx);
        return;
      }

      if (exerciseIdx === activeExerciseIndex) {
        const firstIncomplete = findFirstIncompleteSet(entry);

        // Already-logged set → re-edit allowed
        if (entry.loggedReps[setIdx] !== null || setIdx < entry.currentSetIndex) {
          entry.onPillTap(setIdx);
          return;
        }

        // First incomplete set (the active pill) → log allowed
        if (setIdx === firstIncomplete) {
          entry.onPillTap(setIdx);
          return;
        }

        // Future set → pulse the correct pill
        if (firstIncomplete >= 0) {
          setGuidePulse({ exerciseIdx, setIdx: firstIncomplete });
        }
        return;
      }

      // Non-active exercise → pulse the active exercise's correct pill
      if (activeExerciseIndex >= 0) {
        const activeEntry = exercises[activeExerciseIndex];
        const firstIncomplete = findFirstIncompleteSet(activeEntry);
        if (firstIncomplete >= 0) {
          setGuidePulse({
            exerciseIdx: activeExerciseIndex,
            setIdx: firstIncomplete,
          });
        }

        if (exercises.length > 1) {
          requestAnimationFrame(() => {
            exerciseRowRefs.current.get(activeExerciseIndex)?.scrollIntoView({
              behavior: 'smooth',
              block: 'center',
            });
          });
        }
      }
    },
    [exercises, activeExerciseIndex],
  );

  // ── Derived values ──────────────────────────────────────────────────────
  const isWarmup = exerciseRole === 'warmup'
    || segmentTitle?.includes('חימום')
    || segmentTitle?.toLowerCase().includes('warmup');

  const isCooldown = exerciseRole === 'cooldown'
    || segmentTitle?.includes('שחרור')
    || segmentTitle?.includes('קירור')
    || segmentTitle?.toLowerCase().includes('cooldown');

  const isGrouped = exercises.length > 1;

  const nextExerciseIndex = isResting
    && activeExerciseIndex >= 0
    && activeExerciseIndex < exercises.length - 1
    ? activeExerciseIndex + 1
    : -1;

  const headerLabel = useMemo(() => {
    if (isWarmup) return 'חימום';
    if (isCooldown) return 'שחרור';
    if (expanded) {
      if (isSuperSet) return `סופר סט (${exercises.length} תרגילים)`;
      if (isGrouped) return segmentTitle || `${exercises.length} תרגילים`;
      return 'תרגיל בודד';
    }
    if (isGrouped && exercises.length >= 2) {
      return `${exercises[0].exerciseName} + ${exercises[1].exerciseName}`;
    }
    return exercises[0]?.exerciseName ?? '';
  }, [isWarmup, isCooldown, expanded, isSuperSet, isGrouped, exercises, segmentTitle]);

  const roundLabel = useMemo(() => {
    if (isGrouped) return `${exercises.length} תרגילים`;
    const ex = exercises[0];
    return ex && ex.sets > 1 ? `${ex.sets}x סבבים` : 'סבב 1';
  }, [isGrouped, exercises]);

  const activeEntry = activeExerciseIndex >= 0 ? exercises[activeExerciseIndex] : null;
  const restDuration = activeEntry?.restDuration || 30;

  return (
    <div
      className={[
        'relative rounded-2xl shadow-md shadow-slate-200/60 dark:shadow-slate-900/40 transition-all duration-500 overflow-visible',
        isActive
          ? 'border border-[#E0E9FF] dark:border-slate-700 bg-white dark:bg-slate-900 scale-[1.01]'
          : isCompleted
            ? expanded
              ? 'border border-[#E0E9FF] dark:border-slate-700 bg-white dark:bg-slate-900'
              : 'border-2 border-[#00BAF7] bg-[#F0FDFF] dark:bg-slate-800'
            : 'border border-[#E0E9FF] dark:border-slate-700 bg-white dark:bg-slate-900 opacity-70',
      ].join(' ')}
    >
      {/* ── Completed checkmark badge ──────────────────────────────────── */}
      <AnimatePresence>
        {isCompleted && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 20, mass: 0.8 }}
            className="absolute -top-3 -right-3 z-20 w-7 h-7 rounded-full flex items-center justify-center drop-shadow-md"
            style={{ backgroundColor: '#00BAF7' }}
          >
            <Check size={16} className="text-white" strokeWidth={3} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <button
        onClick={toggleExpanded}
        className="w-full flex items-center justify-between px-4 pt-3 pb-2"
      >
        <span
          className="text-sm font-bold text-slate-900 dark:text-white truncate max-w-[60%] transition-all duration-200"
          style={{ fontFamily: 'var(--font-simpler)' }}
        >
          {headerLabel}
        </span>

        <div className="flex items-center gap-2">
          <span
            className={[
              'text-xs font-medium',
              isWarmup || isCooldown
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-slate-500 dark:text-slate-400',
            ].join(' ')}
            style={{ fontFamily: 'var(--font-simpler)' }}
          >
            {roundLabel}
          </span>
          <Info size={14} className="text-slate-300" />
          <motion.div
            animate={{ rotate: expanded ? 0 : 180 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronUp size={16} className="text-slate-400" />
          </motion.div>
        </div>
      </button>

      {/* ── Expandable body ────────────────────────────────────────────── */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{
              height: 'auto',
              opacity: 1,
              transition: {
                height: { duration: 0.45, ease: [0.22, 1, 0.36, 1] },
                opacity: { duration: 0.25, delay: 0.12 },
              },
            }}
            exit={{
              height: 0,
              opacity: 0,
              transition: {
                opacity: { duration: 0.15, ease: 'easeIn' },
                height: { duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: 0.08 },
              },
            }}
            className="overflow-hidden"
          >
            {/* ── Exercise rows ──────────────────────────────────────────── */}
            {exercises.map((entry, idx) => {
              const isEntryActive = entry.status === 'active';
              const isEntryCompleted = entry.status === 'completed';
              const isNextUp = idx === nextExerciseIndex;
              const isSimpleComplete = isWarmup || isCooldown;
              const pills = isSimpleComplete ? [] : buildPills(entry);
              const allLoggedDone = entry.sets > 0 && entry.loggedReps.every(r => r !== null);

              console.log(
                `📋 [Playlist Card] exercise: ${entry.exerciseName} | status: ${entry.status} | loggedReps: [${entry.loggedReps.join(', ')}] | t=${performance.now().toFixed(1)}ms`,
              );

              return (
                <motion.div
                  layout
                  layoutId={`ex-row-${entry.exerciseId}`}
                  key={entry.exerciseId}
                  ref={(el: HTMLDivElement | null) => {
                    if (el) exerciseRowRefs.current.set(idx, el);
                    else exerciseRowRefs.current.delete(idx);
                  }}
                  transition={{ layout: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] } }}
                  className={[
                    'relative overflow-hidden mx-3 rounded-xl p-3 mb-2',
                    isEntryActive
                      ? 'bg-[#BFEEFD]'
                      : isNextUp
                        ? 'bg-[#BFEEFD]/30 ring-1 ring-[#00BAF7]/20'
                        : 'bg-[#F0FDFF] dark:bg-slate-800/40',
                  ].join(' ')}
                >
                  <canvas
                    ref={(el: HTMLCanvasElement | null) => {
                      if (el) confettiCanvasRefs.current.set(idx, el);
                      else confettiCanvasRefs.current.delete(idx);
                    }}
                    className="absolute inset-0 w-full h-full pointer-events-none"
                    style={{ zIndex: 20 }}
                  />
                  <div className="flex items-start gap-3">
                    <div className={[
                      'rounded-xl bg-slate-200 dark:bg-slate-700 overflow-hidden shrink-0',
                      isEntryActive ? 'w-24 h-24' : 'w-20 h-20',
                    ].join(' ')}>
                      {entry.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={entry.imageUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Dumbbell size={22} className="text-slate-400" />
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0 pt-1 text-right">
                      <p
                        className={[
                          'font-bold mb-1',
                          isEntryActive ? 'text-lg' : 'text-base',
                          isEntryCompleted
                            ? 'text-slate-500 dark:text-slate-400'
                            : 'text-slate-900 dark:text-white',
                        ].join(' ')}
                        style={{ fontFamily: 'var(--font-simpler)' }}
                      >
                        {entry.exerciseName}
                      </p>
                      <p
                        className={[
                          'mb-3',
                          isEntryActive
                            ? 'text-base font-medium text-slate-800 dark:text-slate-200'
                            : 'text-sm text-slate-500 dark:text-slate-400',
                        ].join(' ')}
                        style={{ fontFamily: 'var(--font-simpler)' }}
                      >
                        {entry.repsText}
                      </p>

                      {isSimpleComplete ? (
                        (isEntryCompleted || allLoggedDone) ? (
                          <div className="flex items-center gap-1.5 text-[#00BAF7]" style={{ fontFamily: 'var(--font-simpler)' }}>
                            <Check size={14} strokeWidth={3} />
                            <span className="text-xs font-bold">בוצע</span>
                          </div>
                        ) : isEntryActive ? (
                          <button
                            onClick={() => entry.onDirectComplete?.()}
                            className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-bold text-white transition-all duration-300"
                            style={{
                              fontFamily: 'var(--font-simpler)',
                              background: 'linear-gradient(to left, #00BAF7, #0CF2E3)',
                            }}
                          >
                            <Check size={12} strokeWidth={3} />
                            סמן כבוצע
                          </button>
                        ) : null
                      ) : (
                        <SetPillsGrid
                          pills={pills}
                          onPillTap={(setIdx) => handlePillTap(idx, setIdx)}
                          pulseSetIndex={guidePulse?.exerciseIdx === idx ? guidePulse.setIdx : null}
                          onPulseComplete={() => setGuidePulse(null)}
                        />
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}

            {/* ── Rest progress bar — only visible during RESTING ─────── */}
            {isActive && isResting && (() => {
              const totalRest = restDuration;
              const isEnding = restTimeLeft !== undefined && restTimeLeft <= 10;
              const progress = restTimeLeft !== undefined
                ? Math.max(0, Math.min(100, (restTimeLeft / totalRest) * 100))
                : 100;

              return (
                <div
                  className={[
                    'relative overflow-hidden mx-3 mb-2 h-[36px] rounded-[8px] transition-all duration-500',
                    isEnding ? 'bg-white' : 'bg-[#BFEEFD]',
                  ].join(' ')}
                  style={{ border: isEnding ? '1px solid rgba(255,138,0,0.1)' : '0.5px solid #00BAF7' }}
                >
                  <div
                    className="absolute inset-y-0 right-0 rounded-[8px]"
                    style={{
                      width: `${progress}%`,
                      backgroundColor: isEnding ? '#FF8A00' : '#00BAF7',
                      transition: 'width 1s linear, background-color 0.5s ease',
                    }}
                  />
                  <div className="relative z-10 flex items-center justify-between h-full px-4">
                    <div className="flex items-center gap-2">
                      <span
                        className={[
                          'text-sm font-bold tabular-nums transition-colors duration-500',
                          isEnding ? 'text-[#FF8A00]' : 'text-slate-800',
                        ].join(' ')}
                        style={{ fontFamily: 'var(--font-simpler)' }}
                      >
                        {restTimeLeft !== undefined && formatTime
                          ? formatTime(restTimeLeft)
                          : formatTime?.(restDuration) ?? '00:30'}
                      </span>
                      <span
                        className="text-xs text-slate-500"
                        style={{ fontFamily: 'var(--font-simpler)' }}
                      >
                        מנוחה
                      </span>
                    </div>
                    <button
                      onClick={() => onSkipRest?.()}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/60 active:bg-white/90 transition-colors"
                    >
                      <span
                        className="text-[11px] font-bold text-slate-700"
                        style={{ fontFamily: 'var(--font-simpler)' }}
                      >
                        דלג
                      </span>
                      <SkipForward size={13} className="text-slate-700" strokeWidth={2.5} />
                    </button>
                  </div>
                </div>
              );
            })()}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
