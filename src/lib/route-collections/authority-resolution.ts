/**
 * Pure authority-resolution geometry — no I/O, no Firestore, no React.
 * Mirrors the shipped route-adjacency.service.ts pattern (pure logic module
 * + thin Firestore-aware callers elsewhere) so this is importable unmodified
 * from both browser code (InventoryService) and Node/tsx scripts
 * (geo-discovery-routes.ts and friends).
 *
 * Extracts and reuses two functions that already existed but were each
 * private/duplicated inside a single UI or script file — not new geometry:
 *   - isPointInPolygon: was private in src/features/admin/components/LocationPicker.tsx
 *   - findAuthorityByCityName (+ its normalizer/city-name-variant table): was
 *     private in src/features/admin/services/remap-parks-to-authorities.ts
 * Both call sites now delegate here instead of keeping their own copy.
 */

import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point as turfPoint } from '@turf/helpers';

// ── Point-in-polygon (extracted from LocationPicker.tsx; widened to
// Polygon | MultiPolygon and ported onto @turf/boolean-point-in-polygon —
// 23.09.2026, authority-boundary pipeline step). The original hand-rolled
// ray-casting only ever read `polygon.geometry.coordinates[0]` — a single
// ring — so a MultiPolygon boundary (regional councils are the case most
// likely to be one: exclaves, non-contiguous jurisdiction) silently
// resolved against only the first part, producing a WRONG answer rather
// than an error. @turf/boolean-point-in-polygon is already a real
// production dependency, already correctly used for exactly this in
// scripts/lib/osm-boundary-fetch.node.ts's sibling extraction site
// (extract-osm-amenities-tlv.ts's isInsideCityBoundary) — reused here
// rather than hand-extending the ray-casting code. Still browser-safe:
// turf has no Node-only APIs.
//
// Behavior note: the old ray-casting short-circuited a degenerate ring
// (<3 vertices) to `true` ("inside"); turf returns `false` for degenerate/
// invalid geometry instead. Real OSM-fetched boundaries are never
// degenerate, so this doesn't affect any live data path — flagged here in
// case a future caller ever constructs a boundaryGeoJSON by hand. ────────

export function isPointInPolygon(
  point: { lat: number; lng: number },
  polygon: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>,
): boolean {
  return booleanPointInPolygon(turfPoint([point.lng, point.lat]), polygon as any);
}

