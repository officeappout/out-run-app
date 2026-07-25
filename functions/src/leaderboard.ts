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
 * 2. onWorkoutCreate (Firestore trigger)
 *    Fires on every new workouts/{docId} document — the flag-independent
 *    activity record (written even while the community feed is paused).
 *    Resolves the author's tenantId/unitId from users/{uid}.core (workout docs
 *    don't carry them — this fixes the _global/_all bucketing bug) and feeds
 *    the SAME leaderboard_shards structure. This is the league's activity
 *    source for closed communities (Wix pilot) — no dependency on feed_posts.
 *
 * 3. rollupLeaderboard (Pub/Sub scheduled — daily at 03:00 UTC)
 *    Sums all shards per user/period and writes a ranked snapshot
 *    to leaderboard_snapshots/{tenantId}_{unitId}_{period}.
 */

import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
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

export const onFeedPostCreate = onDocumentCreated(
  'feed_posts/{docId}',
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const data = snap.data();
    const uid: string = data.userId ?? data.uid ?? '';
    const tenantId: string = data.tenantId ?? '_global';
    const unitId: string = data.unitId ?? '_all';
    const xp: number = typeof data.xpAwarded === 'number' ? data.xpAwarded : 1;

    if (!uid) {
      logger.warn('onFeedPostCreate: no userId, skipping');
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
  },
);

// ── 2. Firestore Trigger — workout completion → shard ───────────────
// Feed-independent league source. Fires on the durable `workouts` record
// (written by saveWorkout for strength/running/hybrid, regardless of the
// community-feed flag) and buckets by the author's community binding.

export const onWorkoutCreate = onDocumentCreated(
  'workouts/{docId}',
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const data = snap.data();
    const uid: string = data.userId ?? data.uid ?? '';

    if (!uid) {
      logger.warn('onWorkoutCreate: no userId, skipping');
      return;
    }

    // Resolve tenant/unit from the author's profile — workout docs don't carry
    // them. Missing binding → _global/_all (non-community users; harmless).
    let tenantId = '_global';
    let unitId = '_all';
    try {
      const userSnap = await db.collection('users').doc(uid).get();
      const core = (userSnap.data()?.core ?? {}) as { tenantId?: string; unitId?: string };
      if (core.tenantId) tenantId = core.tenantId;
      if (core.unitId) unitId = core.unitId;
    } catch (e) {
      logger.warn('onWorkoutCreate: could not read user core, using _global/_all', e);
    }

    // Activity credit = workout duration in minutes (floored at 1 so every
    // completed workout scores). Universal across activity types.
    const duration = typeof data.duration === 'number' ? data.duration : 0;
    const xp = Math.max(1, Math.round(duration));

    const period = getCurrentPeriod();
    const shard = Math.floor(Math.random() * NUM_SHARDS);
    const shardDocId = `${tenantId}_${unitId}_${period}_${uid}_${shard}`;

    await db.collection('leaderboard_shards').doc(shardDocId).set({
      tenantId,
      unitId,
      period,
      uid,
      shard,
      xp: admin.firestore.FieldValue.increment(xp),
      posts: admin.firestore.FieldValue.increment(1),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  },
);

// ── 3. Scheduled Rollup — nightly at 03:00 UTC ──────────────────────

export const rollupLeaderboard = onSchedule(
  { schedule: '0 3 * * *', timeZone: 'Asia/Jerusalem' },
  async () => {
    const period = getCurrentPeriod();

    // Query all shards for the current period
    const shardsSnap = await db
      .collection('leaderboard_shards')
      .where('period', '==', period)
      .get();

    if (shardsSnap.empty) {
      logger.info(`rollupLeaderboard: no shards for period ${period}`);
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

    logger.info(
      `rollupLeaderboard: processed ${shardsSnap.size} shards into ${buckets.size} snapshots for period ${period}`,
    );
  },
);
