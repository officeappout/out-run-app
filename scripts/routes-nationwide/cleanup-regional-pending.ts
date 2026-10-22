/**
 * scripts/routes-nationwide/cleanup-regional-pending.ts — cleanup of the
 * pending official_routes written by the first regional-councils nationwide
 * run (owner decisions 22.10.2026):
 *   1. strip OSM marking codes from names ("שביל אדום 10340 · נחל שורק" → "שביל אדום · נחל שורק");
 *   2. same-name routes across councils, judged by GEOMETRY: ≥60% overlap
 *      (30 m buffer) = true duplicate → the copy with the larger share of its
 *      length inside its own council boundary is kept, the others are
 *      ARCHIVED like the approval center's reject (never deleted);
 *      lower overlap = same trail, different sections → all kept, names
 *      disambiguated ("שביל ישראל · קטע לכיש").
 * Touches ONLY docs that are regional-council, importBatchId nationwide-*,
 * status 'pending' AND published false. Writes are guarded by read-time updateTime.
 *
 * DEFAULT = DRY-RUN (reads prod only). Writes only with --apply --project appout-1 + typed YES.
 *   npx tsx scripts/routes-nationwide/cleanup-regional-pending.ts [--out <dir>]
 *   npx tsx scripts/routes-nationwide/cleanup-regional-pending.ts --apply --project appout-1
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import * as fs from 'fs';
import * as path from 'path';
import { boundaryFromStored } from '../../src/lib/dataset-import';
import { planCleanup, shortAuthorityName, type CleanupDoc } from '../../src/lib/routes-nationwide';
import { pointInPolygonCoords } from '../../src/lib/trail-graph/geo';
import { parsePathLoose } from './lib/path';
import { applyCleanupWrites, cleanupPayload, type CleanupWrite } from './lib/cleanup-apply.node';
import { confirmTypedYes, describeTarget, flagValue, openTarget, PRODUCTION_PROJECT } from '../trails/lib/trails-apply.node';

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const OUT_DIR = flagValue(argv, 'out') ?? path.join('scripts', 'output', `cleanup-regional-pending-${new Date().toISOString().replace(/[:.]/g, '-')}`);

async function main() {
  if (APPLY && flagValue(argv, 'project') !== PRODUCTION_PROJECT) throw new Error('--apply needs --project appout-1');
  const target = await openTarget(PRODUCTION_PROJECT);
  console.log(`TARGET: ${describeTarget(target)} — ${APPLY ? 'WILL WRITE after confirmation' : 'read-only (dry-run)'}`);

  const authSnap = await target.db.collection('authorities').select('name', 'type', 'boundaryGeoJSON').get();
  const knownAuthorityIds = new Set<string>();
  const auth = new Map<string, { name: string; regional: boolean; geom: { type: string; coordinates: unknown } | null }>();
  for (const d of authSnap.docs) {
    knownAuthorityIds.add(d.id);
    const g = boundaryFromStored(d.data()?.boundaryGeoJSON) as { type: string; coordinates: unknown } | null;
    auth.set(d.id, { name: String(d.data()?.name ?? d.id), regional: d.data()?.type === 'regional_council', geom: g });
  }

  const snap = await target.db.collection('official_routes').where('importBatchId', '>=', 'nationwide-').where('importBatchId', '<', 'nationwide.').get();
  const docs: CleanupDoc[] = [];
  const meta = new Map<string, { updateTime: CleanupWrite['updateTime']; authorityId: string; city: string | null }>();
  let outOfScope = 0;
  for (const d of snap.docs) {
    const x = d.data();
    const a = auth.get(String(x.authorityId ?? ''));
    if (!a?.regional || x.status !== 'pending' || x.published !== false) { outOfScope++; continue; }
    const p = parsePathLoose(x.path);
    let inside: number | null = null;
    if (a.geom && p.length) inside = p.filter((pt) => pointInPolygonCoords(pt, a.geom!)).length / p.length;
    docs.push({ id: d.id, name: String(x.name ?? ''), authorityId: x.authorityId, authorityShort: shortAuthorityName(a.name), km: Number(x.distance) || 0, path: p, insideShare: inside });
    meta.set(d.id, { updateTime: d.updateTime, authorityId: x.authorityId, city: typeof x.city === 'string' ? x.city : null });
  }

  const { actions, groups } = planCleanup(docs);
  const writes: CleanupWrite[] = [];
  const count = { rename_code: 0, rename_disambiguated: 0, duplicate: 0, untouched: 0 };
  const rows: unknown[] = [];
  for (const d of docs) {
    const act = actions.get(d.id)!;
    count[act.kind]++;
    const m = meta.get(d.id)!;
    if (act.rename) writes.push({ kind: 'rename', id: d.id, name: act.rename, authorityId: m.authorityId, city: m.city, updateTime: m.updateTime });
    if (act.duplicateOf) writes.push({ kind: 'duplicate', id: d.id, duplicateOf: act.duplicateOf, authorityId: m.authorityId, city: m.city, updateTime: m.updateTime });
    if (act.kind !== 'untouched') rows.push({ id: d.id, council: d.authorityShort, km: d.km, from: d.name, to: act.rename, duplicateOf: act.duplicateOf, kind: act.kind, insideShare: d.insideShare });
  }
  for (const w of writes) cleanupPayload(w, knownAuthorityIds); // chokepoint now, in dry-run too

  console.log(`\nscope: ${docs.length} pending+unpublished regional docs (${outOfScope} nationwide-* docs out of scope: published/edited/non-regional)`);
  console.log(`PLAN: renames (code stripped) ${count.rename_code} · kept-with-disambiguation ${count.rename_disambiguated} · duplicates archived ${count.duplicate} · untouched ${count.untouched}`);
  const dupNames = groups.filter((g) => g.trueDuplicates > 0).length;
  console.log(`same-name groups: ${groups.length} (${dupNames} with true duplicates = ${groups.reduce((s, g) => s + g.trueDuplicates, 0)} copies; ${groups.filter((g) => g.keptDistinct > 1).length} stay >1 distinct sections)`);
  for (const g of groups.sort((a, b) => b.members - a.members).slice(0, 25)) console.log(`  "${g.name}" ×${g.members}: true dups ${g.trueDuplicates}, distinct kept ${g.keptDistinct}, max overlap among distinct ${g.maxOverlapAmongDistinct}`);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'plan.json'), JSON.stringify({ count, groups, rows }, null, 1));
  console.log(`plan: ${path.join(OUT_DIR, 'plan.json')}`);

  if (!APPLY) { console.log('Dry run only — no Firestore writes.'); return; }
  if (!(await confirmTypedYes(`Type YES to apply ${writes.length} write(s) to ${describeTarget(target)}: `))) { console.log('not confirmed — nothing written'); return; }
  const r = await applyCleanupWrites(target.db, writes, knownAuthorityIds);
  console.log(`written ${r.written}, conflicts ${r.conflicts.length}${r.conflicts.length ? `: ${r.conflicts.join(', ')}` : ''}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
