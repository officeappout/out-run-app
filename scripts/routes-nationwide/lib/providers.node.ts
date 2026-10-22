/**
 * Stage providers for the nationwide runner — each returns candidate route
 * docs for ONE authority and writes nothing. Heavy work is lazy: the OSM
 * stage (pipeline B on the local PBF) only runs when the runner asks for it,
 * i.e. when earlier stages did not already fill the quota.
 */
import * as fs from 'fs';
import * as path from 'path';
import type { Firestore } from 'firebase-admin/firestore';
import { DATASETS, planDatasetImport, readShapefileZip, type AuthorityBoundary } from '../../../src/lib/dataset-import';
import { buildSegmentIndex, parsePath, surfaceMixFromSegments, type SurfaceSegment } from '../../../src/lib/route-score';
import type { CandidateRoute, StageProvider } from '../../../src/lib/routes-nationwide';
import type { TrailRoute } from '../../../src/lib/trail-graph/types';
import { readAllOfficialRoutes, readStreetSegmentSurfaces } from '../../lib/route-collections-read.node';
import { runBuildSegmentGraph } from '../../trails/build-segment-graph';
import { runImportNamedRoutes, validatedRouteDocs } from '../../trails/import-named-routes';

export interface AuthorityCtx {
  id: string;
  name: string;
  knownAuthorityIds: Set<string>;
}

/** Existing official_routes of the authority (+ street_segments surface join). Read-only. */
export function existingProvider(db: Firestore | null, a: AuthorityCtx, opts: { surfaceJoin: boolean }): StageProvider {
  return {
    key: 'existing',
    async run() {
      if (!db) return { routes: [], note: 'offline — no Firestore' };
      const docs = (await readAllOfficialRoutes(db, { authorityId: a.id })).filter((d) => d.data?.status !== 'archived');
      let idx: ReturnType<typeof buildSegmentIndex> | null = null;
      let note = `${docs.length} existing`;
      if (opts.surfaceJoin && docs.length) {
        const segs = await readStreetSegmentSurfaces(db, a.id);
        const surf: SurfaceSegment[] = segs
          .map((g) => ({ coords: parsePath(g.path ?? g.coordinates), surfaceType: typeof g.surfaceType === 'string' ? g.surfaceType : null }))
          .filter((g) => g.coords.length >= 2 && !!g.surfaceType && g.surfaceType !== 'unknown');
        if (surf.length) idx = buildSegmentIndex(surf);
        note += `; ${surf.length}/${segs.length} street_segments with a surface`;
      }
      const routes: CandidateRoute[] = docs.map((d) => ({
        id: d.id, data: d.data, stage: 'existing', isNew: false,
        ...(idx ? { opts: { surfaceMix: surfaceMixFromSegments(parsePath(d.data?.path), idx) } } : {}),
      }));
      return { routes, note };
    },
  };
}

/** Datasets (W1.5): planned once per run for the whole country, then sliced per authority. */
export class DatasetCatalog {
  private plans: Array<{ key: string; routes: Array<{ id: string; data: Record<string, unknown>; authorityId: string }> }> | null = null;
  constructor(private dir: string | null, private boundaries: () => Promise<{ boundaries: AuthorityBoundary[]; cityByAuthority: Record<string, string> }>, private log: (s: string) => void) {}

  private async load() {
    if (this.plans) return this.plans;
    this.plans = [];
    if (!this.dir) return this.plans;
    const { boundaries, cityByAuthority } = await this.boundaries();
    for (const spec of Object.values(DATASETS)) {
      const file = ['zip', 'geojson', 'json'].map((ext) => path.join(this.dir!, `${spec.key}.${ext}`)).find((f) => fs.existsSync(f));
      if (!file) { this.log(`  [dataset] ${spec.key}: no file in ${this.dir} — skipped`); continue; }
      const raw = file.endsWith('.zip') ? await readShapefileZip(new Uint8Array(fs.readFileSync(file))) : JSON.parse(fs.readFileSync(file, 'utf8'));
      const plan = planDatasetImport(raw, spec, { boundaries, cityByAuthority, existing: [], snapshot: null, importBatchId: `nationwide-${spec.key}` });
      this.log(`  [dataset] ${spec.key}: ${plan.routes.length} corridor route(s), ${plan.skipped.length} skipped`);
      this.plans.push({ key: spec.key, routes: plan.routes.map((r) => ({ id: r.id, data: r.data, authorityId: r.authorityId })) });
    }
    return this.plans;
  }

  provider(a: AuthorityCtx): StageProvider {
    return {
      key: 'dataset',
      run: async () => {
        if (!this.dir) return { routes: [], note: 'no --datasets-dir' };
        const plans = await this.load();
        const routes: CandidateRoute[] = plans.flatMap((p) => p.routes.filter((r) => r.authorityId === a.id).map((r) => ({ id: r.id, data: r.data as Record<string, any>, stage: 'dataset' as const, isNew: true })));
        return { routes, note: `${routes.length} from ${plans.map((p) => p.key).join(', ') || 'no dataset files'}` };
      },
    };
  }
}

/**
 * Pipeline B (scripts/trails) on the local PBF for one admin relation —
 * named OSM route relations (stage 'osm') and generated loops (stage
 * 'generated'). Runs at most once per authority; both providers share it.
 */
export class TrailsRun {
  private result: Promise<{ named: CandidateRoute[]; generated: CandidateRoute[]; note: string }> | null = null;
  constructor(private a: AuthorityCtx, private relationId: number | null, private relationNote: string, private outRoot: string, private enabled: boolean) {}

  private run() {
    if (!this.result) this.result = this.exec();
    return this.result;
  }

  private async exec() {
    if (!this.enabled) return { named: [], generated: [], note: 'OSM stage disabled (--skip-osm)' };
    if (!this.relationId) return { named: [], generated: [], note: `no OSM admin relation: ${this.relationNote}` };
    const area = `a-${this.a.id}`;
    const opts = { relationId: this.relationId, area, outRoot: this.outRoot };
    await runBuildSegmentGraph(opts);
    await runImportNamedRoutes(opts);
    const dir = path.join(this.outRoot, area);
    const read = (f: string): { routes: TrailRoute[]; meta?: { osmTimestamp?: string | null } } => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    const named = read('named-routes.json');
    const gen = read('generated-routes.json');
    const auth = { id: this.a.id, name: this.a.name, knownAuthorityIds: this.a.knownAuthorityIds };
    const ctx = { osmTimestamp: named.meta?.osmTimestamp ?? null, importBatchId: `nationwide-trails-${this.a.id}` };
    const toCand = (docs: Array<{ id: string; data: Record<string, unknown> }>, stage: 'osm' | 'generated'): CandidateRoute[] =>
      docs.map((d) => ({ id: d.id, data: d.data as Record<string, any>, stage, isNew: true }));
    return {
      named: toCand(validatedRouteDocs(named.routes, auth, ctx), 'osm'),
      generated: toCand(validatedRouteDocs(gen.routes, auth, ctx), 'generated'),
      note: `relation ${this.relationId} (${this.relationNote})`,
    };
  }

  osm(): StageProvider {
    return { key: 'osm', run: async () => { const r = await this.run(); return { routes: r.named, note: `${r.named.length} named — ${r.note}` }; } };
  }

  generated(): StageProvider {
    return { key: 'generated', run: async () => { const r = await this.run(); return { routes: r.generated, note: `${r.generated.length} generated — ${r.note}` }; } };
  }
}
