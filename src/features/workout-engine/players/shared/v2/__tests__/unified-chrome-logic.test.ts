import { describe, expect, it } from 'vitest';
import {
  GPS_LOST_AFTER_MS, UNIFIED_BUTTONS, UNIFIED_PACE_TONE, clampPage, comparesPace, currentLapView, drawerPagesFor, pageAfterSwipe,
  arrivalDue, routeEndDue, unifiedGps, unifiedPaceTone,
} from '../run-chrome/unified-chrome-logic';

describe('arrival sheet', () => {
  const base = { situation: 'nav' as const, hasArrived: true, toRouteStart: false, dismissed: false };
  it('shows on arrival in navigation', () => {
    expect(arrivalDue(base)).toBe(true);
  });
  it('not before arrival, not on the walk to a route start, not on other situations', () => {
    expect(arrivalDue({ ...base, hasArrived: false })).toBe(false);
    expect(arrivalDue({ ...base, toRouteStart: true })).toBe(false);
    expect(arrivalDue({ ...base, situation: 'free_walk' })).toBe(false);
    expect(arrivalDue({ ...base, dismissed: true })).toBe(false);
  });
});

describe('gps mark', () => {
  const now = 1_000_000;
  it('searching before the first good fix', () => {
    expect(unifiedGps({ status: 'searching', hasHadGoodFix: false, lastFixAt: null, now })).toBe('searching');
  });
  it('weak on poor accuracy', () => {
    expect(unifiedGps({ status: 'poor', hasHadGoodFix: true, lastFixAt: now - 1000, now })).toBe('weak');
  });
  it('lost when samples stop after a good fix', () => {
    expect(unifiedGps({ status: 'good', hasHadGoodFix: true, lastFixAt: now - GPS_LOST_AFTER_MS - 1, now })).toBe('lost');
  });
  it('ok on a fresh good fix and in simulation', () => {
    expect(unifiedGps({ status: 'good', hasHadGoodFix: true, lastFixAt: now - 2000, now })).toBe('ok');
    expect(unifiedGps({ status: 'simulated', hasHadGoodFix: false, lastFixAt: null, now })).toBe('ok');
  });
});

describe('route end', () => {
  it('fires at the route length, then again after one more loop', () => {
    expect(routeEndDue(4.1, 4.2, 1)).toBe(false);
    expect(routeEndDue(4.16, 4.2, 1)).toBe(true);
    expect(routeEndDue(5.0, 4.2, 2)).toBe(false);
    expect(routeEndDue(8.4, 4.2, 2)).toBe(true);
  });
  it('never without a route length', () => {
    expect(routeEndDue(10, null, 1)).toBe(false);
    expect(routeEndDue(10, 0, 1)).toBe(false);
  });
});

describe('pace colour', () => {
  it('green in range, orange on both sides', () => {
    expect(unifiedPaceTone('in')).toBe(UNIFIED_PACE_TONE.in);
    expect(unifiedPaceTone('fast')).toBe(UNIFIED_PACE_TONE.out);
    expect(unifiedPaceTone('slow')).toBe(UNIFIED_PACE_TONE.out);
    expect(unifiedPaceTone(null)).toBeUndefined();
  });
  it('recovery legs compare the pace only in the unified frame', () => {
    expect(comparesPace('recovery', true)).toBe(true);
    expect(comparesPace('recovery', false)).toBe(false);
    expect(comparesPace('pace', false)).toBe(true);
    expect(comparesPace('effort', true)).toBe(false);
  });
});

describe('page swipe', () => {
  it('RTL: swipe right = next page, swipe left = back', () => {
    expect(pageAfterSwipe(0, 2, 80, 5, true)).toBe(1);
    expect(pageAfterSwipe(1, 2, -80, 5, true)).toBe(0);
  });
  it('LTR mirrors it', () => {
    expect(pageAfterSwipe(0, 2, -80, 5, false)).toBe(1);
  });
  it('ignores short or vertical moves and single pages', () => {
    expect(pageAfterSwipe(0, 2, 20, 0, true)).toBe(0);
    expect(pageAfterSwipe(0, 2, 60, 80, true)).toBe(0);
    expect(pageAfterSwipe(0, 1, 120, 0, true)).toBe(0);
  });
  it('stays inside the list', () => {
    expect(pageAfterSwipe(1, 2, 80, 0, true)).toBe(1);
  });
});

describe('drawer pages per situation', () => {
  it('planned: this rep first, then the overview', () => {
    expect(drawerPagesFor('planned', { lapOn: true })).toEqual(['rep', 'general']);
  });
  it('free run with laps: overview, then the current lap', () => {
    expect(drawerPagesFor('free_run', { lapOn: true })).toEqual(['general', 'lap']);
  });
  it('walk, route and navigation: one page (no dots)', () => {
    expect(drawerPagesFor('free_walk', { lapOn: false })).toEqual(['general']);
    expect(drawerPagesFor('route', { lapOn: false })).toEqual(['general']);
    expect(drawerPagesFor('nav', { lapOn: false })).toEqual(['general']);
    expect(drawerPagesFor('free_run', { lapOn: false })).toEqual(['general']);
  });
});

describe('clampPage', () => {
  it('keeps the index inside the list', () => {
    expect(clampPage(3, 2)).toBe(1);
    expect(clampPage(-1, 2)).toBe(0);
    expect(clampPage(1, 0)).toBe(0);
  });
});

describe('current lap', () => {
  it('reads the active lap and its pace', () => {
    const v = currentLapView([
      { lapNumber: 1, distanceMeters: 1000, durationSeconds: 300, isActive: false },
      { lapNumber: 2, distanceMeters: 500, durationSeconds: 160, isActive: true },
    ]);
    expect(v).toEqual({ n: 2, durationSec: 160, distanceKm: 0.5, paceSec: 320 });
  });
  it('no pace until the lap has distance', () => {
    expect(currentLapView([{ lapNumber: 1, distanceMeters: 20, durationSeconds: 9, isActive: true }])!.paceSec).toBe(0);
  });
  it('null with no laps', () => {
    expect(currentLapView([])).toBeNull();
  });
});

describe('buttons', () => {
  it('has no black in the unified look', () => {
    const all = JSON.stringify(UNIFIED_BUTTONS).toLowerCase();
    expect(all).not.toMatch(/#0{3,6}\b|#04222b|#0e1419/);
  });
});
