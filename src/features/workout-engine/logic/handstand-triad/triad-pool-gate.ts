/**
 * Handstand Triad gate for the shared exercise pool (ContextualEngine hard
 * filters). Pure.
 *
 * Applies only when the flag is on, the engine resolved the exercise to the
 * handstand / HSPU domain for this session (a pike push-up resolved to push in a
 * push+handstand session keeps its push level), and the exercise has triad
 * scores. Then the triad rule replaces the single-level tolerance window:
 *   - upper bound: per-axis eligibility (checkTriadEligibility, no block axis);
 *   - lower bound: the primary-axis demand stays within `levelTolerance` below
 *     the user's level on that axis (same "not too easy" window as before),
 *     except warmup/cooldown rows, which are fixed blocks.
 * Returns null when the gate doesn't apply, so the caller keeps its legacy path.
 */
import type { Exercise } from '@/features/content/exercises/core/exercise.types';
import { resolveToSlug } from '../../services/program-hierarchy.utils';
import { checkTriadEligibility } from './triad-eligibility';
import { resolveTriadLevels } from './triad-levels';
import { getTriadScores, trainedAxis, TRIAD_PROGRAM_SLUGS } from './triad-scores';

const TRIAD_DOMAINS = new Set<string>(TRIAD_PROGRAM_SLUGS);

export interface TriadPoolGateInput {
  enabled: boolean;
  exercise: Exercise;
  /** Domain the engine resolved this exercise to (resolveConsistentComparisonLevels). */
  resolvedDomain: string | null | undefined;
  userProgramLevels: Map<string, number> | undefined;
  baseUserLevel: number | undefined;
  levelTolerance: number;
  fallPracticeDone?: boolean;
}

/** true = keep, false = drop, null = gate not applicable (use the legacy filter). */
export function triadPoolGate(input: TriadPoolGateInput): boolean | null {
  if (!input.enabled) return null;
  // resolvedDomain may be a slug or a Firestore program id.
  const domain = input.resolvedDomain ? resolveToSlug(input.resolvedDomain) : '';
  if (!TRIAD_DOMAINS.has(domain)) return null;
  const demand = getTriadScores(input.exercise);
  if (!demand) return null;

  const levels = resolveTriadLevels(input.userProgramLevels, input.baseUserLevel ?? 1, domain);
  if (!checkTriadEligibility(demand, levels, { fallPracticeDone: input.fallPracticeDone }).eligible) return false;

  const role = input.exercise.exerciseRole;
  if (role === 'warmup' || role === 'cooldown') return true;
  const axis = trainedAxis(demand);
  return demand[axis] >= levels[axis] - input.levelTolerance;
}
