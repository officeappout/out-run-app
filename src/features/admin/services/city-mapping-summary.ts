/**
 * src/features/admin/services/city-mapping-summary.ts — Phase 1 Stage C1.
 * Read-only companion to city-mapping-orchestrator.ts's `runCityMapping()`:
 * answers "what does this city already have" (routes/amenities/parks/
 * lighting/adjacency) and "what cities can I even pick" for the new
 * /admin/city-mapping page. Zero writes — every export here is a plain
 * Firestore read, client SDK.
 *
 * Source-of-truth decisions, confirmed by reading the actual code/schemas
 * (not assumed — see CITY-ORCHESTRATOR-PLAN.md's Stage C1 investigation):
 *
 * - Routes: `official_routes` ONLY, never summed with `curated_routes` —
 *   InventoryService.saveCuratedRoutes writes every curated route into
 *   official_routes too (a second doc, no back-reference), so summing the
 *   two collections double-counts every curated route.
 * - Amenities by category: `osm_amenities` directly (`where('city',...)`),
 *   NOT `Route.qualitySignals.amenities` — that field is a route-scoped
 *   derived join (route-amenity-tagging.service.ts) that only reflects
 *   amenities already spatially matched to an existing, already-tagged
 *   route; it silently misses amenities far from any known route and is
 *   undefined before the tagging step has ever run for the city. The raw
 *   `osm_amenities.city` field is the honest city-level total.
 * - Parks: no `parks.city` query precedent exists anywhere in this
 *   codebase — every existing per-city parks read uses `authorityId`
 *   (fetchParksForAuthorities in route-overlay.service.ts). Resolve
 *   city→authorityId via findAuthorityByCityName first.
 * - Lighting: mirrors backfill-route-lighting-haifa.ts's own counting loop
 *   exactly — `unknownCount` (computed once, no usable data) is reported
 *   SEPARATELY from `unlitCount`, never folded in. This module adds one
 *   more bucket the backfill script doesn't need but the same honesty rule
 *   requires here: `notRunCount`, for routes where `qualitySignals.lighting`
 *   is absent entirely (never computed at all) — computedCount + unknownCount
 *   + notRunCount === totalRoutes, always.
 * - Adjacency: `route_adjacency` is keyed by `cityName`, NOT `city` — a
 *   different field than every other collection here, confirmed against
 *   inventory.service.ts's recomputeRouteAdjacencyForCity and the
 *   orchestrator's own adjacencyVerify step.
 * - City picker: a distinct-value aggregation of `official_routes.city`,
 *   NOT geo-discovery-routes.ts's in-file REGIONS (11 keys, only 3 real
 *   distinct city labels — 9 are Ashkelon-neighbourhood discovery-batch
 *   sub-bboxes all sharing the label "אשקלון"). The client SDK has no
 *   `.select()` field-projection (unlike the Admin-SDK precedent in
 *   scripts/delete-ashkelon-routes.ts), so this is a plain unfiltered
 *   full-collection read + client-side dedup — acceptable at today's scale,
 *   the same "full scan is fine here" precedent already used for
 *   `authorities`/`parks` reads elsewhere in this codebase. As of Stage C2,
 *   ALSO merges in `city_registrations.label` values, so a city registered
 *   via Add-City but not yet mapped (0 routes) still shows up as a
 *   suggestion here, not just as a free-typed string.
 * - Stage C2 registration pre-fill: `city_registrations` is looked up by
 *   `where('label','==',city)` — NOT by document id, since this collection
 *   is keyed by an internal `key` slug (e.g. "haifa", matching
 *   geo-discovery-routes.ts's `--region=` CLI argument), a completely
 *   different identifier space than the Hebrew display-name `city` string
 *   this whole module and the orchestrator use everywhere else. When a
 *   registration is found, its `bbox`/`adminRelationId` are surfaced as
 *   `registeredCity` for the page to use as pre-fill defaults — preferred
 *   over the route-derived `suggestedBbox` since a real confirmed OSM
 *   boundary is more accurate than a margin-padded estimate from whatever
 *   route geometry happens to exist. This is what makes Stage C2's promise
 *   real end-to-end: the operator types a relation id neither at
 *   registration NOR at mapping time.
 *
 * Route `path` field note: Route.path's TS type says `[number,number][]`,
 * but every real working reader of this field in production
 * (extract-osm-amenities-tlv.ts, inventory.service.ts's adjacency compute)
 * treats raw Firestore doc data as `Array<{lat,lng}>` objects — the actual
 * runtime shape, not the aspirational type. This module follows the same
 * runtime-proven convention, not the strict type, when reading raw snapshot
 * data for bbox derivation.
 */
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { findAuthorityByCityName } from '@/lib/route-collections/authority-resolution';
import { boundingBoxWithMargin } from '@/lib/dem-tile-cache/tile-math';
import type { AmenityCategory } from '@/features/parks/core/types/osm-amenity.types';

