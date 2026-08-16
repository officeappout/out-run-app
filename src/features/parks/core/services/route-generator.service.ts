// src/features/map/services/route-generator.service.ts

import { collection, endAt, getDocs, limit, orderBy, query, startAt, where } from 'firebase/firestore';
import { geohashQueryBounds } from 'geofire-common';
import { db } from '@/lib/firebase';
import { Route, ActivityType, CommuteVariant } from '../types/route.types';
import { Park as MapPark } from '../types/park.types';
import { MapboxService } from './mapbox.service';
import type { MapboxPathResult } from './mapbox.service';
import { rdpSimplify } from '@/utils/pathSimplify';
import { withCancelPrevious } from '@/lib/requestGovernor';
import { buildOutAndBackPath, isSameCoord, pathLengthMeters, sliceFlowPathToDistance } from './geoUtils';
import { SPEED_KMH, KCAL_PER_KM } from './route-request.utils';
import {
  IS_PROXIMITY_SEGMENT_QUERY_ENABLED,
  IS_TIGHTENED_DISTANCE_WINDOW_ENABLED,
  IS_GUARANTEED_ROUTE_FALLBACK_ENABLED,
  IS_ROUTE_ADJACENCY_ENABLED,
} from '@/config/feature-flags';

// ── Diagnostics for the UI ──────────────────────────────────────────────────
// The generator runs in a service module so the UI can't observe its
// intermediate state directly. We expose a small read-only snapshot of the
// last query's outcome so dev surfaces (e.g. FreeRunRouteSelector's empty
// state banner) can render an actionable hint instead of a generic
// "no routes" message — most often "your street_segments collection is
// empty for this city, run the OSM importer".
//
// The snapshot is overwritten on every call so consumers must read it
// immediately after `generateDynamicRoutes()` resolves; it is not a
// reactive store and is intended for debugging / dev banners only.
export type WaypointSourceUsed =
  | 'street_segments'           // scored docs found within radius
  | 'random_fallback_no_city'   // cityName was undefined → went random
  | 'random_fallback_empty_city' // collection has docs but none for this city
  | 'random_fallback_empty_collection' // collection itself is empty
  | 'random_fallback_out_of_radius' // city has docs but none within targetDistance/2
  | 'random_fallback_query_error'; // Firestore threw

export interface RouteGenerationDiagnostics {
  cityNameUsed?: string;
  cityNameRaw?: string;
  source: WaypointSourceUsed;
  segmentsFetched: number;
  segmentsInRadius: number;
  collectionSampleCityName?: string;
  timestamp: number;
  /**
   * Which street_segments fetch strategy produced this result. Absent =
   * the citywide-by-score query (today's only strategy). Present when
   * IS_PROXIMITY_SEGMENT_QUERY_ENABLED is on and fetchScoredWaypointsByProximity
   * ran — see its own doc comment for the geohash bounding-box approach.
   */
  queryStrategy?: 'city_score' | 'proximity_geohash';
  /** Proximity path only: how many geohash startAt/endAt sub-queries fired. */
  geohashBoxesQueried?: number;
  /** Proximity path only: total docs returned across all sub-queries, before dedupe. */
  docsFetchedRaw?: number;
  /** Proximity path only: docs remaining after de-duplicating by doc id. */
  docsAfterDedupe?: number;
  /**
   * Set only when IS_GUARANTEED_ROUTE_FALLBACK_ENABLED is on AND the main
   * loop's primary window (computeTightenedDistanceWindow) accepted zero
   * routes. 'tier1_near_miss': the closest-to-target result already computed
   * during the main loop, admitted because it fell within computeDistanceWindow
   * (today's pre-tightening bound). 'tier2_relaxed_refetch': Tier 1 also found
   * nothing, so a second, relaxed candidate fetch + combination pass ran and
   * found something within computeDistanceWindow. Absent = the main loop's
   * primary window itself accepted a route, no fallback tier needed — or the
   * flag is off. Diagnostics-only; does not affect what's returned.
   */
  guaranteedFallbackTier?: 'tier1_near_miss' | 'tier2_relaxed_refetch';
}

let _lastDiagnostics: RouteGenerationDiagnostics | null = null;
function setDiagnostics(d: Omit<RouteGenerationDiagnostics, 'timestamp'>) {
  _lastDiagnostics = { ...d, timestamp: Date.now() };
}
export function getLastGenerationDiagnostics(): RouteGenerationDiagnostics | null {
  return _lastDiagnostics;
}

/**
 * Per-activity calorie rate for the 3 route-building call sites (14.08.2026,
 * Fix 3). Shares route-request.utils.ts's KCAL_PER_KM table instead of each
 * site's own inline `activity === 'cycling' ? 25 : 70` (or, in
 * buildCommuteRoute's case, `: 65` — a THIRD, undocumented value; this
 * unifies all three onto the one already-correct, already-in-production
 * table). ActivityType includes 'workout' (route generation never actually
 * produces it, but the type allows it) — DrawerActivity does not, so it
 * falls back to the walking rate, matching how the rest of this file already
 * treats any non-cycling, non-running-specific activity (see the `profile`
 * selection a few lines below each call site).
 */
function kcalPerKmFor(activity: ActivityType): number {
  if (activity === 'cycling') return KCAL_PER_KM.cycling;
  if (activity === 'running') return KCAL_PER_KM.running;
  return KCAL_PER_KM.walking;
}

interface WaypointCandidate {
  lat: number;
  lng: number;
  score: number;
  distanceFromUser: number;
  nearbyParks: number;
  isGreen: boolean;
  isSafe: boolean;
  /** True when this candidate came from a broadcast official/curated route
   *  segment (official-route-broadcaster.ts). See scoreWaypoint's
   *  preferOfficialRoutes opt-in. */
  isOfficial?: boolean;
}

interface RouteGenerationOptions {
  userLocation: { lat: number; lng: number };
  targetDistance: number; // in km
  activity: ActivityType;
  routeGenerationIndex: number;
  preferences: {
    includeStrength: boolean;
    surface?: 'road' | 'trail';
    /**
     * Additive, hybrid-only option (dormant): the hybrid session builder passes
     * `qualityRoute: true`. This generator applies its route-quality passes
     * (continue_straight + bearing-order + RDP-simplify) UNCONDITIONALLY, so the
     * flag is a no-op here — kept solely so `start-hybrid-session.ts` type-checks
     * while HYBRID_SLOTS_ENABLED is false. See merge note (hybrid → main).
     */
    qualityRoute?: boolean;
    /**
     * Additive perf option: cap how many valid loops the sequential generator
     * must collect before it stops. Defaults to 3 (legacy free-run carousel,
     * which shows three cards). The hybrid composer consumes only `routes[0]`,
     * so it passes `maxRoutes: 1` — the loop then breaks after the first valid
     * route, BEFORE the trailing `delay(1500)` fires, cutting the two
     * guaranteed inter-route waits off the hybrid compose critical path.
     */
    maxRoutes?: number;
    /**
     * Additive, opt-in override for the waypoint-scoring "ideal distance from user"
     * (scoreWaypoint's `idealDistance`, historically a hardcoded 1.0km — tuned for
     * ~3-5km free-run targets, NOT scaled to `targetDistance`). Omitted → exactly
     * today's behaviour (1.0km), byte-identical for every existing caller.
     * A small-target caller (e.g. a short walking loop) should pass
     * `targetDistance / 6` — the same triangular-loop perimeter correction already
     * used by `generateRandomWaypoints` (3 waypoints ~120° apart → perimeter ≈
     * 5.2·r) — so real street_segments candidates are scored toward a radius that
     * actually fits a short target, instead of being pulled to the edge of the
     * (also target-relative) search radius.
     */
    idealWaypointDistanceKm?: number;
  };
  parks: MapPark[];
  /** City name used to query street_segments from Firestore. Falls back to random waypoints when absent. */
  cityName?: string;
  /**
   * When set, segments from `street_segments` whose `officialRouteId`
   * matches this value get a 5× score multiplier — strongly biasing the
   * dynamic generator to send the user back onto the original official
   * route's corridor. Used by `useRouteDeviationOrchestrator` to recover
   * the user toward their intended route after a deviation.
   *
   * Has no effect when (a) the value is undefined, (b) the active path
   * source is `random_fallback_*` (no segments to bias), or (c) no
   * segments in the candidate pool carry that officialRouteId.
   */
  activeOfficialRouteId?: string;
  /**
   * A-to-B commute switch. When set, the generator skips the loop
   * algorithm (waypoint pool → triangular combos → sequential Mapbox
   * loop calls) and instead returns up to 3 commute variants:
   *
   * All three come from a SINGLE `getSmartPathAlternatives` call
   * (`alternatives=true` returns up to 3 geometries in one round-trip):
   *
   *   1. fastest     — Mapbox primary route (shortest duration alternative).
   *   2. alternative — A different alternative geometry from that same call.
   *                    No park bias, no scenic vias — pure Mapbox alt.
   *   3. quiet       — Derived from the LONGEST-duration alternative as a
   *                    "quieter back-streets" heuristic. Omitted when it
   *                    would duplicate the fastest / alternative polyline.
   *                    (No dedicated `exclude=motorway` call: that param is
   *                    driving-only and the walking/cycling profiles reject
   *                    it — see `generateCommuteRoutes`.)
   *
   * `targetDistance`, `cityName`, `activeOfficialRouteId` and the
   * `street_segments` waypoint pool are IGNORED on this branch — none
   * of them apply to point-to-point navigation.
   */
  destination?: { lat: number; lng: number };
  /**
   * Opt-in short-target generation. When true AND targetDistance is below
   * MIN_GENERATION_KM, the generator skips the usual floor-inflation and
   * instead tries a genuinely short LOOP first (same triangular-loop
   * pipeline, recalibrated acceptance thresholds — see generateLoopRoutes'
   * `shortMode`), falling back to an OUT-AND-BACK shape
   * (generateOutAndBackRoutes) only if the loop attempt yields zero routes.
   *
   * Deliberately generic — not step-goal-specific. Phase 1 (current): only
   * the step-goal deep-link (DiscoverLayer.tsx, behind
   * IS_STEP_GOAL_SHORT_ROUTE_ENABLED) ever sets this. Phase 2 (future,
   * not built yet): the manual free-run flow could set the same flag for
   * any small target — no changes needed here, since this option carries
   * no caller-specific logic.
   *
   * Ignored when targetDistance >= MIN_GENERATION_KM (today's loop
   * behavior already handles those targets fine) or when `destination` is
   * set (commute mode is a distinct branch, untouched by this option).
   */
  shortRouteMode?: boolean;
  /**
   * Corridor-following mode. When set, the generator skips the entire
   * waypoint-pool / triangular-combination pipeline and instead fetches
   * `official_routes/{followOfficialRouteId}` via `InventoryService.getRouteById`
   * and returns its stored `path` verbatim as the route geometry — see
   * `generateCorridorRoute`. Distinct from `activeOfficialRouteId` (above),
   * which only *biases scoring* toward a corridor during deviation recovery;
   * this option *replaces generation* with the corridor itself.
   *
   * `targetDistance`, `cityName`, `preferences`, and the `street_segments`
   * waypoint pool are IGNORED on this branch — the corridor's own real
   * length is the route's distance, not a generation target.
   */
  followOfficialRouteId?: string;
  /**
   * Chain-discovery mode (Phase 2 of the corridor-following engine, see
   * .claude/plans/build-the-phase-0-noble-kahn.md). When true, the generator
   * finds nearby `official_routes` corridors, walks the precomputed
   * `route_adjacency` graph to sequence 2+ of them with real Mapbox
   * connectors into one long chained route — NO hardcoded corridor list.
   * Requires `IS_ROUTE_ADJACENCY_ENABLED`; returns `[]` immediately when
   * that flag is off (see `generateDiscoveredChainRoute`). Uses
   * `userLocation`, `targetDistance`, `cityName`, and `activity`; ignores
   * `preferences` and the `street_segments` waypoint pool entirely.
   */
  discoverCorridorChain?: boolean;
  /**
   * User-anchored, corridor-flowing, distance-trimmed mode (David-approved
   * 16.08.2026, .claude/plans/build-the-phase-0-noble-kahn.md — "NEW
   * CAPABILITY" section). Unlike `followOfficialRouteId`/`discoverCorridorChain`,
   * the route starts AT THE USER, not at a corridor: the user->corridor leg
   * is a real Mapbox connector and counts toward `targetDistance`. Flows
   * through one or more nearby corridors (extending via the same
   * `route_adjacency` chain-walk `discoverCorridorChain` uses), TRIMS the
   * accumulated flow to exactly half of `targetDistance`, then mirrors it
   * into a round trip (`buildOutAndBackPath`) — out-and-back is the
   * guaranteed shape (a future `returnShape` field is the planned seam for
   * an eventual loop-return option — not built yet). Requires
   * `IS_ROUTE_ADJACENCY_ENABLED`; returns `[]`
   * immediately when that flag is off (see `generateUserAnchoredFlowRoute`).
   * Falls back to normal (non-corridor) generation when no nearby corridor
   * is close enough to be worth the detour, per `selectProximityAwareCorridor`.
   */
  userAnchoredCorridorFlow?: boolean;
  /**
   * Structural hook only (Stage C, 16.08.2026, David-approved — explicitly
   * "no junction/traffic-light-aware scoring... a placeholder seam, not a
   * partial implementation"). `'out_and_back'` is the only supported value
   * today and `generateUserAnchoredFlowRoute` builds it unconditionally
   * regardless of what's passed — this field exists purely so a future
   * loop-return layer (once real junction/scoring logic is designed) has
   * somewhere to plug in `'loop'` as a second value without another
   * `RouteGenerationOptions` interface change. Ignored by every other
   * generation path; defaults to `'out_and_back'` when omitted.
   */
  returnShape?: 'out_and_back';
}

// ── Street-segment types ───────────────────────────────────────────────────────
// Flexible enough to match whatever geometry fields the collection uses.
// Canonical writer = src/features/admin/services/osm-segment-importer.ts,
// which produces docs with { path, midpoint }. The other field names are
// kept as fallbacks so legacy / hand-imported docs still resolve.

interface StreetSegment {
  score: number;
  cityName?: string;
  /** Canonical: pre-computed midpoint stored by the OSM importer. */
  midpoint?: { lat: number; lng: number };
  /** Canonical: ordered list of nodes from the OSM importer. */
  path?: Array<{ lat: number; lng: number }>;
  /** Legacy/alternative: array of coordinate objects. */
  coordinates?: Array<{ lat: number; lng: number }>;
  /** Legacy/alternative: single pre-computed centroid. */
  center?: { lat: number; lng: number };
  /** Legacy/alternative: start/end pair — midpoint is computed. */
  start?: { lat: number; lng: number };
  end?: { lat: number; lng: number };
  /**
   * True for segments broadcast by the official-route bridge (writer:
   * `official-route-broadcaster.ts`). Carries no behaviour by itself
   * inside the generator — the discrimination knob is `officialRouteId`
   * below. Useful for analytics and admin tooling.
   */
  isOfficial?: boolean;
  /**
   * Back-reference to the `official_routes` document this segment was
   * broadcast from. Used by the deviation orchestrator to apply the 5×
   * bias when the user wanders off the corresponding route.
   */
  officialRouteId?: string;
}

/** Extract a single representative { lat, lng } point from a segment document.
 *  Priority: midpoint → center → path midpoint → coordinates midpoint
 *           → start/end midpoint.
 *  Returns null when no usable geometry is found. */
function segmentMidpoint(seg: StreetSegment): { lat: number; lng: number } | null {
  if (seg.midpoint) return { lat: seg.midpoint.lat, lng: seg.midpoint.lng };
  if (seg.center) return { lat: seg.center.lat, lng: seg.center.lng };
  if (seg.path && seg.path.length > 0) {
    const mid = seg.path[Math.floor(seg.path.length / 2)];
    return { lat: mid.lat, lng: mid.lng };
  }
  if (seg.coordinates && seg.coordinates.length > 0) {
    const mid = seg.coordinates[Math.floor(seg.coordinates.length / 2)];
    return { lat: mid.lat, lng: mid.lng };
  }
  if (seg.start && seg.end) {
    return {
      lat: (seg.start.lat + seg.end.lat) / 2,
      lng: (seg.start.lng + seg.end.lng) / 2,
    };
  }
  return null;
}

/**
 * Soft shuffle: Fisher-Yates within each group of candidates whose scores are
 * within 1 point of each other. The overall high-score-first order is preserved
 * — only ties and near-ties are randomised. Uses a deterministic seed so the
 * same shuffle plays out consistently within a session but changes across sessions.
 */
function softShuffleTiedGroups<T extends { score: number }>(sorted: T[], seed: number): T[] {
  if (sorted.length === 0) return sorted;
  const result: T[] = [];
  let groupStart = 0;

  for (let i = 1; i <= sorted.length; i++) {
    const pastEnd = i === sorted.length;
    const scoreGap = pastEnd ? Infinity : sorted[groupStart].score - sorted[i].score;

    if (scoreGap > 1) {
      // Shuffle this group in-place with a seeded PRNG
      const group = sorted.slice(groupStart, i);
      for (let k = group.length - 1; k > 0; k--) {
        const j = Math.abs((seed * 1664525 + k * 22695477 + groupStart) % (k + 1));
        [group[k], group[j]] = [group[j], group[k]];
      }
      result.push(...group);
      groupStart = i;
    }
  }
  return result;
}

/**
 * Query Firestore `street_segments` for high-scoring segments in the user's city,
 * convert them into waypoint candidates within `targetDistance / 2` km of the user,
 * and return the top 12 by score.
 *
 * Requires a composite Firestore index on (cityName ASC, score DESC).
 * Falls back to `null` when the city is unknown or the collection is empty.
 */
/**
 * Strip invisible Unicode chars that Mapbox / pasted UI strings often carry
 * but Firestore's exact-match query won't match through:
 *   • U+200E / U+200F (LRM / RLM) — bidi direction overrides commonly
 *     injected when Hebrew strings cross a Latin context.
 *   • U+202A–U+202E — embedding / override pairs.
 *   • U+FEFF — zero-width no-break space (BOM).
 *   • U+200B–U+200D — zero-width space / joiner / non-joiner.
 * The visual string is identical before and after; the byte length differs.
 * Without this, `cityName === "תל אביב"` and `cityName === "\u200Fתל אביב"`
 * look the same in console but Firestore treats them as distinct keys.
 */
