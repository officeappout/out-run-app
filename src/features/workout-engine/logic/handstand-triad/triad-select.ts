/**
 * Fill a Handstand Triad plan with exercises. Pure.
 *
 * - warmup / cooldown: exercises whose `exerciseRole` is 'warmup' / 'cooldown'
 *   (fixed blocks, not leveled by axis).
 * - axis blocks: scored main exercises whose primary axis (highest demand) is
 *   the block's axis, so a stretch never lands in a strength block.
 *   The line block takes the strength-primary core work (primaryMuscle
 *   core / abs / obliques: hollow body, plank); the strength block takes the
 *   rest of the strength-primary work (shoulders: pike, wall walks, presses).
 * - Each block picks the hardest eligible exercise first on its axis (closest
 *   to the user's level), no exercise twice in a session.
 */
import type { Exercise } from '@/features/content/exercises/core/exercise.types';
import { checkTriadEligibility, type TriadEligibilityOptions } from './triad-eligibility';
import { getTriadScores, primaryAxis } from './triad-scores';
import type { TriadBlock, TriadValues } from './triad.types';

const LINE_MUSCLES = new Set(['core', 'abs', 'obliques']);

export interface FilledTriadBlock extends TriadBlock {
  exercises: Exercise[];
}

type Scored = { exercise: Exercise; scores: TriadValues };

function fitsBlock(block: TriadBlock, s: Scored): boolean {
  const role = s.exercise.exerciseRole;
  if (block.kind === 'warmup' || block.kind === 'cooldown') return role === block.kind;
  if (role === 'warmup' || role === 'cooldown') return false;
  if (primaryAxis(s.scores) !== block.axis) return false;
  const isLineWork = LINE_MUSCLES.has(s.exercise.primaryMuscle ?? '');
  if (block.kind === 'line') return isLineWork;
  if (block.kind === 'strength') return !isLineWork;
  return true;
}

export function fillTriadPlan(
  plan: TriadBlock[],
  candidates: Exercise[],
  levels: TriadValues,
  opts: Pick<TriadEligibilityOptions, 'fallPracticeDone'> = {},
): FilledTriadBlock[] {
  const scored: Scored[] = [];
  for (const exercise of candidates) {
    const scores = getTriadScores(exercise);
    if (scores) scored.push({ exercise, scores });
  }
  const used = new Set<string>();
  return plan.map((block) => {
    const pool = scored
      .filter((s) => !used.has(s.exercise.id) && fitsBlock(block, s))
      .filter((s) => checkTriadEligibility(s.scores, levels, { ...opts, blockAxis: block.axis }).eligible)
      .sort((a, b) => (block.axis ? b.scores[block.axis] - a.scores[block.axis] : 0));
    const picked = pool.slice(0, block.slots).map((s) => s.exercise);
    picked.forEach((e) => used.add(e.id));
    return { ...block, exercises: picked };
  });
}
