import { describe, expect, it } from 'vitest';
import {
  activeSurfaceFilterCount,
  applySurfaceFilter,
  parseSurfaceFilter,
  surfaceFamilyFor,
} from '../surface-filter-logic';
import {
  SURFACE_FILTER_STORAGE_KEY,
  loadSurfaceFilter,
  parsePersistedSurfaceFilter,
  saveSurfaceFilter,
  serializeSurfaceFilter,
} from '../surface-filter-prefs';

const r = (id: string, surfaceClass: string, activityType: string) => ({ id, surfaceClass, activityType, type: activityType }) as any;
const routes = [
  r('a', 'walk_run_paved', 'running'),
  r('b', 'hike_offroad', 'walking'),
  r('c', 'unknown', 'running'),
  r('d', 'bike_road', 'cycling'),
  r('e', 'bike_offroad', 'cycling'),
  r('f', 'unknown', 'cycling'),
];
const ids = (x: { routes: any[] }) => x.routes.map((q) => q.id);

describe('applySurfaceFilter', () => {
  it('flag off → the same array, no-op', () => {
    const out = applySurfaceFilter(routes, 'offroad', 'running', false);
    expect(out.routes).toBe(routes);
    expect(out.shown).toBe(routes.length);
  });
  it("filter 'any' → the same array; counts = activity matches", () => {
    const out = applySurfaceFilter(routes, 'any', 'running', true);
    expect(out.routes).toBe(routes);
    expect(out).toMatchObject({ shown: 3, total: 3 });
  });
  it('running: paved / offroad, unknown hidden, bike routes excluded', () => {
    expect(ids(applySurfaceFilter(routes, 'paved', 'running', true))).toEqual(['a']);
    expect(ids(applySurfaceFilter(routes, 'offroad', 'walking', true))).toEqual(['b']);
    expect(applySurfaceFilter(routes, 'paved', 'running', true)).toMatchObject({ shown: 1, total: 3 });
  });
  it('cycling: bike families only, unknown hidden', () => {
    expect(ids(applySurfaceFilter(routes, 'paved', 'cycling', true))).toEqual(['d']);
    expect(ids(applySurfaceFilter(routes, 'offroad', 'cycling', true))).toEqual(['e']);
    expect(applySurfaceFilter(routes, 'offroad', 'cycling', true)).toMatchObject({ shown: 1, total: 3 });
  });
  it('filter hiding everything → shown 0 of total (empty state)', () => {
    const only = [r('x', 'unknown', 'running')];
    expect(applySurfaceFilter(only, 'paved', 'running', true)).toMatchObject({ routes: [], shown: 0, total: 1 });
  });
  it('empty input and sparse docs never throw', () => {
    expect(applySurfaceFilter([], 'paved', 'running', true)).toMatchObject({ shown: 0, total: 0 });
    expect(() => applySurfaceFilter([{} as any], 'paved', undefined, true)).not.toThrow();
  });
});

describe('small helpers', () => {
  it('badge count', () => {
    expect(activeSurfaceFilterCount('any', true)).toBe(0);
    expect(activeSurfaceFilterCount('paved', true)).toBe(1);
    expect(activeSurfaceFilterCount('offroad', false)).toBe(0);
  });
  it('family by activity', () => {
    expect(surfaceFamilyFor('cycling')).toBe('bike');
    for (const a of ['running', 'walking', 'workout', undefined, null] as const) expect(surfaceFamilyFor(a)).toBe('foot');
  });
  it('parseSurfaceFilter garbage → any', () => {
    for (const v of [null, undefined, 5, 'x', {}, 'PAVED']) expect(parseSurfaceFilter(v)).toBe('any');
    expect(parseSurfaceFilter('paved')).toBe('paved');
  });
});

describe('persistence', () => {
  it('round-trips', () => {
    for (const f of ['any', 'paved', 'offroad'] as const) expect(parsePersistedSurfaceFilter(serializeSurfaceFilter(f))).toBe(f);
  });
  it('garbage → any', () => {
    for (const v of [null, undefined, '', 'paved', '{', '{"v":2,"surface":"paved"}', '{"v":1,"surface":"mud"}', '[]', 'null', 7])
      expect(parsePersistedSurfaceFilter(v)).toBe('any');
  });
  it('load/save tolerate missing or throwing storage', () => {
    expect(loadSurfaceFilter()).toBe('any'); // node: no window
    const store: Record<string, string> = {};
    (globalThis as any).window = {
      localStorage: {
        getItem: (k: string) => store[k] ?? null,
        setItem: (k: string, v: string) => { store[k] = v; },
        removeItem: (k: string) => { delete store[k]; },
      },
    };
    saveSurfaceFilter('offroad');
    expect(loadSurfaceFilter()).toBe('offroad');
    saveSurfaceFilter('any');
    expect(store[SURFACE_FILTER_STORAGE_KEY]).toBeUndefined();
    (globalThis as any).window = { localStorage: { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); }, removeItem: () => { throw new Error('x'); } } };
    expect(loadSurfaceFilter()).toBe('any');
    expect(() => saveSurfaceFilter('paved')).not.toThrow();
    delete (globalThis as any).window;
  });
});
