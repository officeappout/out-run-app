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

const AMENITY_EMOJI: Record<AmenityCategory, string> = {
  court: '🏀',
  bench: '🪑',
  drinking_water: '🚰',
  fitness_station: '💪',
};

export function amenityEmoji(category: AmenityCategory): string {
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
