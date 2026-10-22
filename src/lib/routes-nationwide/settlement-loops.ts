/**
 * Settlement loops for regional councils (owner, 22.10.2026): every regional
 * council also gets 2–3 SHORT running loops (3–8 km) near its settlements
 * (kibbutzim / moshavim / villages) — regardless of whether the quota minimum
 * is already met. Before this, the GraphHopper neighbourhood stage was skipped
 * as soon as the long marked trails filled the quota, so e.g. שער הנגב got only
 * trails like שביל גולני (33 km) and nothing a resident can run from home.
 *
 * Per settlement (most populous first, then the one with the most streets /
 * paths around it, at least SETTLEMENT_MIN_SPACING_M apart): the start snaps
 * to the nearest street / walkway vertex, then the neighbourhood generator's
 * GraphHopper `foot_turns` round trips (+ one via loop) for a 4–6 km target;
 * only a loop that PASSES the route-quality v1 bars and measures 3–8 km is
 * kept, one per settlement, at most SETTLEMENT_LOOPS_MAX per authority.
 * Selection adds them on top of the top-N set (select.ts: never displacing a
 * higher-scored route, never counting toward "quota met").
 * Pure apart from the injected client (budgeted by the caller — the same
 * per-authority --gh-max-calls budget as the park / neighbourhood stages).
 */
import type { GhProfile, GraphHopperClient } from '../routing/graphhopper';
import { SETTLEMENT_LOOP_PIPELINE } from '../route-score/weights';
import { haversineM } from '../route-quality/geo';
import type { LngLat } from '../route-quality/types';
import { generateNeighbourhoodLoops, neighbourhoodLoopDoc, NEIGHBOURHOOD_PROFILE, type NeighbourhoodLoop } from './neighbourhood-loops';

export const SETTLEMENT_PIPELINE = SETTLEMENT_LOOP_PIPELINE;
/** OSM `place` values that are a settlement of a regional council. */
export const SETTLEMENT_PLACE_KINDS: ReadonlySet<string> = new Set(['village', 'hamlet', 'kibbutz', 'moshav']);
/** Loops per regional council (owner: 2–3). */
export const SETTLEMENT_LOOPS_MAX = 3;
/** Settlements tried before giving up (a hamlet with no streets / no passing loop is skipped). */
export const SETTLEMENT_MAX_TRIES = 6;
/** GraphHopper round-trip targets, cycled per settlement (owner: 4–6 km). */
export const SETTLEMENT_TARGETS_KM = [5, 4, 6] as const;
/** A kept loop must measure within this range (owner: short loops, 3–8 km). */
export const SETTLEMENT_LOOP_KM = { min: 3, max: 8 } as const;
/** Two chosen settlements are at least this far apart (no two loops over the same fields). */
export const SETTLEMENT_MIN_SPACING_M = 2_000;
/** The start snaps to a street / walkway vertex within this distance of the place node. */
export const SETTLEMENT_SNAP_M = 600;
/** "Most paths": street / walkway vertices within this radius of the place node. */
export const SETTLEMENT_PATHS_RADIUS_M = 1_000;

export interface Settlement {
  name: string;
  coord: LngLat;
  place: string;
  population: number | null;
  osmNodeId: number | null;
}

export interface RankedSettlement extends Settlement {
  /** Street / walkway vertices within SETTLEMENT_PATHS_RADIUS_M. */
  pathVertices: number;
  /** Nearest vertex within SETTLEMENT_SNAP_M — the loop's start; null = no streets nearby. */
  start: LngLat | null;
}

