/**
 * The runner's `known_routes` stage (RC8 step 6): reads the authority's web
 * research file (docs/routes/known-routes/<authorityId>.json — names + source
 * URLs only) and matches every name to geometry we already have: an existing
 * route (reported, no new doc), a named OSM relation (pipeline B), named OSM
 * ways, or a big park's perimeter. Every new / cloned candidate carries the
 * `knownRoute` citation and passes buildValidatedDoc before entering the pool.
 * Writes nothing; the per-city match report is returned to the runner.
 */
import * as fs from 'fs';
import * as path from 'path';
import { parkLoopDoc, parkLoopId, perimeterLoop, pointInRing, type LngLat } from '../../../src/lib/park-loops';
import { buildValidatedDoc } from '../../../src/lib/route-collections/validate';
import type { CandidateRoute, StageProvider } from '../../../src/lib/routes-nationwide';
import { knownRouteCitation, knownRouteWaysDoc, matchKnownRoutes, parseKnownRoutesFile, type KnownRouteReport } from '../../../src/lib/routes-nationwide/known-routes';
import type { AuthorityOsmSlice } from './authority-osm.node';
import type { AuthorityCtx, TrailsRun } from './providers.node';

export const KNOWN_ROUTES_DIR = path.join('docs', 'routes', 'known-routes');

export function readKnownRoutesFile(dir: string, authorityId: string) {
  const f = path.join(dir, `${authorityId}.json`);
  if (!fs.existsSync(f)) return null;
  return parseKnownRoutesFile(JSON.parse(fs.readFileSync(f, 'utf8')));
}

export class KnownRoutesStage {
  report: KnownRouteReport | null = null;
  constructor(private a: AuthorityCtx, private dir: string, private slice: AuthorityOsmSlice, private trails: TrailsRun, private importBatchId: string, private osmEnabled: boolean) {}

  provider(): StageProvider {
    return { key: 'known_routes', run: (prior) => this.run(prior) };
  }

  private async run(prior: readonly CandidateRoute[]) {
    const parsed = readKnownRoutesFile(this.dir, this.a.id);
    if (!parsed?.file) return { routes: [], note: parsed ? `research file unreadable (${parsed.errors.join('; ')})` : 'no research file for this city' };
    const file = parsed.file;
    const osm = this.osmEnabled ? await this.slice.get() : null;
    const relations = this.osmEnabled ? await this.trails.namedCandidates() : [];
    const inside = (p: LngLat) => !osm || osm.rings.some((r) => pointInRing(p, r));
    // Park perimeters for parks the research names (same id as the park_loops stage → that later copy is the duplicate).
    const parkLoops = (osm?.parks ?? []).map((park) => ({ park, id: parkLoopId({ park, kind: 'perimeter' } as never) }));
    const { matches, unmatched } = matchKnownRoutes(file, {
      existing: prior.filter((p) => !p.isNew).map((p) => ({ id: p.id, name: String(p.data?.name ?? '') })),
      relations: relations.map((r) => ({ id: r.id, name: String(r.data?.name ?? '') })),
      parkLoops: parkLoops.map((p) => ({ id: p.id, parkName: p.park.name })),
      ways: osm?.namedWays ?? [],
      inside,
    });

    const docs: Array<{ id: string; data: Record<string, unknown> }> = [];
    const report: KnownRouteReport = { authorityId: this.a.id, city: this.a.name, matched: [], unmatched: unmatched.map((k) => ({ name: k.name, reason: this.osmEnabled ? 'no route / relation / named way / big park with this name' : 'OSM stage off', sources: k.sources.map((s) => s.url) })), fileErrors: parsed.errors };
    for (const m of matches) {
      const cite = knownRouteCitation(m.route, file.researchedAt, m.kind);
      const urls = m.route.sources.map((s) => s.url);
      if (m.kind === 'existing') {
        const ex = prior.find((p) => p.id === m.candidateId);
        report.matched.push({ name: m.route.name, how: 'existing', id: m.candidateId, km: typeof ex?.data?.distance === 'number' ? ex.data.distance : null, sources: urls });
      } else if (m.kind === 'osm_relation') {
        const rel = relations.find((r) => r.id === m.candidateId)!;
        docs.push({ id: rel.id, data: { ...rel.data, knownRoute: cite } });
        report.matched.push({ name: m.route.name, how: 'osm_relation', id: rel.id, km: typeof rel.data?.distance === 'number' ? rel.data.distance : null, sources: urls });
      } else if (m.kind === 'osm_ways' && m.corridor) {
        const d = knownRouteWaysDoc(m.route, m.corridor, { authorityId: this.a.id, city: this.a.name, researchedAt: file.researchedAt, osmSnapshot: osm?.osmSnapshot ?? null, importBatchId: this.importBatchId });
        docs.push(d);
        report.matched.push({ name: m.route.name, how: 'osm_ways', id: d.id, km: Number(d.data.distance), sources: urls });
      } else if (m.kind === 'park_loop' && osm) {
        const park = parkLoops.find((p) => p.id === m.candidateId)!.park;
        const per = perimeterLoop(park, osm.paths);
        if (!per.loop) {
          report.unmatched.push({ name: m.route.name, reason: `park "${park.name}" found, but no walkable perimeter (${per.reason})`, sources: urls });
          continue;
        }
        const d = parkLoopDoc(per.loop, { authorityId: this.a.id, city: this.a.name, osmSnapshot: osm.osmSnapshot, importBatchId: this.importBatchId });
        docs.push({ id: d.id, data: { ...d.data, knownRoute: cite } });
        report.matched.push({ name: m.route.name, how: 'park_loop', id: d.id, km: Number(d.data.distance), sources: urls });
      }
    }

    const routes: CandidateRoute[] = [];
    for (const d of docs) {
      try {
        const data = buildValidatedDoc('official_routes', d.data, { mode: 'create', knownAuthorityIds: this.a.knownAuthorityIds });
        routes.push({ id: d.id, data: data as Record<string, any>, stage: 'known_routes', isNew: true });
      } catch (e) {
        report.fileErrors.push(`${d.id}: invalid doc (${(e as Error).message.slice(0, 100)})`);
      }
    }
    this.report = report;
    return { routes, note: `${file.routes.length} researched name(s): ${report.matched.length} matched (${report.matched.filter((m) => m.how === 'existing').length} already in the app), ${report.unmatched.length} unmatched` };
  }
}
