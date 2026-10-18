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
