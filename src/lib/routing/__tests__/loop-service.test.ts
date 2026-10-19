import { describe, expect, it } from 'vitest';
import { generateLoops } from '../loop-service';
import { selectTopLoops, scoreLoop, type ScoredLoop } from '../loops/scoring';
import { GraphHopperError, type GhRouteRequest } from '../graphhopper';
import { GH, fakeClient, routed } from './fixtures';

const req = { start: GH.start, targetKm: 5, activity: 'running' as const, seed: 0 };

/** round_trip seed%3: 0 → clean 4.7 km, 1 → spur + sliver 4.5 km, 2 → clean 4.5 km; every 3-waypoint loop → a 3.1 km sliver. */
const byRequest = (b: GhRouteRequest) => {
  if (b.algorithm !== 'round_trip') return GH.sliver3km;
  return [GH.passing5km, GH.spurry5km, GH.passing5kmB][b['round_trip.seed']! % 3];
};

describe('generateLoops — mix best-of-6', () => {
  it('asks for 3 round trips (headings 120° apart) + 3 three-waypoint loops, all with the OUT model', async () => {
    const c = fakeClient(byRequest);
    const out = await generateLoops(c, req);
    const rt = c.bodies.filter(b => b.algorithm === 'round_trip');
    const via = c.bodies.filter(b => b.algorithm !== 'round_trip');
    expect(new Set(rt.map(b => b.headings![0]))).toEqual(new Set([0, 120, 240]));
    expect(new Set(rt.map(b => b['round_trip.seed']))).toEqual(new Set([0, 1, 2]));
    expect(via.every(b => b.points.length === 4 && b.pass_through === true)).toBe(true);
    expect(c.bodies.every(b => b.profile === 'foot' && b.custom_model!.priority.length === 8)).toBe(true);
    expect(out.candidates).toBe(6);
    expect(out.calls).toBe(c.bodies.length);
    expect(out.timedOut).toBe(false);
  });

  it('calibrates: a loop >8% off target is re-requested with a scaled distance (max 3 calls)', async () => {
    const c = fakeClient(byRequest);
    await generateLoops(c, req);
    const seed1 = c.bodies.filter(b => b['round_trip.seed'] === 1).map(b => b['round_trip.distance']!);
    expect(seed1).toHaveLength(3);
    expect(seed1[1]).toBeGreaterThan(seed1[0]); // 4.48 km for 5 km asked → ask for more
    expect(c.bodies.filter(b => b['round_trip.seed'] === 0)).toHaveLength(1); // 4.68 km is within 8%
  });

  it('returns the best 3 distinct loops, clean ones first, each measured and trimmed', async () => {
    const out = await generateLoops(fakeClient(byRequest), req);
    expect(out.loops).toHaveLength(3);
    expect(out.loops[0].verdict.pass).toBe(true);
    expect(out.loops[1].verdict.pass).toBe(true);
    expect(out.loops.map(l => l.score)).toEqual([...out.loops.map(l => l.score)].sort((a, b) => a - b));
    expect(out.loops.slice(0, 2).every(l => l.source === 'round_trip')).toBe(true);
    for (const l of out.loops) {
      expect(l.metrics.majorRoadPct).not.toBeNull(); // filled from GraphHopper road_class without OSM
      expect(l.metrics.crossings).toBeNull();
    }
  });

  it('"Could not find a valid point" (400 → null) retries once with another seed', async () => {
    const c = fakeClient((b, n) => (b['round_trip.seed'] === 0 && n <= 6 ? GH.error400 : byRequest(b)));
    const out = await generateLoops(c, req);
    expect(c.bodies.some(b => b['round_trip.seed'] === 7919)).toBe(true);
    expect(out.loops.length).toBeGreaterThan(0);
  });

  it('scores against the OSM layer when given (crossing bars on)', async () => {
    const osm = { bbox: { south: 0, west: 0, north: 1, east: 1 }, roads: [], crossings: [] };
    const out = await generateLoops(fakeClient(byRequest), req, Promise.resolve(osm));
    expect(out.loops[0].metrics.crossings).not.toBeNull();
    expect(out.loops[0].metrics.majorRoadPct).toBe(0);
  });

  it('deadline: returns what finished, aborts the rest', async () => {
    const slow = {
      bodies: [] as GhRouteRequest[],
      async route(b: GhRouteRequest, signal?: AbortSignal) {
        if (b.algorithm === 'round_trip' && b['round_trip.seed'] === 0) return routed(GH.passing5km);
        await new Promise((r, j) => { const t = setTimeout(r, 2000); signal?.addEventListener('abort', () => { clearTimeout(t); j(new Error('aborted')); }); });
        return routed(GH.sliver3km);
      },
    };
    const t0 = Date.now();
    const out = await generateLoops(slow, { ...req, deadlineMs: 50 });
    expect(Date.now() - t0).toBeLessThan(500);
    expect(out.timedOut).toBe(true);
    expect(out.loops.map(l => l.source)).toEqual(['round_trip']);
    expect(out.errors).toBe(0); // aborts are not GraphHopper errors
  });

  it('GraphHopper down: no loops, errors counted', async () => {
    const out = await generateLoops(fakeClient(() => new GraphHopperError('graphhopper 503', 503)), req);
    expect(out.loops).toEqual([]);
    expect(out.errors).toBe(6);
    expect(out.lastError).toBe('graphhopper 503');
  });
});

describe('selectTopLoops', () => {
  const base = scoreLoop({ source: 'round_trip', routed: routed(GH.passing5km), calls: 1 }, 5, null);
  const mk = (score: number, distErr: number, shiftLng = 0): ScoredLoop => ({
    ...base, score, path: base.path.map(([x, y]) => [x + shiftLng, y] as [number, number]),
    distanceKm: 5 * (1 + distErr), metrics: { ...base.metrics, distanceErrorPct: distErr },
  });
  it('drops near-duplicates and keeps score order', () => {
    const out = selectTopLoops([mk(3, 0), mk(1, 0), mk(2, 0, 0.01), mk(1.5, 0.001)], 3);
    expect(out.map(l => l.score)).toEqual([1, 2]);
  });
  it('far-off-target loops only when nothing closer exists', () => {
    expect(selectTopLoops([mk(0, 0.5, 0.02), mk(5, 0.1)], 3).map(l => l.score)).toEqual([5]);
    expect(selectTopLoops([mk(0, 0.5)], 3)).toHaveLength(1);
  });
});
