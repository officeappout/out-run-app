import { describe, expect, it } from 'vitest';
import {
  BIG_PARK_MIN_AREA_M2,
  BIG_PARK_MIN_PERIMETER_M,
  LAP_LOOP_MIN_PERIMETER_M,
  isParkLikeArea,
  parkSizeClass,
} from '../park-size';

describe('isParkLikeArea', () => {
  it('accepts parks, gardens, reserves, recreation grounds', () => {
    expect(isParkLikeArea({ leisure: 'park' })).toBe(true);
    expect(isParkLikeArea({ leisure: 'garden' })).toBe(true);
    expect(isParkLikeArea({ leisure: 'nature_reserve' })).toBe(true);
    expect(isParkLikeArea({ landuse: 'recreation_ground' })).toBe(true);
  });
  it('rejects non-parks and private areas', () => {
    expect(isParkLikeArea({ leisure: 'pitch' })).toBe(false);
    expect(isParkLikeArea({ leisure: 'park', access: 'private' })).toBe(false);
    expect(isParkLikeArea({ leisure: 'garden', 'garden:type': 'residential' })).toBe(false);
  });
});

describe('parkSizeClass', () => {
  it('big park by area or perimeter, only when named', () => {
    expect(parkSizeClass({ areaM2: BIG_PARK_MIN_AREA_M2, perimeterM: 100, named: true })).toBe('big_park');
    expect(parkSizeClass({ areaM2: 10, perimeterM: BIG_PARK_MIN_PERIMETER_M, named: true })).toBe('big_park');
    expect(parkSizeClass({ areaM2: BIG_PARK_MIN_AREA_M2, perimeterM: 1300, named: false })).toBe('lap_loop');
  });
  it('lap loop at ≥ 500 m perimeter, distinct from big parks', () => {
    expect(LAP_LOOP_MIN_PERIMETER_M).toBe(500);
    expect(parkSizeClass({ areaM2: 15_000, perimeterM: 500, named: true })).toBe('lap_loop');
    expect(parkSizeClass({ areaM2: 15_000, perimeterM: 499, named: true })).toBe('small');
  });
  it('treats non-finite metrics as zero', () => {
    expect(parkSizeClass({ areaM2: NaN, perimeterM: NaN, named: true })).toBe('small');
  });
});
