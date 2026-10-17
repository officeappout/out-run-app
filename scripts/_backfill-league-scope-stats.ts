/**
 * scripts/_backfill-league-scope-stats.ts
 *
 * Fill league_scope_stats for the CURRENT week and month from the workouts
 * collection — run once after deploying onWorkoutCreateLeagueStats, before
 * switching on enable_league_aggregates. Uses the exact same per-workout
 * function as the trigger (functions/src/lib/apply-league-stats.ts), guarded
 * by the same processed marker, so re-running it — or the trigger having
 * already counted a workout — never double-counts.
 *
 * Default mode is READ-ONLY (reports what it would add). Pass --commit to write.
 *
 * Usage:
 *   npx tsx scripts/_backfill-league-scope-stats.ts            # dry run
 *   npx tsx scripts/_backfill-league-scope-stats.ts --commit   # apply
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '/Users/calisthenicsltd/Development/appout-1/.env.local' });
import * as admin from 'firebase-admin';
import { applyWorkoutToLeagueStats } from '../functions/src/lib/apply-league-stats';
import { activityOf, creditOf, minutesOf } from '../functions/src/lib/league-scope-stats';

const COMMIT = process.argv.includes('--commit');

function init() {
  if (admin.apps.length) return;
  const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
}

/** The earlier of: this month's 1st, this week's Sunday (Asia/Jerusalem, a day of slack). */
function since(): Date {
  const now = new Date();
  const d = new Date(now.getTime() - 40 * 24 * 3600 * 1000); // covers any month + its first week
  return d;
}

async function main() {
  init();
  const db = admin.firestore();
  const snap = await db.collection('workouts').where('date', '>=', admin.firestore.Timestamp.fromDate(since())).get();
  console.log(`${snap.size} workouts since ${since().toISOString()} — ${COMMIT ? 'COMMIT' : 'dry run'}`);
  const tally: Record<string, number> = {};
  let credit = 0;
  for (const d of snap.docs) {
    const data = d.data();
    if (!COMMIT) {
      const c = creditOf(minutesOf(data.duration), activityOf(data.category, data.workoutType ?? data.activityType));
      const processed = (await db.collection('league_scope_stats_processed').doc(d.id).get()).exists;
      const k = processed ? 'already' : c > 0 ? 'would-apply' : 'no-credit';
      tally[k] = (tally[k] ?? 0) + 1;
      if (k === 'would-apply') credit += c;
      continue;
    }
    const r = await applyWorkoutToLeagueStats(db, () => admin.firestore.FieldValue.serverTimestamp(), d.id, data);
    tally[r] = (tally[r] ?? 0) + 1;
  }
  console.log(tally, COMMIT ? '' : `(${credit} points would be added before scope checks)`);
  // Note: workouts older than the current week/month land in past period docs
  // nobody reads — harmless, and they keep every week consistent if a past
  // week is ever shown.
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
