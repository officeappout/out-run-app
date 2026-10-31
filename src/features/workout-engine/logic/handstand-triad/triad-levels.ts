/**
 * Resolve a user's Handstand Triad levels. Pure.
 *
 * Target data model: a parent program "handstand" (displayed level = average
 * of its children, via the existing `averageMasterChildren`) with three child
 * programs. Until those child programs exist, every axis falls back to the
 * user's handstand level, then to the base level, so behaviour degrades to
 * "one level for all three" instead of breaking.
 */
import { TRIAD_MAX, TRIAD_MIN, type TriadAxis, type TriadValues } from './triad.types';

/** Child-program keys in `userProgramLevels`. */
export const TRIAD_CHILD_KEYS: Record<TriadAxis, string> = {
  strength: 'handstand_strength',
  balance: 'handstand_balance',
  mobility: 'handstand_mobility',
};

const PARENT_KEY = 'handstand';

const clamp = (n: number) => Math.min(TRIAD_MAX, Math.max(TRIAD_MIN, Math.round(n)));

export function resolveTriadLevels(
  userProgramLevels: Map<string, number> | undefined,
  baseUserLevel = 1,
): TriadValues {
  const parent = userProgramLevels?.get(PARENT_KEY) ?? baseUserLevel;
  const read = (axis: TriadAxis) => clamp(userProgramLevels?.get(TRIAD_CHILD_KEYS[axis]) ?? parent);
  return { strength: read('strength'), balance: read('balance'), mobility: read('mobility') };
}

/**
 * Weakest / strongest axis, or null for both when all three are equal (no emphasis).
 * Ties for weakest: mobility first (it caps the line and the peak skills), then balance.
 * Ties for strongest: strength first.
 */
export function rankAxes(levels: TriadValues): { weakest: TriadAxis | null; strongest: TriadAxis | null } {
  const lowFirst: TriadAxis[] = ['mobility', 'balance', 'strength'];
  const highFirst: TriadAxis[] = ['strength', 'balance', 'mobility'];
  const weakest = lowFirst.reduce((w, a) => (levels[a] < levels[w] ? a : w), lowFirst[0]);
  const strongest = highFirst.reduce((s, a) => (levels[a] > levels[s] ? a : s), highFirst[0]);
  if (levels[weakest] === levels[strongest]) return { weakest: null, strongest: null };
  return { weakest, strongest };
}
