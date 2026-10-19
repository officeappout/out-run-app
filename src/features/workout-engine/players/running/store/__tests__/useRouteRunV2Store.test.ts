import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { useRouteRunV2Store } from '../useRouteRunV2Store';

describe('useRouteRunV2Store', () => {
  it('holds the aligned elevation samples', () => {
    useRouteRunV2Store.getState().setElevation({ stepM: 15, elevationsM: [1, 2] });
    expect(useRouteRunV2Store.getState().elevation).toEqual({ stepM: 15, elevationsM: [1, 2] });
    useRouteRunV2Store.getState().setElevation(null);
    expect(useRouteRunV2Store.getState().elevation).toBeNull();
  });
});

// No jsdom harness here — source-level guards.
const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

describe('route run v2 is behind enable_home_v2', () => {
  it('the map layer reads the flag and renders null without it', () => {
    const src = read('../../components/RouteRun/v2/RouteRunMapLayersV2.tsx');
    expect(src).toContain('useFeatureFlags(isSuperAdmin).flags.enableHomeV2');
    expect(src).toMatch(/if \(!v2[^)]*\) return null;/);
  });
  it('the controller only publishes samples with the flag on', () => {
    const src = read('../../components/RouteRun/v2/RouteRunLiveV2Controller.tsx');
    expect(src).toContain('useFeatureFlags(isSuperAdmin).flags.enableHomeV2');
    expect(src).toContain('const samples = v2 ? readElevationSamples({ elevationProfile }) : null;');
  });
});

describe("owner's 24.09.2026 rule — no off-route alert, no re-route", () => {
  it('nothing in route run v2 detects or reacts to deviation', () => {
    for (const f of [
      '../useRouteRunV2Store.ts',
      '../../components/RouteRun/v2/RouteRunLiveV2Controller.tsx',
      '../../components/RouteRun/v2/RouteRunMapLayersV2.tsx',
      '../../../../../parks/core/components/NavBannerV2.tsx',
    ]) {
      const src = read(f);
      expect(src).not.toMatch(/offRoute|checkRouteDeviation|setActiveRoutePath|getSmartPath/);
    }
  });
});
