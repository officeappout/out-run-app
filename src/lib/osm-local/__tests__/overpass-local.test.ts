/**
 * The query strings below are the exact shapes scripts/geo-discovery-routes.ts
 * and scripts/lib/route-quality-osm-fetch.node.ts send (bbox/QID substituted).
 */
import { describe, expect, it } from 'vitest';
import type { OsmData, Tags } from '../../trail-graph/types';
import { fromOsmSnapshot, runLocalOverpass, toOsmSnapshot, UnsupportedOverpassQuery } from '..';

// Grid: node id = 1000 + 10*row + col, at lat 32 + row*0.001, lon 34.8 + col*0.001 (rows/cols 0..9).
const nid = (row: number, col: number) => 1000 + 10 * row + col;
function fixture(): OsmData {
  const d: OsmData = { nodes: new Map(), ways: new Map(), relations: new Map() };
  for (let r = 0; r < 10; r++) for (let c = 0; c < 10; c++) d.nodes.set(nid(r, c), { id: nid(r, c), lat: +(32 + r * 0.001).toFixed(3), lon: +(34.8 + c * 0.001).toFixed(3), tags: {} });
  // An outside node (far east) for a trail member that leaves the region.
  d.nodes.set(9001, { id: 9001, lat: 32.002, lon: 34.95, tags: {} });
  const way = (id: number, nodes: number[], tags: Tags) => d.ways.set(id, { id, nodes, tags });
  way(1, [nid(2, 1), nid(2, 2), nid(2, 3)], { highway: 'footway', name: 'טיילת' });
  way(2, [nid(3, 1), nid(3, 2)], { highway: 'steps' });
  way(3, [nid(4, 1), nid(4, 4)], { highway: 'residential', name: 'רחוב' });
  way(4, [nid(5, 1), nid(5, 4)], { highway: 'residential' });
  way(5, [nid(6, 1), nid(6, 4)], { highway: 'primary', name: 'דרך', cycleway: 'lane' });
  way(6, [nid(7, 1), nid(7, 2), nid(8, 2), nid(8, 1), nid(7, 1)], { building: 'yes' });
  way(7, [nid(2, 3), 9001], { highway: 'path' });
  way(8, [nid(1, 5), nid(1, 6)], { highway: 'path', 'cycleway:right': 'track' });
  // Admin boundary Q1: square rows 0..9 × cols 0..4, split into two ways.
  way(30, [nid(0, 0), nid(0, 4), nid(9, 4)], { boundary: 'administrative' });
  way(31, [nid(9, 4), nid(9, 0), nid(0, 0)], {});
  d.relations.set(20, { id: 20, tags: { boundary: 'administrative', wikidata: 'Q1', admin_level: '8' }, members: [{ type: 'w', ref: 30, role: 'outer' }, { type: 'w', ref: 31, role: 'outer' }] });
  d.relations.set(10, { id: 10, tags: { route: 'hiking', name: 'שביל' }, members: [{ type: 'w', ref: 1, role: '' }, { type: 'w', ref: 7, role: '' }] });
  way(61, [nid(1, 1), nid(1, 2), nid(0, 2), nid(1, 1)], { natural: 'water' });
  d.relations.set(60, { id: 60, tags: { natural: 'water', type: 'multipolygon' }, members: [{ type: 'w', ref: 61, role: 'outer' }] });
  return d;
}
const BB = '31.9995,34.7995,32.0095,34.8065'; // the whole grid, not the far-east node
const ids = (res: { elements: any[] }, type: string) => res.elements.filter((e) => e.type === type).map((e) => e.id);

