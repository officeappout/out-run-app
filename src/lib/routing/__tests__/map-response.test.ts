import { describe, expect, it } from 'vitest';
import { crossingKind, mapGhPath, maxGradePct } from '../graphhopper';
import { GH } from './fixtures';

describe('GraphHopper path → RoutedPath', () => {
  it('maps a recorded loop: [lng,lat] path, elevations, distance, ascend', () => {
    const p = GH.passing5km.paths![0];
    const r = mapGhPath(p);
    expect(r.path).toHaveLength(p.points.coordinates.length);
    expect(r.path[0]).toEqual([p.points.coordinates[0][0], p.points.coordinates[0][1]]);
    expect(r.elevations).toHaveLength(r.path.length);
    expect(r.distanceM).toBe(p.distance);
    expect(r.ascendM).toBe(p.ascend);
    expect(r.path[0][1]).toBeCloseTo(32.078, 2); // lat second
  });
  it('folds road_class into length shares and the tertiary+ share', () => {
    const r = mapGhPath(GH.passing5kmB.paths![0]);
    const total = Object.values(r.roadClassShare).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 5);
    expect(r.majorRoadShare).toBeCloseTo(r.roadClassShare.tertiary, 5);
    expect(r.majorRoadShare).toBeGreaterThan(0);
    expect(mapGhPath(GH.sliver3km.paths![0]).majorRoadShare).toBe(0);
  });
  it('counts crossings by control', () => {
    expect(mapGhPath(GH.passing5km.paths![0]).crossings).toEqual({ signalled: 1, marked: 0, unmarked: 0 });
    expect(mapGhPath(GH.spurry5km.paths![0]).crossings).toEqual({ signalled: 0, marked: 0, unmarked: 1 });
    expect(crossingKind('UNCONTROLLED')).toBe('marked');
    expect(crossingKind('no')).toBe('unmarked');
    expect(crossingKind('missing')).toBeNull();
  });
  it('max grade ignores sub-50 m spikes', () => {
    const path: [number, number][] = [[34.77, 32], [34.7701, 32], [34.7702, 32], [34.778, 32]];
    // 9.4 m then 9.4 m then ~734 m; a 5 m jump over the first 9 m alone must not count as 50%.
    expect(maxGradePct(path, [0, 5, 5, 5])).toBeLessThan(30);
    expect(maxGradePct(path, [0, 0, 0, 73])).toBeCloseTo(10, 0);
  });
  it('missing details / elevation degrade to zeros, not NaN', () => {
    const r = mapGhPath({ distance: 100, time: 60000, points: { type: 'LineString', coordinates: [[34.77, 32], [34.771, 32]] } });
    expect(r.roadClassShare).toEqual({});
    expect(r.majorRoadShare).toBe(0);
    expect(r.ascendM).toBe(0);
    expect(r.maxGradePct).toBe(0);
  });
});
