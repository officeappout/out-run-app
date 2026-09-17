/**
 * backfill-park-ratings.ts
 *
 * One-time backfill: computes ratingAvg/reviewCount for every park in
 * `parks` from its existing `user_contributions` (type:'review',
 * linkedParkId===park.id) reviews, and writes them onto the park doc.
 *
 * After this runs once, the fields stay current going forward via
 * `recomputeAndSaveParkRating()` (src/features/parks/core/services/
 * contribution.service.ts), called on every new review submit — this
 * script exists only to seed parks with reviews that predate that write
 * path.
 *
 * Uses the exact same pure formula as the live write path —
 * `computeParkRatingSummary()` (src/features/parks/core/services/
 * park-rating.utils.ts) — imported directly, not reimplemented, so the
 * backfilled numbers and any future live-write numbers can never drift
 * out of sync with each other.
 *
 * Idempotent / safe to re-run: recomputes from source every time (never
 * increments), and skips a park entirely if its current ratingAvg/
 * reviewCount already match the freshly-computed values — a second run
 * with no new reviews since the first makes zero writes.
 *
 * Does NOT touch the legacy `Park.rating` field (still admin-settable via
 * /admin/locations) — only ratingAvg/reviewCount.
 *
 * Usage:
 *   npx tsx scripts/backfill-park-ratings.ts            # dry-run (default) — prints the plan, writes nothing
 *   npx tsx scripts/backfill-park-ratings.ts --write     # applies the writes to Firestore
 *
 * Requires FIREBASE_SERVICE_ACCOUNT_KEY in .env.local (or application-default
 * credentials for project 'appout-1'), same as every other admin script here.
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import * as admin from 'firebase-admin';
import { computeParkRatingSummary, type RatingSource } from '../src/features/parks/core/services/park-rating.utils';

const PARKS_COLLECTION = 'parks';
const CONTRIBUTIONS_COLLECTION = 'user_contributions';
const WRITE = process.argv.includes('--write');
// Firestore batched writes cap at 500 ops; stay comfortably under it.
const BATCH_SIZE = 400;

function initFirebase() {
  if (admin.apps.length) return;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (raw) {
    const c = JSON.parse(raw);
    admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
    return;
  }
  admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'appout-1' });
}

async function main() {
  initFirebase();
  const db = admin.firestore();

  console.log(`Mode: ${WRITE ? '🔴 WRITE (applying to Firestore)' : '🟡 DRY-RUN (no writes — pass --write to apply)'}`);
  console.log('');

  // ── Load all rated reviews once, group by linkedParkId ──────────────────
  // One query instead of one-per-park — cheap at this collection's real
  // size (tens to low hundreds of parks/reviews), and avoids an N+1 read
  // pattern entirely.
  const reviewsSnap = await db
    .collection(CONTRIBUTIONS_COLLECTION)
    .where('type', '==', 'review')
    .get();

  const reviewsByPark = new Map<string, RatingSource[]>();
  for (const doc of reviewsSnap.docs) {
    const data = doc.data();
    const parkId = data.linkedParkId as string | undefined;
    if (!parkId) continue; // malformed review doc — skip, don't crash the backfill
    const list = reviewsByPark.get(parkId) ?? [];
    list.push({ rating: data.rating });
    reviewsByPark.set(parkId, list);
  }
  console.log(`Loaded ${reviewsSnap.size} review doc(s) across ${reviewsByPark.size} park(s) with at least one review.`);

  // ── Load every park, compute what its ratingAvg/reviewCount SHOULD be ───
  const parksSnap = await db.collection(PARKS_COLLECTION).get();
  console.log(`Loaded ${parksSnap.size} park doc(s).`);
  console.log('');

  let unchanged = 0;
  let toChange = 0;
  let errored = 0;
  const pending: { id: string; name: string; ratingAvg: number | null; reviewCount: number; prevAvg: unknown; prevCount: unknown }[] = [];

  for (const doc of parksSnap.docs) {
    try {
      const data = doc.data();
      const reviews = reviewsByPark.get(doc.id) ?? [];
      const summary = computeParkRatingSummary(reviews);
      const prevAvg = data.ratingAvg ?? null;
      const prevCount = data.reviewCount ?? 0;

      if (prevAvg === summary.ratingAvg && prevCount === summary.reviewCount) {
        unchanged++;
        continue;
      }
      toChange++;
      pending.push({
        id: doc.id,
        name: data.name ?? '(no name)',
        ratingAvg: summary.ratingAvg,
        reviewCount: summary.reviewCount,
        prevAvg,
        prevCount,
      });
    } catch (err) {
      errored++;
      console.error(`  ⚠️  ${doc.id}: failed to compute — ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log(`${toChange} park(s) need an update, ${unchanged} already match, ${errored} errored.`);
  console.log('');

  if (pending.length > 0) {
    console.log('Changes:');
    for (const p of pending) {
      console.log(
        `  ${p.name} (${p.id}): ` +
        `ratingAvg ${JSON.stringify(p.prevAvg)} → ${JSON.stringify(p.ratingAvg)}, ` +
        `reviewCount ${p.prevCount} → ${p.reviewCount}`,
      );
    }
    console.log('');
  }

  if (!WRITE) {
    console.log('Dry-run complete — no writes made. Re-run with --write to apply.');
    return;
  }

  if (pending.length === 0) {
    console.log('Nothing to write.');
    return;
  }

  // ── Apply in chunked batches ──────────────────────────────────────────
  let written = 0;
  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const chunk = pending.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    for (const p of chunk) {
      batch.update(db.collection(PARKS_COLLECTION).doc(p.id), {
        ratingAvg: p.ratingAvg,
        reviewCount: p.reviewCount,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
    written += chunk.length;
    console.log(`  Committed batch: ${written}/${pending.length}`);
  }

  console.log('');
  console.log(`✅ Wrote ${written} park doc(s). Re-run without --write any time to verify it now reports 0 changes.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
