/**
 * Read an exercise's Handstand Triad demand scores. Pure.
 *
 * Scores live on the handstand / HSPU `targetPrograms` rows. An exercise
 * assigned to both programs may carry two sets of scores; the higher demand
 * per axis wins (the safe side). An exercise with no score on any row is
 * "unscored" (null) and keeps the legacy level-tolerance path.
 *
 * Note: the admin editor shows a default of 8 for a missing score, but only
 * writes it on edit, so a missing field really means "not rated yet".
 */
import type { Exercise } from '@/features/content/exercises/core/exercise.types';
import { TRIAD_MAX, TRIAD_MIN, type TriadAxis, type TriadValues } from './triad.types';

const clamp = (n: number) => Math.min(TRIAD_MAX, Math.max(TRIAD_MIN, Math.round(n)));

export function getTriadScores(exercise: Pick<Exercise, 'targetPrograms'>): TriadValues | null {
  let found = false;
  const out: TriadValues = { strength: TRIAD_MIN, balance: TRIAD_MIN, mobility: TRIAD_MIN };
  for (const tp of exercise.targetPrograms ?? []) {
    const row: Partial<Record<TriadAxis, number | undefined>> = {
      strength: tp.strengthScore,
      balance: tp.balanceScore,
      mobility: tp.mobilityScore,
    };
    for (const axis of Object.keys(row) as TriadAxis[]) {
      const v = row[axis];
      if (typeof v === 'number' && Number.isFinite(v)) {
        found = true;
        out[axis] = Math.max(out[axis], clamp(v));
      }
    }
  }
  return found ? out : null;
}

/** The axis the exercise demands most. Ties: balance > strength > mobility (skill first). */
export function primaryAxis(scores: TriadValues): TriadAxis {
  const order: TriadAxis[] = ['balance', 'strength', 'mobility'];
  return order.reduce((best, axis) => (scores[axis] > scores[best] ? axis : best), order[0]);
}

/** Peak skills (free handstand, presses): opened by every axis strictly, no tolerance. */
export const PEAK_BALANCE_THRESHOLD = 13;
export const isPeakExercise = (scores: TriadValues) => scores.balance >= PEAK_BALANCE_THRESHOLD;
