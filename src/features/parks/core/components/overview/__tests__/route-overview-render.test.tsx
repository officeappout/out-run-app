/**
 * Route mode of the ONE overview drawer (boards M-5a / M-5b / M-5e) and the
 * generic axis' group leg — static-markup render tests (node env).
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const mapState = { walkToRouteMinutes: 4 as number | null };
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
import RouteLegDetail from '../route/RouteLegDetail';
import OverviewLegAxis from '../OverviewLegAxis';
import OverviewDrawerShell from '../OverviewDrawerShell';
import type { Route } from '@/features/parks/core/types/route.types';

beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-19T08:40:00')); });
afterAll(() => { vi.useRealTimers(); });

const path: [number, number][] = Array.from({ length: 12 }, (_, i) => [34.8 + (i % 2) * 0.0001, 32 + i * 0.003]);
path.push([34.8, 32.0005]);
const route = {
  id: 'r1', name: 'לולאת הירקון', distance: 4.2, duration: 25, score: 80, type: 'running', difficulty: 'easy',
  rating: 4, calories: 300, features: {}, segments: [], path, routeShape: 'loop',
  elevationGain: 18,
  elevationProfile: { stepM: 70, elevationsM: [10, 12, 14, 22, 35, 40, 33, 20, 14, 12, 10] },
  qualitySignals: {
    composition: { sidewalkPct: 10, genuinePct: 72, ordinaryPct: 18, otherPct: 0 },
    lighting: { status: 'computed', litCoveragePct: null, isLit: true }, computedAt: null, source: 'osm_overpass_v1',
  },
  nearbyAmenities: [{ amenityId: 'w', category: 'drinking_water', distanceFromPathMeters: 4, location: { lat: 32.006, lng: 34.8 } }],
} as unknown as Route;
const noop = () => {};

describe('RouteOverviewDrawer (M-5a)', () => {
  let html = '';
  beforeAll(() => {
    html = renderToStaticMarkup(
      <RouteOverviewDrawer route={route} initialActivity="walking" userLocation={{ lat: 32, lng: 34.8 }} onBack={noop} onStart={noop} onNavigate={noop} />,
    );
  });
  it('header: name · time incl. the walk there and back · distance · finish', () => {
    expect(html).toContain('לולאת הירקון');
    expect(html).toContain('33 דק׳');          // 25 run + 4 + 4
    expect(html).toContain('4.2 ק״מ');
    expect(html).toContain('מסיים ~09:13');
    expect(html).toContain('הלוך וחזור · כולל 8 דק׳ הליכה אל המסלול וממנו');
  });
  it('the activity trio with per-activity time; the route own type is selected', () => {
    expect(html).toContain('aria-label="בחירת פעילות"');
    expect(html).toContain('הליכה · 50׳');
    expect(html).toMatch(/aria-pressed="true"[^>]*>(?:(?!<\/button>).)*ריצה · 25׳/);
    expect(html).toContain('רכיבה · 13׳');
  });
  it('פירוט row carries the difficulty bolts; ONE leg on the axis; one gradient CTA', () => {
    expect(html).toContain('פירוט');
    expect(html).toContain('מהלך המסלול');
    expect(html.split('ריצה · לולאת הירקון').length - 1).toBe(1);
    expect(html).toContain('הליכה אל המסלול');
    expect(html).toContain('הליכה חזרה');
    expect(html).toContain('מסלול מעגלי — חוזר לנקודת ההתחלה');
    expect(html).toContain('aria-expanded="false"');
    expect(html.split('bg-v2-cta').length - 1).toBe(1);
    expect(html).toContain('התחל ריצה');
    expect(html).toContain('aria-label="ניווט למסלול"');
  });
  it('no walk time known → no transport legs, no round-trip pill', () => {
    mapState.walkToRouteMinutes = null;
    const h = renderToStaticMarkup(<RouteOverviewDrawer route={route} onBack={noop} onStart={noop} />);
    mapState.walkToRouteMinutes = 4;
    expect(h).not.toContain('הליכה אל המסלול');
    expect(h).not.toContain('הלוך וחזור');
    expect(h).toContain('25 דק׳');
  });
});

describe('RouteLegDetail (M-5b)', () => {
  const html = renderToStaticMarkup(<RouteLegDetail route={route} calories={310} />);
  it('lighting, dedicated path, ascent, calories', () => {
    expect(html).toContain('מואר');
    expect(html).toContain('שביל ייעודי 72%');
    expect(html).toContain('18 מ׳ עלייה');
    expect(html).toContain('310');
  });
  it('elevation profile from the stored samples + points with km from the start', () => {
    expect(html).toContain('פרופיל גובה');
    expect(html).toContain('שיא 40 מ׳');
    expect(html).toContain('לאורך המסלול · ק״מ מההתחלה');
    expect(html).toContain('התחלה');
    expect(html).toContain('ברזייה');
  });
});

describe('RouteOverviewCompactCard (M-5e)', () => {
  it('focused: name, bolts, time · distance · finish, inset strip, the gradient start', () => {
    const html = renderToStaticMarkup(<RouteOverviewCompactCard route={route} activity="running" isActive onOpen={noop} onStart={noop} />);
    expect(html).toContain('לולאת הירקון');
    expect(html).toContain('25 דק׳');
    expect(html).toContain('מסיים ~09:05');
    expect(html).toContain('bg-v2-surface ring-1 ring-inset ring-v2-hairline');
    expect(html).toContain('bg-v2-cta');
    expect(html).toContain('התחל ריצה');
  });
  it('not focused: a white "choose" pill, no gradient', () => {
    const html = renderToStaticMarkup(<RouteOverviewCompactCard route={route} activity="running" isActive={false} onOpen={noop} onStart={noop} />);
    expect(html).toContain('בוחרים את המסלול הזה'); // gender batch 2: unknown gender → neutral
    expect(html).not.toContain('bg-v2-cta');
  });
});

describe('OverviewLegAxis — group leg', () => {
  it('a repeated block is ONE card with the repeat badge and one rep of rows', () => {
    const html = renderToStaticMarkup(
      <OverviewLegAxis v2 legs={[{
        kind: 'group', key: 'main', title: 'העיקר', repeat: 6, activity: 'running',
        rows: [
          { key: 'w', tone: 'work', label: '400 מ׳ מהיר', paceText: '4:50–5:05 /ק״מ' },
          { key: 'r', tone: 'recovery', label: '200 מ׳ הליכה' },
        ],
      }]} />,
    );
    expect(html.split('העיקר').length - 1).toBe(1);
    expect(html).toContain('6×');
    expect(html.split('400 מ׳ מהיר').length - 1).toBe(1);
    expect(html).toContain('4:50–5:05 /ק״מ');
    expect(html).toContain('rounded-[18px] bg-v2-surface'); // the superset enclosure
  });
});

describe('OverviewDrawerShell — graphs slot', () => {
  it('one page → a card, no dots; several → dots', () => {
    const one = renderToStaticMarkup(<OverviewDrawerShell v2 onBack={noop} header="h" cta="c" graphs={[<span key="a">גרף</span>]}>x</OverviewDrawerShell>);
    expect(one).toContain('גרף');
    expect(one).not.toContain('w-[18px] bg-v2-accent');
    const two = renderToStaticMarkup(<OverviewDrawerShell v2 onBack={noop} header="h" cta="c" graphs={[<span key="a">1</span>, <span key="b">2</span>]}>x</OverviewDrawerShell>);
    expect(two).toContain('w-[18px] bg-v2-accent');
    const none = renderToStaticMarkup(<OverviewDrawerShell v2 onBack={noop} header="h" cta="c">x</OverviewDrawerShell>);
    expect(none).not.toContain('snap-mandatory');
  });
});
