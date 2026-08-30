/**
 * scripts/migrate-distance-unit.ts — Stage 2 of the distance-unit-
 * normalization fix. Converts `official_routes`/`curated_routes` docs whose
 * `distance` is stored in meters to kilometers — the canonical unit
 * (route-editor-scoping-spec.md's DEM/difficulty work, ~18 confirmed reader
 * sites across mobile+admin, all assume km; see the Stage 1 report for the
 * full contract map).
 *
 * IDEMPOTENT: re-derives each doc's unit from its OWN path geometry every
 * run (via scripts/lib/distance-unit-classify.ts — the SAME classification
 * Stage 1 already validated, not a second copy) and only ever writes docs
 * currently classified `needs-conversion-meters-stored`. A doc already
 * fixed (by a previous run of this script, OR by any other means — e.g. an
 * owner editing the route through the live editor, which already writes
 * correct km) reclassifies as `canonical-km` and is silently skipped.
 * Running this script twice in a row is a no-op the second time. This is
 * NOT a blind "divide flagged cities by 1000" — every doc is independently
 * re-verified against its own geometry before being touched.
 *
 * SCOPE: writes ONLY the `distance` field (+ `updatedAt`, per this
 * codebase's own "every write touches updatedAt" convention — CLAUDE.md).
 * Never touches `path`/geometry. Never touches `duration` — see the
 * companion duration-check report for whether that needs its own pass.
 *
 * REVERSIBLE: every change (old value -> new value) is logged to
 * scripts/output/distance-unit-migration-log-<timestamp>.json BEFORE any
 * write happens, so a revert is always possible from the log even if the
 * script is interrupted mid-run.
 *
 * ambiguous-or-corrupt / missing-distance / no-geometry docs are NEVER
 * touched by this script, regardless of flags — those need a human look,
 * not an automated write. (Stage 1 found zero of these in the current
 * data; if a future run finds any, they get reported, never auto-"fixed".)
 *
 * Usage:
 *   npx tsx scripts/migrate-distance-unit.ts              # dry-run (default)
 *   npx tsx scripts/migrate-distance-unit.ts --dry-run     # same, explicit
 *   npx tsx scripts/migrate-distance-unit.ts --apply       # real write
 */
import * as dotenv from 'dotenv'; dotenv.config({ path: '.env.local' }); dotenv.config();
import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';
import { computePathDistanceMeters, classify, normalizePathToLngLatTuples, type DocResult } from './lib/distance-unit-classify';

const APPLY = process.argv.includes('--apply');

function initFb() {
  const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
  return admin.firestore();
}

interface MigrationLogEntry {
  id: string;
  collection: 'official_routes' | 'curated_routes';
  name: string;
  oldValue: number;
  newValue: number;
}