/** Same margin extract-osm-amenities-tlv.ts already uses when deriving its
 *  own bbox from a city's route geometry (AMENITY_BBOX_MARGIN_METERS). */
const SUGGESTED_BBOX_MARGIN_METERS = 2500;

const EMPTY_AMENITY_COUNTS: Record<AmenityCategory, number> = {
  court: 0,
  bench: 0,
  drinking_water: 0,
  fitness_station: 0,
  crossing: 0,
  dog_park: 0,
};

export interface CityMappingSummary {
  city: string;
  authorityId: string | null;

  routes: { total: number; approved: number; pending: number; other: number };

  suggestedBbox: { latMin: number; lonMin: number; latMax: number; lonMax: number } | null;
  bboxSourceRouteCount: number;

  amenities: {
    byCategory: Record<AmenityCategory, number>;
    total: number;
    rejectedCount: number;
  };

  parks: { count: number | null };

  /** Set only when a city_registrations doc exists with label === city
   *  (Stage C2). Null for a city with no registration — the page falls
   *  back to suggestedBbox / manual adminRelationId entry in that case. */
  registeredCity: { key: string; bbox: { latMin: number; lonMin: number; latMax: number; lonMax: number }; adminRelationId: number | null } | null;

  lighting: {
    totalRoutes: number;
    computedCount: number;
    litCount: number;
    unlitCount: number;
    unknownCount: number;
    notRunCount: number;
    coveragePct: number | null;
  };

  adjacency: { edgeCount: number };
}

/** Distinct `city` values across every `official_routes` doc, merged with
 *  every `city_registrations.label` (Stage C2) — the picker's data source.
 *  Full unfiltered scans (no client-SDK field projection). */
export async function loadDistinctRouteCities(): Promise<string[]> {
  const [routesSnap, registrationsSnap] = await Promise.all([
    getDocs(collection(db, 'official_routes')),
    getDocs(collection(db, 'city_registrations')),
  ]);
  const cities = new Set<string>();
  for (const d of routesSnap.docs) {
    const city = d.data().city;
    if (typeof city === 'string' && city.trim()) cities.add(city);
  }
  for (const d of registrationsSnap.docs) {
    const label = d.data().label;
    if (typeof label === 'string' && label.trim()) cities.add(label);
  }
  return Array.from(cities).sort((a, b) => a.localeCompare(b, 'he'));
}

