'use client';

/**
 * StrengthSetRow — Atomic per-set Lego.
 *
 * Renders ONE pill for ONE set of ONE exercise.  Owns its own
 * `DataEntryModal` mount, so the rep-entry context is sealed inside this
 * row's React identity:
 *   - Cursor swaps between supersets do NOT clobber another row's modal
 *     (each row has its own useState; there is no playlist-level shared
 *      modal state to overwrite).
 *   - Unmounting the row tears the modal down automatically — no zombie
 *     overlays leaking from re-rendered cards.
 *
 * Validation policy lives one level up (`StrengthExerciseCard`).  The row
 * calls `onAttemptOpen(setIndex)`; if the parent returns `'open'` the row
 * flips its own `isModalOpen` state.  Any other verdict (`'pulse'`,
 * `'block'`) is handled by the parent's coordinator so cross-row guide
 * pulses still fire on the correct pill.
 */

import React, { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import SetPillsGrid, { SetPillData } from '../SetPillsGrid';
import DataEntryModal from '../DataEntryModal';
import type { ExerciseEntry } from '../types';

export type TapVerdict = 'open' | 'pulse' | 'block';

export interface StrengthSetRowProps {
  /** Set index inside the exercise (0-based). */
  setIndex: number;
  /** Pre-built pill view-model for THIS set only. */
  pillData: SetPillData;
  /** The owning exercise — used to populate the modal at open time. */
  entry: ExerciseEntry;
  /** True when this row's exercise matches the live state-machine cursor. */
  isTurnActive: boolean;
  /**
   * Parent-supplied validator.  Returning `'open'` causes this row to
   * mount its own DataEntryModal; any other verdict is the parent's
   * responsibility (typically setting a guide-pulse on a sibling row).
   */
  onAttemptOpen: (setIndex: number) => TapVerdict;
  /**
   * Forwards the saved reps to the playlist → state machine.
   * The row never knows about `handleRepetitionSave` directly; this
   * keeps it framework-agnostic and trivial to drop into other tracks.
   */
  onSaveSet: (
    setIndex: number,
    reps: number,
    sideData?: { left: number; right: number },
  ) => void;
  /** When true, this pill plays the orange guide-pulse animation. */
  pulseActive?: boolean;
  /** Fires once the guide-pulse animation finishes. */
  onPulseEnd?: () => void;
}

export default function StrengthSetRow({
  setIndex,
  pillData,
  entry,
  isTurnActive,
  onAttemptOpen,
  onSaveSet,
  pulseActive = false,
  onPulseEnd,
}: StrengthSetRowProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleTap = useCallback(() => {
    const verdict = onAttemptOpen(setIndex);
    if (verdict === 'open') {
      setIsModalOpen(true);
    }
  }, [onAttemptOpen, setIndex]);

  const handleSave = useCallback(
    (value: number, sideData?: { left: number; right: number }) => {
      onSaveSet(setIndex, value, sideData);
      setIsModalOpen(false);
    },
    [onSaveSet, setIndex],
  );

  // Mount the modal via a Portal so it escapes any ancestor `transform` or
  // `overflow-hidden` (Framer Motion adds CSS transforms to motion ancestors,
  // which would otherwise re-anchor `fixed` and clip our modal inside the card).
  const modalNode =
    isModalOpen && typeof document !== 'undefined'
      ? createPortal(
          <DataEntryModal
            isOpen={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            exerciseName={entry.exerciseName}
            exerciseType={entry.exerciseType}
            targetReps={pillData.targetReps}
            lastSavedReps={entry.loggedReps[setIndex] ?? null}
            setIndex={setIndex}
            handleRepetitionSave={handleSave}
            isUnilateral={
              entry.loggedRepsRight !== undefined &&
              entry.loggedRepsLeft !== undefined
            }
          />,
          document.body,
        )
      : null;

  return (
    <>
      <SetPillsGrid
        pills={[pillData]}
        onPillTap={isTurnActive ? handleTap : () => {}}
        pulseSetIndex={pulseActive ? setIndex : null}
        onPulseComplete={onPulseEnd}
      />
      {modalNode}
    </>
  );
}
