/**
 * scripts/lib/route-lighting-street-segments.node.ts — city-parameterized
 * extraction of scripts/backfill-route-lit-tag-tlv.ts's per-route lighting
 * compute, so a Haifa run and a future TLV run call the SAME function
 * instead of two hand-typed copies (same discipline as scripts/lib/
 * route-composition-classify.ts and distance-unit-classify.ts before it).
 *
 * Reuses route-comfort-tags.service.ts's computeLitCoverage/
 * shouldSuggestNightLighting verbatim — this module is the Firestore I/O
 * layer around that pure classifier, not a second lighting algorithm.
 *
 * CITYNAME ALIASING: street_segments' `cityName` field is NOT one string
 * per logical city — Tel Aviv-Yafo's 18,426-doc collection has 6,692 docs
 * tagged "תל אביב" and 1,144 tagged "תל אביב-יפו" (confirmed live,
 * 30.08.2026 — a pre-existing data-hygiene debt, not something this module
 * fixes). The geohash-bounded candidate query itself is geography-scoped
 * (a Haifa-radius box cannot return Tel Aviv docs), so it needs no
 * `cityName` Firestore filter — adding one would require a new composite
 * index (cityName + geohash) for no real benefit given the query is already
 * geographically bounded. What DOES need the alias list: nearby-city
 * boundary safety (e.g. Haifa vs. Zichron Yaakov, close enough on the
 * Carmel coast that a route near the edge could geohash-match a
 * neighboring city's segments) and, for a future multi-alias city like
 * TLV, making sure a real same-city candidate isn't silently dropped just
 * because it's tagged under the OTHER spelling. Handled as an in-memory
 * filter after the geohash fetch, not a query clause — same correctness,
 * zero new index risk.
 */
import { geohashQueryBounds } from 'geofire-common';
import {
  computeLitCoverage, shouldSuggestNightLighting, LIT_TAG_PROXIMITY_METERS, LIT_TAG_COVERAGE_THRESHOLD,
  type LitSegmentCandidate,
} from '../../src/features/parks/core/services/route-comfort-tags.service';

export const MAX_SAMPLES_PER_ROUTE = 20;
// Generous prefilter radius around each sample point — must exceed
// LIT_TAG_PROXIMITY_METERS (20m) by a wide margin (same "coarse box,
// precise check" reasoning as backfill-route-lit-tag-tlv.ts).
export const SEGMENT_QUERY_RADIUS_METERS = 200;

export interface RouteLightingResult {
  status: 'computed' | 'unknown';
  litCoveragePct: number | null;
  isLit: boolean | null;
  /** Diagnostic only, not persisted — how many same-city candidate segments were found near this route's sampled points. */
  candidateSegmentsFound: number;
  samplePointCount: number;
}

/** Evenly samples up to `max` points from a path, always including first+last. */
function sampleEvenly<T>(arr: T[], max: number): T[] {
  if (arr.length <= max) return arr;
  const step = (arr.length - 1) / (max - 1);
  const out: T[] = [];
  for (let i = 0; i < max; i++) out.push(arr[Math.round(i * step)]);
  return out;
}

/**
 * Pure Firestore fetch + pure compute for ONE route. `rawPath` is the
 * route's stored path in its persisted {lat,lng} form (matches
 * official_routes.path exactly — caller doesn't need to know the
 * [lng,lat] tuple convention computeLitCoverage/AdjacencyCorridor use
 * internally, this function handles the conversion).
 *
 * status:'unknown' ONLY when every sampled point found zero same-city
 * candidate segments within SEGMENT_QUERY_RADIUS_METERS — never for
 * merely-low coverage, which is a genuine 'computed', isLit:false result.
 */
export async function computeRouteLighting(
  db: FirebaseFirestore.Firestore,
  rawPath: Array<{ lat: number; lng: number }>,
  cityNameAliases: string[],
): Promise<RouteLightingResult> {
  if (!Array.isArray(rawPath) || rawPath.length < 2) {
    return { status: 'unknown', litCoveragePct: null, isLit: null, candidateSegmentsFound: 0, samplePointCount: 0 };
  }
  const fullPath: [number, number][] = rawPath.map((p) => [Number(p.lng) || 0, Number(p.lat) || 0]);
  const samplePath = sampleEvenly(fullPath, MAX_SAMPLES_PER_ROUTE);

  const candidatesPerPoint: LitSegmentCandidate[][] = [];
  let totalCandidates = 0;
  for (const [lng, lat] of samplePath) {
    const bounds = geohashQueryBounds([lat, lng], SEGMENT_QUERY_RADIUS_METERS);
    const seen = new Set<string>();
    const candidates: LitSegmentCandidate[] = [];
    for (const [start, end] of bounds) {
      const segSnap = await db.collection('street_segments').orderBy('geohash').startAt(start).endAt(end).get();
      for (const s of segSnap.docs) {
        if (seen.has(s.id)) continue;
        seen.add(s.id);
        const seg = s.data();
        if (!cityNameAliases.includes(seg.cityName)) continue; // in-memory alias filter — see module header
        const rawSegPath = Array.isArray(seg.path) ? seg.path : null;
        const path: [number, number][] = rawSegPath
          ? rawSegPath.map((p: any) => [Number(p.lng) || 0, Number(p.lat) || 0])
          : seg.midpoint ? [[Number(seg.midpoint.lng) || 0, Number(seg.midpoint.lat) || 0]] : [];
        if (path.length === 0) continue;
        candidates.push({ id: s.id, path, lit: seg.tags?.lit === 'yes' });
      }
    }
    totalCandidates += candidates.length;
    candidatesPerPoint.push(candidates);
  }

  if (totalCandidates === 0) {
    return { status: 'unknown', litCoveragePct: null, isLit: null, candidateSegmentsFound: 0, samplePointCount: samplePath.length };
  }

  const coverage = computeLitCoverage(samplePath, candidatesPerPoint, LIT_TAG_PROXIMITY_METERS);
  const litCoveragePct = Math.round(coverage * 1000) / 10;
  return {
    status: 'computed',
    litCoveragePct,
    isLit: shouldSuggestNightLighting(coverage, LIT_TAG_COVERAGE_THRESHOLD),
    candidateSegmentsFound: totalCandidates,
    samplePointCount: samplePath.length,
  };
}
