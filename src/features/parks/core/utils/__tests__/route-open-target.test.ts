import { describe, it, expect } from 'vitest';
import { isRouteOpenFresh, routeOpenTarget, ROUTE_OPEN_TTL_MS } from '../route-open-target';

const line = { path: [[34.78, 32.08], [34.79, 32.09]] as [number, number][] };

describe('routeOpenTarget (route opened outside the map)', () => {
  it('flag off → always the legacy sheet', () => {
    expect(routeOpenTarget({ v2: false, route: line, onMap: false, hostMounted: false })).toBe('legacy');
    expect(routeOpenTarget({ v2: false, route: line, onMap: true, hostMounted: true })).toBe('legacy');
  });
  it('v2 from another screen → the map (it mounts Discover on arrival)', () => {
    expect(routeOpenTarget({ v2: true, route: line, onMap: false, hostMounted: false })).toBe('map');
  });
  it('v2 on /map with Discover up → the map drawer', () => {
    expect(routeOpenTarget({ v2: true, route: line, onMap: true, hostMounted: true })).toBe('map');
  });
  it('fallbacks: on /map without Discover (live workout …), or no line to draw', () => {
    expect(routeOpenTarget({ v2: true, route: line, onMap: true, hostMounted: false })).toBe('legacy');
    expect(routeOpenTarget({ v2: true, route: { path: [] }, onMap: false, hostMounted: false })).toBe('legacy');
    expect(routeOpenTarget({ v2: true, route: { path: [[34.78, 32.08]] }, onMap: false, hostMounted: false })).toBe('legacy');
    expect(routeOpenTarget({ v2: true, route: {} as never, onMap: false, hostMounted: false })).toBe('legacy');
  });
  it('map polish: the v2 fallbacks become the v2 sheet, the map case is unchanged', () => {
    expect(routeOpenTarget({ v2: true, polish: true, route: line, onMap: false, hostMounted: false })).toBe('map');
    expect(routeOpenTarget({ v2: true, polish: true, route: line, onMap: true, hostMounted: true })).toBe('map');
    expect(routeOpenTarget({ v2: true, polish: true, route: line, onMap: true, hostMounted: false })).toBe('sheet');
    expect(routeOpenTarget({ v2: true, polish: true, route: { path: [] }, onMap: false, hostMounted: false })).toBe('sheet');
    expect(routeOpenTarget({ v2: true, polish: true, route: { path: [[34.78, 32.08]] }, onMap: false, hostMounted: false })).toBe('sheet');
  });
  it('map polish needs v2 — without it, still the legacy sheet', () => {
    expect(routeOpenTarget({ v2: false, polish: true, route: line, onMap: false, hostMounted: false })).toBe('legacy');
    expect(routeOpenTarget({ v2: false, polish: true, route: { path: [] }, onMap: false, hostMounted: false })).toBe('legacy');
  });
  it('a stale hand-off is dropped', () => {
    expect(isRouteOpenFresh(1000, 1000 + ROUTE_OPEN_TTL_MS)).toBe(true);
    expect(isRouteOpenFresh(1000, 1001 + ROUTE_OPEN_TTL_MS)).toBe(false);
    expect(isRouteOpenFresh(2000, 1000)).toBe(false);
  });
});
