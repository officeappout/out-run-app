/**
 * Map places drawer — pure rules (enable_map_places_drawer_v1): nearby ranking, chip filtering,
 * row tags, the empty-state decision, the generator's activity, and the catalog → places build.
 */
import { describe, expect, it } from 'vitest';
import type { Park } from '@/features/parks/core/types/park.types';
import type { PlaceWorkoutSuggestion } from '@/features/workout-engine/place-fit';
import { at, makeRoute, ORIGIN, squareLoop } from '@/features/workout-engine/players/running/lib/route-fit/__tests__/fixtures';
import {
  drawerBody, filterPlacesByChip, generatorActivityFor, nearbyPlaces, placeTags, styleMatchesChip,
  MAX_PLACES, WALK_RANGE_M,
} from '../places-drawer.logic';
import { buildNearbyPlaces, isOnFootRoute, isTrainingPark } from '../nearby-places';
import { hudBottomAboveDrawerCss, placesDrawerHeightCss, PLACES_DRAWER_PEEK_PX } from '../places-drawer.layout';

const sug = (over: Partial<PlaceWorkoutSuggestion>): PlaceWorkoutSuggestion => ({
  id: 'x', style: 'strength', isFromPlan: false, planTitle: null, durationMin: 20,
  meta: { kind: 'park_workout' }, reason: 'equipment',
  start: { kind: 'park_strength', parkId: 'p', difficulty: 'medium', minutes: 20 }, ...over,
});

const park = (id: string, eastM: number, over: Partial<Park> = {}): Park => {
  const [lng, lat] = at(eastM, 0);
  return { id, name: id, location: { lat, lng }, hasUsableEquipment: true, ...over } as Park;
};

describe('nearbyPlaces', () => {
  it('keeps the walking range, nearest first, ties by key, capped', () => {
    const items = [
      { key: 'b', distanceM: 300 }, { key: 'a', distanceM: 300 }, { key: 'far', distanceM: WALK_RANGE_M + 1 },
      { key: 'c', distanceM: 50 }, { key: 'nan', distanceM: NaN },
    ];
    expect(nearbyPlaces(items).map((p) => p.key)).toEqual(['c', 'a', 'b']);
    const many = Array.from({ length: 20 }, (_, i) => ({ key: `p${i}`, distanceM: i * 10 }));
    expect(nearbyPlaces(many)).toHaveLength(MAX_PLACES);
  });
});

describe('chips', () => {
  it('each chip maps to its workout styles; "all" matches everything', () => {
    expect(styleMatchesChip('run_hills', 'run')).toBe(true);
    expect(styleMatchesChip('run_quality', 'run')).toBe(true);
    expect(styleMatchesChip('walk', 'run')).toBe(false);
    expect(styleMatchesChip('hybrid', 'hybrid')).toBe(true);
    expect(styleMatchesChip('strength', 'all')).toBe(true);
  });

  it('filters places by their workouts; "all" keeps places with no workouts yet', () => {
    const rows = [
      { id: 'park', styles: ['strength', 'hybrid'] as const },
      { id: 'route', styles: ['run_easy', 'walk'] as const },
      { id: 'bare', styles: [] as const },
    ];
    expect(filterPlacesByChip(rows, 'all').map((r) => r.id)).toEqual(['park', 'route', 'bare']);
    expect(filterPlacesByChip(rows, 'strength').map((r) => r.id)).toEqual(['park']);
    expect(filterPlacesByChip(rows, 'run').map((r) => r.id)).toEqual(['route']);
    expect(filterPlacesByChip(rows, 'hybrid').map((r) => r.id)).toEqual(['park']);
    expect(filterPlacesByChip(rows, 'walk').map((r) => r.id)).toEqual(['route']);
  });
});

