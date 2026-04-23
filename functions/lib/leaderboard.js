"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.rollupLeaderboard = exports.onFeedPostCreate = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();
const NUM_SHARDS = 10;
// ── Helpers ───────────────────────────────────────────────────────────
function getCurrentPeriod() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
}
// ── 1. Firestore Trigger — sharded increment ─────────────────────────
exports.onFeedPostCreate = functions.firestore
    .document('feed_posts/{docId}')
    .onCreate(async (snap) => {
    var _a, _b, _c, _d;
    const data = snap.data();
    const uid = (_b = (_a = data.userId) !== null && _a !== void 0 ? _a : data.uid) !== null && _b !== void 0 ? _b : '';
    const tenantId = (_c = data.tenantId) !== null && _c !== void 0 ? _c : '_global';
    const unitId = (_d = data.unitId) !== null && _d !== void 0 ? _d : '_all';
    const xp = typeof data.xpAwarded === 'number' ? data.xpAwarded : 1;
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
exports.rollupLeaderboard = functions.pubsub
    .schedule('0 3 * * *')
    .timeZone('Asia/Jerusalem')
    .onRun(async () => {
    var _a;
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
    const buckets = new Map();
    for (const doc of shardsSnap.docs) {
        const d = doc.data();
        const bucketKey = `${d.tenantId}_${d.unitId}_${period}`;
        const uid = d.uid;
        if (!buckets.has(bucketKey)) {
            buckets.set(bucketKey, new Map());
        }
        const userMap = buckets.get(bucketKey);
        const existing = (_a = userMap.get(uid)) !== null && _a !== void 0 ? _a : { xp: 0, posts: 0 };
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
    functions.logger.info(`rollupLeaderboard: processed ${shardsSnap.size} shards into ${buckets.size} snapshots for period ${period}`);
});
//# sourceMappingURL=leaderboard.js.map