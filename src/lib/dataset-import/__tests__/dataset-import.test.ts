import { describe, expect, it } from 'vitest';
import { buildValidatedDoc } from '../../route-collections/validate';
import { assignAuthority, boundaryFromStored, pointInBoundary } from '../authority-assign';
import { itmToWgs84, looksLikeItm } from '../itm';
import { normalizeFeatures } from '../normalize';
import { overlapShare } from '../overlap';
import { planDatasetImport } from '../plan';
import { arcgisQueryUrl } from '../read-shapefile';
import { DATASETS, getDataset } from '../registry';
import { stitchCorridors } from '../stitch';
import { datasetRouteDoc, datasetRouteId, stableHash } from '../to-route-doc';
import { east, lineFeature, mPerDegLng, shiftNorth, square } from './helpers';

const OFN = DATASETS.ofneidan;
const JER = DATASETS.bicycle_jer_2019;

describe('registry', () => {
  it('only cleared licences are registered (owner Q11 + RC9: MoT bph_infra_exist is other-open, live)', () => {
    for (const d of Object.values(DATASETS)) expect(['CC-BY-4.0', 'other-open (data.gov.il)']).toContain(d.license);
    expect(DATASETS.bph_infra_exist.licenceStatus).toBe('live');
    expect(DATASETS.bph_infra_exist.attribution).toBe('משרד התחבורה והבטיחות בדרכים — data.gov.il');
    expect(() => getDataset('bicycle_track-br7')).toThrow(/unknown dataset/);
  });
});

describe('itm', () => {
  it('the ITM false origin maps to the grid origin within the datum shift', () => {
    const [lng, lat] = itmToWgs84(219529.584, 626907.39);
    expect(Math.abs(lng - 35.2045169) * mPerDegLng(31.73)).toBeLessThan(150);
    expect(Math.abs(lat - 31.7343936) * 111_320).toBeLessThan(150);
  });
  it('detects ITM metres vs degrees', () => {
    expect(looksLikeItm([180000, 665000])).toBe(true);
    expect(looksLikeItm([34.8, 32.1])).toBe(false);
  });
});

describe('normalizeFeatures', () => {
  it('keeps only existing sections, explodes MultiLineString, reprojects ITM', () => {
    const fc = {
      type: 'FeatureCollection',
      features: [
        lineFeature(east(34.8, 32.1, 500), { NAME: 'ירקון', STATUS: 'נפתח לתנועה', DP: 'Y1' }),
        lineFeature(east(34.8, 32.2, 500), { NAME: 'ירקון', STATUS: 'תכנון', DP: 'Y2' }),
        { type: 'Feature', properties: { NAME: 'חוף', STATUS: 'נפתח לתנועה', DP: 'H1' }, geometry: { type: 'MultiLineString', coordinates: [east(34.7, 32.0, 300), east(34.7, 32.01, 300)] } },
        lineFeature([[180000, 665000], [180500, 665000]], { NAME: 'איילון', STATUS: 'נפתח לתנועה', DP: 'A1' }),
        { type: 'Feature', properties: { NAME: 'x', STATUS: 'נפתח לתנועה' }, geometry: { type: 'Point', coordinates: [34.8, 32] } },
      ],
    };
    const { lines, report } = normalizeFeatures(fc, OFN);
    expect(lines.map((l) => l.featureId)).toEqual(['Y1', 'H1#0', 'H1#1', 'A1']);
    expect(report.skippedStatus).toEqual({ 'תכנון': 1 });
    expect(report.skippedNotLine).toBe(1);
    expect(report.reprojectedFromItm).toBe(1);
    const a1 = lines.find((l) => l.featureId === 'A1')!;
    expect(a1.coords[0][0]).toBeGreaterThan(34.7);
    expect(a1.coords[0][0]).toBeLessThan(34.9);
  });
  it('makes duplicate feature ids unique', () => {
    const fc = { features: [1, 2].map((k) => lineFeature(east(34.8, 32 + k / 100, 100), { NAME: 'n', STATUS: 'קיים', OBJECTID: '7' })) };
    expect(normalizeFeatures(fc, JER).lines.map((l) => l.featureId)).toEqual(['7', '7~1']);
  });
});