function sanitizeCityKey(raw: string): string {
  return raw.replace(/[\u200B-\u200F\u202A-\u202E\uFEFF]/g, '').trim();
}

/**
 * Fourth bug in the large-target family (08.08 \u2014 verified live with real Tel
 * Aviv data). useUserCityName.ts already normalises the Mapbox-vs-OSM-
 * importer "\u05EA\u05DC \u05D0\u05D1\u05D9\u05D1-\u05D9\u05E4\u05D5" \u2192 "\u05EA\u05DC \u05D0\u05D1\u05D9\u05D1" naming quirk on the QUERY side (see its
 * normalizeCityName doc comment) \u2014 but 1144 real street_segments documents
 * were imported carrying the un-normalised "\u05EA\u05DC \u05D0\u05D1\u05D9\u05D1-\u05D9\u05E4\u05D5" name and never got
 * the same treatment, so they were permanently invisible to every query
 * regardless of query-side normalisation. Confirmed live: of the top-300
 * candidates by score, 239 (80%) were sitting under the un-normalised name.
 * Ramat Gan/Givatayim/Bnei Brak/Holon/Bat Yam were also checked and have
 * ZERO segments in this collection at all \u2014 genuinely never imported, not a
 * filtering issue, so they're deliberately NOT in this alias map.
 * This is a query-side resilience patch for a known, confirmed case \u2014 the
 * real fix is a one-time backfill normalising those 1144 docs' cityName
 * field, which is a data migration, out of scope for this function.
 */
const CITY_NAME_QUERY_ALIASES: Record<string, string[]> = {
  '\u05EA\u05DC \u05D0\u05D1\u05D9\u05D1': ['\u05EA\u05DC \u05D0\u05D1\u05D9\u05D1', '\u05EA\u05DC \u05D0\u05D1\u05D9\u05D1-\u05D9\u05E4\u05D5'],
};
export function resolveCityNameQueryAliases(cleanCity: string): string[] {
  return CITY_NAME_QUERY_ALIASES[cleanCity] ?? [cleanCity];
}

/**
 * Score multiplier applied to street_segments whose `officialRouteId`
 * matches the orchestrator's `activeOfficialRouteId`. With max segment
 * score = 10, a 5× multiplier yields 50 — guaranteed to dominate ALL
 * other candidates in the top-12 sort. This is the dial to turn down to
 * 2–3 if the recovery loop ever feels too aggressive.
 *
 * NOT the same mechanism as OFFICIAL_ROUTE_PREFERENCE_BONUS below — this
 * multiplier only fires during live deviation-recovery (a specific route id
 * the user wandered off). OFFICIAL_ROUTE_PREFERENCE_BONUS is a general,
 * always-on (when opted in) nudge toward ANY nearby official corridor, not
 * tied to a specific route id.
 */
const OFFICIAL_ROUTE_BIAS_MULTIPLIER = 5;

/**
 * scoreWaypoint's preferOfficialRoutes bonus (see its doc comment for the
 * off-target guard). Deliberately modest — tie-breaker scale, matching the
 * existing distanceDiff "mid tier" bonus (+10), NOT dominant like
 * OFFICIAL_ROUTE_BIAS_MULTIPLIER above. A larger value risks reopening the
 * exact "official segment drags the loop off-target" failure mode
 * proportionalDistanceTiers was built to fix.
 */
const OFFICIAL_ROUTE_PREFERENCE_BONUS = 10;

/**
 * Shared official-bias + soft-shuffle scoring tail — used by BOTH
 * fetchScoredWaypoints (citywide-by-score query) and
 * fetchScoredWaypointsByProximity (geohash-bounded query) so this scoring
 * logic is never duplicated between the two fetch strategies. Takes
 * segments the caller has ALREADY filtered to its search radius; the
 * math here is byte-identical to what both functions need.
 */
export function scoreAndShuffleStreetSegments(
  segmentsInRadius: Array<{ point: { lat: number; lng: number }; seg: StreetSegment }>,
  activeOfficialRouteId: string | undefined,
): {
  candidates: Array<{ lat: number; lng: number; score: number; isOfficial: boolean }>;
  officialBiasApplied: number;
  officialBackboneCount: number;
} {
  let officialBiasApplied = 0;
  const scored = segmentsInRadius
    .map(({ point, seg }) => {
      // Official segments (admin-created via the back-office) always get a
      // minimum score of 10 — the maximum possible Firestore score value.
      // This makes them dominate the top-12 candidate pool so any dynamic
      // route "gravitates" toward pre-approved official corridors.
      // Detection: `isOfficial: true` (set by official-route-broadcaster)
      // OR `officialRouteId` is present (implies official lineage).
      const isOfficialSegment = seg.isOfficial === true || seg.officialRouteId != null;
      const rawScore = seg.score ?? 0;
      const baseScore = isOfficialSegment ? Math.max(rawScore, 10) : rawScore;

      // Deviation-recovery: 5× multiplier when the orchestrator has flagged
      // a specific route the user should return to. Applied on top of the
      // official-backbone floor, so an official segment in recovery mode
      // scores 50 — guaranteed to dominate ALL other candidates.
      const matchesActiveRoute =
        activeOfficialRouteId !== undefined &&
        seg.officialRouteId === activeOfficialRouteId;
      const effectiveScore = matchesActiveRoute
        ? baseScore * OFFICIAL_ROUTE_BIAS_MULTIPLIER
        : baseScore;
      if (matchesActiveRoute) officialBiasApplied += 1;

      return { ...point, score: effectiveScore, isOfficial: isOfficialSegment };
    })
    .sort((a, b) => b.score - a.score);

  // ── Soft Shuffle — vary daily variety without sacrificing quality ──────
  // Groups of consecutive candidates whose scores are within 1 point of
  // each other get Fisher-Yates shuffled using `activeOfficialRouteId`
  // (deviation-recovery) or a timestamp-derived seed. This means: the
  // top-10 cluster still wins, but their internal order rotates every
  // session so the same 3 routes don't appear every day from the same spot.
  const shuffleSeed =
    activeOfficialRouteId != null
      ? activeOfficialRouteId.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
      : Math.floor(Date.now() / 86_400_000); // changes once per calendar day

  const candidates = softShuffleTiedGroups(scored, shuffleSeed);
  const officialBackboneCount = candidates.filter((c) => c.score >= 10).length;

  return { candidates, officialBiasApplied, officialBackboneCount };
}

async function fetchScoredWaypoints(
  cityName: string,
  userLocation: { lat: number; lng: number },
  targetDistance: number,
  activeOfficialRouteId?: string,
): Promise<Array<{ lat: number; lng: number; isOfficial: boolean }> | null> {
  // Defensive sanitisation at the query boundary. Even though useUserCityName
  // normalises before returning, callers (and any future upstream code path)
  // could feed us a string with invisible bidi marks and silently produce a
  // zero-result query — the most painful possible failure mode because the
  // strings look identical in logs.
  const cleanCity = sanitizeCityKey(cityName);

  // EXPLICIT diagnostic — surfaces the *exact* bytes we're about to send.
  // `JSON.stringify` reveals invisible chars as `\u200F` etc.; the length
  // mismatch between raw and clean confirms whether sanitisation actually
  // changed anything. Char codes round it out for the rare case where the
  // string contains a homoglyph (e.g. Latin "a" inside a Hebrew word).
  const rawBytes = Array.from(cityName).map((c) => c.charCodeAt(0).toString(16)).join(' ');
  const cleanBytes = Array.from(cleanCity).map((c) => c.charCodeAt(0).toString(16)).join(' ');
  console.log(
    `[RouteGenerator] Final City Query: ${JSON.stringify(cleanCity)} ` +
      `(length=${cleanCity.length}, raw="${cityName}", rawLen=${cityName.length})`,
  );
  if (rawBytes !== cleanBytes) {
    console.warn(
      `[RouteGenerator] cityName had invisible chars stripped. ` +
        `raw bytes: [${rawBytes}] → clean bytes: [${cleanBytes}]`,
    );
  }

  try {
    const cityNameCandidates = resolveCityNameQueryAliases(cleanCity);

    // 300, not 50 (08.08 — verified live with real Tel Aviv data): ordering
    // by raw score alone means the fetch can be entirely consumed by a
    // small, geographically-clustered pool of max-score segments — measured
    // 61 score=10 segments citywide, all within a 5.5km cluster, while the
    // full score>=6 population (6106 docs) spans the whole 7×7km city.
    // limit(50) only ever saw that one cluster; a 22km target (idealDistance
    // ≈3.67km) needs candidates from across the city, which only appear once
    // the fetch goes deep enough into the score ranking. Tested empirically:
    // limit(300) already matches fetching the full city (6106 docs) for this
    // case — 6x the read cost of the old limit(50), not 122x.
    const q = query(
      collection(db, 'street_segments'),
      where('cityName', 'in', cityNameCandidates),
      where('score', '>=', 6),
      orderBy('score', 'desc'),
      limit(300),
    );

    const snap = await getDocs(q);
    if (snap.empty) {
      console.log(`[RouteGenerator] No street_segments found for city "${cleanCity}" — using random waypoints.`);
      // Diagnostic: pull a single doc from the collection so the developer
      // can see what cityName values DO exist. Cheap (limit 1) and only
      // fires on the empty path, so it can't slow the happy-path call.
      let collectionSampleCityName: string | undefined;
      let collectionIsEmpty = false;
      try {
        const probe = await getDocs(query(collection(db, 'street_segments'), limit(1)));
        if (!probe.empty) {
          const sample = probe.docs[0].data() as StreetSegment;
          collectionSampleCityName = sample.cityName;
          console.log(
            `[RouteGenerator] Sample existing segment: cityName=${JSON.stringify(sample.cityName)} ` +
              `(length=${sample.cityName?.length ?? 0})`,
          );
        } else {
          collectionIsEmpty = true;
          console.log('[RouteGenerator] street_segments collection is empty — run the OSM importer.');
        }
      } catch {
        // Probe is best-effort; swallow to keep the original return path.
      }
      setDiagnostics({
        cityNameUsed: cleanCity,
        cityNameRaw: cityName,
        source: collectionIsEmpty
          ? 'random_fallback_empty_collection'
          : 'random_fallback_empty_city',
        segmentsFetched: 0,
        segmentsInRadius: 0,
        collectionSampleCityName,
      });
      return null;
    }

    const searchRadiusKm = targetDistance / 2;

    // No slice(12) here (08.08 fix) — this function's own score is quality-only
    // (official-boost + soft-shuffle), with zero awareness of the caller's
    // target distance. Truncating to 12 HERE, before generateDynamicRoutes'
    // idealWaypointDistanceKm-aware scoreWaypoint() ever runs, is exactly what
    // caused live 22km loops to fail: the 12 highest-QUALITY segments can be
    // (and were, verified with real data) a tight geographic cluster nowhere
    // near the radius a large target actually needs. Return the full
    // (already radius-filtered, already capped at `limit(300)` above)
    // candidate pool and let the caller's target-aware re-scoring — which
    // already exists and already picks the real top-12 — do the selection.
    const segmentsInRadius: Array<{ point: { lat: number; lng: number }; seg: StreetSegment }> = [];
    for (const d of snap.docs) {
      const seg = d.data() as StreetSegment;
      const point = segmentMidpoint(seg);
      if (!point) continue;
      const distKm = getDistanceKm(userLocation.lat, userLocation.lng, point.lat, point.lng);
      if (distKm > searchRadiusKm) continue;
      segmentsInRadius.push({ point, seg });
    }

    const { candidates, officialBiasApplied, officialBackboneCount } =
      scoreAndShuffleStreetSegments(segmentsInRadius, activeOfficialRouteId);

    if (officialBackboneCount > 0) {
      console.log(
        `[RouteGenerator] Official backbone: ${officialBackboneCount} segment(s) ` +
          `scored to 10 (admin-approved corridors will dominate this generation).`,
      );
    }
    if (activeOfficialRouteId) {
      console.log(
        `[RouteGenerator] Deviation recovery: ${officialBiasApplied} segment(s) matched ` +
          `officialRouteId=${activeOfficialRouteId} and got a ${OFFICIAL_ROUTE_BIAS_MULTIPLIER}× bonus.`,
      );
    }

    if (candidates.length === 0) {
      console.log(`[RouteGenerator] street_segments for "${cleanCity}" found (${snap.size} total) but none within ${searchRadiusKm.toFixed(1)} km of user — using random waypoints.`);
      setDiagnostics({
        cityNameUsed: cleanCity,
        cityNameRaw: cityName,
        source: 'random_fallback_out_of_radius',
        segmentsFetched: snap.size,
        segmentsInRadius: 0,
      });
      return null;
    }

    console.log(`[RouteGenerator] Using ${candidates.length} scored waypoints from street_segments (city: "${cleanCity}").`);
    setDiagnostics({
      cityNameUsed: cleanCity,
      cityNameRaw: cityName,
      source: 'street_segments',
      segmentsFetched: snap.size,
      segmentsInRadius: candidates.length,
    });
    return candidates.map(({ lat, lng, isOfficial }) => ({ lat, lng, isOfficial }));
  } catch (err: any) {
    console.warn('[RouteGenerator] fetchScoredWaypoints failed, falling back to random:', err?.message ?? err);
    setDiagnostics({
      cityNameUsed: cleanCity,
      cityNameRaw: cityName,
      source: 'random_fallback_query_error',
      segmentsFetched: 0,
      segmentsInRadius: 0,
    });
    return null;
  }
}

/**
 * Proximity-first alternative to fetchScoredWaypoints — queries street_segments
 * by GEOGRAPHIC BOUNDING BOX around the user (via geofire-common's geohash
 * technique) instead of "top 300 by score, citywide". Same return shape,
 * same searchRadiusKm formula, same scoring/shuffle tail (via
 * scoreAndShuffleStreetSegments) — a drop-in alternative fetch strategy, not
 * a parallel scoring implementation.
 *
 * Why this exists: fetchScoredWaypoints' city-wide-by-score query can be
 * saturated by unrelated high-score content before it ever reaches a
 * genuinely nearby segment — confirmed live (13.08.2026): 300 docs fetched,
 * zero within 0.7km of a real test point ~150m from a real published route's
 * segment, because other content citywide filled all 300 score-ranked slots
 * first. In Zichron Yaakov, ALL 2177 segments are score=10 — the 300-cap
 * alone is already the bottleneck there, independent of proximity.
 *
 * Firestore query design note: `where('score','>=',6)` is deliberately
 * dropped from the SERVER query and applied client-side instead. The
 * documented, Firebase-endorsed geohash-bounding-box pattern is a range
 * query on `geohash` alone (orderBy + startAt/endAt); stacking a second
 * inequality on `score` alongside it is unverified for this specific
 * cursor-based shape, so this stays on the safe, documented path. The cost
 * is free: client-side filtering on an already geo-bounded (small) set.
 * `cityName` is accepted (for diagnostics/logging) but NOT used as a query
 * filter — geo-bounding already implies "the right area", and this
 * sidesteps the exact city-name-alias bug class (CITY_NAME_QUERY_ALIASES,
 * the 1144-doc invisible-Tel-Aviv-Yafo pool) fetchScoredWaypoints has to
 * work around.
 *
 * Existing docs need a one-time geohash backfill
 * (scripts/backfill-street-segments-geohash.ts) — until that runs (or for
 * any doc it somehow misses), this returns null and the caller falls back
 * to fetchScoredWaypoints (the old city-wide query) as a safety net.
 */
