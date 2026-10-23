import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { buildValidatedDoc } from '../../route-collections/validate';
import { routeScoreInputFromDoc } from '../../route-score/from-route-doc';
import { knownNames, knownRouteWaysDoc, matchKnownRoutes, nameKey, namesMatch, parseKnownRoutesFile, type KnownRoute } from '../known-routes';
import type { NamedWay } from '../named-corridors';

type LngLat = [number, number];
const M = 1 / 94_500;
const seg = (x0: number, x1: number): LngLat[] => Array.from({ length: 6 }, (_, k) => [34.8 + (x0 + ((x1 - x0) * k) / 5) * M, 32.1]);
const K = (o: Partial<KnownRoute> & { name: string }): KnownRoute => ({ aliases: [], kind: 'walk', lengthKm: null, inPark: null, description: 'd', sources: [{ url: 'https://example.org/x', title: 't' }], ...o });

describe('known routes (web research)', () => {
  it('rejects forbidden sources and nameless / sourceless entries', () => {
    const { file, errors } = parseKnownRoutesFile({ authorityId: 'a', city: 'c', routes: [
      { name: 'טיילת', sources: [{ url: 'https://www.strava.com/segments/1', title: 's' }] },
      { name: 'בלי מקור', sources: [] },
      { name: '', sources: [{ url: 'https://x.org' }] },
      { name: 'פארק המסילה', sources: [{ url: 'https://timeout.co.il/x', title: 'x' }] },
    ] });
    expect(file!.routes.map((r) => r.name)).toEqual(['פארק המסילה']);
    expect(errors).toHaveLength(3);
    expect(errors[0]).toMatch(/forbidden source/);
  });
  it('every committed research file parses cleanly and cites no forbidden source', () => {
    const dir = path.join(process.cwd(), 'docs', 'routes', 'known-routes');
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
      const { file, errors } = parseKnownRoutesFile(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
      expect(file?.authorityId, f).toBe(f.replace(/\.json$/, ''));
      expect(errors, f).toEqual([]);
    }
  });
  it('name matching tolerates quotes, dashes and the definite article — never a 1-word substring guess', () => {
    expect(nameKey('טיילת הבה"ד')).toBe(nameKey('טיילת בה״ד'));
    expect(namesMatch('פארק המסילה', knownNames(K({ name: 'פארק המסילה' })))).toBe(true);
    expect(namesMatch('טיילת תל אביב - יפו', knownNames(K({ name: 'טיילת תל אביב-יפו' })))).toBe(true);
    expect(namesMatch('שביל הירקון', knownNames(K({ name: 'שביל הירקון: כיכר היל - נמל תל אביב' })))).toBe(true);
    expect(namesMatch('המסילה', knownNames(K({ name: 'פארק המסילה' })))).toBe(false);
    expect(knownNames(K({ name: 'שביל ההליכה של העיר', nameIsDescriptive: true, aliases: [] }))).toEqual([]);
  });
  it('matches in order: existing → relation → named ways → park; reports the rest', () => {
    const ways: NamedWay[] = [
      { id: 1, name: 'טיילת לואי', highway: 'footway', coords: seg(0, 300) },
      { id: 2, name: 'טיילת לואי', highway: 'footway', coords: seg(300, 700) },
    ];
    const { matches, unmatched } = matchKnownRoutes({ authorityId: 'a', city: 'c', researchedAt: '2026-10-22', routes: [
      K({ name: 'פארק המסילה' }), K({ name: 'שביל חיפה' }), K({ name: 'טיילת לואי' }), K({ name: 'גן הפעמון', inPark: 'פארק נחל באר שבע' }), K({ name: 'שביל שלא קיים בכלל' }),
    ] }, {
      existing: [{ id: 'e1', name: 'פארק המסילה' }],
      relations: [{ id: 'r1', name: 'שביל חיפה' }],
      parkLoops: [{ id: 'p1', parkName: 'פארק נחל באר שבע' }],
      ways,
      inside: () => true,
    });
    expect(matches.map((m) => `${m.route.name}:${m.kind}:${m.candidateId}`)).toEqual(['פארק המסילה:existing:e1', 'שביל חיפה:osm_relation:r1', 'טיילת לואי:osm_ways:null', 'גן הפעמון:park_loop:p1']);
    expect(matches[2].corridor!.wayIds).toEqual([1, 2]);
    expect(unmatched.map((k) => k.name)).toEqual(['שביל שלא קיים בכלל']);
  });
  it('a ways match becomes a valid, cited, named_place doc', () => {
    const k = K({ name: 'טיילת לואי', kind: 'walk' });
    const { matches } = matchKnownRoutes({ authorityId: 'a1', city: 'חיפה', researchedAt: '2026-10-22', routes: [k] }, { existing: [], relations: [], parkLoops: [], ways: [{ id: 5, name: 'טיילת לואי', highway: 'pedestrian', coords: seg(0, 700) }], inside: () => true });
    const d = knownRouteWaysDoc(k, matches[0].corridor!, { authorityId: 'a1', city: 'חיפה', researchedAt: '2026-10-22', osmSnapshot: null, importBatchId: 'b' });
    buildValidatedDoc('official_routes', d.data, { mode: 'create', knownAuthorityIds: new Set(['a1']) });
    expect(d.data).toMatchObject({ name: 'טיילת לואי', origin: 'web_research', knownRoute: { matchedBy: 'osm_ways', sources: [{ url: 'https://example.org/x', title: 't' }] } });
    expect(routeScoreInputFromDoc(d.id, d.data).sourceTier).toBe('named_place');
  });
  it('a bike route is stamped with the shared cycling pace + kcal; a walk keeps running pace', () => {
    const ctx = { authorityId: 'a1', city: 'חיפה', researchedAt: '2026-10-22', osmSnapshot: null, importBatchId: 'b' };
    const way = [{ id: 5, name: 'שביל אופניים', highway: 'cycleway', coords: seg(0, 3000) }];
    const input = { existing: [], relations: [], parkLoops: [], ways: way, inside: () => true };
    const bike = K({ name: 'שביל אופניים', kind: 'bike' });
    const walk = K({ name: 'שביל אופניים', kind: 'walk' });
    const b = matchKnownRoutes({ authorityId: 'a1', city: 'חיפה', researchedAt: '2026-10-22', routes: [bike] }, input).matches[0];
    const w = matchKnownRoutes({ authorityId: 'a1', city: 'חיפה', researchedAt: '2026-10-22', routes: [walk] }, input).matches[0];
    const bd = knownRouteWaysDoc(bike, b.corridor!, ctx).data as { distance: number; duration: number; calories: number };
    const wd = knownRouteWaysDoc(walk, w.corridor!, ctx).data as { distance: number; duration: number; calories: number };
    expect(bd.duration).toBe(Math.max(1, Math.round((bd.distance * 1000) / (20000 / 60))));
    expect(bd.calories).toBe(Math.round(bd.distance * 25));
    expect(wd.calories).toBe(Math.round(wd.distance * 65));
    expect(wd.duration).toBeGreaterThan(bd.duration);
  });
});

