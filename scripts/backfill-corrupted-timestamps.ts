/**
 * scripts/backfill-corrupted-timestamps.ts — recovery for the
 * stripUndefined FieldValue-corruption bug (route-enrichment-pipeline
 * plan, fixed 17.08.2026 in src/lib/route-collections/validate.ts).
 *
 * `stripUndefined` used to flatten Firestore FieldValue sentinels (e.g.
 * `serverTimestamp()`) into empty maps `{}` before writing — see that
 * commit's message for the full root-cause writeup. This script repairs
 * the docs that were already written that way, for `official_routes` and
 * `curated_routes` (the two collections confirmed affected — `climb_segments`
 * and `street_segments` were confirmed clean via direct query, 17.08.2026).
 *
 * RECOVERY METHOD — historically accurate, not a `now()` guess:
 * `importBatchId` on every affected doc embeds a real epoch-millisecond
 * timestamp in its own string (verified against 3 real formats:
 * `import_<epoch>_<filename>`, `manual_<epoch>`, `hero_<authorityId>_<epoch>`
 * — all three parse to plausible 2026 dates). This script extracts the
 * first 13-consecutive-digit substring (13 digits is the only run length a
 * real epoch-ms value has in this decade) and sanity-bounds it to
 * [2024-01-01, now] before trusting it — anything outside that range, or a
 * doc with no parseable 13-digit run in its `importBatchId` at all, is
 * flagged for MANUAL REVIEW and never auto-guessed.
 *
 * `createdAt` vs `updatedAt` are handled independently per doc (NOT assumed
 * to always be corrupted together) — a doc's corruption state is checked
 * field-by-field, per David's explicit call (17.08.2026):
 *   - Corrupted `createdAt` → backfilled with the recovered batch-ID epoch
 *     (this is genuinely when the doc was created — always recoverable this
 *     way, or flagged for manual review if the batch id has no parseable
 *     epoch).
 *   - Corrupted `updatedAt` → backfilled with `serverTimestamp()` (now),
 *     REGARDLESS of whether `createdAt` on the same doc is also corrupted
 *     or already healthy. A corrupted `updatedAt` only tells us the doc's
 *     LAST write went through the buggy chokepoint — for a doc whose
 *     `createdAt` is ALSO corrupted, that could mean "never edited since
 *     creation" (recovered epoch would be right) or "edited again later,
 *     and that edit also hit the bug" (recovered epoch would be wrong,
 *     understating staleness) — genuinely ambiguous either way, so this
 *     deliberately never guesses an edit date from batch-creation metadata.
 *     `now()` is the conservative, always-honest choice: "we know this
 *     changed at some point, we don't claim to know exactly when."
 *
 * Usage:
 *   DRY RUN (default — no writes, prints every affected doc + its recovery plan):
 *     npx tsx scripts/backfill-corrupted-timestamps.ts
 *
 *   LIVE RUN (commits changes — requires explicit --apply):
 *     npx tsx scripts/backfill-corrupted-timestamps.ts --apply
 *
 * Prerequisites:
 *   - FIREBASE_SERVICE_ACCOUNT_KEY set in .env.local
 *   - The stripUndefined fix (validate.ts) must already be deployed/committed
 *     — this script writes through buildValidatedDoc same as everything else
 *     in this plan, so an unfixed chokepoint would just re-corrupt these
 *     same fields on write.
 *   - Run from the repo root so relative imports + .env.local resolve.
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import * as admin from 'firebase-admin';

const isApply = process.argv.includes('--apply');
const mode = isApply ? 'APPLY' : 'DRY-RUN';

const COLLECTIONS = ['official_routes', 'curated_routes'] as const;
const MIN_PLAUSIBLE_MS = new Date('2024-01-01').getTime();

const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!rawKey) {
  console.error('❌  FIREBASE_SERVICE_ACCOUNT_KEY not set (expected in .env.local)');
  process.exit(1);
}
const cred = JSON.parse(rawKey);
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(cred), projectId: cred.project_id });
}
const db = admin.firestore();

function isCorruptedTimestamp(v: any): boolean {
  return v !== undefined && v !== null && typeof v === 'object' && typeof v.toDate !== 'function';
}

/** Extracts the epoch-ms embedded in an importBatchId, sanity-bounded to
 *  [2024-01-01, now]. Returns null (never guesses) if none found or implausible. */
function recoverEpochFromBatchId(importBatchId: string | undefined, nowMs: number): number | null {
  if (!importBatchId) return null;
  const match = importBatchId.match(/\d{13}/);
  if (!match) return null;
  const epoch = Number(match[0]);
  if (epoch < MIN_PLAUSIBLE_MS || epoch > nowMs) return null;
  return epoch;
}

interface AffectedDoc {
  collection: (typeof COLLECTIONS)[number];
  id: string;
  name: string;
  importBatchId?: string;
  createdAtCorrupted: boolean;
  updatedAtCorrupted: boolean;
  recoveredEpochMs: number | null;
  plan: string; // human-readable description of what this doc will get
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log(`║  Corrupted-Timestamp Recovery          [${mode.padEnd(8)}]         ║`);
  console.log('╚══════════════════════════════════════════════════════════╝');

