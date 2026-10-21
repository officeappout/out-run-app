import { describe, expect, it } from 'vitest';
import { DATASET_STALE_AFTER_DAYS, OSM_STALE_AFTER_DAYS, isStaleSource, qualityFlags, staleAfterDays } from '../quality';
import type { LayerSource } from '../types';

const now = new Date('2026-10-21T00:00:00Z');
const osm = (snapshotDate: string): LayerSource => ({ key: 'osm', license: 'ODbL', attribution: '© OSM', snapshotDate, count: 1 });

describe('staleness', () => {
  it('per-source limits', () => {
    expect(staleAfterDays('osm')).toBe(OSM_STALE_AFTER_DAYS);
    expect(staleAfterDays('mot_bike')).toBe(DATASET_STALE_AFTER_DAYS);
  });
  it('osm stale after 62 days, missing date is stale', () => {
    expect(isStaleSource(osm('2026-10-01'), now)).toBe(false);
    expect(isStaleSource(osm('2026-08-01'), now)).toBe(true);
    expect(isStaleSource(osm(''), now)).toBe(true);
    expect(isStaleSource({ key: 'mot_bike', snapshotDate: '2025-03-02' }, now)).toBe(true);
    expect(isStaleSource({ key: 'mot_bike', snapshotDate: '2026-01-02' }, now)).toBe(false);
  });
});

describe('qualityFlags', () => {
  it('flags everything that applies', () => {
    const flags = qualityFlags({
      method: 'osm_tag_coverage',
      coveragePct: 6.4,
      sources: [osm('2026-01-01')],
      density: 0.01,
      peerMedianDensity: 1,
      licensePendingKeys: new Set(['osm']),
      now,
    });
    expect(flags).toEqual(['below_expected_density', 'single_source', 'stale_source', 'untagged_majority', 'license_pending']);
  });
  it('clean layer has no flags', () => {
    const flags = qualityFlags({
      method: 'osm_count',
      coveragePct: 10,
      sources: [osm('2026-10-01'), { key: 'tlv_gis', license: 'x', attribution: 'x', snapshotDate: '2026-06-01', count: 2 }],
      now,
    });
    expect(flags).toEqual([]);
  });
  it('untagged_majority only for tag-coverage layers', () => {
    expect(qualityFlags({ method: 'technion_si_daily', coveragePct: 10, sources: [], now })).toEqual([]);
  });
});
