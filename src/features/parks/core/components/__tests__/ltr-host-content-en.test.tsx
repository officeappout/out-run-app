import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';

const flags: Record<string, boolean> = { enableHomeV2: false, enableRouteShadeTag: true };
const mapState: Record<string, unknown> = { walkToRouteMinutes: null };
const session = { status: 'active' as string };
const player: Record<string, unknown> = { guidedRouteName: null, activeRoutePath: null };
const banner = { joined: false, pct: 0, remainingM: 0, approaching: false };
const saved: { places: Record<string, unknown> } = { places: {} };
const recent: { recents: unknown[] } = { recents: [] };

// react-dom/server reads a real zustand store's INITIAL state (getServerSnapshot), so the locale is a selector fake.
const localeState = vi.hoisted(() => ({ locale: 'he' as 'he' | 'en', i18nEnabled: true, contentLocaleOn: true, gender: 'other', catalogVersion: 0 }));
vi.mock('@/store/useLocaleStore', () => {
  const useLocaleStore = (sel: (s: typeof localeState) => unknown) => sel(localeState);
  Object.assign(useLocaleStore, { getState: () => localeState, setState: (n: Partial<typeof localeState>) => Object.assign(localeState, n), subscribe: () => () => {} });
  return { useLocaleStore };
});
vi.mock('@/features/partners', () => ({
  usePartnerFilters: (sel: (s: Record<string, unknown>) => unknown) => sel({ liveActivity: 'all', distanceKm: 3 }),
  PartnerFilterSheet: () => null,
}));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, app: {}, storage: {} }));
vi.mock('@/hooks/useFeatureFlags', () => ({ useFeatureFlags: () => ({ flags, loading: false }) }));
vi.mock('@/features/user/identity/store/useUserStore', () => {
  const state = { profile: { core: { gender: 'male', weight: 70 } } };
  return { useUserStore: (sel: (s: typeof state) => unknown) => sel(state) };
});
vi.mock('@/lib/onboardingPrefs', () => ({ getOnboardingPref: () => null, setOnboardingPref: () => {} }));
vi.mock('@/features/user', () => {
  const state = { profile: { core: { gender: 'male', weight: 70 } } };
  const useUserStore = (sel: (s: typeof state) => unknown) => sel(state);
  (useUserStore as unknown as { getState: () => typeof state }).getState = () => state;
  return { useUserStore };
});
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ showToast: () => {} }) }));
vi.mock('@/features/parks/core/store/useMapStore', () => {
  const noop = () => {};
  const state = () => ({
    navCardHeight: 0, storyBarHeight: 0, isLapsOpen: false, cameraMode: 'follow', navCarouselMinimized: false, ...mapState,
    setFreeRunCarouselRoutes: noop, setOverviewSheetHeightPx: noop, setIsOverviewActive: noop,
    setNavCardHeight: noop, setTurnFlyToTarget: noop, setParkTurn: noop, setActiveTurnIdx: noop, setCameraMode: noop, setNavCarouselMinimized: noop,
  });
  const useMapStore = (sel?: (s: Record<string, unknown>) => unknown) => (sel ? sel(state()) : state());
  (useMapStore as unknown as { getState: () => unknown }).getState = state;
  return { useMapStore };
});
vi.mock('@/features/workout-engine/core/store/useSessionStore', () => ({
  useSessionStore: (sel: (s: typeof session) => unknown) => sel(session),
}));
vi.mock('@/features/workout-engine/players/running/store/useRunningPlayer', () => ({
  useRunningPlayer: (sel: (s: typeof player) => unknown) => sel(player),
}));
vi.mock('@/features/workout-engine/players/running/store/useRouteRunV2Store', () => ({
  useRouteRunV2Store: (sel: (s: { elevation: null }) => unknown) => sel({ elevation: null }),
}));
vi.mock('@/features/workout-engine/players/running/components/RouteRun/v2/RouteElevationAhead', () => ({ default: () => null }));
vi.mock('@/features/parks/core/services/nav-banner', async (orig) => ({
  ...(await orig<typeof import('@/features/parks/core/services/nav-banner')>()),
  navBannerProgress: () => ({ joined: banner.joined, pct: banner.pct, remainingM: banner.remainingM }),
  isApproaching: () => banner.approaching,
}));
vi.mock('@/features/user/places/store/useSavedPlacesStore', async (orig) => ({
  ...(await orig<typeof import('@/features/user/places/store/useSavedPlacesStore')>()),
  useSavedPlacesStore: (sel: (s: Record<string, unknown>) => unknown) => sel({ places: saved.places, setPlace: () => {} }),
}));
vi.mock('@/features/parks/core/store/useRecentSearchesStore', () => ({
  useRecentSearchesStore: (sel: (s: Record<string, unknown>) => unknown) =>
    sel({ recents: recent.recents, removeRecent: () => {}, clearRecents: () => {} }),
}));
vi.mock('@/features/search/hooks/useUnifiedSearchFlag', () => ({ useUnifiedSearchFlag: () => ({ on: false }) }));
vi.mock('@/features/search/hooks/useMapQuickPlaces', () => ({
  MAP_QUICK_LABEL: {},
  useMapQuickPlaces: () => ({ available: [], active: null, items: [], toggle: () => {} }),
}));
vi.mock('@/features/parks/core/hooks/useSearchNavigation', () => ({
  MIN_SEARCH_CHARS: 2,
  getNearbySearchSuggestions: async () => [],
  findOfficialRoutesNear: async () => [],
}));
vi.mock('@/features/parks/core/services/route-generator.service', () => ({ generateDynamicRoutes: async () => [] }));
vi.mock('@/features/parks/core/services/parks.service', () => ({ fetchRealParks: async () => [] }));
vi.mock('@/features/generation-review/capture/hooks', () => ({ logGeneratedRoutes: (r: unknown) => r }));

