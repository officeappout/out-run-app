import { describe, expect, it } from 'vitest';
import { hexToRgba, liveTrailKind, liveTrailPaintV1, TRAIL_V1_RUN, TRAIL_V1_WALK } from '../live-trail-paint';
import { getLivePathPaint, ZONE_TRAIL_COLORS } from '../mapLayersConfig';

describe('live trail paint (enable_run_player_drawer_v1)', () => {
  it('kind: zones win, then route, else free', () => {
    expect(liveTrailKind(true, true)).toBe('zones');
    expect(liveTrailKind(true, false)).toBe('zones');
    expect(liveTrailKind(false, true)).toBe('route');
    expect(liveTrailKind(false, false)).toBe('free');
  });

  it('free run: solid brand cyan, the older part only lighter — never transparent', () => {
    const { line, casing } = liveTrailPaintV1('free', 'running');
    const g = line['line-gradient'] as unknown[];
    expect(g[g.length - 1]).toBe(hexToRgba(TRAIL_V1_RUN, 1));
    const oldestAlpha = Number(String(g[4]).match(/,\s*([\d.]+)\)$/)?.[1]);
    expect(oldestAlpha).toBeGreaterThanOrEqual(0.6);
    expect(casing['line-color']).toBe('#ffffff');
  });

  it('walking stays amber', () => {
    const g = liveTrailPaintV1('free', 'walking').line['line-gradient'] as unknown[];
    expect(g[g.length - 1]).toBe(hexToRgba(TRAIL_V1_WALK, 1));
  });

  it('zones: zone-coloured match, brand fallback, fully opaque (no gradient)', () => {
    const { line } = liveTrailPaintV1('zones', 'running');
    const expr = line['line-color'] as unknown[];
    expect(expr[0]).toBe('match');
    expect(expr[expr.length - 1]).toBe(TRAIL_V1_RUN);
    expect(expr).toContain('tempo');
    expect(line['line-opacity']).toBe(1);
    expect(line['line-gradient']).toBeUndefined();
  });

  it('route: a visible solid line (was 0.28 sky-300)', () => {
    const { line } = liveTrailPaintV1('route', 'running');
    expect(line['line-opacity']).toBeGreaterThanOrEqual(0.85);
  });

  it('getLivePathPaint is unchanged by the shared zone list', () => {
    const expr = getLivePathPaint(true)['line-color'] as unknown[];
    expect(expr.length).toBe(2 + ZONE_TRAIL_COLORS.length * 2 + 1);
    expect(expr.slice(0, 4)).toEqual(['match', ['get', 'zoneType'], 'sprint', '#DC2626']);
    expect(expr[expr.length - 1]).toBe('#2563eb');
    expect(getLivePathPaint(false)['line-color']).toBe('#2563eb');
  });

  it('hexToRgba', () => {
    expect(hexToRgba('#00baf7', 0.5)).toBe('rgba(0, 186, 247, 0.5)');
    expect(hexToRgba('#fff', 2)).toBe('rgba(255, 255, 255, 1)');
  });
});
