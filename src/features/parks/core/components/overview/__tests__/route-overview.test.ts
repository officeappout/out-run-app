import { describe, it, expect } from 'vitest';
import {
  activityMinutes, initialRouteActivity, playerActivityFor, isLoopRoute, buildRouteLegs, routeWalkLegs,
  routeDetailChips, elevationSummary, elevationPaths, alongRoutePoints, routeDescription, cumulativeKm,
} from '../route/route-overview';
import { journeyItemsFromLegs, legColor, transportMinutes, type OverviewLeg } from '../overview-legs';
import { nextDetent, detentHeightPx } from '../overview-detents';

// ~1.1 km per 0.01° of latitude.
const line = (n: number, dLat = 0.001): [number, number][] => Array.from({ length: n }, (_, i) => [34.8, 32 + i * dLat]);
const loop: [number, number][] = [[34.8, 32], [34.81, 32], [34.81, 32.01], [34.8, 32.0005]];

describe('per-activity time (route editor table: walk 12 · run 6 · ride 3 min/km)', () => {
  it('4.2 km → 50 / 25 / 13 (board M-5a)', () => {
    expect(activityMinutes(4.2, 'walking')).toBe(50);
    expect(activityMinutes(4.2, 'running')).toBe(25);
    expect(activityMinutes(4.2, 'cycling')).toBe(13);
  });
  it('never 0, safe on bad input', () => {
    expect(activityMinutes(0, 'running')).toBe(1);
    expect(activityMinutes(Number.NaN, 'walking')).toBe(1);
  });
});

describe('activity', () => {
  it('the route own type wins, then the fallback, then running', () => {
    expect(initialRouteActivity({ activityType: 'cycling', type: 'running' }, 'walking')).toBe('cycling');
    expect(initialRouteActivity({ type: 'workout' }, 'walking')).toBe('walking');
    expect(initialRouteActivity({ type: 'workout' }, 'workout')).toBe('running');
  });
  it('the player has walk/run modes — a ride runs as a run (like FreeRunDrawer)', () => {
    expect(playerActivityFor('walking')).toBe('walking');
    expect(playerActivityFor('running')).toBe('running');
    expect(playerActivityFor('cycling')).toBe('running');
  });
});

describe('loop detection', () => {
  it('stored shape first', () => {
    expect(isLoopRoute({ routeShape: 'point_to_point', path: loop })).toBe(false);
    expect(isLoopRoute({ routeShape: 'loop', path: line(5) })).toBe(true);
  });
  it('otherwise the path closure (≤150 m)', () => {
    expect(isLoopRoute({ path: loop })).toBe(true);
    expect(isLoopRoute({ path: line(20) })).toBe(false);
  });
});

describe('route legs', () => {
  const route = { name: 'לולאת הירקון', distance: 4.2, routeShape: 'loop' as const, path: loop };
  it('ONE expandable aerobic leg, standard layout, pace pill for run, loop note', () => {
    const legs = buildRouteLegs(route, 'running', null);
    expect(legs).toHaveLength(1);
    const leg = legs[0];
    expect(leg.kind).toBe('aerobic');
    if (leg.kind !== 'aerobic') return;
    expect(leg.title).toBe('ריצה · לולאת הירקון');
    expect(leg.badge).toBe('ריצה');
    expect(leg.meta.map((m) => m.text)).toEqual(['4.2 ק״מ', '25 דק׳']);
    expect(leg.paceSecPerKm).toBe(360);
    expect(leg.loopNote).toBe(true);
    expect(leg.expandable).toBe(true);
  });
  it('a ride has no pace pill', () => {
    const leg = buildRouteLegs(route, 'cycling', null)[0];
    expect(leg.kind === 'aerobic' && leg.paceSecPerKm).toBeFalsy();
  });
  it('walk there / back become transport legs around it', () => {
    const legs = buildRouteLegs(route, 'walking', { thereMin: 4, backMin: 4 });
    expect(legs.map((l) => l.kind)).toEqual(['transport', 'aerobic', 'transport']);
    expect(transportMinutes(legs, 'there')).toBe(4);
    expect(journeyItemsFromLegs(legs).map((i) => [i.kind, i.seconds])).toEqual([['transport', 240], ['aerobic', 3000], ['transport', 240]]);
  });
  it('walk legs: only with a real walk time; back only on a loop', () => {
    expect(routeWalkLegs(null, true)).toBeNull();
    expect(routeWalkLegs(0, true)).toBeNull();
    expect(routeWalkLegs(4.4, true)).toEqual({ thereMin: 4, backMin: 4 });
    expect(routeWalkLegs(6, false)).toEqual({ thereMin: 6, backMin: 0 });
  });
});

