import { describe, it, expect } from 'vitest';
import { placeTypeFromV5, placeTypeFromV6, splitGeoLabel, suggestionRowLines } from '../geocode-place-type';

describe('Mapbox v6 feature_type mapping', () => {
  it('maps the kinds the search shows', () => {
    expect(placeTypeFromV6('address')).toBe('address');
    expect(placeTypeFromV6('secondary_address')).toBe('address');
    expect(placeTypeFromV6('street')).toBe('street');
    expect(placeTypeFromV6('place')).toBe('place');
    expect(placeTypeFromV6('locality')).toBe('locality');
    expect(placeTypeFromV6('neighborhood')).toBe('neighborhood');
    expect(placeTypeFromV6('poi')).toBe('poi');
    expect(placeTypeFromV6('district')).toBe('region');
    expect(placeTypeFromV6('postcode')).toBe('region');
    expect(placeTypeFromV6('Street')).toBe('street');
  });
  it('unknown / missing → undefined', () => {
    expect(placeTypeFromV6('spaceport')).toBeUndefined();
    expect(placeTypeFromV6(undefined)).toBeUndefined();
    expect(placeTypeFromV6(7)).toBeUndefined();
  });
});

describe('Mapbox v5 place_type mapping', () => {
  it('address with a house number is an address, without one a street', () => {
    expect(placeTypeFromV5({ place_type: ['address'], address: '12' })).toBe('address');
    expect(placeTypeFromV5({ place_type: ['address'], address: 12 })).toBe('address');
    expect(placeTypeFromV5({ place_type: ['address'] })).toBe('street');
    expect(placeTypeFromV5({ place_type: ['address'], address: ' ' })).toBe('street');
  });
  it('first place_type wins', () => {
    expect(placeTypeFromV5({ place_type: ['poi', 'poi.landmark'] })).toBe('poi');
    expect(placeTypeFromV5({ place_type: ['place', 'region'] })).toBe('place');
    expect(placeTypeFromV5({ place_type: ['locality'] })).toBe('locality');
    expect(placeTypeFromV5({ place_type: ['neighborhood'] })).toBe('neighborhood');
  });
  it('missing / malformed → undefined', () => {
    expect(placeTypeFromV5({})).toBeUndefined();
    expect(placeTypeFromV5({ place_type: 'poi' })).toBeUndefined();
    expect(placeTypeFromV5({ place_type: [] })).toBeUndefined();
    expect(placeTypeFromV5(null)).toBeUndefined();
  });
});

describe('suggestion row lines', () => {
  it('splits a geocoder label', () => {
    expect(splitGeoLabel('הרצל 12, תל אביב-יפו, ישראל')).toEqual({ primary: 'הרצל 12', rest: 'תל אביב-יפו, ישראל' });
    expect(splitGeoLabel('חיפה')).toEqual({ primary: 'חיפה', rest: '' });
  });
  it('mapbox rows carry the type label', () => {
    expect(suggestionRowLines({ text: 'הרצל 12, תל אביב-יפו', _source: 'mapbox', placeType: 'address' }))
      .toEqual({ primary: 'הרצל 12', secondary: 'כתובת · תל אביב-יפו' });
    expect(suggestionRowLines({ text: 'הרצל, תל אביב-יפו', _source: 'mapbox', placeType: 'street' }).secondary).toBe('רחוב · תל אביב-יפו');
    expect(suggestionRowLines({ text: 'חיפה', _source: 'mapbox', placeType: 'place' })).toEqual({ primary: 'חיפה', secondary: 'עיר' });
    expect(suggestionRowLines({ text: 'עזריאלי, תל אביב', _source: 'mapbox', placeType: 'poi' }).secondary).toBe('מקום · תל אביב');
    expect(suggestionRowLines({ text: 'משהו, עיר', _source: 'mapbox' }).secondary).toBe('עיר');
  });
  it('park / route rows', () => {
    expect(suggestionRowLines({ text: 'פארק הירקון · תל אביב', _source: 'park' })).toEqual({ primary: 'פארק הירקון', secondary: 'פארק · תל אביב' });
    expect(suggestionRowLines({ text: 'טיילת', _source: 'route' })).toEqual({ primary: 'טיילת', secondary: 'מסלול' });
  });
});
