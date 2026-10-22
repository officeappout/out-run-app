import { describe, expect, it } from 'vitest';
import {
  BIKE_ADJ_MIN_M, bikeAdjacentCorridors, bikeAdjacentDoc, bikeAdjacentName, buildWalkIndex, motBikePieces, osmBikePieces, parallelWalkShare, walkablePieces, walkLines,
} from '../bike-adjacent';
import { STAGE_ORDER } from '../stages';
import { buildValidatedDoc } from '../../route-collections/validate';
import { routeScoreInputFromDoc } from '../../route-score/from-route-doc';
import type { UrbanWay } from '../../urban-measure/types';
import type { DatasetLine } from '../../dataset-import/types';

type LngLat = [number, number];
const O: LngLat = [34.78, 32.08];
const at = (e: number, n: number): LngLat => [O[0] + e / 94_300, O[1] + n / 111_200];
const lineE = (n: number, a: number, b: number, step = 50): LngLat[] => { const o: LngLat[] = []; for (let e = a; e <= b; e += step) o.push(at(e, n)); return o; };
const way = (id: number, highway: string, coords: LngLat[], tags: Record<string, string> = {}): UrbanWay => ({ id, highway, coords, tags: { highway, ...tags } });
const mot = (id: string, coords: LngLat[], attrs: Record<string, string>, name = 'הרצל'): DatasetLine => ({ featureId: id, name, status: 'שמיש', coords, attrs });

describe('bike_adjacent_walk — stage order', () => {
  it('runs right after named_ways', () => {
    expect(STAGE_ORDER.indexOf('bike_adjacent_walk')).toBe(STAGE_ORDER.indexOf('named_ways') + 1);
  });
});

describe('which bike pieces are walkable', () => {
  it('OSM: foot=designated / segregated / path with bicycle+foot / road with track + sidewalk', () => {
    const p = osmBikePieces([
      way(1, 'cycleway', lineE(0, 0, 500), { foot: 'designated' }),
      way(2, 'cycleway', lineE(0, 0, 500), { segregated: 'yes' }),
      way(3, 'cycleway', lineE(0, 0, 500)),
      way(4, 'path', lineE(0, 0, 500), { bicycle: 'designated' }),
      way(5, 'residential', lineE(0, 0, 500), { cycleway: 'track', sidewalk: 'both' }),
      way(6, 'footway', lineE(0, 0, 500)),
    ]);
    expect(p.map((x) => [x.id, x.footOk])).toEqual([['osm:1', true], ['osm:2', true], ['osm:3', false], ['osm:4', true], ['osm:5', true]]);
  });
  it('MoT: a path between the carriageway and the walking strip / beside walkers is walkable; an on-road lane is not by itself', () => {
    const p = motBikePieces([
      mot('a', lineE(0, 0, 500), { BPHPLACE: 'בין המיסעה לרצועת ההליכה' }),
      mot('b', lineE(0, 0, 500), { BPHPLACE: 'מיסעה', DIV_Walk: 'לא רלוונטי' }),
      mot('c', lineE(0, 0, 500), { BPHPLACE: 'מיסעה', DIV_Walk: 'צמוד להולכי רגל' }),
    ]);
    expect(p.map((x) => x.footOk)).toEqual([true, false, true]);
  });
  it('a bike-only piece is walkable when a footway runs within 15 m along ≥70% of it', () => {
    const idx = buildWalkIndex(walkLines([way(9, 'footway', lineE(10, 0, 800))]));
    expect(parallelWalkShare(lineE(0, 0, 1000), idx)).toBeCloseTo(0.8, 1);
    const pieces = osmBikePieces([way(3, 'cycleway', lineE(0, 0, 1000)), way(4, 'cycleway', lineE(0, 0, 500))]);
    const r = walkablePieces(pieces, idx);
    expect(r.byParallel).toBe(2);
    const far = walkablePieces(osmBikePieces([way(3, 'cycleway', lineE(40, 0, 1000))]), idx);
    expect(far.dropped).toBe(1);
  });
});

