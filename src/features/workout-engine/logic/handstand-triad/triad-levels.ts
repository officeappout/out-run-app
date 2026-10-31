/**
 * Resolve a user's Handstand Triad levels. Pure.
 *
 * The three axis levels are hidden sub-levels on the handstand track
 * (owner, 31.10: no child programs), attached to the userProgramLevels map by
 * addTriadTrackLevels (triad-track.ts), never as keys of it. A missing axis
 * falls back to the user's handstand (or HSPU) level, then to the base level,
 * so behaviour degrades to "one level for all three" instead of breaking.
 */
import { getAttachedTriadLevels } from './triad-track';
import { TRIAD_MAX, TRIAD_MIN, type TriadAxis, type TriadValues } from './triad.types';

const clamp = (n: number) => Math.min(TRIAD_MAX, Math.max(TRIAD_MIN, Math.round(n)));

/**
 * Entry floor (owner, 31.10): the catalog's easiest handstand work sits at 3-5
 * on each axis (pike stance, frog, hollow body, the first assessment anchors),
 * so an axis below 4 selects as 4. The stored level is untouched.
 */
export const TRIAD_ENTRY_FLOOR = 4;

/**
 * `parentKey` = the program the session resolved the exercise to ('handstand'
 * or 'hspu'), so an HSPU session falls back to the HSPU level, not the base.
 */
export function resolveTriadLevels(
  userProgramLevels: Map<string, number> | undefined,
  baseUserLevel = 1,
  parentKey: string = 'handstand',
  /** false = the real levels (to rank the weakest axis); true = with the entry floor (to select). */
  floor = true,
): TriadValues {
  const parent = userProgramLevels?.get(parentKey) ?? baseUserLevel;
  const hidden = getAttachedTriadLevels(userProgramLevels);
  const read = (axis: TriadAxis) => Math.max(floor ? TRIAD_ENTRY_FLOOR : TRIAD_MIN, clamp(hidden?.[axis] ?? parent));
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
