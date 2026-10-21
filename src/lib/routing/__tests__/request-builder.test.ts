import { describe, expect, it } from 'vitest';
import { buildCustomModel, buildRoundTripRequest, buildViaRequest, DEFAULT_TAGS, PARKS_AREA_ID, profileForActivity, readFootProfile, type GeoJsonPolygonFeature } from '../graphhopper';

const S = { lat: 32.0779, lng: 34.774 };
const square = (x: number): GeoJsonPolygonFeature => ({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[x, 32], [x + 0.01, 32], [x + 0.01, 32.01], [x, 32]]] } });

describe('custom model from tags', () => {
  it('foot + default tags = quiet streets then safe crossings (the measured model)', () => {
    const cm = buildCustomModel('foot', DEFAULT_TAGS)!;
    expect(cm.priority[0]).toEqual({ if: 'road_class == MOTORWAY || road_class == TRUNK || road_class == PRIMARY', multiply_by: '0.08' });
    expect(cm.priority.map(s => s.multiply_by)).toEqual(['0.08', '0.15', '0.3', '0.6', '0.8', '0.5', '0.2', '0.8']);
    expect(cm.areas).toBeUndefined();
  });
  it('every multiplier is <= 1 (GraphHopper rejects > 1 for priority without a max)', () => {
    for (const p of ['foot', 'bike'] as const) for (const s of buildCustomModel(p, DEFAULT_TAGS)!.priority) expect(Number(s.multiply_by)).toBeLessThanOrEqual(1);
  });
  it('no tags → no custom model; out_run already carries them server-side', () => {
    expect(buildCustomModel('foot', {})).toBeNull();
    expect(buildCustomModel('out_run', DEFAULT_TAGS)).toBeNull();
  });
  it('crossing rules are foot-only', () => {
    expect(buildCustomModel('bike', { avoidUnmarkedCrossings: true })).toBeNull();
    expect(buildCustomModel('bike', DEFAULT_TAGS)!.priority.some(s => (s.if ?? s.else_if)?.includes('crossing'))).toBe(false);
  });
  it('parks: one MultiPolygon area referenced as in_parks', () => {
    const cm = buildCustomModel('foot', { preferParks: [square(34.77), { ...square(34.78), geometry: { type: 'MultiPolygon', coordinates: [[[[34.78, 32], [34.79, 32], [34.78, 32.01], [34.78, 32]]]] } }] })!;
    expect(cm.priority).toEqual([{ if: `!in_${PARKS_AREA_ID}`, multiply_by: '0.85' }]);
    expect(cm.areas!.features).toHaveLength(1);
    expect(cm.areas!.features[0].id).toBe('parks');
    expect((cm.areas!.features[0].geometry.coordinates as unknown[]).length).toBe(2);
  });
});

describe('request bodies', () => {
  it('round trip: [lng,lat], rounded distance, seed, normalised heading, details', () => {
    const b = buildRoundTripRequest({ start: S, distanceM: 4999.6, seed: 7.9, heading: -30, profile: 'foot', tags: DEFAULT_TAGS });
    expect(b).toMatchObject({
      profile: 'foot', points: [[34.774, 32.0779]], algorithm: 'round_trip', 'round_trip.distance': 5000, 'round_trip.seed': 7,
      headings: [330], points_encoded: false, instructions: false, elevation: true, 'ch.disable': true,
    });
    expect(b.details).toEqual(['road_class', 'crossing', 'surface']);
    expect(b.custom_model?.priority.length).toBe(8);
  });
  it('round trip without heading has no headings key; tiny distances are floored', () => {
    const b = buildRoundTripRequest({ start: S, distanceM: 10, seed: 1, profile: 'bike', tags: {} });
    expect(b.headings).toBeUndefined();
    expect(b['round_trip.distance']).toBe(200);
    expect(b.custom_model).toBeUndefined();
  });
  it('via loop uses pass_through; A→B does not', () => {
    const loop = buildViaRequest([S, { lat: 32.08, lng: 34.78 }, { lat: 32.07, lng: 34.78 }, S], 'foot', DEFAULT_TAGS);
    expect(loop.pass_through).toBe(true);
    expect(loop.points).toHaveLength(4);
    expect(buildViaRequest([S, { lat: 32.08, lng: 34.78 }], 'foot', DEFAULT_TAGS).pass_through).toBeUndefined();
    expect(() => buildViaRequest([S], 'foot', {})).toThrow();
  });
  it('activity → profile', () => {
    expect(profileForActivity('running')).toBe('foot');
    expect(profileForActivity('walking')).toBe('foot');
    expect(profileForActivity('cycling')).toBe('bike');
    expect(profileForActivity('cycling', { mtb: true })).toBe('mtb');
  });
  it('foot_turns: opt-in foot profile, same OUT layers as foot, cycling unaffected', () => {
    expect(profileForActivity('running', { foot: 'foot_turns' })).toBe('foot_turns');
    expect(profileForActivity('walking', { foot: 'foot_turns' })).toBe('foot_turns');
    expect(profileForActivity('cycling', { foot: 'foot_turns' })).toBe('bike');
    expect(buildCustomModel('foot_turns', DEFAULT_TAGS)).toEqual(buildCustomModel('foot', DEFAULT_TAGS));
  });
  it('GRAPHHOPPER_FOOT_PROFILE → foot unless exactly foot_turns', () => {
    expect(readFootProfile({})).toBe('foot');
    expect(readFootProfile({ GRAPHHOPPER_FOOT_PROFILE: ' foot_turns ' })).toBe('foot_turns');
    expect(readFootProfile({ GRAPHHOPPER_FOOT_PROFILE: 'out_run' })).toBe('foot');
  });
});
