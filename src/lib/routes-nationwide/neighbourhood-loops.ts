/**
 * "Generated neighbourhood loops" (NATIONWIDE-PLAN.md §3.4 row 4, RC8): the
 * LAST source, run only while an authority's quota minimum is still unmet.
 * A few well-spread seeds inside the authority → GraphHopper `foot_turns`
 * round trips (+ one 3-point loop) per seed through the app's own "mix"
 * generator (src/lib/routing/loops) → spur-trimmed, measured, ranked with the
 * turn-aware score; only loops that PASS the route-quality v1 bars are kept,
 * one per seed. Pure apart from the injected client (budgeted by the caller).
 */
import { roundTripCandidate, viaLoopCandidate, type LoopCandidate } from '../routing/loops/candidates';
import { spreadHeadings } from '../routing/loops/geo';
import { scoreLoop, selectTopLoops, type ScoredLoop } from '../routing/loops/scoring';
import { DEFAULT_TAGS, type GhProfile, type GraphHopperClient } from '../routing/graphhopper';
import { haversineM } from '../route-quality/geo';
import type { LngLat } from '../route-quality/types';

export const NEIGHBOURHOOD_PIPELINE = 'gh-neighbourhood-loops';
export const NEIGHBOURHOOD_PROFILE: GhProfile = 'foot_turns';
/** Seeds per authority and the loop lengths they cycle through. */
export const NEIGHBOURHOOD_SEEDS = 4;
export const NEIGHBOURHOOD_TARGETS_KM = [5, 3, 8, 4] as const;
/** Seeds closer than this to each other are not "well spread". */
export const SEED_MIN_SPACING_M = 1_200;
const PACE_RUN_M_PER_MIN = 160;

/**
 * Farthest-point sampling: the first seed is the candidate nearest the
 * centroid (a town centre, not an edge), each next one the candidate farthest
 * from all chosen so far; stops early when the next would be < minSpacingM
 * away (a small town gets fewer seeds, never a cluster).
 */
export function spreadSeeds(points: LngLat[], k = NEIGHBOURHOOD_SEEDS, minSpacingM = SEED_MIN_SPACING_M): LngLat[] {
  if (!points.length || k <= 0) return [];
  const cx = points.reduce((s, p) => s + p[0], 0) / points.length;
  const cy = points.reduce((s, p) => s + p[1], 0) / points.length;
  let first = points[0], best = Infinity;
  for (const p of points) {
    const d = (p[0] - cx) ** 2 + (p[1] - cy) ** 2;
    if (d < best) { best = d; first = p; }
  }
  const out: LngLat[] = [first];
  const minD = points.map((p) => haversineM(p, first));
  while (out.length < k) {
    let idx = -1, far = -1;
    for (let i = 0; i < points.length; i++) if (minD[i] > far) { far = minD[i]; idx = i; }
    if (idx < 0 || far < minSpacingM) break;
    const next = points[idx];
    out.push(next);
    for (let i = 0; i < points.length; i++) minD[i] = Math.min(minD[i], haversineM(points[i], next));
  }
  return out;
}

export interface NeighbourhoodLoop {
  seed: LngLat;
  targetKm: number;
  loop: ScoredLoop;
}

export interface NeighbourhoodRun {
  loops: NeighbourhoodLoop[];
  notes: string[];
}

/**
 * One seed at a time (machine + server load stay low). Per seed: 2 round
 * trips (spread headings) + 1 via loop, each self-calibrating ≤ 3 calls.
 * A spent budget simply ends the run with what it has.
 */
