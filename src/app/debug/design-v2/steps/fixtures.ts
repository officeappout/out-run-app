/**
 * Deterministic fixture data for the design-v2 Steps preview (dev only).
 * Days are generated relative to "today" so the page's today/yesterday logic
 * reads naturally; values come from a seeded PRNG so screenshots are stable
 * day to day in shape.
 */

import type { DailyStepsSnapshot } from '@/features/activity/services/activity-history.service';
import { toDateKey } from '@/features/activity/lib/steps-analytics.logic';

const GOAL = 8000;

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** ~200 days of history, oldest → newest, with a few missing days (no doc). */
export function makeStepsFixtures(): DailyStepsSnapshot[] {
  const rand = mulberry32(42);
  const out: DailyStepsSnapshot[] = [];
  const today = new Date();
  for (let back = 200; back >= 0; back--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - back);
    // Gaps: a handful of days with no dailyActivity doc at all (never today / 7 days ago).
    if (back !== 0 && back !== 7 && back % 23 === 11) continue;
    let steps: number;
    if (back === 0) steps = 6420; // today, in progress
    else if (back === 7) steps = 5310; // same weekday last week → +21%
    else {
      const weekend = d.getDay() === 5 || d.getDay() === 6;
      steps = Math.round(3500 + rand() * 7500 + (weekend ? 1200 : 0));
    }
    out.push({
      date: toDateKey(d),
      steps,
      floors: Math.round(rand() * 8),
      stepsGoalMet: steps >= GOAL,
      floorsGoalMet: false,
      stepsGoal: GOAL,
      floorsGoal: 3,
      distanceMeters: Math.round(steps * 0.74),
    });
  }
  return out;
}
