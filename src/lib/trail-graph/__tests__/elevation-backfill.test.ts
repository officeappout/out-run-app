import { describe, it, expect } from 'vitest';
import {
  addCounts, bboxOfPath, EMPTY_COUNTS, freshCheckpoint, hasValidElevationProfile, parseLimits, pathToLngLat, planRouteBackfill, resumeFrom,
} from '../elevation-backfill';

const PROFILE = { stepM: 10, elevationsM: [1, 2, 3] };

describe('pathToLngLat', () => {
  it('accepts the persisted {lng,lat} form and [lng,lat] tuples', () => {
    expect(pathToLngLat([{ lng: 34.5, lat: 31.5 }, { lng: 34.6, lat: 31.6 }])).toEqual([[34.5, 31.5], [34.6, 31.6]]);
    expect(pathToLngLat([[34.5, 31.5], [34.6, 31.6]])).toEqual([[34.5, 31.5], [34.6, 31.6]]);
  });
  it('rejects short, non-finite, out-of-range or malformed paths', () => {
    expect(pathToLngLat(undefined)).toBeNull();
    expect(pathToLngLat([{ lng: 34.5, lat: 31.5 }])).toBeNull();
    expect(pathToLngLat([{ lng: 34.5, lat: 31.5 }, { lng: NaN, lat: 31.5 }])).toBeNull();
    expect(pathToLngLat([{ lng: 34.5, lat: 95 }, { lng: 34.6, lat: 31.5 }])).toBeNull();
    expect(pathToLngLat([{ lng: '34.5', lat: 31.5 }, { lng: 34.6, lat: 31.5 }])).toBeNull();
  });
});

describe('hasValidElevationProfile — same bounds as the schema', () => {
  it('valid', () => expect(hasValidElevationProfile({ elevationProfile: PROFILE })).toBe(true));
  it('invalid / absent → needs a (re)write', () => {
    expect(hasValidElevationProfile({})).toBe(false);
    expect(hasValidElevationProfile({ elevationProfile: { stepM: 0, elevationsM: [1, 2] } })).toBe(false);
    expect(hasValidElevationProfile({ elevationProfile: { stepM: 10, elevationsM: [1] } })).toBe(false);
    expect(hasValidElevationProfile({ elevationProfile: { stepM: 10, elevationsM: [1, null] } })).toBe(false);
    expect(hasValidElevationProfile({ elevationProfile: { stepM: 10, elevationsM: Array(257).fill(1) } })).toBe(false);
  });
});

describe('planRouteBackfill', () => {
  const path = [{ lng: 34.5, lat: 31.5 }, { lng: 34.6, lat: 31.5 }];
  it('write: samples the route\'s own path', () => {
    let seen: unknown = null;
    const e = planRouteBackfill('r1', { name: 'א', path }, (p) => { seen = p; return PROFILE; });
    expect(seen).toEqual([[34.5, 31.5], [34.6, 31.5]]);
    expect(e).toMatchObject({ id: 'r1', name: 'א', status: 'write', pathPoints: 2, profile: PROFILE, minEleM: 1, maxEleM: 3 });
  });
  it('has_profile: never resampled (idempotent)', () => {
    const e = planRouteBackfill('r2', { path, elevationProfile: PROFILE }, () => { throw new Error('must not sample'); });
    expect(e.status).toBe('has_profile');
  });
  it('dem_gap: no guessed data', () => {
    expect(planRouteBackfill('r3', { path }, () => null).status).toBe('dem_gap');
  });
  it('bad_path', () => {
    expect(planRouteBackfill('r4', { path: [] }, () => PROFILE).status).toBe('bad_path');
  });
});

describe('counts, bbox, limits', () => {
  it('addCounts', () => {
    const c = addCounts(EMPTY_COUNTS, [
      { id: 'a', name: null, status: 'write', pathPoints: 2 },
      { id: 'b', name: null, status: 'dem_gap', pathPoints: 2 },
      { id: 'c', name: null, status: 'write', pathPoints: 2 },
    ]);
    expect(c).toEqual({ scanned: 3, write: 2, has_profile: 0, bad_path: 0, dem_gap: 1 });
    expect(EMPTY_COUNTS.scanned).toBe(0);
  });
  it('bboxOfPath', () => {
    expect(bboxOfPath([[34.5, 31.6], [34.7, 31.4]])).toEqual({ latMin: 31.4, lonMin: 34.5, latMax: 31.6, lonMax: 34.7 });
  });
  it('parseLimits: defaults and hard bounds', () => {
    expect(parseLimits(() => null)).toEqual({ pageSize: 100, maxRoutes: 5000, batchSize: 100, pauseMs: 1000 });
    expect(parseLimits((n) => (n === 'page-size' ? '50' : null)).pageSize).toBe(50);
    expect(() => parseLimits((n) => (n === 'batch-size' ? '1000' : null))).toThrow(/batch-size/);
    expect(() => parseLimits((n) => (n === 'max-routes' ? 'lots' : null))).toThrow(/max-routes/);
  });
});

describe('checkpoint', () => {
  it('resumes only for the same project + authority filter', () => {
    const cp = { ...freshCheckpoint('appout-1', null), lastDocId: 'r9', written: 4 };
    expect(resumeFrom(cp, 'appout-1', null)).toMatchObject({ lastDocId: 'r9', written: 4 });
    expect(resumeFrom(cp, 'other', null).lastDocId).toBeNull();
    expect(resumeFrom(cp, 'appout-1', 'auth_x').lastDocId).toBeNull();
    expect(resumeFrom(null, 'appout-1', null).lastDocId).toBeNull();
    expect(resumeFrom({ version: 2 }, 'appout-1', null).lastDocId).toBeNull();
  });
});
