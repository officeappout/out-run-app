/**
 * Loop generation on self-hosted GraphHopper — "mix best-of-6 + trimSpurs":
 * 3 GraphHopper round trips (headings 120° apart) + 3 OUT 3-waypoint
 * triangles routed as GraphHopper legs, all in parallel; every loop gets its
 * dead-end spurs trimmed, is measured with src/lib/route-quality and ranked;
 * the best 3 distinct loops are returned.
 *
 * Measured 19.10.2026 (6 starts × 3/5 km × 6 runs): 77.8% pass the v1 bars
 * vs 58.3% for Mapbox v1; p95 134 ms per generation on a local server.
 *
 * Server-only (needs the GraphHopper client); no Firestore.
 */
import type { OsmRoadLayer } from '@/lib/route-quality';
import { DEFAULT_TAGS, profileForActivity, type GraphHopperClient, type OutActivity, type RouteTags } from './graphhopper';
import { roundTripCandidate, viaLoopCandidate, type CandidateParams, type LoopCandidate } from './loops/candidates';
import { spreadHeadings, type LatLng } from './loops/geo';
import { scoreLoop, selectTopLoops, type ScoredLoop } from './loops/scoring';

export type { ScoredLoop } from './loops/scoring';

const ABORT_GRACE_MS = 25;

export interface LoopRequest {
  start: LatLng;
  targetKm: number;
  activity: OutActivity;
  /** Variety: a different seed → different headings / round-trip seeds. */
  seed: number;
  tags?: RouteTags;
  maxResults?: number;
  /** Return whatever finished by then (ms from call). */
  deadlineMs?: number;
}

export interface LoopResult {
  loops: ScoredLoop[];
  candidates: number;
  calls: number;
  timedOut: boolean;
  /** Candidates that failed with an error (GraphHopper down / auth), not just "no route". */
  errors: number;
  lastError?: string;
}

/** `osm` may be a pending fetch — it is awaited only once routing is done. */
export async function generateLoops(
  client: GraphHopperClient,
  req: LoopRequest,
  osm: OsmRoadLayer | null | Promise<OsmRoadLayer | null> = null,
): Promise<LoopResult> {
  const ctrl = new AbortController();
  const params: CandidateParams = {
    client,
    start: req.start,
    targetKm: req.targetKm,
    profile: profileForActivity(req.activity),
    tags: req.tags ?? DEFAULT_TAGS,
    signal: ctrl.signal,
  };
  const headings = spreadHeadings(req.seed);
  const jobs: Array<Promise<LoopCandidate | null>> = [
    ...headings.map((h, k) => roundTripCandidate(params, req.seed * 3 + k, h)),
    ...headings.map(h => viaLoopCandidate(params, h)),
  ];

  const done: LoopCandidate[] = [];
  let timedOut = false, errors = 0, lastError: string | undefined;
  const settled = Promise.allSettled(jobs.map(j => j.then(
    c => { if (c) done.push(c); },
    e => { if (!ctrl.signal.aborted) { errors++; lastError = (e as Error)?.message; } },
  )));
  if (req.deadlineMs != null) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<'deadline'>(r => { timer = setTimeout(() => r('deadline'), req.deadlineMs); });
    timedOut = (await Promise.race([settled.then(() => 'ok' as const), deadline])) === 'deadline';
    clearTimeout(timer);
    if (timedOut) {
      // Aborting makes in-flight calibrations settle with the best loop they already have.
      ctrl.abort();
      await Promise.race([settled, new Promise(r => setTimeout(r, ABORT_GRACE_MS))]);
    }
  } else {
    await settled;
  }

  const snapshot = [...done];
  const layer = await osm;
  const scored = snapshot.map(c => scoreLoop(c, req.targetKm, layer));
  return {
    loops: selectTopLoops(scored, req.maxResults ?? 3),
    candidates: snapshot.length,
    calls: snapshot.reduce((a, c) => a + c.calls, 0),
    timedOut,
    errors,
    ...(lastError ? { lastError } : {}),
  };
}
