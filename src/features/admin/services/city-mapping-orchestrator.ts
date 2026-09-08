/**
 * src/features/admin/services/city-mapping-orchestrator.ts — Phase 1 Stage B
 * of the city-orchestrator plan (CITY-ORCHESTRATOR-PLAN.md, "LOCKED DESIGN"
 * section). Client-side sequential orchestrator for `runCityMapping()`,
 * mirroring `demo-seed-sderot.ts`'s `runSderotDemoSeed(progress, authorityId)`
 * shape exactly: named steps, a `ProgressUpdate{step,status,message,count}`
 * callback into React state, no server-side job/queue.
 *
 * Per-step invocation (locked in the plan doc):
 *   1. authorityPreflight — read-only, findAuthorityByCityName (NEW, Stage B
 *      addition — see below)
 *   2. routesGate — manual-gate verify-only read of official_routes count
 *      (route DISCOVERY itself stays a CLI command the operator runs by hand
 *      — LOCKED DECISION 1, refactoring geo-discovery-routes.ts into an
 *      importable function is out of scope for v1)
 *   3. streetSegments — direct client call to runOsmImport(), already
 *      client-callable (proven at /admin/segments)
 *   4. lighting — thin API route wrapping runBackfillRouteLighting()
 *   5. amenitiesIngest — thin API route wrapping runExtractOsmAmenities()
 *   6. amenitiesTagging — thin API route wrapping runTagRouteAmenities()
 *   7. adjacencyVerify — pure read of route_adjacency count. LOCKED DECISION
 *      3: verify-only, no retrigger — `InventoryService.approveRoute` already
 *      fires `recomputeAdjacencyForCities` automatically on approval, proven
 *      empirically in production (Haifa, 01-02.09.2026 pilot). This step
 *      exists only so the run's end-of-sequence report shows the REAL
 *      Firestore state, not a step's self-reported "done" — see LOCKED
 *      DECISION 2.
 *
 * SINGLE CANONICAL CITY-STRING (Stage B addition, 02.09.2026 — not in the
 * original design sketch): `RunCityMappingOptions.city` is the ONLY
 * city-name input this whole orchestrator accepts, and every step below is
 * called with exactly that same string — no step reads or accepts a
 * separately-supplied city arg of its own. This guards against the
 * "two-spelling" silent-0-docs failure class this codebase already hit once
 * (Tel Aviv's "תל אביב-יפו" vs OSM's own "תל־אביב–יפו" maqaf/en-dash variant
 * — see extract-osm-amenities-tlv.ts's header comment): if each step took
 * its own city argument, an operator (or a future UI) could pass a slightly
 * different spelling to one step than its neighbors and that step would
 * silently process 0 docs, no error. Enforcing a single parameter, used
 * everywhere, makes that class of bug structurally impossible rather than a
 * discipline the caller has to remember. Stage C's admin UI (not yet built)
 * must pick the city ONCE from the city_registrations/REGIONS registry and
 * never let the operator retype or re-select it per step.
 *
 * "Everything lands pending" (plan principle 1) needs zero extra logic here
 * — every underlying pipeline already defaults to `status:'pending'`/
 * `published:false` on its own. This orchestrator's last step is explicitly
 * NOT "publish" — the sequence stops after amenitiesTagging, and adjacency
 * is read-only. The Approval Center remains the one and only publish gate.
 *
 * Honesty on partial failure (plan principle 3): a step's failure does NOT
 * silently skip to the next one — later steps have real data dependencies
 * on earlier ones (amenities tagging needs official_routes to exist;
 * adjacency needs published routes). `runCityMapping` returns immediately
 * with `success:false` and the real error message the moment any step
 * fails, exactly mirroring `SeedResult.errors: string[]`'s existing shape.
 */
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { findAuthorityByCityName } from '@/lib/route-collections/authority-resolution';
import { runOsmImport } from './osm-segment-importer';

