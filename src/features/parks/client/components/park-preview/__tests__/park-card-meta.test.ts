import { describe, expect, it } from 'vitest';
import { deriveAmenityTags, shortDistanceLabel } from '../park-card-meta';

describe('deriveAmenityTags', () => {
  it('merges featureTags with the legacy flat fields, in display order, capped', () => {
    const tags = deriveAmenityTags(
      { featureTags: [], hasWaterFountain: true, isShaded: true, amenities: { hasLighting: true } as never },
      3,
    );
    expect(new Set(tags)).toEqual(new Set(['shaded', 'water_fountain', 'night_lighting']));
    expect(deriveAmenityTags({ isShaded: true, hasWaterFountain: true }, 1)).toHaveLength(1);
  });
  it('nothing for a bare park', () => {
    expect(deriveAmenityTags({}, 3)).toEqual([]);
  });
});

describe('shortDistanceLabel (he)', () => {
  it('metres under 1 km, rounded to 50 and never below 50', () => {
    expect(shortDistanceLabel(648, 'he')).toBe('650 מ׳');
    expect(shortDistanceLabel(10, 'he')).toBe('50 מ׳');
  });
  it('kilometres with one decimal from 1 km', () => {
    expect(shortDistanceLabel(1240, 'he')).toBe('1.2 ק״מ');
    expect(shortDistanceLabel(2000, 'he')).toBe('2 ק״מ');
  });
});
