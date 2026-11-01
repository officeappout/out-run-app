import type { Program } from '@/features/content/programs/core/program.types';
import { resolveIconKey, resolveProgramLabel } from '@/features/content/programs';
import { getTrackLevel, resolveProgramByIdOrSlug } from '../../shared.utils';

type Tracks = Record<string, { currentLevel?: number; percent?: number }> | undefined;

export interface ProgramCardInfo {
  key: string;
  name: string;
  iconKey: string;
  level: number;
  maxLevel: number;
  percent: number;
  resolved: boolean;
}

/** Shown instead of an id/slug the catalog can't name (owner 01.11: never a raw id). */
export const UNKNOWN_PROGRAM_LABEL = 'תוכנית לא מזוהה';
const DEFAULT_MAX_LEVEL = 25;

/** The track's percent under any key form the level lookup accepts (id, slug, movementPattern). */
function trackPercent(key: string, tracks: Tracks, prog: Program | undefined): number {
  const keys = [key, prog?.id, prog?.slug, prog?.movementPattern].filter((k): k is string => !!k);
  for (const k of keys) {
    const p = tracks?.[k]?.percent;
    if (typeof p === 'number') return Math.max(0, Math.min(100, p));
  }
  return 0;
}

/** Everything the app's ProgramProgressCard needs for one program of this user. */
export function programCardInfo(key: string, tracks: Tracks, programs: Program[], level?: number): ProgramCardInfo {
  const prog = resolveProgramByIdOrSlug(key, programs);
  const slug = prog?.slug ?? prog?.movementPattern ?? key;
  const label = prog?.name || resolveProgramLabel(slug);
  const resolved = !!label && label !== slug && label !== key;
  const lvl = level ?? getTrackLevel(key, tracks, programs);
  return {
    key,
    name: resolved ? label : UNKNOWN_PROGRAM_LABEL,
    iconKey: resolveIconKey(prog?.iconKey, slug),
    level: lvl,
    maxLevel: Math.max(prog?.maxLevels ?? DEFAULT_MAX_LEVEL, lvl, 1),
    percent: trackPercent(key, tracks, prog),
    resolved,
  };
}