export type CityMappingStepName =
  | 'authorityPreflight'
  | 'routesGate'
  | 'streetSegments'
  | 'lighting'
  | 'amenitiesIngest'
  | 'amenitiesTagging'
  | 'adjacencyVerify';

export interface CityMappingProgressUpdate {
  step: CityMappingStepName;
  status: 'running' | 'done' | 'error';
  message: string;
  count?: number;
}

export type CityMappingProgressFn = (update: CityMappingProgressUpdate) => void;

interface LightingChunkApiResponse {
  done: boolean;
  cursor: string | null;
  chunkSize: number;
  routesProcessedThisChunk: number;
  totalRoutesInCity: number;
  litCount: number;
  unlitCount: number;
  unknownCount: number;
  writesApplied: number;
}

export interface CityMappingResult {
  success: boolean;
  authorityId: string | null;
  counts: Partial<Record<CityMappingStepName, number>>;
  errors: string[];
}

export interface RunCityMappingOptions {
  /** The ONE canonical city-name input — see the file header comment. */
  city: string;
  /** Extraction bbox for street_segments + amenities, lat/lon min/max —
   *  same convention as city_registrations.bbox / geo-discovery-routes.ts's
   *  Region.bbox (NOT osm-segment-importer's own {south,west,north,east},
   *  which this module converts to internally for the streetSegments call). */
  bbox: { latMin: number; lonMin: number; latMax: number; lonMax: number };
  /** OSM admin_level=8 relation id, for the amenities boundary-clip step. */
  adminRelationId: number;
  /** Real writes when true. False threads apply:false/commit:false into
   *  every underlying step — proven explicitly by the Stage B test harness. */
  apply: boolean;
  /** Forwarded as X-Agent-Key to the 3 thin API routes below (server-side
   *  calls need their own auth even though the browser session is already
   *  admin-authenticated) — omit to rely on the browser's own admin session
   *  cookie instead (requireSuperAdminApi accepts either). */
  agentKey?: string;
  /** Overridable for the headless test harness (defaults to same-origin). */
  apiBaseUrl?: string;
}

