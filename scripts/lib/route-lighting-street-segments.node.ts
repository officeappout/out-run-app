/**
 * scripts/lib/route-lighting-street-segments.node.ts — city-parameterized
 * extraction of scripts/backfill-route-lit-tag-tlv.ts's per-route lighting
 * compute, so a Haifa run and a future TLV run call the SAME function
 * instead of two hand-typed copies (same discipline as scripts/lib/
 * route-composition-classify.ts and distance-unit-classify.ts before it).
 *
 * UNTAGGED-VS-CONFIRMED-UNLIT (found 31.08.2026, before this module's first
 * --apply): route-comfort-tags.service.ts's LitSegmentCandidate.lit is a
 * boolean built as `tags.lit === 'yes'` — this collapses BOTH "no lit tag
 * at all" (OSM has no opinion) and an explicit "lit=no" into the same
 * `false`, and computeLitCoverage's `.some()` check can't tell them apart.
 * With ~97.7% of Haifa's street_segments untagged, calling that function
 * once over raw candidates would silently report "unlit" for routes that
 * are actually just unmapped — exactly the false-negative computeLitCoverage
 * was designed to avoid at the ROUTE level (status:'unknown' when zero
 * candidates exist) but can't avoid at the PER-POINT level, since it never
 * sees the real 3-state tag value.
 *
 * Fix: this module tracks each candidate's REAL tag ('yes'|'no'|null), and
 * calls computeLitCoverage TWICE per route — once over only yes-tagged
 * candidates, once over only no-tagged candidates (each mapped to lit:true
 * for that pass) — rather than modifying the shared service (used
 * elsewhere; changing its semantics is out of scope here). This still
 * reuses computeLitCoverage's exact distance-check logic
 * (findNearestContactPoint, LIT_TAG_PROXIMITY_METERS) unmodified for both
 * passes — the fix is in what candidates get fed to it, not a new
 * algorithm. A route whose points are overwhelmingly untagged now reports
 * status:'unknown', not a false 'unlit' — see REAL_DATA_MIN_FRACTION.
 *
 * Reuses route-comfort-tags.service.ts's computeLitCoverage/
 * shouldSuggestNightLighting verbatim (called twice, not modified) — this
 * module is the Firestore I/O + honesty layer around that pure classifier,
 * not a second lighting algorithm.
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
/**
 * A route needs REAL (yes- or no-tagged) data within LIT_TAG_PROXIMITY_METERS
 * of at least this fraction of its sampled points before its computed
 * coverage is trusted. Below this, the nearby candidate pool is
 * "overwhelmingly untagged" (the user's framing) and the honest answer is
 * "we don't know," not a number built almost entirely from absent data.
 * 0.5 (majority) — the same "surface for review, don't silently pick"
 * threshold discipline as every other cutoff in this pipeline; adjustable.
 */
export const REAL_DATA_MIN_FRACTION = 0.5;

export interface RouteLightingResult {
  status: 'computed' | 'unknown';
  litCoveragePct: number | null;
  isLit: boolean | null;
  /** Diagnostic only, not persisted — how many same-city candidate segments were found near this route's sampled points (tagged or not). */
  candidateSegmentsFound: number;
  samplePointCount: number;
  /** Diagnostic only, not persisted — fraction of sample points with a real (yes/no) tagged candidate within LIT_TAG_PROXIMITY_METERS. Drives the status gate. */
  realDataPointFraction: number;
}

/** Evenly samples up to `max` points from a path, always including first+last. */
function sampleEvenly<T>(arr: T[], max: number): T[] {
  if (arr.length <= max) return arr;
  const step = (arr.length - 1) / (max - 1);
  const out: T[] = [];
  for (let i = 0; i < max; i++) out.push(arr[Math.round(i * step)]);
  return out;
}

interface TaggedCandidate { id: string; path: [number, number][]; tag: 'yes' | 'no' | null }