describe('runLocalOverpass — geo-discovery query shapes', () => {
  const data = fixture();

  it('marked trail relations: tags first, then relation + member ways with geometry', () => {
    const q = `[out:json][timeout:180];(rel["route"~"^(hiking|foot|walking|running)$"](${BB});)->.r;.r out tags;(.r;>;);out geom;`;
    const res = runLocalOverpass(q, data);
    const rels = res.elements.filter((e: any) => e.type === 'relation') as any[];
    expect(rels).toHaveLength(2);
    expect(rels[0].members).toBeUndefined(); // `out tags`
    expect(rels[1].members.map((m: any) => m.ref)).toEqual([1, 7]);
    expect(rels[1].members[0].geometry).toHaveLength(3);
    expect(ids(res, 'way')).toEqual([1, 7]);
    const w7 = res.elements.find((e: any) => e.type === 'way' && e.id === 7) as any;
    expect(w7.geometry[1]).toEqual({ lat: 32.002, lon: 34.95 }); // member ways come back whole; the script clips
  });

  it('standalone ways: primary family minus steps + named streets', () => {
    const q = `[out:json][timeout:180];(way["highway"~"^(footway|path|track|pedestrian|cycleway)$"]["highway"!~"steps"](${BB});way["highway"~"^(living_street|residential|service|tertiary|unclassified)$"]["name"](${BB});)->.w;.w out geom tags;`;
    const res = runLocalOverpass(q, data);
    expect(ids(res, 'way')).toEqual([1, 3, 7, 8]);
    expect((res.elements[0] as any).tags.name).toBe('טיילת');
    expect((res.elements[0] as any).geometry[0]).toEqual({ lat: 32.002, lon: 34.801 });
  });

  it('area scope from a wikidata admin boundary', () => {
    const q = `[out:json][timeout:180];area["wikidata"="Q1"]->.rgn;(way["highway"~"^(footway|path|track|pedestrian|cycleway)$"]["highway"!~"steps"](area.rgn);)->.w;.w out geom tags;`;
    // way 8 sits at cols 5..6 — outside the Q1 square (cols 0..4)
    expect(ids(runLocalOverpass(q, data), 'way')).toEqual([1, 7]);
  });

  it('road bike lanes', () => {
    const q = `[out:json][timeout:180];(way["cycleway"~"^(lane|track|opposite_lane|opposite_track)$"](${BB});way["cycleway:left"](${BB});way["cycleway:right"](${BB});)->.bl;.bl out geom tags;`;
    expect(ids(runLocalOverpass(q, data), 'way')).toEqual([5, 8]);
  });

  it('road reference network / city way grid (out geom on the default set)', () => {
    const q = `[out:json][timeout:180];way["highway"~"^(primary|residential)$"](${BB});out geom;`;
    expect(ids(runLocalOverpass(q, data), 'way')).toEqual([3, 4, 5]);
  });

  it('blocking polygons incl. a water multipolygon with member geometry', () => {
    const q = `[out:json][timeout:120];(way["natural"="water"](${BB});way["building"](${BB});way["leisure"~"^(swimming_pool|water_park)$"](${BB});relation["natural"="water"](${BB}););out geom;`;
    const res = runLocalOverpass(q, data);
    expect(ids(res, 'way')).toEqual([6, 61]);
    const rel = res.elements.find((e: any) => e.type === 'relation') as any;
    expect(rel.members[0].geometry).toHaveLength(4);
  });

  it('admin boundary by wikidata and by relation id', () => {
    for (const q of [
      `[out:json][timeout:120];rel["wikidata"="Q1"]["boundary"="administrative"];out geom;(._;>;);out geom;`,
      `[out:json][timeout:120];relation(20);out geom;(._;>;);out geom;`,
    ]) {
      const res = runLocalOverpass(q, data);
      expect(ids(res, 'relation')).toEqual([20, 20]);
      expect(ids(res, 'way')).toEqual([30, 31]);
    }
  });

  it('unsupported syntax throws instead of answering empty', () => {
    expect(() => runLocalOverpass(`[out:json];way(around:100,32,34.8);out;`, data)).toThrow(UnsupportedOverpassQuery);
    expect(() => runLocalOverpass(`[out:json];area["name"="x"]->.a;`, data)).toThrow(UnsupportedOverpassQuery);
  });
});

describe('OSM region snapshot', () => {
  it('round-trips and answers the same queries', () => {
    const data = fixture();
    const meta = { regionKey: 't', bbox: { latMin: 32, lonMin: 34.8, latMax: 32.01, lonMax: 34.81 }, osmTimestamp: '2026-10-20T20:21:00Z', extract: 'geofabrik:israel-and-palestine' as const, license: 'ODbL-1.0' as const, attribution: '© OpenStreetMap contributors' as const, builtAt: '2026-10-21' };
    const back = fromOsmSnapshot(JSON.parse(JSON.stringify(toOsmSnapshot(data, meta))));
    expect(back.meta).toEqual(meta);
    const q = `[out:json][timeout:180];(rel["route"~"^(hiking|foot|walking|running)$"](${BB});)->.r;.r out tags;(.r;>;);out geom;`;
    expect(runLocalOverpass(q, back.data)).toEqual(runLocalOverpass(q, data));
  });
  it('rejects an unknown version', () => {
    expect(() => fromOsmSnapshot({ v: 2 })).toThrow(/unsupported/);
  });
});
