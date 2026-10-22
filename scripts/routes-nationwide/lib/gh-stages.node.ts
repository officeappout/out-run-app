/**
 * The runner's OSM (+GraphHopper) stages (RC8) — candidate docs only, no
 * writes. Every doc is passed through buildValidatedDoc (create mode, the
 * authority's id in knownAuthorityIds) before it enters the pool, exactly as
 * the apply path will validate it again at the write site.
 *
 *   named_ways    — same-name OSM paths / promenades / park paths stitched into
 *                   named corridors (named-corridors.ts), OSM name kept verbatim.
 *   park_loops    — big parks inside the boundary (≥ 80,000 m² or perimeter
 *                   ≥ 1.2 km): known loop (an earlier-stage route circling the
 *                   park) → perimeter on real paths → inner loop via
 *                   GraphHopper (budgeted). At most MAX_PARKS parks.
 *   neighbourhood — GraphHopper foot_turns loops from a few well-spread seeds;
 *                   the runner only reaches it while the quota is still short.
 *   settlement_loops — regional councils only (owner 22.10.2026): 2–3 short
 *                   (3–8 km) GraphHopper foot_turns loops from the council's
 *                   settlements, ALWAYS (not quota-gated), same GH budget.
 */
import { loopsForPark, parkLoopDoc, pointInRing, type LngLat } from '../../../src/lib/park-loops';
import { buildValidatedDoc } from '../../../src/lib/route-collections/validate';
import { parsePath } from '../../../src/lib/route-score';
import type { CandidateRoute, StageProvider } from '../../../src/lib/routes-nationwide';
import { corridorDoc, namedCorridors } from '../../../src/lib/routes-nationwide/named-corridors';
import { nameGeneratedLoop } from '../../../src/lib/routes-nationwide/route-naming';
import { generateNeighbourhoodLoops, neighbourhoodLoopDoc, spreadSeeds, NEIGHBOURHOOD_PROFILE } from '../../../src/lib/routes-nationwide/neighbourhood-loops';
import { generateSettlementLoops, rankSettlements, settlementLoopDoc } from '../../../src/lib/routes-nationwide/settlement-loops';
import type { AuthorityGh } from './gh-client.node';
import { ghViaRouter } from './gh-via-router.node';
import type { AuthorityOsmSlice } from './authority-osm.node';
import type { AuthorityCtx } from './providers.node';

/** Biggest parks first; a city with more big parks than this gets the top ones (the selection caps park loops anyway). */
export const MAX_PARKS = 15;

function validated(a: AuthorityCtx, docs: Array<{ id: string; data: Record<string, unknown> }>, stage: CandidateRoute['stage']): { routes: CandidateRoute[]; invalid: string[] } {
  const routes: CandidateRoute[] = [];
  const invalid: string[] = [];
  for (const d of docs) {
    try {
      const data = buildValidatedDoc('official_routes', d.data, { mode: 'create', knownAuthorityIds: a.knownAuthorityIds });
      routes.push({ id: d.id, data: data as Record<string, any>, stage, isNew: true });
    } catch (e) {
      invalid.push(`${d.id}: ${(e as Error).message.slice(0, 120)}`);
    }
  }
  return { routes, invalid };
}

const ghNote = (gh: AuthorityGh | null) => {
  if (!gh) return 'GraphHopper off';
  const s = gh.stats();
  return `GH ${s.calls} call(s), ${s.cacheHits} cached${s.refused ? `, ${s.refused} over budget` : ''}${s.errors ? `, ${s.errors} error(s)` : ''}`;
};

export function namedWaysProvider(a: AuthorityCtx, slice: AuthorityOsmSlice, importBatchId: string): StageProvider {
  return {
    key: 'named_ways',
    async run() {
      const osm = await slice.get();
      if (!osm) return { routes: [], note: 'no boundary — skipped' };
      // Only corridors whose middle lies inside the authority.
      const inside = namedCorridors(osm.namedWays).filter((c) => osm.rings.some((r) => pointInRing(c.coords[Math.floor(c.coords.length / 2)], r)));
      const v = validated(a, inside.map((c) => corridorDoc(c, { authorityId: a.id, city: a.name, osmSnapshot: osm.osmSnapshot, importBatchId })), 'named_ways');
      return { routes: v.routes, note: `${osm.namedWays.length} named ways → ${inside.length} corridor(s) ≥ 0.8 km${v.invalid.length ? `, ${v.invalid.length} invalid (${v.invalid[0]})` : ''}` };
    },
  };
}