/**
 * Concurrency cap for the per-route geohash-bound queries below (04.09.2026,
 * lighting-step 504 fix). The original code awaited each (sample point ×
 * geohash bound) query sequentially — for a real route this is commonly
 * 40-100+ independent reads, and for a whole city's worth of routes in one
 * API-route invocation (maxDuration=60) that measured at ~2,745 sequential
 * queries / ~118ms avg ≈ ~325s for Herzliya (35 routes) — 5.4x over budget.
 * These queries are independent reads (different geohash ranges), so they
 * parallelize safely with no ordering/correctness dependency between them —
 * batched via Promise.all in fixed-size chunks (not a sliding-window
 * limiter) so results map back to their originating sample point by index,
 * deterministically, matching the original per-point dedup semantics below.
 */
const LIGHTING_QUERY_CONCURRENCY = 25;

interface BoundQueryTask { pointIndex: number; start: string; end: string }
interface BoundQueryResult { pointIndex: number; docs: FirebaseFirestore.QueryDocumentSnapshot[] }

async function runBoundQueriesConcurrently(
  db: FirebaseFirestore.Firestore,
  tasks: BoundQueryTask[],
): Promise<BoundQueryResult[]> {
  const results: BoundQueryResult[] = new Array(tasks.length);
  for (let i = 0; i < tasks.length; i += LIGHTING_QUERY_CONCURRENCY) {
    const chunk = tasks.slice(i, i + LIGHTING_QUERY_CONCURRENCY);
    const chunkResults = await Promise.all(
      chunk.map(async (t): Promise<BoundQueryResult> => {
        const snap = await db.collection('street_segments').orderBy('geohash').startAt(t.start).endAt(t.end).get();
        return { pointIndex: t.pointIndex, docs: snap.docs };
      }),
    );
    chunkResults.forEach((r, j) => { results[i + j] = r; });
  }
  return results;
}

/**
 * Cheap per-city short-circuit (04.09.2026, lighting-step 504 fix): a virgin
 * city with zero street_segments can never produce lighting data — every
 * sample-point query would return empty regardless (measured live against
 * Herzliya: 0 street_segments, queries still cost their full ~118ms/query
 * network round-trip each). One `limit(1)` existence check replaces the
 * entire per-route query loop for such a city. Callers doing a city-wide
 * backfill (many routes) should call this ONCE before their route loop and
 * skip calling computeRouteLighting per-route when it's false — see
 * backfill-route-lighting-haifa.ts's use of this.
 */
export async function cityHasAnySegments(
  db: FirebaseFirestore.Firestore,
  cityNameAliases: string[],
): Promise<boolean> {
  const snap = await db.collection('street_segments').where('cityName', 'in', cityNameAliases).limit(1).get();
  return !snap.empty;
}

/**
 * Pure Firestore fetch + pure compute for ONE route. `rawPath` is the
 * route's stored path in its persisted {lat,lng} form (matches
 * official_routes.path exactly — caller doesn't need to know the
 * [lng,lat] tuple convention computeLitCoverage/AdjacencyCorridor use
 * internally, this function handles the conversion).
 *
 * status:'unknown' when either (a) every sampled point found zero
 * same-city candidate segments at all, or (b) real (yes/no) tagged data
 * covers fewer than REAL_DATA_MIN_FRACTION of sampled points — an
 * "overwhelmingly untagged" nearby pool is not trustworthy enough to call
 * 'unlit', even though raw candidates exist. Never a false 'unlit' for
 * merely-low-but-real coverage — that's a genuine 'computed', isLit:false
 * result.
 */
