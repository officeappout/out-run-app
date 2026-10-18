import { describe, it, expect } from 'vitest';
import { disambiguateDuplicateNames, endpointNames, type NamedFeature } from '../naming';
import { authorityNameCandidates, chunk, dominantSurface, segmentDoc, stableStringify, toRouteShape } from '../firestore-docs';
import { flagValue, parseApplyFlags, validateApplyFlags } from '../../../../scripts/trails/lib/trails-apply.node';
import type { LngLat, TrailSegment } from '../types';

const line = (x0: number, x1: number, y = 31.5): LngLat[] => [[x0, y], [x1, y]];
const f = (name: string, p: LngLat): NamedFeature => ({ name, kind: 'ruins', geometry: [p] });

describe('duplicate-name disambiguation', () => {
  // The pilot's real collision: two unref'd red trails both named after the nearest ruin.
  const name = "שביל אדום · חורבת ג'ממה";
  const toponyms = [f("חורבת ג'ממה", [34.55, 31.501]), f('מערות הכורכר', [34.50, 31.501]), f('קלחים', [34.60, 31.501])];

  it('appends the next distinct toponym — the one closer to THIS route', () => {
    const out = disambiguateDuplicateNames([
      { id: 'osm_rel_2810497', name, ref: null, geometry: line(34.56, 34.60) },
      { id: 'osm_rel_21451577', name, ref: null, geometry: line(34.50, 34.54) },
    ], toponyms);
    expect(out.get('osm_rel_21451577')).toBe(`${name} · מערות הכורכר`);
    expect(out.get('osm_rel_2810497')).toBe(`${name} · קלחים`);
  });

  it('prefers a unique ITC ref, leaves unique names untouched', () => {
    const out = disambiguateDuplicateNames([
      { id: 'a', name: 'שביל שחור · נחל', ref: '9251', geometry: line(34.5, 34.51) },
      { id: 'b', name: 'שביל שחור · נחל', ref: null, geometry: line(34.6, 34.61) },
      { id: 'c', name: 'ייחודי', ref: null, geometry: line(34.7, 34.71) },
    ], [f('גבעה', [34.6, 31.5005])]);
    expect(out.get('a')).toBe('שביל שחור · נחל · 9251');
    expect(out.get('b')).toBe('שביל שחור · נחל · גבעה');
    expect(out.has('c')).toBe(false);
  });

  it('falls back to a deterministic ordinal when nothing distinguishes them', () => {
    const out = disambiguateDuplicateNames([
      { id: 'y', name: 'X', ref: null, geometry: line(34.5, 34.51) },
      { id: 'x', name: 'X', ref: null, geometry: line(34.5, 34.51) },
    ], []);
    expect(out.get('x')).toBe('X (1)');
    expect(out.get('y')).toBe('X (2)');
    expect(new Set(out.values()).size).toBe(2);
  });

  it('endpoint names for the one-way "A → B" label', () => {
    expect(endpointNames(line(34.5, 34.52), [f('דורות', [34.5, 31.5]), f('רוחמה', [34.52, 31.5])])).toEqual({ from: 'דורות', to: 'רוחמה' });
    expect(endpointNames(line(34.5, 34.52), [])).toEqual({ from: null, to: null });
  });
});

describe('firestore docs (pure)', () => {
  const s: TrailSegment = {
    id: 'seg_1_1_2', startNode: 1, endNode: 2, geometry: line(34.5, 34.51), lengthM: 950, elevation: null,
    highwayClass: 'track', surface: 'dirt', surfaceRaw: null, surfaceConfidence: 'highway_default', lit: 'no', litSource: 'default_unlit_outside_built_up',
    sacScale: null, mtbScale: null, tracktype: null, colour: null, itcRef: null, name: null, inBuiltUp: false,
    osmWayIds: [1], routeRelationIds: [], foot: true, bicycle: true, license: 'ODbL-1.0',
  };
  it('segment doc: {lng,lat} geometry (no nested arrays), provenance fields', () => {
    const d = segmentDoc(s, { authorityId: 'A', osmTimestamp: 't' });
    expect(d.id).toBe('seg_1_1_2');
    expect(d.data.geometry).toEqual([{ lng: 34.5, lat: 31.5 }, { lng: 34.51, lat: 31.5 }]);
    expect(d.data).toMatchObject({ authorityId: 'A', source: 'osm_geofabrik_v1', license: 'ODbL-1.0', elevation: null });
  });
  it('shape mapping keeps existing values, linear → point_to_point', () => {
    expect(toRouteShape('linear')).toBe('point_to_point');
    expect(toRouteShape('loop')).toBe('loop');
    expect(toRouteShape('out_and_back')).toBe('out_and_back');
  });
  it('stable stringify ignores key order; chunk caps at 400', () => {
    expect(stableStringify({ b: 1, a: { d: [1, 2], c: null } })).toBe(stableStringify({ a: { c: null, d: [1, 2] }, b: 1 }));
    expect(chunk(Array.from({ length: 801 }), 400).map((c) => c.length)).toEqual([400, 400, 1]);
    expect(() => chunk([1], 500)).toThrow();
    expect(dominantSurface({ dirt: 70, asphalt: 30 })).toBe('dirt');
  });
  it('authority name candidates strip the council prefix', () => {
    expect(authorityNameCandidates('מועצה אזורית שער הנגב')).toEqual(['מועצה אזורית שער הנגב', 'שער הנגב']);
  });
});

describe('--apply flags', () => {
  it('parses spaced and = forms', () => {
    expect(flagValue(['--project', 'appout-1'], 'project')).toBe('appout-1');
    expect(flagValue(['--authority=abc'], 'authority')).toBe('abc');
    expect(flagValue(['--project', '--apply'], 'project')).toBeNull();
  });
  it('requires --project and --authority; production must be appout-1', () => {
    expect(validateApplyFlags(parseApplyFlags(['--apply']), {})).toHaveLength(2);
    expect(validateApplyFlags(parseApplyFlags(['--apply', '--project', 'other', '--authority', 'x']), {})).toHaveLength(1);
    expect(validateApplyFlags(parseApplyFlags(['--apply', '--project', 'appout-1', '--authority', 'x']), {})).toHaveLength(0);
    expect(validateApplyFlags(parseApplyFlags(['--apply', '--project', 'emu-proj', '--authority', 'x']), { FIRESTORE_EMULATOR_HOST: '127.0.0.1:8089' })).toHaveLength(0);
  });
});
