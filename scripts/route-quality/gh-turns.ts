/**
 * scripts/route-quality/gh-turns.ts — why do GraphHopper loops zigzag, and
 * does a tuned custom model / turn-aware ranking fix it? READ-ONLY.
 *
 * Calls the LIVE GraphHopper service (per-request custom models, flexible
 * mode — nothing is redeployed), Mapbox (v1 column, via the real app
 * generator) and Overpass (the OSM layer the metrics judge crossings with).
 * Firestore is the offline hermetic corpus stub — nothing can reach
 * production Firestore; no flags are read or written.
 *
 *   npx tsx --env-file=<repo>/.env.local --tsconfig scripts/route-quality/hermetic/tsconfig.json \
 *     scripts/route-quality/gh-turns.ts --url https://graphhopper-….run.app --out <dir> \
 *     --phase explore|compare [--max-calls 300] [--only tlv-dizengoff] [--km 3,5,8] [--no-v1]
 *
 * explore: one round_trip + one 3-point loop (no calibration) per start at 5 km
 *          for each candidate model in MODELS — cheap shape comparison.
 * compare: the full "mix best-of-6 + trimSpurs" recipe per start × km:
 *          gh        = today's model + origin/main ranking
 *          gh+rank   = the same GraphHopper loops, this branch's turn-aware ranking (no extra calls)
 *          v1        = the app's Mapbox v1 generator (route quality v1 on)
 *          (gh-all   = every scored candidate, for calibrating the ranking weights)
 * --profile foot_turns (after the owner's rebuild) adds gh-turns = turn-cost
 * profile + turn-aware ranking.
 * rescore: no network — re-ranks the saved gh-all candidates of rows-compare.json
 *          with the CURRENT scoring constants (gh = without, gh+rank = with the
 *          turn term), so retuning the weights needs no new GraphHopper calls.
 * GraphHopper calls are counted and hard-capped (--max-calls).
 */
import './hermetic/guard';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { summarize, toMarkdown, type RouteRow } from './summarize';

