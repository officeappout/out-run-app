/**
 * i18n wave 2 (namespace `map`, `overview.route.*` keys): the route overview's
 * copy (compact card, drawer, overlay title bar, leg detail, elevation chart)
 * moved to src/messages/he/map.json. The snapshots below were recorded from
 * the components BEFORE the extraction; the extracted components must render
 * the same Hebrew markup in every state a static render reaches: named /
 * nameless route, each activity, focused / not focused / blocked card, walk
 * legs on / off, too far, the overlay's title bar, the leg detail with and
 * without data, the elevation chart with and without a climb.
 * States behind a tap (the drawer's "פירוט" body, the overlay's workout view)
 * are pinned key by key in src/lib/i18n/__tests__/map-he.test.ts.
 *
 * `<!-- -->` is stripped before comparing (in the BEFORE snapshots too):
 * react-dom/server inserts it between two adjacent text nodes (`{min} דק׳` is
 * two nodes, `t('…', { min })` is one). It is not rendered text, and the
 * client DOM never contains it.
 */
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';

const mapState = { walkToRouteMinutes: null as number | null };
vi.mock('@/features/user', () => {
  const state = { profile: { core: { gender: 'male', weight: 70 } } };
  const useUserStore = (sel: (s: typeof state) => unknown) => sel(state);
  (useUserStore as unknown as { getState: () => typeof state }).getState = () => state;
  return { useUserStore };
});
vi.mock('@/features/parks/core/store/useMapStore', () => {
  const noop = () => {};
  const useMapStore = (sel: (s: Record<string, unknown>) => unknown) => sel({
    ...mapState, setOverviewSheetHeightPx: noop, setIsOverviewActive: noop,
  });
  return { useMapStore };
});
vi.mock('@/lib/onboardingPrefs', () => ({ getOnboardingPref: () => null, setOnboardingPref: () => {} }));
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ showToast: () => {} }) }));

import RouteOverviewDrawer from '../route/RouteOverviewDrawer';
import RouteOverviewCompactCard from '../route/RouteOverviewCompactCard';
import RouteOverviewOverlay from '../route/RouteOverviewOverlay';
import RouteLegDetail from '../route/RouteLegDetail';
import ElevationProfileChart from '../route/ElevationProfileChart';
import type { Route } from '@/features/parks/core/types/route.types';

beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-19T08:40:00')); });
afterAll(() => { vi.useRealTimers(); });
afterEach(() => { mapState.walkToRouteMinutes = null; });

const html = (el: ReactElement) => renderToStaticMarkup(el).replaceAll('<!-- -->', '');
const snap = (name: string) => `./__snapshots__/route-overview-i18n/${name}.html`;
const noop = () => {};

const path: [number, number][] = Array.from({ length: 12 }, (_, i) => [34.8 + (i % 2) * 0.0001, 32 + i * 0.003]);
path.push([34.8, 32.0005]);
const route = {
  id: 'r1', name: 'לולאת הירקון', distance: 4.2, duration: 25, score: 80, type: 'running', difficulty: 'easy',
  rating: 4, calories: 300, features: {}, segments: [], path, routeShape: 'loop',
  elevationGain: 1234,
  elevationProfile: { stepM: 70, elevationsM: [10, 12, 14, 22, 35, 40, 33, 20, 14, 12, 10] },
  qualitySignals: {
    composition: { sidewalkPct: 10, genuinePct: 72, ordinaryPct: 18, otherPct: 0 },
    lighting: { status: 'computed', litCoveragePct: 83.4, isLit: true }, computedAt: null, source: 'osm_overpass_v1',
  },
  facilityStops: [{ id: 'g1', name: 'גינת כושר הירקון', lat: 32.012, lng: 34.8, waypointIndex: 4 }],
  nearbyAmenities: [
    { amenityId: 'w', category: 'drinking_water', distanceFromPathMeters: 4, location: { lat: 32.006, lng: 34.8 } },
    { amenityId: 'b', category: 'bench', distanceFromPathMeters: 4, location: { lat: 32.015, lng: 34.8 } },
    { amenityId: 'f', category: 'fitness_station', distanceFromPathMeters: 4, location: { lat: 32.018, lng: 34.8 } },
    { amenityId: 'c', category: 'court', distanceFromPathMeters: 4, location: { lat: 32.021, lng: 34.8 } },
    { amenityId: 'd', category: 'dog_park', distanceFromPathMeters: 4, location: { lat: 32.024, lng: 34.8 } },
  ],
} as unknown as Route;
const nameless = {
  ...route, name: '  ', type: 'workout', distance: 0.8, routeShape: 'point_to_point',
  elevationGain: undefined, elevationProfile: undefined, qualitySignals: undefined, facilityStops: [], nearbyAmenities: [],
} as unknown as Route;
const lit = {
  ...route, elevationGain: 3,
  qualitySignals: { ...(route.qualitySignals as object), lighting: { status: 'computed', litCoveragePct: null, isLit: true } },
} as unknown as Route;
const far = { lat: 31.5, lng: 34.5 };

