/**
 * geocode-place-type.ts — PURE: normalise Mapbox geocoding result types.
 *
 * Geocoding v6 gives one `properties.feature_type`; v5 gives a `place_type`
 * array (and an `address` house-number property on house-level hits).
 * MapboxService.searchAddress merges both APIs, so both are folded into one
 * small vocabulary the search UI can pick an icon + label from.
 */

export type GeoPlaceType =
  | 'address' // a house address (street + number)
  | 'street'
  | 'place' // city / town
  | 'locality' // official sub-city area
  | 'neighborhood'
  | 'poi'
  | 'region'; // district / region / postcode / country

const DIRECT: Record<string, GeoPlaceType> = {
  address: 'address',
  secondary_address: 'address',
  street: 'street',
  block: 'street',
  place: 'place',
  locality: 'locality',
  neighborhood: 'neighborhood',
  poi: 'poi',
  'poi.landmark': 'poi',
  district: 'region',
  region: 'region',
  postcode: 'region',
  country: 'region',
};

/** Geocoding v6 `properties.feature_type` → GeoPlaceType (undefined when unknown). */
export function placeTypeFromV6(featureType: unknown): GeoPlaceType | undefined {
  if (typeof featureType !== 'string') return undefined;
  return DIRECT[featureType.toLowerCase()];
}

/**
 * Geocoding v5 feature → GeoPlaceType. v5 has no 'street' type: an
 * 'address' feature WITHOUT a house number (`feature.address`) is a street.
 */
export function placeTypeFromV5(feature: { place_type?: unknown; address?: unknown } | null | undefined): GeoPlaceType | undefined {
  const types = Array.isArray(feature?.place_type) ? feature!.place_type : [];
  const first = types.find((t): t is string => typeof t === 'string');
  if (!first) return undefined;
  const mapped = DIRECT[first.toLowerCase()];
  if (mapped === 'address') {
    const num = feature?.address;
    const hasNumber = (typeof num === 'string' && num.trim() !== '') || typeof num === 'number';
    return hasNumber ? 'address' : 'street';
  }
  return mapped;
}

/** Short Hebrew label for the suggestion row's secondary line. */
export const PLACE_TYPE_LABEL: Record<GeoPlaceType, string> = {
  address: 'כתובת',
  street: 'רחוב',
  place: 'עיר',
  locality: 'אזור',
  neighborhood: 'שכונה',
  poi: 'מקום',
  region: 'אזור',
};

/**
 * Split a geocoder label ("הרצל 12, תל אביב-יפו, ישראל") into a primary line
 * and the rest, for a two-line suggestion row.
 */
export function splitGeoLabel(text: string): { primary: string; rest: string } {
  const i = text.indexOf(',');
  if (i < 0) return { primary: text.trim(), rest: '' };
  return { primary: text.slice(0, i).trim(), rest: text.slice(i + 1).trim() };
}

/**
 * Two-line content for a search-suggestion row (v2 look):
 *   mapbox → "הרצל 12" / "כתובת · תל אביב-יפו, ישראל"
 *   park   → "פארק הירקון" / "פארק · תל אביב"
 *   route  → "טיילת" / "מסלול · תל אביב"
 */
export function suggestionRowLines(item: {
  text: string;
  _source?: 'mapbox' | 'park' | 'route';
  placeType?: GeoPlaceType;
}): { primary: string; secondary: string } {
  if (item._source === 'park' || item._source === 'route') {
    const i = item.text.indexOf(' · ');
    const primary = i < 0 ? item.text : item.text.slice(0, i);
    const city = i < 0 ? '' : item.text.slice(i + 3);
    const label = item._source === 'park' ? 'פארק' : 'מסלול';
    return { primary, secondary: city ? `${label} · ${city}` : label };
  }
  const { primary, rest } = splitGeoLabel(item.text);
  const label = item.placeType ? PLACE_TYPE_LABEL[item.placeType] : '';
  return { primary, secondary: [label, rest].filter(Boolean).join(' · ') };
}