export async function loadCityMappingSummary(city: string): Promise<CityMappingSummary> {
  const [authoritySnap, routesSnap, amenitiesSnap, registrationsSnap] = await Promise.all([
    getDocs(collection(db, 'authorities')),
    getDocs(query(collection(db, 'official_routes'), where('city', '==', city))),
    getDocs(query(collection(db, 'osm_amenities'), where('city', '==', city))),
    getDocs(query(collection(db, 'city_registrations'), where('label', '==', city))),
  ]);

  // ── Stage C2 registration lookup — by label, not doc id (see header note) ──
  let registeredCity: CityMappingSummary['registeredCity'] = null;
  const registrationDoc = registrationsSnap.docs[0];
  if (registrationDoc) {
    const data = registrationDoc.data();
    if (data.bbox) {
      registeredCity = {
        key: registrationDoc.id,
        bbox: data.bbox,
        adminRelationId: typeof data.adminRelationId === 'number' ? data.adminRelationId : null,
      };
    }
  }

  // ── authorityId resolution (shared by parks) ──
  const authorities = authoritySnap.docs.map((d) => ({
    id: d.id,
    name: (d.data().label as string) ?? (d.data().name as string) ?? '',
  }));
  const authorityId = findAuthorityByCityName(city, authorities);

  // ── routes + bbox + lighting all derive from the SAME official_routes snapshot ──
  let approved = 0, pending = 0, other = 0;
  const bboxPoints: Array<{ lat: number; lng: number }> = [];
  let litCount = 0, unlitCount = 0, unknownCount = 0, notRunCount = 0;

  for (const d of routesSnap.docs) {
    const data = d.data();

    const published = data.published;
    const status = data.status;
    if (published === true) approved++;
    else if (published === false && status !== 'archived' && status !== 'rejected') pending++;
    else other++;

    const rawPath = Array.isArray(data.path) ? data.path : [];
    for (const p of rawPath) {
      const lat = Number(p?.lat);
      const lng = Number(p?.lng);
      if (Number.isFinite(lat) && Number.isFinite(lng)) bboxPoints.push({ lat, lng });
    }

    const lighting = data.qualitySignals?.lighting;
    if (!lighting) {
      notRunCount++;
    } else if (lighting.status === 'unknown') {
      unknownCount++;
    } else if (lighting.status === 'computed') {
      if (lighting.isLit === true) litCount++;
      else unlitCount++;
    } else {
      notRunCount++;
    }
  }

  const totalRoutes = routesSnap.size;
  const computedCount = litCount + unlitCount;

  let suggestedBbox: CityMappingSummary['suggestedBbox'] = null;
  if (bboxPoints.length > 0) {
    suggestedBbox = boundingBoxWithMargin(bboxPoints, SUGGESTED_BBOX_MARGIN_METERS);
  }

  // ── amenities ──
  const byCategory: Record<AmenityCategory, number> = { ...EMPTY_AMENITY_COUNTS };
  let rejectedCount = 0;
  for (const d of amenitiesSnap.docs) {
    const data = d.data();
    if (data.status === 'rejected') {
      rejectedCount++;
      continue;
    }
    const category = data.category as AmenityCategory;
    if (category in byCategory) byCategory[category]++;
  }
  const amenitiesTotal = Object.values(byCategory).reduce((s, n) => s + n, 0);

  // ── parks (authorityId-scoped — no usable parks.city query precedent exists) ──
  let parksCount: number | null = null;
  if (authorityId) {
    const parksSnap = await getDocs(query(collection(db, 'parks'), where('authorityId', '==', authorityId)));
    parksCount = parksSnap.size;
  }

  // ── adjacency (cityName, not city) ──
  const adjacencySnap = await getDocs(query(collection(db, 'route_adjacency'), where('cityName', '==', city)));

  return {
    city,
    authorityId,
    routes: { total: totalRoutes, approved, pending, other },
    suggestedBbox,
    bboxSourceRouteCount: routesSnap.docs.filter((d) => Array.isArray(d.data().path) && d.data().path.length > 0).length,
    amenities: { byCategory, total: amenitiesTotal, rejectedCount },
    parks: { count: parksCount },
    registeredCity,
    lighting: {
      totalRoutes,
      computedCount,
      litCount,
      unlitCount,
      unknownCount,
      notRunCount,
      coveragePct: totalRoutes > 0 ? (computedCount / totalRoutes) * 100 : null,
    },
    adjacency: { edgeCount: adjacencySnap.size },
  };
}