async function fetchScoredWaypointsByProximity(
  cityName: string,
  userLocation: { lat: number; lng: number },
  targetDistance: number,
  activeOfficialRouteId?: string,
  relaxation?: {
    /**
     * Multiplies targetDistance to get the search radius (default 0.5,
     * reproducing today's exact searchRadiusKm = targetDistance/2 for every
     * caller that omits this). Only IS_GUARANTEED_ROUTE_FALLBACK_ENABLED's
     * Tier 2 re-fetch passes a wider value — see its call site.
     */
    radiusMultiplier?: number;
    /**
     * Client-side score floor (default 6, reproducing today's exact
     * hardcoded filter for every caller that omits this).
     */
    minScore?: number;
  },
): Promise<Array<{ lat: number; lng: number; isOfficial: boolean }> | null> {
  const cleanCity = sanitizeCityKey(cityName);
  const radiusMultiplier = relaxation?.radiusMultiplier ?? 0.5;
  const minScore = relaxation?.minScore ?? 6;
  const searchRadiusKm = targetDistance * radiusMultiplier;
  const searchRadiusMeters = searchRadiusKm * 1000;

  try {
    const center: [number, number] = [userLocation.lat, userLocation.lng];
    const bounds = geohashQueryBounds(center, searchRadiusMeters);

    const snapshots = await Promise.all(
      bounds.map(([rangeStart, rangeEnd]) =>
        getDocs(
          query(
            collection(db, 'street_segments'),
            orderBy('geohash'),
            startAt(rangeStart),
            endAt(rangeEnd),
          ),
        ),
      ),
    );

    // Merge across boxes + dedupe by doc id. geohashQueryBounds' ranges are
    // constructed not to overlap, but dedup defensively — cheap insurance.
    const seenIds = new Set<string>();
    const rawDocs: Array<{ point: { lat: number; lng: number }; seg: StreetSegment }> = [];
    let docsFetchedRaw = 0;
    let docsAfterDedupe = 0;
    for (const snap of snapshots) {
      for (const d of snap.docs) {
        docsFetchedRaw += 1;
        if (seenIds.has(d.id)) continue;
        seenIds.add(d.id);
        // Counted here (unique doc ids), NOT via rawDocs.length below — a
        // doc with a missing/malformed midpoint is still a real, uniquely
        // fetched doc; it gets dropped for a DIFFERENT reason just below,
        // and conflating the two counts would understate what this
        // diagnostic's own name promises.
        docsAfterDedupe += 1;
        const seg = d.data() as StreetSegment;
        const point = segmentMidpoint(seg);
        if (!point) continue;
        rawDocs.push({ point, seg });
      }
    }

    // Precise client-side circle trim — a geohash bounding box over-covers a
    // true circle at the corners (a well-known property of the technique,
    // not a bug); geohashQueryBounds guarantees the circle is a SUBSET of
    // the boxes, never the reverse, so this only ever removes false positives.
    const segmentsInRadius = rawDocs.filter(({ point }) => {
      const distKm = getDistanceKm(userLocation.lat, userLocation.lng, point.lat, point.lng);
      return distKm <= searchRadiusKm;
    });

    // score>=minScore filter, client-side — see the doc comment above.
    const scoredEligible = segmentsInRadius.filter(({ seg }) => (seg.score ?? 0) >= minScore);

    if (scoredEligible.length === 0) {
      console.log(
        `[RouteGenerator] Proximity query: 0 usable street_segments within ${searchRadiusKm.toFixed(2)}km ` +
          `of user (${bounds.length} geohash box(es), ${docsFetchedRaw} raw docs) — falling back.`,
      );
      setDiagnostics({
        cityNameUsed: cleanCity,
        cityNameRaw: cityName,
        source: 'random_fallback_out_of_radius',
        segmentsFetched: docsFetchedRaw,
        segmentsInRadius: 0,
        queryStrategy: 'proximity_geohash',
        geohashBoxesQueried: bounds.length,
        docsFetchedRaw,
        docsAfterDedupe,
      });
      return null;
    }

    const { candidates, officialBiasApplied, officialBackboneCount } =
      scoreAndShuffleStreetSegments(scoredEligible, activeOfficialRouteId);

    if (officialBackboneCount > 0) {
      console.log(
        `[RouteGenerator] Official backbone: ${officialBackboneCount} segment(s) ` +
          `scored to 10 (admin-approved corridors will dominate this generation).`,
      );
    }
    if (activeOfficialRouteId) {
      console.log(
        `[RouteGenerator] Deviation recovery: ${officialBiasApplied} segment(s) matched ` +
          `officialRouteId=${activeOfficialRouteId} and got a ${OFFICIAL_ROUTE_BIAS_MULTIPLIER}× bonus.`,
      );
    }

    console.log(
      `[RouteGenerator] Proximity query: using ${candidates.length} scored waypoints ` +
        `(${bounds.length} geohash box(es), ${docsFetchedRaw} raw → ${docsAfterDedupe} deduped → ` +
        `${segmentsInRadius.length} in radius → ${scoredEligible.length} score≥6, city: "${cleanCity}").`,
    );
    setDiagnostics({
      cityNameUsed: cleanCity,
      cityNameRaw: cityName,
      source: 'street_segments',
      segmentsFetched: docsFetchedRaw,
      segmentsInRadius: candidates.length,
      queryStrategy: 'proximity_geohash',
      geohashBoxesQueried: bounds.length,
      docsFetchedRaw,
      docsAfterDedupe,
    });
    return candidates.map(({ lat, lng, isOfficial }) => ({ lat, lng, isOfficial }));
  } catch (err: any) {
    console.warn('[RouteGenerator] fetchScoredWaypointsByProximity failed, falling back:', err?.message ?? err);
    setDiagnostics({
      cityNameUsed: cleanCity,
      cityNameRaw: cityName,
      source: 'random_fallback_query_error',
      segmentsFetched: 0,
      segmentsInRadius: 0,
      queryStrategy: 'proximity_geohash',
    });
    return null;
  }
}

// ✅ CRITICAL FIX: 1.5 second delay between API calls to prevent 429 errors
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function getDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Compass bearing (deg, -180..180) of the segment a→b. a,b = [lng, lat].
 * Used to order loop waypoints by angle around the user (change 2), so the
 * visit sequence sweeps monotonically and the loop doesn't cross itself.
 */
function segBearing(a: [number, number], b: [number, number]): number {
  const lat1 = a[1] * Math.PI / 180, lat2 = b[1] * Math.PI / 180;
  const dLng = (b[0] - a[0]) * Math.PI / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return Math.atan2(y, x) * 180 / Math.PI;
}

// --- Helper Functions ---

function generateRandomWaypoints(
  userLocation: { lat: number; lng: number },
  targetDistance: number,
  count: number = 15, // Generate more waypoints for variety
  routeGenerationIndex: number = 0
): Array<{ lat: number; lng: number }> {
  const waypoints: Array<{ lat: number; lng: number }> = [];
  const kmPerDegree = 111;

  // Triangular-loop geometry: with three waypoints at radius `r` spaced
  // ~120° apart, the perimeter is `3 · √3 · r ≈ 5.2r`. The previous
  // formula (`targetDistance / 3`) ignored that factor and produced loops
  // ~70% longer than requested — a 5.5km target consistently came back as
  // ~9.5km after Mapbox's road snapping added another 10–20% on top.
  // Using `targetDistance / 6` keeps the geometric loop slightly under the
  // user's target so the road-snapped result lands in the valid window.
  const baseRadius = (targetDistance / 6) / kmPerDegree;

  // Use index to rotate the entire pattern
  const angleOffset = (routeGenerationIndex * 45) % 360;
  const angleRad = (angleOffset * Math.PI) / 180;

  for (let i = 0; i < count; i++) {
    // Tightened from 0.6–1.4 (40% spread) to 0.85–1.15 (15% spread). The
    // wider range was generating both routes that were too long AND routes
    // that were too short, wasting Mapbox API calls on rejections. The
    // tighter spread keeps every candidate within ~15% of the target so
    // far fewer combinations get thrown out by the distance-window check.
    const radiusVariation = 0.85 + (Math.random() * 0.3);
    const radius = baseRadius * radiusVariation;
    const baseAngle = (i * (360 / count)) * (Math.PI / 180) + angleRad;
    const angleVariation = (Math.random() - 0.5) * (40 * Math.PI / 180);
    const angle = baseAngle + angleVariation;

    waypoints.push({
      lng: userLocation.lng + radius * Math.cos(angle),
      lat: userLocation.lat + radius * Math.sin(angle)
    });
  }
  return waypoints;
}

/**
 * Acceptance window for a generated loop's real (Mapbox-measured) distance
 * against the target. The original window was a fixed [target-0.5,
 * target+2.5] band — 100% of a 3km target's width but only ~14% of a 22km
 * one. generateRandomWaypoints' own radius has an intentional ±15% spread by
 * design (see its comment above), and real street-network snapping adds
 * further variance on top — both scale with the target, so a fixed absolute
 * band gets proportionally stricter as targets grow, silently starving large
 * loops of any combination that can land inside it (verified live, 08.08: a
 * 22km loop request returned "no route found"). Math.max keeps today's exact
 * [target-0.5, target+2.5] window byte-identical up to ~5km below / ~16.7km
 * above, where the percentage term takes over.
 */
export function computeDistanceWindow(safeDistance: number): { minKm: number; maxKm: number } {
  const belowToleranceKm = Math.max(0.5, safeDistance * 0.10);
  const aboveToleranceKm = Math.max(2.5, safeDistance * 0.15);
  return {
    minKm: Math.max(0.5, safeDistance - belowToleranceKm),
    maxKm: safeDistance + aboveToleranceKm,
  };
}

/**
 * Behind IS_TIGHTENED_DISTANCE_WINDOW_ENABLED — a full replacement for
 * computeDistanceWindow (not a separate tier for a narrow sub-range), so
 * there's exactly one formula and one flag covering the whole normal-mode
 * target range (1.5km up to the 100km slider ceiling). Below-tolerance
 * uses the SAME 10% as computeDistanceWindow (only the floor drops, 0.5→
 * 0.3) — this side needed no loosening, undershooting was never the
 * reported problem. Above-tolerance uses a higher 30% but a much lower
 * floor (2.5→0.6); because computeDistanceWindow's 2.5km floor still
 * dominates its own formula up to target≈16.7km, the new 30%-based value
 * stays below it until target≈8.33km — so the crossover from "tighter
 * than today" to "wider than today" falls naturally just past this fix's
 * 8km ceiling, not from hand-picking a boundary. No seam beyond that:
 * both tolerances are in pure-percentage mode by target=3km (below) /
 * target=2km (above), so from 3km to 100km this is one uniform ~40%
 * relative-width band (below% + above% = 0.10+0.30). Below 3km the
 * below-floor is still active and relative width rises as target shrinks
 * — 45% at target=2km, 60% at target=1.5km (this function's floor,
 * i.e. the smallest target it's ever called with; anything below 1.5km
 * dispatches to computeShortRouteDistanceWindow instead, see below).
 *
 * Root problem this fixes: computeDistanceWindow's absolute floors (0.5km
 * below / 2.5km above) dominate the ENTIRE 1.5-8km band (the percentage
 * terms don't overtake them until ~5km below / ~16.7km above) — live
 * confirmed (14.08.2026, Tel Aviv): a 5km target's real window is
 * [4.5,7.5]km, wide enough that a 30%+ oversized result is accepted every
 * time; a 1.5km target's window is [1.0,4.0]km, a 167%-wide band.
 *
 * Calibrated live (14.08.2026) in Tel Aviv (dense, ~90-150 segments/km²)
 * and Sderot (thin, ~72 segments/km² — confirmed the only other city with
 * real, non-official-only street_segments coverage; every other checked
 * city has zero). An initial, tighter hypothesis (0.2/0.15 below,
 * 0.5/0.20 above) rejected real, legitimate routes too often in Sderot
 * (consistent ~25-34% overshoot there even on genuinely valid triangles,
 * likely from sparser real candidates forcing less precise loops) —
 * loosened the above-side to 0.6/0.30 specifically because tighter
 * measurably cost availability without a matching correctness gain. A
 * documented consequence of that loosening: at a 5km target the new
 * window's ceiling (6.5km) sits exactly at the specific 6.5km result that
 * originally flagged this as broken — still a real win (old ceiling was
 * 7.5km — anything 6.5-7.5km, which was common, is now correctly
 * rejected) but this exact borderline case is a deliberate tradeoff, not
 * fully closed. Even so this is a real, quantified cost, not a free
 * lunch: repeated live trials showed occasional degraded results (1-2 of
 * the usual 3 cards) and, rarely, a full empty state (Tel Aviv 2km: 1 of
 * 3 trials returned zero routes) — worse in Sderot than Tel Aviv, as
 * expected. That's the exact reason this stays flag-gated pending
 * David's own device judgment, not something to paper over by loosening
 * further (which would just re-erode the correctness gain this whole fix
 * exists for).
 *
 * Design constraint that holds regardless of any future recalibration:
 * below-floor ≤ 0.5, below-% ≤ 0.10, so the below TOLERANCE AMOUNT
 * (belowToleranceKm) is ≤ computeDistanceWindow's for every x, by
 * construction — same-or-lower floor, same-or-lower percentage. This is
 * NOT the same claim as "tight.minKm ≥ loose.minKm for every x" — the two
 * functions also clamp minKm against different outer floors (0.3 vs
 * 0.5km), which can flip the comparison below x≈1.0km. Irrelevant in
 * practice since this function is never called under 1.5km (short-mode
 * intercepts first), but don't conflate the two claims when recalibrating.
 * Above-tolerance has NO unconditional guarantee at all (its % exceeds
 * computeDistanceWindow's) —
 * the "tighter through 8km" property is verified live/by-test at this
 * function's actual calibrated values (see tests below), not structurally
 * guaranteed to survive arbitrary future recalibration of the above-side.
 * The already-proven 22km+ behavior (the 08.08 "no route found" fix) DOES
 * stay structurally safe regardless: above-floor (0.6) is far below
 * computeDistanceWindow's (2.5), and above-% (0.30) exceeds its (0.15), so
 * at large targets this can only be equal-or-wider, never tighter/riskier.
 * Verified live at 22km in both cities: consistently 2-3 valid routes, no
 * rejections worse than what computeDistanceWindow already tolerated
 * there.
 */
export function computeTightenedDistanceWindow(safeDistance: number): { minKm: number; maxKm: number } {
  const belowToleranceKm = Math.max(0.3, safeDistance * 0.10);
  const aboveToleranceKm = Math.max(0.6, safeDistance * 0.30);
  return {
    minKm: Math.max(0.3, safeDistance - belowToleranceKm),
    maxKm: safeDistance + aboveToleranceKm,
  };
}

/**
 * Acceptance window for SHORT targets (below MIN_GENERATION_KM, short-route
 * mode only). computeDistanceWindow's absolute floors (0.5km below / 2.5km
 * above) were tuned for multi-km loops and are wide enough to "validate" a
 * ~3km result against a 0.6km target — exactly the regression behind the
 * reported "push promised 12 min, route card showed 32 min/2.7km" mismatch.
 * Percentage-only tolerance with small absolute floors scaled to the
 * short-route domain (~0.2-1.5km), not the loop domain.
 *
 * Upper tolerance calibrated 13.08.2026 via a real-Firestore-data diagnostic
 * (real street_segments + real Mapbox calls, Tel Aviv reference location):
 * even after fixing the two candidate-selection bugs that were causing loops
 * to massively overshoot (scoreWaypoint's proportionalDistanceTiers,
 * selectAngularlyDiverseCandidates' proportionalGap), a genuine 3-waypoint
 * triangular loop's best-fit real distance still runs ~35-40% over target —
 * inherent to routing through 3 real streets and back, not a bug. 35% was
 * juuust under what real loops needed and always lost to out-and-back;
 * 50% clears real loop candidates while staying far tighter than the
 * original bug (a 0.6km target validating a 417%-oversized 3.1km result).
 */
export function computeShortRouteDistanceWindow(safeDistance: number): { minKm: number; maxKm: number } {
  const belowToleranceKm = Math.max(0.15, safeDistance * 0.25);
  const aboveToleranceKm = Math.max(0.35, safeDistance * 0.50);
  return {
    minKm: Math.max(0.1, safeDistance - belowToleranceKm),
    maxKm: safeDistance + aboveToleranceKm,
  };
}

export function scoreWaypoint(
  waypoint: { lat: number; lng: number; isOfficial?: boolean },
  userLocation: { lat: number; lng: number },
  parks: MapPark[],
  preferences: {
    includeStrength: boolean;
    idealWaypointDistanceKm?: number;
    /**
     * Opt-in (default false — byte-identical for every existing caller):
     * scale the distanceDiff scoring tiers below PROPORTIONALLY to
     * idealWaypointDistanceKm instead of using the fixed absolute-km
     * thresholds (0.3/0.6/2.0km).
     *
     * Root cause this fixes (found via a real-Firestore-data diagnostic,
     * 13.08.2026): those thresholds were tuned for the historical ~1.0km
     * default. At a genuinely small idealWaypointDistanceKm (short-route
     * mode, e.g. 0.233km for a 1.4km target), a real candidate 0.4-0.7km
     * away — 2-3× the ENTIRE ideal radius — still fell inside the fixed
     * "< 0.6km" tier and got the same +10 fit bonus as a candidate
     * actually close to ideal. That's how a short-loop attempt kept
     * selecting real-but-wildly-scattered candidates and coming back
     * 2-3× the requested distance, always rejected by the acceptance
     * window and always falling back to out-and-back. Set true only by
     * short-route-mode callers (generateLoopRoutes' shortMode,
     * generateOutAndBackRoutes) — every idealWaypointDistanceKm≥1.0
     * caller (the existing 3-100km free-run/hybrid loops) is COMPLETELY
     * unaffected either way, since this is an opt-in flag, not a value
     * threshold.
     */
    proportionalDistanceTiers?: boolean;
    /**
     * Opt-in (default false — byte-identical for every existing caller):
     * a modest, tie-breaker-scale bonus for candidates known to come from a
     * published official/curated route corridor (waypoint.isOfficial, set
     * by fetchScoredWaypoints/fetchScoredWaypointsByProximity from a
     * segment broadcast by official-route-broadcaster.ts).
     *
     * Deliberately gated on `distanceDiff <= penaltyTierKm` — i.e. it can
     * only help a candidate that ISN'T already being penalized for poor
     * fit. This is the exact guard against reopening the short-loop
     * off-target bug proportionalDistanceTiers fixes: a badly-positioned
     * official segment must not get rescued into winning its sector just
     * because it's "official" — that was the failure mode being tuned out
     * of computeShortRouteDistanceWindow above. It's a nudge/tie-breaker
     * among reasonably-well-fitted candidates, not an override.
     *
     * Set true only by short-route-mode callers for now (generateLoopRoutes'
     * shortMode, generateOutAndBackRoutes) — same flag/email-gated Phase-1
     * scope as proportionalDistanceTiers, pending validation.
     */
    preferOfficialRoutes?: boolean;
  }
): WaypointCandidate {
  const distanceFromUser = getDistanceKm(userLocation.lat, userLocation.lng, waypoint.lat, waypoint.lng);
  const nearbyParks = parks.filter(park => {
    const dist = getDistanceKm(park.location.lat, park.location.lng, waypoint.lat, waypoint.lng);
    return dist < 0.5;
  }).length;

  let score = 50;
  if (nearbyParks > 0) score += nearbyParks * 15;

  // Default 1.0km preserved exactly when the caller doesn't opt in — byte-identical
  // for every existing caller (free-run, discover, hybrid general). See the
  // idealWaypointDistanceKm doc on RouteGenerationOptions.preferences for why a
  // small-target caller (route-stops) overrides this.
  const idealDistance = preferences.idealWaypointDistanceKm ?? 1.0;
  const distanceDiff = Math.abs(distanceFromUser - idealDistance);
  const tightTierKm = preferences.proportionalDistanceTiers ? idealDistance * 0.3 : 0.3;
  const midTierKm = preferences.proportionalDistanceTiers ? idealDistance * 0.6 : 0.6;
  const penaltyTierKm = preferences.proportionalDistanceTiers ? idealDistance * 2.0 : 2.0;
  if (distanceDiff < tightTierKm) score += 20;
  else if (distanceDiff < midTierKm) score += 10;
  else if (distanceDiff > penaltyTierKm) score -= 15;

  // Official/curated-route preference — modest tie-breaker, only among
  // candidates that aren't already being penalized for poor fit. See the
  // preferOfficialRoutes doc above for why the guard is load-bearing.
  if (preferences.preferOfficialRoutes && waypoint.isOfficial && distanceDiff <= penaltyTierKm) {
    score += OFFICIAL_ROUTE_PREFERENCE_BONUS;
  }

  const hasNearbyGym = parks.some(park => {
    const dist = getDistanceKm(park.location.lat, park.location.lng, waypoint.lat, waypoint.lng);
    return dist < 0.5 && park.devices && park.devices.length > 0;
  });

  if (preferences.includeStrength && hasNearbyGym) score += 25;

  // 3.0km flat cutoff was tuned for the historical ~1.0km idealDistance default
  // (short free-run loops). Scaled by idealDistance so a caller that opts into
  // a larger idealWaypointDistanceKm (e.g. free-run's now-uncapped distance
  // goal, targetKm/6) doesn't have every candidate penalized once the loop
  // radius alone exceeds 3km — Math.max keeps today's exact 3.0km behaviour
  // for every caller still on the 1.0km default (1.0 * 2 = 2 < 3.0).
  const isSafe = distanceFromUser < Math.max(3.0, idealDistance * 2);
  if (!isSafe) score -= 20;

  return { ...waypoint, score, distanceFromUser, nearbyParks, isGreen: nearbyParks > 0, isSafe };
}

