import { describe, expect, it } from 'vitest';
import { hexToRgba, liveTrailKind, liveTrailPaintV1, TRAIL_ROUTE_GREEN, TRAIL_V1_RUN, TRAIL_V1_WALK } from '../live-trail-paint';
import { getLivePathPaint, ZONE_TRAIL_COLORS } from '../mapLayersConfig';
import { WORKOUT_ZONE_TRAIL_COLORS } from '@/features/workout-engine/players/running/lib/workout-palette';

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

describe('pilot M23: the walked trail on a route is green', () => {
  it('green for walk and run on a route when on; zones and free unchanged', () => {
    expect(liveTrailPaintV1('route', 'walking', true).line['line-color']).toBe(TRAIL_ROUTE_GREEN);
    expect(liveTrailPaintV1('route', 'running', true).line['line-color']).toBe(TRAIL_ROUTE_GREEN);
    expect(liveTrailPaintV1('route', 'walking').line['line-color']).not.toBe(TRAIL_ROUTE_GREEN);
    expect(liveTrailPaintV1('zones', 'running', true)).toEqual(liveTrailPaintV1('zones', 'running'));
    expect(liveTrailPaintV1('free', 'walking', true)).toEqual(liveTrailPaintV1('free', 'walking'));
  });
});

describe('enable_unified_player_v1: the zone trail in the workout palette', () => {
  const TODAY = [
    'match', ['get', 'zoneType'],
    'sprint', '#DC2626', 'interval_short', '#E11D48', 'interval_long', '#0D9488', 'fartlek_fast', '#0D9488',
    'tempo', '#0891B2', 'fartlek_medium', '#F59E0B', 'long_run', '#10B981', 'easy', '#34D399',
    'jogging', '#6EE7B7', 'recovery', '#60A5FA', 'walk', '#9CA3AF',
    TRAIL_V1_RUN,
  ];

  it('flag off (no palette passed): exactly today\'s colours', () => {
    expect(liveTrailPaintV1('zones', 'running')).toEqual(liveTrailPaintV1('zones', 'running', false, undefined));
    expect(liveTrailPaintV1('zones', 'running').line['line-color']).toEqual(TODAY);
  });

  it('flag on: the bars\' colours, same brand fallback, same widths', () => {
    const off = liveTrailPaintV1('zones', 'running');
    const on = liveTrailPaintV1('zones', 'running', false, WORKOUT_ZONE_TRAIL_COLORS);
    const expr = on.line['line-color'] as unknown[];
    const pairs = new Map<unknown, unknown>();
    for (let i = 2; i < expr.length - 1; i += 2) pairs.set(expr[i], expr[i + 1]);
    expect(pairs.get('tempo')).toBe('#f97316');
    expect(pairs.get('interval_short')).toBe('#e5484d');
    expect(pairs.get('easy')).toBe('#84cc16');
    expect(pairs.get('walk')).toBe('#f59e0b');
    expect(expr[expr.length - 1]).toBe(TRAIL_V1_RUN);
    expect(on.casing).toEqual(off.casing);
    expect({ ...on.line, 'line-color': null }).toEqual({ ...off.line, 'line-color': null });
  });

  it('the palette only touches the zone trail', () => {
    for (const kind of ['free', 'route'] as const) {
      expect(liveTrailPaintV1(kind, 'running', false, WORKOUT_ZONE_TRAIL_COLORS)).toEqual(liveTrailPaintV1(kind, 'running'));
    }
  });
});
