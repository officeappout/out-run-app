/**
 * osm-amenity-admin.service.ts — admin-lab READ for the new `osm_amenities`
 * collection (Stage 5 Phase C, route-enrichment-pipeline plan, autonomous
 * build run 18.08.2026). Mirrors fetchCyclewaySegmentsByCity's exact
 * pattern (osm-segment-importer.ts) — a display-only fetch for the admin
 * lab map's toggleable layer, capped, city-filtered. No new ingestion path
 * here; writes happen only via scripts/extract-osm-amenities-tlv.ts.
 *
 * A single `where('city','==',cityName)` equality filter needs no new
 * composite index (Firestore auto-indexes single-field equality) — unlike
 * fetchCyclewaySegmentsByCity's cityName+tags.highway pair, which needed
 * an existing composite index to avoid a runtime "create index" error.
 */
import { collection, query, where, limit, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { AmenityCategory, CourtSport } from '@/features/parks/core/types/osm-amenity.types';

export interface AmenityPreview {
  id: string;
  category: AmenityCategory;
  sport?: CourtSport;
  location: { lat: number; lng: number };
  name: string | null;
  status: 'pending' | 'published' | 'rejected';
}

/** Approval Center queue row shape — a superset of AmenityPreview carrying the
 *  moderation/scoping fields the queue and detail modal need (authorityId for
 *  role-scoping, city for the tab's city filter, suppressedDuplicateOfParkId
 *  for the Phase-4 suppressed sub-view). */
export interface AmenityQueueItem {
  id: string;
  category: AmenityCategory;
  sport?: CourtSport;
  location: { lat: number; lng: number };
  name: string | null;
  status: 'pending' | 'published' | 'rejected';
  authorityId: string;
  city: string;
  importBatchId?: string;
  reviewedBy?: string;
  rejectionReason?: string;
  suppressedDuplicateOfParkId?: string | null;
}

const AMENITY_EMOJI: Record<AmenityCategory, string> = {
  court: '🏀',
  bench: '🪑',
  drinking_water: '🚰',
  fitness_station: '💪',
};

const COURT_SPORT_EMOJI: Record<CourtSport, string> = {
  basketball: '🏀',
  football: '⚽',
  tennis: '🎾',
  padel: '🏓',
  multi: '🏟️',
  unknown: '❓',
};

/** category-level emoji, or — for courts with a known sport — a sport-specific
 *  one. Optional 2nd param keeps existing (category-only) call sites working. */
export function amenityEmoji(category: AmenityCategory, sport?: CourtSport): string {
  if (category === 'court' && sport) return COURT_SPORT_EMOJI[sport];
  return AMENITY_EMOJI[category];
}

/**
 * Fetches osm_amenities docs for a city — display layer only, capped at
 * `limitCount` (default 500, same ceiling as the cycleways layer's own
 * precedent). Excludes 'rejected' docs (including garden-dedup-suppressed
 * ones) by default — the admin lab map is for reviewing what's about to
 * be moderated, not an audit trail of suppressed duplicates.
 */
export async function fetchAmenitiesByCity(
  cityName: string,
  limitCount: number = 500,
): Promise<AmenityPreview[]> {
  const snap = await getDocs(
    query(
      collection(db, 'osm_amenities'),
      where('city', '==', cityName),
      limit(limitCount),
    ),
  );
  const results: AmenityPreview[] = [];
  for (const d of snap.docs) {
    const data = d.data();
    if (data.status === 'rejected') continue;
    const lat = Number(data.location?.lat);
    const lng = Number(data.location?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    results.push({
      id: d.id,
      category: data.category,
      sport: data.sport,
      location: { lat, lng },
      name: data.name ?? null,
      status: data.status ?? 'pending',
    });
  }
  return results;
}

/**
 * Fetches osm_amenities docs by moderation status, for the Approval Center's
 * amenities tab — 'pending' for the normal queue, 'rejected' for the Phase-4
 * suppressed sub-view (further split client-side by suppressedDuplicateOfParkId).
 * Single-field equality query, national in scope (not city-scoped like
 * fetchAmenitiesByCity) — the tab applies its own city/category filters
 * client-side over this result, same pattern as the climbs tab's climbType
 * filter. limitCount default (3000) comfortably covers one city's TLV-scale
 * dry-run (~1,556 pending); logs a warning if the cap is actually hit, since
 * that would silently truncate the queue.
 */
export async function fetchAmenitiesByStatus(
  status: 'pending' | 'rejected',
  limitCount: number = 3000,
): Promise<AmenityQueueItem[]> {
  const snap = await getDocs(
    query(
      collection(db, 'osm_amenities'),
      where('status', '==', status),
      limit(limitCount),
    ),
  );
  if (snap.size >= limitCount) {
    console.warn(`[osm-amenity-admin] fetchAmenitiesByStatus('${status}') hit the ${limitCount}-doc cap — results may be truncated.`);
  }
  const results: AmenityQueueItem[] = [];
  for (const d of snap.docs) {
    const data = d.data();
    const lat = Number(data.location?.lat);
    const lng = Number(data.location?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    results.push({
      id: d.id,
      category: data.category,
      sport: data.sport,
      location: { lat, lng },
      name: data.name ?? null,
      status: data.status ?? 'pending',
      authorityId: data.authorityId,
      city: data.city,
      importBatchId: data.importBatchId,
      reviewedBy: data.reviewedBy,
      rejectionReason: data.rejectionReason,
      suppressedDuplicateOfParkId: data.suppressedDuplicateOfParkId ?? null,
    });
  }
  return results;
}