export function parkLoopsProvider(a: AuthorityCtx, slice: AuthorityOsmSlice, gh: AuthorityGh | null, importBatchId: string): StageProvider {
  return {
    key: 'park_loops',
    async run(prior) {
      const osm = await slice.get();
      if (!osm) return { routes: [], note: 'no boundary (stored or OSM relation) — skipped' };
      const parks = osm.parks.slice(0, MAX_PARKS);
      const existing = prior.map((r) => ({ id: r.id, name: String(r.data?.name ?? ''), coords: parsePath(r.data?.path) as LngLat[] })).filter((r) => r.coords.length >= 4);
      const router = gh ? ghViaRouter(gh.client) : null;
      const docs: Array<{ id: string; data: Record<string, unknown> }> = [];
      let known = 0, perimeter = 0, inner = 0;
      for (const park of parks) {
        const r = await loopsForPark(park, { paths: osm.paths, existing, fitness: osm.fitness, router: gh && !gh.spent() ? router : null });
        for (const l of r.loops) {
          if (l.kind === 'known') { known++; continue; }
          if (l.kind === 'perimeter') perimeter++; else inner++;
          docs.push(parkLoopDoc(l, { authorityId: a.id, city: a.name, osmSnapshot: osm.osmSnapshot, importBatchId }));
        }
      }
      gh?.flush();
      const v = validated(a, docs, 'park_loops');
      const s = osm.parkStats;
      return {
        routes: v.routes,
        note: `${s.inside} big park(s) inside (${s.considered} named), used ${parks.length}: known ${known}, perimeter ${perimeter}, inner ${inner}${v.invalid.length ? `, ${v.invalid.length} invalid (${v.invalid[0]})` : ''} · ${ghNote(gh)}`,
      };
    },
  };
}

export function neighbourhoodProvider(a: AuthorityCtx, slice: AuthorityOsmSlice, gh: AuthorityGh | null, importBatchId: string): StageProvider {
  return {
    key: 'neighbourhood',
    async run() {
      if (!gh) return { routes: [], note: 'GraphHopper not configured (--graphhopper-url) — skipped' };
      const osm = await slice.get();
      if (!osm) return { routes: [], note: 'no boundary — skipped' };
      const seeds = spreadSeeds(osm.seeds);
      if (!seeds.length) return { routes: [], note: 'no street vertices inside the boundary' };
      const res = await generateNeighbourhoodLoops(gh.client, seeds, { isBudgetSpent: gh.spent });
      gh.flush();
      const docs = res.loops.map((l) => neighbourhoodLoopDoc(l, { authorityId: a.id, city: a.name, importBatchId, profile: NEIGHBOURHOOD_PROFILE, name: nameGeneratedLoop(l.loop.path, osm.naming, a.name).name }));
      const v = validated(a, docs, 'neighbourhood');
      const notes = [...res.notes, ...(v.invalid.length ? [`${v.invalid.length} invalid (${v.invalid[0]})`] : [])];
      return { routes: v.routes, note: `${seeds.length} seed(s) → ${v.routes.length} loop(s)${notes.length ? ` [${notes.join(' · ')}]` : ''} · ${ghNote(gh)}` };
    },
  };
}

export function settlementLoopsProvider(a: AuthorityCtx, slice: AuthorityOsmSlice, gh: AuthorityGh | null, importBatchId: string): StageProvider {
  return {
    key: 'settlement_loops',
    async run() {
      if (!gh) return { routes: [], note: 'GraphHopper not configured (--graphhopper-url) — skipped' };
      const osm = await slice.get();
      if (!osm) return { routes: [], note: 'no boundary — skipped' };
      const ranked = rankSettlements(osm.settlements, osm.seeds);
      if (!ranked.length) return { routes: [], note: `${osm.settlements.length} settlement(s), none with streets nearby` };
      const res = await generateSettlementLoops(gh.client, ranked, { isBudgetSpent: gh.spent });
      gh.flush();
      const docs = res.loops.map((l) => settlementLoopDoc(l, { authorityId: a.id, city: a.name, importBatchId, profile: NEIGHBOURHOOD_PROFILE }));
      const v = validated(a, docs, 'settlement_loops');
      const notes = [...res.notes, ...(v.invalid.length ? [`${v.invalid.length} invalid (${v.invalid[0]})`] : [])];
      return { routes: v.routes, note: `${osm.settlements.length} settlement(s), tried ${ranked.length} → ${v.routes.length} loop(s)${notes.length ? ` [${notes.join(' · ')}]` : ''} · ${ghNote(gh)}` };
    },
  };
}
