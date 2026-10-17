/**
 * leagueStepsRollup — every hour, today's and yesterday's steps
 * (dailyActivity.steps) into the league aggregates: 3 points per 1,000 steps
 * (lib/apply-league-stats.ts applyStepsToLeagueStats — idempotent by delta,
 * so re-running only adds what's new). Yesterday is included so the steps
 * walked after the last run before midnight still count.
 *
 * Scheduled, not a dailyActivity write trigger, for the same reason as
 * dailyActivityPublicSync: passive health sync writes that doc many times a
 * day, and the leagues are not a real-time screen.
 */
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';
import { applyStepsToLeagueStats } from './lib/apply-league-stats';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

function jerusalemDate(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
}

export const leagueStepsRollup = onSchedule({ schedule: '15 * * * *', timeZone: 'Asia/Jerusalem' }, async () => {
  const now = new Date();
  const days = [jerusalemDate(now), jerusalemDate(new Date(now.getTime() - 24 * 3600 * 1000))];
  const tally: Record<string, number> = {};
  for (const date of days) {
    const snap = await db.collection('dailyActivity').where('date', '==', date).get();
    for (const doc of snap.docs) {
      const d = doc.data();
      const uid = typeof d.userId === 'string' ? d.userId : '';
      if (!uid || !(typeof d.steps === 'number' && d.steps >= 1000)) continue;
      try {
        const r = await applyStepsToLeagueStats(db, () => admin.firestore.FieldValue.serverTimestamp(), uid, date, d.steps);
        tally[r] = (tally[r] ?? 0) + 1;
      } catch (e) {
        tally.error = (tally.error ?? 0) + 1;
        logger.warn('leagueStepsRollup: one user failed', { uid, date, e });
      }
    }
  }
  logger.info('leagueStepsRollup done', { days, tally });
});