describe('known routes — promenades / boulevards', () => {
  const ctx = { authorityId: 'a1', city: 'תל אביב', researchedAt: '2026-10-23', osmSnapshot: null, importBatchId: 'b' };
  const segY = (x0: number, x1: number, y: number): LngLat[] => Array.from({ length: 6 }, (_, k) => [34.8 + (x0 + ((x1 - x0) * k) / 5) * M, y]);
  const roThways: NamedWay[] = [
    { id: 10, name: 'שדרות רוטשילד', highway: 'tertiary', coords: segY(0, 1940, 32.1) }, // 1.94 km road chain
    { id: 20, name: 'שדרות רוטשילד', highway: 'pedestrian', coords: segY(100, 467, 32.1004) }, // 367 m pedestrian strip
  ];
  it('prefers the pedestrian chain over the longer parallel road chain', () => {
    const k = K({ name: 'שדרות רוטשילד' });
    const { matches } = matchKnownRoutes({ authorityId: 'a1', city: 'c', researchedAt: 'x', routes: [k] }, { existing: [], relations: [], parkLoops: [], ways: roThways, inside: () => true });
    expect(matches[0].kind).toBe('osm_ways');
    expect(matches[0].corridor!.wayIds).toEqual([20]);
    expect(matches[0].corridor!.lengthM).toBeLessThan(400);
  });
  it('a non-promenade name still takes the longest chain (no behaviour change)', () => {
    const ways: NamedWay[] = [
      { id: 1, name: 'שביל הנחל', highway: 'tertiary', coords: segY(0, 1940, 32.1) },
      { id: 2, name: 'שביל הנחל', highway: 'footway', coords: segY(100, 467, 32.1004) },
    ];
    const { matches } = matchKnownRoutes({ authorityId: 'a1', city: 'c', researchedAt: 'x', routes: [K({ name: 'שביל הנחל' })] }, { existing: [], relations: [], parkLoops: [], ways, inside: () => true });
    expect(matches[0].corridor!.wayIds).toEqual([1]); // the separate (unconnected) footway is not preferred: longest chain wins
    expect(matches[0].corridor!.lengthM).toBeGreaterThan(1500);
  });
  it('falls back to the road chain when there is no pedestrian chain; the doc carries the low-confidence flag only for the strip', () => {
    const k = K({ name: 'שדרות רוטשילד' });
    const only = [roThways[0]];
    const m1 = matchKnownRoutes({ authorityId: 'a1', city: 'c', researchedAt: 'x', routes: [k] }, { existing: [], relations: [], parkLoops: [], ways: only, inside: () => true });
    expect(m1.matches[0].corridor!.wayIds).toEqual([10]);
    expect(m1.matches[0].corridor!.lowConfidence).toBeUndefined();
    const m2 = matchKnownRoutes({ authorityId: 'a1', city: 'c', researchedAt: 'x', routes: [k] }, { existing: [], relations: [], parkLoops: [], ways: roThways, inside: () => true });
    const d = knownRouteWaysDoc(k, m2.matches[0].corridor!, ctx);
    expect(d.data.lowConfidence).toEqual({ reason: 'promenade_hint' });
    buildValidatedDoc('official_routes', d.data, { mode: 'create', knownAuthorityIds: new Set(['a1']) });
    expect(routeScoreInputFromDoc(d.id, d.data)).toMatchObject({ lowConfidenceReason: 'promenade_hint', knownRoute: true });
  });
  it('names match across NBSP / bidi marks', () => {
    expect(nameKey('שדרות רוטשילד‏')).toBe('שדרות רוטשילד');
    expect(namesMatch('שדרות רוטשילד', knownNames(K({ name: 'שדרות רוטשילד' })))).toBe(true);
  });
});