/**
 * Third bug in the "large free-run target" family (08.08, verified live with
 * real Tel Aviv data + bearings). scoreWaypoint above only ranks by RADIAL
 * distance from the user — it has zero notion of angular spread. Real
 * streets aren't evenly distributed around a point: the top-12 candidates by
 * score alone consistently collapsed into a single ~30-140° compass arc
 * (measured across 4 real user locations), leaving a 220-330° gap with zero
 * representation. A "triangular loop" built from 3 points crammed into one
 * arc is nearly collinear — a spike out-and-back, not a loop — which is
 * exactly why 21.5-22km requests kept coming back 6-15km even after the
 * distance-window and candidate-pool-truncation fixes.
 *
 * Buckets the SCORED candidate pool into `ANGULAR_SECTOR_COUNT` compass
 * sectors and takes the best-scoring candidate from each non-empty sector —
 * so the returned set is angularly diverse by construction, not just
 * whichever direction happens to have the most/highest-scored real streets.
 *
 * Backfill is ROUND-ROBIN across sectors (2nd-best from each non-empty
 * sector, then 3rd-best, ...), NOT a single global-score sort. Verified live
 * (08.08, David's exact real address — Sderot Har Tzion 39, south Tel Aviv):
 * a global-score backfill silently undoes the round-1 diversity the moment
 * one sector is much denser than the others — measured sector population
 * [211,6,2,0,0,1,14,66] for this real point, and a global-score backfill
 * pulled 7 of the final 12 candidates from the single 66-candidate sector
 * (all within a few degrees of each other), because after round 1 those
 * were still the highest-scoring candidates left ANYWHERE — reproducing the
 * exact "3 nearly-collinear points" failure this whole fix exists to solve,
 * just one layer deeper. Round-robin caps how much any one sector can
 * contribute per round, so a dense sector can still supply MORE candidates
 * than a sparse one (that's correct — real data density matters) without
 * being allowed to swallow the whole backfill outright.
 *
 * Empty (or badly-positioned) sectors get ONE synthetic candidate at that
 * sector's center bearing and `idealDistanceKm` radius — same bearing/radius
 * projection generateRandomWaypoints already uses for the whole-city
 * fallback, just applied per-sector as a supplement instead of a full
 * replacement. Mapbox snaps any via-point to the nearest real street
 * regardless of where it was computed from, so a synthetic point is not
 * meaningless — it just gives the round-robin picker something reasonable
 * to choose in a direction real data doesn't cover well. Verified live
 * (08.08, David's exact real address): sectors 3-4 were completely empty
 * and sectors 5/7's best real candidates sat 2-3km off the 3.75km ideal
 * (e.g. 0.69km, 0.78km) — real streets exist there, just not near the
 * radius this target needs. Scored as if perfectly positioned (matches
 * scoreWaypoint's own distanceDiff<0.3 tier) so it competes fairly with
 * real candidates rather than being auto-preferred or auto-discounted.
 * Final result is sorted by bearing so index-adjacency in the caller's
 * combination loop corresponds to angular adjacency.
 */
const ANGULAR_SECTOR_COUNT = 8;
const SYNTHETIC_SECTOR_FILL_SCORE = 70; // matches scoreWaypoint: 50 base + 20 (distanceDiff<0.3)
const SECTOR_POSITION_GAP_KM = 1.0; // trigger synthesis when the best real candidate is this far off ideal
export function selectAngularlyDiverseCandidates(
  scored: WaypointCandidate[],
  userLocation: { lat: number; lng: number },
  maxCount: number,
  idealDistanceKm: number,
  opts: {
    /**
     * Opt-in (default false — byte-identical for every existing caller):
     * scale the sector-synthesis gap trigger PROPORTIONALLY to
     * idealDistanceKm (× 0.5) instead of the fixed SECTOR_POSITION_GAP_KM
     * (1.0km). Companion fix to scoreWaypoint's proportionalDistanceTiers
     * — found via the same real-Firestore-data diagnostic (13.08.2026):
     * at a small idealDistanceKm (short-route mode), a real sector
     * candidate 0.3-0.5km off ideal is still "≤1.0km gap" under the fixed
     * threshold, so it wins its sector's round-robin slot outright even
     * though it's 2-3× the ENTIRE ideal radius away — a synthetic point
     * placed exactly at ideal is never even considered. Set true only by
     * short-route-mode callers; every existing idealDistanceKm≥1.0 caller
     * is unaffected either way (opt-in, not a value threshold).
     */
    proportionalGap?: boolean;
  } = {},
): WaypointCandidate[] {
  const bearingOf = (wp: { lat: number; lng: number }) =>
    (segBearing([userLocation.lng, userLocation.lat], [wp.lng, wp.lat]) + 360) % 360;
  const sectorWidth = 360 / ANGULAR_SECTOR_COUNT;
  const KM_PER_DEGREE = 111;

  const sectors: WaypointCandidate[][] = Array.from({ length: ANGULAR_SECTOR_COUNT }, () => []);
  for (const wp of scored) {
    const idx = Math.min(ANGULAR_SECTOR_COUNT - 1, Math.floor(bearingOf(wp) / sectorWidth));
    sectors[idx].push(wp);
  }
  for (const sector of sectors) sector.sort((a, b) => b.score - a.score);

  // Fill empty/badly-positioned sectors with a synthetic candidate BEFORE
  // round-robin picking, so it's just another entry competing on score.
  const gapThresholdKm = opts.proportionalGap ? idealDistanceKm * 0.5 : SECTOR_POSITION_GAP_KM;
  for (let idx = 0; idx < ANGULAR_SECTOR_COUNT; idx++) {
    const sector = sectors[idx];
    const bestGap = sector.length > 0 ? Math.abs(sector[0].distanceFromUser - idealDistanceKm) : Infinity;
    if (sector.length > 0 && bestGap <= gapThresholdKm) continue; // real coverage already good enough
    const centerBearingDeg = (idx + 0.5) * sectorWidth;
    const mathAngleRad = ((90 - centerBearingDeg) * Math.PI) / 180; // compass bearing -> generateRandomWaypoints' math-angle convention
    const radiusDeg = idealDistanceKm / KM_PER_DEGREE;
    const synthetic: WaypointCandidate = {
      lat: userLocation.lat + radiusDeg * Math.sin(mathAngleRad),
      lng: userLocation.lng + radiusDeg * Math.cos(mathAngleRad),
      score: SYNTHETIC_SECTOR_FILL_SCORE,
      distanceFromUser: idealDistanceKm,
      nearbyParks: 0,
      isGreen: false,
      isSafe: true, // idealDistanceKm is always < Math.max(3.0, idealDistanceKm*2)
    };
    sector.push(synthetic);
    sector.sort((a, b) => b.score - a.score);
  }

  const picked: WaypointCandidate[] = [];
  // Round-robin: round 0 takes each sector's best, round 1 takes each
  // sector's 2nd-best, etc. — sectors with fewer than `round+1` candidates
  // are simply skipped that round, not treated as exhausted for good.
  for (let round = 0; picked.length < maxCount && round < scored.length; round++) {
    let anyTakenThisRound = false;
    for (const sector of sectors) {
      if (picked.length >= maxCount) break;
      if (sector.length > round) {
        picked.push(sector[round]);
        anyTakenThisRound = true;
      }
    }
    if (!anyTakenThisRound) break; // every sector exhausted
  }
  return picked.sort((a, b) => bearingOf(a) - bearingOf(b));
}

async function findFitnessAnchor(
  userLocation: { lat: number, lng: number },
  targetDistanceKm: number,
  parks: MapPark[]
): Promise<{ lat: number, lng: number, id: string } | null> {
  if (!parks || parks.length === 0) return null;
  const idealMinDist = targetDistanceKm * 0.25;
  const idealMaxDist = targetDistanceKm * 0.6;

  const candidates = parks
    .filter(p => p.devices && p.devices.length > 0)
    .map(p => ({
      ...p,
      distance: getDistanceKm(userLocation.lat, userLocation.lng, p.location.lat, p.location.lng)
    }));

  let matches = candidates.filter(p => p.distance >= idealMinDist && p.distance <= idealMaxDist);

  if (matches.length === 0) {
    matches = candidates.sort((a, b) => a.distance - b.distance).slice(0, 1);
  }

  if (matches.length === 0) return null;
  const selected = matches[0];

  return { lat: selected.location.lat, lng: selected.location.lng, id: selected.id };
}

/**
 * MAIN GENERATOR FUNCTION — dispatcher.
 *
 * Three modes, in priority order:
 *
 *   • Commute mode (`destination` set) — returns up to 3 A-to-B variants
 *     (fastest / alternative / quiet) for the same point pair. A single
 *     Mapbox call with `alternatives=true` yields all three; quiet is the
 *     longest-duration alternative. See `RouteGenerationOptions.destination`.
 *
 *   • Short-route mode (`shortRouteMode: true` AND targetDistance below
 *     MIN_GENERATION_KM) — tries a genuinely short LOOP first, falls back
 *     to an OUT-AND-BACK shape only if the loop attempt yields zero
 *     routes. See `generateShortRoutes` and
 *     `RouteGenerationOptions.shortRouteMode`.
 *
 *   • Loop mode (default) — original behaviour, unchanged. Builds up to 3
 *     triangular loops back to `userLocation` using street_segments
 *     waypoints (or random fallback) sequenced through Mapbox Directions.
 *
 * Commute mode shares NOTHING beyond the function entry — it does not
 * touch the waypoint pool, the soft-shuffle, the triangular-combo
 * builder, or the 1.5 s rate-limit delay loop. Short-route mode, by
 * contrast, REUSES the loop pipeline's own scoring/selection machinery
 * (fetchScoredWaypoints / scoreWaypoint / selectAngularlyDiverseCandidates)
 * — see `generateLoopRoutes`'s `shortMode` param and `generateOutAndBackRoutes`.
 *
 * Waypoint strategy (loop mode, in priority order):
 *   1. Firestore street_segments (scored, city-specific) — via fetchScoredWaypoints()
 *   2. Random geometric fallback — via generateRandomWaypoints()
 */
export async function generateDynamicRoutes(
  options: RouteGenerationOptions
): Promise<Route[]> {
  // User-anchored corridor-flow mode — most specific request wins, checked first.
  if (options.userAnchoredCorridorFlow) {
    return generateUserAnchoredFlowRoute(options);
  }

  // Chain-discovery mode.
  if (options.discoverCorridorChain) {
    return generateDiscoveredChainRoute(options);
  }

  // Corridor-following mode — skips the loop pipeline entirely; returns the
  // stored corridor path verbatim.
  if (options.followOfficialRouteId) {
    return generateCorridorRoute(options);
  }

  // Commute mode — destination provided, skip the entire loop pipeline.
  // Returns immediately with up to 3 variant routes.
  if (options.destination) {
    return generateCommuteRoutes(options);
  }

  const rawDistance = typeof options.targetDistance === 'number' && !isNaN(options.targetDistance)
    ? options.targetDistance
    : 3;

  if (options.shortRouteMode && rawDistance < MIN_GENERATION_KM) {
    return generateShortRoutes(options);
  }

  return generateLoopRoutes(options);
}

/**
 * Corridor-following mode (Phase 1 of the corridor-following engine, see
 * .claude/plans/build-the-phase-0-noble-kahn.md). Fetches a single
 * `official_routes/{id}` doc via `InventoryService.getRouteById` and returns
 * its stored `path` VERBATIM as the route geometry — no Mapbox call, no
 * waypoint scoring. `official_routes.path` is already real, walkable
 * geometry (Directions-snapped via RouteEditor, or OSM-way-derived via the
 * TLV import pilot — both are real surveyed paths, David 15.08.2026); Mapbox's
 * 25-coordinate Directions cap also makes resubmitting a 20-180 point
 * corridor as waypoints impossible anyway.
 *
 * Distance/duration are computed from the real path (pathLengthMeters +
 * SPEED_KMH), not copied from the corridor doc's own `distance`/`duration`
 * fields — those may reflect a different activity's pace than the one being
 * requested.
 *
 * `InventoryService` is dynamically imported (not a top-level import) —
 * same convention as `googleapis`/`@capacitor/*` elsewhere in this codebase
 * (see axioms.md §4), for a concretely verified reason here: its import
 * chain (`official-route-broadcaster.ts` → `authority.service.ts` →
 * `@/types/admin-types.ts`, which re-exports real values — not just types —
 * from the `@/features/parks` barrel) eagerly pulls in `AppMap.tsx` and
 * `gis-parser.service.ts` (which imports the browser-only `shpjs`, `self is
 * not defined` under Node). A top-level import broke every existing test in
 * this file, not just corridor ones. Deferring to call-time keeps that whole
 * chain out of every consumer's module graph unless corridor-following is
 * actually invoked — a rare path — and keeps this file's pure functions
 * (buildTriangleCombinations, buildCorridorRoute, etc.) importable in a
 * plain Node test environment.
 */
async function generateCorridorRoute(options: RouteGenerationOptions): Promise<Route[]> {
  const { followOfficialRouteId, activity, routeGenerationIndex } = options;
  if (!followOfficialRouteId) return [];

  const { InventoryService } = await import('./inventory.service');
  const corridor = await InventoryService.getRouteById(followOfficialRouteId);
  if (!corridor || !corridor.path || corridor.path.length < 2) {
    console.warn(`[RouteGenerator] generateCorridorRoute: official_routes/${followOfficialRouteId} not found or has no usable path`);
    return [];
  }

  const route = buildCorridorRoute(corridor, followOfficialRouteId, activity, routeGenerationIndex);
  console.log(`[RouteGenerator] generateCorridorRoute: following ${followOfficialRouteId} — ${corridor.path.length} pts, ${route.distance}km`);
  return [route];
}

/**
 * Pure Route-construction step of corridor-following — extracted from
 * `generateCorridorRoute` so the distance/duration/field-mapping logic is
 * directly unit-testable without mocking Firestore (same extraction
 * discipline as `buildTriangleCombinations` / `isBetterNearMissCandidate`
 * above). Takes an already-fetched corridor `Route` (any source — a real
 * `InventoryService.getRouteById` result or a hand-built test fixture) and
 * returns the new corridor-following Route built from its `path` verbatim.
 */
export function buildCorridorRoute(
  corridor: Route,
  followOfficialRouteId: string,
  activity: ActivityType,
  routeGenerationIndex: number,
): Route {
  const distanceKm = pathLengthMeters(corridor.path) / 1000;
  const speedKmh = activity === 'cycling' ? SPEED_KMH.cycling : activity === 'running' ? SPEED_KMH.running : SPEED_KMH.walking;
  const durationMinutes = Math.round((distanceKm / speedKmh) * 60);
  const calories = Math.round(distanceKm * kcalPerKmFor(activity));

  return {
    id: `corridor-${followOfficialRouteId}-${routeGenerationIndex}`,
    name: corridor.name || 'מסלול מסומן',
    description: corridor.description || `עוקב אחרי מסלול מסומן, ${distanceKm.toFixed(1)} ק"מ`,
    distance: parseFloat(distanceKm.toFixed(1)),
    duration: durationMinutes,
    score: 100,
    type: activity,
    activityType: activity,
    difficulty: corridor.difficulty || 'easy',
    path: corridor.path,
    segments: [],
    rating: corridor.rating || 4.5,
    calories,
    analytics: corridor.analytics ?? { usageCount: 0, rating: 0, heatMapScore: 0 },
    source: {
      type: 'official_api',
      name: corridor.source?.name || 'official_routes',
      externalId: followOfficialRouteId,
    },
    features: corridor.features ?? {
      hasGym: false,
      hasBenches: true,
      scenic: true,
      lit: true,
      terrain: 'road',
      environment: 'urban',
      trafficLoad: 'low',
      surface: 'asphalt',
    },
    calculatedScore: 100,
    distanceFromUser: 0,
    isReachableWithoutCar: true,
    includesOfficialSegments: true,
    visitingParkId: null,
    includesFitnessStop: false,
    sourceOfficialRouteIds: [followOfficialRouteId],
  };
}

// ═══════════════════════════════════════════════════════════════════
// Phase 2 — chain discovery (.claude/plans/build-the-phase-0-noble-kahn.md)
// ═══════════════════════════════════════════════════════════════════

/** A single attempted connector during chain discovery — kept regardless of
 *  accept/reject so David can review every candidate the discovery pass
 *  actually tried, not just the ones that made it into the final route. */
export interface ChainDiscoveryAttempt {
  fromRouteId: string;
  toRouteId: string;
  toRouteName: string;
  precomputedGapMeters: number;
  connectorLengthMeters: number | null; // null = Mapbox returned no route at all
  accepted: boolean;
  rejectReason?: 'over_cap' | 'no_mapbox_route';
  connectorStart: { lat: number; lng: number };
  connectorEnd: { lat: number; lng: number };
}

export interface ChainDiscoveryDiagnostics {
  cityNameUsed?: string;
  corridorsConsidered: number;
  edgesAvailable: number;
  chainRouteIds: string[];
  attempts: ChainDiscoveryAttempt[];
  finalDistanceKm: number;
  stopReason: 'target_reached' | 'no_more_edges' | 'max_corridors' | 'no_starting_corridor' | 'flag_disabled';
  timestamp: number;
}

let _lastChainDiscoveryDiagnostics: ChainDiscoveryDiagnostics | null = null;
export function getLastChainDiscoveryDiagnostics(): ChainDiscoveryDiagnostics | null {
  return _lastChainDiscoveryDiagnostics;
}

