// @vitest-environment jsdom
/**
 * enable_route_shade_tag — the card tag ("🌳 מוצל X%"), the v2 pill, the detail
 * row, and their hosts (RouteOverviewCompactCard / RouteOverviewDrawer):
 *   - flag OFF → the host markup is byte-identical to a route with no shade at all
 *     (the recorded parity snapshots of the hosts run with the flag off too);
 *   - flag ON without measured data → still byte-identical (never "0%");
 *   - flag ON with data → the tag / row, Hebrew from the `map` catalog;
 *   - a stored route's shade arrives from POST /api/routes/shade after mount.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRoot, type Root } from 'react-dom/client';

const hoisted = vi.hoisted(() => ({ flags: { enableRouteShadeTag: false } as Record<string, boolean>, loading: false }));

vi.mock('@/hooks/useFeatureFlags', () => ({ useFeatureFlags: () => ({ flags: hoisted.flags, loading: hoisted.loading }) }));
vi.mock('@/lib/firebase', () => ({ auth: { currentUser: { getIdToken: async () => 'tok' } }, db: {} }));
vi.mock('@/features/user', () => {
  const state = { profile: { core: { gender: 'male', weight: 70 } } };
  const useUserStore = (sel: (s: typeof state) => unknown) => sel(state);
  (useUserStore as unknown as { getState: () => typeof state }).getState = () => state;
  return { useUserStore };
});
vi.mock('@/features/parks/core/store/useMapStore', () => {
  const noop = () => {};
  const useMapStore = (sel: (s: Record<string, unknown>) => unknown) => sel({
    walkToRouteMinutes: null, setOverviewSheetHeightPx: noop, setIsOverviewActive: noop,
  });
  return { useMapStore };
});
vi.mock('@/lib/onboardingPrefs', () => ({ getOnboardingPref: () => null, setOnboardingPref: () => {} }));
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ showToast: () => {} }) }));

import { RouteQualityBadgesWithShade, RouteShadeRow, RouteShadeTagPill } from '../route-shade/RouteShade';
import RouteQualityBadges from '../RouteQualityBadges';
import RouteOverviewCompactCard from '../overview/route/RouteOverviewCompactCard';
import RouteOverviewDrawer from '../overview/route/RouteOverviewDrawer';
import { __resetRouteShadeCache } from '../../services/route-shade/route-shade-client';
import type { Route } from '../../types/route.types';

const july = [null, 0.1, 0.2, 0.3, 0.35, 0.4, 0.22, 0.25, 0.3, 0.33, 0.47, 0.5, 0.6, null];
// 2026-07-21 10:30 local (UTC+3).
const AT_10 = new Date('2026-07-21T07:30:00Z');
const qualitySignals = {
  composition: { sidewalkPct: 10, genuinePct: 72, ordinaryPct: 18, otherPct: 0 },
  lighting: { status: 'computed', litCoveragePct: 64, isLit: true }, computedAt: null, source: 'osm_overpass_v1',
} as Route['qualitySignals'];
const base = {
  id: 'storedRoute1', name: 'לולאת הירקון', distance: 4.2, duration: 25, score: 80, type: 'running', difficulty: 'easy',
  rating: 4, calories: 300, features: {}, segments: [], routeShape: 'loop',
  path: [[34.8, 32], [34.81, 32.01], [34.8, 32]] as [number, number][],
} as unknown as Route;
const withQs = { ...base, qualitySignals } as Route;
const measured = { ...withQs, id: 'gh-1-0-0', shadeInfo: { shadedPct: 41.6, julyByHour: july } } as Route;
const notMeasured = { ...withQs, id: 'gh-1-0-1', shadeInfo: { shadedPct: null } } as Route;
const noop = () => {};

const setFlag = (on: boolean) => { hoisted.flags = { enableRouteShadeTag: on }; };
beforeEach(() => { setFlag(false); hoisted.loading = false; __resetRouteShadeCache(); });

describe('card badge row (RouteCarousel / BottomJourneyContainer)', () => {
  const plain = (scrollable = false) => renderToStaticMarkup(<RouteQualityBadges qualitySignals={qualitySignals} scrollable={scrollable} />);
  it('flag off → exactly today\'s badges, even when the route carries shade', () => {
    for (const s of [false, true]) {
      expect(renderToStaticMarkup(<RouteQualityBadgesWithShade route={measured} scrollable={s} />)).toBe(plain(s));
    }
  });
  it('flag on, not measured → exactly today\'s badges (no "0%")', () => {
    setFlag(true);
    expect(renderToStaticMarkup(<RouteQualityBadgesWithShade route={notMeasured} />)).toBe(plain());
    expect(renderToStaticMarkup(<RouteQualityBadgesWithShade route={{ ...measured, shadeInfo: { shadedPct: 0 } } as Route} />)).toBe(plain());
  });
  it('flag on + measured → "🌳 מוצל 42%" as the first pill', () => {
    setFlag(true);
    const html = renderToStaticMarkup(<RouteQualityBadgesWithShade route={measured} scrollable />);
    expect(html).toContain('🌳 מוצל 42%');
    expect(html.indexOf('🌳 מוצל 42%')).toBeLessThan(html.indexOf('מואר'));
  });
  it('flag still loading → nothing extra', () => {
    setFlag(true); hoisted.loading = true;
    expect(renderToStaticMarkup(<RouteQualityBadgesWithShade route={measured} />)).toBe(plain());
  });
  it('a route with no badges and no shade still renders nothing', () => {
    setFlag(true);
    expect(renderToStaticMarkup(<RouteQualityBadgesWithShade route={{ ...base, id: 'gh-2' } as Route} />)).toBe('');
  });
});

describe('v2 compact card pill', () => {
  it('off / not measured → nothing; on + measured → the pill', () => {
    expect(renderToStaticMarkup(<RouteShadeTagPill route={measured} />)).toBe('');
    setFlag(true);
    expect(renderToStaticMarkup(<RouteShadeTagPill route={notMeasured} />)).toBe('');
    expect(renderToStaticMarkup(<RouteShadeTagPill route={measured} />)).toContain('🌳 מוצל 42%');
  });
  it('host: RouteOverviewCompactCard byte-identical when off, pill next to the title when on', () => {
    const card = (r: Route) => renderToStaticMarkup(<RouteOverviewCompactCard route={r} isActive onOpen={noop} onStart={noop} />);
    const before = card({ ...withQs, id: 'gh-1-0-0' } as Route);
    expect(card(measured)).toBe(before);
    setFlag(true);
    expect(card(notMeasured).replace('gh-1-0-1', 'gh-1-0-0')).toBe(before);
    const on = card(measured);
    expect(on).toContain('🌳 מוצל 42%');
    expect(on.indexOf('לולאת הירקון')).toBeLessThan(on.indexOf('🌳 מוצל 42%'));
  });
});

describe('route detail row', () => {
  it('flag off → nothing at all (incl. the lighting line)', () => {
    expect(renderToStaticMarkup(<RouteShadeRow route={measured} variant="v2" now={AT_10} />)).toBe('');
  });
  it('flag on → overall %, עכשיו · בצהריים · אחה״צ, מואר בלילה', () => {
    setFlag(true);
    const html = renderToStaticMarkup(<RouteShadeRow route={measured} variant="v2" now={AT_10} />);
    expect(html).toContain('aria-label="צל ותאורה לאורך המסלול"');
    expect(html).toContain('מוצל 42%');
    expect(html).toContain('עכשיו 35% · בצהריים 22% · אחה״צ 47%');
    expect(html).toContain('מואר בלילה 64%');
  });
  it('hides each line without data; no data at all → nothing', () => {
    setFlag(true);
    const noHourly = renderToStaticMarkup(<RouteShadeRow route={{ ...measured, shadeInfo: { shadedPct: 30 } } as Route} variant="legacy" now={AT_10} />);
    expect(noHourly).toContain('מוצל 30%');
    expect(noHourly).not.toContain('עכשיו');
    const litOnly = renderToStaticMarkup(<RouteShadeRow route={notMeasured} variant="legacy" now={AT_10} />);
    expect(litOnly).not.toContain('מוצל');
    expect(litOnly).toContain('מואר בלילה 64%');
    expect(renderToStaticMarkup(<RouteShadeRow route={{ ...base, id: 'gh-3' } as Route} variant="legacy" now={AT_10} />)).toBe('');
  });
  it('night: "עכשיו" drops, noon / afternoon stay', () => {
    setFlag(true);
    const html = renderToStaticMarkup(<RouteShadeRow route={measured} variant="v2" now={new Date('2026-07-21T20:00:00Z')} />);
    expect(html).toContain('בצהריים 22% · אחה״צ 47%');
    expect(html).not.toContain('עכשיו');
  });
  it('host: RouteOverviewDrawer byte-identical when off; the row sits under פירוט when on', () => {
    const drawer = (r: Route) => renderToStaticMarkup(
      <RouteOverviewDrawer route={r} initialActivity="running" userLocation={{ lat: 32, lng: 34.8 }} onBack={noop} onStart={noop} />,
    );
    const before = drawer({ ...withQs, id: 'gh-1-0-0' } as Route);
    expect(drawer(measured)).toBe(before);
    setFlag(true);
    const on = drawer(measured);
    expect(on).toContain('data-testid="route-shade-row"');
    expect(on.indexOf('פירוט')).toBeLessThan(on.indexOf('route-shade-row'));
    expect(on.indexOf('route-shade-row')).toBeLessThan(on.indexOf('מהלך המסלול'));
  });
});

describe('stored route: shade arrives from the server after mount', () => {
  let container: HTMLDivElement;
  let root: Root;
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    globalThis.fetch = realFetch;
  });

  it('flag on → one POST /api/routes/shade, then the tag', async () => {
    setFlag(true);
    const f = vi.fn(async () => new Response(JSON.stringify({ routes: { storedRoute1: { shadedPct: 57.2 } } }), { status: 200 }));
    globalThis.fetch = f as unknown as typeof fetch;
    await act(async () => { root.render(<RouteQualityBadgesWithShade route={withQs} />); });
    await act(async () => { await new Promise((r) => setTimeout(r, 80)); });
    expect(f).toHaveBeenCalledTimes(1);
    expect((f.mock.calls[0] as unknown as [string])[0]).toBe('/api/routes/shade');
    expect(container.textContent).toContain('🌳 מוצל 57%');
  });
  it('flag off → no request at all', async () => {
    const f = vi.fn();
    globalThis.fetch = f as unknown as typeof fetch;
    await act(async () => { root.render(<RouteQualityBadgesWithShade route={withQs} />); });
    await act(async () => { await new Promise((r) => setTimeout(r, 80)); });
    expect(f).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain('מוצל');
  });
});
