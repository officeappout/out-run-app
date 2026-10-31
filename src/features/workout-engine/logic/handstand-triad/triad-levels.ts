/**
 * Resolve a user's Handstand Triad levels. Pure.
 *
 * The three axis levels are hidden sub-levels on the handstand track
 * (owner, 31.10: no child programs), copied into userProgramLevels under the
 * internal keys below by addTriadTrackLevels (triad-track.ts). A missing axis
 * falls back to the user's handstand (or HSPU) level, then to the base level,
 * so behaviour degrades to "one level for all three" instead of breaking.
 */
import { TRIAD_MAX, TRIAD_MIN, type TriadAxis, type TriadValues } from './triad.types';

/** Internal userProgramLevels keys for the hidden axis levels (not programs). */
export const TRIAD_CHILD_KEYS: Record<TriadAxis, string> = {
  strength: 'handstand_strength',
  balance: 'handstand_balance',
  mobility: 'handstand_mobility',
};

const clamp = (n: number) => Math.min(TRIAD_MAX, Math.max(TRIAD_MIN, Math.round(n)));

/**
 * `parentKey` = the program the session resolved the exercise to ('handstand'
 * or 'hspu'), so an HSPU session falls back to the HSPU level, not the base.
 */
export function resolveTriadLevels(
  userProgramLevels: Map<string, number> | undefined,
  baseUserLevel = 1,
  parentKey: string = 'handstand',
): TriadValues {
  const parent = userProgramLevels?.get(parentKey) ?? baseUserLevel;
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
