/**
 * park-card-meta — PURE helpers behind the compact park card (ParkCardCompact): the amenity chips
 * a park earns (featureTags + the legacy flat fields) and a short distance label. Shared by the
 * map's floating card and the workout preview's "where to train" carousel so both agree.
 */
import type { Park, ParkFeatureTag } from '@/features/parks/core/types/park.types';
import { AMENITY_DISPLAY_ORDER } from '../park-detail/amenity-icons';
import { formatDistanceKm, formatNumber } from '@/lib/i18n/core/fmt';
import { withUnit, type CommonT } from '@/lib/i18n/units';
import type { Locale } from '@/lib/i18n/locales';

type AmenitySource = Pick<
  Park,
  'featureTags' | 'isShaded' | 'hasNaturalShade' | 'amenities' | 'hasWaterFountain' | 'hasLights' | 'hasDogPark'
>;

/** Amenity chips in the park page's display order, capped at `max`. */
export function deriveAmenityTags(park: AmenitySource, max: number): ParkFeatureTag[] {
  const tags = new Set<ParkFeatureTag>(park.featureTags ?? []);
  if (park.isShaded || park.hasNaturalShade || park.amenities?.hasShadow) tags.add('shaded');
  if (park.hasWaterFountain || park.amenities?.hasWater) tags.add('water_fountain');
  if (park.hasLights || park.amenities?.hasLighting) tags.add('night_lighting');
  if (park.amenities?.hasToilets) tags.add('has_toilets');
  if (park.hasDogPark) tags.add('dog_friendly');
  return AMENITY_DISPLAY_ORDER.filter((t) => tags.has(t)).slice(0, max);
}

/** "650 מ׳" under 1 km (rounded to 50 m), "1.2 ק״מ" above — numbers via Intl, unit words from `common`. */
export function shortDistanceLabel(meters: number, locale: Locale, t?: CommonT): string {
  if (meters < 1000) {
    const rounded = Math.max(50, Math.round(meters / 50) * 50);
    return withUnit('m', formatNumber(rounded, locale, { useGrouping: false }), t);
  }
  return withUnit('km', formatDistanceKm(meters / 1000, locale, 1), t);
}
