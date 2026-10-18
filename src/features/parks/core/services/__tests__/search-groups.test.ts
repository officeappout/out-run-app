import { describe, it, expect } from 'vitest';
import {
  searchGroupOf,
  groupSearchResults,
  previewGroup,
  highlightMatch,
  groupedRowLines,
  distanceKmTo,
  formatDistanceKm,
  estimateMinutes,
  formatEta,
  type GroupableItem,
} from '../search-groups';

const TLV = { lat: 32.08, lng: 34.78 };
const near: [number, number] = [34.781, 32.081];   // ~0.15 km
const mid: [number, number] = [34.80, 32.09];      // ~2 km
const far: [number, number] = [34.95, 32.30];      // ~29 km

const geo = (text: string, placeType?: GroupableItem['placeType'], coords: [number, number] = mid): GroupableItem =>
  ({ text, coords, _source: 'mapbox', placeType });
const park = (text: string, coords: [number, number]): GroupableItem => ({ text, coords, _source: 'park' });
const route = (text: string, coords: [number, number]): GroupableItem => ({ text, coords, _source: 'route' });

describe('searchGroupOf', () => {
  it('maps every source / place type to a group', () => {
    expect(searchGroupOf(geo('הרצל 14', 'address'))).toBe('addresses');
    expect(searchGroupOf(geo('הרצל', 'street'))).toBe('addresses');
    expect(searchGroupOf(geo('x'))).toBe('addresses'); // untyped geocoder hit
    expect(searchGroupOf({ text: 'x', coords: mid })).toBe('addresses'); // no _source at all
    expect(searchGroupOf(geo('עזריאלי', 'poi'))).toBe('places');
    expect(searchGroupOf(geo('רמת גן', 'place'))).toBe('places');
    expect(searchGroupOf(geo('פלורנטין', 'neighborhood'))).toBe('places');
    expect(searchGroupOf(geo('מחוז', 'region'))).toBe('places');
    expect(searchGroupOf(geo('אזור', 'locality'))).toBe('places');
    expect(searchGroupOf(park('פארק', near))).toBe('parks');
    expect(searchGroupOf(route('מסלול', near))).toBe('routes');
  });
});

describe('groupSearchResults', () => {
  it('orders groups addresses → places → parks → routes and drops empty ones', () => {
    const groups = groupSearchResults([
      route('r1', near),
      park('p1', near),
      geo('a1', 'address'),
      geo('poi1', 'poi'),
    ]);
    expect(groups.map((g) => g.id)).toEqual(['addresses', 'places', 'parks', 'routes']);
    expect(groupSearchResults([park('p', near)]).map((g) => g.id)).toEqual(['parks']);
    expect(groupSearchResults([])).toEqual([]);
  });

  it('keeps Mapbox order inside address/place groups even with a position', () => {
    const groups = groupSearchResults([geo('far', 'address', far), geo('near', 'address', near)], TLV);
    expect(groups[0].items.map((i) => i.text)).toEqual(['far', 'near']);
  });

  it('sorts parks and routes by distance when the user position is known', () => {
    const items = [park('far', far), park('near', near), park('mid', mid), route('rfar', far), route('rnear', near)];
    const groups = groupSearchResults(items, TLV);
    expect(groups.find((g) => g.id === 'parks')!.items.map((i) => i.text)).toEqual(['near', 'mid', 'far']);
    expect(groups.find((g) => g.id === 'routes')!.items.map((i) => i.text)).toEqual(['rnear', 'rfar']);
  });

  it('keeps input order without a position, and sinks unknown locations', () => {
    expect(groupSearchResults([park('b', far), park('a', near)])[0].items.map((i) => i.text)).toEqual(['b', 'a']);
    const noLoc = park('noloc', [0, 0]);
    expect(groupSearchResults([noLoc, park('x', far)], TLV)[0].items.map((i) => i.text)).toEqual(['x', 'noloc']);
  });

  it('carries group labels', () => {
    expect(groupSearchResults([geo('a', 'address')])[0].label).toBe('כתובות ורחובות');
  });
});

