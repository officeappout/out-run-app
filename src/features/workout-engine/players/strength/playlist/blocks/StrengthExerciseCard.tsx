'use client';

/**
 * StrengthExerciseCard — Single-exercise Lego.
 *
 * Composes: thumbnail + name + reps text + N × StrengthSetRow.
 * Owns:
 *   - confetti firing when the exercise completes
 *   - guide-pulse coordinator that lets `StrengthSetRow` notify the card
 *     about taps and lets the card decide which row's pill should shake
 *
 * Does NOT own:
 *   - accordion / collapse behavior (always rendered expanded — main
 *     segment cards are the warmup-card layout the user already asked
 *     for in the flattening cleanup)
 *   - the modal mount itself (each row owns its own)
 *
 * `useSuperFrame=true` is set by `SupersetBlockGroup` to drop the
 * standalone card chrome — the surrounding superset frame already
 * provides the border, shadow and rest bar.
 */

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, ChevronUp, Dumbbell } from 'lucide-react';
import confetti from 'canvas-confetti';
import { useCachedMediaMap } from '@/features/favorites/hooks/useCachedMedia';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { pyramidLabel } from '@/features/workout-engine/logic/protocols/pyramid.processor';
import StrengthSetRow, { TapVerdict } from './StrengthSetRow';
import RestProgressBar from './RestProgressBar';
import { buildPills, findFirstIncompleteSet } from '../utils/set-status.utils';
import type { ExerciseEntry } from '../types';

const OFFLINE_PLACEHOLDER = '/images/park-placeholder.svg';

export interface StrengthExerciseCardProps {
  entry: ExerciseEntry;
  /** True when this card's exercise is the live cursor target. */
  isTurnActive: boolean;
  /** Forwarded to each row so saves bubble to the playlist. */
  onSaveSet: (
    setIndex: number,
    reps: number,
    sideData?: { left: number; right: number },
  ) => void;
  /**
   * When true, omit the standalone card chrome (border / shadow / padding).
   * `SupersetBlockGroup` sets this so two cards can sit inside a single
   * superset frame without doubling the border.
   */
  useSuperFrame?: boolean;
  /**
   * Optional external tap broker — superset groups use it to route a tap
   * on the wrong-exercise card to the active sibling's pulse.  Returning
   * `'open'` means "this row may open its own modal".
   */
  onCrossExerciseTap?: () => TapVerdict;
  /**
   * When true, the engine is in the RESTING phase for this exercise.
   * Solo cards render an inline `RestProgressBar` under the pills so the
   * user sees the countdown without leaving the playlist viewport.
   * Inside a `useSuperFrame=true` card the rest bar is owned by the
   * surrounding `SupersetBlockGroup`, so this prop is ignored.
   */
  isResting?: boolean;
  /** Seconds remaining in the current rest interval. */
  restTimeLeft?: number;
  /** Total rest duration the bar started at — drives the bar width. */
  restDuration?: number;
  /** mm:ss formatter from the workout-timers hook. */
  formatTime?: (s: number) => string;
  /** Skip-rest callback wired to the state machine's `skipRest`. */
  onSkipRest?: () => void;
}

