import { describe, it, expect } from 'vitest';
import {
  routeActivities,
  routeMatchesActivity,
  routeHasActivity,
  isOnFootActivity,
} from '../route-activity-match';
import type { ActivityType } from '../../types/route.types';

const r = (o: { type?: ActivityType; activityType?: ActivityType; activityTypes?: ActivityType[] }) =>
  ({ type: o.type as ActivityType, activityType: o.activityType, activityTypes: o.activityTypes });

describe('route-activity-match — on-foot family', () => {
  it('walking matches a running-only route and running matches a walking-only route', () => {
    expect(routeMatchesActivity(r({ activityType: 'running' }), 'walking')).toBe(true);
    expect(routeMatchesActivity(r({ activityType: 'walking' }), 'running')).toBe(true);
  });

  it('reads activityTypes before activityType', () => {
    const route = r({ activityType: 'cycling', activityTypes: ['cycling', 'walking'] });
    expect(routeMatchesActivity(route, 'running')).toBe(true);
    expect(routeMatchesActivity(route, 'walking')).toBe(true);
  });

  it('falls back to `type` when activityType is missing', () => {
    expect(routeMatchesActivity(r({ type: 'walking' }), 'running')).toBe(true);
    expect(routeMatchesActivity(r({ type: 'cycling' }), 'running')).toBe(false);
  });

  it('empty activityTypes array falls back to activityType', () => {
    expect(routeActivities(r({ activityType: 'running', activityTypes: [] }))).toEqual(['running']);
  });

  it('a cycling-only route never matches walking or running', () => {
    expect(routeMatchesActivity(r({ activityType: 'cycling' }), 'walking')).toBe(false);
    expect(routeMatchesActivity(r({ activityType: 'cycling', activityTypes: ['cycling'] }), 'running')).toBe(false);
  });

  it('cycling keeps the strict primary-activity rule (unchanged behaviour)', () => {
    expect(routeMatchesActivity(r({ activityType: 'cycling' }), 'cycling')).toBe(true);
    expect(routeMatchesActivity(r({ activityType: 'running' }), 'cycling')).toBe(false);
    // activityTypes listing cycling does NOT change cycling matching — out of scope.
    expect(routeMatchesActivity(r({ activityType: 'running', activityTypes: ['running', 'cycling'] }), 'cycling')).toBe(false);
  });

  it('untyped routes do not match and report no activity', () => {
    expect(routeMatchesActivity(r({}), 'walking')).toBe(false);
    expect(routeHasActivity(r({}))).toBe(false);
    expect(routeHasActivity(r({ activityType: 'walking' }))).toBe(true);
  });

  it('isOnFootActivity', () => {
    expect(isOnFootActivity('walking')).toBe(true);
    expect(isOnFootActivity('running')).toBe(true);
    expect(isOnFootActivity('cycling')).toBe(false);
    expect(isOnFootActivity('workout')).toBe(false);
    expect(isOnFootActivity(undefined)).toBe(false);
  });
});

describe('cycling-fixes-v1 (enable_cycling_fixes_v1)', () => {
  const mixed = r({ activityType: 'walking', activityTypes: ['walking', 'running', 'cycling'] });
  const bikeOnly = r({ activityType: 'cycling', activityTypes: ['cycling'] });
  const walkOnly = r({ activityType: 'walking', activityTypes: ['walking', 'running'] });

  it('flag off (default): a mixed route is still hidden from cyclists — strict primary rule', () => {
    expect(routeMatchesActivity(mixed, 'cycling')).toBe(false);
    expect(routeMatchesActivity(mixed, 'cycling', false)).toBe(false);
  });

  it('flag on: a route whose activityTypes include cycling matches a cyclist even when its primary is walking', () => {
    expect(routeMatchesActivity(mixed, 'cycling', true)).toBe(true);
    expect(routeMatchesActivity(bikeOnly, 'cycling', true)).toBe(true);
  });

  it('flag on: a walking/running-only route still never matches a cyclist', () => {
    expect(routeMatchesActivity(walkOnly, 'cycling', true)).toBe(false);
    expect(routeMatchesActivity(r({ type: 'running' }), 'cycling', true)).toBe(false);
  });

  it('cycling-only routes never match walkers / runners, with the flag either way', () => {
    for (const flag of [false, true]) {
      expect(routeMatchesActivity(bikeOnly, 'walking', flag)).toBe(false);
      expect(routeMatchesActivity(bikeOnly, 'running', flag)).toBe(false);
    }
  });

  it('the flag does not change walking / running / workout matching', () => {
    for (const flag of [false, true]) {
      expect(routeMatchesActivity(mixed, 'walking', flag)).toBe(true);
      expect(routeMatchesActivity(walkOnly, 'running', flag)).toBe(true);
      expect(routeMatchesActivity(r({ activityType: 'workout' }), 'workout', flag)).toBe(true);
    }
  });
});
