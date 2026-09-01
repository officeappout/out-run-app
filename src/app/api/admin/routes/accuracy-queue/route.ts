import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdminApi } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { computeAccuracyQueue, sortAccuracyQueueWorstFirst } from '@/lib/route-decisions/compute-queue';

/**
 * GET /api/admin/routes/accuracy-queue — Stage 3 accuracy-queue UI's data
 * source. Computes decideRouteAccuracy() fresh, server-side, over every
 * official_routes/curated_routes doc's current qualitySignals (all 5
 * cities) via the shared batch module (src/lib/route-decisions/compute-
 * queue.ts) — no client-side fetch-all-and-recompute.
 *
 * Read-only: no Firestore writes. The returned rows link back to the
 * EXISTING approve/reject/edit actions (moderation.service.ts,
 * route-geometry-edit.service.ts) — this route introduces no new way to
 * mutate a route.
 *
 * Auth: superAdmin-only (requireSuperAdminApi, src/lib/api-auth.ts) — this
 * is an all-cities triage surface, a super-admin operation by design, not
 * a single authority manager's normal scope. See that function's doc
 * comment; authority-manager scoping is a documented future option, not
 * built here.
 *
 * No caching — pure Firestore reads + local math (no Overpass/live OSM),
 * cheap at the current ~278-route scale. Revisit with a cache layer if the
 * route count grows enough that a full recompute on every page load starts
 * to matter.
 */
export async function GET(request: NextRequest) {
  const denied = await requireSuperAdminApi(request);
  if (denied) return denied;

  const db = getAdminDb();
  const { rows, totalRoutes, skippedNoComposition } = await computeAccuracyQueue(db);
  const sorted = sortAccuracyQueueWorstFirst(rows);

  return NextResponse.json({ rows: sorted, totalRoutes, skippedNoComposition });
}
