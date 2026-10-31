/**
 * Handstand Triad gate for the shared exercise pool (ContextualEngine hard
 * filters). Pure.
 *
 * Applies only when the flag is on, a handstand/HSPU domain is active in the
 * session and the exercise has triad scores. Then the triad rule replaces the
 * single-level tolerance window for that exercise:
 *   - upper bound: per-axis eligibility (checkTriadEligibility, no block axis);
 *   - lower bound: the primary-axis demand stays within `levelTolerance` below
 *     the user's level on that axis (same "not too easy" window as before),
 *     except warmup/cooldown rows, which are fixed blocks.
 * Returns null when the gate doesn't apply, so the caller keeps its legacy path.
 */
import type { Exercise } from '@/features/content/exercises/core/exercise.types';
import { checkTriadEligibility } from './triad-eligibility';
import { resolveTriadLevels } from './triad-levels';
import { getTriadScores, primaryAxis } from './triad-scores';

const TRIAD_DOMAINS = new Set(['handstand', 'hspu']);

export interface TriadPoolGateInput {
  enabled: boolean;
  exercise: Exercise;
  activeDomains: string[] | undefined;
  userProgramLevels: Map<string, number> | undefined;
  baseUserLevel: number | undefined;
  levelTolerance: number;
  fallPracticeDone?: boolean;
}

/** true = keep, false = drop, null = gate not applicable (use the legacy filter). */
export function triadPoolGate(input: TriadPoolGateInput): boolean | null {
  if (!input.enabled) return null;
  if (!(input.activeDomains ?? []).some((d) => TRIAD_DOMAINS.has(d))) return null;
  const demand = getTriadScores(input.exercise);
  if (!demand) return null;

  const levels = resolveTriadLevels(input.userProgramLevels, input.baseUserLevel ?? 1);
  if (!checkTriadEligibility(demand, levels, { fallPracticeDone: input.fallPracticeDone }).eligible) return false;

  const role = input.exercise.exerciseRole;
  if (role === 'warmup' || role === 'cooldown') return true;
  const axis = primaryAxis(demand);
  return demand[axis] >= levels[axis] - input.levelTolerance;
}
