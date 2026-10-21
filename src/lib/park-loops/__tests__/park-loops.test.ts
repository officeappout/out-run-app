import { describe, expect, it } from 'vitest';
import { buildValidatedDoc } from '../../route-collections/validate';
import { ringAreaM2 } from '../geometry';
import { fitnessStopsAlong, innerLoop, knownLoops, loopsForPark, perimeterLoop, type ViaRouter } from '../loops';
import { buildPathIndex } from '../path-index';
import { isBigPark, mergeSameName, selectBigParks, toPark } from '../select-parks';
import { parkLoopDoc } from '../to-route-doc';
import type { LngLat, ParkPolygon } from '../types';

const LAT = 32.1;
const mx = (m: number) => m / (111_320 * Math.cos((LAT * Math.PI) / 180));
const my = (m: number) => m / 111_320;
function rect(lng: number, lat: number, w: number, h: number): LngLat[] {
  return [[lng, lat], [lng + mx(w), lat], [lng + mx(w), lat + my(h)], [lng, lat + my(h)], [lng, lat]];
}
function densify(ring: LngLat[], step = 10): LngLat[] {
  const out: LngLat[] = [];
  for (let i = 1; i < ring.length; i++) {
    const [a, b] = [ring[i - 1], ring[i]];
    const n = Math.max(1, Math.round(Math.hypot((b[0] - a[0]) / mx(1), (b[1] - a[1]) / my(1)) / step));
    for (let s = 0; s < n; s++) out.push([a[0] + ((b[0] - a[0]) * s) / n, a[1] + ((b[1] - a[1]) * s) / n]);
  }
  out.push(ring[ring.length - 1]);
  return out;
}
const area = (id: string, name: string, ring: LngLat[], tags: Record<string, string> = { leisure: 'park' }) =>
  ({ id, tags: { ...tags, name }, geometry: { type: 'Polygon' as const, coordinates: [ring] } });

describe('big-park selection (owner Q7: ≥ 8 dunam or perimeter ≥ 1.2 km)', () => {
  it('area and perimeter thresholds', () => {
    expect(ringAreaM2(rect(34.8, LAT, 300, 300))).toBeCloseTo(90_000, -3);
    expect(isBigPark(toPark(area('w/1', 'גן', rect(34.8, LAT, 300, 300)))!)).toBe(true); // 9 dunam
    expect(isBigPark(toPark(area('w/2', 'גינה', rect(34.8, LAT, 100, 100)))!)).toBe(false);
    expect(isBigPark(toPark(area('w/3', 'רצועה', rect(34.8, LAT, 580, 30)))!)).toBe(true); // thin but 1.22 km around
  });
  it('unnamed areas and non-park tags are ignored', () => {
    expect(toPark({ id: 'w/9', tags: { leisure: 'park' }, geometry: { type: 'Polygon', coordinates: [rect(34.8, LAT, 400, 400)] } })).toBeNull();
    expect(toPark(area('w/8', 'חניון', rect(34.8, LAT, 400, 400), { amenity: 'parking' }))).toBeNull();
  });
  it('merges same-name pieces that touch (Park HaYarkon is split in OSM), keeps far ones apart', () => {
    const a = toPark(area('w/1', 'פארק הירקון', rect(34.80, LAT, 200, 200)))!;
    const b = toPark(area('w/2', 'פארק הירקון', rect(34.80 + mx(210), LAT, 200, 200)))!;
    const far = toPark(area('w/3', 'פארק הירקון', rect(34.90, LAT, 200, 200)))!;
    const merged = mergeSameName([a, b, far]);
    expect(merged).toHaveLength(2);
    const big = merged.find((p) => p.id.includes('+'))!;
    expect(big.id).toBe('w/1+w/2');
    expect(big.areaM2).toBeCloseTo(80_000, -3);
    expect(selectBigParks([area('w/1', 'פארק הירקון', rect(34.80, LAT, 200, 200)), area('w/2', 'פארק הירקון', rect(34.80 + mx(210), LAT, 200, 200))]).parks).toHaveLength(1);
  });
});

const park: ParkPolygon = toPark(area('way/77', 'פארק הדגמה', rect(34.8, LAT, 500, 300)))!;
const ringPath = { id: 'p1', highway: 'footway', coords: densify(rect(34.8 + mx(10), LAT + my(10), 480, 280)) }; // a path 10 m inside the fence

