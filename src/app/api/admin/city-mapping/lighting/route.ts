import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdminApi } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { runBackfillRouteLightingChunk } from '../../../../../../scripts/backfill-route-lighting-haifa';

export const maxDuration = 60;

/**
 * POST /api/admin/city-mapping/lighting — thin wrapper around
 * scripts/backfill-route-lighting-haifa.ts's `runBackfillRouteLightingChunk()`
 * (Phase 1 Stage B, city-mapping-orchestrator.ts's "lighting" step).
 *
 * CHUNKED (04.09.2026, lighting-step 504 fix): this route processes ONE
 * bounded slice of the city's official_routes per call — a dense city
 * (Haifa: 500-7,900 street-segment candidates per route) measured well over
 * this route's 60s maxDuration even with concurrency-capped queries. The
 * caller (city-mapping-orchestrator.ts) drives a repeat-until-done loop,
 * passing `cursor` back on each call until the response reports
 * `done: true`. See runBackfillRouteLightingChunk's header comment for the
 * cursor/ordering contract.
 *
 * Body: { city: string, apply: boolean, cursor?: string | null }. `city` is
 * passed as the sole alias — the two-spelling comma-separated form stays a
 * CLI-only escape hatch (LOCKED, city-mapping-orchestrator.ts's single-
 * canonical-city-string guard: this route accepts exactly one city string,
 * not a list).
 */
export async function POST(request: NextRequest) {
  const denied = await requireSuperAdminApi(request);
  if (denied) return denied;

  const body = await request.json().catch(() => ({}));
  const city = typeof body.city === 'string' ? body.city.trim() : '';
  const apply = body.apply === true;
  const cursor = typeof body.cursor === 'string' ? body.cursor : null;
  if (!city) return NextResponse.json({ error: 'city is required' }, { status: 400 });

  const db = getAdminDb();
  try {
    const result = await runBackfillRouteLightingChunk({ cityAliases: [city], apply, db, cursorId: cursor });
    return NextResponse.json({
      done: result.done,
      cursor: result.cursorId,
      chunkSize: result.chunkSize,
      routesProcessedThisChunk: result.routesProcessedThisChunk,
      totalRoutesInCity: result.totalRoutesInCity,
      litCount: result.litCount,
      unlitCount: result.unlitCount,
      unknownCount: result.unknownCount,
      writesApplied: result.writesApplied,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message ?? 'lighting backfill failed' }, { status: 500 });
  }
}
