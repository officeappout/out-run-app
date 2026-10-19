/**
 * POST /api/routes/generate — route generation on OUT's self-hosted
 * GraphHopper (Cloud Run, me-west1; infra/graphhopper/).
 *
 *   { mode: 'loop', start, targetKm, activity, seed? }  → top-3 loops (mix best-of-6 + trimSpurs, route-quality scored)
 *   { mode: 'ab', from, to, activity }                 → one quiet-streets A→B route
 *
 * Auth: Firebase ID token in Authorization: Bearer <token> (any signed-in user).
 * Rate limit: RATE_LIMITS.routesGenerate per uid (fails open, like every limiter).
 * Read-only apart from the rate-limit counter; the app only calls this when the
 * panel flag enable_graphhopper_routes is on, and falls back to Mapbox on any error.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { checkRateLimit } from '@/lib/rateLimit';
import { RATE_LIMITS } from '@/lib/rateLimitConfig';
import { parseGenerateRequest, type GenerateAbResponse, type GenerateLoopsResponse } from '@/lib/routing/api-contract';
import { getServerGraphHopperClient } from '@/lib/routing/graphhopper';
import { generateLoops } from '@/lib/routing/loop-service';
import { friendlyRoute } from '@/lib/routing/friendly-route';
import { fetchOsmLayerForLoop } from '@/lib/routing/osm-layer-server';
import { toLoopDto, toAbDto } from './dto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 10;

/** The app gives up after 2 s and falls back to Mapbox; stay well inside that. */
const LOOP_DEADLINE_MS = 1400;
const OSM_WAIT_MS = 500;

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  let uid: string;
  try {
    uid = (await getAdminAuth().verifyIdToken(token)).uid;
  } catch {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const parsed = parseGenerateRequest(await req.json().catch(() => null));
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const client = getServerGraphHopperClient();
  if (!client) return NextResponse.json({ error: 'graphhopper_unavailable' }, { status: 503 });

  const rl = await checkRateLimit(getAdminDb(), `routes-generate:uid:${uid}`, RATE_LIMITS.routesGenerate.uid());
  if (rl.limited) {
    const retry = Math.ceil((rl.retryAfterMs ?? 60_000) / 1000);
    return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: { 'Retry-After': String(retry) } });
  }

  try {
    if (parsed.mode === 'ab') {
      const r = await friendlyRoute(client, parsed, AbortSignal.timeout(LOOP_DEADLINE_MS));
      const body: GenerateAbResponse = { backend: 'graphhopper', route: r ? toAbDto(r) : null };
      return NextResponse.json(body);
    }
    // The OSM layer only matters for scoring: fetched while GraphHopper routes.
    const osmP = fetchOsmLayerForLoop(req.nextUrl.origin, parsed.start, parsed.targetKm, OSM_WAIT_MS);
    const out = await generateLoops(client, {
      start: parsed.start, targetKm: parsed.targetKm, activity: parsed.activity,
      seed: parsed.seed ?? 0, maxResults: parsed.maxResults, deadlineMs: LOOP_DEADLINE_MS,
    }, osmP);
    const osm = await osmP;
    if (out.loops.length === 0 && out.errors > 0) throw new Error(out.lastError ?? 'all candidates failed');
    const body: GenerateLoopsResponse = {
      backend: 'graphhopper',
      loops: out.loops.map(toLoopDto),
      calls: out.calls,
      timedOut: out.timedOut,
      osmLayer: !!osm,
    };
    return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.warn('[routes/generate] graphhopper failed:', (e as Error)?.message);
    return NextResponse.json({ error: 'graphhopper_failed' }, { status: 502 });
  }
}