export default function StrengthExerciseCard({
  entry,
  isTurnActive,
  onSaveSet,
  useSuperFrame = false,
  onCrossExerciseTap,
  isResting = false,
  restTimeLeft,
  restDuration,
  formatTime,
  onSkipRest,
}: StrengthExerciseCardProps) {
  const isCompleted = entry.status === 'completed';
  const isActive = entry.status === 'active';

  // ── Accordion: only the active card is expanded by default.  Status
  // changes auto-sync (active → expand, completed → collapse) while
  // user taps on the header chevron toggle the override.
  const [expanded, setExpanded] = useState(isActive);
  const prevStatus = useRef(entry.status);

  useEffect(() => {
    if (entry.status === prevStatus.current) return;
    prevStatus.current = entry.status;
    if (isActive) setExpanded(true);
    else if (isCompleted) setExpanded(false);
  }, [entry.status, isActive, isCompleted]);

  const toggleExpanded = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  // ── Pills view-model ──────────────────────────────────────────────
  const pills = useMemo(() => buildPills(entry), [entry]);

  // Quick "X / N" badge for the collapsed header so the user can see
  // progress without expanding the card.
  const loggedCount = useMemo(
    () => entry.loggedReps.filter((r) => r !== null).length,
    [entry.loggedReps],
  );

  // ── Guide-pulse coordinator (which pill should shake?) ────────────
  const [pulseSetIdx, setPulseSetIdx] = useState<number | null>(null);

  // Clear the pulse after 1.2s as a safety net in case onAnimationEnd
  // never fires (e.g. row unmounts mid-animation during a cursor swap).
  useEffect(() => {
    if (pulseSetIdx == null) return;
    const t = setTimeout(() => setPulseSetIdx(null), 1200);
    return () => clearTimeout(t);
  }, [pulseSetIdx]);

  const onAttemptOpen = useCallback(
    (setIndex: number): TapVerdict => {
      // Non-active exercise → defer to cross-exercise broker (typically
      // pulses the active sibling's first incomplete pill in a superset).
      if (!isTurnActive) {
        return onCrossExerciseTap ? onCrossExerciseTap() : 'block';
      }

      // Completed exercise → all pills re-editable.
      if (isCompleted) return 'open';

      // Already logged set OR past the cursor → re-edit allowed.
      if (entry.loggedReps[setIndex] !== null || setIndex < entry.currentSetIndex) {
        return 'open';
      }

      const firstIncomplete = findFirstIncompleteSet(entry);
      if (setIndex === firstIncomplete) return 'open';

      // Tapped a future pill → pulse the correct one.
      if (firstIncomplete >= 0) {
        setPulseSetIdx(firstIncomplete);
      }
      return 'pulse';
    },
    [isTurnActive, isCompleted, entry, onCrossExerciseTap],
  );

  // ── Localized confetti on completion ─────────────────────────────
  const confettiFired = useRef(false);
  const confettiCanvasRef = useRef<HTMLCanvasElement | null>(null);

  if (!confettiFired.current && entry.status === 'completed') {
    // Seed as already-fired for entries that mount in the completed
    // state (e.g. workout resume) so we don't replay celebration.
    confettiFired.current = true;
  }

  useEffect(() => {
    if (confettiFired.current) return;
    const allDone =
      entry.status === 'completed' ||
      (entry.sets > 0 && entry.loggedReps.every((r) => r !== null));
    if (!allDone) return;

    confettiFired.current = true;

    const canvas = confettiCanvasRef.current;
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
  }, [entry]);

  // ── Offline-cached thumbnail ─────────────────────────────────────
  const isOnline = useOnlineStatus();
  const cachedImageMap = useCachedMediaMap(
    useMemo(() => [entry.imageUrl ?? null], [entry.imageUrl]),
  );
  const thumbnailSrc = (() => {
    if (!entry.imageUrl) return null;
    const resolved = cachedImageMap.get(entry.imageUrl);
    if (resolved?.startsWith('blob:')) return resolved;
    return isOnline ? (resolved || entry.imageUrl) : OFFLINE_PLACEHOLDER;
  })();

  // ── Optional pyramid label, shown above the rep text ──────────────
  const pyramidTitle = useMemo(() => {
    if (entry.pyramidSequence && entry.pyramidSequence.length > 0) {
      return pyramidLabel(entry.pyramidSequence);
    }
    return null;
  }, [entry.pyramidSequence]);

  // ── Card chrome (or none, when inside a superset frame) ──────────
  const chromeClass = useSuperFrame
    ? 'relative rounded-xl overflow-hidden'
    : [
        'relative rounded-2xl shadow-md shadow-slate-200/60 dark:shadow-slate-900/40 transition-all duration-500 overflow-visible',
        isActive
          ? 'border border-[#E0E9FF] dark:border-slate-700 bg-white dark:bg-slate-900 scale-[1.01]'
          : isCompleted
            ? 'border-2 border-[#00BAF7] bg-[#F0FDFF] dark:bg-slate-800'
            : 'border border-[#E0E9FF] dark:border-slate-700 bg-white dark:bg-slate-900 opacity-70',
      ].join(' ');

  return (
    <div className={chromeClass}>
      {/* ── Completed checkmark badge (skipped inside superset frame) ── */}
      {!useSuperFrame && (
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
      )}

      {/* ── Slim header (always visible) — name + progress + chevron ── */}
      <button
        type="button"
        onClick={toggleExpanded}
        className="w-full flex items-center justify-between gap-2 px-3 pt-2.5 pb-1.5"
        dir="rtl"
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {isCompleted && (
            <Check
              size={14}
              className="text-[#00BAF7] shrink-0"
              strokeWidth={3}
            />
          )}
          <span
            className={[
              'text-sm font-bold truncate text-right',
              isCompleted
                ? 'text-slate-500 dark:text-slate-400'
                : 'text-slate-900 dark:text-white',
            ].join(' ')}
            style={{ fontFamily: 'var(--font-simpler)' }}
          >
            {entry.exerciseName}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span
            className="text-[11px] font-medium text-slate-500 dark:text-slate-400 tabular-nums"
            style={{ fontFamily: 'var(--font-simpler)' }}
          >
            {loggedCount}/{entry.sets}
          </span>
          <motion.div
            animate={{ rotate: expanded ? 0 : 180 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronUp size={16} className="text-slate-400" />
          </motion.div>
        </div>
      </button>

      {/* ── Accordion body — only mounted/visible when expanded ───── */}
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
            <div
              className={[
                'relative overflow-hidden rounded-xl p-3',
                useSuperFrame ? 'mx-0 mt-1' : 'mx-3 mb-3 mt-1',
                isActive
                  ? 'bg-[#BFEEFD]'
                  : 'bg-[#F0FDFF] dark:bg-slate-800/40',
              ].join(' ')}
            >
              <canvas
                ref={confettiCanvasRef}
                className="absolute inset-0 w-full h-full pointer-events-none"
                style={{ zIndex: 20 }}
              />
              {entry.pyramidSequence && entry.pyramidSequence.length > 0 ? (
                /* ── Pyramid: full-width vertical rows, each with its own thumbnail ── */
                <div className="w-full">
                  {/* Protocol label (e.g. "סט שיא") */}
                  {pyramidTitle && (
                    <p
                      className="text-xs font-bold text-[#00BAF7] mb-2 truncate text-right"
                      style={{ fontFamily: 'var(--font-simpler)' }}
                    >
                      {pyramidTitle}
                    </p>
                  )}

                  <div className="space-y-2">
                    {entry.pyramidSequence.map((step, i) => {
                      const pill = pills[i];
                      if (!pill) return null;

                      const stepTarget = step.targetHold ?? step.targetReps;
                      const unit = step.targetHold != null ? 'שניות' : 'חזרות';
                      const stepThumb = step.imageUrl ?? entry.imageUrl ?? null;

                      const isPast =
                        i < entry.currentSetIndex ||
                        entry.loggedReps[i] !== null;
                      const isCurrent = i === entry.currentSetIndex && isActive;
                      const isFuture = !isPast && !isCurrent;

                      return (
                        <div
                          key={i}
                          className={[
                            'rounded-xl px-2.5 py-2 transition-all duration-300',
                            isCurrent
                              ? 'bg-[#E0F7FF] dark:bg-blue-950/40 ring-1 ring-[#00BAF7]/40'
                              : isPast
                                ? 'bg-slate-100/70 dark:bg-slate-800/30'
                                : 'bg-slate-50 dark:bg-slate-800/20',
                            isFuture ? 'opacity-50' : '',
                          ].join(' ')}
                        >
                          {/* Step row: thumbnail (right in RTL) + content */}
                          <div className="flex items-center gap-2.5">
                            {/* Per-step thumbnail */}
                            <div className="relative w-12 h-12 rounded-lg overflow-hidden shrink-0 bg-slate-100 dark:bg-slate-700 shadow-sm">
                              {stepThumb ? (
                                stepThumb.startsWith('blob:') ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={stepThumb}
                                    alt=""
                                    className="w-full h-full object-cover"
                                    onError={(e) => {
                                      (e.target as HTMLImageElement).src = OFFLINE_PLACEHOLDER;
                                    }}
                                  />
                                ) : (
                                  <Image
                                    src={stepThumb}
                                    alt=""
                                    fill
                                    className="object-cover"
                                    sizes="48px"
                                    onError={(e) => {
                                      (e.target as HTMLImageElement).src = OFFLINE_PLACEHOLDER;
                                    }}
                                  />
                                )
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <Dumbbell size={14} className="text-slate-400" />
                                </div>
                              )}
                            </div>

                            {/* Name + target + pill */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2 mb-1.5">
                                <span
                                  className={[
                                    'text-xs font-bold truncate',
                                    isCurrent
                                      ? 'text-[#00BAF7]'
                                      : isPast
                                        ? 'text-slate-400 dark:text-slate-500'
                                        : 'text-slate-600 dark:text-slate-400',
                                  ].join(' ')}
                                  style={{ fontFamily: 'var(--font-simpler)' }}
                                >
                                  {step.name}
                                </span>
                                <span
                                  className={[
                                    'text-xs font-bold shrink-0',
                                    isCurrent
                                      ? 'text-[#00BAF7]'
                                      : isPast
                                        ? 'text-slate-400 dark:text-slate-500'
                                        : 'text-slate-500 dark:text-slate-400',
                                  ].join(' ')}
                                  style={{ fontFamily: 'var(--font-simpler)' }}
                                >
                                  {stepTarget != null ? `${stepTarget} ${unit}` : ''}
                                </span>
                              </div>

                              <StrengthSetRow
                                setIndex={pill.setIndex}
                                pillData={pill}
                                entry={entry}
                                isTurnActive={isTurnActive && isCurrent}
                                onAttemptOpen={onAttemptOpen}
                                onSaveSet={onSaveSet}
                                pulseActive={pulseSetIdx === pill.setIndex}
                                onPulseEnd={() => setPulseSetIdx(null)}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Inline rest countdown for pyramid exercises */}
                  {!useSuperFrame && isTurnActive && isResting && (
                    <div className="mt-3 -mx-1">
                      <RestProgressBar
                        restTimeLeft={restTimeLeft}
                        formatTime={formatTime}
                        totalRest={restDuration ?? entry.restDuration ?? 30}
                        onSkip={onSkipRest}
                        className=""
                      />
                    </div>
                  )}
                </div>
              ) : (
                /* ── Standard (non-pyramid): shared thumbnail + content ── */
                <div className="flex items-start gap-3">
                  {/* Shared thumbnail */}
                  <div className="relative w-24 h-24 rounded-xl bg-slate-200 dark:bg-slate-700 overflow-hidden shrink-0">
                    {thumbnailSrc ? (
                      thumbnailSrc.startsWith('blob:') ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={thumbnailSrc}
                          alt=""
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = OFFLINE_PLACEHOLDER;
                          }}
                        />
                      ) : (
                        <Image
                          src={thumbnailSrc}
                          alt=""
                          fill
                          className="object-cover"
                          sizes="96px"
                          priority={isTurnActive}
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = OFFLINE_PLACEHOLDER;
                          }}
                        />
                      )
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Dumbbell size={22} className="text-slate-400" />
                      </div>
                    )}
                  </div>

                  {/* Reps text + per-set rows */}
                  <div className="flex-1 min-w-0 pt-1 text-right">
                    {/* Protocol label (e.g. "סט שיא") */}
                    {pyramidTitle && (
                      <p
                        className="text-xs font-bold text-[#00BAF7] mb-1 truncate"
                        style={{ fontFamily: 'var(--font-simpler)' }}
                      >
                        {pyramidTitle}
                      </p>
                    )}

                    <p
                      className={[
                        'mb-3',
                        isActive
                          ? 'text-base font-medium text-slate-800 dark:text-slate-200'
                          : 'text-sm text-slate-500 dark:text-slate-400',
                      ].join(' ')}
                      style={{ fontFamily: 'var(--font-simpler)' }}
                    >
                      {entry.repsText}
                    </p>

                    <div className="flex flex-wrap gap-2 items-end">
                      {pills.map((pill) => (
                        <StrengthSetRow
                          key={pill.setIndex}
                          setIndex={pill.setIndex}
                          pillData={pill}
                          entry={entry}
                          isTurnActive={isTurnActive}
                          onAttemptOpen={onAttemptOpen}
                          onSaveSet={onSaveSet}
                          pulseActive={pulseSetIdx === pill.setIndex}
                          onPulseEnd={() => setPulseSetIdx(null)}
                        />
                      ))}
                    </div>

                    {/* Inline rest countdown — solo cards only.  In supersets the
                        shared `SupersetBlockGroup` owns the bar (both partners
                        share one rest window). */}
                    {!useSuperFrame && isTurnActive && isResting && (
                      <div className="mt-3 -mx-1">
                        <RestProgressBar
                          restTimeLeft={restTimeLeft}
                          formatTime={formatTime}
                          totalRest={restDuration ?? entry.restDuration ?? 30}
                          onSkip={onSkipRest}
                          className=""
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
