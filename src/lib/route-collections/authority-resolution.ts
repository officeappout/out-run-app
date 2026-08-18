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

// ── Point-in-polygon (extracted from LocationPicker.tsx) ─────────────────

export function isPointInPolygon(
  point: { lat: number; lng: number },
  polygon: GeoJSON.Feature<GeoJSON.Polygon>,
): boolean {
  const ring = polygon.geometry.coordinates[0];
  if (!ring || ring.length < 3) return true;
  let inside = false;
  const x = point.lng;
  const y = point.lat;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect = ((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
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
  boundaryGeoJSON?: GeoJSON.Feature<GeoJSON.Polygon>;
  coordinates?: { lat: number; lng: number };
  radiusKm?: number;
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
