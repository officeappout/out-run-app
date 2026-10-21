/**
 * POST /api/routes/generate — route generation on OUT's self-hosted
 * GraphHopper (Cloud Run, me-west1; infra/graphhopper/).
 *
 *   { mode: 'loop', start, targetKm, activity, seed? }  → top-3 loops (mix best-of-6 + trimSpurs, route-quality scored)
 *   { mode: 'ab', from, to, activity }                 → one quiet-streets A→B route
 *   loop + { preferShade: true, city }                 → "shadiest route" (enable_route_pref_shade):
 *     6 candidates re-ranked by Technion shade where the city has a layer;
 *     elsewhere the normal top-3, with `shade.reason` saying why.
 *   loop + { timeAware: true, city, at? }              → time-aware preference (enable_route_time_aware):
 *     hot sunny hour → 6 candidates ranked by the hourly shade at that hour; after dark → by lit
 *     length share; otherwise (or without the city's layer) the normal top-3. `timeAware` says which.
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
import { rankLoopsByShade, SHADE_PREF_POOL } from '@/lib/routing/shade-pref';
import { getServerShadeLoader } from '@/lib/routing/shade-loader.server';
import { rankLoopsByMeasure, timeAwareMode, TIME_AWARE_POOL, type TimeAwareDecision, type TimeAwareMeta } from '@/lib/routing/time-aware-pref';
import { getServerHourlyShadeLoader, getServerLightingLoader } from '@/lib/routing/time-aware-loaders.server';
import { hourShadeForLine, type HourlyCity } from '@/lib/shade-hourly/route-hourly';
import { measureRouteLighting, type LitIndex } from '@/lib/lighting/route-lighting';
import { technionCityForName } from '@/lib/shade/loader';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 10;

/** The app gives up after 2 s and falls back to Mapbox; stay well inside that. */
const LOOP_DEADLINE_MS = 1400;
const OSM_WAIT_MS = 500;
/** Extra wait for a cold shade layer after routing is done; past it the loops go out unranked. */
const SHADE_WAIT_MS = 200;

function shadeIndexFor(city: string | undefined) {
  try {
    return getServerShadeLoader().indexForName(city ?? null);
  } catch (e) {
    console.warn('[routes/generate] shade loader unavailable:', (e as Error)?.message);
    return Promise.resolve(null);
  }
}

type TimeAwareLayer = { kind: 'shade'; city: HourlyCity } | { kind: 'lit'; city: string; index: LitIndex };

/** The layer the time-aware mode needs (cached per warm instance); null when the city has none. */
async function timeAwareLayerFor(ta: TimeAwareDecision, city: string | undefined): Promise<TimeAwareLayer | null> {
  try {
    if (ta.mode === 'shade') {
      const c = await getServerHourlyShadeLoader().cityForName(city ?? null);
      return c ? { kind: 'shade', city: c } : null;
    }
    if (ta.mode === 'lit') {
      const l = await getServerLightingLoader().indexForName(city ?? null);
      return l ? { kind: 'lit', city: l.city, index: l.index } : null;
    }
  } catch (e) {
    console.warn('[routes/generate] time-aware layer unavailable:', (e as Error)?.message);
  }
  return null;
}

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
    // Shade layer loads while GraphHopper routes (cached per warm instance).
    const shadeP = parsed.preferShade ? shadeIndexFor(parsed.city) : null;
    // Time-aware (enable_route_time_aware; the parser never sets it together with preferShade).
    const ta = parsed.timeAware ? timeAwareMode(parsed.at ? new Date(parsed.at) : new Date(), parsed.start.lat, parsed.start.lng) : null;
    const taRanks = !!ta && ta.mode !== 'neutral' && !!technionCityForName(parsed.city ?? null);
    const taP = ta && taRanks ? timeAwareLayerFor(ta, parsed.city) : null;
    const out = await generateLoops(client, {
      start: parsed.start, targetKm: parsed.targetKm, activity: parsed.activity,
      seed: parsed.seed ?? 0, maxResults: parsed.preferShade ? SHADE_PREF_POOL : taRanks ? TIME_AWARE_POOL : parsed.maxResults, deadlineMs: LOOP_DEADLINE_MS,
      // Our mapped routes, sent by the app only with enable_loops_prefer_official on.
      ...(parsed.ourRoutes ? { ourRoutes: parsed.ourRoutes } : {}),
    }, osmP);
    const osm = await osmP;
    if (out.loops.length === 0 && out.errors > 0) throw new Error(out.lastError ?? 'all candidates failed');
    let body: GenerateLoopsResponse;
    if (shadeP) {
      const TIMEOUT = Symbol('timeout');
      const shade = await Promise.race([shadeP, new Promise<typeof TIMEOUT>((r) => setTimeout(() => r(TIMEOUT), SHADE_WAIT_MS))]);
      const ranked = rankLoopsByShade(out.loops, shade === TIMEOUT ? null : shade, parsed.maxResults ?? 3, shade === TIMEOUT);
      body = {
        backend: 'graphhopper',
        loops: ranked.loops.map((l) => ({ ...toLoopDto(l), shadeShare: l.shadeShare })),
        calls: out.calls, timedOut: out.timedOut, osmLayer: !!osm, shade: ranked.meta,
      };
    } else if (ta) {
      const n = parsed.maxResults ?? 3;
      const meta = (applied: boolean, reason: TimeAwareMeta['reason'], city: string | null): TimeAwareMeta => ({
        requested: true, mode: ta.mode, applied, reason, city, hour: ta.hour, sunElevationDeg: ta.sunElevationDeg,
      });
      const TIMEOUT = Symbol('timeout');
      const layer = taP ? await Promise.race([taP, new Promise<typeof TIMEOUT>((r) => setTimeout(() => r(TIMEOUT), SHADE_WAIT_MS))]) : null;
      const base = { backend: 'graphhopper' as const, calls: out.calls, timedOut: out.timedOut, osmLayer: !!osm };
      if (layer && layer !== TIMEOUT && layer.kind === 'shade' && ta.cell != null) {
        const cell = ta.cell;
        const r = rankLoopsByMeasure(out.loops, (l) => hourShadeForLine(layer.city, l.path, cell).shade, n);
        body = { ...base, loops: r.loops.map((l) => ({ ...toLoopDto(l), hourShade: l.measure })), timeAware: meta(r.applied, r.applied ? 'applied' : 'not_measured', layer.city.city) };
      } else if (layer && layer !== TIMEOUT && layer.kind === 'lit') {
        const r = rankLoopsByMeasure(out.loops, (l) => {
          const m = measureRouteLighting(l.path, layer.index);
          return m.status === 'measured' ? m.litLengthShare : null;
        }, n);
        body = { ...base, loops: r.loops.map((l) => ({ ...toLoopDto(l), litShare: l.measure })), timeAware: meta(r.applied, r.applied ? 'applied' : 'not_measured', layer.city) };
      } else {
        const reason: TimeAwareMeta['reason'] = ta.mode === 'neutral' ? 'neutral' : layer === TIMEOUT ? 'timeout' : 'no_data';
        body = { ...base, loops: out.loops.slice(0, n).map(toLoopDto), timeAware: meta(false, reason, null) };
      }
    } else {
      body = { backend: 'graphhopper', loops: out.loops.map(toLoopDto), calls: out.calls, timedOut: out.timedOut, osmLayer: !!osm };
    }
    return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.warn('[routes/generate] graphhopper failed:', (e as Error)?.message);
    return NextResponse.json({ error: 'graphhopper_failed' }, { status: 502 });
  }
}