export async function generateNeighbourhoodLoops(
  client: GraphHopperClient,
  seeds: LngLat[],
  opts: { profile?: GhProfile; targetsKm?: readonly number[]; isBudgetSpent?: () => boolean } = {},
): Promise<NeighbourhoodRun> {
  const profile = opts.profile ?? NEIGHBOURHOOD_PROFILE;
  const targets = opts.targetsKm ?? NEIGHBOURHOOD_TARGETS_KM;
  const loops: NeighbourhoodLoop[] = [];
  const notes: string[] = [];
  for (let i = 0; i < seeds.length; i++) {
    if (opts.isBudgetSpent?.()) { notes.push(`seed ${i + 1}+: GraphHopper budget spent`); break; }
    const seed = seeds[i];
    const targetKm = targets[i % targets.length];
    const params = { client, start: { lng: seed[0], lat: seed[1] }, targetKm, profile, tags: DEFAULT_TAGS };
    const [h1, h2] = spreadHeadings(i);
    const cands: LoopCandidate[] = [];
    for (const make of [() => roundTripCandidate(params, i * 3 + 1, h1), () => roundTripCandidate(params, i * 3 + 2, h2), () => viaLoopCandidate(params, h1)]) {
      if (opts.isBudgetSpent?.()) break;
      try {
        const c = await make();
        if (c) cands.push(c);
      } catch { /* budget / network: this candidate is just missing */ }
    }
    const passing = cands.map((c) => scoreLoop(c, targetKm, null)).filter((l) => l.verdict.pass);
    const top = selectTopLoops(passing, 1)[0];
    if (top) loops.push({ seed, targetKm, loop: top });
    else notes.push(`seed ${i + 1} (${targetKm} km): ${cands.length ? `${cands.length} candidate(s), none passes route-quality` : 'no route from GraphHopper'}`);
  }
  return { loops, notes };
}

const r5 = (n: number) => Math.round(n * 1e5) / 1e5;

export function neighbourhoodLoopId(authorityId: string, l: Pick<NeighbourhoodLoop, 'seed' | 'targetKm'>): string {
  const safe = authorityId.replace(/[^0-9a-zA-Z_-]/g, '_').slice(0, 60);
  return `ghloop_${safe}_${r5(l.seed[1]).toFixed(5)}_${r5(l.seed[0]).toFixed(5)}_${l.targetKm}k`.replace(/\./g, 'd');
}

/** official_routes doc — pending, unpublished, origin 'generated'. Callers pass it through buildValidatedDoc. */
export function neighbourhoodLoopDoc(
  n: NeighbourhoodLoop,
  ctx: { authorityId: string; city: string; importBatchId: string; profile?: GhProfile; name?: string },
): { id: string; data: Record<string, unknown> } {
  const km = Math.round(n.loop.distanceKm * 100) / 100;
  const m = n.loop.metrics;
  return {
    id: neighbourhoodLoopId(ctx.authorityId, n),
    data: {
      name: ctx.name ?? `לולאה שכונתית ב${ctx.city} · ${km.toFixed(1)} ק״מ`,
      description: 'לולאה שכונתית שנבנתה אוטומטית (GraphHopper, פרופיל עם עלות פניות) — ממתינה לבדיקה',
      distance: km,
      duration: Math.max(1, Math.round((km * 1000) / PACE_RUN_M_PER_MIN)),
      score: Math.round(km * 10),
      rating: 0,
      calories: Math.round(km * 65),
      type: 'running',
      activityType: 'running',
      activityTypes: ['running', 'walking'],
      difficulty: 'easy',
      path: n.loop.path.map(([lng, lat]) => ({ lng, lat })),
      segments: [],
      features: { hasGym: false, hasBenches: false, scenic: false, terrain: 'asphalt', environment: 'urban', trafficLoad: 'low', surface: 'road' },
      routeShape: 'loop',
      ...(n.loop.ascendM > 0 ? { elevationGain: Math.round(n.loop.ascendM) } : {}),
      authorityId: ctx.authorityId,
      city: ctx.city,
      status: 'pending',
      published: false,
      origin: 'generated',
      generator: {
        pipeline: NEIGHBOURHOOD_PIPELINE,
        engine: 'graphhopper',
        profile: ctx.profile ?? NEIGHBOURHOOD_PROFILE,
        loopSource: n.loop.source,
        seed: { lng: n.seed[0], lat: n.seed[1] },
        targetKm: n.targetKm,
        turnsPerKm: Math.round(m.turnsPerKm * 10) / 10,
        zigzagIndex: Math.round(m.zigzagIndex * 100) / 100,
        majorRoadPct: m.majorRoadPct != null ? Math.round(m.majorRoadPct * 1000) / 1000 : null,
      },
      provenance: { pipeline: NEIGHBOURHOOD_PIPELINE, osm: { license: 'ODbL-1.0', via: 'graphhopper' } },
      importBatchId: ctx.importBatchId,
    },
  };
}
