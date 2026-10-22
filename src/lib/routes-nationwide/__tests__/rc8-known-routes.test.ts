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
});