/** Real-world connector reject cap — the actual walkability gate (a Mapbox-
 *  routed street path, not the cheap straight-line proxy `route_adjacency`
 *  candidates are filtered by). Raised 300m -> 650m (15.08.2026) — David
 *  confirmed on the ground that Park HaMesila -> Charles Clore's real 554m
 *  connector (park-to-beach) is a normal, pleasant walk; 300m was too tight
 *  for connecting two genuinely separate corridors. Still a real cap, still
 *  surfaced for human review per David's standing steer — a geometric pass
 *  can prove "close," never "walkable" (a fence/highway/tracks could sit
 *  between two corridors that measure meters apart), so every accepted AND
 *  rejected attempt still needs eyeballing against a real map before being
 *  trusted at scale, not just because it cleared a wider number. */
const CONNECTOR_REJECT_METERS = 650;
/** Safety cap on chain length — David's own acceptance test targets 2-3
 *  corridors; this just prevents an unbounded walk on a very dense city. */
const MAX_CHAIN_CORRIDORS = 5;

interface ChainAdjacencyEdge {
  otherRouteId: string;
  gapMeters: number;
}

/**
 * Pure edge-selection step: among all `route_adjacency` edges touching any
 * already-visited corridor, pick the smallest-gap edge leading to an
 * UNVISITED corridor (greedy nearest — simplest defensible MVP policy; not
 * distance-target-aware beyond the caller's own stop condition). Returns
 * null when no visited corridor has an edge to anything new. Extracted for
 * direct unit testing, same discipline as `buildTriangleCombinations`.
 */
export function selectNextChainEdge(
  edgesByRouteId: Map<string, ChainAdjacencyEdge[]>,
  visitedIds: string[],
): { fromRouteId: string; toRouteId: string; gapMeters: number } | null {
  const visitedSet = new Set(visitedIds);
  let best: { fromRouteId: string; toRouteId: string; gapMeters: number } | null = null;
  for (const fromRouteId of visitedIds) {
    const edges = edgesByRouteId.get(fromRouteId) ?? [];
    for (const edge of edges) {
      if (visitedSet.has(edge.otherRouteId)) continue;
      if (!best || edge.gapMeters < best.gapMeters) {
        best = { fromRouteId, toRouteId: edge.otherRouteId, gapMeters: edge.gapMeters };
      }
    }
  }
  return best;
}

/**
 * Phase 2's real deliverable: discovers connectable corridors near the user
 * and chains them with real Mapbox connectors — no hardcoded corridor list.
 * Requires `IS_ROUTE_ADJACENCY_ENABLED`; a true no-op (empty result,
 * `stopReason: 'flag_disabled'`) while it's off, matching every other flag
 * in this file.
 *
 * Algorithm (greedy nearest-edge walk, capped at MAX_CHAIN_CORRIDORS):
 *  1. Fetch published official_routes + route_adjacency edges for the
 *     user's city (alias-resolved — grounding fact #5).
 *  2. Start from the corridor nearest the user.
 *  3. Repeat: pick the smallest-gap precomputed edge from any corridor
 *     already in the chain to an unvisited one; build a REAL Mapbox
 *     connector for it; if the connector's real length clears
 *     CONNECTOR_REJECT_METERS, splice it in — otherwise reject this edge
 *     and try the next-best one. Every attempt (accepted or rejected) is
 *     recorded in `getLastChainDiscoveryDiagnostics()` for review.
 *  4. Stop once targetDistance is reached, no edges remain, or the
 *     MAX_CHAIN_CORRIDORS cap is hit.
 */
/** A published official_routes corridor as fetched for generation-time use — just enough to compute geometry, no admin/CRM fields. */
export interface CorridorRecord {
  id: string;
  name: string;
  path: [number, number][];
}

/**
 * Shared corridor-fetch helper — extracted (16.08.2026, Stage 0 of the
 * user-anchored-flow build, David-approved) from `generateDiscoveredChainRoute`'s
 * own inline query so Stage B's `selectProximityAwareCorridor` can reuse the
 * exact same fetch instead of duplicating it. Fetches every PUBLISHED
 * official_routes doc across all of `cityCandidates` (the alias-resolved
 * set from `resolveCityNameQueryAliases` — grounding fact #5: official_routes
 * uses `city`, not `cityName`, and the value itself has city-specific
 * aliases e.g. 'תל אביב' vs 'תל אביב-יפו'). Pure I/O, no filtering beyond
 * published+valid-path — callers apply their own distance/quality logic.
 */
export async function fetchPublishedCorridorsForCity(cityCandidates: string[]): Promise<Map<string, CorridorRecord>> {
  const corridorDocs = await Promise.all(
    cityCandidates.map((c) =>
      getDocs(query(collection(db, 'official_routes'), where('city', '==', c), where('published', '==', true))),
    ),
  );
  const corridors = new Map<string, CorridorRecord>();
  for (const snap of corridorDocs) {
    for (const d of snap.docs) {
      const data = d.data();
      const rawPath = data.path;
      if (!Array.isArray(rawPath) || rawPath.length < 2) continue;
      const path = rawPath.map((p: any) => [Number(p.lng) || 0, Number(p.lat) || 0] as [number, number]);
      corridors.set(d.id, { id: d.id, name: data.name || 'מסלול מסומן', path });
    }
  }
  return corridors;
}

/**
 * Shared fallback to normal (non-corridor) generation — same decision
 * `generateDynamicRoutes`' own dispatcher makes for a request with neither
 * `discoverCorridorChain` nor `userAnchoredCorridorFlow` set. Extracted
 * 16.08.2026 (pre-flip safety review, David-requested) after finding
 * `generateDiscoveredChainRoute` had NO fallback for a corridor-less city —
 * it returned `[]` instead, unlike `generateUserAnchoredFlowRoute`'s
 * explicit fallback (Stage B). Both corridor-adjacency entry points now use
 * this so neither can return empty just because a city has zero corridors —
 * the ~244 cities without any `official_routes` data must still get a
 * valid, non-empty route when `IS_ROUTE_ADJACENCY_ENABLED` is on.
 */
function fallbackToNormalGeneration(options: RouteGenerationOptions): Promise<Route[]> {
  const rawDistance = typeof options.targetDistance === 'number' && !isNaN(options.targetDistance) ? options.targetDistance : 3;
  if (options.shortRouteMode && rawDistance < MIN_GENERATION_KM) return generateShortRoutes(options);
  return generateLoopRoutes(options);
}

async function generateDiscoveredChainRoute(options: RouteGenerationOptions): Promise<Route[]> {
  if (!IS_ROUTE_ADJACENCY_ENABLED) {
    _lastChainDiscoveryDiagnostics = {
      corridorsConsidered: 0,
      edgesAvailable: 0,
      chainRouteIds: [],
      attempts: [],
      finalDistanceKm: 0,
      stopReason: 'flag_disabled',
      timestamp: Date.now(),
    };
    return [];
  }

  const { userLocation, cityName, activity, routeGenerationIndex, targetDistance } = options;
  const attempts: ChainDiscoveryAttempt[] = [];

  const cleanCity = (cityName || '').trim();
  const cityCandidates = resolveCityNameQueryAliases(cleanCity);

  const finish = (chainRouteIds: string[], finalDistanceKm: number, stopReason: ChainDiscoveryDiagnostics['stopReason'], edgesAvailable: number, route: Route[]): Route[] => {
    _lastChainDiscoveryDiagnostics = {
      cityNameUsed: cleanCity,
      corridorsConsidered: corridors.size,
      edgesAvailable,
      chainRouteIds,
      attempts,
      finalDistanceKm,
      stopReason,
      timestamp: Date.now(),
    };
    console.log(`[RouteGenerator] generateDiscoveredChainRoute: ${chainRouteIds.length} corridors, ${finalDistanceKm.toFixed(2)}km, stop=${stopReason} (${attempts.length} connector attempts, ${attempts.filter(a => a.accepted).length} accepted)`);
    return route;
  };

  // ── Fetch candidate corridors FIRST and bail immediately for a
  // corridor-less city — before any route_adjacency query or other work.
  // (16.08.2026, pre-flip safety fix: this used to run the route_adjacency
  // query unconditionally, which both wasted a read for the ~244
  // corridor-less cities and meant this function had a hard runtime
  // dependency on route_adjacency even when there was nothing to chain.)
  const corridors = await fetchPublishedCorridorsForCity(cityCandidates);
  if (corridors.size === 0) {
    console.log('[RouteGenerator] generateDiscoveredChainRoute: no published corridors for this city — falling back to normal generation');
    return finish([], 0, 'no_starting_corridor', 0, await fallbackToNormalGeneration(options));
  }

  const { MapboxService } = await import('./mapbox.service');
  const {
    findNearestContactPoint,
    orientCorridorForSplice,
    spliceCorridorChain,
  } = await import('./route-adjacency.service');

  const edgeDocs = await Promise.all(
    cityCandidates.map((c) => getDocs(query(collection(db, 'route_adjacency'), where('cityName', '==', c)))),
  );
  const edgesByRouteId = new Map<string, ChainAdjacencyEdge[]>();
  let edgesAvailable = 0;
  for (const snap of edgeDocs) {
    for (const d of snap.docs) {
      const e = d.data();
      edgesAvailable++;
      if (!edgesByRouteId.has(e.routeIdA)) edgesByRouteId.set(e.routeIdA, []);
      if (!edgesByRouteId.has(e.routeIdB)) edgesByRouteId.set(e.routeIdB, []);
      edgesByRouteId.get(e.routeIdA)!.push({ otherRouteId: e.routeIdB, gapMeters: e.gapMeters });
      edgesByRouteId.get(e.routeIdB)!.push({ otherRouteId: e.routeIdA, gapMeters: e.gapMeters });
    }
  }

  // ── Start from the corridor nearest the user ────────────────────────────
  let nearestId: string | null = null;
  let nearestDist = Infinity;
  for (const c of Array.from(corridors.values())) {
    const contact = findNearestContactPoint([[userLocation.lng, userLocation.lat]], c.path);
    if (contact.gapMeters < nearestDist) {
      nearestDist = contact.gapMeters;
      nearestId = c.id;
    }
  }
  if (!nearestId) return finish([], 0, 'no_starting_corridor', edgesAvailable, []);

  const chainIds: string[] = [nearestId];
  let orientedPaths: [number, number][][] = [corridors.get(nearestId)!.path];
  const connectors: [number, number][][] = [];
  let totalDistanceKm = pathLengthMeters(orientedPaths[0]) / 1000;
  const rejectedEdgeKeys = new Set<string>();

  while (totalDistanceKm < targetDistance && chainIds.length < MAX_CHAIN_CORRIDORS) {
    // Build the candidate edge list excluding ones already rejected this run.
    const filteredEdges = new Map<string, ChainAdjacencyEdge[]>();
    for (const id of chainIds) {
      const edges = (edgesByRouteId.get(id) ?? []).filter(
        (e) => !rejectedEdgeKeys.has([id, e.otherRouteId].sort().join('_')),
      );
      filteredEdges.set(id, edges);
    }
    const next = selectNextChainEdge(filteredEdges, chainIds);
    if (!next) break;

    const fromCorridor = corridors.get(next.fromRouteId)!;
    const toCorridor = corridors.get(next.toRouteId);
    if (!toCorridor) {
      rejectedEdgeKeys.add([next.fromRouteId, next.toRouteId].sort().join('_'));
      continue;
    }

    // Orient live off the two real paths (not the precomputed edge's stored
    // contact) — cheap at these path sizes, and avoids needing to persist
    // array indices (which would be fragile schema-wise) in route_adjacency.
    const fromPathInChain = orientedPaths[chainIds.indexOf(next.fromRouteId)];
    const contact = findNearestContactPoint(fromPathInChain, toCorridor.path);
    const orientedTo = orientCorridorForSplice(toCorridor.path, contact.indexB);
    // fromPathInChain is only re-oriented when it's the CURRENT chain tail —
    // an interior visited corridor stays as already spliced.
    const fromIsTail = next.fromRouteId === chainIds[chainIds.length - 1];
    const fromForConnector = fromIsTail
      ? orientCorridorForSplice(fromPathInChain, contact.indexA)
      : fromPathInChain;
    if (fromIsTail) orientedPaths[orientedPaths.length - 1] = fromForConnector;

    const connectorStart = fromForConnector[fromForConnector.length - 1];
    const connectorEnd = orientedTo[0];
    const connectorResult = await MapboxService.getSmartPath(connectorStart, connectorEnd, activity === 'cycling' ? 'cycling' : 'walking');

    const attempt: ChainDiscoveryAttempt = {
      fromRouteId: next.fromRouteId,
      toRouteId: next.toRouteId,
      toRouteName: toCorridor.name,
      precomputedGapMeters: next.gapMeters,
      connectorLengthMeters: null,
      accepted: false,
      connectorStart: { lat: connectorStart[1], lng: connectorStart[0] },
      connectorEnd: { lat: connectorEnd[1], lng: connectorEnd[0] },
    };

    if (!connectorResult || !connectorResult.path || connectorResult.path.length < 2) {
      attempt.rejectReason = 'no_mapbox_route';
      attempts.push(attempt);
      rejectedEdgeKeys.add([next.fromRouteId, next.toRouteId].sort().join('_'));
      continue;
    }

    const connectorLengthMeters = pathLengthMeters(connectorResult.path);
    attempt.connectorLengthMeters = connectorLengthMeters;

    if (connectorLengthMeters > CONNECTOR_REJECT_METERS) {
      attempt.rejectReason = 'over_cap';
      attempts.push(attempt);
      rejectedEdgeKeys.add([next.fromRouteId, next.toRouteId].sort().join('_'));
      continue;
    }

    attempt.accepted = true;
    attempts.push(attempt);

    if (!fromIsTail) {
      // The chosen edge originates from an interior (already-spliced)
      // corridor, not the current tail — safety net only: MAX_CHAIN_CORRIDORS
      // keeps chains short enough that this is rare, and branching mid-chain
      // is out of scope for this pass. Skip and try the next-best edge.
      rejectedEdgeKeys.add([next.fromRouteId, next.toRouteId].sort().join('_'));
      continue;
    }

    connectors.push(connectorResult.path);
    orientedPaths.push(orientedTo);
    chainIds.push(next.toRouteId);
    totalDistanceKm += connectorLengthMeters / 1000 + pathLengthMeters(orientedTo) / 1000;
  }

  if (chainIds.length < 2) return finish(chainIds, totalDistanceKm, 'no_more_edges', edgesAvailable, []);

  const splicedPath = spliceCorridorChain(orientedPaths, connectors);
  const speedKmh = activity === 'cycling' ? SPEED_KMH.cycling : activity === 'running' ? SPEED_KMH.running : SPEED_KMH.walking;
  const durationMinutes = Math.round((totalDistanceKm / speedKmh) * 60);
  const calories = Math.round(totalDistanceKm * kcalPerKmFor(activity));
  const names = chainIds.map((id) => corridors.get(id)!.name);

  const route: Route = {
    id: `chain-${chainIds.join('-')}-${routeGenerationIndex}`,
    name: `${names[0]} ↔ ${names[names.length - 1]}`,
    description: `מסלול משורשר: ${names.join(' → ')} (${totalDistanceKm.toFixed(1)} ק"מ)`,
    distance: parseFloat(totalDistanceKm.toFixed(1)),
    duration: durationMinutes,
    score: 100,
    type: activity,
    activityType: activity,
    difficulty: 'medium',
    path: splicedPath,
    segments: [],
    rating: 4.5,
    calories,
    analytics: { usageCount: 0, rating: 0, heatMapScore: 0 },
    source: { type: 'official_api', name: 'route_adjacency_discovery' },
    features: {
      hasGym: false,
      hasBenches: true,
      scenic: true,
      lit: true,
      terrain: 'road',
      environment: 'urban',
      trafficLoad: 'low',
      surface: 'asphalt',
    },
    calculatedScore: 100,
    distanceFromUser: 0,
    isReachableWithoutCar: true,
    includesOfficialSegments: true,
    visitingParkId: null,
    includesFitnessStop: false,
    sourceOfficialRouteIds: chainIds,
  };

  const stopReason: ChainDiscoveryDiagnostics['stopReason'] =
    totalDistanceKm >= targetDistance ? 'target_reached' : chainIds.length >= MAX_CHAIN_CORRIDORS ? 'max_corridors' : 'no_more_edges';
  return finish(chainIds, totalDistanceKm, stopReason, edgesAvailable, [route]);
}

// ═══════════════════════════════════════════════════════════════════
// Stage A/B — user-anchored corridor flow
// (.claude/plans/build-the-phase-0-noble-kahn.md, David-approved 16.08.2026)
// ═══════════════════════════════════════════════════════════════════

/**
 * Round-trip fraction of `targetMeters` spent just getting to and from a
 * corridor's nearest point (16.08.2026, Stage B — proximity-aware
 * selection). Pure, directly testable. `targetMeters <= 0` returns
 * `Infinity` (never qualifies) rather than dividing by zero.
 */
export function computeProximityFraction(connectorMeters: number, targetMeters: number): number {
  if (targetMeters <= 0) return Infinity;
  return (2 * connectorMeters) / targetMeters;
}

/**
 * Qualification rule for the proximity-aware corridor selector: at least
 * half of the requested round trip must be spent ON the corridor, not
 * commuting to and from it. Threshold confirmed by David (16.08.2026)
 * against two worked examples — a 6km target with a ~1.2km connector
 * qualifies (f=0.40); a 3km target from a genuinely close home (~≤400m
 * connector) also qualifies (f~0.27) — the two examples use different
 * home locations, not one connector distance stretched across both.
 */
const PROXIMITY_QUALIFY_THRESHOLD = 0.5;
export function qualifiesForCorridorFlow(connectorMeters: number, targetMeters: number): boolean {
  return computeProximityFraction(connectorMeters, targetMeters) <= PROXIMITY_QUALIFY_THRESHOLD;
}

/** How many straight-line-nearest candidates get a real (network) connector check — keeps Stage B's Mapbox call count bounded regardless of how many corridors a city has. */
const PROXIMITY_PREFILTER_CANDIDATES = 5;

interface ProximityAwareSelection {
  corridorId: string;
  entryIndex: number;
  connector: MapboxPathResult;
  f: number;
}

/**
 * Stage B: picks WHICH corridor (if any) a user-anchored flow should enter,
 * weighing real connector distance against how much of `targetMeters` it
 * would consume. Cheap straight-line prefilter first (`findNearestContactPoint`,
 * no network calls), then a REAL Mapbox connector for the closest few
 * survivors — `f <= 0.5` (see `qualifiesForCorridorFlow`) decides
 * qualification; among qualifiers, the lowest `f` (most corridor, least
 * commute) wins. Returns `null` when nothing qualifies — the caller falls
 * back to normal (non-corridor) generation, exactly like `generateShortRoutes`'s
 * own existing "never show nothing" philosophy.
 */
