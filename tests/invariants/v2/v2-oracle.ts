/**
 * v2-oracle.ts — the owner's approved strength rules (20.10.2026, agent-briefs/
 * strength-matrix-proposal.md + recommendation-policy.md), re-written here as an
 * INDEPENDENT oracle for the v2 matrix. Pure. Deliberately does not import the policy
 * or day-focus code: the matrix compares what the engine does with what the owner
 * approved, so a policy-table edit that changes a user's split shows up as a diff.
 *
 *   level band   = avg(push, pull, legs): 1–5 beginner · 6–13 intermediate · 14+ advanced
 *   sessions     = beginner 3 · intermediate 3, 4+ days → 4, chose 6 days + muscle /
 *                  performance goal → 6 · advanced 4, chose 6 days → 6
 *   health_cap   = health goal without muscle / performance / skills (not advanced) → ≤ 3
 *   days         = never more sessions than strength days in the week
 *   split        = ≤ 3 → full body · 4 → upper / lower · 6 → push / pull / legs
 *   day focus    = the split's rotation by the day's position in the strength week
 *                  (Sunday first); a focus the active programs' pool has nothing of → none
 */

export type Band = 'beginner' | 'intermediate' | 'advanced';
export type Focus = 'upper' | 'lower' | 'push' | 'pull' | 'legs' | 'full';
export type OracleSplit = 'full' | 'upper_lower' | 'ppl';
/** Normalized goals (the oracle's own small vocabulary). */
export type OracleGoal = 'health' | 'muscle' | 'performance' | 'skills' | 'fat_loss';

export const FOCUS_DOMAINS: Readonly<Record<Focus, readonly string[]>> = {
  upper: ['push', 'pull'],
  lower: ['legs', 'core'],
  push: ['push'],
  pull: ['pull'],
  legs: ['legs', 'core'],
  full: ['push', 'pull', 'legs', 'core'],
};

/** The words the overview line must use (owner copy, 20.10.2026). */
export const FOCUS_HE: Readonly<Record<Focus, string>> = {
  upper: 'עליון', lower: 'תחתון', push: 'דחיפה', pull: 'משיכה', legs: 'רגליים', full: 'כל הגוף',
};
export const SPLIT_HE: Readonly<Record<OracleSplit, string>> = {
  full: 'כל הגוף', upper_lower: 'עליון / תחתון', ppl: 'דחיפה / משיכה / רגליים',
};

const ROTATION: Readonly<Record<OracleSplit, Focus[]>> = {
  full: ['full'], upper_lower: ['upper', 'lower'], ppl: ['push', 'pull', 'legs'],
};

export function bandOf(level: number): Band {
  return level <= 5 ? 'beginner' : level <= 13 ? 'intermediate' : 'advanced';
}

export function oracleSessions(level: number, days: number, goals: readonly OracleGoal[]): number {
  const band = bandOf(level);
  const has = (g: OracleGoal) => goals.includes(g);
  let n = band === 'advanced' ? 4 : 3;
  if (band === 'intermediate' && days >= 4) n = 4;
  if (band === 'intermediate' && days >= 6 && (has('muscle') || has('performance'))) n = 6;
  if (band === 'advanced' && days >= 6) n = 6;
  if (band !== 'advanced' && has('health') && !has('muscle') && !has('performance') && !has('skills')) n = Math.min(n, 3);
  return Math.max(1, Math.min(n, days));
}

export function oracleSplit(level: number, days: number, goals: readonly OracleGoal[]): OracleSplit {
  const n = oracleSessions(level, days, goals);
  return n >= 6 ? 'ppl' : n >= 4 ? 'upper_lower' : 'full';
}

/** The focus the day SHOULD get; null = the pool has nothing of it (generator keeps today's content). */
export function oracleFocus(split: OracleSplit, dayIndex: number, poolDomains: readonly string[]): Focus | null {
  const f = ROTATION[split][dayIndex % ROTATION[split].length];
  if (f === 'full') return 'full';
  return FOCUS_DOMAINS[f].some((d) => poolDomains.includes(d)) ? f : null;
}