async function callCityMappingApi<T>(
  path: string,
  body: Record<string, unknown>,
  opts: RunCityMappingOptions,
): Promise<T> {
  const res = await fetch(`${opts.apiBaseUrl ?? ''}/api/admin/city-mapping/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(opts.agentKey ? { 'X-Agent-Key': opts.agentKey } : {}),
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string })?.error ?? `${path} failed (HTTP ${res.status})`);
  return json as T;
}

export async function runCityMapping(
  progress: CityMappingProgressFn,
  opts: RunCityMappingOptions,
): Promise<CityMappingResult> {
  const CITY = opts.city;
  const counts: Partial<Record<CityMappingStepName, number>> = {};

  // ── Step 1: authority-resolution preflight (Stage B addition 1) ──
  // Read-only. Fails loudly here, before any pipeline step runs, instead of
  // silently processing 0 docs three steps in against an authority that
  // doesn't resolve.
  progress({ step: 'authorityPreflight', status: 'running', message: `Resolving authority for "${CITY}"...` });
  let authorityId: string | null;
  try {
    const authoritySnap = await getDocs(collection(db, 'authorities'));
    const authorities = authoritySnap.docs.map((d) => ({
      id: d.id,
      name: (d.data().label as string) ?? (d.data().name as string) ?? '',
    }));
    authorityId = findAuthorityByCityName(CITY, authorities);
    if (!authorityId) {
      const msg = `No authority resolves for "${CITY}" — create one before running amenity steps.`;
      progress({ step: 'authorityPreflight', status: 'error', message: msg });
      return { success: false, authorityId: null, counts, errors: [msg] };
    }
    progress({ step: 'authorityPreflight', status: 'done', message: `Resolved authorityId ${authorityId}.`, count: 1 });
  } catch (err) {
    const msg = (err as Error).message ?? 'Authority preflight failed.';
    progress({ step: 'authorityPreflight', status: 'error', message: msg });
    return { success: false, authorityId: null, counts, errors: [msg] };
  }

  // ── Step 2: routes discovery — manual gate, verify-only ──
  progress({ step: 'routesGate', status: 'running', message: `Checking official_routes for "${CITY}"...` });
  try {
    const routesSnap = await getDocs(query(collection(db, 'official_routes'), where('city', '==', CITY)));
    counts.routesGate = routesSnap.size;
    if (routesSnap.size === 0) {
      const msg = `0 official_routes found for "${CITY}". Run the discovery CLI first: npx tsx scripts/geo-discovery-routes.ts --region=<key>${opts.apply ? ' --apply' : ''}, then re-run this step.`;
      progress({ step: 'routesGate', status: 'error', message: msg });
      return { success: false, authorityId, counts, errors: [msg] };
    }
    progress({ step: 'routesGate', status: 'done', message: `${routesSnap.size} route(s) found.`, count: routesSnap.size });
  } catch (err) {
    const msg = (err as Error).message ?? 'routesGate check failed.';
    progress({ step: 'routesGate', status: 'error', message: msg });
    return { success: false, authorityId, counts, errors: [msg] };
  }

  // ── Step 3: street_segments — direct client call, already client-callable
  // (same call /admin/segments/page.tsx already makes) ──
  progress({ step: 'streetSegments', status: 'running', message: 'Importing street segments...' });
  try {
    const result = await runOsmImport({
      bbox: { south: opts.bbox.latMin, west: opts.bbox.lonMin, north: opts.bbox.latMax, east: opts.bbox.lonMax },
      cityName: CITY,
      authorityId,
      commit: opts.apply,
    });
    counts.streetSegments = result.committed;
    progress({
      step: 'streetSegments',
      status: 'done',
      message: `${result.committed} segment(s) committed (${result.passedScoreFilter} passed the score filter).`,
      count: result.committed,
    });
  } catch (err) {
    const msg = (err as Error).message ?? 'streetSegments import failed.';
    progress({ step: 'streetSegments', status: 'error', message: msg });
    return { success: false, authorityId, counts, errors: [msg] };
  }

  // ── Step 4: lighting — thin API route wrapping runBackfillRouteLightingChunk() ──
  // CHUNKED (04.09.2026, lighting-step 504 fix): a dense city (Haifa) measured
  // well over the API route's 60s maxDuration even with concurrency-capped
  // queries, so the route now processes one bounded slice of official_routes
  // per call. This loop drives it to completion client-side, passing the
  // cursor back on each call until the response reports done:true — the same
  // shape backfill-route-lighting-haifa.ts's own CLI wrapper uses internally.
  progress({ step: 'lighting', status: 'running', message: 'Backfilling route lighting...' });
  try {
    let cursor: string | null = null;
    let done = false;
    let chunkNum = 0;
    let routesDone = 0;
    let totalRoutesInCity = 0;
    let totalChunks: number | null = null;
    let litCount = 0, unlitCount = 0, unknownCount = 0, writesApplied = 0;

    while (!done) {
      chunkNum++;
      const result: LightingChunkApiResponse = await callCityMappingApi<LightingChunkApiResponse>('lighting', { city: CITY, apply: opts.apply, cursor }, opts);

      totalRoutesInCity = result.totalRoutesInCity;
      totalChunks = totalRoutesInCity > 0 ? Math.max(1, Math.ceil(totalRoutesInCity / result.chunkSize)) : null;
      routesDone += result.routesProcessedThisChunk;
      litCount += result.litCount;
      unlitCount += result.unlitCount;
      unknownCount += result.unknownCount;
      writesApplied += result.writesApplied;
      done = result.done;
      cursor = result.cursor;

      progress({
        step: 'lighting',
        status: 'running',
        message: `chunk ${chunkNum}${totalChunks ? `/${totalChunks}` : ''}, ${routesDone}${totalRoutesInCity ? `/${totalRoutesInCity}` : ''} route(s) done.`,
        count: routesDone,
      });
    }

    counts.lighting = writesApplied;
    progress({
      step: 'lighting',
      status: 'done',
      message: `lit=${litCount} unlit=${unlitCount} unknown=${unknownCount}.`,
      count: writesApplied,
    });
  } catch (err) {
    const msg = (err as Error).message ?? 'lighting step failed.';
    progress({ step: 'lighting', status: 'error', message: msg });
    return { success: false, authorityId, counts, errors: [msg] };
  }

  // ── Step 5: amenities/crossings ingest — thin API route wrapping
  // runExtractOsmAmenities() ──
  progress({ step: 'amenitiesIngest', status: 'running', message: 'Ingesting OSM amenities...' });
  try {
    const result = await callCityMappingApi<{ candidateCount: number; suppressedCount: number; writesApplied: number }>(
      'amenities-ingest',
      { city: CITY, adminRelationId: opts.adminRelationId, apply: opts.apply },
      opts,
    );
    counts.amenitiesIngest = result.writesApplied;
    progress({
      step: 'amenitiesIngest',
      status: 'done',
      message: `${result.candidateCount} candidate(s) found (${result.suppressedCount} suppressed by garden-dedup).`,
      count: result.writesApplied,
    });
  } catch (err) {
    const msg = (err as Error).message ?? 'amenitiesIngest step failed.';
    progress({ step: 'amenitiesIngest', status: 'error', message: msg });
    return { success: false, authorityId, counts, errors: [msg] };
  }

  // ── Step 6: amenities/crossings → route tagging — thin API route wrapping
  // runTagRouteAmenities() ──
  progress({ step: 'amenitiesTagging', status: 'running', message: 'Tagging routes with nearby amenities...' });
  try {
    const result = await callCityMappingApi<{ totalMatches: number; routesWithZeroMatches: number; writesApplied: number }>(
      'amenities-tag',
      { city: CITY, apply: opts.apply },
      opts,
    );
    counts.amenitiesTagging = result.writesApplied;
    progress({
      step: 'amenitiesTagging',
      status: 'done',
      message: `${result.totalMatches} match(es) found across the city's routes.`,
      count: result.writesApplied,
    });
  } catch (err) {
    const msg = (err as Error).message ?? 'amenitiesTagging step failed.';
    progress({ step: 'amenitiesTagging', status: 'error', message: msg });
    return { success: false, authorityId, counts, errors: [msg] };
  }

  // ── Step 7: adjacency — verify-only, no trigger call of any kind (LOCKED
  // DECISION 3). approveRoute already fires recomputeAdjacencyForCities
  // automatically; this step only reports the real Firestore state, per
  // LOCKED DECISION 2 ("a step can report 'done' while the thing it was
  // meant to cause never happened — report the real count, always"). Note
  // the field name here is `cityName`, not `city` — route_adjacency docs use
  // a different key than official_routes (confirmed in
  // inventory.service.ts's recomputeRouteAdjacencyForCity). ──
  progress({ step: 'adjacencyVerify', status: 'running', message: 'Reading route_adjacency count...' });
  try {
    const adjSnap = await getDocs(query(collection(db, 'route_adjacency'), where('cityName', '==', CITY)));
    counts.adjacencyVerify = adjSnap.size;
    progress({
      step: 'adjacencyVerify',
      status: 'done',
      message: `${adjSnap.size} adjacency edge(s) currently exist for "${CITY}" — populates automatically as routes are approved in the Approval Center, no manual trigger needed.`,
      count: adjSnap.size,
    });
  } catch (err) {
    const msg = (err as Error).message ?? 'adjacencyVerify failed.';
    progress({ step: 'adjacencyVerify', status: 'error', message: msg });
    return { success: false, authorityId, counts, errors: [msg] };
  }

  return { success: true, authorityId, counts, errors: [] };
}
