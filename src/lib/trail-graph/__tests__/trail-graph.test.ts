import { describe, it, expect } from 'vitest';
import { parseOpl, unescapeOpl } from '../osm-opl';
import { isTrailWay, resolveLit, resolveSurface, trailColour, litFromTags } from '../tags';
import { buildRouteMembership, buildSegments, mergePieces, splitWaysAtJunctions } from '../segment-graph';
import { npsScore, rateDifficulty, starPrior, technicalReasons, isOfficialOperator } from '../difficulty';
import { generatedRouteName, nameRoute, officialName, dominantWayName, type NamingInput } from '../naming';
import { classifyShape, dedupBySegments, generateFromStart, jaccard, orderSegments, SegmentGraph } from '../route-assembly';
import { routeStats } from '../route-stats';
import type { LngLat, OsmData, TrailSegment } from '../types';

describe('osm-opl', () => {
  it('parses nodes, ways, relations and %-escapes', () => {
    const d = parseOpl([
      'n1 Tname=a%20%b x34.5 y31.5',
      'n2 T x34.501 y31.5',
      'w10 Thighway=path,name=שביל Nn1,n2',
      'r99 Ttype=route,route=hiking,operator=itc Mw10@,n1@start',
    ].join('\n'));
    expect(d.nodes.get(1)!.tags.name).toBe('a b');
    expect(d.ways.get(10)!.nodes).toEqual([1, 2]);
    expect(d.ways.get(10)!.tags.name).toBe('שביל');
    expect(d.relations.get(99)!.members).toEqual([{ type: 'w', ref: 10, role: '' }, { type: 'n', ref: 1, role: 'start' }]);
    expect(unescapeOpl('x%2c%y')).toBe('x,y');
  });
});

describe('tags', () => {
  it('includes trail classes, excludes private/foot=no/areas/parking aisles', () => {
    expect(isTrailWay({ highway: 'track' })).toBe(true);
    expect(isTrailWay({ highway: 'residential' })).toBe(true);
    expect(isTrailWay({ highway: 'residential', foot: 'no' })).toBe(false);
    expect(isTrailWay({ highway: 'path', access: 'private' })).toBe(false);
    expect(isTrailWay({ highway: 'path', access: 'private', foot: 'yes' })).toBe(true);
    expect(isTrailWay({ highway: 'pedestrian', area: 'yes' })).toBe(false);
    expect(isTrailWay({ highway: 'service', service: 'parking_aisle' })).toBe(false);
    expect(isTrailWay({ highway: 'primary' })).toBe(false);
  });
  it('surface: OSM tag → tracktype → highway default, with confidence', () => {
    expect(resolveSurface({ highway: 'track', surface: 'asphalt' }, false)).toMatchObject({ surface: 'asphalt', confidence: 'osm_surface' });
    expect(resolveSurface({ highway: 'track', tracktype: 'grade2' }, false)).toMatchObject({ surface: 'gravel', confidence: 'osm_tracktype' });
    expect(resolveSurface({ highway: 'track' }, false)).toMatchObject({ surface: 'dirt', confidence: 'highway_default' });
    expect(resolveSurface({ highway: 'path', surface: 'unpaved' }, false)).toMatchObject({ surface: 'dirt', raw: 'unpaved', confidence: 'highway_default' });
  });
  it('lit: never guessed lit; open country defaults unlit; built-up unknown', () => {
    expect(litFromTags({ lit: '24/7' })).toBe('yes');
    expect(resolveLit({ lit: 'no' }, 1, true)).toEqual({ lit: 'no', source: 'osm_lit' });
    expect(resolveLit({}, 0.9, true)).toEqual({ lit: 'yes', source: 'street_lamp' });
    expect(resolveLit({}, 0, false)).toEqual({ lit: 'no', source: 'default_unlit_outside_built_up' });
    expect(resolveLit({}, 0.1, true)).toEqual({ lit: 'unknown', source: 'none' });
  });
  it('trail colour from Israeli osmc:symbol', () => {
    expect(trailColour({ 'osmc:symbol': 'red:white:red_bar' })).toBe('red');
    expect(trailColour({ colour: 'Blue' })).toBe('blue');
  });
});

