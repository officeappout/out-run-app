/**
 * Read an exercise's Handstand Triad demand scores. Pure.
 *
 * Scores live on the handstand / HSPU `targetPrograms` rows (slug or
 * Firestore hash id). Rows of other programs are ignored, even if they kept
 * stale scores after a program change in the editor. A row counts only when
 * all three scores are present: a half-rated row would otherwise read the
 * missing axes as 1 (easy) while the editor displays 8.
 * An exercise assigned to both programs may carry two sets of scores; the
 * higher demand per axis wins (the safe side). No complete row → "unscored"
 * (null) → the legacy level-tolerance path.
 */
import type { Exercise } from '@/features/content/exercises/core/exercise.types';
import { resolveSlugToId, resolveToSlug } from '../../services/program-hierarchy.utils';
import { TRIAD_MAX, TRIAD_MIN, type TriadAxis, type TriadValues } from './triad.types';

export const TRIAD_PROGRAM_SLUGS = ['handstand', 'hspu'] as const;

export function isTriadProgramId(programId: string): boolean {
  return TRIAD_PROGRAM_SLUGS.some(
    (slug) => programId === slug || resolveToSlug(programId) === slug || resolveSlugToId(slug) === programId,
  );
}

const isScore = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

const clamp = (n: number) => Math.min(TRIAD_MAX, Math.max(TRIAD_MIN, Math.round(n)));

export function getTriadScores(exercise: Pick<Exercise, 'targetPrograms'>): TriadValues | null {
  let out: TriadValues | null = null;
  for (const tp of exercise.targetPrograms ?? []) {
    if (!isTriadProgramId(tp.programId)) continue;
    if (!isScore(tp.strengthScore) || !isScore(tp.balanceScore) || !isScore(tp.mobilityScore)) continue;
    const row: TriadValues = { strength: clamp(tp.strengthScore), balance: clamp(tp.balanceScore), mobility: clamp(tp.mobilityScore) };
    out = out
      ? { strength: Math.max(out.strength, row.strength), balance: Math.max(out.balance, row.balance), mobility: Math.max(out.mobility, row.mobility) }
      : row;
  }
  return out;
}

/** The axis the exercise demands most. Ties: balance > strength > mobility (skill first). */
export function primaryAxis(scores: TriadValues): TriadAxis {
  const order: TriadAxis[] = ['balance', 'strength', 'mobility'];
  return order.reduce((best, axis) => (scores[axis] > scores[best] ? axis : best), order[0]);
}

/** Peak skills (free handstand, presses): opened by every axis strictly, no tolerance. */
export const PEAK_BALANCE_THRESHOLD = 13;
export const isPeakExercise = (scores: TriadValues) => scores.balance >= PEAK_BALANCE_THRESHOLD;
