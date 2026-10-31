import { describe, expect, it, vi } from 'vitest';

const rp = vi.hoisted(() => ({
  clearCommuteContext: vi.fn(),
  setActivityType: vi.fn(),
  setGuidedRouteId: vi.fn(),
  setGuidedRouteName: vi.fn(),
  setGuidedRouteDistanceKm: vi.fn(),
}));
vi.mock('../useRunningPlayer', () => ({ useRunningPlayer: { getState: () => rp } }));

import { continueCommuteOnRoute, routeKmOf, useWalkToStartStore } from '../useWalkToStartStore';

describe('walk to the start + the route = one workout (board PlayerArrive)', () => {
  it('continues the SAME session on the route: commute cleared, route bound, activity set', async () => {
    const route = { id: 'r1', name: 'Yarkon', distance: 4.2 } as never;
    useWalkToStartStore.getState().setRoute(route);
    await continueCommuteOnRoute(route, 'running');
    expect(rp.clearCommuteContext).toHaveBeenCalled();
    expect(rp.setActivityType).toHaveBeenCalledWith('running');
    expect(rp.setGuidedRouteId).toHaveBeenCalledWith('r1');
    expect(rp.setGuidedRouteName).toHaveBeenCalledWith('Yarkon');
    expect(rp.setGuidedRouteDistanceKm).toHaveBeenCalledWith(4.2);
    expect(useWalkToStartStore.getState().route).toBe(null);
  });
  it('routeKmOf: a numeric length only', () => {
    expect(routeKmOf({ distance: 3 } as never)).toBe(3);
    expect(routeKmOf({ distance: '3' } as never)).toBe(null);
    expect(routeKmOf(null)).toBe(null);
  });
});