describe('RouteOverviewCompactCard — Hebrew markup unchanged', () => {
  for (const activity of ['running', 'walking', 'cycling'] as const) {
    it(`focused · ${activity}`, async () => {
      await expect(html(<RouteOverviewCompactCard route={route} activity={activity} isActive onOpen={noop} onStart={noop} />))
        .toMatchFileSnapshot(snap(`card-focused-${activity}`));
    });
  }
  it('focused · nameless, falls back to the carousel activity', async () => {
    await expect(html(<RouteOverviewCompactCard route={nameless} activity="walking" isActive onOpen={noop} onStart={noop} footnote="שורה" />))
      .toMatchFileSnapshot(snap('card-focused-nameless'));
  });
  it('not focused', async () => {
    await expect(html(<RouteOverviewCompactCard route={route} activity="running" isActive={false} onOpen={noop} onStart={noop} />))
      .toMatchFileSnapshot(snap('card-not-focused'));
  });
  it('blocked', async () => {
    await expect(html(<RouteOverviewCompactCard route={route} isActive onOpen={noop} onStart={noop} blockedReason="far" blockedLabel="עוד כ-9 דק' הליכה" />))
      .toMatchFileSnapshot(snap('card-blocked'));
  });
});

describe('RouteOverviewDrawer — Hebrew markup unchanged', () => {
  it('running, walk there and back, navigate button', async () => {
    mapState.walkToRouteMinutes = 4;
    await expect(html(<RouteOverviewDrawer route={route} initialActivity="walking" userLocation={{ lat: 32, lng: 34.8 }} onBack={noop} onStart={noop} onNavigate={noop} />))
      .toMatchFileSnapshot(snap('drawer-running-walk'));
  });
  it('nameless, map activity, no walk', async () => {
    await expect(html(<RouteOverviewDrawer route={nameless} initialActivity="cycling" onBack={noop} onStart={noop} />))
      .toMatchFileSnapshot(snap('drawer-nameless-cycling'));
  });
  it('too far (walk minutes)', async () => {
    mapState.walkToRouteMinutes = 9;
    await expect(html(<RouteOverviewDrawer route={route} userLocation={{ lat: 32.0001, lng: 34.81 }} onBack={noop} onStart={noop} topSlot={<p>top</p>} />))
      .toMatchFileSnapshot(snap('drawer-too-far-walk'));
  });
  it('too far (distance)', async () => {
    mapState.walkToRouteMinutes = 90;
    await expect(html(<RouteOverviewDrawer route={route} userLocation={far} onBack={noop} onStart={noop} />))
      .toMatchFileSnapshot(snap('drawer-too-far-km'));
  });
});

describe('RouteOverviewOverlay — Hebrew markup unchanged', () => {
  it('route title bar', async () => {
    await expect(html(<RouteOverviewOverlay route={route} onBack={noop} onStart={noop} renderFullDetails={() => <p>full</p>} />))
      .toMatchFileSnapshot(snap('overlay-route'));
  });
  it('nameless', async () => {
    await expect(html(<RouteOverviewOverlay route={nameless} onBack={noop} onStart={noop} />))
      .toMatchFileSnapshot(snap('overlay-nameless'));
  });
});

describe('RouteLegDetail / ElevationProfileChart — Hebrew markup unchanged', () => {
  it('leg detail · all data', async () => {
    await expect(html(<RouteLegDetail route={route} calories={310} />)).toMatchFileSnapshot(snap('leg-detail-full'));
  });
  it('leg detail · lit without a percentage, small ascent', async () => {
    await expect(html(<RouteLegDetail route={lit} calories={0} />)).toMatchFileSnapshot(snap('leg-detail-lit'));
  });
  it('leg detail · no data', async () => {
    await expect(html(<RouteLegDetail route={nameless} calories={50} />)).toMatchFileSnapshot(snap('leg-detail-empty'));
  });
  it('elevation · with a climb', async () => {
    await expect(html(<ElevationProfileChart samples={{ stepM: 70, elevationsM: [10, 12, 14, 22, 35, 1040, 33, 20, 14, 12, 10] }} />))
      .toMatchFileSnapshot(snap('elevation-climb'));
  });
  it('elevation · flat', async () => {
    await expect(html(<ElevationProfileChart samples={{ stepM: 70, elevationsM: [10, 11, 10, 11, 10] }} />))
      .toMatchFileSnapshot(snap('elevation-flat'));
  });
});
