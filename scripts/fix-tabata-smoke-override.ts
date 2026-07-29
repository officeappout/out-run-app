/**
 * scripts/fix-tabata-smoke-override.ts
 *
 * Retire the temporary smoke override from the tabata rollout.
 * `rollout-tabata-finisher.ts` set pull@L22 → tabataProbability 0.9 so David could
 * field-test the block on demand. That band's real value is 0.22 (L19+).
 *
 * Scope: ONLY the `tabataProbability` field, ONLY on docs whose value is above the
 * band table (>0.22). preferredProtocols and every other field are untouched
 * (`set(..., { merge: true })` with a single key).
 *
 * Usage:
 *   DRY RUN (default):  npx tsx --env-file=.env.local scripts/fix-tabata-smoke-override.ts
 *   WRITE:              npx tsx --env-file=.env.local scripts/fix-tabata-smoke-override.ts --write
 */
import * as admin from 'firebase-admin';

const isDryRun = !process.argv.includes('--write');
const MAX_LEGIT = 0.22;

const key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? '');
if (!key?.project_id) { console.error('❌ FIREBASE_SERVICE_ACCOUNT_KEY missing — use --env-file=.env.local'); process.exit(1); }
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(key as admin.ServiceAccount) });
const db = admin.firestore();

/** Same band table as rollout-tabata-finisher.ts — keep in sync. */
function tabataProbFor(level: number): number {
  if (level <= 6) return 0.12;
  if (level <= 10) return 0.15;
  if (level <= 14) return 0.18;
  if (level <= 18) return 0.20;
  return 0.22; // 19+
}

async function main() {
  console.log(`\n🔬 Retire tabata smoke override — project=${key.project_id} — mode=${isDryRun ? 'DRY RUN' : '⚠️  WRITE'}\n`);

  const snap = await db.collection('programLevelSettings').get();
  const over = snap.docs.filter((d) => ((d.data() as any).tabataProbability ?? 0) > MAX_LEGIT);

  if (!over.length) {
    console.log(`No doc above ${MAX_LEGIT} — nothing to do.\n`);
    return;
  }

  const rows = over.map((d) => {
    const level = Number(d.id.match(/_level_(\d+)$/)?.[1] ?? NaN);
    return { docId: d.id, level, before: (d.data() as any).tabataProbability, after: tabataProbFor(level) };
  });

  console.log(`Proposed writes (${rows.length}) — tabataProbability ONLY, merge:true:`);
  console.log('─'.repeat(76));
  for (const r of rows) {
    console.log(`  ${r.docId.padEnd(40)} L${String(r.level).padEnd(3)} ${r.before} → ${r.after}`);
  }
  console.log('─'.repeat(76));

  if (rows.some((r) => Number.isNaN(r.level))) {
    console.error('\n❌ A docId did not match <programId>_level_<n> — aborting rather than guessing the band.\n');
    process.exit(1);
  }

  if (isDryRun) {
    console.log('\nDRY RUN — no writes. Re-run with --write.\n');
    return;
  }

  console.log('\n⚠️  WRITING…');
  for (const r of rows) {
    await db.collection('programLevelSettings').doc(r.docId).set(
      { tabataProbability: r.after, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true },
    );
  }
  console.log(`✅ Wrote ${rows.length} doc(s).\n`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