describe('stitchCorridors', () => {
  const a = east(34.8, 32.1, 1200);
  const b = east(a[a.length - 1][0], 32.1, 1200).reverse(); // touches a's end, drawn the other way
  const lines = [
    { featureId: 'a', name: 'ירקון', status: null, coords: a },
    { featureId: 'b', name: 'ירקון', status: null, coords: b },
  ];
  it('chains touching same-name sections into one corridor, fixing direction', () => {
    const { corridors } = stitchCorridors(lines, OFN);
    expect(corridors).toHaveLength(1);
    expect(corridors[0].featureIds.sort()).toEqual(['a', 'b']);
    expect(corridors[0].lengthM).toBeGreaterThan(2350);
    expect(corridors[0].closed).toBe(false);
  });
  it('by-name stitching keeps different names apart (each too short alone); network stitching joins them', () => {
    const mixed = [lines[0], { ...lines[1], name: 'חוף' }];
    expect(stitchCorridors(mixed, OFN).corridors).toHaveLength(0);
    const net = stitchCorridors(mixed, JER).corridors;
    expect(net).toHaveLength(1);
    expect(net[0].name).toBe('חוף'); // longest constituent (tie → first by name)
  });
  it('drops corridors under 2 km', () => {
    const r = stitchCorridors([{ featureId: 's', name: 'n', status: null, coords: east(34.8, 32.1, 900) }], OFN);
    expect(r.report).toMatchObject({ kept: 0, droppedShort: 1 });
  });
});

describe('overlapShare', () => {
  const l = east(34.8, 32.1, 1000);
  it('identical = 1, 10 m apart = 1, 50 m apart = 0', () => {
    expect(overlapShare(l, l)).toBe(1);
    expect(overlapShare(l, shiftNorth(l, 10))).toBe(1);
    expect(overlapShare(l, shiftNorth(l, 50))).toBe(0);
  });
});

describe('assignAuthority', () => {
  const tlv = { id: 'tlv', name: 'תל אביב', geometry: square(34.79, 32.09, 3000) };
  const rg = { id: 'rg', name: 'רמת גן', geometry: square(34.79 + 3000 / mPerDegLng(32.09), 32.09, 3000) };
  it('majority wins; below 50% stays unresolved', () => {
    expect(pointInBoundary([34.8, 32.1], tlv.geometry)).toBe(true);
    expect(assignAuthority(east(34.795, 32.1, 2000), [tlv, rg]).authorityId).toBe('tlv');
    expect(assignAuthority(east(34.6, 32.1, 2000), [tlv, rg]).authorityId).toBeNull();
  });
});

describe('boundaryFromStored', () => {
  it('parses the JSON-string Feature the boundary backfill writes, and bare geometries', () => {
    const g = square(34.8, 32.1, 100);
    expect(boundaryFromStored(JSON.stringify({ type: 'Feature', properties: {}, geometry: g }))).toEqual(g);
    expect(boundaryFromStored(g)).toEqual(g);
    expect(boundaryFromStored('not json')).toBeNull();
    expect(boundaryFromStored({ type: 'Point', coordinates: [1, 2] })).toBeNull();
  });
});