// Graph: a "plus" junction at node 2, plus a 2-way chain 2-5-6 that must merge.
//   1 —w1— 2 —w2— 3          w4: 2→5, w5: 5→6 (same tags → one segment)
//          |
//          w3
//          4
function plusData(extraRel = false): OsmData {
  const lines = [
    'n1 T x34.500 y31.500', 'n2 T x34.501 y31.500', 'n3 T x34.502 y31.500', 'n4 T x34.501 y31.499',
    'n5 T x34.501 y31.501', 'n6 T x34.501 y31.502',
    'w1 Thighway=track Nn1,n2', 'w2 Thighway=track Nn2,n3', 'w3 Thighway=path Nn2,n4',
    'w4 Thighway=path Nn2,n5', 'w5 Thighway=path Nn5,n6',
  ];
  if (extraRel) lines.push('r7 Ttype=route,route=hiking,ref=1 Mw5@');
  return parseOpl(lines.join('\n'));
}
const ctx = { builtUpShare: () => 0, lampCoverage: () => 0, profile: () => null };

describe('segment-graph', () => {
  it('splits at junctions and merges degree-2 chains with equal signatures', () => {
    const d = plusData();
    const { segments } = buildSegments(d, ctx);
    expect(segments).toHaveLength(4);
    const chain = segments.find((s) => s.osmWayIds.includes(4))!;
    expect(chain.osmWayIds).toEqual([4, 5]);
    expect(chain.lit).toBe('no');
    expect(chain.surface).toBe('dirt');
    expect(chain.license).toBe('ODbL-1.0');
  });
  it('a route-membership change forces a segment boundary', () => {
    const { segments } = buildSegments(plusData(true), ctx);
    expect(segments).toHaveLength(5);
    expect(segments.find((s) => s.osmWayIds.includes(5))!.routeRelationIds).toEqual([7]);
  });
  it('splits a way passing through a junction node', () => {
    const d = parseOpl(['n1 T x0 y0', 'n2 T x0.001 y0', 'n3 T x0.002 y0', 'n4 T x0.001 y0.001', 'w1 Thighway=path Nn1,n2,n3', 'w2 Thighway=path Nn2,n4'].join('\n'));
    const ways = Array.from(d.ways.values());
    const pieces = splitWaysAtJunctions(ways, buildRouteMembership(d));
    expect(pieces.map((p) => p.nodes)).toEqual([[1, 2], [2, 3], [2, 4]]);
    expect(mergePieces(pieces)).toHaveLength(3);
  });
});

function seg(id: string, a: number, b: number, pa: LngLat, pb: LngLat, extra: Partial<TrailSegment> = {}): TrailSegment {
  return {
    id, startNode: a, endNode: b, geometry: [pa, pb], lengthM: 1000,
    elevation: { provider: 'copernicus-glo30', gainFwdM: 10, gainRevM: 2, maxGrade50mFwdPct: 4, maxGrade50mRevPct: 1, minEleM: 50, maxEleM: 60 },
    highwayClass: 'track', surface: 'dirt', surfaceRaw: null, surfaceConfidence: 'highway_default', lit: 'no', litSource: 'default_unlit_outside_built_up',
    sacScale: null, mtbScale: null, tracktype: null, colour: null, itcRef: null, name: null, inBuiltUp: false,
    osmWayIds: [1], routeRelationIds: [], foot: true, bicycle: true, license: 'ODbL-1.0', ...extra,
  };
}

