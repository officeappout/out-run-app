/**
 * One authority's inventory (RC4 I1 body, moved here for `--all`, RC8 step 4):
 * extract → measure → build → local summary (+ --apply via the I0 store).
 * Read-only unless `apply` is set.
 */
import * as path from 'path';
import { buildBoundaryIndex, buildCityInventory, formatCityReport, licensePendingKeys, type CityInventoryInput } from '../../../src/lib/city-inventory';
import { TECHNION_PERMISSION } from '../../../src/lib/shade/technion-layers';
import type { ApplyFlags, Target } from '../../trails/lib/trails-apply.node';
import { applyFlagErrors, applyInventory } from './apply.node';
import { extractInventoryFeatures } from './osm-extract.node';
import { readPeerRows, removeWorkDir, writeSummary, WORK_ROOT } from './output.node';
import { countApprovedRoutes, loadTechnionShade, readAuthority, type RouteCounts } from './prod-read.node';
import { loadLightingFromFile, loadLightingFromStorage } from './lighting-read.node';

export interface RunOneOptions {
  pbf: string;
  osmTs: string;
  noShade: boolean;
  noLighting: boolean;
  lightingFile: string | null;
  keepWork: boolean;
  flags: ApplyFlags;
  /** --all: the batch has no single --authority to match. */
  batch?: boolean;
  /** --all --apply: the owner typed YES once for the whole batch (count shown); reuse that answer. */
  confirm?: (question: string) => Promise<boolean>;
  log?: (s: string) => void;
}

export interface RunOneResult { inventory: CityInventoryInput; routes: RouteCounts; files: { json: string; md: string }; written: boolean }

async function timed<T>(timings: Record<string, number>, key: string, fn: () => Promise<T> | T): Promise<T> {
  const t0 = Date.now();
  try { return await fn(); } finally { timings[key] = Date.now() - t0; }
}

export async function runOneInventory(prod: Target, sel: { id: string | null; city: string | null }, o: RunOneOptions): Promise<RunOneResult> {
  const log = o.log ?? console.log;
  const timings: Record<string, number> = {};
  const t0 = Date.now();
  const osmSnapshotDate = o.osmTs.slice(0, 10);
  const authority = await timed(timings, 'authority', () => readAuthority(prod.db, sel));
  const boundary = buildBoundaryIndex(authority.boundary);
  if (!boundary) throw new Error(`authorities/${authority.id} (${authority.name}) has no usable boundaryGeoJSON — stopping (axioms §23: no boundary, no inventory)`);
  log(`AUTHORITY: ${authority.name} (${authority.id}, ${authority.type}, population ${authority.population ?? 'unknown'}) · boundary ${boundary.areaKm2} km²`);

  if (o.flags.apply) {
    const errs = o.batch ? applyFlagErrors({ ...o.flags, authority: authority.id }, authority.id) : applyFlagErrors(o.flags, authority.id);
    if (errs.length) throw new Error(`--apply refused:\n  - ${errs.join('\n  - ')}`);
  }

  const work = path.join(WORK_ROOT, authority.id);
  let features: Awaited<ReturnType<typeof extractInventoryFeatures>>;
  try {
    features = await timed(timings, 'osmExtract', () => extractInventoryFeatures(o.pbf, boundary, work));
  } finally {
    // The cuts are only needed by the extract itself; everything after works
    // from the parsed features. Removed on failure too, unless --keep-work.
    if (o.keepWork) log(`work dir kept: ${work}`);
    else if (removeWorkDir(work)) log(`work dir removed: ${work}`);
  }
  log(`OSM: ${features.ways.length} ways · ${features.nodes.length} tagged nodes · ${features.areas.length} polygons (bbox extract)`);

  const routes = await timed(timings, 'approvedRoutes', () => countApprovedRoutes(prod.db, authority));
  const shade = o.noShade ? null : await timed(timings, 'shadeLoad', () => loadTechnionShade(prod.app, prod.projectId, authority.name));
  log(`approved routes: ${routes.approved} (${routes.byAuthorityId} by authorityId + ${routes.byCityName} legacy by city name; ${routes.pending} pending, ${routes.noStatus} with no published flag) · shade: ${shade ? `${shade.choice.sourceKey} ${shade.segmentCount} segments (${shade.snapshotDate})` : 'none'}`);

  const lighting = o.noLighting
    ? null
    : await timed(timings, 'lightingLoad', () => (o.lightingFile ? loadLightingFromFile(o.lightingFile) : loadLightingFromStorage(prod.app, prod.projectId, authority.name)));
  if (lighting) log(`lighting: lighting/v1 ${lighting.file.city} — ${lighting.file.pieces.length} pieces, sources ${lighting.sources.map((s) => s.key).join(', ')}${lighting.pendingKeys.length ? ` (pending licence: ${lighting.pendingKeys.join(', ')})` : ''}`);
  const pendingKeys = licensePendingKeys(TECHNION_PERMISSION);
  for (const k of lighting?.pendingKeys ?? []) pendingKeys.add(k);

  const now = new Date();
  const runId = `ci-${now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}`;
  const { inventory, extras } = await timed(timings, 'build', () => buildCityInventory({
    authority: { id: authority.id, name: authority.name, type: authority.type, population: authority.population },
    boundary,
    features,
    osmSnapshotDate,
    approvedRoutes: routes.approved,
    shade,
    peers: readPeerRows(),
    lighting,
    licensePendingKeys: pendingKeys,
    now,
    runId,
    builtBy: 'scripts/city-inventory/run.ts',
  }));
  timings.total = Date.now() - t0;

  const report = formatCityReport(inventory, extras, routes.approved);
  const files = writeSummary({ kind: 'city-inventory-dry-run', generatedAt: now.toISOString(), apply: o.flags.apply, inventory, extras, approvedRoutes: routes, timingsMs: timings }, report);
  log(`\n${report}\n\nsummary: ${files.json}\ntable:   ${files.md}\ntimings (ms): ${JSON.stringify(timings)}`);

  let written = false;
  if (o.flags.apply) written = await applyInventory(prod, inventory, o.confirm);
  return { inventory, routes, files, written };
}
