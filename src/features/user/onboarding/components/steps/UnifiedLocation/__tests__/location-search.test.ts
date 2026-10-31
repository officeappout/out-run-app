import { describe, expect, it } from 'vitest';
import { ISRAELI_LOCATIONS } from '@/lib/data/israel-locations';
import { flattenLocations } from '../location-utils';
import { filterLocations, latinSkeleton } from '../location-search';
import type { CityData } from '../location-types';

const cities: CityData[] = flattenLocations(ISRAELI_LOCATIONS)
  .map((loc) => ({
    id: loc.id,
    name: loc.name,
    displayName: loc.displayName,
    type: loc.type,
    lat: 0,
    lng: 0,
    trainers: 0,
    gyms: 0,
    isMapped: false,
    population: loc.population,
    parentId: loc.parentId,
    parentName: loc.parentName,
  }))
  .sort((a, b) => b.population - a.population);

/** The pre-AH4 filter, verbatim, to pin Hebrew. */
function oldFilter(query: string): CityData[] {
  const queryWords = query.toLowerCase().trim().split(/\s+/).filter((word) => word.length > 0);
  return cities.filter((city) => {
    const cityFullName = `${city.name} ${city.displayName} ${city.parentName || ''}`.toLowerCase();
    return queryWords.every((word) => cityFullName.includes(word));
  });
}

const ids = (q: string) => filterLocations(cities, q).map((c) => c.id);

describe('filterLocations (AH4)', () => {
  it('Hebrew queries are unchanged', () => {
    for (const q of ['ירושלים', 'תל אביב', 'רמות', 'מרכז העיר', 'קרית', 'נ']) {
      expect(filterLocations(cities, q)).toEqual(oldFilter(q));
    }
  });

  it('English city names find the city first', () => {
    expect(ids('Jerusalem')[0]).toBe('jerusalem');
    expect(ids('tel aviv')[0]).toBe('tel-aviv');
    expect(ids('Telaviv')[0]).toBe('tel-aviv');
    expect(ids("Be'er Sheva")[0]).toBe('beer-sheva');
    expect(ids('sderot')).toContain('sderot');
  });

  it('English neighbourhood names, alone or with the city', () => {
    expect(ids('ramot')).toContain('jr-ramot');
    expect(ids('pisgat zeev jerusalem')).toContain('jr-pisgat-zeev');
  });

  it('consonant-skeleton slugs match a normal spelling', () => {
    expect(latinSkeleton('kiryat')).toBe(latinSkeleton('kryyt'));
    expect(ids('Kiryat Bialik')).toContain('kryyt-bylyk');
    expect(ids('Nof Hagalil')).toContain('nvf-hglyl');
  });

  it('nonsense finds nothing, and one-consonant skeletons do not flood', () => {
    expect(ids('qwxzpt')).toEqual([]);
    expect(ids('oxo')).toEqual([]);
  });

  it('English display names are searchable (vowel-less slugs no longer needed)', () => {
    expect(ids('Kiryat Bialik')).toContain('kryyt-bylyk');
    expect(ids('Petah Tikva')[0]).toBe('petah-tikva');
    expect(ids('ramot jerusalem')).toContain('jr-ramot');
  });
});
