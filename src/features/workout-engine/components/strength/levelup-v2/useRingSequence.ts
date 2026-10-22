'use client';

/**
 * Drives the level-up choreography from the pure step plan (buildRingSteps):
 * one step every STEP_GAP_MS — the step's chip pops in and the ring tweens to
 * the step's value. A level-up step flips to the new level (onLevelUp fires
 * once) and the ring restarts from 0. Reduced motion: the final state at once.
 *
 * A later outcome (silent reconcile with the stored result) does not replay
 * the sequence — it jumps to that outcome's final state.
 */
import { useEffect, useRef, useState } from 'react';
import type { LevelUpOutcome } from '@/features/user/progression/services/levelup-preview';
import { buildRingSteps, visibleChips } from './levelup-view-model';

/** Gap between steps (chips staggered ~350ms; the ring tween is ≤ 600ms). */
export const STEP_GAP_MS = 350;
const FIRST_STEP_MS = 200;
/** A level-up step waits for the ring to finish filling to 100 first. */
const LEVEL_UP_EXTRA_MS = 450;

export interface RingSequenceState {
  /** Ring fill now (0..100) — the value the ring tweens to. */
  ringPercent: number;
  /** Start of the bright "this session" arc (the old fill; 0 after a level-up). */
  ringBase: number;
  revealedChipIds: string[];
  /** True once the new level is on screen. */
  showNewLevel: boolean;
  done: boolean;
}

function finalState(outcome: LevelUpOutcome): RingSequenceState {
  return {
    ringPercent: Math.min(100, Math.max(0, outcome.after.percent)),
    ringBase: outcome.leveledUp ? 0 : Math.min(outcome.before.percent, outcome.after.percent),
    revealedChipIds: visibleChips(outcome.chips).map((c) => c.id),
    showNewLevel: outcome.leveledUp,
    done: true,
  };
}

export function useRingSequence(
  outcome: LevelUpOutcome | null,
  fallbackPercent: number,
  reducedMotion: boolean,
  onLevelUp?: (newLevel: number) => void,
): RingSequenceState {
  const [state, setState] = useState<RingSequenceState>(() => ({
    ringPercent: outcome ? outcome.before.percent : fallbackPercent,
    ringBase: outcome ? outcome.before.percent : fallbackPercent,
    revealedChipIds: [],
    showNewLevel: false,
    done: !outcome,
  }));
  const playedRef = useRef(false);
  const levelUpFiredRef = useRef(false);
  const onLevelUpRef = useRef(onLevelUp);
  onLevelUpRef.current = onLevelUp;

  useEffect(() => {
    if (!outcome) {
      setState((s) => ({ ...s, ringPercent: fallbackPercent, ringBase: fallbackPercent, done: true }));
      return;
    }
    const fireLevelUp = () => {
      if (levelUpFiredRef.current) return;
      levelUpFiredRef.current = true;
      onLevelUpRef.current?.(outcome.after.level);
    };
    // Second outcome (reconcile) or reduced motion → straight to the end.
    if (playedRef.current || reducedMotion) {
      playedRef.current = true;
      setState(finalState(outcome));
      if (outcome.leveledUp) fireLevelUp();
      return;
    }
    playedRef.current = true;
    // Start from the pre-session point (the outcome may land after a calm first frame).
    setState({
      ringPercent: outcome.before.percent,
      ringBase: outcome.before.percent,
      revealedChipIds: [],
      showNewLevel: false,
      done: false,
    });

    const steps = buildRingSteps(outcome);
    const timers: ReturnType<typeof setTimeout>[] = [];
    let at = FIRST_STEP_MS;
    steps.forEach((step, i) => {
      if (step.levelUp) at += LEVEL_UP_EXTRA_MS;
      timers.push(
        setTimeout(() => {
          setState((s) => ({
            ringPercent: step.toPercent,
            ringBase: step.levelUp ? 0 : s.ringBase,
            revealedChipIds: step.chipId ? [...s.revealedChipIds, step.chipId] : s.revealedChipIds,
            showNewLevel: s.showNewLevel || !!step.levelUp,
            done: i === steps.length - 1,
          }));
          if (step.levelUp) fireLevelUp();
        }, at),
      );
      at += STEP_GAP_MS;
    });
    if (steps.length === 0) setState(finalState(outcome));
    return () => timers.forEach(clearTimeout);
    // The sequence keys on the outcome object; fallbackPercent only matters without one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outcome, reducedMotion]);

  return state;
}
