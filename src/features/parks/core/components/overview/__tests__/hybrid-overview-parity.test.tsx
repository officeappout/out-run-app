/**
 * Parity pin for the unified overview drawer refactor (19.10.2026).
 *
 * HybridOverviewScreen (route + stops / full park / budget split) was split
 * into the generic overview shell (src/features/parks/core/components/overview)
 * plus a route+stops consumer. These snapshots were recorded on the code
 * BEFORE the split and must stay byte-identical after it, in both flag
 * states (enable_home_v2 off / on).
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const flagState = { v2: false };

vi.mock('@/hooks/useFeatureFlags', () => ({
  useFeatureFlags: () => ({ flags: { enableHomeV2: flagState.v2 }, loading: false }),
}));
vi.mock('@/features/user', () => {
  const state = { profile: { core: { gender: 'male', isSuperAdmin: false } } };
  const useUserStore = (sel: (s: typeof state) => unknown) => sel(state);
  (useUserStore as unknown as { getState: () => typeof state }).getState = () => state;
  return { useUserStore };
});
vi.mock('@/features/parks/core/store/useMapStore', () => {
  const noop = () => {};
  const state = {
    setOverviewSheetHeightPx: noop, setIsOverviewActive: noop,
    setHybridRouteStations: noop, setHybridWalkLegs: noop,
  };
  const useMapStore = (sel: (s: typeof state) => unknown) => sel(state);
  (useMapStore as unknown as { getState: () => typeof state }).getState = () => state;
  return { useMapStore };
});
vi.mock('@/lib/onboardingPrefs', () => ({ getOnboardingPref: () => null, setOnboardingPref: () => {} }));

import HybridOverviewScreen from '../../hybrid/HybridOverviewScreen';
import { routeStopsFixture, fullParkFixture, budgetSplitFixture } from './fixtures';

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-19T07:00:00'));
});
afterAll(() => { vi.useRealTimers(); });

const noop = () => {};
function render(composed: unknown, v2: boolean) {
  flagState.v2 = v2;
  return renderToStaticMarkup(
    <HybridOverviewScreen composed={composed as never} cityName="תל אביב" onStart={noop} onBack={noop} onAssessmentLink={noop} />,
  );
}

describe('HybridOverviewScreen parity (pre-refactor snapshots)', () => {
  for (const v2 of [false, true]) {
    const tag = v2 ? 'v2' : 'legacy';
    it(`route + stops with a named station and round trip — ${tag}`, () => {
      expect(render(routeStopsFixture(), v2)).toMatchSnapshot();
    });
    it(`full park with the bolts trio — ${tag}`, () => {
      expect(render(fullParkFixture(), v2)).toMatchSnapshot();
    });
    it(`budget split, unnamed station, fallback hint — ${tag}`, () => {
      expect(render(budgetSplitFixture(), v2)).toMatchSnapshot();
    });
  }
});