const arg = (k: string, d?: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const URL_ = arg('url');
const OUT = arg('out', 'gh-turns-out')!;
const PHASE = arg('phase', 'explore');
const MAX_CALLS = Number(arg('max-calls', '300'));
const ONLY = arg('only');
const KMS = (arg('km', '3,5,8') ?? '').split(',').map(Number);
const NO_V1 = process.argv.includes('--no-v1');
const TURNS_PROFILE = arg('profile');
const SEEDS = (arg('seeds', '1') ?? '').split(',').map(Number);

export const TURN_STARTS = [
  { id: 'tlv-dizengoff', cityName: 'תל אביב-יפו', lat: 32.0779, lng: 34.774 },
  { id: 'tlv-yarkon', cityName: 'תל אביב-יפו', lat: 32.0985, lng: 34.8095 },
  { id: 'haifa-carmel', cityName: 'חיפה', lat: 32.8046, lng: 34.9872 },
  { id: 'beer-sheva', cityName: 'באר שבע', lat: 31.2525, lng: 34.7915 },
  { id: 'herzliya', cityName: 'הרצליה', lat: 32.1648, lng: 34.8443 },
];

/** origin/main's foot model for DEFAULT_TAGS (custom-model.ts QUIET_FOOT + SAFE_CROSSINGS), frozen for the baseline. */
const LEGACY_PRIORITY = [
  { if: 'road_class == MOTORWAY || road_class == TRUNK || road_class == PRIMARY', multiply_by: '0.08' },
  { else_if: 'road_class == SECONDARY', multiply_by: '0.15' },
  { else_if: 'road_class == TERTIARY', multiply_by: '0.3' },
  { else_if: 'road_class == UNCLASSIFIED || road_class == SERVICE', multiply_by: '0.6' },
  { else_if: 'road_class == RESIDENTIAL', multiply_by: '0.8' },
  { else_if: 'road_class == STEPS', multiply_by: '0.5' },
  { if: 'crossing == UNMARKED || crossing == NO', multiply_by: '0.2' },
  { else_if: 'crossing == UNCONTROLLED', multiply_by: '0.8' },
];

type Body = Record<string, unknown> & { custom_model?: { priority: unknown[]; distance_influence?: number } };
type Model = (b: Body) => Body;
// --phase explore result (21.10.2026, 5 starts × 5 km, 50 calls): none of these per-request
// models moves turns/km by more than ~7% (8.5 → 7.9 at distance_influence 300) — the
// zigzag is structural (no turn costs), not a priority-tuning problem.
const legacy: Model = b => ({ ...b, custom_model: { priority: LEGACY_PRIORITY } });
const withDI = (di: number, base: Model = legacy): Model => b => { const x = base(b); return { ...x, custom_model: { ...x.custom_model!, distance_influence: di } }; };
const replacePriority = (pr: unknown[], di?: number): Model => b => ({ ...b, custom_model: { priority: pr, ...(di != null ? { distance_influence: di } : {}) } });
const SOFT = LEGACY_PRIORITY.map(s => {
  if (s.else_if === 'road_class == TERTIARY') return { ...s, multiply_by: '0.4' };
  if (s.else_if === 'road_class == UNCLASSIFIED || road_class == SERVICE') return { ...s, multiply_by: '0.8' };
  if (s.else_if === 'road_class == RESIDENTIAL') return { ...s, multiply_by: '1' };
  return s;
});
/** Candidate models for --phase explore. */
const MODELS: Record<string, Model> = {
  legacy,
  di150: withDI(150),
  di300: withDI(300),
  soft: replacePriority(SOFT),
  soft_di150: replacePriority(SOFT, 150),
};

const withUA: typeof fetch = (url, init) =>
  fetch(url, { ...init, headers: { ...(init?.headers as Record<string, string>), 'User-Agent': 'OUT-route-quality-measure/1.0 (office@appout.co.il)' } });

async function main() {
  if (!URL_) throw new Error('--url <GraphHopper Cloud Run URL> is required');
  const log = console.log; console.log = () => {}; console.warn = () => {};
  const gh = await import('@/lib/routing/graphhopper');
  const rq = await import('@/lib/route-quality');
  const { OVERPASS_ENDPOINTS } = await import('@/lib/route-quality/osm-layer');
  const { roundTripCandidate, viaLoopCandidate } = await import('@/lib/routing/loops/candidates');
  const { spreadHeadings } = await import('@/lib/routing/loops/geo');
  const { scoreLoop, selectTopLoops, turnScorePenalty } = await import('@/lib/routing/loops/scoring');
  mkdirSync(OUT, { recursive: true });

  const key = gh.invokerKeyFromEnv();
  if (!key) throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY not in env');
  const base = gh.createGraphHopperClient({ baseUrl: URL_, timeoutMs: 8000, getIdToken: gh.createIdTokenProvider(key) });
  let calls = 0;
  const clientFor = (model: Model | null): import('@/lib/routing/graphhopper').GraphHopperClient => ({
    route(body, signal) {
      if (calls >= MAX_CALLS) return Promise.reject(new Error('call budget exhausted'));
      calls++;
      return base.route((model ? model(body as unknown as Body) : body) as never, signal);
    },
  });

  async function osmFor(s: typeof TURN_STARTS[number]) {
    const f = join(OUT, `osm-${s.id}.json`);
    if (existsSync(f)) return JSON.parse(readFileSync(f, 'utf8'));
    for (let attempt = 0; ; attempt++) {
      try {
        const layer = await rq.fetchOsmRoadLayer(rq.bboxAround(s.lat, s.lng, 4.8), { endpoints: [...OVERPASS_ENDPOINTS].reverse(), fetchImpl: withUA });
        writeFileSync(f, JSON.stringify(layer));
        return layer;
      } catch (e) {
        if (attempt >= 4) throw e;
        log(`  overpass retry (${(e as Error).message})`);
        await new Promise(r => setTimeout(r, 20000));
      }
    }
  }

  const starts = TURN_STARTS.filter(s => !ONLY || s.id === ONLY);
  const rows: RouteRow[] = [];
  const push = (start: string, targetKm: number, variant: string, path: [number, number][] | null, ms: number, osm: unknown, rank = 0) => {
    if (!path) { rows.push({ start, targetKm, variant, run: 0, rank: -1, reads: 0, ms, empty: true }); return; }
    const m = rq.computeRouteQualityMetrics(path, { targetKm, osm: osm as never });
    const v = rq.evaluateLoopQuality(m);
    rows.push({ start, targetKm, variant, run: 0, rank, reads: 0, ms, distanceKm: m.lengthM / 1000,
      metrics: { ...m, uTurns: [], crossings: m.crossings ? { ...m.crossings, marks: [] } : null }, pass: v.pass, reasons: v.reasons });
  };

  if (PHASE === 'rescore') {
    const saved: RouteRow[] = JSON.parse(readFileSync(join(OUT, 'rows-compare.json'), 'utf8'));
    rows.push(...saved.filter(r => r.variant === 'v1' || r.variant.endsWith('-all')));
    const cells = new Map<string, RouteRow[]>();
    for (const r of saved) if (r.variant === 'gh-all' && r.metrics) { const k = `${r.start}|${r.targetKm}|${Math.floor(r.run / 100)}`; cells.set(k, [...(cells.get(k) ?? []), r]); }
    for (const list of Array.from(cells.values())) {
      const base = (r: RouteRow) => (r.pass ? 0 : 10) + rq.evaluateLoopQuality(r.metrics!).penalty + 2 * Math.abs(r.metrics!.distanceErrorPct ?? 0);
      const near = list.filter(r => Math.abs(r.metrics!.distanceErrorPct ?? 0) <= 0.3);
      const pool = near.length ? near : list;
      const best = (f: (r: RouteRow) => number) => pool.reduce((a, b) => (f(b) < f(a) ? b : a));
      rows.push({ ...best(base), variant: 'gh', run: Math.floor(list[0].run / 100) });
      rows.push({ ...best(r => base(r) + turnScorePenalty(r.metrics!)), variant: 'gh+rank', run: Math.floor(list[0].run / 100) });
    }
  } else if (PHASE === 'explore') {
    for (const s of starts) {
      const osm = await osmFor(s);
      for (const [name, model] of Object.entries(MODELS)) {
        const c = clientFor(model);
        const tags = gh.DEFAULT_TAGS;
        for (const kind of ['round_trip', 'via'] as const) {
          const t0 = Date.now();
          let r: import('@/lib/routing/graphhopper').RoutedPath | null = null;
          try {
            r = kind === 'round_trip'
              ? await c.route(gh.buildRoundTripRequest({ start: s, distanceM: 5000, seed: 1, heading: 0, profile: 'foot', tags }))
              : await viaOnce(c, s, gh, tags);
          } catch (e) { log(`  ! ${s.id} ${name} ${kind}: ${(e as Error).message}`); }
          push(s.id, 5, `${name}/${kind}`, r ? rq.trimSpurs(r.path).path : null, Date.now() - t0, osm);
        }
        log(`${s.id} ${name}: calls so far ${calls}`);
      }
    }
  } else {
    let mapbox: typeof import('@/features/parks/core/services/route-generator.service') | null = null;
    if (!NO_V1) {
      const { seedOsmRoadLayer } = await import('@/lib/route-quality/osm-layer-cache');
      mapbox = await import('@/features/parks/core/services/route-generator.service');
      for (const s of starts) { const osm = await osmFor(s); for (const km of KMS) seedOsmRoadLayer(s.lat, s.lng, Math.max(km, 1.5) / 2 + 0.5, osm); }
    }
    for (const s of starts) {
      const osm = await osmFor(s);
      for (const targetKm of KMS) {
        // GraphHopper: today's model, scored with the old and the turn-aware ranking.
        const ghVariants: Array<[string, string]> = [['gh', 'foot'], ...(TURNS_PROFILE ? [['gh-turns', TURNS_PROFILE] as [string, string]] : [])];
        for (const seed of SEEDS) for (const [variant, profile] of ghVariants) {
          const t0 = Date.now();
          const params = { client: clientFor(null), start: s, targetKm, profile: profile as 'foot', tags: gh.DEFAULT_TAGS };
          const headings = spreadHeadings(seed);
          const settled = await Promise.allSettled([
            ...headings.map((h, k) => roundTripCandidate(params, seed * 3 + k, h)),
            ...headings.map(h => viaLoopCandidate(params, h)),
          ]);
          const ms = Date.now() - t0;
          const cands = settled.flatMap(x => (x.status === 'fulfilled' && x.value ? [x.value] : []));
          const scored = cands.map(c => scoreLoop(c, targetKm, osm, null));
          const run = seed;
          const pushTop = (v: string, list: typeof scored) => {
            const top = selectTopLoops(list, 1)[0];
            const before = rows.length;
            push(s.id, targetKm, v, top?.path ?? null, ms, osm);
            rows[before].run = run;
          };
          if (variant === 'gh') {
            // origin/main ranking = today's score minus the new turn term.
            pushTop('gh', scored.map(l => ({ ...l, score: l.score - turnScorePenalty(l.metrics) })));
            pushTop('gh+rank', scored);
          } else {
            pushTop(variant, scored);
          }
          scored.forEach((l, i) => {
            rows.push({ start: s.id, targetKm, variant: `${variant}-all`, run: seed * 100 + i, rank: 0, reads: 0, ms, distanceKm: l.distanceKm,
              metrics: { ...l.metrics, uTurns: [], crossings: l.metrics.crossings ? { ...l.metrics.crossings, marks: [] } : null }, pass: l.verdict.pass, reasons: l.verdict.reasons });
          });
          log(`${s.id} ${targetKm}km ${variant} seed ${seed}: ${cands.length} candidates, ${ms} ms, calls so far ${calls}`);
        }
        if (mapbox) {
          const t0 = Date.now();
          let routes: Array<{ path: [number, number][] }> = [];
          try {
            routes = await mapbox.generateDynamicRoutes({
              userLocation: { lat: s.lat, lng: s.lng }, targetDistance: targetKm, activity: 'running', routeGenerationIndex: 1,
              preferences: { includeStrength: false, maxRoutes: 3 }, parks: [], cityName: s.cityName,
              routeQualityV1: true, graphhopperRoutes: false, loopsPreferOfficial: false,
            } as Parameters<typeof mapbox.generateDynamicRoutes>[0]) as never;
          } catch (e) { log(`  ! v1 ${s.id} ${targetKm}: ${(e as Error).message}`); }
          push(s.id, targetKm, 'v1', routes[0]?.path ?? null, Date.now() - t0, osm);
          log(`${s.id} ${targetKm}km v1: ${routes.length} route(s)`);
        }
      }
    }
  }
  writeFileSync(join(OUT, `rows-${PHASE}.json`), JSON.stringify(rows));
  const md = `GraphHopper calls: ${calls}\n\n` + toMarkdown(summarize(rows));
  writeFileSync(join(OUT, `summary-${PHASE}.md`), md);
  log(md);
}

/** One 3-point loop at bearing 0 (no calibration): start → ±30° at r = km/3.75 → start. */
async function viaOnce(c: import('@/lib/routing/graphhopper').GraphHopperClient, s: { lat: number; lng: number }, gh: typeof import('@/lib/routing/graphhopper'), tags: import('@/lib/routing/graphhopper').RouteTags) {
  const { destination } = await import('@/lib/routing/loops/geo');
  const r = 5 / 3.75;
  return c.route(gh.buildViaRequest([s, destination(s, -30, r), destination(s, 30, r), s], 'foot', tags));
}

main().then(() => process.exit(0), e => { console.error(e); process.exit(1); });
