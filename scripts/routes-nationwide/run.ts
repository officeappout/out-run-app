/**
 * scripts/routes-nationwide/run.ts — the nationwide routes runner
 * (NATIONWIDE-PLAN.md W3, §3.4). DRY-RUN BY DEFAULT.
 *
 * For every authority (clients → big cities → regional councils → the rest),
 * one at a time: existing routes → known routes from web research (names +
 * citations matched to OSM geometry) → open datasets (W1.5) → OSM route relations
 * (pipeline B on the local Geofabrik PBF) → named OSM paths/promenades stitched
 * into named corridors → walking/running corridors beside bike paths (RC9:
 * MoT bph_infra_exist + OSM cycleways with a walkway) → park loops around big parks (W5:
 * known → perimeter → inner via GraphHopper) → pipeline B's generated loops →
 * GraphHopper foot_turns neighbourhood loops (named after the park / streets /
 * neighbourhood they pass). Every finding source always runs; the two
 * generating stages run ONLY if the quota is still short. Each step is scored (routeScore v1.3: shade where the city
 * has a layer, turns/zigzag on loops; urban candidates measured on the OSM slice — composition, lighting,
 * amenities ≤ 50 m, road crossings — src/lib/urban-measure) and the top-N set re-selected
 * (src/lib/route-score); once the quota minimum is met the generating stages are skipped.
 *
 *   npx tsx scripts/routes-nationwide/run.ts                          # whole country, dry-run, resumes automatically
 *   npx tsx scripts/routes-nationwide/run.ts --city=חיפה --city=ערד   # by authority name (repeatable)
 *   npx tsx scripts/routes-nationwide/run.ts --authority=<id>         # by id (repeatable)
 *   … --kind=municipal|regional  --limit=N  --pause-ms=2000
 *   … --datasets-dir=<dir>   (ofneidan.zip, bicycle_jer_2019.zip, bph_infra_exist.zip … downloaded by hand)
 *   … --skip-osm             (no PBF work — existing + datasets only, fast)
 *   … --graphhopper-url=https://graphhopper-….run.app   (live GH: park inner loops + neighbourhood loops;
 *                              ID token from the Firebase Admin SA in .env.local; without it both are skipped)
 *   … --gh-max-calls=30      (hard cap of live GH requests per authority; answers cached in <out>/cache/gh)
 *   … --no-shade             (do not load the Technion / hourly shade layers)
 *   … --no-urban-measure     (RC9: do not measure composition / lighting / amenities / crossings on urban candidates)
 *   … --known-routes-dir=<dir> (web-research name files, default docs/routes/known-routes/<authorityId>.json)
 *   … --fresh                (ignore the checkpoint, start over)  --retry-errors
 *   … --out=<dir>            (default scripts/output/nationwide-<YYYY-MM-DD>)
 *   … --apply --project appout-1 [--write-candidates]   # OWNER ONLY
 *
 * Resume: <out>/checkpoint.json — stop at any time (Ctrl-C) and run the same
 * command again; finished authorities are skipped. A dry-run checkpoint is
 * never continued in --apply mode (or the reverse).
 *
 * Writes (only --apply, after TARGET + typed YES, per authority):
 *   - NEW selected routes → official_routes, create-only, through
 *     trails-apply's planCollection/executePlan (buildValidatedDoc at the
 *     write site). With --write-candidates, new non-selected routes are also
 *     created, marked selection:'candidate' (owner decision Q13) — do NOT use
 *     this before the review queue hides candidates (W4).
 *   - route_scores/{routeId} for every route in the pool (W2).
 *   Existing official_routes are never modified — a trim proposal for an
 *   over-quota city (Haifa, Herzliya; owner Q14) lives in route_scores only.
 * The runner holds no route-collection write of its own (allowlists unchanged).
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import * as fs from 'fs';
import * as path from 'path';
import { boundaryFromStored, type AuthorityBoundary } from '../../src/lib/dataset-import';
import { writeRouteScoreDocs } from '../../src/lib/route-score';
import {
  buildAdminNameIndex, checkpointMismatch, normalizeAuthorityName, filterAuthorities, markDone, matchAdminRelation, newCheckpoint, orderAuthorities, parseCheckpoint, remaining,
  combineEnrichers, runAuthorityStages, summarizeAuthority, summarizeNation, type AdminRelation, type AuthorityRow, type AuthoritySummary, type Checkpoint,
} from '../../src/lib/routes-nationwide';
import { PRODUCTION_PROJECT, confirmTypedYes, describeTarget, executePlan, flagValue, formatPlan, openTarget, planCollection } from '../trails/lib/trails-apply.node';
import { assertOsmium, ensureIsraelPbf } from '../trails/lib/pilot-osm.node';
import { loadAdminRelations } from './lib/admin-index.node';
import { DatasetCatalog, TrailsRun, existingProvider, type AuthorityCtx } from './lib/providers.node';
import { AuthorityOsmSlice } from './lib/authority-osm.node';
import { authorityGh, createRunnerGhClient } from './lib/gh-client.node';
import { namedWaysProvider, neighbourhoodProvider, parkLoopsProvider } from './lib/gh-stages.node';
import { KNOWN_ROUTES_DIR, KnownRoutesStage } from './lib/known-routes.node';
import { createShadeLoaders, shadeEnricher, type ShadeLoaders } from './lib/shade-enrich.node';
import { urbanEnricher } from './lib/urban-enrich.node';
import { bikeAdjacentProvider } from './lib/bike-adjacent.node';

const argv = process.argv.slice(2);
const flagAll = (name: string) => argv.filter((a) => a.startsWith(`--${name}=`)).map((a) => a.slice(name.length + 3)).filter(Boolean);
const APPLY = argv.includes('--apply');
const WRITE_CANDIDATES = argv.includes('--write-candidates');
const SKIP_OSM = argv.includes('--skip-osm');
const FRESH = argv.includes('--fresh');
const RETRY_ERRORS = argv.includes('--retry-errors');
const NO_SURFACE_JOIN = argv.includes('--no-surface-join');
const KIND = flagValue(argv, 'kind') as 'municipal' | 'regional' | null;
const LIMIT = Number(flagValue(argv, 'limit') ?? 0) || null;
const PAUSE_MS = Number(flagValue(argv, 'pause-ms') ?? 1000);
const DATASETS_DIR = flagValue(argv, 'datasets-dir');
const OUT = flagValue(argv, 'out') ?? path.join('scripts', 'output', `nationwide-${new Date().toISOString().slice(0, 10)}`);
const TRAILS_OUT = path.join(OUT, 'trails');
const GH_URL = flagValue(argv, 'graphhopper-url') ?? process.env.GRAPHHOPPER_URL ?? null;
const GH_MAX_CALLS = Math.max(0, Number(flagValue(argv, 'gh-max-calls') ?? 30) || 0);
const NO_SHADE = argv.includes('--no-shade');
const NO_URBAN_MEASURE = argv.includes('--no-urban-measure');
const KNOWN_DIR = flagValue(argv, 'known-routes-dir') ?? KNOWN_ROUTES_DIR;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let stopRequested = false;
process.on('SIGINT', () => {
  if (stopRequested) process.exit(130);
  stopRequested = true;
  console.log('\n⏸  Stop requested — finishing the current authority, then saving the checkpoint. (Ctrl-C again to abort now.)');
});

function readCheckpoint(file: string): Checkpoint | null {
  return fs.existsSync(file) ? parseCheckpoint(fs.readFileSync(file, 'utf8')) : null;
}

function writeJson(file: string, v: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(v, null, 2));
  fs.renameSync(`${file}.tmp`, file);
}

function printAuthority(s: AuthoritySummary) {
  const surf = s.surface.selected;
  console.log(`  selected ${s.selected.total}/${s.quota.min}-${s.quota.max} (${s.selected.existing} existing + ${s.selected.new} new) · pool ${s.pool} · 🟢${s.bands.green} 🟡${s.bands.yellow} 🔴${s.bands.red} · quota met after: ${s.quotaMetAfter ?? '—'}`);
  console.log(`  surface selected: paved ${surf.walk_run_paved ?? 0} · offroad ${surf.hike_offroad ?? 0} · bike road ${surf.bike_road ?? 0} · bike offroad ${surf.bike_offroad ?? 0} · unknown ${surf.unknown ?? 0}`);
  for (const st of s.stages) console.log(`    ${st.ran ? '▸' : '·'} ${st.key.padEnd(13)} ${st.ran ? `+${st.added} (offered ${st.offered}, dup ${st.droppedDuplicate})` : ''} ${st.note ?? ''}`);
}

async function main() {
  if (APPLY && !flagValue(argv, 'project')) throw new Error('--apply needs --project <id> (production: --project appout-1)');
  const target = await openTarget(flagValue(argv, 'project') ?? PRODUCTION_PROJECT);
  console.log(`TARGET: ${describeTarget(target)} — ${APPLY ? 'APPLY (writes after a typed YES per authority)' : 'read-only (dry-run)'}`);
  console.log(`OUT: ${OUT}`);

  // ── authorities (read) ──
  const snap = await target.db.collection('authorities').select('name', 'type', 'population', 'isActiveClient', 'parentAuthorityId').get();
  const knownAuthorityIds = new Set(snap.docs.map((d) => d.id));
  const rows: AuthorityRow[] = snap.docs.map((d) => {
    const a = d.data();
    return {
      id: d.id, name: String(a?.name ?? d.id).trim(), type: a?.type ?? null,
      population: typeof a?.population === 'number' ? a.population : null,
      isActiveClient: a?.isActiveClient === true,
      parentAuthorityId: typeof a?.parentAuthorityId === 'string' && a.parentAuthorityId ? a.parentAuthorityId : null,
    };
  });
  const ordered = filterAuthorities(orderAuthorities(rows), { authorityIds: flagAll('authority'), cities: flagAll('city'), kind: KIND, limit: LIMIT });
  console.log(`authorities: ${rows.length} docs → ${orderAuthorities(rows).length} route targets → ${ordered.length} in this run`);
  if (!ordered.length) return;

  // ── checkpoint ──
  const cpFile = path.join(OUT, 'checkpoint.json');
  let cp = FRESH ? null : readCheckpoint(cpFile);
  if (cp) {
    const mm = checkpointMismatch(cp, APPLY);
    if (mm) throw new Error(mm);
    const extra = ordered.map((a) => a.id).filter((id) => !cp!.order.includes(id));
    if (extra.length) cp = { ...cp, order: [...cp.order, ...extra] };
    console.log(`checkpoint: resuming ${cp.runId} — ${Object.keys(cp.done).length} done`);
  } else {
    cp = newCheckpoint(`nationwide-${new Date().toISOString()}`, ordered.map((a) => a.id), APPLY);
  }
  const inRun = new Set(ordered.map((a) => a.id));
  const todo = remaining(cp, RETRY_ERRORS).filter((id) => inRun.has(id));
  console.log(`to do now: ${todo.length}`);
  writeJson(cpFile, cp);

  // ── shared heavy inputs (lazy) ──
  let adminIdx: Map<string, AdminRelation[]> | null = null;
  const adminIndex = () => {
    if (!adminIdx) {
      assertOsmium();
      return ensureIsraelPbf().then((pbf) => (adminIdx = buildAdminNameIndex(loadAdminRelations(pbf, path.join(OUT, 'cache')))));
    }
    return Promise.resolve(adminIdx);
  };
  const datasets = new DatasetCatalog(DATASETS_DIR, async () => {
    const b = await target.db.collection('authorities').select('name', 'boundaryGeoJSON').get();
    const boundaries: AuthorityBoundary[] = [];
    const cityByAuthority: Record<string, string> = {};
    for (const d of b.docs) {
      cityByAuthority[d.id] = String(d.data()?.name ?? '');
      const g = boundaryFromStored(d.data()?.boundaryGeoJSON);
      if (g) boundaries.push({ id: d.id, name: cityByAuthority[d.id], geometry: g });
    }
    return { boundaries, cityByAuthority };
  }, console.log);

  // Explicit admin relation ids win over name matching: city_registrations.adminRelationId (read-only).
  const regSnap = await target.db.collection('city_registrations').get();
  const registeredRelation = new Map<string, number>();
  for (const d of regSnap.docs) {
    const r = d.data();
    if (typeof r?.adminRelationId === 'number' && typeof r?.label === 'string') registeredRelation.set(normalizeAuthorityName(r.label), r.adminRelationId);
  }
  console.log(`city_registrations with adminRelationId: ${registeredRelation.size}`);

  const gh = createRunnerGhClient(GH_URL);
  console.log(`GraphHopper: ${gh.client ? `${gh.note} — ≤ ${GH_MAX_CALLS} live call(s) per authority` : `${gh.note} — park inner loops + neighbourhood loops skipped`}`);
  let shadeLoaders: ShadeLoaders | null = null;
  if (!NO_SHADE) shadeLoaders = await createShadeLoaders(target, (s) => console.log(`  ${s}`));

  const byId = new Map(ordered.map((a) => [a.id, a]));
  for (const id of todo) {
    if (stopRequested) break;
    const a = byId.get(id)!;
    console.log(`\n■ ${a.name} [${a.id}] — ${a.tier}${a.population ? `, pop ${a.population.toLocaleString('en')}` : ''}`);
    try {
      let relationId: number | null = null;
      let relationNote = 'OSM stage skipped';
      if (!SKIP_OSM) {
        const reg = registeredRelation.get(normalizeAuthorityName(a.name));
        if (reg) { relationId = reg; relationNote = 'city_registrations.adminRelationId'; }
        else {
          const m = matchAdminRelation(a.name, await adminIndex());
          relationId = m.relationId;
          relationNote = m.reason;
        }
      }
      const ctx: AuthorityCtx = { id: a.id, name: a.name, knownAuthorityIds };
      const trails = new TrailsRun(ctx, relationId, relationNote, TRAILS_OUT, !SKIP_OSM);
      const stored = SKIP_OSM ? null : boundaryFromStored((await target.db.collection('authorities').doc(a.id).get()).get('boundaryGeoJSON'));
      const slice = new AuthorityOsmSlice(a, stored, relationId, path.join(OUT, 'parks'));
      const ghA = SKIP_OSM ? null : authorityGh(gh.client, path.join(OUT, 'cache', 'gh'), a.id, GH_MAX_CALLS);
      const shade = await shadeEnricher(shadeLoaders, a.name);
      console.log(`  ${shade.note}`);
      const urban = urbanEnricher(SKIP_OSM || NO_URBAN_MEASURE ? null : slice);
      const batch = `nationwide-${a.id}`;
      const known = new KnownRoutesStage(ctx, KNOWN_DIR, slice, trails, batch, !SKIP_OSM);
      let result;
      try {
        result = await runAuthorityStages(a, [
          existingProvider(target.db, ctx, { surfaceJoin: !NO_SURFACE_JOIN }),
          known.provider(),
          datasets.provider(ctx),
          trails.osm(),
          ...(SKIP_OSM ? [] : [namedWaysProvider(ctx, slice, batch), bikeAdjacentProvider(ctx, slice, datasets, batch), parkLoopsProvider(ctx, slice, ghA, batch)]),
          trails.generated(),
          ...(SKIP_OSM ? [] : [neighbourhoodProvider(ctx, slice, ghA, batch)]),
        ], new Date(), { enrich: combineEnrichers(shade.enrich, urban.enrich) });
      } finally {
        slice.cleanup();
      }
      const summary = { ...summarizeAuthority(result, { name: a.name, tier: a.tier }), gh: ghA?.stats() ?? null, shade: shade.note, urbanMeasure: { ...urban.stats, note: urban.note() }, knownRoutes: known.report };
      console.log(`  ${urban.note()}`);
      writeJson(path.join(OUT, 'authorities', `${a.id}.json`), summary);
      printAuthority(summary);

      if (APPLY) await applyAuthority(target, a, result, knownAuthorityIds);
      cp = markDone(cp, { authorityId: a.id, name: a.name, finishedAt: new Date().toISOString(), status: 'done' });
    } catch (e) {
      console.error(`  ✖ ${(e as Error).message}`);
      cp = markDone(cp, { authorityId: a.id, name: a.name, finishedAt: new Date().toISOString(), status: 'error', note: (e as Error).message.slice(0, 500) });
    }
    writeJson(cpFile, cp);
    if (PAUSE_MS > 0) await sleep(PAUSE_MS);
  }

  // ── national roll-up from every saved authority summary ──
  const dir = path.join(OUT, 'authorities');
  const all: AuthoritySummary[] = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))) : [];
  const nation = summarizeNation(all);
  writeJson(path.join(OUT, 'summary.json'), { generatedAt: new Date().toISOString(), apply: APPLY, checkpoint: { done: Object.keys(cp.done).length, of: cp.order.length }, ...nation });
  console.log(`\nNATIONAL (${nation.authorities} authorities so far): selected ${nation.selected} (${nation.selectedNew} new) · new proposed ${nation.newProposed} · quota met ${nation.quotaMet} · 🟢${nation.bands.green} 🟡${nation.bands.yellow} 🔴${nation.bands.red}`);
  console.log(`surface selected: ${JSON.stringify(nation.surfaceSelected)}`);
  console.log(`summary: ${path.join(OUT, 'summary.json')}${stopRequested ? ' — stopped early; run the same command to continue' : ''}`);
  if (!APPLY) console.log('Dry run only — no Firestore writes.');
}

async function applyAuthority(
  target: Awaited<ReturnType<typeof openTarget>>,
  a: AuthorityRow,
  result: Awaited<ReturnType<typeof runAuthorityStages>>,
  knownAuthorityIds: Set<string>,
) {
  const selected = new Set(result.score.selection.selectedIds);
  const rowById = new Map(result.score.selection.rows.map((r) => [r.id, r]));
  const fresh = result.pool.filter((p) => p.isNew && (selected.has(p.id) || WRITE_CANDIDATES));
  const docs = fresh.map((p) => ({
    id: p.id,
    data: { ...p.data, selection: selected.has(p.id) ? 'selected' : 'candidate', selectionReason: rowById.get(p.id)?.reason ?? null },
  }));
  const plan = await planCollection(target.db, 'official_routes', docs, 'create_only', a.id);
  plan.knownAuthorityIds = knownAuthorityIds;
  console.log(`  APPLY plan: ${formatPlan(plan)} · route_scores: ${result.score.docs.length}`);
  const ok = await confirmTypedYes(`  Type YES to write ${plan.create.length} route(s) + ${result.score.docs.length} route_scores for ${a.name} to ${describeTarget(target)}: `);
  if (!ok) { console.log('  not confirmed — nothing written for this authority'); return; }
  if (plan.create.length) await executePlan(target.db, plan);
  await writeRouteScoreDocs(target.db as any, result.score.docs);
  console.log('  ✅ written');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