async function selectProximityAwareCorridor(
  userLocation: { lat: number; lng: number },
  targetMeters: number,
  corridors: Map<string, CorridorRecord>,
  profile: 'walking' | 'cycling',
): Promise<ProximityAwareSelection | null> {
  const { findNearestContactPoint } = await import('./route-adjacency.service');
  const { MapboxService } = await import('./mapbox.service');

  const prefiltered = Array.from(corridors.values())
    .map((c) => {
      const contact = findNearestContactPoint([[userLocation.lng, userLocation.lat]], c.path);
      return { corridor: c, entryIndex: contact.indexB, straightLineGapMeters: contact.gapMeters };
    })
    .sort((a, b) => a.straightLineGapMeters - b.straightLineGapMeters)
    .slice(0, PROXIMITY_PREFILTER_CANDIDATES);

  let best: ProximityAwareSelection | null = null;
  let bestF = Infinity; // tracks the closest miss too, not just qualifiers — diagnostic value even on full reject
  let candidatesEvaluated = 0;
  for (const candidate of prefiltered) {
    const entryPoint = candidate.corridor.path[candidate.entryIndex];
    const connector = await MapboxService.getSmartPath(
      userLocation,
      { lat: entryPoint[1], lng: entryPoint[0] },
      profile,
    );
    if (!connector || !connector.path || connector.path.length < 2) continue;

    candidatesEvaluated++;
    const connectorMeters = pathLengthMeters(connector.path);
    const f = computeProximityFraction(connectorMeters, targetMeters);
    if (f < bestF) bestF = f;
    if (!qualifiesForCorridorFlow(connectorMeters, targetMeters)) continue;
    if (!best || f < best.f) {
      best = { corridorId: candidate.corridor.id, entryIndex: candidate.entryIndex, connector, f };
    }
  }

  // ALWAYS-ON diagnostic (16.08.2026, David-requested) — fires whenever this
  // function is reached at all (i.e. userAnchoredCorridorFlow was true AND
  // the city had >=1 published corridor), regardless of outcome. Its ABSENCE
  // for a request that should have reached here is itself the diagnostic:
  // proof the dispatcher never entered generateUserAnchoredFlowRoute.
  console.log(`[Corridor] considered: ${prefiltered.length} candidates (${candidatesEvaluated} got a real connector), best f=${bestF === Infinity ? 'n/a' : bestF.toFixed(2)}, qualified=${!!best} -> ${best ? 'corridor' : 'fallback'}`);

  return best;
}

/**
 * Stage A+B of the user-anchored corridor-flow build. Starts the route AT
 * THE USER (unlike `followOfficialRouteId`/`discoverCorridorChain`, both of
 * which start from a corridor) — the user->corridor leg is a real Mapbox
 * connector and counts toward `targetDistance`. Selects a qualifying
 * corridor via `selectProximityAwareCorridor` (falling back to normal
 * generation when nothing qualifies — Stage B), flows through it (extending
 * into further corridors via the same `route_adjacency` chain-walk
 * `generateDiscoveredChainRoute` already runs, if needed), trims the
 * accumulated flow to exactly half of `targetDistance`
 * (`sliceFlowPathToDistance`), then mirrors it into a round trip
 * (`buildOutAndBackPath` — confirmed by its own doc comment to do exactly
 * this job, no adaptation needed).
 */
async function generateUserAnchoredFlowRoute(options: RouteGenerationOptions): Promise<Route[]> {
  // Falls back to normal generation, not []: (16.08.2026) this is now called
  // unconditionally from the real free-run flow (not just when a caller
  // explicitly opts in), so IS_ROUTE_ADJACENCY_ENABLED must work as a true
  // kill-switch — flipping it off has to revert to today's exact generation,
  // never break it. See fallbackToNormalGeneration's own doc comment.
  if (!IS_ROUTE_ADJACENCY_ENABLED) return fallbackToNormalGeneration(options);

  const { userLocation, cityName, activity, routeGenerationIndex, targetDistance } = options;
  const cleanCity = (cityName || '').trim();
  const cityCandidates = resolveCityNameQueryAliases(cleanCity);
  const profile = activity === 'cycling' ? 'cycling' : 'walking';
  const targetMeters = targetDistance * 1000;
  // Stage C structural hook: 'out_and_back' is the only supported value —
  // accepted here but not branched on until a real loop-return layer exists.
  const returnShape: NonNullable<RouteGenerationOptions['returnShape']> = options.returnShape ?? 'out_and_back';

  const { orientCorridorForFlow, orientCorridorForSplice, findNearestContactPoint } = await import('./route-adjacency.service');
  const { MapboxService } = await import('./mapbox.service');

  const corridors = await fetchPublishedCorridorsForCity(cityCandidates);
  if (corridors.size === 0) {
    console.log('[RouteGenerator] generateUserAnchoredFlowRoute: no published corridors for this city — falling back to normal generation');
    return fallbackToNormalGeneration(options);
  }

  const selection = await selectProximityAwareCorridor(userLocation, targetMeters, corridors, profile);
  if (!selection) {
    console.log('[RouteGenerator] generateUserAnchoredFlowRoute: no corridor close enough for this target (f<=0.5) — falling back to normal generation');
    return fallbackToNormalGeneration(options);
  }

  const nearestId = selection.corridorId;
  const nearestIndex = selection.entryIndex;
  const homeConnector = selection.connector; // already fetched during selection — no re-fetch
  const firstCorridor = corridors.get(nearestId)!;

  const orientedFirst = orientCorridorForFlow(firstCorridor.path, nearestIndex);
  let flowPath: [number, number][] = [...homeConnector.path, ...orientedFirst.slice(1)];
  const chainIds = [nearestId];
  const halfTargetMeters = targetMeters / 2;

  // Extend into further corridors via the precomputed route_adjacency graph
  // if the first one alone doesn't reach half the target — same primitives
  // generateDiscoveredChainRoute uses (selectNextChainEdge, CONNECTOR_REJECT_METERS,
  // MAX_CHAIN_CORRIDORS), applied to a flow that already starts with a user
  // connector rather than a bare corridor.
  if (pathLengthMeters(flowPath) < halfTargetMeters) {
    const edgeDocs = await Promise.all(
      cityCandidates.map((c) => getDocs(query(collection(db, 'route_adjacency'), where('cityName', '==', c)))),
    );
    const edgesByRouteId = new Map<string, ChainAdjacencyEdge[]>();
    for (const snap of edgeDocs) {
      for (const d of snap.docs) {
        const e = d.data();
        if (!edgesByRouteId.has(e.routeIdA)) edgesByRouteId.set(e.routeIdA, []);
        if (!edgesByRouteId.has(e.routeIdB)) edgesByRouteId.set(e.routeIdB, []);
        edgesByRouteId.get(e.routeIdA)!.push({ otherRouteId: e.routeIdB, gapMeters: e.gapMeters });
        edgesByRouteId.get(e.routeIdB)!.push({ otherRouteId: e.routeIdA, gapMeters: e.gapMeters });
      }
    }

    const rejectedKeys = new Set<string>();
    while (pathLengthMeters(flowPath) < halfTargetMeters && chainIds.length < MAX_CHAIN_CORRIDORS) {
      const filtered = new Map<string, ChainAdjacencyEdge[]>();
      for (const id of chainIds) {
        filtered.set(id, (edgesByRouteId.get(id) ?? []).filter((e) => !rejectedKeys.has([id, e.otherRouteId].sort().join('_'))));
      }
      const next = selectNextChainEdge(filtered, chainIds);
      // Only extend from the flow's current tail — branching mid-flow is out
      // of scope here, same call as generateDiscoveredChainRoute makes.
      if (!next || next.fromRouteId !== chainIds[chainIds.length - 1]) break;

      const nextCorridor = corridors.get(next.toRouteId);
      if (!nextCorridor) {
        rejectedKeys.add([next.fromRouteId, next.toRouteId].sort().join('_'));
        continue;
      }

      const tailPoint = flowPath[flowPath.length - 1];
      const contact = findNearestContactPoint([tailPoint], nextCorridor.path);
      const orientedNext = orientCorridorForSplice(nextCorridor.path, contact.indexB);
      const connector = await MapboxService.getSmartPath(
        { lat: tailPoint[1], lng: tailPoint[0] },
        { lat: orientedNext[0][1], lng: orientedNext[0][0] },
        profile,
      );
      if (!connector || !connector.path || connector.path.length < 2) {
        rejectedKeys.add([next.fromRouteId, next.toRouteId].sort().join('_'));
        continue;
      }
      const connectorLen = pathLengthMeters(connector.path);
      if (connectorLen > CONNECTOR_REJECT_METERS) {
        rejectedKeys.add([next.fromRouteId, next.toRouteId].sort().join('_'));
        continue;
      }

      flowPath = [...flowPath, ...connector.path.slice(1), ...orientedNext.slice(1)];
      chainIds.push(next.toRouteId);
    }
  }

  // Trim to exactly half the target, then mirror for the round trip.
  const trimmedFlow = sliceFlowPathToDistance(flowPath, halfTargetMeters);
  const mirroredPath = buildOutAndBackPath(trimmedFlow);
  const cleanPath = rdpSimplify(mirroredPath, 4);

  const oneWayKm = pathLengthMeters(trimmedFlow) / 1000;
  const totalDistanceKm = oneWayKm * 2;
  const speedKmh = activity === 'cycling' ? SPEED_KMH.cycling : activity === 'running' ? SPEED_KMH.running : SPEED_KMH.walking;
  const durationMinutes = Math.round((totalDistanceKm / speedKmh) * 60);
  const calories = Math.round(totalDistanceKm * kcalPerKmFor(activity));
  const corridorNames = chainIds.map((id) => corridors.get(id)?.name).filter(Boolean);

  const route: Route = {
    id: `flow-${chainIds.join('-')}-${routeGenerationIndex}`,
    name: `זרימה דרך ${corridorNames[0] || 'מסלול מסומן'}`,
    description: `מסלול הלוך-חזור דרך ${corridorNames.join(', ')}, ${totalDistanceKm.toFixed(1)} ק"מ`,
    distance: parseFloat(totalDistanceKm.toFixed(1)),
    duration: durationMinutes,
    score: 100,
    type: activity,
    activityType: activity,
    difficulty: 'medium',
    path: cleanPath,
    segments: [],
    rating: 4.5,
    calories,
    analytics: { usageCount: 0, rating: 0, heatMapScore: 0 },
    source: { type: 'official_api', name: 'user_anchored_corridor_flow' },
    features: {
      hasGym: false,
      hasBenches: true,
      scenic: true,
      lit: true,
      terrain: 'road',
      environment: 'urban',
      trafficLoad: 'low',
      surface: 'asphalt',
    },
    calculatedScore: 100,
    distanceFromUser: 0,
    isReachableWithoutCar: true,
    includesOfficialSegments: true,
    visitingParkId: null,
    includesFitnessStop: false,
    sourceOfficialRouteIds: chainIds,
  };

  console.log(`[RouteGenerator] generateUserAnchoredFlowRoute: ${chainIds.length} corridor(s) [${corridorNames.join(' -> ')}], one-way ${oneWayKm.toFixed(2)}km, round-trip ${totalDistanceKm.toFixed(2)}km (target ${targetDistance}km, returnShape=${returnShape})`);

  return [route];
}

/**
 * Mapbox Directions returns disappointingly few path points for very short
 * routes (~1km loops can come back with 10–30 points), which then fail the
 * MIN_PATH_POINTS guard below and the user sees an empty card list. Below
 * this size, normal loop mode clamps the *generation* target up (the
 * user-facing goal is untouched); short-route mode instead tries a
 * recalibrated short loop / out-and-back — see `generateShortRoutes`.
 */
export const MIN_GENERATION_KM = 1.5;
/** Tiny numeric-safety floor for short-route mode — NOT a UX floor like
 *  MIN_GENERATION_KM. Short-route mode exists specifically to honor
 *  genuinely small targets; this only guards a pathological 0/negative
 *  targetDistance. */
const MIN_SHORT_TARGET_KM = 0.1;
/** Initial guess, short-target LOOP legs — looser than the existing 30/50
 *  adaptive MIN_PATH_POINTS since short legs genuinely return fewer points
 *  even when valid. Calibrate on real device data (see short-route plan's
 *  verification section) before any Phase 2 rollout. */
const MIN_PATH_POINTS_SHORT = 20;
/** Initial guess, out-and-back's ONE-WAY leg (half the round trip, before
 *  mirroring) — same calibration caveat as MIN_PATH_POINTS_SHORT. */
const MIN_PATH_POINTS_ONE_WAY = 10;

/**
 * IS_GUARANTEED_ROUTE_FALLBACK_ENABLED Tier 2 (relaxed re-fetch) parameters —
 * how much wider/lower-bar the second fetchScoredWaypointsByProximity call
 * goes relative to the default (radiusMultiplier 0.5, minScore 6). INITIAL
 * GUESS pending live calibration in Tel Aviv + a thin-coverage city (same
 * discipline as computeTightenedDistanceWindow's calibration) — do not
 * default IS_GUARANTEED_ROUTE_FALLBACK_ENABLED on before that pass.
 */
const TIER2_RADIUS_MULTIPLIER = 1.0; // double the default 0.5 (i.e. full targetDistance as radius, not half)
const TIER2_MIN_SCORE = 3; // half the default 6

/**
 * Builds up to 5 triangle-vertex combinations from `topCandidates`, each a
 * genuinely distinct 3-point set. Pure, deterministic, no I/O — extracted
 * for direct unit testing.
 *
 * Periodicity fix (14.08.2026, verified live in Tel Aviv): the previous
 * version derived each combination via a FIXED stride of 2 per attempt and
 * a single rigid leg-spacing (`legSpan = floor(N/3)`), which collided with
 * itself whenever N (topCandidates.length) was an exact multiple of 3 —
 * including N=12, the requested maximum and thus the COMMON case whenever
 * candidate data is abundant. At N=12, legSpan=4, shifting the triangle by
 * 2·legSpan=8 maps it onto itself, so combinations i=0,2,4 were
 * byte-identical (same 3-point set) and i=1,3 were a second identical set
 * — only 2 distinct triangles ever existed among the intended 5, so the
 * "3rd valid route" was frequently a silent duplicate of an earlier one,
 * and long targets got only 2 real shots at satisfying the acceptance
 * window instead of 5.
 *
 * Fix: (a) alternate between two adjacent leg-spacings (legSpan and
 * legSpan+1) across attempts — a single rigid spacing whose vertices are
 * evenly divisible into N can mathematically never produce more than
 * `legSpan` distinct sets when N = 3·legSpan exactly (provable, not
 * tunable away with a different stride alone — verified via simulation:
 * N=12 with spacing-alternation reaches the full 5/5 distinct sets for
 * every possible baseOffset, versus a hard cap of 4/5 with a single rigid
 * spacing); (b) an explicit dedup by vertex-index SET (order-independent —
 * the caller's own bearing-sort picks visit order, not this) is the real
 * guarantee, independent of what N turns out to be — no combination is
 * ever returned twice, tried across up to 10 attempts (double the 5
 * actually needed) so there's room to find distinct shapes even when some
 * attempts collide. Very small N (3, 4, 6) are genuinely combinatorially
 * capped below 5 (N=3 has only 1 possible triangle at all) — those are
 * real limits of a 3-point pool, not a bug this fix can lift further.
 */
export function buildTriangleCombinations(
  topCandidates: WaypointCandidate[],
  baseOffset: number,
): Array<{ waypoints: WaypointCandidate[]; score: number }> {
  const legSpan = Math.max(1, Math.floor(topCandidates.length / 3));
  const N = Math.max(1, topCandidates.length);
  const seenVertexSets = new Set<string>();
  const combinations: Array<{ waypoints: WaypointCandidate[]; score: number }> = [];
  const MAX_COMBINATION_ATTEMPTS = 10;

  for (let i = 0; i < MAX_COMBINATION_ATTEMPTS && combinations.length < 5; i++) {
    const spanForAttempt = i % 2 === 0 ? legSpan : Math.max(1, legSpan + 1);
    const offset = (baseOffset + i) % N;
    const idx1 = offset;
    const idx2 = (offset + spanForAttempt) % N;
    const idx3 = (offset + spanForAttempt * 2) % N;
    const wp1 = topCandidates[idx1];
    const wp2 = topCandidates[idx2];
    const wp3 = topCandidates[idx3];
    if (!wp1 || !wp2 || !wp3) continue;

    const vertexKey = [idx1, idx2, idx3].sort((a, b) => a - b).join(',');
    if (seenVertexSets.has(vertexKey)) continue;
    seenVertexSets.add(vertexKey);

    combinations.push({
      waypoints: [wp1, wp2, wp3],
      score: (wp1.score + wp2.score + wp3.score) / 3,
    });
  }

  return combinations;
}

/**
 * Loop-mode generator — original behaviour, extracted unchanged from
 * `generateDynamicRoutes` (pure rename, byte-identical for every existing
 * caller when `loopOpts.shortMode` is omitted).
 *
 * `shortMode` (new, set only by `generateShortRoutes`): skips the
 * MIN_GENERATION_KM floor-inflation and swaps in the short-route-calibrated
 * MIN_PATH_POINTS_SHORT guard + computeShortRouteDistanceWindow acceptance
 * band. Everything else — waypoint fetch, scoring, angular-diverse
 * selection, triangular combination, Mapbox call shape — is IDENTICAL to
 * normal loop mode. No parallel scoring logic.
 */
/**
 * Pure near-miss admission check for IS_GUARANTEED_ROUTE_FALLBACK_ENABLED's
 * Tier 1: should `candidateDistanceKm` replace whatever near-miss is
 * currently tracked (`currentBestDelta`, Infinity if none yet)? True only if
 * BOTH the candidate falls within `nearMissWindow` (today's pre-tightening
 * computeDistanceWindow bound — the guarantee never admits anything wider
 * than that) AND it's strictly closer to `safeDistance` than the current
 * best. Exported standalone (no Mapbox/Firestore I/O) so the selection logic
 * — not the network plumbing around it — is what gets unit-tested.
 */
