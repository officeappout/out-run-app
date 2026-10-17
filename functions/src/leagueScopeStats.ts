/**
 * onWorkoutCreateLeagueStats — per-scope league aggregates from the
 * flag-independent `workouts` record (David, 17.10.2026).
 *
 * The neighborhood / city / group boards used to sum feed_posts on the client:
 * they only moved while enable_community_feed was on, a user who didn't post
 * didn't count, and every board load read a whole period of posts. This
 * trigger keeps one small doc per window × period × scope instead:
 *
 *   league_scope_stats/{window}_{periodKey}_{granularity}_{scopeId}
 *     { window, periodKey, granularity, scopeId, parentId,
 *       totalCredit, activeMemberCount,
 *       byActivity: { strength|cardio|maintenance: { credit, members } },
 *       byGender:   { male|female: { credit, members } }, updatedAt }
 *   …/members/{uid}   (server-only) { credit, activities[], gender }
 *
 * Only sums and counts are readable — no per-user workout data reaches other
 * users. Scopes come from the author's protected profile (users/{uid}.core +
 * social.groupIds), never from the workout doc. One transaction per workout,
 * guarded by league_scope_stats_processed/{workoutId}, so a retried trigger
 * never double-counts.
 */

import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';
import { applyWorkoutToLeagueStats } from './lib/apply-league-stats';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

export const onWorkoutCreateLeagueStats = onDocumentCreated('workouts/{docId}', async (event) => {
  const snap = event.data;
  if (!snap) return;
  try {
    await applyWorkoutToLeagueStats(db, () => admin.firestore.FieldValue.serverTimestamp(), event.params.docId, snap.data());
  } catch (e) {
    logger.error('onWorkoutCreateLeagueStats failed', { workoutId: event.params.docId, e });
    throw e; // let the platform retry — the processed marker keeps it exactly-once
  }
});
