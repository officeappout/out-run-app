/**
 * Distributed Counter Leaderboard — Phase 4
 *
 * Two Cloud Functions:
 *
 * 1. onFeedPostCreate (Firestore trigger)
 *    Fires on every new feed_posts/{docId} document.
 *    Increments a random shard in leaderboard_shards/.
 *    DocId format: {tenantId}_{unitId}_{period}_{uid}_{shard}
 *
 * 2. rollupLeaderboard (Pub/Sub scheduled — daily at 03:00 UTC)
 *    Sums all shards per user/period and writes a ranked snapshot
 *    to leaderboard_snapshots/{tenantId}_{unitId}_{period}.
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

if (!admin.apps.length) { admin.initializeApp(); }
const db = admin.firestore();

const NUM_SHARDS = 10;

// ── Helpers ───────────────────────────────────────────────────────────

function getCurrentPeriod(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

// ── 1. Firestore Trigger — sharded increment ─────────────────────────

export const onFeedPostCreate = functions.firestore
  .document('feed_posts/{docId}')
  .onCreate(async (snap) => {
    const data = snap.data();
    const uid: string = data.userId ?? data.uid ?? '';
    const tenantId: string = data.tenantId ?? '_global';
    const unitId: string = data.unitId ?? '_all';
    const xp: number = typeof data.xpAwarded === 'number' ? data.xpAwarded : 1;

    if (!uid) {
      functions.logger.warn('onFeedPostCreate: no userId, skipping');
      return;
    }

    const period = getCurrentPeriod();
    const shard = Math.floor(Math.random() * NUM_SHARDS);
    const shardDocId = `${tenantId}_${unitId}_${period}_${uid}_${shard}`;

    const shardRef = db.collection('leaderboard_shards').doc(shardDocId);

    await shardRef.set({
      tenantId,
      unitId,
      period,
      uid,
      shard,
      xp: admin.firestore.FieldValue.increment(xp),
      posts: admin.firestore.FieldValue.increment(1),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  });

// ── 2. Scheduled Rollup — nightly at 03:00 UTC ──────────────────────

export const rollupLeaderboard = functions.pubsub
  .schedule('0 3 * * *')
  .timeZone('Asia/Jerusalem')
  .onRun(async () => {
    const period = getCurrentPeriod();

    // Query all shards for the current period
    const shardsSnap = await db
      .collection('leaderboard_shards')
      .where('period', '==', period)
      .get();

    if (shardsSnap.empty) {
      functions.logger.info(`rollupLeaderboard: no shards for period ${period}`);
      return;
    }

    // Aggregate by tenant+unit+uid
    interface AggKey { tenantId: string; unitId: string; }
    interface UserAgg { xp: number; posts: number; }

    const buckets = new Map<string, Map<string, UserAgg>>();

    for (const doc of shardsSnap.docs) {
      const d = doc.data();
      const bucketKey = `${d.tenantId}_${d.unitId}_${period}`;
      const uid: string = d.uid;

      if (!buckets.has(bucketKey)) {
        buckets.set(bucketKey, new Map());
      }
      const userMap = buckets.get(bucketKey)!;
      const existing = userMap.get(uid) ?? { xp: 0, posts: 0 };
      existing.xp += (typeof d.xp === 'number' ? d.xp : 0);
      existing.posts += (typeof d.posts === 'number' ? d.posts : 0);
      userMap.set(uid, existing);
    }

    // Write snapshots in batches (max 500 writes per batch)
    const MAX_BATCH = 450;
    let batch = db.batch();
    let batchCount = 0;

    for (const [bucketKey, userMap] of buckets.entries()) {
      // Sort users by XP descending
      const ranked = Array.from(userMap.entries())
        .sort((a, b) => b[1].xp - a[1].xp)
        .map(([uid, agg], index) => ({
          uid,
          rank: index + 1,
          xp: agg.xp,
          posts: agg.posts,
        }));

      const snapshotRef = db.collection('leaderboard_snapshots').doc(bucketKey);
      batch.set(snapshotRef, {
        period,
        rankings: ranked,
        totalParticipants: ranked.length,
        rolledUpAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      batchCount++;
      if (batchCount >= MAX_BATCH) {
        await batch.commit();
        batch = db.batch();
        batchCount = 0;
      }
    }

    if (batchCount > 0) {
      await batch.commit();
    }

    functions.logger.info(
      `rollupLeaderboard: processed ${shardsSnap.size} shards into ${buckets.size} snapshots for period ${period}`,
    );
  });
