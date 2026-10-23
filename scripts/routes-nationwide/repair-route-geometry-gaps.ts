/**
 * scripts/routes-nationwide/repair-route-geometry-gaps.ts — repair of the
 * pending official_routes whose `path` was built with STRAIGHT BRIDGES between
 * disconnected pieces of an OSM route relation (found 24.10.2026: "שביל גולני ·
 * קטע מטה בנימין", 11.4 km of trail drawn with a 13.8 km chord).
 *
 * Approach: ARCHIVE, then REGENERATE with the fixed pipeline.
 *   - Detection is exact: consecutive `trail.segmentIds` that do not share an OSM node
 *     (src/lib/routes-nationwide/geometry-gaps.ts). No distance threshold, so a legitimately
 *     sparse straight way is never touched. Docs without segment ids are only REPORTED.
 *   - Only docs that are origin 'osm_import', status 'pending' AND published false are touched.
 *     Published / approved / archived docs are never written.
 *   - A touched doc is archived with exactly the approval center's reject shape and
 *     rejectionReason 'geometry gap — regenerate'. Nothing is deleted; the doc stays
 *     restorable from the approval center.
 *   - Then re-run the nationwide runner for the affected councils (the command is printed and
 *     saved in plan.json). The fixed pipeline emits each continuous chain as its own route with
 *     NEW ids (osm_rel_<id>_p<N>__<authorityId>) — they cannot collide with the archived
 *     originals, so create-only is not blocked.
 *
 * (Writes go through lib/geometry-gap-apply.node.ts — the chokepoint-migrated writer; this CLI only reads and plans.)
 * DEFAULT = DRY-RUN (reads prod only).
 *   npx tsx scripts/routes-nationwide/repair-route-geometry-gaps.ts [--out <dir>]
 *   npx tsx scripts/routes-nationwide/repair-route-geometry-gaps.ts --apply --project appout-1   # typed YES
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import * as fs from 'fs';
import * as path from 'path';
import { analyzeGapDoc, estimateParts, shortAuthorityName, type GapDocReport } from '../../src/lib/routes-nationwide';
import { parsePathLoose } from './lib/path';
import { applyGapArchives, gapArchivePayload, type GapArchiveWrite } from './lib/geometry-gap-apply.node';
import { readAllOfficialRoutes } from '../lib/route-collections-read.node';
import { confirmTypedYes, describeTarget, flagValue, openTarget, PRODUCTION_PROJECT } from '../trails/lib/trails-apply.node';

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const OUT_DIR = flagValue(argv, 'out') ?? path.join('scripts', 'output', `repair-route-geometry-gaps-${new Date().toISOString().replace(/[:.]/g, '-')}`);

const km = (m: number) => `${(m / 1000).toFixed(1)}`;

async function main() {
  if (APPLY && flagValue(argv, 'project') !== PRODUCTION_PROJECT) throw new Error('--apply needs --project appout-1');
  const target = await openTarget(PRODUCTION_PROJECT);
  console.log(`TARGET: ${describeTarget(target)} — ${APPLY ? 'WILL WRITE after confirmation' : 'read-only (dry-run)'}`);

  const authSnap = await target.db.collection('authorities').select('name').get();
  const knownAuthorityIds = new Set<string>(authSnap.docs.map((d) => d.id));
  const authName = new Map(authSnap.docs.map((d) => [d.id, String(d.data()?.name ?? d.id)]));

  const docs = await readAllOfficialRoutes(target.db);
  console.log(`official_routes read: ${docs.length}`);

  type Row = GapDocReport & { authorityId: string | null; authority: string; name: string; origin: string | null; status: string | null; published: boolean; km: number; estimate: ReturnType<typeof estimateParts> | null };
  const rows: Row[] = [];
  const writes: GapArchiveWrite[] = [];
  for (const d of docs) {
    const x = d.data;
    const p = parsePathLoose(x.path);
    const rep = analyzeGapDoc({
      id: d.id,
      authorityId: typeof x.authorityId === 'string' ? x.authorityId : null,
      name: String(x.name ?? ''),
      origin: typeof x.origin === 'string' ? x.origin : null,
      status: typeof x.status === 'string' ? x.status : null,
      published: x.published === true,
      km: Number(x.distance) || 0,
      path: p,
      trailKind: typeof x.trail?.kind === 'string' ? x.trail.kind : null,
      segmentIds: x.trail?.segmentIds,
      segmentForward: x.trail?.segmentForward,
      trailLengthM: typeof x.trail?.stats?.lengthM === 'number' ? x.trail.stats.lengthM : null,
    });
    if (!rep.affected) continue;
    const authorityId = typeof x.authorityId === 'string' ? x.authorityId : null;
    rows.push({
      ...rep, authorityId, authority: authorityId ? shortAuthorityName(authName.get(authorityId) ?? authorityId) : '(none)',
      name: String(x.name ?? ''), origin: x.origin ?? null, status: x.status ?? null, published: x.published === true, km: Number(x.distance) || 0,
      estimate: rep.discontinuities ? estimateParts(p, rep.discontinuities) : null,
    });
    // Only the exact (segment-walk) findings in scope are ever written. path_gap_unverified is report-only.
    if (rep.inRepairScope && rep.basis === 'segment_walk' && authorityId && d.updateTime) {
      writes.push({ id: d.id, authorityId, city: typeof x.city === 'string' ? x.city : null, updateTime: d.updateTime });
    }
  }
  for (const w of writes) gapArchivePayload(w, knownAuthorityIds); // chokepoint now, in dry-run too

  const inScope = rows.filter((r) => r.inRepairScope && r.basis === 'segment_walk');
  const outOfScope = rows.filter((r) => !(r.inRepairScope && r.basis === 'segment_walk'));
  console.log(`\nAFFECTED (exact: consecutive segments not joined): ${rows.filter((r) => r.basis === 'segment_walk').length}`);
  console.log(`  → WOULD ARCHIVE (pending + unpublished + osm_import): ${inScope.length}`);
  console.log(`  → report only, never written: ${outOfScope.length} (published / not pending / no segment ids)`);
  const byOrigin = new Map<string, number>();
  for (const r of inScope) byOrigin.set(r.origin ?? '(none)', (byOrigin.get(r.origin ?? '(none)') ?? 0) + 1);
  console.log(`  by origin: ${JSON.stringify(Object.fromEntries(byOrigin))}`);
  const byAuth = new Map<string, { id: string; n: number; km: number; est: number }>();
  for (const r of inScope) {
    const a = byAuth.get(r.authority) ?? { id: r.authorityId ?? '', n: 0, km: 0, est: 0 };
    a.n++; a.km += r.km; a.est += r.estimate?.expectedRoutes ?? 0;
    byAuth.set(r.authority, a);
  }
  console.log(`  councils: ${byAuth.size}; top 15:`);
  for (const [name, a] of Array.from(byAuth).sort((x, y) => y[1].n - x[1].n).slice(0, 15)) console.log(`    ${name}: ${a.n} doc(s), ${a.km.toFixed(0)} km stored, ~${a.est} route(s) expected after regeneration`);
  console.log(`  estimate: ${inScope.length} archived → ~${inScope.reduce((s, r) => s + (r.estimate?.expectedRoutes ?? 0), 0)} regenerated route(s) (before quota selection)`);
  console.log('  examples:');
  for (const r of inScope.sort((a, b) => b.maxGapM - a.maxGapM).slice(0, 8)) {
    console.log(`    ${r.id} | ${r.name} | ${r.authority} | stored ${r.km} km | longest bridge ${km(r.maxGapM)} km | ${r.discontinuities} bridge(s) | ~pieces km: ${(r.estimate?.pieceM ?? []).slice(0, 5).map(km).join(' / ')}`);
  }
  const unverified = rows.filter((r) => r.basis === 'path_gap_unverified');
  if (unverified.length) console.log(`  path step ≥ 500 m but no segment ids to verify (report only): ${unverified.length} — ${unverified.slice(0, 5).map((r) => `${r.id}(${r.maxGapM}m)`).join(', ')}`);

  const authorityIds = Array.from(new Set(inScope.map((r) => r.authorityId).filter((x): x is string => !!x))).sort();
  const regenCmd = `npx tsx scripts/routes-nationwide/run.ts ${authorityIds.map((id) => `--authority=${id}`).join(' ')} --fresh --out=scripts/output/nationwide-geom-regen [--datasets-dir=<same as the original run>] --apply --project appout-1`;
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'plan.json'), JSON.stringify({ generatedAt: new Date().toISOString(), apply: APPLY, wouldArchive: inScope.length, reportOnly: outOfScope.length, authorityIds, regenCmd, rows: rows.map(({ estimate, ...r }) => ({ ...r, estimate })) }, null, 1));
  console.log(`\nplan: ${path.join(OUT_DIR, 'plan.json')}`);
  console.log(`AFTER the archive, regenerate with the FIXED pipeline (dry-run first: drop --apply --project):\n  ${regenCmd}`);

  if (!APPLY) { console.log('\nDry run only — no Firestore writes.'); return; }
  if (!(await confirmTypedYes(`Type YES to ARCHIVE ${writes.length} pending route(s) in ${describeTarget(target)}: `))) { console.log('not confirmed — nothing written'); return; }
  const r = await applyGapArchives(target.db, writes, knownAuthorityIds);
  console.log(`archived ${r.written}, conflicts ${r.conflicts.length}${r.conflicts.length ? `: ${r.conflicts.join(', ')}` : ''}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
