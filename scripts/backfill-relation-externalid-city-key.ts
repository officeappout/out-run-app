/**
 * scripts/backfill-relation-externalid-city-key.ts
 *
 * One-time backfill for the Fix B externalId city-scoping change in
 * geo-discovery-routes.ts (04.09.2026, post-incident — see that file's own
 * header comment, "externalId city-scoping", for the full rationale).
 *
 * Pre-existing official_routes docs with a relation-based source.externalId
 * (`osm:rel/<id>` or `osm:rel/<id>#<part>`) predate the `@<REGION.key>`
 * suffix. Left alone, the next geo-discovery run against any of these
 * regions would upsert onto the OLD unscoped id (regenerating a doc that
 * matches nothing new) while a DIFFERENT region sharing the same OSM
 * relation would still collide on that same old id — exactly the failure
 * mode that caused the incident. This renames each doc's source.externalId
 * in place to the new, city-scoped form so it matches what geo-discovery
 * will look up on its next run for that region.
 *
 * Scope: relation-based ids ONLY (`osm:rel/...`) — matches Fix B exactly.
 * Way-based (`osm:way/<id>`) and stitched (`osm:stitched/<ids>`) ids are
 * untouched, per Fix B's verified scope (no collision risk there).
 *
 * Default dry-run: prints every matching doc's id / current city / current
 * externalId / proposed new externalId, and flags two anomaly classes
 * without writing anything:
 *   - unmapped city: the doc's `city` field isn't a key in CITY_TO_KEY below
 *     (this script does not guess — an unmapped city is left unchanged and
 *     reported, never silently defaulted)
 *   - resulting duplicate: two or more docs would end up with the identical
 *     new externalId (should not happen — each old externalId is already
 *     unique by construction, and appending the SAME doc's own city can't
 *     un-dedupe that — this is a sanity backstop, not an expected case)
 *
 * --apply performs the actual rename (source.externalId only — no other
 * field is touched, no upsert, no create/delete — same doc, same id, new
 * field value, via a plain updateDoc-equivalent .update() per Firestore
 * write conventions (not a full-document overwrite)).
 *
 * Usage:
 *   npx tsx scripts/backfill-relation-externalid-city-key.ts          # dry-run (default)
 *   npx tsx scripts/backfill-relation-externalid-city-key.ts --apply  # write
 */
import * as dotenv from 'dotenv'; dotenv.config({ path: '.env.local' }); dotenv.config();
import * as admin from 'firebase-admin';

const CITY_TO_KEY: Record<string, string> = {
  'חיפה': 'haifa',
  'זכרון יעקב': 'zichron',
  'הרצליה': 'herzliya',
};

const RELATION_ID_RE = /^osm:rel\/[^@]+$/; // osm:rel/<id> or osm:rel/<id>#<part> — NOT already @-suffixed

function initFb() {
  const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
  return admin.firestore();
}

interface Row {
  id: string;
  city: string;
  oldExternalId: string;
  newExternalId: string | null; // null when the city is unmapped — left unchanged
  key: string | null;
}

async function main() {
  const APPLY = process.argv.includes('--apply');
  const db = initFb();

  console.log('scanning official_routes for relation-based source.externalId …');
  const snap = await db.collection('official_routes').get();

  const rows: Row[] = [];
  for (const doc of snap.docs) {
    const data = doc.data();
    const externalId: string | undefined = data?.source?.externalId;
    if (!externalId || !RELATION_ID_RE.test(externalId)) continue;
    const city: string = data?.city || '(no city)';
    const key = CITY_TO_KEY[city] ?? null;
    rows.push({
      id: doc.id,
      city,
      oldExternalId: externalId,
      newExternalId: key ? `${externalId}@${key}` : null,
      key,
    });
  }

  console.log(`\nfound ${rows.length} relation-based official_routes doc(s).\n`);

  // Anomaly 1: unmapped city
  const unmapped = rows.filter(r => r.key === null);

  // Anomaly 2: resulting duplicate new externalId (only checked among rows that DO get a new id)
  const byNewId = new Map<string, Row[]>();
  for (const r of rows) {
    if (!r.newExternalId) continue;
    if (!byNewId.has(r.newExternalId)) byNewId.set(r.newExternalId, []);
    byNewId.get(r.newExternalId)!.push(r);
  }
  const duplicates = Array.from(byNewId.values()).filter(group => group.length > 1);

  // Table
  const idW = Math.max(20, ...rows.map(r => r.id.length));
  const cityW = Math.max(12, ...rows.map(r => r.city.length));
  const oldW = Math.max(20, ...rows.map(r => r.oldExternalId.length));
  console.log(`${'doc id'.padEnd(idW)}  ${'city'.padEnd(cityW)}  ${'old externalId'.padEnd(oldW)}  new externalId`);
  console.log('-'.repeat(idW + cityW + oldW + 40));
  for (const r of rows) {
    const flag = r.key === null ? '  ⚠️ UNMAPPED CITY — left unchanged' : (duplicates.some(g => g.includes(r)) ? '  ⚠️ DUPLICATE new externalId' : '');
    console.log(`${r.id.padEnd(idW)}  ${r.city.padEnd(cityW)}  ${r.oldExternalId.padEnd(oldW)}  ${r.newExternalId ?? '(none — unmapped city)'}${flag}`);
  }

  console.log(`\n=== summary ===`);
  console.log(`total relation-based docs: ${rows.length}`);
  console.log(`would rename: ${rows.length - unmapped.length}`);
  console.log(`unmapped city (left unchanged): ${unmapped.length}`);
  if (unmapped.length) for (const r of unmapped) console.log(`  [${r.id}] city="${r.city}" externalId=${r.oldExternalId}`);
  console.log(`duplicate-resulting-key groups: ${duplicates.length}`);
  if (duplicates.length) for (const g of duplicates) console.log(`  ${g.map(r => r.id).join(', ')} → ${g[0].newExternalId}`);

  const target = rows.find(r => r.id === 'CIrOzO6eWIucAwvE95Uk');
  if (target) {
    console.log(`\n=== incident doc check (CIrOzO6eWIucAwvE95Uk) ===`);
    console.log(`city: ${target.city}  old: ${target.oldExternalId}  new: ${target.newExternalId}`);
  } else {
    console.log(`\n=== incident doc check (CIrOzO6eWIucAwvE95Uk) ===`);
    console.log(`⚠️ not found among relation-based candidates — investigate before proceeding.`);
  }

  if (!APPLY) {
    console.log(`\n[dry-run] no writes. Run with --apply to rename ${rows.length - unmapped.length} doc(s)' source.externalId.`);
    return;
  }

  if (duplicates.length) {
    console.log(`\n❌ refusing to --apply: ${duplicates.length} duplicate-resulting-key group(s) found. Resolve before writing.`);
    process.exitCode = 1;
    return;
  }

  console.log(`\napplying rename to ${rows.length - unmapped.length} doc(s) …`);
  let n = 0;
  for (const r of rows) {
    if (!r.newExternalId) continue;
    await db.collection('official_routes').doc(r.id).update({ 'source.externalId': r.newExternalId, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    n++;
    if (n % 10 === 0) console.log(`  ${n}/${rows.length - unmapped.length} …`);
  }
  console.log(`✅ renamed ${n} doc(s).`);
}

if (require.main === module) {
  main().catch(err => { console.error(err); process.exitCode = 1; });
}
