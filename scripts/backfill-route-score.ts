/**
 * scripts/backfill-route-score.ts — NATIONWIDE-PLAN.md W2.
 *
 * Scores every non-archived official_routes doc with routeScore v1
 * (src/lib/route-score), runs the per-authority top-N selection (§3.7) and
 * reports it. DRY-RUN BY DEFAULT: reads only, writes a summary JSON locally.
 *
 *   npx tsx scripts/backfill-route-score.ts                         # dry-run, all authorities (reads Firestore)
 *   npx tsx scripts/backfill-route-score.ts --authority=<id>        # one authority
 *   npx tsx scripts/backfill-route-score.ts --city=חיפה             # one city (by route.city)
 *   npx tsx scripts/backfill-route-score.ts --from-json=<file>      # offline: [{id,data}] or {routes,authorities}
 *   npx tsx scripts/backfill-route-score.ts --apply --project appout-1   # owner only — writes route_scores
 *
 * Target: FIRESTORE_EMULATOR_HOST when set, otherwise production (read-only
 * unless --apply). --apply writes ONLY `route_scores/{routeId}` (full replace,
 * derived data) — never official_routes, so the "selection" of an existing
 * over-quota city (Haifa, Herzliya — owner decision Q14) is a dry-run
 * proposal until the owner applies it. Prints TARGET first and asks for a
 * typed YES (guards reused from scripts/trails/lib/trails-apply.node.ts).
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import * as fs from 'fs';
import * as path from 'path';
import { buildSegmentIndex, parsePath, scoreAuthorityRoutes, surfaceMixFromSegments, writeRouteScoreDocs, type AuthorityScoreRun, type RouteScoreDoc, type SurfaceSegment } from '../src/lib/route-score';
import { PRODUCTION_PROJECT, confirmTypedYes, describeTarget, flagValue, openTarget } from './trails/lib/trails-apply.node';
import { readAllOfficialRoutes, readStreetSegmentSurfaces } from './lib/route-collections-read.node';

type Doc = Record<string, any>;
interface RouteRow { id: string; data: Doc }
interface AuthorityMeta { id: string; name: string; type: string | null; population: number | null }

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const ONLY_AUTHORITY = flagValue(argv, 'authority');
const ONLY_CITY = flagValue(argv, 'city');
const FROM_JSON = flagValue(argv, 'from-json');
const OUT_DIR = flagValue(argv, 'out') ?? path.join('scripts', 'output', `route-score-${new Date().toISOString().replace(/[:.]/g, '-')}`);
const PAGE = 300;
const NO_SURFACE_JOIN = argv.includes('--no-surface-join');

async function loadFromFirestore(db: FirebaseFirestore.Firestore): Promise<{ routes: RouteRow[]; authorities: Map<string, AuthorityMeta> }> {
  const routes: RouteRow[] = await readAllOfficialRoutes(db as any, { authorityId: ONLY_AUTHORITY, pageSize: PAGE });
  const ids = Array.from(new Set(routes.map((r) => r.data?.authorityId).filter((x): x is string => typeof x === 'string' && !!x)));
  const authorities = new Map<string, AuthorityMeta>();
  for (let k = 0; k < ids.length; k += 100) {
    const refs = ids.slice(k, k + 100).map((id) => db.collection('authorities').doc(id));
    const snaps = await db.getAll(...refs);
    for (const s of snaps) {
      if (!s.exists) continue;
      const a = s.data() ?? {};
      authorities.set(s.id, { id: s.id, name: String(a?.name ?? s.id), type: a?.type ?? null, population: typeof a?.population === 'number' ? a.population : null });
    }
  }
  return { routes, authorities };
}

function loadFromJson(file: string): { routes: RouteRow[]; authorities: Map<string, AuthorityMeta> } {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const routes: RouteRow[] = (Array.isArray(raw) ? raw : raw?.routes ?? []).map((r: Doc) => ({ id: String(r.id), data: r.data ?? r }));
  const authorities = new Map<string, AuthorityMeta>();
  for (const a of raw?.authorities ?? []) authorities.set(a.id, { id: a.id, name: a.name ?? a.id, type: a.type ?? null, population: a.population ?? null });
  return { routes, authorities };
}

function label0(rows: RouteRow[], meta: AuthorityMeta | undefined, key: string): string {
  return meta?.name ?? rows[0]?.data?.city ?? key;
}

function groupKey(r: RouteRow): string {
  return r.data?.authorityId ? `auth:${r.data.authorityId}` : `city:${r.data?.city ?? '(none)'}`;
}

function printRun(label: string, run: AuthorityScoreRun, n: number) {
  const q = run.quota;
  console.log(`\n■ ${label} — ${n} route(s), size=${q.sizeClass}${q.populationKnown ? '' : ' (population unknown)'}, quota ${q.total.min}-${q.total.max}`);
  console.log(`  bands: 🟢 ${run.bands.green}  🟡 ${run.bands.yellow}  🔴 ${run.bands.red}`);
  const c = run.selection.counts;
  console.log(`  selection: selected ${c.selected}/${q.total.max} (park loops ${c.parkLoops}, cycling ${c.cycling}) · candidate ${c.candidate} · manual review ${c.manual_review} · rejected ${c.rejected}`);
  const sel = run.selection.selectedBySurface;
  const all = run.bySurface;
  console.log(`  surface (selected/all): walk-run paved ${sel.walk_run_paved}/${all.walk_run_paved ?? 0} · hike offroad ${sel.hike_offroad}/${all.hike_offroad ?? 0} · bike road ${sel.bike_road}/${all.bike_road ?? 0} · bike offroad ${sel.bike_offroad}/${all.bike_offroad ?? 0} · unknown ${sel.unknown}/${all.unknown ?? 0}`);
  const top = [...run.scored].sort((a, b) => b.score.score - a.score.score).slice(0, 5);
  for (const s of top) {
    const row = run.selection.rows.find((r) => r.id === s.input.id);
    console.log(`    ${String(s.score.score).padStart(3)} (${s.score.confidence.toFixed(2)}, ${s.score.band}) ${row?.decision.padEnd(13)} ${s.input.sourceTier.padEnd(11)} ${s.input.name}`);
  }
}

async function main() {
  const projectId = flagValue(argv, 'project') ?? PRODUCTION_PROJECT;
  if (APPLY && !flagValue(argv, 'project')) throw new Error('--apply needs --project <id> (production: --project appout-1)');
  if (APPLY && FROM_JSON) throw new Error('--apply cannot be combined with --from-json');

  let data: { routes: RouteRow[]; authorities: Map<string, AuthorityMeta> };
  let target: Awaited<ReturnType<typeof openTarget>> | null = null;
  if (FROM_JSON) {
    console.log(`SOURCE: ${FROM_JSON} (offline, no Firestore)`);
    data = loadFromJson(FROM_JSON);
  } else {
    target = await openTarget(projectId);
    console.log(`TARGET: ${describeTarget(target)} — ${APPLY ? 'WILL WRITE route_scores after confirmation' : 'read-only (dry-run)'}`);
    data = await loadFromFirestore(target.db);
  }

  const live = data.routes.filter((r) => r.data?.status !== 'archived' && (!ONLY_CITY || r.data?.city === ONLY_CITY) && (!ONLY_AUTHORITY || r.data?.authorityId === ONLY_AUTHORITY));
  const groups = new Map<string, RouteRow[]>();
  for (const r of live) {
    const k = groupKey(r);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(r);
  }
  console.log(`Loaded ${data.routes.length} route(s); scoring ${live.length} non-archived in ${groups.size} authority/city group(s).`);

  const now = new Date();
  const allDocs: RouteScoreDoc[] = [];
  const summary: Doc[] = [];
  for (const [key, rows] of Array.from(groups.entries()).sort((a, b) => b[1].length - a[1].length)) {
    const authId = key.startsWith('auth:') ? key.slice(5) : null;
    const meta = authId ? data.authorities.get(authId) : undefined;
    // Surface join (owner 21.10): paved/unpaved share per route from this authority's street_segments.
    let withSurface: Array<RouteRow & { opts?: { surfaceMix: Partial<Record<string, number>> } }> = rows;
    if (authId && target && !NO_SURFACE_JOIN) {
      const segs = await readStreetSegmentSurfaces(target.db as any, authId);
      const surf: SurfaceSegment[] = segs
        .map((g) => ({ coords: parsePath(g.path ?? g.coordinates), surfaceType: typeof g.surfaceType === 'string' ? g.surfaceType : null }))
        .filter((g) => g.coords.length >= 2 && g.surfaceType && g.surfaceType !== 'unknown');
      if (surf.length) {
        const idx = buildSegmentIndex(surf);
        withSurface = rows.map((r) => ({ ...r, opts: { surfaceMix: surfaceMixFromSegments(parsePath(r.data?.path), idx) } }));
      }
      console.log(`\n  (${label0(rows, meta, key)}: ${segs.length} street_segments, ${surf.length} with a known surface)`);
    }
    const run = scoreAuthorityRoutes({ id: authId, type: meta?.type ?? null, population: meta?.population ?? null }, withSurface, now);
    const label = label0(rows, meta, key);
    printRun(`${label}${authId ? ` [${authId}]` : ' [NO authorityId]'}`, run, rows.length);
    allDocs.push(...run.docs);
    summary.push({
      key, authorityId: authId, name: label, routes: rows.length, quota: run.quota, bands: run.bands, selection: run.selection.counts,
      surface: { all: run.bySurface, selected: run.selection.selectedBySurface },
      routesDetail: run.docs.map((d) => ({ id: d.routeId, name: d.name, score: d.score, confidence: d.confidence, band: d.band, sourceTier: d.sourceTier, surfaceClass: d.surfaceClass, pavedShare: d.surface.pavedShare, unpavedShare: d.surface.unpavedShare, surfaceSource: d.surface.source, certificate: d.certificate, selection: d.selection, reason: d.selectionReason })),
    });
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const file = path.join(OUT_DIR, 'summary.json');
  fs.writeFileSync(file, JSON.stringify({ generatedAt: now.toISOString(), apply: APPLY, groups: summary }, null, 2));
  const tot = allDocs.reduce((acc, d) => { acc[d.band]++; if (d.selection) acc[d.selection]++; return acc; }, { green: 0, yellow: 0, red: 0, selected: 0, candidate: 0, manual_review: 0, rejected: 0 } as Record<string, number>);
  console.log(`\nTOTAL ${allDocs.length}: 🟢 ${tot.green} 🟡 ${tot.yellow} 🔴 ${tot.red} · selected ${tot.selected} · candidate ${tot.candidate} · manual review ${tot.manual_review} · rejected ${tot.rejected}`);
  console.log(`Summary: ${file}`);

  if (!APPLY) { console.log('\nDry run only — no Firestore writes. (--apply --project <id> writes route_scores; owner only.)'); return; }
  if (!target) return;
  const ok = await confirmTypedYes(`\nType YES to write ${allDocs.length} route_scores doc(s) to ${describeTarget(target)}: `);
  if (!ok) { console.log('Aborted — nothing written.'); return; }
  const n = await writeRouteScoreDocs(target.db as any, allDocs);
  console.log(`💾 Wrote ${n} route_scores doc(s).`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
