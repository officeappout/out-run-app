/**
 * src/lib/route-decisions/compute-queue.ts — batch accuracy-queue compute,
 * extracted from scripts/review-route-accuracy.ts (Stage 1) so the Node
 * script and the Stage 3 API route (GET /api/admin/routes/accuracy-queue)
 * share one implementation instead of two drifting copies. Admin-SDK only
 * (takes a FirebaseFirestore.Firestore, not the client SDK) — this is a
 * server-side batch read, not something the browser calls directly.
 *
 * Batches the duplicate-name lookup (one query per city up front, an
 * in-memory Map from then on) rather than log-decision.ts's per-route
 * countDuplicateNames() Firestore query — that per-route query is fine for
 * a single decision hook, but wasteful called 250+ times for a queue view.
 *
 * No caching layer — this is pure Firestore reads + local math (no
 * Overpass/live OSM), cheap at the current ~278-route scale. Revisit if the
 * route count grows enough that a full recompute on every page load starts
 * to matter.
 */
import {
  decideRouteAccuracy, type AccuracyDecision, type DistanceClassification,
} from './decide-accuracy';
// Pure, framework-free (see that file's own header) — reused rather than
// reimplemented, same cross-boundary import log-decision.ts already does.
import { classify, computePathDistanceMeters, normalizePathToLngLatTuples } from '../../../scripts/lib/distance-unit-classify';

export type RouteCollectionForQueue = 'official_routes' | 'curated_routes';

export interface QueuedRouteAccuracy {
  id: string;
  collection: RouteCollectionForQueue;
  name: string;
  city: string;
  authorityId: string | null;
  decision: AccuracyDecision;
  compositionSummary: { genuinePct: number; sidewalkPct: number; ordinaryPct: number; otherPct: number };
  lightingSummary?: { status: 'computed' | 'unknown'; litCoveragePct: number | null; isLit: boolean | null };
}

export interface AccuracyQueueResult {
  rows: QueuedRouteAccuracy[];
  totalRoutes: number;
  skippedNoComposition: number;
}

/** Computes decideRouteAccuracy() for every official_routes/curated_routes doc, all cities, from already-persisted qualitySignals only. No writes. */
export async function computeAccuracyQueue(db: FirebaseFirestore.Firestore): Promise<AccuracyQueueResult> {
  const [officialSnap, curatedSnap] = await Promise.all([
    db.collection('official_routes').get(),
    db.collection('curated_routes').get(),
  ]);

  type RawRoute = { id: string; collection: RouteCollectionForQueue; data: FirebaseFirestore.DocumentData };
  const allDocs: RawRoute[] = [
    ...officialSnap.docs.map((d) => ({ id: d.id, collection: 'official_routes' as const, data: d.data() })),
    ...curatedSnap.docs.map((d) => ({ id: d.id, collection: 'curated_routes' as const, data: d.data() })),
  ];

  // Duplicate-name clusters, per city, exact-string-match (ported from
  // scripts/audit-city-coverage.ts, unmerged branch audit/city-coverage) —
  // built once, up front, rather than one Firestore query per route.
  const namesByCity = new Map<string, Map<string, number>>();
  for (const { data } of allDocs) {
    const city = data.city || '(none)';
    const name = (data.name || '').trim();
    if (!name) continue;
    if (!namesByCity.has(city)) namesByCity.set(city, new Map());
    const nm = namesByCity.get(city)!;
    nm.set(name, (nm.get(name) || 0) + 1);
  }

  const rows: QueuedRouteAccuracy[] = [];
  let skippedNoComposition = 0;

  for (const { id, collection, data } of allDocs) {
    const composition = data.qualitySignals?.composition;
    if (!composition) { skippedNoComposition++; continue; }
    const lighting = data.qualitySignals?.lighting;

    const rawPath = Array.isArray(data.path) ? data.path : [];
    const pathPointCount = rawPath.length;
    const pathPts = normalizePathToLngLatTuples(rawPath);
    const groundTruthMeters = computePathDistanceMeters(pathPts);
    const { classification } = pathPointCount < 2
      ? { classification: 'no-geometry' as DistanceClassification }
      : classify(data.distance, groundTruthMeters);
    const normalizedKm = pathPointCount >= 2 ? Math.round((groundTruthMeters / 1000) * 100) / 100 : null;

    const city = data.city || '(none)';
    const nameCount = (namesByCity.get(city)?.get((data.name || '').trim()) || 1) - 1; // other routes sharing this name

    const decision = decideRouteAccuracy({
      composition: { sidewalkPct: composition.sidewalkPct, genuinePct: composition.genuinePct, ordinaryPct: composition.ordinaryPct, otherPct: composition.otherPct },
      lighting: lighting ? { status: lighting.status, litCoveragePct: lighting.litCoveragePct, isLit: lighting.isLit } : undefined,
      pathPointCount,
      distance: { classification, normalizedKm },
      duplicateNameCount: nameCount,
    });

    rows.push({
      id,
      collection,
      name: data.name || '(unnamed)',
      city,
      authorityId: data.authorityId || null,
      decision,
      compositionSummary: { genuinePct: composition.genuinePct, sidewalkPct: composition.sidewalkPct, ordinaryPct: composition.ordinaryPct, otherPct: composition.otherPct },
      ...(lighting ? { lightingSummary: { status: lighting.status, litCoveragePct: lighting.litCoveragePct, isLit: lighting.isLit } } : {}),
    });
  }

  return { rows, totalRoutes: allDocs.length, skippedNoComposition };
}

/** Worst-first: drop, then edit/approve by descending confidence within each tier. */
export function sortAccuracyQueueWorstFirst(rows: QueuedRouteAccuracy[]): QueuedRouteAccuracy[] {
  const order: Record<string, number> = { drop: 0, edit: 1, approve: 2 };
  return [...rows].sort((a, b) => {
    if (order[a.decision.verdict] !== order[b.decision.verdict]) return order[a.decision.verdict] - order[b.decision.verdict];
    return b.decision.confidence - a.decision.confidence;
  });
}