describe('difficulty (NPS + technical + urban cap)', () => {
  it('NPS formula and buckets', () => {
    // 300 m gain over 10 km ≈ 984 ft × 6.21 mi → R ≈ 110.6
    expect(npsScore(300, 10_000)).toBeCloseTo(110.6, 0);
    expect(rateDifficulty({ gainM: 20, distM: 3000, builtUpShare: 0, maxGrade50mPct: 3, segments: [] }).final).toBe('easy');
    expect(rateDifficulty({ gainM: 120, distM: 8000, builtUpShare: 0, maxGrade50mPct: 3, segments: [] }).final).toBe('medium');
    expect(rateDifficulty({ gainM: 300, distM: 10_000, builtUpShare: 0, maxGrade50mPct: 3, segments: [] }).final).toBe('hard');
  });
  it('technical bump and urban cap; enum never "moderate"', () => {
    const steep = rateDifficulty({ gainM: 20, distM: 3000, builtUpShare: 0, maxGrade50mPct: 18, segments: [] });
    expect(steep.final).toBe('medium');
    expect(steep.technicalReasons).toContain('maxGrade50m>15%');
    const urban = rateDifficulty({ gainM: 300, distM: 10_000, builtUpShare: 0.9, maxGrade50mPct: 3, segments: [] });
    expect(urban).toMatchObject({ base: 'hard', urbanCapped: true, final: 'medium' });
    for (const r of [steep, urban]) expect(['easy', 'medium', 'hard']).toContain(r.final);
  });
  it('technical flags need real coverage, not a 5 m stub', () => {
    const segs = [{ lengthM: 5000, sacScale: null, mtbScale: null, tracktype: null, surfaceRaw: null }, { lengthM: 20, sacScale: 'demanding_mountain_hiking', mtbScale: '3', tracktype: 'grade5', surfaceRaw: 'scree' }];
    expect(technicalReasons({ maxGrade50mPct: null, segments: segs })).toEqual([]);
    segs[1].lengthM = 400;
    expect(technicalReasons({ maxGrade50mPct: null, segments: segs })).toHaveLength(4);
  });
  it('star prior weights and clamping', () => {
    const top = starPrior({ provenance: 'official_named', offBuiltUpShare: 1, nearNamedNature: true, greenShare: 1, amenityTypes: 9, offroadShare: 1, residentialShare: 0 });
    expect(top.total).toBe(5);
    const low = starPrior({ provenance: 'generated', offBuiltUpShare: 0, nearNamedNature: false, greenShare: 0, amenityTypes: 0, offroadShare: 0, residentialShare: 1 });
    expect(low.total).toBe(0.5);
    expect(isOfficialOperator('itc')).toBe(true);
    expect(isOfficialOperator('kkl;itc')).toBe(true);
    expect(isOfficialOperator('Friends Of Golani')).toBe(false);
  });
});

describe('naming rules', () => {
  const base: NamingInput = {
    colour: null, ref: null, shape: 'linear', geometry: [[34.5, 31.5], [34.52, 31.5]], namedWayLengths: [], builtUpShare: 0,
    parkName: null, toponyms: [], places: [], settlement: 'רוחמה', nextPlaceholderIndex: () => 1,
  };
  it('1. official name wins; bare numbers are not names', () => {
    expect(nameRoute({ ...base, relationTags: { name: 'שביל הבשור' } })).toMatchObject({ name: 'שביל הבשור', nameSource: 'osm_name' });
    expect(officialName({ name: '9251' })).toBeNull();
    expect(officialName({ name: 'X', 'name:he': 'שביל' })).toBe('שביל');
  });
  it('2. ITC colour + ref + toponym (most-traversed way, else nearby nature)', () => {
    const n = nameRoute({ ...base, colour: 'red', ref: '9251', toponyms: [{ name: 'נחל שקמה', kind: 'stream', geometry: [[34.51, 31.5005]] }] });
    expect(n).toMatchObject({ name: 'שביל אדום 9251 · נחל שקמה', nameSource: 'itc_colour_ref_toponym' });
    expect(dominantWayName([{ name: 'a', lengthM: 10 }, { name: 'b', lengthM: 5 }, { name: 'b', lengthM: 6 }])).toBe('b');
  });
  it('3. urban park loop / promenade', () => {
    expect(nameRoute({ ...base, builtUpShare: 0.9, shape: 'loop', parkName: 'פארק הכלניות' }).name).toBe('לולאת פארק הכלניות');
    expect(nameRoute({ ...base, builtUpShare: 0.9, namedWayLengths: [{ name: 'טיילת הנחל', lengthM: 500 }] }).name).toBe('טיילת הנחל');
  });
  it('4. endpoints, 5. placeholder flagged needsName', () => {
    const places = [{ name: 'דורות', kind: 'village', geometry: [[34.5, 31.5]] as LngLat[] }, { name: 'רוחמה', kind: 'village', geometry: [[34.52, 31.5]] as LngLat[] }];
    expect(nameRoute({ ...base, places }).name).toBe('דורות → רוחמה');
    expect(nameRoute(base)).toMatchObject({ name: 'מסלול רוחמה #1', nameSource: 'placeholder', needsName: true });
  });
  it('generated names are descriptive', () => {
    expect(generatedRouteName({ settlement: 'גבים', shape: 'loop', lengthM: 4200, via: null })).toBe('לולאת גבים · 4.2 ק״מ');
    expect(generatedRouteName({ settlement: 'גבים', shape: 'out_and_back', lengthM: 3000, via: 'נחל שקמה' })).toBe('הלוך-חזור מגבים · נחל שקמה · 3.0 ק״מ');
  });
});