function haversineKmLocal(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface AuthorityBoundary {
  id: string;
  name: string;
  boundaryGeoJSON?: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
  coordinates?: { lat: number; lng: number };
  radiusKm?: number;
}

/**
 * Parses the RAW Firestore value of `authorities/{id}.boundaryGeoJSON` back
 * into the in-memory `Feature<Polygon | MultiPolygon>` shape every consumer
 * (resolveAuthorityForPoint, LocationPicker, ParkForm, ...) expects.
 *
 * Firestore stores this field as a JSON STRING, not a raw object — Firestore
 * rejects nested arrays at any depth ("Property boundaryGeoJSON contains an
 * invalid nested entity"), verified empirically 23.09.2026, and a GeoJSON
 * Polygon/MultiPolygon's `coordinates` is inherently array-of-arrays. This
 * mirrors geo-discovery-routes.ts's `toPath()`, which works around the same
 * restriction for route paths — but a polygon needs the whole structure
 * serialized, not just its leaf points restructured into {lat,lng} maps.
 *
 * The ONE place this must be called is the read-side mapper
 * (authority.service.ts's Authority normalizer) — every other consumer
 * receives an already-parsed object and must never see the raw string.
 *
 * Defensive by design: a malformed/corrupt string returns `null` (+ a
 * console.warn) rather than throwing. A broken boundary must degrade to "no
 * boundary" — which is what every authority already has today — not crash
 * the map, the approval flow, or resolveAuthorityForPoint's caller.
 */
export function parseBoundaryGeoJSON(raw: unknown): GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> | null {
  if (!raw) return null;
  if (typeof raw !== 'string') {
    console.warn('parseBoundaryGeoJSON: expected a JSON string, got', typeof raw, '— treating as no boundary.');
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    const geomType = parsed?.geometry?.type;
    const coords = parsed?.geometry?.coordinates;
    if (parsed?.type !== 'Feature' || (geomType !== 'Polygon' && geomType !== 'MultiPolygon') || !Array.isArray(coords)) {
      console.warn('parseBoundaryGeoJSON: parsed value is not a Polygon/MultiPolygon Feature — treating as no boundary.');
      return null;
    }
    return parsed as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
  } catch (err) {
    console.warn('parseBoundaryGeoJSON: JSON.parse failed — treating as no boundary.', err);
    return null;
  }
}

export type AuthorityResolution =
  | { status: 'resolved'; authorityId: string; cityName: string; method: 'polygon' | 'radius' }
  | { status: 'ambiguous'; candidates: string[] }
  | { status: 'unresolved' };

/**
 * Resolve a single point to an authority: polygon containment first
 * (precise, when `boundaryGeoJSON` exists), radius-circle-around-`coordinates`
 * fallback second (matches the fallback ParkForm.tsx already uses),
 * 'unresolved' if neither exists or the point falls in no authority.
 * If the point falls inside more than one authority's boundary, returns
 * 'ambiguous' rather than guessing which one is "right."
 */
export function resolveAuthorityForPoint(
  point: { lat: number; lng: number },
  authorities: AuthorityBoundary[],
): AuthorityResolution {
  const polygonMatches = authorities.filter(
    (a) => a.boundaryGeoJSON && isPointInPolygon(point, a.boundaryGeoJSON),
  );
  if (polygonMatches.length === 1) {
    return { status: 'resolved', authorityId: polygonMatches[0].id, cityName: polygonMatches[0].name, method: 'polygon' };
  }
  if (polygonMatches.length > 1) {
    return { status: 'ambiguous', candidates: polygonMatches.map((a) => a.id) };
  }

  const radiusMatches = authorities.filter(
    (a) => a.coordinates && a.radiusKm && haversineKmLocal(point.lat, point.lng, a.coordinates.lat, a.coordinates.lng) <= a.radiusKm,
  );
  if (radiusMatches.length === 1) {
    return { status: 'resolved', authorityId: radiusMatches[0].id, cityName: radiusMatches[0].name, method: 'radius' };
  }
  if (radiusMatches.length > 1) {
    return { status: 'ambiguous', candidates: radiusMatches.map((a) => a.id) };
  }

  return { status: 'unresolved' };
}

/**
 * Resolve a whole path: checks both endpoints + midpoint. Disagreement
 * between them (different authorities, or one resolved and one not) is
 * 'ambiguous' rather than a guess — a route genuinely crossing a
 * jurisdiction boundary should get a human decision, not an auto-pick.
 */
export function resolveAuthorityForPath(
  path: Array<[number, number] | { lat: number; lng: number }>,
  authorities: AuthorityBoundary[],
): AuthorityResolution {
  if (!path || path.length === 0) return { status: 'unresolved' };
  const toPoint = (p: [number, number] | { lat: number; lng: number }) =>
    Array.isArray(p) ? { lng: p[0], lat: p[1] } : p;

  const start = toPoint(path[0]);
  const end = toPoint(path[path.length - 1]);
  const mid = toPoint(path[Math.floor(path.length / 2)]);

  const results = [start, mid, end].map((p) => resolveAuthorityForPoint(p, authorities));
  const resolvedIds = new Set(
    results.filter((r): r is Extract<AuthorityResolution, { status: 'resolved' }> => r.status === 'resolved').map((r) => r.authorityId),
  );

  if (resolvedIds.size === 1 && results.every((r) => r.status === 'resolved')) {
    return results[0];
  }
  if (resolvedIds.size > 1) {
    return { status: 'ambiguous', candidates: Array.from(resolvedIds) };
  }
  return { status: 'unresolved' };
}

// ── City-name matching (extracted from remap-parks-to-authorities.ts) ───

/** Hebrew/English city-name variant table — same content as the original
 *  module-private copy in remap-parks-to-authorities.ts, moved here so
 *  it's shared instead of duplicated. */
const CITY_NAME_MAP: Record<string, string[]> = {
  'תל אביב': ['תל אביב', 'תל אביב יפו', 'תל-אביב', 'תל-אביב-יפו', 'tel aviv', 'tel-aviv', 'telaviv'],
  'ירושלים': ['ירושלים', 'jerusalem', 'yerushalayim'],
  'חיפה': ['חיפה', 'haifa'],
  'ראשון לציון': ['ראשון לציון', 'ראשון-לציון', 'rishon lezion', 'rishon-lezion', 'rishon le tsiyon'],
  'פתח תקווה': ['פתח תקווה', 'פתח-תקווה', 'petah tikva', 'petah-tikva'],
  'אשדוד': ['אשדוד', 'ashdod'],
  'נתניה': ['נתניה', 'netanya'],
  'באר שבע': ['באר שבע', 'באר-שבע', 'beer sheva', 'beer-sheva', 'beersheba'],
  'חולון': ['חולון', 'holon'],
  'רמת גן': ['רמת גן', 'רמת-גן', 'ramat gan', 'ramat-gan'],
  'בת ים': ['בת ים', 'בת-ים', 'bat yam', 'bat-yam'],
  'אשקלון': ['אשקלון', 'ashkelon'],
  'רחובות': ['רחובות', 'rehovot'],
  'הרצליה': ['הרצליה', 'herzliya', 'herzliyya'],
  'כפר סבא': ['כפר סבא', 'כפר-סבא', 'kfar saba', 'kfar-saba'],
  'בית שמש': ['בית שמש', 'בית-שמש', 'beit shemesh', 'beit-shemesh'],

  // קרית/קריית sweep (06.09.2026) — same bug class as the entries above, for
  // a different variant: "קרית X" (short, no extra י) vs "קריית X" (long).
  // normalizeCityName strips spaces/hyphens but has no reason to also
  // collapse this — it's a real, separate character, not whitespace/maqaf.
  // Root-caused via the Kiryat Ono orchestrator failure (city_registrations
  // label "קריית אונו" vs the real, already-engaged authority "קרית אונו")
  // then swept across all 83 type:'city' authorities for the same gap.
  // Every key below is verified to be the EXACT stored authorities.name
  // (checked by Unicode code point, not eyeballed) — the map's own lookup
  // requires an exact normalized match on the key, so a wrong key silently
  // resolves nothing. Only added where a real authority already exists to
  // resolve to (siottOZAY5CkpvauSJwp for Ono, four more below) — never
  // invented for a city with no authority record.
  //
  // Checked and NOT added: hyphenated multi-word city names (יהוד-מונוסון,
  // מעלות-תרשיחא, אום אל-פחם, באקה אל-גרביה, מודיעין-מכבים-רעות,
  // תל אביב-יפו) — every hyphen in the live data is a plain ASCII '-'
  // (verified by code point, not a real maqaf/en-dash), and
  // normalizeCityName's own `.replace(/-/g, '')` already collapses
  // hyphen-vs-space input variance for all of them — no gap exists there.
  'קרית אונו': ['קרית אונו', 'קריית אונו', 'kiryat ono', 'kiryat-ono'],
  'קרית אתא': ['קרית אתא', 'קריית אתא', 'kiryat ata', 'kiryat-ata'],
  'קרית ים': ['קרית ים', 'קריית ים', 'kiryat yam', 'kiryat-yam'],
  'קרית גת': ['קרית גת', 'קריית גת', 'kiryat gat', 'kiryat-gat'],
  'קריית שמונה': ['קריית שמונה', 'קרית שמונה', 'kiryat shmona', 'kiryat-shmona'],
  'קריית ביאליק': ['קריית ביאליק', 'קרית ביאליק', 'kiryat bialik', 'kiryat-bialik'],
  'קריית מוצקין': ['קריית מוצקין', 'קרית מוצקין', 'kiryat motzkin', 'kiryat-motzkin'],
  'קריית מלאכי': ['קריית מלאכי', 'קרית מלאכי', 'kiryat malachi', 'kiryat-malachi'],
};

export function normalizeCityName(cityName: string): string {
  return cityName.toLowerCase().replace(/\s+/g, '').replace(/-/g, '').trim();
}

/**
 * Find an authority by (fuzzy) city-name match: exact match first, then the
 * CITY_NAME_MAP variant table, then a partial-substring match as a last
 * resort. Returns null on no match — callers must never silently default.
 */
export function findAuthorityByCityName(
  cityName: string,
  authorities: Array<{ id: string; name: string }>,
): string | null {
  if (!cityName || !cityName.trim()) return null;
  const normalizedCity = normalizeCityName(cityName);

  for (const authority of authorities) {
    if (normalizeCityName(authority.name) === normalizedCity) return authority.id;
  }

  for (const [standardName, variations] of Object.entries(CITY_NAME_MAP)) {
    if (variations.some((v) => normalizeCityName(v) === normalizedCity)) {
      const authority = authorities.find((a) => normalizeCityName(a.name) === normalizeCityName(standardName));
      if (authority) return authority.id;
    }
  }

  for (const authority of authorities) {
    const normalizedAuthority = normalizeCityName(authority.name);
    if (normalizedCity.includes(normalizedAuthority) || normalizedAuthority.includes(normalizedCity)) {
      return authority.id;
    }
  }

  return null;
}
