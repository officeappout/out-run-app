/**
 * i18n wave 2 (namespace `map`; keys journey.* / marker.* / searchBar.* / legPlan.* / layers.* / modes.* /
 * navBanner.* / routeCard.* / carousel.* / mapSearch.* / pick.* / session.* / hybrid.* / overview.axis.* /
 * overview.shell.* / overview.roundTrip.*): the map / parks UI in src/features/parks/core/components.
 *
 * The snapshots below were recorded from the components BEFORE the extraction; the extracted components must
 * render the same Hebrew markup in every state a static render reaches (v1 and v2 = enable_home_v2, each mode /
 * activity / branch, counts >= 1000). States behind a tap or an async load are covered by
 * parks-core-i18n-dom-parity.test.tsx (jsdom); what neither reaches (the hold-to-stop hint, the generation
 * error fallback) is pinned key by key in src/lib/i18n/__tests__/map-parks-core-he.test.ts.
 *
 * Stores are replaced by selector fakes (vi.mock) — under react-dom/server a real Zustand store only renders
 * its initial state. `<!-- -->` is stripped before comparing (in the BEFORE snapshots too): react-dom/server
 * inserts it between two adjacent text nodes (`{n} דק׳` is two nodes, `t('…', { n })` is one). It is not
 * rendered text, and the client DOM never contains it.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';

const flags = { enableHomeV2: false };
const mapState: Record<string, unknown> = { walkToRouteMinutes: null };
const session = { status: 'active' as string };
const player: Record<string, unknown> = { guidedRouteName: null, activeRoutePath: null };
const banner = { joined: false, pct: 0, remainingM: 0, approaching: false };
const saved: { places: Record<string, unknown> } = { places: {} };
const recent: { recents: unknown[] } = { recents: [] };

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, app: {}, storage: {} }));
vi.mock('@/hooks/useFeatureFlags', () => ({ useFeatureFlags: () => ({ flags }) }));
vi.mock('@/features/user', () => {
  const state = { profile: { core: { gender: 'male', weight: 70 } } };
  const useUserStore = (sel: (s: typeof state) => unknown) => sel(state);
  (useUserStore as unknown as { getState: () => typeof state }).getState = () => state;
  return { useUserStore };
});
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ showToast: () => {} }) }));
vi.mock('@/features/parks/core/store/useMapStore', () => {
  const noop = () => {};
  const state = () => ({ ...mapState, setFreeRunCarouselRoutes: noop, setOverviewSheetHeightPx: noop, setIsOverviewActive: noop });
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
import DestinationMarker from '../DestinationMarker';
import FloatingSearchBar from '../FloatingSearchBar';
import LegPlanStartPreview from '../LegPlanStartPreview';
import MapModeHeader from '../MapModeHeader';
import NavBannerV2 from '../NavBannerV2';
import RouteCardUnified from '../RouteCardUnified';
import RouteCarousel from '../RouteCarousel';
import SearchOverlayV2 from '../SearchOverlayV2';
import { SearchDestinationCard, SearchRouteCard } from '../SearchPickCards';
import AerobicStrengthSlider from '../hybrid/AerobicStrengthSlider';
import HybridStationCard from '../hybrid/HybridStationCard';
import OverviewTitleBar from '../hybrid/OverviewTitleBar';
import StrengthStationsToggle from '../hybrid/StrengthStationsToggle';
import RoundTripPill from '../overview/RoundTripPill';
import OverviewLegAxis from '../overview/OverviewLegAxis';
import { AxisV2 } from '../overview/axis/AxisParts';
import { Navigation } from 'lucide-react';
import type { Route } from '@/features/parks/core/types/route.types';
import type { OverviewLeg } from '../overview/overview-legs';
import type { CompiledLegPlanRoute } from '@/features/parks/core/services/leg-plan.service';
import type { HybridPlannedSegment } from '@/features/workout-engine/hybrid/compose-hybrid-session.service';

beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-21T08:40:00')); vi.spyOn(Math, 'random').mockReturnValue(0.5); });
afterAll(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
beforeEach(() => {
  flags.enableHomeV2 = false;
  mapState.walkToRouteMinutes = null;
  session.status = 'active';
  player.guidedRouteName = null;
  player.activeRoutePath = null;
  Object.assign(banner, { joined: false, pct: 0, remainingM: 0, approaching: false });
  saved.places = {};
  recent.recents = [];
});

const html = (el: ReactElement) => renderToStaticMarkup(el).replaceAll('<!-- -->', '');
const snap = (name: string) => `./__snapshots__/parks-core-i18n/${name}.html`;
const noop = () => {};
const V = [false, true] as const;
const vName = (v2: boolean) => (v2 ? 'v2' : 'v1');

const path: [number, number][] = [[34.8, 32.0], [34.801, 32.002], [34.802, 32.004], [34.8, 32.0]];
const near = { lat: 32.0, lng: 34.8 };
const route = {
  id: 'r1', name: 'לולאת הירקון', distance: 4.25, duration: 27, score: 80, type: 'running', activityType: 'running',
  difficulty: 'easy', rating: 4.3, calories: 300, features: {}, segments: [], path, elevationGain: 42,
  distanceFromUser: 0.4, isReachableWithoutCar: true, source: { name: 'עיריית תל אביב' },
} as unknown as Route;
const farRoute = { ...route, id: 'r2', name: 'מסלול רחוק', distanceFromUser: 1234, path: [[35.5, 33.0], [35.501, 33.002]] } as unknown as Route;
const loadingRoute = { ...route, id: 'gen-3', name: 'מסלול שנוצר' } as unknown as Route;

describe('BottomJourneyContainer (unified cards)', () => {
  it.each(V)('near / too far / loading, %s', async (v2) => {
    flags.enableHomeV2 = v2;
    mapState.walkToRouteMinutes = 6;
    await expect(html(
      <BottomJourneyContainer routes={[route, farRoute, loadingRoute]} focusedRouteId="r1" userPosition={near}
        loadingRouteIds={new Set(['gen-3'])} durationActivity="walking" />,
    )).toMatchFileSnapshot(snap(`journey-${vName(v2)}`));
  });
});

describe('small map pieces', () => {
  it('destination marker', async () => {
    await expect(html(<><DestinationMarker label="הרצל 14, תל אביב" /><DestinationMarker /></>)).toMatchFileSnapshot(snap('marker'));
  });
  it('floating search bar', async () => {
    await expect(html(<FloatingSearchBar searchQuery="" onSearchChange={noop} onFocus={noop} />)).toMatchFileSnapshot(snap('search-bar'));
  });
  it('leg plan start preview', async () => {
    const compiled = { legBreakdown: [1, 2, 3], route: { distance: 5.46, duration: 33 } } as unknown as CompiledLegPlanRoute;
    await expect(html(<LegPlanStartPreview compiled={compiled} onConfirm={noop} />)).toMatchFileSnapshot(snap('leg-plan'));
  });
  it('mode header', async () => {
    await expect(html(
      <>
        <MapModeHeader activeMode="discover" onModeChange={noop} hasNearbyRoutes partnerCount={1234} />
        <MapModeHeader activeMode="idle" onModeChange={noop} hasNearbyRoutes={false} partnerCount={0} />
      </>,
    )).toMatchFileSnapshot(snap('mode-header'));
  });
});

describe('NavBannerV2', () => {
  const props = {
    icon: Navigation, actionLine: 'פנה ימינה', headline: 'רחוב הרצל', distanceM: 120, isDestination: false,
    imminent: false, routePath: path, currentLocation: near, onExpand: noop, onMinimize: noop,
  };
  it('approaching the route', async () => {
    banner.approaching = true;
    await expect(html(<NavBannerV2 {...props} />)).toMatchFileSnapshot(snap('nav-approaching'));
  });
  it('joined, named route', async () => {
    Object.assign(banner, { joined: true, pct: 42, remainingM: 1800 });
    player.guidedRouteName = 'לולאת הירקון';
    await expect(html(<NavBannerV2 {...props} />)).toMatchFileSnapshot(snap('nav-joined'));
  });
  it('not joined yet, nameless route', async () => {
    await expect(html(<NavBannerV2 {...props} actionLine={null} />)).toMatchFileSnapshot(snap('nav-not-joined'));
  });
});

describe('RouteCardUnified', () => {
  it.each(V)('recommended + loading / stats / subtitle, %s', async (v2) => {
    flags.enableHomeV2 = v2;
    await expect(html(
      <>
        <RouteCardUnified name="מסלול" difficulty="easy" recommended ctaLoading ctaContent="x" onCta={noop} subtitle="תת כותרת" />
        <RouteCardUnified name="מסלול" difficulty="medium" distanceText="3.0 km" durationText="20" ctaContent="go" onCta={noop} />
      </>,
    )).toMatchFileSnapshot(snap(`route-card-${vName(v2)}`));
  });
});

describe('RouteCarousel (searching state — the first render)', () => {
  it.each([
    ['loop-city', { cityName: 'תל אביב' }],
    ['loop-no-city', {}],
    ['commute-dest', { mode: 'commute' as const, destinationLabel: 'הרצל 14', onActivityChange: noop }],
    ['commute-no-dest', { mode: 'commute' as const, onActivityChange: noop }],
  ])('%s', async (name, extra) => {
    await expect(html(
      <RouteCarousel userPosition={near} activity="running" targetKm={3} focusedRouteId={null}
        onSelect={noop} onBack={noop} {...extra} />,
    )).toMatchFileSnapshot(snap(`carousel-searching-${name}`));
  });
});

describe('SearchOverlayV2', () => {
  const base = {
    onSearchChange: noop, onAddressSelect: noop, isSearching: false, inputRef: { current: null },
    onCancel: noop, userPos: near,
  };
  it('empty: home set, work unset, recents', async () => {
    saved.places = { home: { kind: 'home', label: 'בית', coords: [34.81, 32.01], address: 'הרצל 14, תל אביב' } };
    recent.recents = [{ text: 'פארק הירקון', coords: [34.8, 32.1], source: 'park', pickedAt: 1 }];
    await expect(html(<SearchOverlayV2 {...base} searchQuery="" suggestions={[]} />)).toMatchFileSnapshot(snap('search-empty'));
  });
  it('typing, grouped results', async () => {
    const suggestions = [
      { text: 'הרצל 14, תל אביב', coords: [34.81, 32.01], _source: 'mapbox', placeType: 'address' },
      { text: 'הרצל 20, תל אביב', coords: [34.812, 32.012], _source: 'mapbox', placeType: 'address' },
      { text: 'הרצל 30, תל אביב', coords: [34.813, 32.013], _source: 'mapbox', placeType: 'address' },
      { text: 'הרצל 40, תל אביב', coords: [34.814, 32.014], _source: 'mapbox', placeType: 'address' },
      { text: 'פארק הרצל', coords: [34.82, 32.02], _source: 'park', _id: 'p1' },
    ];
    await expect(html(<SearchOverlayV2 {...base} searchQuery="הרצל" suggestions={suggestions as never} />))
      .toMatchFileSnapshot(snap('search-typing'));
  });
  it('typing, no results', async () => {
    await expect(html(<SearchOverlayV2 {...base} searchQuery="קקק" suggestions={[]} />)).toMatchFileSnapshot(snap('search-none'));
  });
});

describe('SearchPickCards', () => {
  it('destination card (work saved here)', async () => {
    saved.places = { work: { kind: 'work', label: 'עבודה', coords: [34.81, 32.01] } };
    await expect(html(
      <SearchDestinationCard place={{ text: 'הרצל 14, תל אביב, ישראל', coords: [34.81, 32.01], placeType: 'address' }}
        userPos={near} onClose={noop} onNavigate={noop} onStartActivity={noop} onOpenRoute={noop} />,
    )).toMatchFileSnapshot(snap('pick-destination'));
  });
  it('destination card, no type, no position', async () => {
    await expect(html(
      <SearchDestinationCard place={{ text: 'מקום כלשהו', coords: [34.81, 32.01] }}
        onClose={noop} onNavigate={noop} onStartActivity={noop} onOpenRoute={noop} />,
    )).toMatchFileSnapshot(snap('pick-destination-bare'));
  });
  it.each(['walking', 'cycling', 'running', 'workout'])('route card, %s', async (act) => {
    await expect(html(
      <SearchRouteCard route={{ ...route, activityType: act, type: act } as Route} userPos={near}
        onClose={noop} onStartRoute={noop} onNavigateToStart={noop} onDetails={noop} />,
    )).toMatchFileSnapshot(snap(`pick-route-${act}`));
  });
});

describe('hybrid pieces', () => {
  it.each(V)('aerobic / strength slider, %s', async (v2) => {
    await expect(html(
      <>
        <AerobicStrengthSlider v2={v2} aerobicShare={0.5} recommendedShare={0.5} onChange={noop} goalType="time" timeBudgetMin={30} helperText="עזרה" />
        <AerobicStrengthSlider v2={v2} aerobicShare={0.3} recommendedShare={0.5} onChange={noop} goalType="time" timeBudgetMin={30} helperText="עזרה" />
      </>,
    )).toMatchFileSnapshot(snap(`split-${vName(v2)}`));
  });
  it.each(V)('strength stations toggle, %s', async (v2) => {
    await expect(html(<StrengthStationsToggle v2={v2} enabled onToggle={noop} />)).toMatchFileSnapshot(snap(`stations-toggle-${vName(v2)}`));
  });
  it('overview title bar', async () => {
    await expect(html(<><OverviewTitleBar title="ריצה + כוח" onBack={noop} /><OverviewTitleBar title="הצעות" eyebrow={null} onBack={noop} /></>))
      .toMatchFileSnapshot(snap('title-bar'));
  });

  const warmup = { exercise: { id: 'w1', name: { he: 'חימום' }, exerciseRole: 'warmup' }, exerciseRole: 'warmup' };
  const main = { exercise: { id: 'm1', name: { he: 'מתח' }, exerciseRole: 'main' }, exerciseRole: 'main' };
  const seg = (content: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
    ({ kind: 'strength', content: { estimatedDurationSec: 600, ...content }, ...extra }) as unknown as HybridPlannedSegment;
  const station = (props: Partial<Parameters<typeof HybridStationCard>[0]>) => (
    <HybridStationCard seg={seg({})} segIndex={1} ordinal={2} collapsed={false} onToggleCollapsed={noop} {...props} />
  );
  it.each(V)('station cards, %s', async (v2) => {
    await expect(html(
      <AxisV2.Provider value={v2}>
        {station({ seg: seg({ needsAssessment: true }), stationName: 'גינת כושר הירקון' })}
        {station({ seg: seg({ needsAssessment: true }) })}
        {station({ seg: seg({ exercises: [warmup, main] }), stationName: 'גינת כושר הירקון', collapsed: true })}
        {station({ seg: seg({ exercises: [main] }, { domainFocus: 'pull' }), stationName: 'גינת כושר', collapsed: true })}
        {station({ seg: seg({ exercises: [main] }, { domainFocus: 'legs_core' }), stationName: 'גינת כושר', collapsed: true })}
        {station({ seg: seg({ exercises: [main] }, { domainFocus: 'unknown' }), stationName: 'גינת כושר', collapsed: true })}
        {station({ seg: seg({ exercises: [] }, { activityType: 'stretch' }), stationName: 'גינה', collapsed: true })}
        {station({ seg: seg({ exercises: [] }, { activityType: 'core' }), stationName: 'גינה', collapsed: true })}
        {station({ seg: seg({ exercises: [] }), stationName: 'גינת כושר הירקון' })}
        {station({ seg: seg({ exercises: [] }, { activityType: 'yoga' }), stationName: 'גינה' })}
        {station({ seg: seg({ exercises: [] }, { activityType: 'core' }), stationName: 'גינה' })}
        {station({ seg: seg({ exercises: [] }) })}
      </AxisV2.Provider>,
    )).toMatchFileSnapshot(snap(`station-${vName(v2)}`));
  });
});

describe('overview pieces', () => {
  it.each(V)('round trip pill, %s', async (v2) => {
    await expect(html(<><RoundTripPill v2={v2} on walkMin={12} onToggle={noop} /><RoundTripPill v2={v2} on={false} walkMin={0} onToggle={noop} /></>))
      .toMatchFileSnapshot(snap(`round-trip-${vName(v2)}`));
  });
  const legs: OverviewLeg[] = [
    { kind: 'transport', key: 't1', phase: 'there', label: 'הליכה אל המסלול', minutes: 5 },
    { kind: 'aerobic', key: 'a1', activity: 'running', layout: 'standard', title: 'ריצה', badge: 'קל', meta: [], paceText: '6:00', loopNote: true,
      drills: [{ key: 'd1', label: 'ברכיים גבוהות' }] },
    { kind: 'aerobic', key: 'a2', activity: 'running', layout: 'standard', title: 'ריצה', badge: 'קל', meta: [], paceSecPerKm: 330 },
    { kind: 'group', key: 'g1', title: 'העיקר', repeat: 6, color: '#EF4444',
      rows: [{ key: 'r1', tone: 'work', label: 'ריצה מהירה', paceText: '4:30', drillKey: 'd2' }, { key: 'r2', tone: 'recovery', label: 'הליכה' }] },
    { kind: 'transport', key: 't2', phase: 'back', label: 'הליכה הביתה', minutes: 5 },
  ];
  it.each(V)('leg axis (default labels, drills, group), %s', async (v2) => {
    await expect(html(
      <OverviewLegAxis v2={v2} legs={legs} decorations={{ onDrillTap: noop }} />,
    )).toMatchFileSnapshot(snap(`leg-axis-${vName(v2)}`));
  });
});