async function main() {
  const db = initFb();
  console.log(`=== Distance-unit migration — ${APPLY ? '🔴 APPLY (real write)' : '🟢 DRY-RUN (no writes)'} ===\n`);

  const [officialSnap, curatedSnap] = await Promise.all([
    db.collection('official_routes').get(),
    db.collection('curated_routes').get(),
  ]);
  console.log(`Loaded: ${officialSnap.size} official_routes, ${curatedSnap.size} curated_routes.\n`);

  const allDocs: Array<{ id: string; collection: 'official_routes' | 'curated_routes'; ref: FirebaseFirestore.DocumentReference; data: any }> = [
    ...officialSnap.docs.map((d) => ({ id: d.id, collection: 'official_routes' as const, ref: d.ref, data: d.data() })),
    ...curatedSnap.docs.map((d) => ({ id: d.id, collection: 'curated_routes' as const, ref: d.ref, data: d.data() })),
  ];

  const toConvert: Array<{ id: string; collection: 'official_routes' | 'curated_routes'; ref: FirebaseFirestore.DocumentReference; name: string; oldValue: number; newValue: number }> = [];
  const skippedAmbiguous: DocResult[] = [];
  let canonicalCount = 0;
  let noGeometryCount = 0;

  for (const { id, collection, ref, data } of allDocs) {
    const rawPath = data.path;
    if (!Array.isArray(rawPath) || rawPath.length < 2) {
      noGeometryCount++;
      continue;
    }
    const pathPts = normalizePathToLngLatTuples(rawPath);
    const groundTruthMeters = computePathDistanceMeters(pathPts);
    const { classification, proposedNewValue } = classify(data.distance, groundTruthMeters);

    if (classification === 'canonical-km') {
      canonicalCount++;
      continue;
    }
    if (classification === 'needs-conversion-meters-stored' && proposedNewValue != null) {
      toConvert.push({ id, collection, ref, name: data.name || id, oldValue: data.distance, newValue: proposedNewValue });
      continue;
    }
    // ambiguous-or-corrupt / missing-distance — never auto-touched.
    skippedAmbiguous.push({
      id, collection, name: data.name || id, cityLabel: data.city || data.authorityId || 'unknown', authorityId: data.authorityId || null,
      storedDistance: typeof data.distance === 'number' ? data.distance : null,
      groundTruthMeters: Math.round(groundTruthMeters), groundTruthKm: Math.round((groundTruthMeters / 1000) * 100) / 100,
      classification, proposedNewValue: null,
    });
  }

  console.log(`canonical-km (skip, already correct): ${canonicalCount}`);
  console.log(`needs-conversion (will ${APPLY ? 'write' : 'preview'}): ${toConvert.length}`);
  console.log(`ambiguous/corrupt/missing (NEVER auto-touched): ${skippedAmbiguous.length}`);
  console.log(`no-geometry (skip, can't verify): ${noGeometryCount}\n`);

  if (skippedAmbiguous.length > 0) {
    console.log('⚠ AMBIGUOUS/CORRUPT DOCS FOUND — these are never auto-converted, listed for manual review:');
    skippedAmbiguous.forEach((d) => console.log(`  ${d.id} "${d.name}" stored=${d.storedDistance} groundTruthKm=${d.groundTruthKm} groundTruthMeters=${d.groundTruthMeters}`));
    console.log('');
  }

  console.log(`=== ${APPLY ? 'Writing' : 'Would write'} ${toConvert.length} doc(s) ===`);
  toConvert.forEach((d) => console.log(`  ${d.collection}/${d.id}  "${d.name}"  ${d.oldValue} -> ${d.newValue} km`));

  if (toConvert.length === 0) {
    console.log('\nNothing to convert. Exiting.');
    return;
  }

  // Log BEFORE writing — reversible even if the script is interrupted mid-batch.
  const outDir = path.join(__dirname, 'output');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const logEntries: MigrationLogEntry[] = toConvert.map((d) => ({ id: d.id, collection: d.collection, name: d.name, oldValue: d.oldValue, newValue: d.newValue }));
  const logPath = path.join(outDir, `distance-unit-migration-log-${APPLY ? 'apply' : 'dryrun'}-${Date.now()}.json`);
  fs.writeFileSync(logPath, JSON.stringify({ generatedAt: new Date().toISOString(), applied: APPLY, entries: logEntries }, null, 2));
  console.log(`\nReversible before/after log written to: ${logPath}`);

  if (!APPLY) {
    console.log('\n🟢 DRY-RUN complete — no writes made. Re-run with --apply to write for real.');
    return;
  }

  console.log('\n🔴 Applying writes...');
  for (let i = 0; i < toConvert.length; i += 500) {
    const batch = db.batch();
    const chunk = toConvert.slice(i, i + 500);
    chunk.forEach((d) => {
      batch.update(d.ref, { distance: d.newValue, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    });
    await batch.commit();
    console.log(`  committed ${Math.min(i + 500, toConvert.length)}/${toConvert.length}`);
  }
  console.log(`\n✅ Applied ${toConvert.length} distance conversions.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error('FATAL:', e); process.exit(1); });
