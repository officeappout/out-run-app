import { describe, expect, it } from 'vitest';
import { ISRAELI_LOCATIONS } from '@/lib/data/israel-locations';
import { flattenLocations, getDefaultCoordinates } from '../location-utils';
import { capPerGroup, defaultLocations, filterLocations } from '../location-search';
import type { CityData } from '../location-types';

const cities: CityData[] = flattenLocations(ISRAELI_LOCATIONS)
  .map((loc) => {
    const c = getDefaultCoordinates(loc.id, loc.parentId);
    return {
      id: loc.id, name: loc.name, displayName: loc.displayName, type: loc.type, lat: c.lat, lng: c.lng,
      trainers: 0, gyms: 0, isMapped: false, population: loc.population, parentId: loc.parentId, parentName: loc.parentName,
    };
  })
  .sort((a, b) => b.population - a.population);

const TEL_AVIV = { lat: 32.0853, lng: 34.7818 };

describe('AJ5 default list', () => {
  it('no position: largest cities only, no neighbourhoods', () => {
    const list = defaultLocations(cities, null);
    expect(list.length).toBeGreaterThan(5);
    expect(list.every((c) => !c.parentId)).toBe(true);
    expect(list[0].id).toBe('jerusalem');
    expect(list.map((c) => c.id)).toContain('tel-aviv');
  });

  it('with a position: nearby neighbourhoods and several nearby cities, no Jerusalem neighbourhoods', () => {
    const list = defaultLocations(cities, TEL_AVIV);
    const tops = list.filter((c) => !c.parentId);
    expect(tops.length).toBeGreaterThan(3);
    expect(list.some((c) => c.parentId?.startsWith('jerusalem') || c.id.startsWith('jr-'))).toBe(false);
    expect(list.filter((c) => c.parentId).length).toBeGreaterThan(0);
  });
});

describe('AJ5 search', () => {
  it('cities are capped separately from neighbourhoods', () => {
    const capped = capPerGroup(filterLocations(cities, 'ר'), 15);
    expect(capped.filter((c) => !c.parentId).length).toBeGreaterThan(1);
  });

  it('a short English query narrows to word starts, English-name prefix first', () => {
    const tel = filterLocations(cities, 'tel');
    expect(tel[0].id).toBe('tel-aviv');
    const ram = filterLocations(cities, 'ram');
    expect(ram.length).toBeLessThan(200);
    expect(ram.length).toBeGreaterThan(0);
    expect(filterLocations(cities, 'telaviv').map((c) => c.id)).toContain('tel-aviv');
  });
});