export function isBetterNearMissCandidate(
  candidateDistanceKm: number,
  safeDistance: number,
  nearMissWindow: { minKm: number; maxKm: number },
  currentBestDelta: number,
): boolean {
  if (candidateDistanceKm < nearMissWindow.minKm || candidateDistanceKm > nearMissWindow.maxKm) return false;
  return Math.abs(candidateDistanceKm - safeDistance) < currentBestDelta;
}

/**
 * Runs the sequential Mapbox-call + point-count + distance-window pipeline
 * over a list of pre-built triangle combinations. Extracted from
 * generateLoopRoutes (14.08.2026) so IS_GUARANTEED_ROUTE_FALLBACK_ENABLED's
 * Tier 2 — a second pass over a relaxed, re-fetched candidate pool — can
 * reuse the exact same per-combination logic instead of a parallel copy.
 * Behavior for a plain single-window pass (nearMissWindow omitted) is
 * byte-identical to the pre-extraction inline loop.
 *
 * acceptWindow is the primary bound: a route inside it is pushed to
 * validRoutes, and the loop stops early once maxRoutesNeeded is reached.
 * nearMissWindow, when provided, is a WIDER bound checked only for routes
 * that failed acceptWindow — the single closest-to-target such result is
 * tracked and returned as bestNearMiss.
 */
async function attemptRouteCombinations(
  combinations: Array<{ waypoints: WaypointCandidate[]; score: number }>,
  params: {
    userLocation: { lat: number; lng: number };
    activity: ActivityType;
    preferences: RouteGenerationOptions['preferences'];
    fitnessAnchor: { lat: number; lng: number; id: string } | null;
    routeGenerationIndex: number;
    safeDistance: number;
    minPathPoints: number;
    acceptWindow: { minKm: number; maxKm: number };
    nearMissWindow?: { minKm: number; maxKm: number };
    maxRoutesNeeded: number;
  },
): Promise<{ validRoutes: Route[]; bestNearMiss: Route | null }> {
  const {
    userLocation,
    activity,
    preferences,
    fitnessAnchor,
    routeGenerationIndex,
    safeDistance,
    minPathPoints,
    acceptWindow,
    nearMissWindow,
    maxRoutesNeeded,
  } = params;

  const validRoutes: Route[] = [];
  let bestNearMiss: Route | null = null;
  let bestNearMissDelta = Infinity;

  // ✅ SEQUENTIAL PROCESSING - One at a time with delays (prevents 429 errors)
  for (let i = 0; i < combinations.length; i++) {
    // Stop if we have enough valid routes
    if (validRoutes.length >= maxRoutesNeeded) {
      console.log(`[RouteGenerator] Got ${maxRoutesNeeded} routes, stopping.`);
      break;
    }

    const combination = combinations[i];
    const [wp1, wp2, wp3] = combination.waypoints;

    // Change 2 — order the 3 chosen waypoints by their bearing around the user so
    // the visit sequence sweeps monotonically around the origin (a convex-ish fan)
    // instead of the score-ranked order, which jumps across the user and makes the
    // loop cross itself / look boxy. Selection stays score-based — only the ORDER
    // of the three changes.
    const bearingFromUser = (wp: { lat: number; lng: number }) =>
      (segBearing([userLocation.lng, userLocation.lat], [wp.lng, wp.lat]) + 360) % 360;
    const waypointsToUse: Array<{ lat: number; lng: number }> = [wp1, wp2, wp3]
      .map(wp => ({ lat: wp.lat, lng: wp.lng }))
      .sort((a, b) => bearingFromUser(a) - bearingFromUser(b));

    // Add fitness anchor if available (kept at index 1 — a must-visit gym; its slot
    // in the sweep is not critical to loop convexity).
    if (fitnessAnchor) {
      waypointsToUse.splice(1, 0, { lat: fitnessAnchor.lat, lng: fitnessAnchor.lng });
    }

    console.log(`[RouteGenerator] Fetching route ${i + 1}/${combinations.length}...`);

    try {
      const profile = activity === 'cycling' ? 'cycling' : 'walking';

      // Change 1 — ask Mapbox for a NON-backtracking loop. `continue_straight`
      // defaults to false for walking/cycling, letting the router U-turn at every
      // via point (the "חוזרת אחורה" shape). Force it on for the loop call only,
      // via getSmartPath's existing extraParams — mapbox.service.ts stays untouched
      // (no clash with the UX-chat work there). alternatives:'false' because a loop
      // has no use for them and Mapbox dislikes pairing them with continue_straight.
      let result = await MapboxService.getSmartPath(
        userLocation,
        userLocation, // Loop back home
        profile,
        waypointsToUse,
        { continue_straight: 'true', alternatives: 'false' },
      );
      let csMode: 'continue_straight' | 'fallback' = 'continue_straight';

      // Fallback (retry-without): continue_straight can yield NoRoute on some
      // waypoint combos. One retry without it — worst case = the pre-change-1
      // behaviour for this single combo. (Change 2's bearing-ordering makes this
      // even rarer, since ordered waypoints are more routable.)
      if (!result || !result.path || result.path.length === 0) {
        result = await MapboxService.getSmartPath(userLocation, userLocation, profile, waypointsToUse);
        csMode = 'fallback';
      }

      // ✅ STRICT VALIDATION: Must have 50+ points (prevents straight lines/triangles)
      if (!result || !result.path || result.path.length < minPathPoints) {
        console.warn(`[RouteGenerator] Route ${i} REJECTED: only ${result?.path?.length || 0} points (need ${minPathPoints}+)`);

        // ✅ Wait before next attempt to avoid 429
        if (i < combinations.length - 1 && validRoutes.length < maxRoutesNeeded) {
          await delay(1500);
        }
        continue;
      }

      const routeDistanceKm = result.distance / 1000;
      const hasGym = !!fitnessAnchor;

      // Fix 3 (14.08.2026) — Mapbox has no running profile (confirmed;
      // route shape/selection correctly stays identical between walking and
      // running), so `result.duration` is always walking-paced. Recompute
      // for running from the route's real distance at the drawer's own
      // running pace (SPEED_KMH.running) instead of showing Mapbox's
      // ~2×-too-long walking estimate. Walking and cycling are BYTE-
      // IDENTICAL — still Mapbox's own duration, exactly as before.
      const durationMinutes = activity === 'running'
        ? Math.round((routeDistanceKm / SPEED_KMH.running) * 60)
        : Math.round(result.duration / 60);
      const calories = Math.round(routeDistanceKm * kcalPerKmFor(activity));

      // Change 3 — strip micro-zig with Ramer–Douglas–Peucker (~4 m). Preserves the
      // overall shape but removes the dense near-collinear wiggle Mapbox emits at
      // overview=full (the "square/boxy" micro-jaggedness). Distance/duration stay
      // from Mapbox — do NOT recompute them from the simplified path.
      const cleanPath = rdpSimplify(result.path, 4);

      const route: Route = {
        id: `gen-${Date.now()}-${i}-${routeGenerationIndex}`,
        name: hasGym ? 'סיבוב כושר' : 'סיבוב אורבני',
        description: `מסלול מעגלי של ${routeDistanceKm.toFixed(1)} ק"מ`,
        distance: parseFloat(routeDistanceKm.toFixed(1)),
        duration: durationMinutes,
        score: Math.round(combination.score + (routeDistanceKm * 10)),
        type: activity,
        activityType: activity,
        difficulty: 'easy',
        path: cleanPath,
        segments: [],
        rating: 4.5 + (Math.random() * 0.5),
        calories: calories,
        analytics: { usageCount: 0, rating: 0, heatMapScore: 0 },
        source: { type: 'system', name: 'OutRun AI' },
        features: {
          hasGym: hasGym,
          hasBenches: true,
          scenic: combination.score > 70,
          lit: true,
          terrain: 'road',
          environment: 'urban',
          trafficLoad: 'low',
          surface: preferences.surface === 'trail' ? 'dirt' : 'asphalt'
        },
        calculatedScore: combination.score,
        distanceFromUser: 0,
        isReachableWithoutCar: true,
        includesOfficialSegments: false,
        visitingParkId: fitnessAnchor?.id || null,
        includesFitnessStop: hasGym
      };

      if (routeDistanceKm >= acceptWindow.minKm && routeDistanceKm <= acceptWindow.maxKm) {
        validRoutes.push(route);
        console.log(`[RouteGenerator] ✅ Route ${i} VALID! (${cleanPath.length} points, ${routeDistanceKm.toFixed(1)}km, ${csMode})`);
      } else {
        console.warn(
          `[RouteGenerator] Route ${i} REJECTED: distance ${routeDistanceKm.toFixed(
            1,
          )}km outside allowed range [${acceptWindow.minKm.toFixed(1)}–${acceptWindow.maxKm.toFixed(
            1,
          )}]km (target ${safeDistance.toFixed(1)}km)`,
        );

        if (nearMissWindow && isBetterNearMissCandidate(routeDistanceKm, safeDistance, nearMissWindow, bestNearMissDelta)) {
          bestNearMiss = route;
          bestNearMissDelta = Math.abs(routeDistanceKm - safeDistance);
        }

        // ✅ Wait before next attempt to avoid 429
        if (i < combinations.length - 1 && validRoutes.length < maxRoutesNeeded) {
          await delay(1500);
        }
        continue;
      }

    } catch (err: any) {
      console.error(`[RouteGenerator] Error on route ${i}:`, err?.message || err);
    }

    // ✅ CRITICAL: 1.5 second delay at the END of each iteration (except last or when we have enough routes)
    if (i < combinations.length - 1 && validRoutes.length < maxRoutesNeeded) {
      console.log('[RouteGenerator] Waiting 1.5s before next API call...');
      await delay(1500);
    }
  }

  console.log(`[RouteGenerator] Finished. Generated ${validRoutes.length} valid routes.`);
  return { validRoutes, bestNearMiss };
}

async function generateLoopRoutes(
  options: RouteGenerationOptions,
  loopOpts: { shortMode?: boolean } = {},
): Promise<Route[]> {
  const {
    userLocation,
    targetDistance,
    activity,
    routeGenerationIndex,
    preferences,
    parks,
    cityName,
    activeOfficialRouteId,
  } = options;

  const rawDistance = typeof targetDistance === 'number' && !isNaN(targetDistance) ? targetDistance : 3;
  let safeDistance: number;
  if (loopOpts.shortMode) {
    safeDistance = Math.max(rawDistance, MIN_SHORT_TARGET_KM);
  } else {
    // Mapbox Directions returns disappointingly few path points for very short
    // routes (~1km loops can come back with 10–30 points), which then fail the
    // MIN_PATH_POINTS guard below and the user sees an empty card list. Clamp
    // the target up to 1.5km so the loop is always long enough to densify the
    // returned polyline. The user-facing duration/calorie target stays as the
    // user picked it — we only inflate the *generation* distance, not the
    // workout goal.
    safeDistance = Math.max(rawDistance, MIN_GENERATION_KM);
    if (safeDistance !== rawDistance) {
      console.log(`[RouteGenerator] Bumping target ${rawDistance.toFixed(2)}km → ${safeDistance.toFixed(2)}km (below MIN_GENERATION_KM)`);
    }
  }
  console.log(`[RouteGenerator] Starting generation. Target: ${safeDistance.toFixed(1)}km, Activity: ${activity}, City: ${cityName ?? '(none)'}${loopOpts.shortMode ? ' [short-route mode]' : ''}`);

  // 1. Find fitness anchor if needed
  const fitnessAnchor = preferences.includeStrength
    ? await findFitnessAnchor(userLocation, safeDistance, parks)
    : null;

  // 2. Fetch waypoint candidates — prefer proximity-bounded street_segments
  //    (if enabled), fall back to citywide-by-score, fall back to random.
  let rawCandidates: Array<{ lat: number; lng: number; isOfficial: boolean }> | null = null;
  if (cityName) {
    if (IS_PROXIMITY_SEGMENT_QUERY_ENABLED) {
      rawCandidates = await fetchScoredWaypointsByProximity(
        cityName,
        userLocation,
        safeDistance,
        activeOfficialRouteId,
      );
    }
    if (!rawCandidates) {
      rawCandidates = await fetchScoredWaypoints(
        cityName,
        userLocation,
        safeDistance,
        activeOfficialRouteId,
      );
    }
  } else {
    // Record the no-city case so the dev banner can suggest "we never even
    // tried — useUserCityName returned undefined". Different remediation
    // path than "we tried and the collection was empty".
    setDiagnostics({
      cityNameUsed: undefined,
      cityNameRaw: undefined,
      source: 'random_fallback_no_city',
      segmentsFetched: 0,
      segmentsInRadius: 0,
    });
  }

  const candidateWaypoints: Array<{ lat: number; lng: number; isOfficial?: boolean }> = rawCandidates ?? generateRandomWaypoints(
    userLocation,
    safeDistance,
    15, // More candidates for variety
    routeGenerationIndex
  );

  const scoredWaypoints = candidateWaypoints.map(wp =>
    scoreWaypoint(wp, userLocation, parks, {
      ...preferences,
      proportionalDistanceTiers: loopOpts.shortMode,
      preferOfficialRoutes: loopOpts.shortMode,
    })
  );

  // Angularly-diverse selection (08.08 fix), not just top-12-by-score — see
  // selectAngularlyDiverseCandidates' doc comment. Sorted by bearing, so
  // array-index-adjacency below corresponds to angular adjacency.
  const topCandidates = selectAngularlyDiverseCandidates(
    scoredWaypoints,
    userLocation,
    12,
    preferences.idealWaypointDistanceKm ?? 1.0,
    { proportionalGap: loopOpts.shortMode },
  );

  // 3. Create route combinations (triangular loops)
  // The starting offset is rotated by `routeGenerationIndex` so every shuffle /
  // carousel mount picks a different triangle from the top-12 pool — this is the
  // primary variety lever when street_segments are present and the soft-shuffle
  // alone isn't enough to move waypoints across combination boundaries.
  const baseOffset = topCandidates.length > 0
    ? routeGenerationIndex % topCandidates.length
    : 0;
  const routeCombinations = buildTriangleCombinations(topCandidates, baseOffset);

  // Default 3 (free-run carousel shows three cards); hybrid passes maxRoutes:1
  // since it only uses routes[0]. Lowering the target makes the loop break right
  // after the first valid route — before the trailing delay(1500) below.
  const MIN_REQUIRED_ROUTES = Math.max(1, preferences.maxRoutes ?? 3);
  // Adaptive minimum: short loops genuinely return fewer points from Mapbox
  // even when they're geometrically valid (a 1.2km loop with 6 turns can be
  // ~30 points and still be a real walk). Loosen the bar for short targets,
  // keep the strict 50 for anything 2km+ where straight-line shortcuts would
  // really stand out as broken routes. Short-route mode uses its own,
  // looser, separately-calibrated floor (see MIN_PATH_POINTS_SHORT).
  const MIN_PATH_POINTS = loopOpts.shortMode
    ? MIN_PATH_POINTS_SHORT
    : (safeDistance < 2 ? 30 : 50);

  const primaryWindow = loopOpts.shortMode
    ? computeShortRouteDistanceWindow(safeDistance)
    : IS_TIGHTENED_DISTANCE_WINDOW_ENABLED
      ? computeTightenedDistanceWindow(safeDistance)
      : computeDistanceWindow(safeDistance);

  // IS_GUARANTEED_ROUTE_FALLBACK_ENABLED only ever backstops the tightened
  // window specifically — short-route mode has its own, separately-tuned
  // ladder (generateShortRoutes), and when the tight-window flag is off,
  // the "loose" bound IS already the primary window, so there is nothing
  // for a same-bound near-miss pass to find that the primary check didn't.
  const guaranteedFallbackActive =
    IS_GUARANTEED_ROUTE_FALLBACK_ENABLED && !loopOpts.shortMode && IS_TIGHTENED_DISTANCE_WINDOW_ENABLED;

  const commonAttemptParams = {
    userLocation,
    activity,
    preferences,
    fitnessAnchor,
    routeGenerationIndex,
    safeDistance,
    minPathPoints: MIN_PATH_POINTS,
    maxRoutesNeeded: MIN_REQUIRED_ROUTES,
  };

  // 4. Main pass — unchanged behavior when the flag is off: single window,
  //    no near-miss tracking, returns exactly what it always has.
  const mainPass = await attemptRouteCombinations(routeCombinations, {
    ...commonAttemptParams,
    acceptWindow: primaryWindow,
    nearMissWindow: guaranteedFallbackActive ? computeDistanceWindow(safeDistance) : undefined,
  });

  let validRoutes = mainPass.validRoutes;

  if (validRoutes.length === 0 && guaranteedFallbackActive) {
    if (mainPass.bestNearMiss) {
      // Tier 1 — a real, already-computed route existed within
      // computeDistanceWindow (today's pre-tightening bound); the tight
      // window just discarded it. Use it instead of returning empty.
      validRoutes = [mainPass.bestNearMiss];
      console.log(
        `[RouteGenerator] Guaranteed fallback: Tier 1 near-miss used ` +
          `(${mainPass.bestNearMiss.distance}km vs target ${safeDistance.toFixed(1)}km).`,
      );
      const prevDiag = getLastGenerationDiagnostics();
      if (prevDiag) setDiagnostics({ ...prevDiag, guaranteedFallbackTier: 'tier1_near_miss' });
    } else if (cityName) {
      // Tier 2 — Tier 1 found nothing either (every combination failed the
      // point-count guard or errored, not just the window check). Re-fetch
      // with a wider radius / lower score floor and try once more, checked
      // only against computeDistanceWindow (no third window invented).
      console.log('[RouteGenerator] Guaranteed fallback: Tier 1 empty, attempting Tier 2 relaxed re-fetch...');
      const relaxedCandidates = await fetchScoredWaypointsByProximity(
        cityName,
        userLocation,
        safeDistance,
        activeOfficialRouteId,
        { radiusMultiplier: TIER2_RADIUS_MULTIPLIER, minScore: TIER2_MIN_SCORE },
      );

      if (relaxedCandidates && relaxedCandidates.length > 0) {
        const relaxedScored = relaxedCandidates.map(wp =>
          scoreWaypoint(wp, userLocation, parks, {
            ...preferences,
            proportionalDistanceTiers: loopOpts.shortMode,
            preferOfficialRoutes: loopOpts.shortMode,
          })
        );
        const relaxedTop = selectAngularlyDiverseCandidates(
          relaxedScored,
          userLocation,
          12,
          preferences.idealWaypointDistanceKm ?? 1.0,
          { proportionalGap: loopOpts.shortMode },
        );
        const relaxedBaseOffset = relaxedTop.length > 0 ? routeGenerationIndex % relaxedTop.length : 0;
        const relaxedCombinations = buildTriangleCombinations(relaxedTop, relaxedBaseOffset);

        const tier2Pass = await attemptRouteCombinations(relaxedCombinations, {
          ...commonAttemptParams,
          acceptWindow: computeDistanceWindow(safeDistance),
        });

        if (tier2Pass.validRoutes.length > 0) {
          validRoutes = tier2Pass.validRoutes;
          console.log(`[RouteGenerator] Guaranteed fallback: Tier 2 relaxed re-fetch found ${validRoutes.length} route(s).`);
          const prevDiag = getLastGenerationDiagnostics();
          if (prevDiag) setDiagnostics({ ...prevDiag, guaranteedFallbackTier: 'tier2_relaxed_refetch' });
        } else {
          console.log('[RouteGenerator] Guaranteed fallback: Tier 2 also found nothing — returning empty (genuine data sparsity).');
        }
      } else {
        console.log('[RouteGenerator] Guaranteed fallback: Tier 2 relaxed re-fetch returned no candidates — returning empty (genuine data sparsity).');
      }
    }
  }

  return validRoutes;
}

