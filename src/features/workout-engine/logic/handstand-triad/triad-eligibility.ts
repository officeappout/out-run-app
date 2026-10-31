/**
 * Handstand Triad eligibility: may this user get this exercise? Pure.
 *
 * Rule (owner-approved 31.10.2026):
 * - Allowed only when the exercise's demand is ≤ the user's level on EVERY axis.
 *   A low score never blocks: a pure stretch (1/1/8) is open to anyone with
 *   mobility ≥ 8, whatever their strength.
 * - +1 tolerance only on the axis the current block trains (a small reach).
 * - Peak skills (balance ≥ 13: free handstand, presses) get no tolerance at all,
 *   so a strong-but-stiff user (S12, M3) never gets a "banana" free handstand.
 * - Safety: balance-demand ≥ 8 (wall pulls, kick-ups to balance, free work)
 *   needs fall practice first. The caller passes `fallPracticeDone` when it
 *   knows it; when unknown (undefined) the gate is not applied.
 */
import { isPeakExercise } from './triad-scores';
import { TRIAD_AXES, type TriadAxis, type TriadValues } from './triad.types';

export const BLOCK_AXIS_TOLERANCE = 1;
export const FALL_PRACTICE_BALANCE_THRESHOLD = 8;

export interface TriadEligibilityOptions {
  /** Axis of the block being filled; gets +1 tolerance (not for peak skills). */
  blockAxis?: TriadAxis;
  /** Whether the user has done fall practice; undefined = unknown, gate off. */
  fallPracticeDone?: boolean;
}

export type TriadIneligibleReason = 'above_level' | 'needs_fall_practice';

export interface TriadEligibility {
  eligible: boolean;
  reason?: TriadIneligibleReason;
  /** First axis that blocked, for QA logs. */
  axis?: TriadAxis;
}

export function checkTriadEligibility(
  demand: TriadValues,
  levels: TriadValues,
  opts: TriadEligibilityOptions = {},
): TriadEligibility {
  const peak = isPeakExercise(demand);
  for (const axis of TRIAD_AXES) {
    const tolerance = !peak && axis === opts.blockAxis ? BLOCK_AXIS_TOLERANCE : 0;
    if (demand[axis] > levels[axis] + tolerance) return { eligible: false, reason: 'above_level', axis };
  }
  if (opts.fallPracticeDone === false && demand.balance >= FALL_PRACTICE_BALANCE_THRESHOLD) {
    return { eligible: false, reason: 'needs_fall_practice', axis: 'balance' };
  }
  return { eligible: true };
}
