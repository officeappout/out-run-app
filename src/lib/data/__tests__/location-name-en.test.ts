import { describe, expect, it } from 'vitest';
import { ISRAELI_LOCATIONS } from '../israel-locations';
import { LOCATION_NAME_EN } from '../israel-locations-en';
import { displayLocationName, locationNameEnByHe, locationNameEnById } from '../location-name-en';

const allIds = ISRAELI_LOCATIONS.flatMap((l) => [l.id, ...(l.subLocations ?? []).map((s) => s.id)]);

describe('English location names', () => {
  it('every location id has a non-empty English name, and nothing else', () => {
    expect(Object.keys(LOCATION_NAME_EN).sort()).toEqual([...allIds].sort());
    for (const id of allIds) {
      expect(LOCATION_NAME_EN[id]?.trim()).toBeTruthy();
      expect(LOCATION_NAME_EN[id]).not.toMatch(/[֐-׿–—]/);
    }
  });

  it('by id and by Hebrew name', () => {
    expect(locationNameEnById('kryyt-bylyk')).toBe('Kiryat Bialik');
    expect(locationNameEnByHe('ירושלים')).toBe('Jerusalem');
    expect(locationNameEnByHe('רמות', 'ירושלים')).toBe('Ramot');
    expect(locationNameEnByHe('שם שלא קיים')).toBeUndefined();
  });

  it('display: Hebrew untouched, English swapped, unknown kept, "city - neighbourhood" form', () => {
    expect(displayLocationName('ירושלים', 'he')).toBe('ירושלים');
    expect(displayLocationName('ירושלים', 'en')).toBe('Jerusalem');
    expect(displayLocationName('שם שלא קיים', 'en')).toBe('שם שלא קיים');
    expect(displayLocationName('ירושלים - רמות', 'en')).toBe('Jerusalem - Ramot');
    expect(displayLocationName(null, 'en')).toBe('');
  });
});
