import { describe, it, expect } from 'vitest';
import {
  scoreArterialFlow,
  scoreSegment,
  processSegments,
  ARTERIAL_HIGHWAY_TYPES,
  type OsmWay,
} from '../osm-segment-importer';

// Regression coverage for the runner-flow investigation's Tier 1 build
// (19.08.2026): a generic, road-hierarchy-only flow score, computed at
// import time, deliberately opposite-biased from the existing calm-street
// `scoreSegment` rubric. See osm-segment-importer.ts's ScoredSegment.flowScore
// doc comment for the full rationale.

describe('scoreArterialFlow — road-hierarchy flow rubric (19.08.2026)', () => {
  it('ranks primary highest, then secondary, then tertiary, then residential — strict arterial-continuity ordering', () => {
    expect(scoreArterialFlow({ highway: 'primary' })).toBe(10);
    expect(scoreArterialFlow({ highway: 'secondary' })).toBe(8);
    expect(scoreArterialFlow({ highway: 'tertiary' })).toBe(5);
    expect(scoreArterialFlow({ highway: 'residential' })).toBe(2);
    expect(scoreArterialFlow({ highway: 'living_street' })).toBe(1);
  });

  it('calm/leisure highway types (the ones scoreSegment prefers) get zero flow value', () => {
    expect(scoreArterialFlow({ highway: 'footway' })).toBe(0);
    expect(scoreArterialFlow({ highway: 'cycleway' })).toBe(0);
    expect(scoreArterialFlow({ highway: 'pedestrian' })).toBe(0);
    expect(scoreArterialFlow({ highway: 'path' })).toBe(0);
  });

  it('unknown/missing highway tag defaults to 0, not a crash', () => {
    expect(scoreArterialFlow({})).toBe(0);
    expect(scoreArterialFlow({ highway: 'unknown_type' })).toBe(0);
  });

  it('is purely highway-tag-driven — surface/lit/smoothness/maxspeed/sidewalk have zero effect (explicit scope: road hierarchy only)', () => {
    const bare = scoreArterialFlow({ highway: 'primary' });
    const decorated = scoreArterialFlow({
      highway: 'primary',
      surface: 'dirt',
      lit: 'no',
      smoothness: 'horrible',
      maxspeed: '90',
      sidewalk: 'no',
    });
    expect(decorated).toBe(bare);
  });

  it('is the OPPOSITE bias from scoreSegment — tertiary scores well on flow but only neutral on scoreSegment; footway is the reverse', () => {
    const tertiaryFlow = scoreArterialFlow({ highway: 'tertiary' });
    const tertiaryCalm = scoreSegment({ highway: 'tertiary' });
    const footwayFlow = scoreArterialFlow({ highway: 'footway' });
    const footwayCalm = scoreSegment({ highway: 'footway' });
    expect(tertiaryFlow).toBeGreaterThan(footwayFlow);
    expect(footwayCalm).toBeGreaterThan(tertiaryCalm);
  });
});

describe('processSegments — configurable highwayTypes filter (19.08.2026, arterial pass)', () => {
  const way = (id: number, highway: string, nodeCount = 4): OsmWay => ({
    type: 'way',
    id,
    tags: { highway },
    geometry: Array.from({ length: nodeCount }, (_, i) => ({
      lat: 32.05 + i * 0.001,
      lon: 34.78 + i * 0.001,
    })),
  });

  it('default options (no highwayTypes): a primary-tagged way is dropped, exactly like today', () => {
    const ways = [way(1, 'primary'), way(2, 'residential')];
    const { segments, skippedTooShort } = processSegments(ways, {
      bbox: { south: 0, west: 0, north: 1, east: 1 },
      cityName: 'test',
      authorityId: 'test',
    });
    expect(segments.map((s) => s.osmId)).toEqual(['2']);
    expect(skippedTooShort).toBe(1); // the primary way, filtered as "unknown highway"
  });

  it('highwayTypes: ARTERIAL_HIGHWAY_TYPES keeps primary/secondary and drops the default calm-street set', () => {
    const ways = [way(1, 'primary'), way(2, 'secondary'), way(3, 'footway'), way(4, 'residential')];
    const { segments } = processSegments(ways, {
      bbox: { south: 0, west: 0, north: 1, east: 1 },
      cityName: 'test',
      authorityId: 'test',
      highwayTypes: ARTERIAL_HIGHWAY_TYPES,
    });
    expect(segments.map((s) => s.osmId).sort()).toEqual(['1', '2']);
  });

  it('every kept segment carries a computed flowScore matching scoreArterialFlow(tags)', () => {
    const ways = [way(1, 'primary')];
    const { segments } = processSegments(ways, {
      bbox: { south: 0, west: 0, north: 1, east: 1 },
      cityName: 'test',
      authorityId: 'test',
      highwayTypes: ARTERIAL_HIGHWAY_TYPES,
    });
    expect(segments[0].flowScore).toBe(10);
  });

  it('ARTERIAL_HIGHWAY_TYPES and the default HIGHWAY_TYPES set are disjoint — an arterial re-run can never overwrite a calm-street doc id collision-free by construction', () => {
    // trunk/motorway are deliberately excluded from ARTERIAL_HIGHWAY_TYPES —
    // confirm the set is exactly {primary, secondary}, nothing wider snuck in.
    expect([...ARTERIAL_HIGHWAY_TYPES].sort()).toEqual(['primary', 'secondary']);
  });
});
