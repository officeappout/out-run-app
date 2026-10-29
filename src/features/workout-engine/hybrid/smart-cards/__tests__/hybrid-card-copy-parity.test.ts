/** i18n extraction batch 3: hybrid card copy. File snapshots recorded from unmodified origin/main (commit 1). */
import { describe, expect, it } from 'vitest';
import {
  formatCount, fullParkLightReason, fullParkReason, goalReachedReason, parkWalkMin, routeStopsReason, routeStopsSubtitle,
  walkStrengthReason, walkStrengthSubtitle, walkStrengthTitle,
} from '../hybrid-card-copy';
import type { SmartSessionSizing } from '../situation.types';

const snap = (name: string) => `./__snapshots__/hybrid-card-copy/${name}.json`;
const G = [undefined, 'male', 'female', 'other'] as unknown as Array<'male' | 'female' | undefined>; // 'other' reads like male in the Hebrew pick()

describe('hybrid card copy (Hebrew)', () => {
  it('walk + strength card', async () => {
    const out: unknown[] = [];
    for (const kind of ['running', 'walking', 'cycling'] as unknown as Array<'running' | 'walking'>) out.push(['title', kind, walkStrengthTitle(kind)]);
    const sizings: SmartSessionSizing[] = [];
    for (const stepsSource of ['steps', 'goal_met', 'unknown'] as const)
      for (const setsSource of ['budget', 'unknown', 'spent', 'light'] as const)
        for (const walkKm of [0.04, 2, 3.26, 12]) {
          sizings.push({ walkKm, walkMin: 20, strengthSets: 6, strengthMin: 12, timeBudgetMin: 40, aerobicShare: 0.5, stepsSource, setsSource, ...(setsSource === 'light' ? { lightReasonKey: 'budget_light.weekly_spent' as const } : {}) });
        }
    sizings.push({ walkKm: 2, walkMin: 20, strengthSets: 6, strengthMin: 12, timeBudgetMin: 40, aerobicShare: 0.5, stepsSource: 'steps', setsSource: 'light', lightReasonKey: 'budget_light.daily_spent' });
    for (const s of sizings) for (const park of [undefined, { id: 'p', name: 'גינת הפארק', distanceM: 300 }, { id: 'p', distanceM: 300 }])
      out.push(['subtitle', s.walkKm, park?.name ?? null, walkStrengthSubtitle(s, park)]);
    for (const s of sizings) for (const steps of [null, 0, 950, 4200, 123456]) for (const g of G)
      out.push(['reason', s, steps, g, walkStrengthReason(s, steps, g)]);
    for (const g of G) out.push(['goal', g, goalReachedReason(g)]);
    await expect(JSON.stringify(out, null, 2) + '\n').toMatchFileSnapshot(snap('walk-strength'));
    expect(formatCount(1234567)).toBe('1,234,567');
    expect(parkWalkMin(0)).toBe(1);
  });

  it('full park + route stops', async () => {
    const out: unknown[] = [];
    for (const d of [0, 180, 600, 2500]) for (const why of ['scheduled', 'budget', 'unknown'] as const) for (const sets of [null, 0, 9]) for (const g of G)
      out.push(['fullPark', d, why, sets, g, fullParkReason(why, { id: 'p', distanceM: d }, sets, g)]);
    for (const key of ['budget_light.weekly_spent', 'budget_light.daily_spent'] as const) for (const g of G) out.push(['light', key, g, fullParkLightReason(key, g)]);
    for (const name of [undefined, '', '  ', 'מסלול הים']) for (const stopCount of [0, 1, 5]) for (const strengthStopCount of [0, 2]) for (const focused of [false, true]) {
      const route = { routeId: 'r', name, distanceFromUserM: 100, focused, stopCount, strengthStopCount, sessionTypes: ['walk_with_stops'] } as never;
      out.push(['routeSub', name ?? null, stopCount, routeStopsSubtitle(route)]);
      for (const g of G) out.push(['routeReason', name ?? null, stopCount, strengthStopCount, focused, g, routeStopsReason(route, g)]);
    }
    await expect(JSON.stringify(out, null, 2) + '\n').toMatchFileSnapshot(snap('full-park-route'));
  });
});
