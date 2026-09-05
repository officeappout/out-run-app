/**
 * scripts/_backfill-marketing-attribution-unknown-pre-fix.ts
 *
 * Context: before this fix, `captureMarketingAttribution()` was never
 * called anywhere, so EVERY user who completed onboarding got
 * `marketingAttribution.source = 'organic'` regardless of how they
 * actually arrived — a real click/QR scan/paid ad was indistinguishable
 * from a truly organic, typed-URL visit. There is no way to reconstruct
 * the real historical value (no raw signal was ever captured for these
 * users — no click-level join key existed before this fix either).
 *
 * This script does NOT invent a corrected value. It relabels every
 * user whose `marketingAttribution.source === 'organic'` AND who
 * completed onboarding BEFORE the cutover timestamp below to the
 * literal string 'unknown_pre_fix', so downstream funnel/CAC graphs
 * don't silently conflate "genuinely organic" with "we simply weren't
 * measuring yet". Users who complete onboarding AFTER cutover with a
 * real organic visit keep the correct 'organic' label.
 *
 * Default mode is READ-ONLY (reports counts, writes nothing). Pass
 * --commit to actually apply the batched update.
 *
 * Usage:
 *   npx tsx scripts/_backfill-marketing-attribution-unknown-pre-fix.ts            # dry run
 *   npx tsx scripts/_backfill-marketing-attribution-unknown-pre-fix.ts --commit   # apply
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '/Users/calisthenicsltd/Development/appout-1/.env.local' });
import * as admin from 'firebase-admin';

// Set this to the actual deploy/live timestamp of the capture fix before
// running --commit. Left as a placeholder constant (not `Date.now()`) so
// a dry run today doesn't silently shift its own cutover on every re-run.
const CUTOVER_ISO = '2026-09-05T00:00:00.000Z';

/** Defensive: some legacy docs store this as a plain Date, epoch number,
 * or a `{seconds,nanoseconds}`-shaped object instead of a real Timestamp. */
function toMillisSafe(v: unknown): number | null {
  if (v == null) return null;
  if (v instanceof admin.firestore.Timestamp) return v.toMillis();
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'number') return v;
  if (typeof v === 'object' && v !== null) {
    const o = v as { seconds?: number; _seconds?: number };
    const seconds = o.seconds ?? o._seconds;
    if (typeof seconds === 'number') return seconds * 1000;
  }
  return null;
}

function init() {
  if (admin.apps.length) return;
  const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
}

async function main() {
  init();
  const db = admin.firestore();
  const commit = process.argv.includes('--commit');
  const cutover = admin.firestore.Timestamp.fromDate(new Date(CUTOVER_ISO));

  let totalUsers = 0;
  let noAttributionField = 0;
  let organicTotal = 0;
  let organicPreCutoverNoCompletionDate = 0;
  let organicPreCutover = 0;
  let organicPostCutover = 0;
  let nonOrganicAlready = 0;
  const sourceCounts: Record<string, number> = {};

  const toRelabel: admin.firestore.QueryDocumentSnapshot[] = [];

  let last: admin.firestore.QueryDocumentSnapshot | null = null;
  const PAGE = 1000;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let q = db.collection('users').orderBy(admin.firestore.FieldPath.documentId()).limit(PAGE);
    if (last) q = q.startAfter(last.id);
    const snap = await q.get();
    if (snap.empty) break;

    for (const d of snap.docs) {
      totalUsers++;
      const attr = (d.data()?.marketingAttribution ?? null) as { source?: string } | null;
      if (!attr) {
        noAttributionField++;
        continue;
      }
      const source = typeof attr.source === 'string' ? attr.source : '(non-string)';
      sourceCounts[source] = (sourceCounts[source] ?? 0) + 1;

      if (source !== 'organic') {
        nonOrganicAlready++;
        continue;
      }
      organicTotal++;

      const completedAtMillis = toMillisSafe(d.data()?.onboardingCompletedAt);
      if (completedAtMillis == null) {
        // Wrote 'organic' but has no completion timestamp we recognise —
        // never silently relabel a doc shape we don't understand.
        organicPreCutoverNoCompletionDate++;
        continue;
      }
      if (completedAtMillis < cutover.toMillis()) {
        organicPreCutover++;
        toRelabel.push(d);
      } else {
        organicPostCutover++;
      }
    }

    last = snap.docs[snap.docs.length - 1];
    if (snap.size < PAGE) break;
  }

  console.log('── Marketing attribution — current state ──────────────────');
  console.log({
    totalUsers,
    noAttributionField,
    nonOrganicAlready,
    organicTotal,
    organicPreCutover,
    organicPostCutover,
    organicPreCutoverNoCompletionDate,
  });
  console.log('source breakdown (top 20):',
    Object.entries(sourceCounts).sort((a, b) => b[1] - a[1]).slice(0, 20));

  if (!commit) {
    console.log(`\nDRY RUN — would relabel ${toRelabel.length} docs to 'unknown_pre_fix'. Re-run with --commit to apply.`);
    return;
  }

  console.log(`\nApplying: relabeling ${toRelabel.length} docs to 'unknown_pre_fix'...`);
  const BATCH = 400; // stay well under Firestore's 500-write batch cap
  for (let i = 0; i < toRelabel.length; i += BATCH) {
    const batch = db.batch();
    for (const doc of toRelabel.slice(i, i + BATCH)) {
      batch.update(doc.ref, { 'marketingAttribution.source': 'unknown_pre_fix' });
    }
    await batch.commit();
    console.log(`  committed ${Math.min(i + BATCH, toRelabel.length)}/${toRelabel.length}`);
  }
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