describe('leg details', () => {
  it('positive / known signals only', () => {
    expect(routeDetailChips({}, null)).toEqual([]);
    const chips = routeDetailChips({
      elevationGain: 18.4,
      qualitySignals: {
        composition: { sidewalkPct: 10, genuinePct: 72, ordinaryPct: 18, otherPct: 0 },
        lighting: { status: 'computed', litCoveragePct: null, isLit: true },
        computedAt: null, source: 'osm_overpass_v1',
      },
    }, null);
    expect(chips.map((c) => c.label)).toEqual(['מואר', 'שביל ייעודי 72%', '18 מ׳ עלייה']);
    // unverified lighting never claims "lit"
    expect(routeDetailChips({ qualitySignals: { composition: { sidewalkPct: 0, genuinePct: 0, ordinaryPct: 0, otherPct: 0 }, lighting: { status: 'unknown', litCoveragePct: null, isLit: null }, computedAt: null, source: 'osm_overpass_v1' } }, null)).toEqual([]);
  });
  it('ascent falls back to the profile gain', () => {
    const chips = routeDetailChips({}, { stepM: 100, elevationsM: [10, 20, 15, 30] });
    expect(chips).toEqual([{ key: 'ascent', label: '25 מ׳ עלייה' }]);
  });
});

describe('elevation', () => {
  const s = { stepM: 100, elevationsM: [10, 10, 12, 30, 40, 38, 20, 12, 10] };
  it('summary: min / max / gain and the steepest quarter', () => {
    const sum = elevationSummary(s);
    expect(sum).toMatchObject({ minM: 10, maxM: 40, gainM: 30, lengthKm: 0.8 });
    expect(sum.climb).toEqual({ fromKm: 0.2, toKm: 0.4, riseM: 28 });
  });
  it('flat → no highlight', () => {
    expect(elevationSummary({ stepM: 50, elevationsM: [5, 6, 5, 6] }).climb).toBeNull();
  });
  it('RTL: the start is at x = W', () => {
    const { line: d, highlight } = elevationPaths(s, 270, 50);
    expect(d.startsWith('M270 ')).toBe(true);
    expect(d.endsWith(' L0 48')).toBe(true);
    expect(highlight!.x).toBeGreaterThanOrEqual(0);
    expect(highlight!.width).toBeGreaterThan(0);
  });
});

describe('along the route', () => {
  const path = line(11); // ~1.1 km straight north
  const cum = cumulativeKm(path);
  it('cumulative km grows monotonically', () => {
    expect(cum[0]).toBe(0);
    expect(cum[10]).toBeCloseTo(1.11, 1);
  });
  it('start + stops + amenities by km, same-label neighbours collapse, crossings skipped, capped', () => {
    const at = (i: number) => ({ lat: path[i][1], lng: path[i][0] });
    const pts = alongRoutePoints({
      path,
      facilityStops: [{ id: 's1', name: 'גינת כושר רוקח', lat: 0, lng: 0, waypointIndex: 6, priority: 'high' as never, type: 'gym', stopType: 'pit-stop' }],
      nearbyAmenities: [
        { amenityId: 'w1', category: 'drinking_water', distanceFromPathMeters: 5, location: at(3) },
        { amenityId: 'w2', category: 'drinking_water', distanceFromPathMeters: 5, location: at(4) },
        { amenityId: 'x', category: 'crossing', distanceFromPathMeters: 1, location: at(2) },
        { amenityId: 'b1', category: 'bench', distanceFromPathMeters: 3, location: at(9) },
      ],
    });
    expect(pts.map((p) => p.label)).toEqual(['התחלה', 'ברזייה', 'גינת כושר רוקח', 'ספסלים']);
    expect(pts.map((p) => +p.km.toFixed(1))).toEqual([0, 0.3, 0.7, 1]);
    expect(alongRoutePoints({ path, nearbyAmenities: [] })).toEqual([]);
  });
});

describe('description', () => {
  it('own prose first, else a neutral line', () => {
    expect(routeDescription({ description: ' שביל לאורך הנחל ', distance: 3 })).toBe('שביל לאורך הנחל');
    expect(routeDescription({ distance: 4.21 }, 'תל אביב')).toBe('מסלול של 4.2 ק״מ, בתל אביב.');
  });
});

describe('leg model', () => {
  const group: OverviewLeg = {
    kind: 'group', key: 'main', title: 'העיקר', repeat: 6, activity: 'running', durationSec: 900,
    stripLabel: '6 × 400 מ׳',
    rows: [{ key: 'w', tone: 'work', label: '400 מ׳ מהיר', paceText: '4:50–5:05' }, { key: 'r', tone: 'recovery', label: '200 מ׳ הליכה' }],
  };
  it('a group is ONE strip item (repeat) — never one per rep', () => {
    expect(journeyItemsFromLegs([group])).toEqual([{ key: 'main', kind: 'repeat', subtype: 'running', seconds: 900, label: '6 × 400 מ׳' }]);
  });
  it('stations are cyan on the spine, everything that moves is green', () => {
    expect(legColor({ kind: 'station', key: 's', ref: 0 })).not.toBe(legColor(group));
  });
});

describe('detents (moved from HybridOverviewScreen)', () => {
  it('peek is a fixed 220px, capped at half the screen', () => {
    expect(detentHeightPx('peek', 844)).toBe(220);
    expect(detentHeightPx('peek', 400)).toBe(200);
    expect(detentHeightPx('half', 1000)).toBe(550);
  });
  it('directional step: pull up +1, pull down −1, nudge stays, strong flick jumps', () => {
    expect(nextDetent('half', 0, -40)).toBe('full');
    expect(nextDetent('half', 0, 40)).toBe('peek');
    expect(nextDetent('half', 0, 10)).toBe('half');
    expect(nextDetent('full', 1200, 10)).toBe('peek');
    expect(nextDetent(null, 0, 0)).toBe('half');
  });
});
