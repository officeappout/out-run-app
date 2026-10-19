/**
 * Owner device report 19.10.2026 — "הליכה + כוח" (smart walk through the park):
 *   1. the drawn loop did not pass through the park whose photo marker was shown;
 *   3. the strength block was push-only (the session's strength was split over several parks
 *      the generic stop search found near the loop — the 3-station template gives one of them
 *      push alone);
 *   4. "רכיבה" + strength stations came out as "ריצה + כוח".
 * Pure parts only (no I/O): the walk geometry, the stop anchoring, the ride sizing/labels and
 * the route + stops card gate.
 */
import { describe, it, expect } from 'vitest';
import type { Park } from '@/features/parks/core/types/park.types';
import { haversineMeters } from '@/features/parks/core/services/geoUtils';
import {
  assembleSmartWalkPath, anchorStopsToPark, PARK_REACH_M,
} from '../smart-walk-backbone';
import type { ResolvedRouteStop } from '../../route-stops.service';
import { planRouteStations } from '../../compose-hybrid-session.service';
import { drawerIntentToSmart } from '../drawer-smart-intent';
import { smartComposeBudgetMin, walkMinutes } from '../smart-sizing';
import { deriveAerobicTargetKm } from '../../hybrid-aerobic.util';
import { aerobicKindLabel, hybridSessionTitle, safeBasePaceSecPerKm, toRuntimeAerobicKind } from '../../aerobic-kind';
import { rankRouteStops } from '../rank-hybrid-cards';
import { sessionTypesForRoute } from '../route-session-types';
import type { HybridSituation } from '../situation.types';

type LngLat = [number, number];
// Real Tel Aviv geometry: a user ~450 m north-west of the Dubnov fitness park.
const PARK = { lat: 32.07824, lng: 34.78410 };
const USER: LngLat = [34.7810, 32.0815];
const near = (a: LngLat, b: { lat: number; lng: number }) => haversineMeters(a[1], a[0], b.lat, b.lng);

/** A street walk user → park whose last vertex is `endGapM` short of the park (Mapbox snaps to a road). */
function streetWalk(endGapM: number): LngLat[] {
  const n = 8;
  const end: LngLat = [PARK.lng, PARK.lat + endGapM / 111_000];
  return Array.from({ length: n + 1 }, (_, i) => [USER[0] + (end[0] - USER[0]) * (i / n), USER[1] + (end[1] - USER[1]) * (i / n)] as LngLat);
}
/** A ~1.5 km loop whose closest vertex is `offsetM` from the park. */
function loopAround(offsetM: number): LngLat[] {
  const c = { lat: PARK.lat - (offsetM + 250) / 111_000, lng: PARK.lng };
  const r = 250 / 111_000;
  const ring = Array.from({ length: 24 }, (_, i) => {
    const a = (i / 24) * 2 * Math.PI + Math.PI / 2; // start at the top (closest to the park)
    return [c.lng + (r * Math.cos(a)) / Math.cos((c.lat * Math.PI) / 180), c.lat + r * Math.sin(a)] as LngLat;
  });
  return [...ring, ring[0]];
}

describe('smart walk visits the park (bug 1)', () => {
  it('the street walk ends 90 m short of the park → the line steps into the park; the station vertex IS the park', () => {
    const walk = assembleSmartWalkPath({ outbound: streetWalk(90), park: PARK, loop: loopAround(60) })!;
    expect(walk).not.toBeNull();
    expect(walk.loopUsed).toBe(true);
    expect(near(walk.routePath[walk.anchorIndex], PARK)).toBeLessThan(1);
    // starts and ends at the user
    expect(walk.routePath[0]).toEqual(USER);
    expect(walk.routePath[walk.routePath.length - 1]).toEqual(USER);
  });

  it('the park is not reachable on foot (walk ends > reach) → no backbone (no card that skips the park)', () => {
    expect(assembleSmartWalkPath({ outbound: streetWalk(PARK_REACH_M + 150), park: PARK, loop: null })).toBeNull();
  });

  it('a loop that does not pass the park is dropped (out-and-back to the park instead of a teleport join)', () => {
    const walk = assembleSmartWalkPath({ outbound: streetWalk(20), park: PARK, loop: loopAround(900) })!;
    expect(walk.loopUsed).toBe(false);
    // every hop on the line is a real step (no 900 m jump from the park to a far loop)
    for (let i = 1; i < walk.routePath.length; i++) {
      expect(near(walk.routePath[i], { lng: walk.routePath[i - 1][0], lat: walk.routePath[i - 1][1] })).toBeLessThan(200);
    }
  });
});