describe('to-route-doc', () => {
  const c = { name: 'ירקון', featureIds: ['b', 'a'], coords: east(34.8, 32.1, 2500), lengthM: 2500, closed: false };
  it('id is deterministic and order-independent', () => {
    expect(datasetRouteId(OFN, c)).toBe(datasetRouteId(OFN, { ...c, featureIds: ['a', 'b'] }));
    expect(datasetRouteId(OFN, c)).toMatch(/^ds_ofneidan_[0-9a-f]{16}$/);
    expect(stableHash('x')).not.toBe(stableHash('y'));
  });
  it('passes the create chokepoint (buildValidatedDoc) with a known authority', () => {
    const { data } = datasetRouteDoc(OFN, c, { authorityId: 'tlv', city: 'תל אביב-יפו', snapshot: '2025-09-01', importBatchId: 'b1' });
    const v = buildValidatedDoc('official_routes', data, { mode: 'create', knownAuthorityIds: new Set(['tlv']) });
    expect(v).toMatchObject({ status: 'pending', published: false, origin: 'dataset_import', type: 'cycling', routeShape: 'point_to_point', name: 'אופנידן — ירקון' });
    expect((v as any).provenance.dataset).toMatchObject({ key: 'ofneidan', license: 'CC-BY-4.0' });
    expect(() => buildValidatedDoc('official_routes', data, { mode: 'create', knownAuthorityIds: new Set(['other']) })).toThrow(/not a known authority/);
  });
});

describe('planDatasetImport', () => {
  const tlv = { id: 'tlv', name: 'תל אביב', geometry: square(34.79, 32.09, 5000) };
  const a = east(34.8, 32.1, 1500);
  const b = east(a[a.length - 1][0], 32.1, 1500);
  const far = east(34.5, 32.5, 2500);
  const fc = { features: [
    lineFeature(a, { NAME: 'ירקון', STATUS: 'נפתח לתנועה', DP: 'Y1' }),
    lineFeature(b, { NAME: 'ירקון', STATUS: 'נפתח לתנועה', DP: 'Y2' }),
    lineFeature(far, { NAME: 'שדה', STATUS: 'נפתח לתנועה', DP: 'S1' }),
  ] };
  const base = { boundaries: [tlv], cityByAuthority: { tlv: 'תל אביב-יפו' }, existing: [], snapshot: null, importBatchId: 'b' };
  it('end to end: one route in TLV, the out-of-boundary corridor skipped with a reason', () => {
    const p = planDatasetImport(fc, OFN, base);
    expect(p.routes.map((r) => (r.data as any).name)).toEqual(['אופנידן — ירקון']);
    expect(p.skipped).toHaveLength(1);
    expect(p.skipped[0].reason).toMatch(/no authority/);
    expect(p.perAuthority).toEqual({ tlv: 1 });
  });
  it('skips a corridor that duplicates an existing route', () => {
    const p = planDatasetImport(fc, OFN, { ...base, existing: [{ id: 'old', authorityId: 'tlv', name: 'שביל הירקון', coords: [...a, ...b.slice(1)] }] });
    expect(p.routes).toHaveLength(0);
    expect(p.skipped.find((s) => /duplicate/.test(s.reason))).toBeTruthy();
  });
});

describe('arcgisQueryUrl', () => {
  it('asks for WGS84 GeoJSON, paged', () => {
    const u = new URL(arcgisQueryUrl('https://example.org/MapServer/577/', 2000));
    expect(u.pathname).toBe('/MapServer/577/query');
    expect(u.searchParams.get('outSR')).toBe('4326');
    expect(u.searchParams.get('resultOffset')).toBe('2000');
  });
});

describe('normalizeFeatures — field names in any case', () => {
  it('reads lowercase name/status from a shapefile whose registry fields are uppercase', () => {
    const spec = getDataset('bicycle_jer_2019');
    const fc = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: { OBJECTID: 1, name: 'בנבנישתי', status: 'קיים' }, geometry: { type: 'LineString', coordinates: [[35.2, 31.77], [35.21, 31.77]] } },
        { type: 'Feature', properties: { OBJECTID: 2, name: 'טדי', status: 'שביל בבדיקת תכנון ראשוני' }, geometry: { type: 'LineString', coordinates: [[35.2, 31.76], [35.21, 31.76]] } },
      ],
    };
    const { lines, report } = normalizeFeatures(fc, spec);
    expect(lines).toHaveLength(1);
    expect(lines[0].name).toBe('בנבנישתי');
    expect(report.skippedStatus).toEqual({ 'שביל בבדיקת תכנון ראשוני': 1 });
  });
});
