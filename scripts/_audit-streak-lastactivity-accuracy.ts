/**
 * READ-ONLY, PRODUCTION. No writes, anywhere.
 *
 * David's explicit pre-condition (26.09.2026, before Slice F is built):
 * does streaks/{uid}.lastActivityDate actually update on EVERY real workout
 * save, or only most of them? If it lags behind reality, an officer viewing
 * the roster-workout-summary endpoint would see "לא התאמן" for a soldier
 * who trained TODAY — worse than the missing column it would replace,
 * because it looks like a confirmed fact instead of an acknowledged gap.
 *
 * Method: for a sample of real users who have a streaks/{uid} doc, compare
 * its lastActivityDate against that SAME user's actual most-recent
 * workouts.completedAt (a direct query, using the pre-existing
 * userId ASC + completedAt DESC index — no new index needed for this
 * audit itself). Flags the dangerous direction specifically: streaks
 * claims LESS recent activity than what workouts actually shows (streaks
 * is stale/behind) — that's the exact failure mode David is worried about.
 * Also flags the other direction (streaks claims MORE recent than any real
 * workout) since that would mean lastActivityDate reflects something
 * other than a workout completion.
 */
import * as admin from 'firebase-admin';

const key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? '');
if (!key?.project_id) { console.error('❌ FIREBASE_SERVICE_ACCOUNT_KEY missing'); process.exit(1); }
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(key as admin.ServiceAccount) });
const db = admin.firestore();

const MAX_SAMPLE = 300;
// Number of CALENDAR DAYS of slack allowed before calling it a real
// divergence — NOT a millisecond/hour threshold. lastActivityDate is
// stored as a plain 'YYYY-MM-DD' string (no time-of-day at all), so
// comparing it against a full Firestore Timestamp by raw milliseconds is
// wrong by construction: midnight-UTC-of-day-X will always look "hours
// behind" any real timestamp later that same day X, even though they're
// the SAME day. Comparing day-strings avoids that entirely. 1 day of
// slack absorbs a client-local-time vs UTC boundary crossing near
// midnight — a genuine divergence is many days, not one.
const DAY_SLACK = 1;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toDateString(v: unknown): string | null {
  // Firestore Timestamp
  if (v && typeof (v as any).toDate === 'function') return (v as any).toDate().toISOString().slice(0, 10);
  // Already a plain 'YYYY-MM-DD' (or any ISO) string
  if (typeof v === 'string') {
    const t = new Date(v);
    return Number.isFinite(t.getTime()) ? t.toISOString().slice(0, 10) : null;
  }
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return null;
}

function dayDiff(dateStrA: string, dateStrB: string): number {
  return Math.round((new Date(dateStrA).getTime() - new Date(dateStrB).getTime()) / MS_PER_DAY);
}

async function main() {
  console.log('=== 0. Scale check (count-only, no document reads) ===');
  const streaksCountSnap = await db.collection('streaks').count().get();
  const workoutsCountSnap = await db.collection('workouts').count().get();
  const streaksTotal = streaksCountSnap.data().count;
  console.log('streaks total docs:', streaksTotal);
  console.log('workouts total docs:', workoutsCountSnap.data().count);

  const sampleSize = Math.min(MAX_SAMPLE, streaksTotal);
  console.log(`\n=== 1. Sampling ${sampleSize} of ${streaksTotal} streaks/{uid} docs ===`);
  const streaksSnap = await db.collection('streaks').select('userId', 'lastActivityDate').limit(sampleSize).get();

  let checked = 0;
  let exactOrCloseMatch = 0;
  let streaksStaleBehindReal = 0; // THE dangerous direction David flagged
  let streaksAheadOfReal = 0; // the other direction — lastActivityDate from something else
  let noRealWorkoutsAtAll = 0; // streaks doc exists but user has zero workouts docs
  const staleExamples: string[] = [];
  const aheadExamples: string[] = [];

  for (const doc of streaksSnap.docs) {
    const data = doc.data();
    const uid = typeof data.userId === 'string' ? data.userId : doc.id;
    const streakDay = toDateString(data.lastActivityDate);
    if (streakDay === null) continue; // no lastActivityDate at all — separate, not this question

    // CORRECTED (26.09.2026) — real workouts/{docId} docs use `date`, not
    // `completedAt` at all (0/734 real docs have completedAt — see
    // _audit-workouts-full-field-schema.ts). The first run of this script
    // used completedAt and got "0 real workouts for every user" across the
    // board, which looked like a clean result but was actually this bug
    // masking any real signal.
    const realSnap = await db.collection('workouts')
      .where('userId', '==', uid)
      .orderBy('date', 'desc')
      .limit(1)
      .select('date')
      .get();

    checked++;
    if (realSnap.empty) {
      noRealWorkoutsAtAll++;
      continue;
    }
    const realDay = toDateString(realSnap.docs[0].data().date);
    if (realDay === null) continue;

    const diff = dayDiff(realDay, streakDay); // positive = real workout day is AFTER streak's claimed day
    if (diff > DAY_SLACK) {
      streaksStaleBehindReal++;
      if (staleExamples.length < 10) {
        staleExamples.push(`uid=${uid} streaks=${streakDay} realLastWorkout=${realDay} gap=${diff}d`);
      }
    } else if (diff < -DAY_SLACK) {
      streaksAheadOfReal++;
      if (aheadExamples.length < 10) {
        aheadExamples.push(`uid=${uid} streaks=${streakDay} realLastWorkout=${realDay} gap=${-diff}d`);
      }
    } else {
      exactOrCloseMatch++;
    }
  }

  console.log(`\n=== 2. Results (${checked} users with both a streaks doc and a lastActivityDate value) ===`);
  console.log(`exact-or-close match (within ${DAY_SLACK} day):`, exactOrCloseMatch);
  console.log('streaks STALE — real workout is more recent than streaks claims (THE dangerous direction):', streaksStaleBehindReal);
  console.log('streaks AHEAD — no real workout that recent (lastActivityDate may reflect non-workout activity):', streaksAheadOfReal);
  console.log('streaks doc exists but user has ZERO workouts docs at all:', noRealWorkoutsAtAll);

  if (staleExamples.length > 0) {
    console.log('\n--- stale examples (up to 10) ---');
    staleExamples.forEach((e) => console.log(' ', e));
  }
  if (aheadExamples.length > 0) {
    console.log('\n--- ahead examples (up to 10) ---');
    aheadExamples.forEach((e) => console.log(' ', e));
  }

  const staleRate = checked > 0 ? (streaksStaleBehindReal / checked) * 100 : 0;
  console.log(`\n=== 3. Verdict ===`);
  console.log(`stale rate: ${staleRate.toFixed(1)}% of checked users`);
  console.log(staleRate === 0
    ? '✅ Zero stale cases found in this sample — streaks/{uid}.lastActivityDate tracks real workout completions reliably (within this sample).'
    : '❌ Non-zero stale cases — streaks/{uid}.lastActivityDate is NOT reliably in sync with real workout completions. Do not use it as a data source for the roster-workout-summary endpoint.');
}

main().catch((err) => { console.error('failed:', err); process.exit(1); });
