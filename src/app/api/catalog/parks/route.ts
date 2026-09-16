/**
 * GET /api/catalog/parks — public, edge-cached park catalog (SPEC-07 stage 1)
 *
 * Server-side only in this stage — no client change yet (that's stage 2).
 * Reads Firestore via Admin SDK, returns a lean JSON array, and relies on
 * Vercel's edge cache (Cache-Control: s-maxage) to answer almost every
 * request without ever reaching this function or Firestore again — see
 * docs/audit-2026-09/SPEC-07-shared-catalog.md for the full design and the
 * cost math (~14M Firestore reads/day today → ~150/day once this is live —
 * the "today" figure is an unmeasured order-of-magnitude estimate, not a
 * Firestore usage measurement; see that doc's 16.09.2026 correction before
 * quoting it anywhere external).
 *
 * Field list is exactly what stage 0's field-mapping found real map/search
 * consumers reading (AppMap's vector-pin GeoJSON, ParkPhotoMarker,
 * useNearbyParks) — not a guess, not the full Park type. `imageUrl` is the
 * raw resolved-priority URL (imageUrl → image → images[0], same priority as
 * resolveParkImage) with NO width baked in — every consumer calls bunnyImg
 * itself with whatever width it needs (80 for a map marker, 400 for a
 * card); the catalog must not fix that choice for every future consumer.
 *
 * hasUsableEquipment/isPrimaryFitness (David, 16.09.2026, after the 21-caller
 * fetchRealParks audit): precomputed here, server-side, from the full
 * record — NOT exposed as raw gymEquipment/sportTypes arrays. This is the
 * standing SPEC-07 pattern from here on: a consumer needing a filter gets a
 * computed boolean, never the raw field the filter runs on. Scope is
 * deliberately locked to exactly these two — sportTypes, courtType,
 * natureType, and city were all considered and explicitly excluded (no
 * confirmed consumer on the lean path); do not add a field speculatively —
 * stop and ask first, per the same review.
 *
 * isMinor (David, 16.09.2026, after a facilityType/urbanType re-review):
 * replaces the raw urbanType field — same "compute the predicate server-
 * side, never ship the raw field" pattern as hasUsableEquipment/
 * isPrimaryFitness. Always false today (urbanType is null on every
 * published park — a separate, pending product decision; see the
 * master-plan journal, untouched here).
 *
 * facilityType stays as a raw field — DO NOT remove it or fold it into a
 * boolean. The general rule (SPEC-07): precompute a boolean ONLY when the
 * consumer is asking a yes/no question (that's what hasUsableEquipment/
 * isPrimaryFitness/isMinor are). facilityType has THREE confirmed
 * catalog-path consumers and every one of them branches on multiple raw
 * values, not one — a boolean cannot represent that without turning into
 * several booleans that just re-encode the same string:
 *   1. WorkoutLocationSuggestions.tsx:132 — 3-way display label
 *      (gym_park / court / other).
 *   2. start-hybrid-session.ts:751 — `parks.filter(p => p.facilityType
 *      !== 'open_field')`, gating on the strength-assessment flag.
 *   3. route-stops.service.ts:55 (`mapParkToStop`) — branches on FOUR
 *      values (gym_park / nature_community / zen_spot / urban_spot) to
 *      pick a stop's activity type. Easy to miss by grepping this file
 *      alone: it never calls fetchRealParks itself. start-hybrid-
 *      session.ts:767 fetches the catalog (`safeFetchRealParks()`),
 *      filters it (consumer #2, same array), and passes that SAME array
 *      into `resolveRouteStops(routePath, parks)`, which loops it into
 *      mapParkToStop. The park object mapParkToStop receives is
 *      catalog-shaped even though the function itself never fetches
 *      anything — trace the array's origin, not just this file's
 *      imports, before concluding a field is unused on the lean path.
 *
 * published filtering is NOT a Firestore query clause — parks.service.ts's
 * own normalizePark treats a doc as published via
 * `published ?? (contentStatus === 'published')`, and 4 real, currently-
 * visible parks in production only satisfy the contentStatus half (no
 * `published: true` field at all). A literal `where('published','==',true)`
 * query would silently drop those 4 from the map — the exact class of
 * regression this whole spec is trying to avoid, just on a different field.
 * Filtered in JS instead, matching the app's own existing definition
 * exactly.
 *
 * Firestore's own security rules (`allow read: if true` on parks) already
 * allow this codebase's existing client-side fetch to read every park
 * regardless of published state — this route does NOT introduce a new
 * leak, it is the first place that actually filters on it (SPEC-07
 * addendum, "אישור A").
 *
 * ?fresh=1 (+ X-Agent-Key) bypasses the edge cache entirely for a live,
 * uncached read — for verifying a just-made admin-panel edit on the real
 * map without waiting out s-maxage. The unauthenticated path (everyone
 * else, the actual map traffic) never takes this branch.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { requireAdminApi } from '@/lib/api-auth';
import { createHash } from 'crypto';
import { MINOR_URBAN_TYPES } from '@/features/parks/core/constants/urban-type.constants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CATALOG_MAX_AGE_SECONDS = 600; // 10 min — approved SPEC-07 stage 0 value
const CATALOG_SWR_SECONDS = 86400; // 24h
// Browser-facing freshness (SPEC-07 stage 1 follow-up, David 16.09.2026):
// s-maxage is a shared-cache directive only — browsers ignore it entirely,
// which is why a real curl test showed Vercel's edge correctly returning
// HIT/HIT/HIT while the client itself never cached locally. A short
// client-side max-age lets repeat near-simultaneous requests (multiple
// tabs, a fast refresh, and — per David — every request from the
// Capacitor app too, since it loads from server.url and its WebView
// respects max-age the same way a browser does) skip the network
// round-trip entirely. 60s is a rounding error against the 600s edge TTL.
const CATALOG_CLIENT_MAX_AGE_SECONDS = 60;

interface CatalogParkEntry {
  id: string;
  name: string;
  lat: number;
  lng: number;
  facilityType: string;
  isFunctional: boolean;
  imageUrl: string | null;
  hasUsableEquipment: boolean;
  isPrimaryFitness: boolean;
  isMinor: boolean;
}

function resolveImage(d: FirebaseFirestore.DocumentData): string | null {
  return d.imageUrl || d.image || (Array.isArray(d.images) ? d.images[0] : null) || null;
}

function isEffectivelyPublished(d: FirebaseFirestore.DocumentData): boolean {
  return d.published ?? d.contentStatus === 'published';
}

// Mirrors park-fitness.util.ts's isPrimaryFitness() — duplicated, not
// imported, because that file lives under workout-engine/hybrid and pulls
// in client-SDK-dependent siblings; this is a 3-line, stable check
// (source-of-truth values: park-fitness.util.ts).
const FITNESS_RELEVANT_SPORT_TYPES = new Set(['calisthenics', 'functional', 'crossfit']);
function computeIsPrimaryFitness(d: FirebaseFirestore.DocumentData): boolean {
  const sportTypes: unknown[] = Array.isArray(d.sportTypes) ? d.sportTypes : [];
  return sportTypes.some((t) => FITNESS_RELEVANT_SPORT_TYPES.has(String(t))) || d.facilityType === 'gym_park';
}

// The actual, complete condition under which parkGymEquipmentToGearIds'
// normalization can ever come back empty — traced through the real code
// (park-equipment.util.ts + gear-mapping.utils.ts's normalizeGearId): every
// entry lacking a real equipmentId. normalizeGearId's alias/cache lookups
// only affect WHICH canonical id comes out for a valid equipmentId, never
// WHETHER one does — its unconditional final fallback echoes the raw
// (lowercased) id. Verified against all 596 published parks with non-empty
// gymEquipment in production (16.09.2026): zero have every entry missing
// equipmentId, so this line has never actually differed from a plain
// non-empty check on real data — but it's the real condition, not a
// convenient proxy, and stays correct if that ever changes.
function computeHasUsableEquipment(d: FirebaseFirestore.DocumentData): boolean {
  const gymEquipment: unknown[] = Array.isArray(d.gymEquipment) ? d.gymEquipment : [];
  return gymEquipment.some(
    (e) => e && typeof (e as { equipmentId?: unknown }).equipmentId === 'string'
      && ((e as { equipmentId: string }).equipmentId.trim().length > 0),
  );
}

// Replaces the raw urbanType field in the catalog (David, 16.09.2026:
// "option b — precompute isMinor instead of the raw field", same pattern as
// the two flags above). MINOR_URBAN_TYPES lives in urban-type.constants.ts,
// not duplicated here — mapPinIcons.ts (the client-side map pin renderer)
// imports the exact same constant, so a change to the classification only
// needs one edit. Always false today (urbanType is null on every published
// park — a separate, pending product decision, untouched by this).
function computeIsMinor(d: FirebaseFirestore.DocumentData): boolean {
  return MINOR_URBAN_TYPES.includes(d.urbanType || '');
}

async function buildCatalog(): Promise<CatalogParkEntry[]> {
  const db = getAdminDb();
  const snap = await db.collection('parks').get();

  const entries: CatalogParkEntry[] = [];
  for (const doc of snap.docs) {
    const d = doc.data();
    if (!isEffectivelyPublished(d)) continue;

    const lat = Number(d.location?.lat);
    const lng = Number(d.location?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    entries.push({
      id: doc.id,
      name: d.name || '',
      lat,
      lng,
      facilityType: d.facilityType || 'gym_park',
      isFunctional: d.isFunctional === true,
      imageUrl: resolveImage(d),
      hasUsableEquipment: computeHasUsableEquipment(d),
      isPrimaryFitness: computeIsPrimaryFitness(d),
      isMinor: computeIsMinor(d),
    });
  }

  // Stable order so an unchanged underlying data set always serializes to
  // byte-identical JSON — Firestore's collection get() has no guaranteed
  // order, and without this the ETag (a hash of the body) would churn on
  // every 10-min regeneration even when nothing actually changed, which
  // would silently defeat the whole 304 mechanism this design depends on.
  entries.sort((a, b) => a.id.localeCompare(b.id));
  return entries;
}

export async function GET(request: NextRequest) {
  const fresh = request.nextUrl.searchParams.get('fresh') === '1';

  if (fresh) {
    const denied = await requireAdminApi(request);
    if (denied) return denied;

    const entries = await buildCatalog();
    return NextResponse.json(entries, {
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  const entries = await buildCatalog();
  const body = JSON.stringify(entries);
  const etag = `"${createHash('sha256').update(body).digest('hex').slice(0, 32)}"`;

  const cacheHeaders = {
    'Cache-Control': `public, max-age=${CATALOG_CLIENT_MAX_AGE_SECONDS}, s-maxage=${CATALOG_MAX_AGE_SECONDS}, stale-while-revalidate=${CATALOG_SWR_SECONDS}`,
    ETag: etag,
  };

  const ifNoneMatch = request.headers.get('if-none-match');
  if (ifNoneMatch === etag) {
    return new NextResponse(null, { status: 304, headers: cacheHeaders });
  }

  return new NextResponse(body, {
    headers: { ...cacheHeaders, 'Content-Type': 'application/json' },
  });
}
