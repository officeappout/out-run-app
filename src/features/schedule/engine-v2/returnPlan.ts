/**
 * Coming back after days away (§4.5 rows 2+ / illness / 7–27 / 28+). Reuses the calm-return
 * tiers and load table (src/lib/calm-return/policy.ts) so the engine and calm return read
 * the same gap as the same mode. Pure.
 */
import { CALM_LOADS, NO_CHANGE_LOAD, tierForDaysAway, type CalmLoad, type ReturnTier } from '@/lib/calm-return/policy';
import { renderV2ReasonsHe, type V2Reason } from './reasonsV2';
import type { PlacedSession } from './types';

export interface ReturnInput {
  daysAway: number;
  reason?: 'illness' | 'travel' | 'unknown';
  todayDow: number;
  hasRunning: boolean;
  hasStrength: boolean;
  /** Key (quality / long) runs missed in the gap. Defaults to "the gap covered them" for ≥4 days. */
  keyRunsMissed?: number;
}

export interface ReturnPlan {
  tier: ReturnTier;
  load: CalmLoad;
  /** What to do today (empty = follow the week). */
  today: PlacedSession[];
  /** Makeups are off for any return of 4+ days. */
  makeupsAllowed: boolean;
  nextWeek: {
    /** Repeat the same running plan week (2+ key runs missed). */
    repeatRunningWeek: boolean;
    /** Resume the reached running week from today (7+ days). */
    resumeReachedRunningWeek: boolean;
    /** The first N quality runs back become easy. */
    qualityToEasyCount: number;
    /** Illness pauses the running clock instead of skipping weeks. */
    pauseRunningClock: boolean;
  };
  reasons: V2Reason[];
  reasonsHe: string[];
}

export const RETURN_EASY_RUN_MINUTES = 25;
export const RETURN_QUALITY_TO_EASY = 2;

export function planReturn(input: ReturnInput): ReturnPlan {
  const tier = tierForDaysAway(input.daysAway);
  const reasons: V2Reason[] = [];
  const load: CalmLoad =
    tier === 'welcome_back' ? CALM_LOADS.welcome_back : tier === 'fresh_start' ? CALM_LOADS.fresh_start_w1 : tier === 're_entry' ? CALM_LOADS.re_entry_w1 : NO_CHANGE_LOAD;
  const away = tier !== 'on_track';
  const keyMissed = input.keyRunsMissed ?? (away ? 2 : 0);
  const illness = input.reason === 'illness';
  const repeatRunningWeek = input.hasRunning && tier === 'welcome_back' && (keyMissed >= 2 || illness);

  const today: PlacedSession[] = [];
  if (away) {
    if (input.hasRunning) today.push({ kind: 'run', slot: 'easy_run', minutes: RETURN_EASY_RUN_MINUTES });
    else if (input.hasStrength) today.push({ kind: 'strength', slug: 'full_body', volumePct: Math.round((1 - load.strengthVolumeReduction) * 100) });
  }
  if (tier === 'welcome_back') reasons.push({ code: 'WELCOME_BACK' });
  if (tier === 'fresh_start') reasons.push({ code: 'FRESH_START' });
  if (tier === 're_entry') reasons.push({ code: 'FRESH_START' }, { code: 'RE_ENTRY' });
  if (repeatRunningWeek) reasons.push({ code: 'RUN_WEEK_REPEATED' });

  return {
    tier,
    load,
    today,
    makeupsAllowed: !away,
    nextWeek: {
      repeatRunningWeek,
      resumeReachedRunningWeek: input.hasRunning && (tier === 'fresh_start' || tier === 're_entry'),
      qualityToEasyCount: away && input.hasRunning ? RETURN_QUALITY_TO_EASY : 0,
      pauseRunningClock: illness && input.hasRunning,
    },
    reasons,
    reasonsHe: renderV2ReasonsHe(reasons),
  };
}