describe('perimeterLoop', () => {
  it('walks the boundary on the real path 10 m inside it', () => {
    const r = perimeterLoop(park, buildPathIndex([ringPath]));
    expect(r.reason).toBe('ok');
    expect(r.coverage).toBe(1);
    expect(r.loop!.lengthM).toBeGreaterThan(1400);
    expect(r.loop!.lengthM).toBeLessThan(1650);
  });
  it('rejects a boundary with no path along a long stretch', () => {
    const half = { id: 'p2', highway: 'footway', coords: densify([[34.8, LAT + my(5)], [34.8 + mx(500), LAT + my(5)]]) };
    const r = perimeterLoop(park, buildPathIndex([half]));
    expect(r.loop).toBeNull();
    expect(r.reason).toMatch(/boundary/);
  });
});

describe('knownLoops', () => {
  it('an existing closed route inside the park is a known loop; one outside is not', () => {
    const inside = { id: 'r1', name: 'סיבוב', coords: densify(rect(34.8 + mx(50), LAT + my(50), 300, 150)) };
    const outside = { id: 'r2', name: 'רחוק', coords: densify(rect(34.9, LAT, 300, 150)) };
    expect(knownLoops(park, [inside, outside]).map((l) => l.evidence)).toEqual([expect.stringContaining('r1')]);
  });
});

describe('loopsForPark — no duplicate of a known loop', () => {
  it('drops the perimeter when an existing route already walks it', async () => {
    const existing = [{ id: 'r9', name: 'הקפה קיימת', coords: ringPath.coords }];
    const res = await loopsForPark(park, { paths: buildPathIndex([ringPath]), existing, fitness: [], router: null });
    expect(res.loops.map((l) => l.kind)).toEqual(['known']);
    expect(res.notes).toContain('perimeter: same as the known loop');
  });
});

describe('innerLoop', () => {
  const paths = buildPathIndex([ringPath, { id: 'x', highway: 'path', coords: densify([[34.8 + mx(20), LAT + my(150)], [34.8 + mx(480), LAT + my(150)]]) }, { id: 'y', highway: 'path', coords: densify([[34.8 + mx(250), LAT + my(20)], [34.8 + mx(250), LAT + my(280)]]) }]);
  it('without GraphHopper it reports blocked, not a fake loop', async () => {
    expect(await innerLoop(park, paths, null)).toEqual({ loop: null, reason: expect.stringMatching(/GraphHopper/) });
  });
  it('with a router, keeps the loop only if it passes route-quality', async () => {
    const good: ViaRouter = { route: async () => ({ coords: densify(rect(34.8 + mx(30), LAT + my(30), 400, 240)) }) };
    const r = await innerLoop(park, paths, good);
    expect(r.loop?.kind).toBe('inner');
    const outAndBack: ViaRouter = { route: async () => { const l = densify([[34.8, LAT], [34.8 + mx(600), LAT]]); return { coords: [...l, ...l.slice().reverse()] }; } };
    expect((await innerLoop(park, paths, outAndBack)).reason).toMatch(/route-quality/);
  });
});

describe('fitness stops are optional extras', () => {
  it('marks stations within 180 m; never changes the geometry', async () => {
    const res = await loopsForPark(park, { paths: buildPathIndex([ringPath]), existing: [], fitness: [{ id: 'n/1', coord: [34.8 + mx(100), LAT + my(100)] }, { id: 'n/2', coord: [34.9, LAT] }], router: null });
    expect(res.loops).toHaveLength(1);
    expect(res.loops[0].fitnessStops.map((f) => f.id)).toEqual(['n/1']);
    expect(res.notes.join(' ')).toMatch(/inner: GraphHopper/);
    expect(fitnessStopsAlong(ringPath.coords, [])).toEqual([]);
  });
});

describe('parkLoopDoc', () => {
  it('passes the create chokepoint, carries parkRef + ODbL provenance', () => {
    const loop = perimeterLoop(park, buildPathIndex([ringPath])).loop!;
    const { id, data } = parkLoopDoc(loop, { authorityId: 'tlv', city: 'תל אביב-יפו', osmSnapshot: '2026-10-20', importBatchId: 'b' });
    expect(id).toBe('park_perimeter_way_77');
    const v = buildValidatedDoc('official_routes', data, { mode: 'create', knownAuthorityIds: new Set(['tlv']) }) as any;
    expect(v).toMatchObject({ name: 'הקפת פארק הדגמה', origin: 'park_loop', parkLoopKind: 'perimeter', routeShape: 'loop', status: 'pending', published: false });
    expect(v.parkRef).toEqual({ source: 'osm', id: 'way/77', name: 'פארק הדגמה' });
    expect(v.provenance.osm.license).toBe('ODbL-1.0');
  });
  it('refuses to build a doc for a known (existing) loop', () => {
    expect(() => parkLoopDoc({ ...perimeterLoop(park, buildPathIndex([ringPath])).loop!, kind: 'known' }, { authorityId: 'a', city: 'c', osmSnapshot: null, importBatchId: 'b' })).toThrow(/existing/);
  });
});