import BottomJourneyContainer from '../BottomJourneyContainer';
import NavBannerV2 from '../NavBannerV2';
import RouteCardUnified from '../RouteCardUnified';
import RouteCarousel from '../RouteCarousel';
import TurnCarousel from '../TurnCarousel';
import ActivityCarousel from '../ActivityCarousel';
import HybridSlotCarousel from '../hybrid/HybridSlotCarousel';
import PlannedRunSlotCard from '../hybrid/PlannedRunSlotCard';
import RouteOverviewCompactCard from '../overview/route/RouteOverviewCompactCard';
import { RouteShadeRow } from '../route-shade/RouteShade';
import ParticipantStrip from '@/features/workout-engine/shared/components/ParticipantStrip';
import { Navigation } from 'lucide-react';
import { useLocaleStore } from '@/store/useLocaleStore';
import type { Route } from '@/features/parks/core/types/route.types';
import type { HybridSlot } from '@/features/workout-engine/hybrid/hybrid-slots';

/**
 * i18n wave 4 (ltr-host content): in English the cards that sit inside a `dir="ltr"` carousel host must carry
 * `dir="ltr"` themselves (they used to hard-code `dir="rtl"`), the physical classes converted for them must resolve
 * to the English side, and the directional chevrons/arrows must mirror (JS, never `ltr:` variants: those match the
 * host's ancestor dir too, which would flip Hebrew). The Hebrew markup is pinned by ltr-host-content-parity.test.tsx
 * and the existing parks-core parity snapshots.
 */

beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-21T08:40:00')); vi.spyOn(Math, 'random').mockReturnValue(0.5); });
afterAll(() => { vi.useRealTimers(); vi.restoreAllMocks(); useLocaleStore.setState({ locale: 'he' }); });
beforeEach(() => {
  flags.enableHomeV2 = false;
  mapState.walkToRouteMinutes = null;
  session.status = 'active';
  player.guidedRouteName = null;
  player.activeRoutePath = null;
  Object.assign(banner, { joined: false, pct: 0, remainingM: 0, approaching: false });
});

const render = (el: ReactElement, locale: 'he' | 'en') => {
  useLocaleStore.setState({ locale });
  return renderToStaticMarkup(el).replaceAll('<!-- -->', '');
};
const dirs = (h: string) => Array.from(h.matchAll(/ dir="(rtl|ltr)"/g), (m) => m[1]);
const noop = () => {};
const MIRROR = '-scale-x-100';

const path: [number, number][] = [[34.8, 32.0], [34.801, 32.002], [34.802, 32.004], [34.8, 32.0]];
const near = { lat: 32.0, lng: 34.8 };
const route = {
  id: 'r1', name: 'Yarkon loop', distance: 4.25, duration: 27, score: 80, type: 'running', activityType: 'running',
  difficulty: 'easy', rating: 4.3, calories: 300, features: {}, segments: [], path, elevationGain: 42,
  distanceFromUser: 0.4, isReachableWithoutCar: true, source: { name: 'Tel Aviv' },
  qualitySignals: {
    composition: { sidewalkPct: 10, genuinePct: 72, ordinaryPct: 18, otherPct: 0 },
    lighting: { status: 'computed', litCoveragePct: 64, isLit: true }, computedAt: null, source: 'osm_overpass_v1',
  },
  shadeInfo: { shadedPct: 41.6 },
} as unknown as Route;
const base = { subtitle: 'sub', bolts: 2 as const, recommended: false, accent: '#00ADEF' };
const slots = [
  { ...base, id: 'full_park', kind: 'aerobic_quick', aerobicKind: 'walking', title: 'Easy walk', recommended: true, reason: 'rest day' },
  { ...base, id: 'assess', kind: 'assessment_prompt', title: 'Meet' },
] as unknown as HybridSlot[];
const turns = [{ instruction: 'פנה ימינה', distanceMeters: 120, lat: 32.001, lng: 34.801, bearingAfter: 90, pathIndex: 1 }];

