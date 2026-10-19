/**
 * search-groups.ts — PURE helpers for the v2 map search (enable_home_v2).
 *
 * The search hook returns one flat list ([...mapbox, ...parks, ...routes]).
 * The v2 search screen shows it grouped by type (addresses & streets /
 * places / parks / routes), with a distance per row, the typed text in bold
 * and a "show N more" per group. Everything here is pure so it can be unit
 * tested without React or Mapbox.
 */

import { PLACE_TYPE_LABEL, splitGeoLabel, type GeoPlaceType } from './geocode-place-type';

export type SearchGroupId = 'addresses' | 'places' | 'parks' | 'routes';

/** Display order of the groups. */
export const SEARCH_GROUP_ORDER: readonly SearchGroupId[] = ['addresses', 'places', 'parks', 'routes'];

export const SEARCH_GROUP_LABEL: Record<SearchGroupId, string> = {
  addresses: 'כתובות ורחובות',
  places: 'מקומות',
  parks: 'פארקים',
  routes: 'מסלולים',
};

/** Short chip label for the filter row. */
export const SEARCH_GROUP_CHIP: Record<SearchGroupId, string> = {
  addresses: 'כתובות',
  places: 'מקומות',
  parks: 'פארקים',
  routes: 'מסלולים',
};

/** Rows shown per group before "עוד N" (the "all" view only). */
export const GROUP_PREVIEW_COUNT = 3;

export interface GroupableItem {
  text: string;
  coords: [number, number];
  _source?: 'mapbox' | 'park' | 'route';
  placeType?: GeoPlaceType;
}

/**
 * Which group a suggestion belongs to. Mapbox hits without a type (older
 * cache / v5 hits Mapbox didn't type) fall in "addresses" — most geocoder
 * hits are addresses or streets.
 */
export function searchGroupOf(item: GroupableItem): SearchGroupId {
  if (item._source === 'park') return 'parks';
  if (item._source === 'route') return 'routes';
  switch (item.placeType) {
    case 'poi':
    case 'place':
    case 'locality':
    case 'neighborhood':
    case 'region':
      return 'places';
    default:
      return 'addresses';
  }
}