/** OSM population tag → number ("1,200" / "1200" / "≈800" → 1200 / 1200 / 800); null when absent or unparsable. */
export function parsePopulation(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v : null;
  if (typeof v !== 'string') return null;
  const m = v.replace(/[,\s]/g, '').match(/\d+/);
  const n = m ? Number(m[0]) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Rank settlements: most populous first (unknown population last), then most
 * street / path vertices around, then name. Settlements with no street vertex
 * within SETTLEMENT_SNAP_M are dropped (nowhere to start a run). Greedy
 * spacing: a settlement closer than minSpacingM to one already chosen is skipped.
 */
export function rankSettlements(settlements: Settlement[], vertices: LngLat[], opts: { max?: number; minSpacingM?: number } = {}): RankedSettlement[] {
  const max = opts.max ?? SETTLEMENT_MAX_TRIES;
  const minSpacingM = opts.minSpacingM ?? SETTLEMENT_MIN_SPACING_M;
  const ranked: RankedSettlement[] = settlements.map((s) => {
    let count = 0;
    let start: LngLat | null = null;
    let best = SETTLEMENT_SNAP_M;
    for (const v of vertices) {
      const d = haversineM(s.coord, v);
      if (d <= SETTLEMENT_PATHS_RADIUS_M) count++;
      if (d <= best) { best = d; start = v; }
    }
    return { ...s, pathVertices: count, start };
  }).filter((s) => s.start != null);
  ranked.sort((a, b) => (b.population ?? -1) - (a.population ?? -1) || b.pathVertices - a.pathVertices || a.name.localeCompare(b.name));
  const out: RankedSettlement[] = [];
  for (const s of ranked) {
    if (out.length >= max) break;
    if (out.some((o) => haversineM(o.coord, s.coord) < minSpacingM)) continue;
    out.push(s);
  }
  return out;
}

export interface SettlementLoop extends NeighbourhoodLoop {
  settlement: Settlement;
}

export interface SettlementLoopsRun {
  loops: SettlementLoop[];
  notes: string[];
}

/**
 * One settlement at a time, in rank order, until SETTLEMENT_LOOPS_MAX loops
 * are kept or the GraphHopper budget is spent. Each settlement costs ≤ 9 calls
 * (generateNeighbourhoodLoops with one seed).
 */
export async function generateSettlementLoops(
  client: GraphHopperClient,
  settlements: RankedSettlement[],
  opts: { profile?: GhProfile; targetsKm?: readonly number[]; maxLoops?: number; isBudgetSpent?: () => boolean } = {},
): Promise<SettlementLoopsRun> {
  const targets = opts.targetsKm ?? SETTLEMENT_TARGETS_KM;
  const maxLoops = opts.maxLoops ?? SETTLEMENT_LOOPS_MAX;
  const loops: SettlementLoop[] = [];
  const notes: string[] = [];
  for (const s of settlements) {
    if (loops.length >= maxLoops) break;
    if (opts.isBudgetSpent?.()) { notes.push(`${s.name}+: GraphHopper budget spent`); break; }
    if (!s.start) continue;
    const targetKm = targets[loops.length % targets.length];
    const res = await generateNeighbourhoodLoops(client, [s.start], { profile: opts.profile ?? NEIGHBOURHOOD_PROFILE, targetsKm: [targetKm], isBudgetSpent: opts.isBudgetSpent });
    const l = res.loops[0];
    if (!l) { notes.push(`${s.name}: ${res.notes.join('; ').replace(/^seed 1 /, '') || 'no loop'}`); continue; }
    if (l.loop.distanceKm < SETTLEMENT_LOOP_KM.min || l.loop.distanceKm > SETTLEMENT_LOOP_KM.max) {
      notes.push(`${s.name}: ${l.loop.distanceKm.toFixed(1)} km outside ${SETTLEMENT_LOOP_KM.min}-${SETTLEMENT_LOOP_KM.max} km`);
      continue;
    }
    loops.push({ ...l, settlement: s });
  }
  return { loops, notes };
}

/** "לולאת כפר עזה · 4.8 ק״מ" (owner's naming). */
export function settlementLoopName(settlement: string, distanceKm: number): string {
  return `לולאת ${settlement.trim()} · ${distanceKm.toFixed(1)} ק״מ`;
}

const r5 = (n: number) => Math.round(n * 1e5) / 1e5;

export function settlementLoopId(authorityId: string, l: Pick<SettlementLoop, 'seed' | 'targetKm'>): string {
  const safe = authorityId.replace(/[^0-9a-zA-Z_-]/g, '_').slice(0, 60);
  return `ghsettle_${safe}_${r5(l.seed[1]).toFixed(5)}_${r5(l.seed[0]).toFixed(5)}_${l.targetKm}k`.replace(/\./g, 'd');
}

/** True for a doc built by settlementLoopDoc (the selection's "always added" extra). */
export function isSettlementLoopDoc(d: Record<string, any> | null | undefined): boolean {
  return d?.generator?.pipeline === SETTLEMENT_PIPELINE;
}

/** official_routes doc — pending, unpublished, origin 'generated' (source tier generated). Callers pass it through buildValidatedDoc. */
export function settlementLoopDoc(
  l: SettlementLoop,
  ctx: { authorityId: string; city: string; importBatchId: string; profile?: GhProfile },
): { id: string; data: Record<string, unknown> } {
  const base = neighbourhoodLoopDoc(l, { ...ctx, name: settlementLoopName(l.settlement.name, l.loop.distanceKm) });
  const gen = base.data.generator as Record<string, unknown>;
  const prov = base.data.provenance as Record<string, unknown>;
  return {
    id: settlementLoopId(ctx.authorityId, l),
    data: {
      ...base.data,
      description: `לולאת ריצה קצרה סביב ${l.settlement.name} שנבנתה אוטומטית (GraphHopper, פרופיל עם עלות פניות) — ממתינה לבדיקה`,
      generator: {
        ...gen,
        pipeline: SETTLEMENT_PIPELINE,
        settlement: { name: l.settlement.name, place: l.settlement.place, osmNodeId: l.settlement.osmNodeId, population: l.settlement.population },
      },
      provenance: { ...prov, pipeline: SETTLEMENT_PIPELINE },
    },
  };
}