describe('corridors', () => {
  const idx = buildWalkIndex([]);
  it('stitches walkable pieces ≥1.5 km, MoT first; an OSM copy of a MoT corridor is dropped; the tree hint rides along', () => {
    const motLines = [0, 1, 2, 3].map((k) => mot(`m${k}`, lineE(0, k * 500, (k + 1) * 500), { BPHPLACE: 'שדרה/מדרחוב', Trees: 'בשני צדדים' }));
    const osm = osmBikePieces([way(1, 'cycleway', lineE(3, 0, 2000), { foot: 'yes' }), way(2, 'cycleway', lineE(800, 0, 1600), { foot: 'yes' }), way(3, 'cycleway', lineE(1600, 0, 900), { foot: 'yes' })]);
    const { corridors, report } = bikeAdjacentCorridors(motBikePieces(motLines), osm, idx);
    expect(report.motCorridors).toBe(1);
    expect(report.osmCorridors).toBe(1); // the copy at 3 m is dropped; the 1.6 km one at 800 m stays; 0.9 km is too short
    expect(corridors.map((c) => c.source)).toEqual(['mot', 'osm']);
    expect(corridors[0].shadeHint).toBeCloseTo(0.3, 3);
    expect(corridors.every((c) => c.lengthM >= BIKE_ADJ_MIN_M)).toBe(true);
  });

  it('an open corridor becomes a clearly labelled out-and-back; a closed one a loop; both validate', () => {
    const open = { name: 'שביל אופניים איילון', featureIds: ['osm:1'], coords: lineE(0, 0, 2000), lengthM: 2000, closed: false, source: 'osm' as const, shadeHint: null };
    const d = bikeAdjacentDoc(open, { authorityId: 'A', city: 'עיר', importBatchId: 'b', osmSnapshot: null, fallbackBase: 'x' });
    expect(d.data.name).toBe('לאורך שביל אופניים איילון · הלוך-חזור');
    expect(d.data.routeShape).toBe('out_and_back');
    expect(d.data.distance).toBeCloseTo(4, 1);
    expect(String(d.data.description)).toMatch(/הלוך וחזור/);
    const v = buildValidatedDoc('official_routes', d.data, { mode: 'create', knownAuthorityIds: new Set(['A']) });
    const input = routeScoreInputFromDoc(d.id, v as Record<string, any>);
    expect(input.shape).toBe('out_and_back');
    expect(input.surfaceClass).toBe('walk_run_paved');
    expect(input.urbanKind).toBe('bike_adjacent');
    expect(bikeAdjacentName('הרצל', true)).toBe('לאורך הרצל');
    const nameless = bikeAdjacentDoc({ ...open, name: '' }, { authorityId: 'A', city: 'עיר', importBatchId: 'b', osmSnapshot: null, fallbackBase: 'פארק הירקון' });
    expect(nameless.data.name).toBe('לאורך פארק הירקון · הלוך-חזור');
    expect(bikeAdjacentDoc({ ...open, name: '2461' }, { authorityId: 'A', city: 'עיר', importBatchId: 'b', osmSnapshot: null, fallbackBase: 'הרצל' }).data.name).toBe('לאורך הרצל · הלוך-חזור');
    expect(input.sourceTier).toBe('stitched');
  });

  it('a MoT corridor credits the ministry (one licence per route)', () => {
    const c = { name: 'הרצל', featureIds: ['mot:1'], coords: lineE(0, 0, 2000), lengthM: 2000, closed: false, source: 'mot' as const, shadeHint: 0.2 };
    const d = bikeAdjacentDoc(c, { authorityId: 'A', city: 'עיר', importBatchId: 'b', osmSnapshot: null, fallbackBase: 'x', motAttribution: { license: 'other-open (data.gov.il)', attribution: 'משרד התחבורה והבטיחות בדרכים — data.gov.il', url: 'u' } });
    expect((d.data.provenance as any).dataset.attribution).toBe('משרד התחבורה והבטיחות בדרכים — data.gov.il');
    expect((d.data.provenance as any).osm).toBeUndefined();
    expect(routeScoreInputFromDoc(d.id, d.data).sourceTier).toBe('official');
  });
});
