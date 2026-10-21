import { describe, expect, it } from 'vitest';
import { TECHNION_ATTRIBUTION, TECHNION_SHADE_LAYERS } from '@/lib/shade/technion-layers';
import { resolveShadeSource, technionLayerFor, TECHNION_SHADE_STORAGE_PREFIX } from '../shade-source';

describe('resolveShadeSource', () => {
  it('Technion wins where the city has a layer', () => {
    const r = resolveShadeSource({ technionCitySlug: 'beer-sheva', canopyAvailable: true });
    expect(r?.method).toBe('technion_si_daily');
    expect(r?.attribution).toBe(TECHNION_ATTRIBUTION);
    expect(r?.storagePath).toBe(`${TECHNION_SHADE_STORAGE_PREFIX}beer-sheva.geojson.gz`);
    expect(r?.technion?.code).toBe('BSV');
  });
  it('canopy estimate elsewhere', () => {
    const r = resolveShadeSource({ technionCitySlug: 'kfar-saba', canopyAvailable: true });
    expect(r?.method).toBe('canopy_estimate');
    expect(r?.storagePath).toBeNull();
  });
  it('null when neither exists', () => {
    expect(resolveShadeSource({ technionCitySlug: null, canopyAvailable: false })).toBeNull();
  });
  it('covers all 13 Technion cities', () => {
    expect(TECHNION_SHADE_LAYERS).toHaveLength(13);
    for (const l of TECHNION_SHADE_LAYERS) expect(technionLayerFor(l.city)).toBe(l);
    expect(technionLayerFor(undefined)).toBeNull();
  });
});
