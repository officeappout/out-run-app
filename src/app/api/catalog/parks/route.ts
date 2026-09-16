/**
 * GET /api/catalog/parks — public, edge-cached park catalog (SPEC-07 stage 1)
 *
 * Server-side only in this stage — no client change yet (that's stage 2).
 * Reads Firestore via Admin SDK, returns a lean JSON array, and relies on
 * Vercel's edge cache (Cache-Control: s-maxage) to answer almost every
 * request without ever reaching this function or Firestore again — see
 * docs/audit-2026-09/SPEC-07-shared-catalog.md for the full design and the
 * cost math (~14M Firestore reads/day today → ~150/day once this is live).
 *
 * Field list is exactly what stage 0's field-mapping found real map/search
 * consumers reading (AppMap's vector-pin GeoJSON, ParkPhotoMarker,
 * useNearbyParks) — not a guess, not the full Park type. Measured against
 * real production data: 60.2KB gzipped for 1158 parks, under the 100KB
 * target. `imageUrl` is the raw resolved-priority URL (imageUrl → image →
 * images[0], same priority as resolveParkImage) with NO width baked in —
 * every consumer calls bunnyImg itself with whatever width it needs (80 for
 * a map marker, 400 for a card); the catalog must not fix that choice for
 * every future consumer.
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

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CATALOG_MAX_AGE_SECONDS = 600; // 10 min — approved SPEC-07 stage 0 value
const CATALOG_SWR_SECONDS = 86400; // 24h

interface CatalogParkEntry {
  id: string;
  name: string;
  lat: number;
  lng: number;
  facilityType: string;
  isFunctional: boolean;
  urbanType: string | null;
  imageUrl: string | null;
}

function resolveImage(d: FirebaseFirestore.DocumentData): string | null {
  return d.imageUrl || d.image || (Array.isArray(d.images) ? d.images[0] : null) || null;
}

function isEffectivelyPublished(d: FirebaseFirestore.DocumentData): boolean {
  return d.published ?? d.contentStatus === 'published';
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
      urbanType: d.urbanType || null,
      imageUrl: resolveImage(d),
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
    'Cache-Control': `public, s-maxage=${CATALOG_MAX_AGE_SECONDS}, stale-while-revalidate=${CATALOG_SWR_SECONDS}`,
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
