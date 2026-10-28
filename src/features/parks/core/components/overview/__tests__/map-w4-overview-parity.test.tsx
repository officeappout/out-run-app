/**
 * i18n wave 4 (bidirectional layout), map area, part 2: Hebrew markup recorded from UNMODIFIED main for an
 * overview state the wave-4 map PR (#914) found uncovered: the hybrid screen's fallback hint that links to the
 * assessment (the route drawer's full-details link is in map-w4-drawer-parity.test.tsx). Static markup, node env, same fakes as the sibling
 * parity tests; `<!-- -->` stripped before comparing.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';

vi.mock('@/hooks/useFeatureFlags', () => ({
  useFeatureFlags: () => ({ flags: { enableHomeV2: true, enableHybridDifficultyCarousel: true }, loading: false }),
}));
vi.mock('@/features/user', () => {
  const state = { profile: { core: { gender: 'male', weight: 70, isSuperAdmin: false } } };
  const useUserStore = (sel: (s: typeof state) => unknown) => sel(state);
  (useUserStore as unknown as { getState: () => typeof state }).getState = () => state;
  return { useUserStore };
});
vi.mock('@/features/parks/core/store/useMapStore', () => {
  const noop = () => {};
  const state = {
    walkToRouteMinutes: null, setOverviewSheetHeightPx: noop, setIsOverviewActive: noop,
    setHybridRouteStations: noop, setHybridWalkLegs: noop,
  };
  const useMapStore = (sel: (s: typeof state) => unknown) => sel(state);
  (useMapStore as unknown as { getState: () => typeof state }).getState = () => state;
  return { useMapStore };
});
vi.mock('@/lib/onboardingPrefs', () => ({ getOnboardingPref: () => null, setOnboardingPref: () => {} }));
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ showToast: () => {} }) }));

import HybridOverviewScreen from '../../hybrid/HybridOverviewScreen';
import { budgetSplitFixture } from './fixtures';

beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-19T08:40:00')); });
afterAll(() => { vi.useRealTimers(); });

const html = (el: ReactElement) => renderToStaticMarkup(el).replaceAll('<!-- -->', '');
const snap = (name: string) => `./__snapshots__/map-w4-overview/${name}.html`;
const noop = () => {};

describe('overview, wave 4 coverage', () => {
  it('HybridOverviewScreen: fallback hint that links to the assessment', async () => {
    const composed = { ...budgetSplitFixture(), assessmentDomains: ['push'] };
    await expect(html(<HybridOverviewScreen composed={composed as never} cityName="תל אביב" onStart={noop} onBack={noop} onAssessmentLink={noop} />))
      .toMatchFileSnapshot(snap('hybrid-assessment-link'));
  });
});
