/**
 * Weekly run volume split (owner 27.10.2026): the user's running days are never capped. When the
 * week has more run days than the level's streak (or added running days), the planned WEEKLY
 * minutes stay the same and are split across the runs: quality runs keep their minutes, the
 * extra runs are short and easy, and what they do not use goes to the long run (else the other
 * easy runs). With no easy minutes to split, the long run gives up to a quarter. Pure.
 */
import { EXTRA_EASY_MINUTES, isQualitySlot, LONG_RUN_MIN_SHARE, RUN_SLOT_MINUTES } from './config';
import type { RunSlot } from './types';

export interface RunPiece {
  slot: RunSlot;
  /** Planned minutes (undefined = the slot default). */
  minutes?: number;
  /** Over the streak, or an added running day: short and easy. */
  extra: boolean;
}

const plannedOf = (p: RunPiece): number => p.minutes ?? RUN_SLOT_MINUTES[p.slot];

/** Weekly minutes of the plan: every run the plan holds at its planned length (added days count 0). */
export function plannedWeeklyRunMinutes(pieces: readonly RunPiece[]): number {
  return pieces.filter((p) => !p.extra).reduce((s, p) => s + plannedOf(p), 0);
}

/** Minutes per run (same order as `pieces`). No extras = the planned minutes unchanged. */
export function splitRunVolume(pieces: readonly RunPiece[], weeklyMinutes: number): number[] {
  const out = pieces.map(plannedOf);
  const extras = pieces.map((p, i) => (p.extra ? i : -1)).filter((i) => i >= 0);
  if (!extras.length) return out;
  const longIdx = pieces.findIndex((p) => p.slot === 'long_run' && !p.extra);
  const regular = pieces.map((p, i) => (!p.extra && !isQualitySlot(p.slot) && p.slot !== 'long_run' ? i : -1)).filter((i) => i >= 0);
  const fixed = pieces.reduce((s, p, i) => s + (isQualitySlot(p.slot) && !p.extra ? out[i] : 0), 0);
  const longMin = longIdx >= 0 ? out[longIdx] : 0;
  // Minutes for the easy runs (regular + extras) when the long run keeps its planned length.
  let easyBudget = Math.max(0, weeklyMinutes - fixed - longMin);
  let longNow = longMin;
  const extraNeed = extras.length * EXTRA_EASY_MINUTES;
  if (easyBudget < extraNeed && longIdx >= 0) {
    const give = Math.min(extraNeed - easyBudget, longMin - Math.ceil(longMin * LONG_RUN_MIN_SHARE));
    longNow -= give;
    easyBudget += give;
  }
  const extraEach = Math.min(EXTRA_EASY_MINUTES, Math.floor(easyBudget / extras.length));
  for (const i of extras) out[i] = extraEach;
  let left = easyBudget - extraEach * extras.length;
  if (regular.length) {
    const each = Math.floor(left / regular.length);
    regular.forEach((i, k) => (out[i] = each + (k < left - each * regular.length ? 1 : 0)));
    left = 0;
  }
  if (longIdx >= 0) out[longIdx] = longNow + left;
  else if (left > 0) extras.forEach((i, k) => (out[i] += Math.floor(left / extras.length) + (k < left % extras.length ? 1 : 0)));
  return out;
}