describe('previewGroup', () => {
  it('shows the first 3 and counts the rest', () => {
    expect(previewGroup([1, 2, 3, 4, 5], false)).toEqual({ visible: [1, 2, 3], hiddenCount: 2 });
    expect(previewGroup([1, 2, 3], false)).toEqual({ visible: [1, 2, 3], hiddenCount: 0 });
    expect(previewGroup([1, 2, 3, 4, 5], true)).toEqual({ visible: [1, 2, 3, 4, 5], hiddenCount: 0 });
  });
});

describe('highlightMatch', () => {
  it('splits around every match, case-insensitively', () => {
    expect(highlightMatch('רחוב הרצל', 'הרצל')).toEqual([
      { text: 'רחוב ', match: false },
      { text: 'הרצל', match: true },
    ]);
    expect(highlightMatch('Park park', 'PARK')).toEqual([
      { text: 'Park', match: true },
      { text: ' ', match: false },
      { text: 'park', match: true },
    ]);
  });
  it('no query / no match → one plain part', () => {
    expect(highlightMatch('הרצל 14', '  ')).toEqual([{ text: 'הרצל 14', match: false }]);
    expect(highlightMatch('הרצל 14', 'ויצמן')).toEqual([{ text: 'הרצל 14', match: false }]);
  });
});

describe('groupedRowLines', () => {
  it('address: city only, country stripped', () => {
    expect(groupedRowLines(geo('הרצל 14, תל אביב-יפו, ישראל', 'address'))).toEqual({ primary: 'הרצל 14', secondary: 'תל אביב-יפו' });
  });
  it('street / poi: city + type word', () => {
    expect(groupedRowLines(geo('הרצל, רמת גן, ישראל', 'street'))).toEqual({ primary: 'הרצל', secondary: 'רמת גן · רחוב' });
    expect(groupedRowLines(geo('עזריאלי', 'poi'))).toEqual({ primary: 'עזריאלי', secondary: 'מקום' });
  });
  it('park / route: city, route length first', () => {
    expect(groupedRowLines(park('גינת הרצל · תל אביב', near))).toEqual({ primary: 'גינת הרצל', secondary: 'תל אביב' });
    expect(groupedRowLines({ ...route('שדרות הרצל · תל אביב', near), routeKm: 4.23 })).toEqual({ primary: 'שדרות הרצל', secondary: '4.2 ק״מ · תל אביב' });
    expect(groupedRowLines(route('טיילת', near))).toEqual({ primary: 'טיילת', secondary: 'מסלול' });
  });
});

describe('distance + ETA', () => {
  it('distanceKmTo handles missing / zero coords', () => {
    expect(distanceKmTo(null, near)).toBeNull();
    expect(distanceKmTo(TLV, [0, 0])).toBeNull();
    const d = distanceKmTo(TLV, mid)!;
    expect(d).toBeGreaterThan(1.5);
    expect(d).toBeLessThan(3);
  });
  it('formatDistanceKm', () => {
    expect(formatDistanceKm(0.64)).toBe('640 מ׳');
    expect(formatDistanceKm(0.001)).toBe('10 מ׳');
    expect(formatDistanceKm(1.84)).toBe('1.8 ק״מ');
    expect(formatDistanceKm(123.4)).toBe('123 ק״מ');
    expect(formatDistanceKm(null)).toBe('');
  });
  it('estimateMinutes / formatEta', () => {
    expect(estimateMinutes(1.4, 'running')).toBe(11); // 1.4*1.3*6 = 10.9
    expect(estimateMinutes(1.4, 'walking')).toBe(22);
    expect(estimateMinutes(0, 'walking')).toBe(1);
    expect(estimateMinutes(null, 'walking')).toBeNull();
    expect(formatEta(11)).toBe('~11 דק׳');
    expect(formatEta(80)).toBe('~1:20 שע׳');
    expect(formatEta(null)).toBe('');
  });
});