describe('the smart walk has ONE station: the park it goes through (bugs 1 + 3)', () => {
  const stopAt = (id: string, wp: number, dist: number): ResolvedRouteStop => ({
    stopId: `poi:${id}`, parkId: id, locationKind: 'gym', lat: 0, lng: 0, waypointIndex: wp,
    availableEquipment: ['pullup_bar'], activityType: 'strength', cooldownEligible: false, distToPathM: dist, name: id,
  });
  const anchor = { parkId: 'dubnov', lat: PARK.lat, lng: PARK.lng, waypointIndex: 9 };

  it('keeps only the anchor park, placed where the walk reaches it; other parks near the line are walked past', () => {
    const raw = [stopAt('zisso', 4, 160), stopAt('dubnov', 30, 12), stopAt('germanis', 22, 170)];
    const stops = anchorStopsToPark(raw, anchor);
    expect(stops.map((s) => s.parkId)).toEqual(['dubnov']);
    expect(stops[0].waypointIndex).toBe(9);
    expect(stops[0].distToPathM).toBe(0);
  });

  it('the anchor park missing from the generic search (deduped) → built from the park itself', () => {
    const park = {
      id: 'dubnov', name: 'גינת כושר דובנוב', location: PARK, facilityType: 'gym_park', hasUsableEquipment: true,
    } as unknown as Park;
    const stops = anchorStopsToPark([stopAt('zisso', 4, 160)], anchor, park);
    expect(stops).toHaveLength(1);
    expect(stops[0]).toMatchObject({ parkId: 'dubnov', activityType: 'strength', waypointIndex: 9, availableEquipment: [] });
  });

  it('three parks near the loop + 30 strength minutes used to give a push-only station; one anchor station trains all four domains', () => {
    const domains = ['push', 'pull', 'legs', 'core'];
    const cand = (id: string, km: number) => ({
      candidate: { stopId: id, locationKind: 'gym' as const, lat: 0, lng: 0, waypointIndex: 0, availableEquipment: ['pullup_bar'], activityType: 'strength' as const },
      km,
    });
    // Before: every park the generic search found was a candidate → 3 stations, one of them push only.
    const before = planRouteStations({
      candidatesByKm: [cand('a', 0.6), cand('b', 1.2), cand('c', 1.8)], routeKm: 2.4, walkSecPerKm: 600,
      timeBudgetMin: 54, targetDomains: domains, log: [],
    });
    expect(before.chosen.some((c) => c.domains?.length === 1 && c.domains[0] === 'push')).toBe(true);
    // After: the anchor park is the only candidate → one full-body station.
    const after = planRouteStations({
      candidatesByKm: [cand('dubnov', 0.6)], routeKm: 2.4, walkSecPerKm: 600,
      timeBudgetMin: 54, targetDomains: domains, log: [],
    });
    expect(after.chosen).toHaveLength(1);
    expect(after.chosen[0].domains?.sort()).toEqual(['core', 'legs', 'pull', 'push']);
  });
});

describe('a ride stays a ride (bug 4)', () => {
  it('labels and titles', () => {
    expect(aerobicKindLabel('cycling')).toBe('רכיבה');
    expect(aerobicKindLabel('walking')).toBe('הליכה');
    expect(aerobicKindLabel('running')).toBe('ריצה');
    expect(hybridSessionTitle('cycling')).toBe('רכיבה + כוח');
    expect(hybridSessionTitle('walking')).toBe('הליכה + כוח');
    expect(toRuntimeAerobicKind('cycling')).toBe('running');
  });

  it('drawer: 45 min, 33% aerobic, ride → ~5 km at 20 km/h (not a 2.3 km run)', () => {
    const smart = drawerIntentToSmart(
      { timeBudgetMin: 45, aerobicShare: 0.33, emphasis: 'strength', aerobicKind: 'cycling' }, 'park1', 0,
    );
    expect(smart.aerobicKind).toBe('cycling');
    expect(smart.smart?.targetKm).toBeCloseTo(5, 0);
    expect(smart.smart?.strengthMin).toBe(30);
  });

  it('ride minutes and budgets use 3 min/km', () => {
    expect(walkMinutes(10, 'cycling')).toBe(30);
    expect(smartComposeBudgetMin(5, 'cycling', 30)).toBe(45);
    expect(deriveAerobicTargetKm({ timeBudgetMin: 45, aerobicShare: 0.33, aerobicKind: 'cycling' }, 0)).toBeCloseTo(4.95, 1);
  });

  it('a 0 base pace is never used as a pace', () => {
    expect(safeBasePaceSecPerKm(0)).toBe(390);
    expect(safeBasePaceSecPerKm(undefined)).toBe(390);
    expect(safeBasePaceSecPerKm(330)).toBe(330);
  });
});

describe('route + stops card needs a strength stop (bug 2)', () => {
  const sit = (strengthStopCount: number): HybridSituation => ({
    hasGps: true, aerobicKind: 'walking', nearestEquippedPark: null, steps: null, strength: null,
    todayScheduled: 'none', hasStrengthProgram: true, hour: 10,
    flags: { walkStrength: true, fullPark: true, routeStops: true },
    routesWithStops: [{
      routeId: 'r1', name: 'טיילת', distanceFromUserM: 100, focused: false, stopCount: 2, strengthStopCount,
      sessionTypes: sessionTypesForRoute({ stopCount: 2, strengthStopCount }),
    }],
  });
  it('only view / stretch stops → no card; with a strength stop → card', () => {
    expect(rankRouteStops(sit(0))).toBeNull();
    expect(rankRouteStops(sit(1))?.id).toBe('route_stops');
  });
});