export async function computeRouteLighting(
  db: FirebaseFirestore.Firestore,
  rawPath: Array<{ lat: number; lng: number }>,
  cityNameAliases: string[],
): Promise<RouteLightingResult> {
  if (!Array.isArray(rawPath) || rawPath.length < 2) {
    return { status: 'unknown', litCoveragePct: null, isLit: null, candidateSegmentsFound: 0, samplePointCount: 0, realDataPointFraction: 0 };
  }
  const fullPath: [number, number][] = rawPath.map((p) => [Number(p.lng) || 0, Number(p.lat) || 0]);
  const samplePath = sampleEvenly(fullPath, MAX_SAMPLES_PER_ROUTE);

  const tasks: BoundQueryTask[] = [];
  samplePath.forEach(([lng, lat], pointIndex) => {
    const bounds = geohashQueryBounds([lat, lng], SEGMENT_QUERY_RADIUS_METERS);
    for (const [start, end] of bounds) tasks.push({ pointIndex, start, end });
  });

  const queryResults = await runBoundQueriesConcurrently(db, tasks);

  // Dedup is PER-POINT (matches the original sequential loop's semantics
  // exactly) — a segment found via two overlapping geohash bounds for the
  // SAME point is deduped, but the same segment showing up near two
  // DIFFERENT sample points is intentionally counted at each.
  const candidatesPerPoint: TaggedCandidate[][] = samplePath.map(() => []);
  const seenPerPoint: Set<string>[] = samplePath.map(() => new Set<string>());
  for (const { pointIndex, docs } of queryResults) {
    const seen = seenPerPoint[pointIndex];
    const candidates = candidatesPerPoint[pointIndex];
    for (const s of docs) {
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      const seg = s.data();
      if (!cityNameAliases.includes(seg.cityName)) continue; // in-memory alias filter — see module header
      const rawSegPath = Array.isArray(seg.path) ? seg.path : null;
      const path: [number, number][] = rawSegPath
        ? rawSegPath.map((p: any) => [Number(p.lng) || 0, Number(p.lat) || 0])
        : seg.midpoint ? [[Number(seg.midpoint.lng) || 0, Number(seg.midpoint.lat) || 0]] : [];
      if (path.length === 0) continue;
      // Preserve the REAL 3-state tag — 'no lit tag at all' and 'lit=no'
      // must not collapse into the same value here (see module header).
      const rawLit = seg.tags?.lit;
      const tag: 'yes' | 'no' | null = rawLit === 'yes' ? 'yes' : rawLit === 'no' ? 'no' : null;
      candidates.push({ id: s.id, path, tag });
    }
  }
  let totalCandidates = 0;
  candidatesPerPoint.forEach((c) => { totalCandidates += c.length; });

  if (totalCandidates === 0) {
    return { status: 'unknown', litCoveragePct: null, isLit: null, candidateSegmentsFound: 0, samplePointCount: samplePath.length, realDataPointFraction: 0 };
  }

  // computeLitCoverage is reused UNMODIFIED, called twice with differently
  // filtered candidate sets (mapped to its boolean `lit` field per-pass) —
  // same distance-check logic, not a new algorithm. yesFraction +
  // noFraction can double-count a point that has BOTH a yes- and a
  // no-tagged candidate within threshold (rare, and only affects the
  // status-gate denominator, not the final litCoveragePct ratio below) —
  // accepted as a harmless approximation for a threshold gate.
  const yesCandidatesPerPoint: LitSegmentCandidate[][] = candidatesPerPoint.map((pts) =>
    pts.filter((c) => c.tag === 'yes').map((c) => ({ id: c.id, path: c.path, lit: true })),
  );
  const noCandidatesPerPoint: LitSegmentCandidate[][] = candidatesPerPoint.map((pts) =>
    pts.filter((c) => c.tag === 'no').map((c) => ({ id: c.id, path: c.path, lit: true })),
  );
  const yesFraction = computeLitCoverage(samplePath, yesCandidatesPerPoint, LIT_TAG_PROXIMITY_METERS);
  const noFraction = computeLitCoverage(samplePath, noCandidatesPerPoint, LIT_TAG_PROXIMITY_METERS);
  const realDataPointFraction = Math.min(1, yesFraction + noFraction);

  if (realDataPointFraction < REAL_DATA_MIN_FRACTION) {
    return { status: 'unknown', litCoveragePct: null, isLit: null, candidateSegmentsFound: totalCandidates, samplePointCount: samplePath.length, realDataPointFraction };
  }

  // Among points that DO have real tag data nearby, what fraction are lit —
  // not diluted by untagged points, which carry no information either way.
  const coverage = yesFraction / realDataPointFraction;
  const litCoveragePct = Math.round(coverage * 1000) / 10;
  return {
    status: 'computed',
    litCoveragePct,
    isLit: shouldSuggestNightLighting(coverage, LIT_TAG_COVERAGE_THRESHOLD),
    candidateSegmentsFound: totalCandidates,
    samplePointCount: samplePath.length,
    realDataPointFraction,
  };
}