describe('ltr-host content direction', () => {
  it('NavBannerV2: own dir, logical classes, the tile keeps its ltr', () => {
    const props = { icon: Navigation, actionLine: 'go', headline: 'Main St', distanceM: 120, isDestination: false, imminent: false, routePath: path, currentLocation: near, onExpand: noop, onMinimize: noop };
    const en = render(<NavBannerV2 {...props} />, 'en');
    expect(dirs(en)).toEqual(['ltr', 'ltr']);
    expect(en).toContain('pe-12 ps-3');
    expect(en).toContain('text-start');
    expect(en).toContain('absolute end-2.5');
    expect(en).not.toMatch(/\b(pl|pr|left|right)-/);
    expect(dirs(render(<NavBannerV2 {...props} />, 'he'))).toEqual(['rtl', 'ltr']);
  });

  it('RouteCardUnified: root follows the locale, the stats row stays ltr', () => {
    const el = <RouteCardUnified name="Loop" difficulty="medium" distanceText="3.0 km" durationText="20 min" ctaContent="go" onCta={noop} />;
    // root, the always-ltr stats row, the difficulty bolts
    expect(dirs(render(el, 'en'))).toEqual(['ltr', 'ltr', 'ltr']);
    expect(dirs(render(el, 'he'))).toEqual(['rtl', 'ltr', 'rtl']);
  });

  it('PlannedRunSlotCard', () => {
    const slot = { kind: 'planned_run', accent: '#65a30d', title: 'Run', subtitle: 'easy', reason: 'why', href: '/x', entry: {} };
    expect(dirs(render(<PlannedRunSlotCard slot={slot as never} onArm={noop} onCta={noop} />, 'en'))).toEqual(['ltr']);
  });

  it('RouteOverviewCompactCard: own dir + the "choose" chevron points the English way', () => {
    const el = (active: boolean) => <RouteOverviewCompactCard route={route} activity="running" isActive={active} onOpen={noop} onStart={noop} />;
    expect(dirs(render(el(true), 'en'))[0]).toBe('ltr');
    const en = render(el(false), 'en');
    expect(en).toContain(MIRROR);
    expect(render(el(false), 'he')).not.toContain(MIRROR);
  });

  it('RouteShadeRow', () => {
    const en = render(<RouteShadeRow route={route} variant="v2" now={new Date('2026-07-21T07:30:00Z')} />, 'en');
    expect(en).toContain('data-testid="route-shade-row"');
    expect(dirs(en)[0]).toBe('ltr');
  });

  it('BottomJourneyContainer: the unified card follows the locale (chevron mirrors)', () => {
    const el = <BottomJourneyContainer routes={[route]} focusedRouteId="r1" userPosition={near} loadingRouteIds={new Set()} durationActivity="walking" />;
    const en = render(el, 'en');
    expect(dirs(en)).toContain('ltr');
    expect(en).not.toContain('dir="rtl"');
    expect(en).toContain(MIRROR);
    expect(render(el, 'he')).not.toContain(MIRROR);
  });

  it('RouteCarousel (searching): dialog and card follow the locale', () => {
    const el = <RouteCarousel userPosition={near} activity="running" targetKm={3} focusedRouteId={null} onSelect={noop} onBack={noop} />;
    const en = render(el, 'en');
    expect(en).not.toContain('dir="rtl"');
    expect(render(el, 'he')).toContain('dir="rtl"');
  });

  it('TurnCarousel: no hard-coded rtl', () => {
    const el = <TurnCarousel turns={turns} routePath={path} currentLocation={near} />;
    expect(render(el, 'en')).not.toContain('dir="rtl"');
    expect(render(el, 'he')).toContain('dir="rtl"');
  });

  it('ActivityCarousel: dialog + chip + cards follow the locale, the scroller keeps ltr, the CTA chevron mirrors', () => {
    const el = <ActivityCarousel currentActivity="running" onSelect={noop} onClose={noop} />;
    const en = render(el, 'en');
    expect(dirs(en)).toEqual(['ltr', 'ltr', 'ltr', 'ltr', 'ltr', 'ltr']);
    expect(en).not.toMatch(/\b(left|right)-0|-right-1/);
    expect(en).toContain('-start-1');
    expect(en).toContain(MIRROR);
    const he = render(el, 'he');
    expect(dirs(he)).toEqual(['rtl', 'rtl', 'ltr', 'rtl', 'rtl', 'rtl']);
    expect(he).not.toContain(MIRROR);
  });

  it('HybridSlotCarousel: cards, toggle and root follow the locale; the back arrow mirrors', () => {
    const el = <HybridSlotCarousel slots={slots} aerobicKind="walking" onActivityChange={noop} onSelectSlot={noop} onBuildYourself={noop} onClose={noop} />;
    const en = render(el, 'en');
    expect(en).not.toContain('dir="rtl"');
    expect(en).toContain(MIRROR);
    const he = render(el, 'he');
    expect(he).toContain('dir="rtl"');
    expect(he).not.toContain(MIRROR);
  });

  it('ParticipantStrip: the distance label follows the locale, the avatars stay ltr', () => {
    const partners = [{ uid: 'a', name: 'Dana Cohen', color: '#f00' }];
    const el = <ParticipantStrip partnerPositions={partners as never} totalDistanceKm={2.4} />;
    expect(render(el, 'en')).toContain('style="direction:ltr"');
    expect(render(el, 'he')).toContain('style="direction:rtl"');
  });
});