/** Straight-line distance in km between a {lat,lng} and a Mapbox [lng,lat]. */
export function distanceKmTo(
  from: { lat: number; lng: number } | null | undefined,
  coords: [number, number] | null | undefined,
): number | null {
  if (!from || !coords) return null;
  const [lng, lat] = coords;
  if (![from.lat, from.lng, lat, lng].every(Number.isFinite)) return null;
  // [0,0] is the "no location" fallback the search hook uses for parks.
  if (lat === 0 && lng === 0) return null;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat - from.lat);
  const dLng = toRad(lng - from.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from.lat)) * Math.cos(toRad(lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** "650 מ׳" under 1 km, "1.8 ק״מ" up to 100 km, "120 ק״מ" beyond. */
export function formatDistanceKm(km: number | null | undefined): string {
  if (km == null || !Number.isFinite(km) || km < 0) return '';
  if (km < 1) return `${Math.max(10, Math.round((km * 1000) / 10) * 10)} מ׳`;
  if (km < 100) return `${(Math.round(km * 10) / 10).toFixed(1)} ק״מ`;
  return `${Math.round(km)} ק״מ`;
}

export interface SearchGroup<T extends GroupableItem> {
  id: SearchGroupId;
  label: string;
  items: T[];
}

/**
 * Bucket a flat suggestion list into ordered, non-empty groups.
 *  • addresses / places keep Mapbox's own order (it is relevance-ranked);
 *  • parks / routes (a plain substring match, no ranking) are sorted by
 *    distance from the user when a position is known — stable otherwise.
 */
export function groupSearchResults<T extends GroupableItem>(
  items: readonly T[],
  userPos?: { lat: number; lng: number } | null,
): SearchGroup<T>[] {
  const buckets: Record<SearchGroupId, T[]> = { addresses: [], places: [], parks: [], routes: [] };
  for (const it of items) buckets[searchGroupOf(it)].push(it);

  const byDistance = (list: T[]): T[] => {
    if (!userPos) return list;
    return list
      .map((it, i) => ({ it, i, d: distanceKmTo(userPos, it.coords) }))
      .sort((a, b) => {
        // unknown distance sinks to the bottom; ties keep the input order
        const da = a.d ?? Number.POSITIVE_INFINITY;
        const db = b.d ?? Number.POSITIVE_INFINITY;
        return da === db ? a.i - b.i : da - db;
      })
      .map((x) => x.it);
  };
  buckets.parks = byDistance(buckets.parks);
  buckets.routes = byDistance(buckets.routes);

  return SEARCH_GROUP_ORDER
    .filter((id) => buckets[id].length > 0)
    .map((id) => ({ id, label: SEARCH_GROUP_LABEL[id], items: buckets[id] }));
}

/** Split a group into the rows shown now and the hidden remainder count. */
export function previewGroup<T>(items: readonly T[], expanded: boolean, limit = GROUP_PREVIEW_COUNT): { visible: T[]; hiddenCount: number } {
  if (expanded || items.length <= limit) return { visible: [...items], hiddenCount: 0 };
  return { visible: items.slice(0, limit), hiddenCount: items.length - limit };
}

/**
 * Split `text` around case-insensitive occurrences of `query`, so the row can
 * render the typed part in bold. Empty / whitespace query → one plain part.
 */
export function highlightMatch(text: string, query: string): Array<{ text: string; match: boolean }> {
  const q = query.trim();
  if (!q || !text) return [{ text, match: false }];
  const lowerText = text.toLowerCase();
  const lowerQ = q.toLowerCase();
  const parts: Array<{ text: string; match: boolean }> = [];
  let from = 0;
  for (;;) {
    const i = lowerText.indexOf(lowerQ, from);
    if (i < 0) break;
    if (i > from) parts.push({ text: text.slice(from, i), match: false });
    parts.push({ text: text.slice(i, i + q.length), match: true });
    from = i + q.length;
  }
  if (from < text.length) parts.push({ text: text.slice(from), match: false });
  return parts.length ? parts : [{ text, match: false }];
}

/** Drop a trailing ", ישראל" / ", Israel" — every hit is in Israel. */
export function stripCountry(rest: string): string {
  return rest.replace(/,?\s*(ישראל|Israel)\s*$/, '').trim();
}

/**
 * Two-line content for a GROUPED row. The group header already names the
 * type, so the secondary line carries the place (city) — plus the type word
 * only where it adds something (street vs address, POI, neighbourhood).
 *   address → "הרצל 14" / "תל אביב-יפו"
 *   street  → "הרצל" / "תל אביב-יפו · רחוב"
 *   park    → "גינת הרצל" / "תל אביב"
 *   route   → "שדרות הרצל" / "4.2 ק״מ · תל אביב"
 */
export function groupedRowLines(item: GroupableItem & { routeKm?: number }): { primary: string; secondary: string } {
  if (item._source === 'park' || item._source === 'route') {
    const i = item.text.indexOf(' · ');
    const primary = i < 0 ? item.text : item.text.slice(0, i);
    const city = i < 0 ? '' : item.text.slice(i + 3);
    const km = item._source === 'route' && item.routeKm && item.routeKm > 0
      ? `${(Math.round(item.routeKm * 10) / 10).toFixed(1)} ק״מ`
      : '';
    const fallback = item._source === 'park' ? 'פארק' : 'מסלול';
    const secondary = [km, city].filter(Boolean).join(' · ');
    return { primary, secondary: secondary || fallback };
  }
  const { primary, rest } = splitGeoLabel(item.text);
  const place = stripCountry(rest);
  const typeWord = item.placeType && item.placeType !== 'address' ? PLACE_TYPE_LABEL[item.placeType] : '';
  return { primary, secondary: [place, typeWord].filter(Boolean).join(' · ') };
}

export type EtaMode = 'running' | 'walking';

/** Rough pace (min/km) per mode for the destination card's ETA chips. */
const PACE_MIN_PER_KM: Record<EtaMode, number> = { running: 6, walking: 12 };
/** Straight line → street distance fudge (streets are never a straight line). */
const DETOUR_FACTOR = 1.3;

/** Estimated minutes for a straight-line distance; null when unknown. Never below 1. */
export function estimateMinutes(straightKm: number | null | undefined, mode: EtaMode): number | null {
  if (straightKm == null || !Number.isFinite(straightKm) || straightKm < 0) return null;
  return Math.max(1, Math.round(straightKm * DETOUR_FACTOR * PACE_MIN_PER_KM[mode]));
}

/** "~11 דק׳" / "~1:20 שע׳" */
export function formatEta(min: number | null): string {
  if (min == null) return '';
  if (min < 60) return `~${min} דק׳`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `~${h}:${String(m).padStart(2, '0')} שע׳`;
}
