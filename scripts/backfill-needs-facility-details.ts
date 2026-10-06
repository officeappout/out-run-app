/**
 * scripts/backfill-needs-facility-details.ts — OSM-import Stage 1 backfill
 * (David's instruction, 06.10.2026).
 *
 * `needsFacilityDetails` is now server-computed on every park write
 * (computeNeedsFacilityDetails, src/features/parks/core/utils/
 * park-completeness.util.ts): `true` = missing a real photo or a real
 * gymEquipment entry, `false` = both present. This one-time pass recomputes
 * it for every EXISTING `parks` doc so the flag is correct from day one —
 * going forward every write path already keeps it current on its own.
 *
 * DRY RUN (default — no writes, prints what WOULD change, by city):
 *   npx tsx scripts/backfill-needs-facility-details.ts
 *
 * LIVE RUN (writes — requires explicit --apply):
 *   npx tsx scripts/backfill-needs-facility-details.ts --apply
 *
 * Idempotent: only writes docs whose stored value differs from the
 * computed one — safe to re-run.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import * as admin from 'firebase-admin';
import { computeNeedsFacilityDetails } from '../src/features/parks/core/utils/park-completeness.util';

function initFb() {
  const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!rawKey) {
    console.error('❌  FIREBASE_SERVICE_ACCOUNT_KEY not set (expected in .env.local)');
    process.exit(1);
  }
  const cred = JSON.parse(rawKey);
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(cred), projectId: cred.project_id });
  }
  return admin.firestore();
}

async function main() {
  const isApply = process.argv.includes('--apply');
  const db = initFb();
  const mode = isApply ? 'APPLY' : 'DRY-RUN';

  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log(`║  needsFacilityDetails backfill                [${mode.padEnd(8)}]  ║`);
  console.log('╚══════════════════════════════════════════════════════════╝');
  if (!isApply) console.log('\n⚠️  DRY-RUN mode — no writes. Run with --apply to write for real.\n');

  const snap = await db.collection('parks').get();
  console.log(`${snap.size} total parks doc(s).\n`);

  type CityStat = { total: number; wasTrue: number; wasFalse: number; wasMissing: number; nowTrue: number; nowFalse: number; changed: number };
  const byCity = new Map<string, CityStat>();
  let totalChanged = 0;
  let totalUnchanged = 0;

  const batchSize = 400;
  let batch = db.batch();
  let batchCount = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    const city = (data.city as string) || '(ללא עיר)';
    const stat = byCity.get(city) ?? { total: 0, wasTrue: 0, wasFalse: 0, wasMissing: 0, nowTrue: 0, nowFalse: 0, changed: 0 };
    stat.total++;

    const stored = data.needsFacilityDetails;
    if (stored === true) stat.wasTrue++;
    else if (stored === false) stat.wasFalse++;
    else stat.wasMissing++;

    const computed = computeNeedsFacilityDetails(data);
    if (computed) stat.nowTrue++; else stat.nowFalse++;

    if (stored !== computed) {
      stat.changed++;
      totalChanged++;
      if (isApply) {
        batch.update(doc.ref, { needsFacilityDetails: computed });
        batchCount++;
        if (batchCount >= batchSize) {
          await batch.commit();
          batch = db.batch();
          batchCount = 0;
        }
      }
    } else {
      totalUnchanged++;
    }
    byCity.set(city, stat);
  }

  if (isApply && batchCount > 0) {
    await batch.commit();
  }

  console.log('╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║ עיר                        │ סה"כ │ true→ │ false→ │ לא היה │ ישתנו        ║');
  console.log('╠══════════════════════════════════════════════════════════════════════════╣');
  const sorted = [...byCity.entries()].sort((a, b) => b[1].total - a[1].total);
  for (const [city, s] of sorted) {
    console.log(
      `  ${city.padEnd(26)} │ ${String(s.total).padStart(4)} │ ${String(s.nowTrue).padStart(5)} │ ${String(s.nowFalse).padStart(6)} │ ${String(s.wasMissing).padStart(6)} │ ${String(s.changed).padStart(6)}`,
    );
  }
  console.log('╚══════════════════════════════════════════════════════════════════════════╝');
  console.log(`\nTotal: ${snap.size} | would ${isApply ? '' : '(dry-run) '}change: ${totalChanged} | unchanged: ${totalUnchanged}`);
  if (!isApply) {
    console.log('\n🟢 DRY-RUN complete — no writes made. Re-run with --apply to write for real.');
  } else {
    console.log('\n✅ APPLY complete.');
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error('FATAL:', e); process.exit(1); });
