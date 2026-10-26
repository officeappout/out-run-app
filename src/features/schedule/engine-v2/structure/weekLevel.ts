import { bandOf } from './config';
import type { GroupLevels, WeekBand } from './types';

/** Week level = average of push / pull / legs (floor, min 1, like strengthLevelOf). Decides only the structure. */
export function weekLevelOf(levels: GroupLevels): number {
  const vals = [levels.push, levels.pull, levels.legs].map((l) => (Number.isFinite(l) && l > 0 ? l : 1));
  return Math.max(1, Math.floor(vals.reduce((s, l) => s + l, 0) / vals.length));
}

export function weekBandOf(levels: GroupLevels): WeekBand {
  return bandOf(weekLevelOf(levels));
}