describe('route assembly', () => {
  const A = seg('a', 1, 2, [0, 0], [0.01, 0]);
  const B = seg('b', 3, 2, [0.02, 0], [0.01, 0]); // stored reversed
  const C = seg('c', 3, 4, [0.02, 0], [0.03, 0]);
  it('orders segments end-to-end, flipping reversed ones', () => {
    const o = orderSegments([C, A, B]);
    expect(o.segmentIds).toEqual(['a', 'b', 'c']);
    expect(o.forward).toEqual([true, false, true]);
    expect(o.continuity).toBe(1);
    expect(o.gaps).toBe(0);
  });
  it('counts gaps and continuity for disconnected relation pieces', () => {
    const o = orderSegments([A, seg('z', 8, 9, [0.5, 0], [0.51, 0])]);
    expect(o.gaps).toBe(1);
    expect(o.continuity).toBe(0.5);
  });
  it('route stats sum elevation per traversal direction', () => {
    const s = routeStats([A, B], [true, false]);
    expect(s.gainM).toBe(12); // 10 fwd + 2 (B reversed → its gainRev)
    expect(s.lossM).toBe(12);
    expect(s.trailPct).toBe(100);
    // built-up segments (DSM roofs) don't count toward the open-country grade
    const roofy = seg('u', 2, 5, [0.01, 0], [0.01, 0.01], { inBuiltUp: true, elevation: { ...A.elevation!, maxGrade50mFwdPct: 30 } });
    const s2 = routeStats([A, roofy], [true, true]);
    expect(s2.maxGrade50mPct).toBe(30);
    expect(s2.maxGrade50mOpenPct).toBe(4);
  });
  it('shape + Jaccard dedup', () => {
    expect(classifyShape([[0, 0], [0.01, 0], [0.0001, 0.0001]], 2000)).toBe('loop');
    expect(jaccard(['a', 'b', 'c', 'd', 'e'], ['a', 'b', 'c', 'd'])).toBeCloseTo(0.8);
    const d = dedupBySegments([{ id: 'x', segmentIds: ['a', 'b', 'c', 'd'] }, { id: 'y', segmentIds: ['a', 'b', 'c', 'd', 'e'] }], (t) => (t.id === 'y' ? 0 : 1));
    expect(d.kept.map((k) => k.id)).toEqual(['y']);
    expect(d.merged[0]).toMatchObject({ id: 'x', into: 'y' });
  });
  it('generates a clean loop around a ring and an out-and-back on a line', () => {
    // square ring 1-2-3-4-1, each side 1 km → 4 km loop
    const ring = [seg('r1', 1, 2, [0, 0], [0.01, 0]), seg('r2', 2, 3, [0.01, 0], [0.01, 0.01]), seg('r3', 3, 4, [0.01, 0.01], [0, 0.01]), seg('r4', 4, 1, [0, 0.01], [0, 0])];
    const byId = new Map(ring.map((s) => [s.id, s]));
    const coord = (n: number): LngLat => ({ 1: [0, 0], 2: [0.01, 0], 3: [0.01, 0.01], 4: [0, 0.01] } as Record<number, LngLat>)[n];
    const c = generateFromStart(new SegmentGraph(ring), byId, 1, coord);
    const loop = c.find((x) => x.shape === 'loop')!;
    expect(loop.lengthM).toBe(4000);
    expect(loop.overlap).toBe(0);
    const line = [seg('l1', 1, 2, [0, 0], [0.01, 0]), seg('l2', 2, 3, [0.01, 0], [0.02, 0])];
    const lb = new Map(line.map((s) => [s.id, s]));
    const ob = generateFromStart(new SegmentGraph(line), lb, 1, (n) => [0.01 * (n - 1), 0]);
    expect(ob.map((x) => [x.shape, x.lengthM])).toEqual([['out_and_back', 2000], ['out_and_back', 4000]]);
  });
});
