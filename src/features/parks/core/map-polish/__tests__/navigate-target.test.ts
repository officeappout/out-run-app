import { describe, it, expect } from 'vitest';
import { liveUserTarget, navigationRequest, parkTarget, routeStartTarget } from '../navigate-target';
import { FLAG_DEFS, FIRESTORE_FLAG_DEFAULTS } from '@/hooks/feature-flag-defs';

describe('routeStartTarget', () => {
  it('the trailhead = the first path point, [lng, lat], with the route name', () => {
    expect(routeStartTarget({ path: [[34.78, 32.08], [34.79, 32.09]], name: ' לולאת הירקון ' }))
      .toEqual({ coords: [34.78, 32.08], label: 'לולאת הירקון' });
  });
  it('a one-point path is still a destination; no name → no label', () => {
    expect(routeStartTarget({ path: [[34.78, 32.08]] })).toEqual({ coords: [34.78, 32.08] });
  });
  it('no path / broken first point → null', () => {
    expect(routeStartTarget(null)).toBeNull();
    expect(routeStartTarget({ path: [] })).toBeNull();
    expect(routeStartTarget({ path: [[null, null]] })).toBeNull();
    expect(routeStartTarget({ path: [[NaN, 32]] })).toBeNull();
    expect(routeStartTarget({ path: 'x' })).toBeNull();
  });
});

describe('parkTarget', () => {
  it('the park location as [lng, lat]', () => {
    expect(parkTarget({ location: { lat: 32.1, lng: 34.8 }, name: 'גינת מאיר' }))
      .toEqual({ coords: [34.8, 32.1], label: 'גינת מאיר' });
  });
  it('missing / invalid location → null', () => {
    expect(parkTarget({ name: 'x' })).toBeNull();
    expect(parkTarget({ location: { lat: null, lng: 34 } })).toBeNull();
    expect(parkTarget({ location: { lat: 132, lng: 34 } })).toBeNull();
  });
});

describe('liveUserTarget', () => {
  const live = { uid: 'u2', name: 'דנה', liveLocation: { lat: 32.07, lng: 34.77 } };
  it('a live user sharing a position → their position', () => {
    expect(liveUserTarget(live, { selfUid: 'u1', liveUsersVisible: true }))
      .toEqual({ coords: [34.77, 32.07], label: 'דנה' });
  });
  it('no shared position, live users hidden, or the viewer → no button', () => {
    expect(liveUserTarget({ uid: 'u2', name: 'דנה' }, { selfUid: 'u1', liveUsersVisible: true })).toBeNull();
    expect(liveUserTarget({ ...live, liveLocation: null }, { selfUid: 'u1', liveUsersVisible: true })).toBeNull();
    expect(liveUserTarget(live, { selfUid: 'u1', liveUsersVisible: false })).toBeNull();
    expect(liveUserTarget(live, { selfUid: 'u2', liveUsersVisible: true })).toBeNull();
    expect(liveUserTarget(null, { liveUsersVisible: true })).toBeNull();
  });
});

describe('navigationRequest', () => {
  it('off the map → queue + go to /map', () => {
    expect(navigationRequest({ pathname: '/home', hostMounted: false })).toEqual({ kind: 'commute', goToMap: true });
    expect(navigationRequest({ pathname: null, hostMounted: false })).toEqual({ kind: 'commute', goToMap: true });
  });
  it('on the map with Discover up → queue in place', () => {
    expect(navigationRequest({ pathname: '/map', hostMounted: true })).toEqual({ kind: 'commute', goToMap: false });
  });
  it('on the map with Discover down (live workout …) → unavailable', () => {
    expect(navigationRequest({ pathname: '/map', hostMounted: false })).toEqual({ kind: 'unavailable' });
  });
});

describe('enable_map_polish_v1 flag', () => {
  it('fail-closed, super admins preview it', () => {
    const def = FLAG_DEFS.find((d) => d.firestoreKey === 'enable_map_polish_v1');
    expect(def?.key).toBe('enableMapPolishV1');
    expect(def?.defaultValue).toBe(false);
    expect(def?.superAdminValue).toBe(true);
    expect(FIRESTORE_FLAG_DEFAULTS.enable_map_polish_v1).toBe(false);
  });
});
