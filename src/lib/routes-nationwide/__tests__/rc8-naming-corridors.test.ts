import { describe, expect, it } from 'vitest';
import { buildPathIndex, type ParkPolygon, type PathLine } from '../../park-loops';
import { buildValidatedDoc } from '../../route-collections/validate';
import { routeScoreInputFromDoc } from '../../route-score/from-route-doc';
import { corridorDoc, corridorEligible, namedCorridors, stitchSameName, type NamedWay } from '../named-corridors';
import { generatedLoopName, loopNameParts, nameGeneratedLoop, type NamingContext } from '../route-naming';

type LngLat = [number, number];
const M = 1 / 94_500; // ≈ degrees of lng per metre at 32°N
const seg = (x0: number, x1: number, y = 32.1): LngLat[] => Array.from({ length: 6 }, (_, k) => [34.8 + (x0 + ((x1 - x0) * k) / 5) * M, y]);

describe('named corridors', () => {
  it('stitches same-name pieces end to end (either direction) and keeps the OSM name', () => {
    const ways: NamedWay[] = [
      { id: 3, name: 'טיילת הים', highway: 'footway', coords: seg(1000, 600) }, // reversed piece
      { id: 1, name: 'טיילת הים', highway: 'footway', coords: seg(0, 600) },
      { id: 2, name: 'טיילת הים', highway: 'pedestrian', coords: seg(1000, 1500) },
      { id: 9, name: 'טיילת הים', highway: 'footway', coords: seg(5000, 5100) }, // far away: separate
    ];
    const c = stitchSameName(ways);
    expect(c).toHaveLength(2);
    expect(c[0]).toMatchObject({ name: 'טיילת הים', wayIds: [1, 2, 3], closed: false });
    expect(c[0].lengthM).toBeGreaterThan(1450);
    expect(namedCorridors(ways).map((x) => x.wayIds)).toEqual([[1, 2, 3]]); // the 100 m stub is too short
  });
  it('a plain street is not a route; a street named as a promenade/park path is', () => {
    expect(corridorEligible({ id: 1, name: 'הרצל', highway: 'residential', coords: seg(0, 900) })).toBe(false);
    expect(corridorEligible({ id: 1, name: 'טיילת לואי', highway: 'residential', coords: seg(0, 900) })).toBe(true);
    expect(corridorEligible({ id: 1, name: 'שביל הנחל', highway: 'path', coords: seg(0, 900) })).toBe(true);
  });
  it('the doc is valid, a linear corridor, and scores as a named place', () => {
    const [c] = namedCorridors([{ id: 1, name: 'טיילת הים', highway: 'footway', coords: seg(0, 600) }, { id: 2, name: 'טיילת הים', highway: 'footway', coords: seg(600, 1500) }]);
    const d = corridorDoc(c, { authorityId: 'a1', city: 'עיר', osmSnapshot: null, importBatchId: 'b' });
    expect(d.data.name).toBe('טיילת הים');
    buildValidatedDoc('official_routes', d.data, { mode: 'create', knownAuthorityIds: new Set(['a1']) });
    const input = routeScoreInputFromDoc(d.id, d.data);
    expect(input.sourceTier).toBe('named_place');
    expect(input.shape).toBe('linear_corridor');
  });
});

describe('generated loop names', () => {
  const sq = (x: number, y: number, s: number): LngLat[] => [[x, y], [x + s, y], [x + s, y + s], [x, y + s], [x, y]];
  const loop = sq(34.8, 32.1, 0.01);
  const lines: PathLine[] = [
    { id: 'way/1', coords: [loop[0], loop[1]], highway: 'residential' },
    { id: 'way/2', coords: [loop[1], loop[2]], highway: 'residential' },
    { id: 'way/3', coords: [loop[2], loop[3], loop[4]], highway: 'residential' },
  ];
  const ctx: NamingContext = { namedLines: buildPathIndex(lines), names: new Map([['way/1', 'הרצל'], ['way/2', 'ויצמן'], ['way/3', 'בן גוריון']]), parks: [], places: [{ name: 'נווה עמל', coord: [34.805, 32.105] }] };
  it('follows the streets it runs longest on, never a placeholder', () => {
    const p = loopNameParts(loop, ctx);
    expect(p.streets).toEqual(['בן גוריון', 'ויצמן']); // N-S sides are longer (lat degrees)
    expect(nameGeneratedLoop(loop, ctx, 'עיר').name).toMatch(/^לולאת בן גוריון · ויצמן \(נווה עמל\) · \d\.\d ק״מ$/);
  });
  it('a loop through a big park is named after the park', () => {
    const park: ParkPolygon = { id: 'way/9', name: 'פארק הירקון', rings: [sq(34.799, 32.099, 0.012)], areaM2: 1e6, perimeterM: 5000, kind: 'park' };
    expect(nameGeneratedLoop(loop, { ...ctx, parks: [park] }, 'עיר').name).toMatch(/^לולאת פארק הירקון · בן גוריון · /);
  });
  it('fallbacks: neighbourhood, then the city', () => {
    expect(generatedLoopName({ park: null, streets: [], place: 'נווה עמל' }, 4200, 'עיר')).toBe('לולאת נווה עמל · 4.2 ק״מ');
    expect(generatedLoopName({ park: null, streets: [], place: null }, 4200, 'הרצליה')).toBe('לולאה שכונתית בהרצליה · 4.2 ק״מ');
  });
});