describe('placeTags', () => {
  const list = [
    sug({ id: 'plan', style: 'strength', isFromPlan: true, durationMin: 20 }),
    sug({ id: 'h', style: 'hybrid', durationMin: 40 }),
    sug({ id: 'w', style: 'walk', durationMin: null }),
  ];
  it('top 2 in the engine order (plan first)', () => {
    expect(placeTags(list)).toEqual([
      { style: 'strength', minutes: 20, fromPlan: true },
      { style: 'hybrid', minutes: 40, fromPlan: false },
    ]);
  });
  it('a filter puts its kind first', () => {
    expect(placeTags(list, 'walk')[0]).toEqual({ style: 'walk', minutes: null, fromPlan: false });
  });
});

describe('drawerBody', () => {
  it('loading / no fix → loading; nothing near → generate; nothing for the chip → generate; else list', () => {
    expect(drawerBody({ loading: true, hasLocation: true, nearbyCount: 3, shownCount: 3 })).toEqual({ kind: 'loading' });
    expect(drawerBody({ loading: false, hasLocation: false, nearbyCount: 0, shownCount: 0 })).toEqual({ kind: 'loading' });
    expect(drawerBody({ loading: false, hasLocation: true, nearbyCount: 0, shownCount: 0 })).toEqual({ kind: 'generate', reason: 'none_near' });
    expect(drawerBody({ loading: false, hasLocation: true, nearbyCount: 2, shownCount: 0 })).toEqual({ kind: 'generate', reason: 'none_for_chip' });
    expect(drawerBody({ loading: false, hasLocation: true, nearbyCount: 2, shownCount: 1 })).toEqual({ kind: 'list' });
  });
});

describe('generatorActivityFor', () => {
  it('the chip wins; else walkers walk, everyone else runs', () => {
    expect(generatorActivityFor('walk', 'run')).toBe('walking');
    expect(generatorActivityFor('run', 'walk')).toBe('running');
    expect(generatorActivityFor('all', 'walk')).toBe('walking');
    expect(generatorActivityFor('hybrid', null)).toBe('running');
  });
});

describe('buildNearbyPlaces', () => {
  it('training parks + on-foot routes in walking range, nearest first, with the engine input', () => {
    const near = makeRoute({ id: 'loop', distance: 2, path: squareLoop(2000, 200) });
    const cycling = makeRoute({ id: 'bike', type: 'cycling', activityType: 'cycling', path: squareLoop(2000, 100) });
    const farRoute = makeRoute({ id: 'far', distance: 2, path: squareLoop(2000, 5000) });
    const parks = [
      park('gym', 150),
      park('plain', 100, { hasUsableEquipment: false, facilityType: 'zen_spot' }),
      park('fitness', 400, { hasUsableEquipment: false, facilityType: 'gym_park' }),
      park('farPark', 3000),
    ];
    const out = buildNearbyPlaces(parks, [near, cycling, farRoute], ORIGIN);
    expect(out.map((p) => p.key)).toEqual(['park:gym', 'route:loop', 'park:fitness']);
    const gym = out[0];
    expect(gym.kind === 'park' && gym.engine).toMatchObject({ kind: 'park', parkId: 'gym', equipment: [] });
    // The loop passes 50 m from the park → a hybrid is possible there (nearest route ≤ 400 m).
    expect(gym.kind === 'park' && gym.engine.nearestRouteKm).toBeLessThan(0.4);
    const loop = out[1];
    expect(loop.kind === 'route' && loop.km).toBe(2);
  });

  it('filters', () => {
    expect(isTrainingPark({ hasUsableEquipment: false, facilityType: 'court' })).toBe(false);
    expect(isOnFootRoute(makeRoute({ id: 'w', type: 'walking', activityType: 'walking' }))).toBe(true);
  });
});

describe('layout', () => {
  it('the HUD stacks above the drawer at its open / collapsed height', () => {
    expect(placesDrawerHeightCss(true)).toBe('40vh');
    expect(placesDrawerHeightCss(false)).toBe(`${PLACES_DRAWER_PEEK_PX}px`);
    expect(hudBottomAboveDrawerCss(true)).toContain('40vh');
    expect(hudBottomAboveDrawerCss(false)).toContain(`${PLACES_DRAWER_PEEK_PX}px`);
  });
});
