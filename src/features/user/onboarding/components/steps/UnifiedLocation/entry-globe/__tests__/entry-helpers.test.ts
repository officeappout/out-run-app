import { describe, it, expect } from 'vitest';
import type { CityData, NearbyFacility } from '../../location-types';
import { groupSearchResults, highlightSegments, placeTypeLabel, visibleSections } from '../entry-search';
import { confirmPlaceName, nearestParkMetaParts, pickNearestPark } from '../entry-confirm';
import { makeT } from '@/lib/i18n/t';
import { onboarding } from '@/messages/ns/onboarding';

const t = makeT('he', onboarding);

const city = (over: Partial<CityData>): CityData => ({
  id: 'x', name: 'x', displayName: 'x', type: 'city', lat: 32, lng: 34.8,
  trainers: 0, gyms: 0, isMapped: false, population: 1, ...over,
});

describe('groupSearchResults', () => {
  it('neighbourhoods = rows with a parent, cities = top level; counts per chip', () => {
    const g = groupSearchResults([
      city({ id: 'a', name: 'רמת אביב', parentName: 'תל אביב-יפו', type: 'neighborhood' }),
      city({ id: 'b', name: 'רמת גן' }),
      city({ id: 'c', name: 'רמת החייל', parentName: 'תל אביב-יפו', type: 'neighborhood' }),
    ]);
    expect(g.neighborhoods.map((r) => r.id)).toEqual(['a', 'c']);
    expect(g.cities.map((r) => r.id)).toEqual(['b']);
    expect(g.counts).toEqual({ all: 3, neighborhoods: 2, cities: 1 });
  });
  it('empty / null input', () => {
    expect(groupSearchResults(null).counts).toEqual({ all: 0, neighborhoods: 0, cities: 0 });
  });
  it('visibleSections per filter', () => {
    expect(visibleSections('all')).toEqual({ neighborhoods: true, cities: true });
    expect(visibleSections('neighborhoods')).toEqual({ neighborhoods: true, cities: false });
    expect(visibleSections('cities')).toEqual({ neighborhoods: false, cities: true });
  });
  it('place type labels', () => {
    expect(placeTypeLabel('city', t)).toBe('עיר');
    expect(placeTypeLabel('regional_council', t)).toBe('מועצה אזורית');
    expect(placeTypeLabel('local_council', t)).toBe('מועצה מקומית');
    expect(placeTypeLabel('settlement', t)).toBe('יישוב');
    expect(placeTypeLabel(undefined, t)).toBe('יישוב');
  });
});

describe('highlightSegments', () => {
  it('bolds the matched prefix', () => {
    expect(highlightSegments('רמת אביב', 'רמת')).toEqual([
      { text: 'רמת', match: true },
      { text: ' אביב', match: false },
    ]);
  });
  it('every query word, case-insensitive, every occurrence', () => {
    const s = highlightSegments('Tel Aviv tel', 'TEL');
    expect(s.filter((x) => x.match).map((x) => x.text)).toEqual(['Tel', 'tel']);
    const m = highlightSegments('הצפון הישן', 'הצפון ישן');
    expect(m.filter((x) => x.match).map((x) => x.text)).toEqual(['הצפון', 'ישן']);
  });
  it('no query → one plain segment; no text → none', () => {
    expect(highlightSegments('חיפה', '  ')).toEqual([{ text: 'חיפה', match: false }]);
    expect(highlightSegments('', 'א')).toEqual([]);
  });
  it('segments always re-join to the original text', () => {
    const text = 'נווה צדק, תל אביב';
    expect(highlightSegments(text, 'צדק אב').map((s) => s.text).join('')).toBe(text);
  });
});

const park = (id: string, distanceMeters: number, extra: Record<string, unknown> = {}) =>
  ({ kind: 'park', id, name: id, distanceMeters, formattedDistance: `${distanceMeters} מ׳`, ...extra }) as unknown as NearbyFacility;

describe('confirm drawer helpers', () => {
  it('title place: neighbourhood → city → display name', () => {
    expect(confirmPlaceName('הצפון הישן', 'תל אביב-יפו', 'x')).toBe('הצפון הישן');
    expect(confirmPlaceName(null, 'חיפה', 'x')).toBe('חיפה');
    expect(confirmPlaceName('  ', '', 'רחוב הרצל')).toBe('רחוב הרצל');
    expect(confirmPlaceName(null, null, null)).toBe('');
    expect(t('location.entry.confirm.title', { place: 'הצפון הישן' })).toBe('גרים בהצפון הישן?');
  });
  it('nearest park ignores routes and picks the smallest distance', () => {
    const route = { kind: 'route', id: 'r', distanceMeters: 10 } as unknown as NearbyFacility;
    expect(pickNearestPark([park('far', 900), route, park('near', 400)])?.id).toBe('near');
    expect(pickNearestPark([route])).toBeNull();
    expect(pickNearestPark(undefined)).toBeNull();
  });
  it('meta: distance · rating · equipment — only what exists', () => {
    expect(nearestParkMetaParts({ formattedDistance: '400 מ׳', rating: 4.7, gymEquipment: new Array(6).fill({}) }, t))
      .toEqual(['400 מ׳', '⭐ 4.7', '6 מתקנים']);
    expect(nearestParkMetaParts({ formattedDistance: '1.2 ק״מ', rating: 0 }, t)).toEqual(['1.2 ק״מ']);
    expect(nearestParkMetaParts({ formattedDistance: '', rating: null, gymEquipment: [{}] }, t)).toEqual(['מתקן אחד']);
    expect(nearestParkMetaParts({ gymEquipment: new Array(1234).fill({}) }, t)).toEqual(['1234 מתקנים']);
  });
});