  if (!isApply) {
    console.log('\n⚠️  DRY-RUN mode — no changes will be written.');
    console.log('   Run with --apply to write changes (only after review).\n');
  }

  const { buildValidatedDoc } = await import('../src/lib/route-collections');
  const authoritySnap = await db.collection('authorities').get();
  const knownAuthorityIds = new Set(authoritySnap.docs.map((d) => d.id));
  const nowMs = Date.now();

  const recoverable: AffectedDoc[] = [];
  const needsManualReview: AffectedDoc[] = [];

  for (const collectionName of COLLECTIONS) {
    console.log(`\n📊 Scanning ${collectionName}...`);
    const snap = await db.collection(collectionName).get();
    console.log(`   ${snap.size} doc(s) total.`);

    for (const d of snap.docs) {
      const data = d.data();
      const createdAtCorrupted = isCorruptedTimestamp(data.createdAt);
      const updatedAtCorrupted = isCorruptedTimestamp(data.updatedAt);
      if (!createdAtCorrupted && !updatedAtCorrupted) continue;

      const recoveredEpochMs = recoverEpochFromBatchId(data.importBatchId, nowMs);
      const entry: AffectedDoc = {
        collection: collectionName,
        id: d.id,
        name: data.name ?? '(no name)',
        importBatchId: data.importBatchId,
        createdAtCorrupted,
        updatedAtCorrupted,
        recoveredEpochMs,
        plan: '',
      };

      if (createdAtCorrupted && recoveredEpochMs === null) {
        // createdAt is corrupted and we can't recover it — this is the one
        // case that MUST go to manual review; there's no field-independent
        // fallback for createdAt itself.
        entry.plan = 'MANUAL REVIEW — createdAt corrupted, no recoverable epoch in importBatchId';
        needsManualReview.push(entry);
        continue;
      }

      const parts: string[] = [];
      if (createdAtCorrupted) parts.push(`createdAt ← ${new Date(recoveredEpochMs!).toISOString()} (recovered from batch id)`);
      if (updatedAtCorrupted) parts.push('updatedAt ← now() (true edit time unrecoverable — never guessed from batch-creation metadata)');
      entry.plan = parts.join('; ');
      recoverable.push(entry);
    }
  }

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  RECOVERABLE — will be backfilled                           ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  if (recoverable.length === 0) {
    console.log('  (none found)');
  } else {
    for (const e of recoverable) {
      console.log(`  [${e.collection}] ${e.id}  "${e.name}"  batch=${e.importBatchId ?? '(none)'}`);
      console.log(`    → ${e.plan}`);
    }
  }

  if (needsManualReview.length > 0) {
    console.log('\n╔══════════════════════════════════════════════════════════╗');
    console.log('║  MANUAL REVIEW NEEDED — NOT auto-fixed                      ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    for (const e of needsManualReview) {
      console.log(`  [${e.collection}] ${e.id}  "${e.name}"  batch=${e.importBatchId ?? '(none)'}  — ${e.plan}`);
    }
  }

  console.log(`\n${isApply ? 'Applying' : '[dry-run] would apply'} ${recoverable.length} recovery write(s). ${needsManualReview.length} doc(s) need manual review.`);

  if (isApply && recoverable.length > 0) {
    const routesSnapByCollection = new Map<string, admin.firestore.QuerySnapshot>();
    for (const collectionName of COLLECTIONS) {
      routesSnapByCollection.set(collectionName, await db.collection(collectionName).get());
    }
    const existingById = new Map<string, { authorityId?: string; city?: string }>();
    for (const snap of Array.from(routesSnapByCollection.values())) {
      for (const d of snap.docs) {
        const data = d.data();
        existingById.set(d.id, { authorityId: data.authorityId, city: data.city });
      }
    }

    const CHUNK = 500;
    let applied = 0;
    for (let i = 0; i < recoverable.length; i += CHUNK) {
      const chunk = recoverable.slice(i, i + CHUNK);
      const batch = db.batch();
      for (const e of chunk) {
        const payload: Record<string, unknown> = {};
        if (e.createdAtCorrupted) payload.createdAt = admin.firestore.Timestamp.fromMillis(e.recoveredEpochMs!);
        if (e.updatedAtCorrupted) payload.updatedAt = admin.firestore.FieldValue.serverTimestamp();
        const existing = existingById.get(e.id) ?? {};
        const validated = buildValidatedDoc(e.collection, payload, { mode: 'update', knownAuthorityIds, existing });
        batch.update(db.collection(e.collection).doc(e.id), validated as Record<string, unknown>);
      }
      await batch.commit();
      applied += chunk.length;
      console.log(`  ✔ committed ${applied}/${recoverable.length}`);
    }
  }

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║                        SUMMARY                              ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log(`║  Mode:                    ${mode.padEnd(31)}║`);
  console.log(`║  Recoverable docs:        ${String(recoverable.length).padEnd(31)}║`);
  console.log(`║  Manual review needed:    ${String(needsManualReview.length).padEnd(31)}║`);
  console.log(`║  ${isApply ? 'Fixed this run:            ' + String(recoverable.length).padEnd(31) : 'Run with --apply to fix' + ' '.padEnd(35)}║`);
  console.log('╚══════════════════════════════════════════════════════════╝');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
