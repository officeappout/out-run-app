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
 *    Resolves the author's tenantId/unitId from users/{uid}.core (fixes the
 *    _global/_all bucketing bug) and records ACTIVE DAYS: one deterministic
 *    doc per user-per-day, flagged active once ⅔ of the daily target is
 *    crossed (capped at the target). getTenantLeaderboard sums the flags →
 *    "active days this month". League source for closed communities (Wix).
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

// ── 2. Firestore Trigger — workout completion → active-day ──────────
// Feed-independent league source. Metric = ACTIVE DAYS: a day counts once
// when the member crosses ⅔ of the daily target, capped at the target (a
// heavy day is still one day). One deterministic doc per user-per-day holds
// the activeDay flag (0/1) that getTenantLeaderboard sums into "days".

// Daily target = the app's default daily goal (DEFAULT_DAILY_GOALS ~30 min).
// A day is "active" at ⅔ of it. Deliberately stricter than the app's flat
// STREAK_MINIMUM_MINUTES (10) — this is the league's own bar.
const DAILY_TARGET_MIN = 30;
const ACTIVE_DAY_MIN = 20; // = Math.round((2 / 3) * DAILY_TARGET_MIN)

// Calendar day in Israel local time (day boundary = Asia/Jerusalem), so the
// same day buckets consistently with the client read (getMonthPeriod).
function jerusalemDayParts(d: Date): { period: string; day: string } {
  const ymd = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' }); // YYYY-MM-DD
  return { period: ymd.slice(0, 7), day: ymd };
}

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

    const durationMin =
      typeof data.duration === 'number' && data.duration > 0 ? data.duration : 0;

    // The calendar day this workout belongs to (prefer the workout's own date).
    const when =
      data.date && typeof data.date.toDate === 'function' ? data.date.toDate() : new Date();
    const { period, day } = jerusalemDayParts(when);

    // Deterministic per-day doc → accumulate the day's minutes (capped at the
    // target) and flip activeDay to 1 once ⅔ of the target is crossed. In a
    // transaction so concurrent same-day workouts don't race.
    const dayRef = db
      .collection('leaderboard_shards')
      .doc(`${tenantId}_${unitId}_${period}_${uid}_${day}`);

    await db.runTransaction(async (tx) => {
      const cur = (await tx.get(dayRef)).data() ?? {};
      const prevMin = typeof cur.minutes === 'number' ? cur.minutes : 0;
      const prevWorkouts = typeof cur.workouts === 'number' ? cur.workouts : 0;
      const minutes = Math.min(DAILY_TARGET_MIN, prevMin + durationMin); // daily cap
      const activeDay = minutes >= ACTIVE_DAY_MIN ? 1 : 0;

      tx.set(dayRef, {
        tenantId,
        unitId,
        period,
        uid,
        day,
        minutes,
        workouts: prevWorkouts + 1,
        activeDay,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    });
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