// ── Short-route mode (loop-preferred, out-and-back fallback) ──────────────
//
// Design principle (locked in with the plan): short-route generation stays a
// CONDITION inside the ONE shared scoring pipeline — never a parallel
// implementation. Both branches below call the exact same
// fetchScoredWaypoints / scoreWaypoint / selectAngularlyDiverseCandidates
// used by loop mode. Any future scoring change (rating, difficulty,
// route-type preference) is added ONCE to scoreWaypoint and every shape
// (loop / short-loop / out-and-back / commute) inherits it automatically.

/**
 * Short-route dispatcher: try a short LOOP first (reusing generateLoopRoutes
 * in short-target mode), fall back to an OUT-AND-BACK shape only if the loop
 * attempt produces zero routes. A per-request decision, not a static shape
 * choice — sidesteps having to predict in advance whether a given area has
 * enough real street candidates for a clean short loop.
 */
async function generateShortRoutes(options: RouteGenerationOptions): Promise<Route[]> {
  const loopRoutes = await generateLoopRoutes(options, { shortMode: true });
  if (loopRoutes.length > 0) {
    console.log(`[RouteGenerator] Short-route: loop succeeded (${loopRoutes.length} route(s)).`);
    return loopRoutes;
  }
  console.log('[RouteGenerator] Short-route: loop attempt produced 0 routes — falling back to out-and-back.');
  const outAndBackRoutes = await generateOutAndBackRoutes(options);
  if (outAndBackRoutes.length > 0) {
    console.log(`[RouteGenerator] Short-route: out-and-back succeeded (${outAndBackRoutes.length} route(s)).`);
    return outAndBackRoutes;
  }
  // Both short-route attempts failed (extreme thin street_segments coverage —
  // not enough real candidates near the tiny ideal radius for either shape).
  // Final fallback: the standard floored loop (today's known-safe behavior,
  // shortMode omitted). A route that's longer than the push promised beats
  // an empty "no route" screen after the user tapped a notification.
  console.log('[RouteGenerator] Short-route: out-and-back also produced 0 routes — falling back to the standard floored loop so the user never sees an empty screen after a push tap.');
  return generateLoopRoutes(options);
}

/**
 * Out-and-back fallback for short-route mode. Reuses the SAME
 * scoring/selection pipeline as the loop (idealWaypointDistanceKm =
 * safeDistance/2, since the turnaround sits at half the round-trip
 * distance), but calls Mapbox for a plain ONE-WAY leg per candidate (no
 * waypoints, no `continue_straight` — a U-turn at the turnaround is exactly
 * what an out-and-back wants) and synthesises the return leg deterministically
 * via `buildOutAndBackPath()` (geoUtils.ts) — no second Mapbox call, no
 * sparse-polyline risk on the return leg at all.
 */
async function generateOutAndBackRoutes(options: RouteGenerationOptions): Promise<Route[]> {
  const {
    userLocation,
    targetDistance,
    activity,
    routeGenerationIndex,
    preferences,
    parks,
    cityName,
    activeOfficialRouteId,
  } = options;

  const rawDistance = typeof targetDistance === 'number' && !isNaN(targetDistance) ? targetDistance : 3;
  const safeDistance = Math.max(rawDistance, MIN_SHORT_TARGET_KM);
  // Turnaround sits at half the round-trip distance.
  const idealWaypointDistanceKm = safeDistance / 2;

  console.log(`[RouteGenerator] Out-and-back: target ${safeDistance.toFixed(2)}km round-trip, ideal turnaround ${idealWaypointDistanceKm.toFixed(2)}km.`);

  let rawCandidates: Array<{ lat: number; lng: number; isOfficial: boolean }> | null = null;
  if (cityName) {
    if (IS_PROXIMITY_SEGMENT_QUERY_ENABLED) {
      rawCandidates = await fetchScoredWaypointsByProximity(cityName, userLocation, safeDistance, activeOfficialRouteId);
    }
    if (!rawCandidates) {
      rawCandidates = await fetchScoredWaypoints(cityName, userLocation, safeDistance, activeOfficialRouteId);
    }
  }
  const candidateWaypoints: Array<{ lat: number; lng: number; isOfficial?: boolean }> = rawCandidates ?? generateRandomWaypoints(
    userLocation,
    safeDistance,
    15,
    routeGenerationIndex,
  );

  const scoredWaypoints = candidateWaypoints.map(wp =>
    scoreWaypoint(wp, userLocation, parks, {
      ...preferences,
      idealWaypointDistanceKm,
      proportionalDistanceTiers: true,
      preferOfficialRoutes: true,
    }),
  );

  const MIN_REQUIRED_ROUTES = Math.max(1, preferences.maxRoutes ?? 3);
  // A few extra candidates beyond MIN_REQUIRED_ROUTES so a rejected leg
  // (sparse Mapbox points or an out-of-window distance) doesn't starve the
  // carousel down to fewer than 3 cards.
  const topCandidates = selectAngularlyDiverseCandidates(
    scoredWaypoints,
    userLocation,
    Math.max(MIN_REQUIRED_ROUTES, 6),
    idealWaypointDistanceKm,
    { proportionalGap: true },
  );

  const validRoutes: Route[] = [];
  const profile = activity === 'cycling' ? 'cycling' : 'walking';

  for (let i = 0; i < topCandidates.length; i++) {
    if (validRoutes.length >= MIN_REQUIRED_ROUTES) {
      console.log(`[RouteGenerator] Out-and-back: got ${MIN_REQUIRED_ROUTES} routes, stopping.`);
      break;
    }
    const candidate = topCandidates[i];

    try {
      // One-way leg only — no waypoints, no continue_straight (a U-turn at
      // the turnaround is exactly what an out-and-back wants).
      const result = await MapboxService.getSmartPath(
        userLocation,
        { lat: candidate.lat, lng: candidate.lng },
        profile,
        [],
      );

      if (!result || !result.path || result.path.length < MIN_PATH_POINTS_ONE_WAY) {
        console.warn(`[RouteGenerator] Out-and-back leg ${i} REJECTED: only ${result?.path?.length || 0} points (need ${MIN_PATH_POINTS_ONE_WAY}+)`);
        if (i < topCandidates.length - 1 && validRoutes.length < MIN_REQUIRED_ROUTES) await delay(1500);
        continue;
      }

      const routeDistanceKm = (result.distance / 1000) * 2; // round trip
      const { minKm, maxKm } = computeShortRouteDistanceWindow(safeDistance);
      if (routeDistanceKm < minKm || routeDistanceKm > maxKm) {
        console.warn(
          `[RouteGenerator] Out-and-back leg ${i} REJECTED: round-trip ${routeDistanceKm.toFixed(2)}km outside ` +
            `[${minKm.toFixed(2)}–${maxKm.toFixed(2)}]km (target ${safeDistance.toFixed(2)}km)`,
        );
        if (i < topCandidates.length - 1 && validRoutes.length < MIN_REQUIRED_ROUTES) await delay(1500);
        continue;
      }

      // Fix 3 (14.08.2026) — same running-pace recompute as the loop
      // generator; see its comment. routeDistanceKm here is already the
      // round-trip distance, so no extra ×2 is needed on this side.
      const durationMinutes = activity === 'running'
        ? Math.round((routeDistanceKm / SPEED_KMH.running) * 60)
        : Math.round((result.duration * 2) / 60); // round trip
      const calories = Math.round(routeDistanceKm * kcalPerKmFor(activity));
      const mirroredPath = buildOutAndBackPath(result.path);
      const cleanPath = rdpSimplify(mirroredPath, 4);

      const route: Route = {
        id: `gen-oab-${Date.now()}-${i}-${routeGenerationIndex}`,
        name: 'הלוך ושוב',
        description: `מסלול הלוך-ושוב של ${routeDistanceKm.toFixed(1)} ק"מ`,
        distance: parseFloat(routeDistanceKm.toFixed(1)),
        duration: durationMinutes,
        score: Math.round(candidate.score + routeDistanceKm * 10),
        type: activity,
        activityType: activity,
        difficulty: 'easy',
        path: cleanPath,
        segments: [],
        rating: 4.5 + Math.random() * 0.5,
        calories,
        analytics: { usageCount: 0, rating: 0, heatMapScore: 0 },
        source: { type: 'system', name: 'OutRun AI' },
        features: {
          hasGym: false,
          hasBenches: true,
          scenic: candidate.score > 70,
          lit: true,
          terrain: 'road',
          environment: 'urban',
          trafficLoad: 'low',
          surface: preferences.surface === 'trail' ? 'dirt' : 'asphalt',
        },
        calculatedScore: candidate.score,
        distanceFromUser: 0,
        isReachableWithoutCar: true,
        includesOfficialSegments: false,
        visitingParkId: null,
        includesFitnessStop: false,
      };

      validRoutes.push(route);
      console.log(`[RouteGenerator] ✅ Out-and-back ${i} VALID! (${cleanPath.length} points, ${routeDistanceKm.toFixed(1)}km)`);
    } catch (err: any) {
      console.error(`[RouteGenerator] Error on out-and-back leg ${i}:`, err?.message || err);
    }

    if (i < topCandidates.length - 1 && validRoutes.length < MIN_REQUIRED_ROUTES) {
      await delay(1500);
    }
  }

  console.log(`[RouteGenerator] Out-and-back finished. Generated ${validRoutes.length} valid route(s).`);
  return validRoutes;
}

// ── Commute (A-to-B) branch ────────────────────────────────────────────────
//
// Kept in this module (rather than a sibling commute-route.service) so the
// public contract stays "one entry point, one return type" — callers don't
// need to know which branch fires. The shared `Route` shape means the same
// downstream pipeline (MapShell, AppMap polyline rendering, RouteCarousel
// card UX) handles both modes without conditional code paths.

/**
 * Build a commute Route from a Mapbox path result and a variant tag.
 * Mirrors the field set used by the loop branch so downstream consumers
 * (carousel cards, map polyline renderer, workout starter) see a
 * homogeneous Route — the only difference is the optional `variant` and
 * `etaSeconds` metadata that flips on the variant chip in the UI.
 */
function buildCommuteRoute(
  result: MapboxPathResult,
  variant: CommuteVariant,
  activity: ActivityType,
  destination: { lat: number; lng: number },
  index: number,
): Route {
  const km = parseFloat((result.distance / 1000).toFixed(2));
  // Fix 3 (14.08.2026) — same running-pace recompute as the loop/out-and-back
  // generators; see attemptRouteCombinations' comment. Calories here used to be a
  // THIRD hardcoded value (65, not the other two sites' 70) — now unified
  // onto the one shared, already-correct KCAL_PER_KM table.
  const durationMin = activity === 'running'
    ? Math.max(1, Math.round((km / SPEED_KMH.running) * 60))
    : Math.max(1, Math.round(result.duration / 60));
  const calories = Math.round(km * kcalPerKmFor(activity));

  // Variant-specific name. Kept short so it fits the existing RouteCard
  // title row without truncating; the chip badge carries the secondary
  // semantic ("הכי מהיר" etc).
  const nameByVariant: Record<CommuteVariant, string> = {
    fastest: 'הכי מהיר',
    alternative: 'מסלול חלופי',
    quiet: 'רחובות שקטים',
  };

  return {
    id: `commute-${variant}-${Date.now()}-${index}`,
    name: nameByVariant[variant],
    description: `ניווט ${activity === 'running' ? 'בריצה' : activity === 'cycling' ? 'באופניים' : 'בהליכה'} (${km.toFixed(1)} ק"מ)`,
    distance: km,
    duration: durationMin,
    score: Math.round(km * 60),
    rating: 5,
    calories,
    type: activity,
    activityType: activity,
    difficulty: 'easy',
    path: result.path,
    segments: [],
    features: {
      hasGym: false,
      hasBenches: false,
      lit: true,
      // `scenic` is a legacy boolean on RouteFeatures; commute mode is
      // practical-only (no greenery semantics) so we always set false.
      // The variant chip — not this field — is what the UI surfaces.
      scenic: false,
      terrain: 'road',
      environment: 'urban',
      trafficLoad: variant === 'quiet' ? 'low' : 'medium',
      surface: 'asphalt',
    },
    source: { type: 'system', name: 'OutRun Commute' },
    variant,
    etaSeconds: result.duration,
  };
}

/**
 * Pick the single most "different" alternative from a Mapbox alternatives
 * array, given a baseline route. Difference is approximated by symmetric
 * geometry hash distance — counting how many sampled coords differ at the
 * 4-decimal-place truncation level (~11 m grid). Cheap and deterministic.
 *
 * Returns null when there is no usable second route (single result, or
 * every alternative is geometrically identical to the baseline).
 */
function pickMostDifferent(
  alternatives: MapboxPathResult[],
  baseline: MapboxPathResult,
): MapboxPathResult | null {
  if (alternatives.length <= 1) return null;
  const baselineKey = (p: [number, number]) => `${p[0].toFixed(4)},${p[1].toFixed(4)}`;
  const baselineSet = new Set(baseline.path.map(baselineKey));

  let best: { result: MapboxPathResult; diff: number } | null = null;
  for (const alt of alternatives) {
    if (alt === baseline) continue;
    let diff = 0;
    for (const pt of alt.path) {
      if (!baselineSet.has(baselineKey(pt))) diff += 1;
    }
    if (!best || diff > best.diff) best = { result: alt, diff };
  }
  // Treat "essentially identical" alternatives as no alternative at all
  // so the carousel falls back to a 2-card display rather than showing a
  // duplicate. 5 distinct grid cells (~55 m of fresh geometry) is the
  // empirical threshold below which the polylines visually overlap.
  if (!best || best.diff < 5) return null;
  return best.result;
}

async function generateCommuteRoutes(
  options: RouteGenerationOptions,
): Promise<Route[]> {
  const { userLocation, destination, activity } = options;
  if (!destination) return []; // narrowing — caller already checked, defensive

  // Mapbox profile choice. The `walking` profile is also used for
  // running because Mapbox doesn't have a dedicated runner profile and
  // the road/path graph is identical.
  const profile: 'walking' | 'cycling' = activity === 'cycling' ? 'cycling' : 'walking';

  console.log(
    `[RouteGenerator] Commute mode → ${activity}/${profile}, ` +
      `from ${userLocation.lat.toFixed(4)},${userLocation.lng.toFixed(4)} ` +
      `to ${destination.lat.toFixed(4)},${destination.lng.toFixed(4)}`,
  );

  // Single Directions call — `alternatives=true` already returns up to 3
  // geometries in one round-trip, which is all we need for fastest + alternative.
  //
  // We intentionally do NOT make a dedicated `exclude=motorway` "quiet" call:
  // `exclude` values are profile-specific, and `motorway` is a driving-only road
  // class — the walking/cycling profiles reject it with "exclude value must be
  // one of…" (a 400 logged as an API Error). It is also semantically pointless:
  // pedestrians and cyclists are never routed onto a motorway to begin with. The
  // "quiet" variant is instead derived from the longest alternative below.
  // withCancelPrevious: RouteCarousel's own `cancelled` flag (its effect,
  // not here) already discards a stale RESULT, but the Directions fetch
  // itself kept running on the wire regardless — a real destination change
  // now actually aborts the old request instead of just ignoring its answer.
  const alternatives = await withCancelPrevious('commute-directions', (signal) =>
    MapboxService.getSmartPathAlternatives(
      userLocation,
      destination,
      profile,
      [],
      {},
      { signal },
    ),
  );
  const quietRaw: MapboxPathResult | null = null;

  if (alternatives.length === 0) {
    console.warn('[RouteGenerator] Commute: no alternatives returned by Mapbox.');
    return [];
  }

  // Mapbox returns alternatives sorted by duration ascending, so [0] is
  // the fastest by definition. Defensive sort in case the API ever
  // changes (cheap — array length ≤ 3).
  const sortedByDuration = [...alternatives].sort((a, b) => a.duration - b.duration);
  const fastest = sortedByDuration[0];
  const alternative = pickMostDifferent(sortedByDuration, fastest);

  // Quiet preference: derived from the LONGEST-duration alternative as a cheap
  // proxy ("longer routes tend to use back-streets to avoid busy roads").
  // Skip it if it would be the same polyline as fastest or the alternative —
  // better to omit the third card than show a visually-identical duplicate.
  // (quietRaw is always null now — the invalid exclude call was removed above.)
  let quiet: MapboxPathResult | null = quietRaw;
  if (!quiet && sortedByDuration.length >= 2) {
    const longest = sortedByDuration[sortedByDuration.length - 1];
    if (longest !== fastest && longest !== alternative) {
      quiet = longest;
    }
  }

  const out: Route[] = [];
  out.push(buildCommuteRoute(fastest, 'fastest', activity, destination, 0));
  if (alternative) {
    out.push(buildCommuteRoute(alternative, 'alternative', activity, destination, 1));
  }
  if (quiet) {
    out.push(buildCommuteRoute(quiet, 'quiet', activity, destination, 2));
  }

  console.log(
    `[RouteGenerator] Commute: returning ${out.length} variants ` +
      `(${out.map(r => r.variant).join(', ')}).`,
  );
  return out;
}
