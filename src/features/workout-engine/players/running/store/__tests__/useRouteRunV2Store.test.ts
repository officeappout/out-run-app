import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { useRouteRunV2Store } from '../useRouteRunV2Store';

const st = () => useRouteRunV2Store.getState();

describe('useRouteRunV2Store', () => {
  beforeEach(() => {
    st().reset();
    st().setElevation(null);
  });

  it('bumps the toast token only on the off-route ENTRY edge', () => {
    const t0 = st().offRouteToken;
    st().setOffRoute(true, 55, [34.8, 32]);
    st().setOffRoute(true, 60, [34.8, 32.0001]);
    expect(st().offRouteToken).toBe(t0 + 1);
    expect(st().offRouteDistanceM).toBe(60);
    expect(st().rejoinPoint).toEqual([34.8, 32.0001]);
  });

  it('back on the route clears the navigate-back line', () => {
    st().setOffRoute(true, 55, [34.8, 32]);
    st().setNavBack('ready', [[34.8, 32], [34.8, 32.001]]);
    st().setOffRoute(false, null, null);
    expect(st().offRoute).toBe(false);
    expect(st().navBackStatus).toBe('idle');
    expect(st().navBackPath).toBeNull();
  });

  it('"המשך חופשי" drops guidance and the off-route state', () => {
    st().setOffRoute(true, 55, [34.8, 32]);
    st().dropGuidance();
    expect(st().guidanceDropped).toBe(true);
    expect(st().offRoute).toBe(false);
  });

  it('session reset keeps the route-scoped elevation and the token', () => {
    st().setElevation({ stepM: 15, elevationsM: [1, 2] });
    st().setOffRoute(true, 55, [34.8, 32]);
    const token = st().offRouteToken;
    st().dropGuidance();
    st().reset();
    expect(st().guidanceDropped).toBe(false);
    expect(st().elevation).toEqual({ stepM: 15, elevationsM: [1, 2] });
    expect(st().offRouteToken).toBe(token);
  });
});

// No jsdom harness here — source-level guards that everything new is flag-gated.
const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

describe('route run v2 is behind enable_home_v2', () => {
  it('the controller and the map layer read the flag and render null without it', () => {
    for (const f of ['../../components/RouteRun/v2/RouteRunLiveV2Controller.tsx', '../../components/RouteRun/v2/RouteRunMapLayersV2.tsx']) {
      const src = read(f);
      expect(src).toContain('useFeatureFlags(isSuperAdmin).flags.enableHomeV2');
      expect(src).toMatch(/if \(!v2[^)]*\) return null;/);
    }
  });
  it('TurnCarousel only uses the off-route / dropped state when v2 is on', () => {
    const src = read('../../../../../parks/core/components/TurnCarousel.tsx');
    expect(src).toContain("const offRouteV2 = useRouteRunV2Store((s) => s.offRoute) && v2;");
    expect(src).toContain("const guidanceDroppedV2 = useRouteRunV2Store((s) => s.guidanceDropped) && v2;");
  });
  it('the legacy deviation detector is untouched (no auto re-route)', () => {
    const src = read('../../components/RouteRun/v2/RouteRunLiveV2Controller.tsx');
    expect(src).not.toContain('checkRouteDeviation');
    expect(src).not.toContain('setActiveRoutePath');
  });
});
