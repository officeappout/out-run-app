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
 *
 * **04.10.2026 addition — demo/seed exclusion.** The original run of this
 * script (26.09.2026) reported "streaks doc exists, zero matching workouts
 * docs" for a chunk of sampled users without distinguishing real production
 * users from demo/seed data. `seed-military-school-demo.ts`'s `seedStreaks()`
 * writes a `streaks/{uid}` doc directly with a random streak value and NO
 * corresponding `workouts` docs, BY DESIGN (so the streak leaderboard has
 * data immediately) — every one of those uids is a guaranteed false-positive
 * "zero workouts" case that has nothing to do with the real strength
 * summary-mount-write bug (04.10.2026 streak-accuracy investigation). This
 * run excludes them two ways (defense in depth, since existing demo docs
 * predate this session's isMockData tagging fix and can't be retro-filtered
 * by that tag alone): (1) uid prefix `military-demo-`/`school-demo-` —
 * deterministic, set by the seeder itself; (2) streaks-doc `authorityId`
 * `battalion-890`/`school-rabin` — the two seeder's fixed demo authority
 * IDs, stamped directly on the streaks doc. Reports BOTH the raw (all
 * sampled users) and demo-excluded numbers so the two runs stay comparable.
 */
const DEMO_UID_PREFIXES = ['military-demo-', 'school-demo-'];
const DEMO_AUTHORITY_IDS = ['battalion-890', 'school-rabin'];
function isDemoSeedUser(uid: string, authorityId: unknown): boolean {
  if (DEMO_UID_PREFIXES.some((p) => uid.startsWith(p))) return true;
  if (typeof authorityId === 'string' && DEMO_AUTHORITY_IDS.includes(authorityId)) return true;
  return false;
}
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
  const streaksSnap = await db.collection('streaks').select('userId', 'lastActivityDate', 'authorityId').limit(sampleSize).get();

  // Each bucket tracked twice: 'all' (raw, comparable to the 26.09.2026 run)
  // and 'real' (demo/seed uids excluded — see header comment). 'demo' is
  // derived as all-minus-real for the report, not tracked separately.
  const counts = {
    all: { checked: 0, exactOrCloseMatch: 0, streaksStaleBehindReal: 0, streaksAheadOfReal: 0, noRealWorkoutsAtAll: 0 },
    real: { checked: 0, exactOrCloseMatch: 0, streaksStaleBehindReal: 0, streaksAheadOfReal: 0, noRealWorkoutsAtAll: 0 },
  };
  const staleExamples: string[] = [];
  const aheadExamples: string[] = [];
  const demoNoWorkoutExamples: string[] = [];

  for (const doc of streaksSnap.docs) {
    const data = doc.data();
    const uid = typeof data.userId === 'string' ? data.userId : doc.id;
    const isDemo = isDemoSeedUser(uid, data.authorityId);
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

    for (const bucket of isDemo ? [counts.all] : [counts.all, counts.real]) {
      bucket.checked++;
    }
    if (realSnap.empty) {
      counts.all.noRealWorkoutsAtAll++;
      if (!isDemo) counts.real.noRealWorkoutsAtAll++;
      else if (demoNoWorkoutExamples.length < 10) demoNoWorkoutExamples.push(`uid=${uid} authorityId=${data.authorityId}`);
      continue;
    }
    const realDay = toDateString(realSnap.docs[0].data().date);
    if (realDay === null) continue;

    const diff = dayDiff(realDay, streakDay); // positive = real workout day is AFTER streak's claimed day
    if (diff > DAY_SLACK) {
      counts.all.streaksStaleBehindReal++;
      if (!isDemo) counts.real.streaksStaleBehindReal++;
      if (staleExamples.length < 10) {
        staleExamples.push(`uid=${uid} streaks=${streakDay} realLastWorkout=${realDay} gap=${diff}d${isDemo ? ' [DEMO]' : ''}`);
      }
    } else if (diff < -DAY_SLACK) {
      counts.all.streaksAheadOfReal++;
      if (!isDemo) counts.real.streaksAheadOfReal++;
      if (aheadExamples.length < 10) {
        aheadExamples.push(`uid=${uid} streaks=${streakDay} realLastWorkout=${realDay} gap=${-diff}d${isDemo ? ' [DEMO]' : ''}`);
      }
    } else {
      counts.all.exactOrCloseMatch++;
      if (!isDemo) counts.real.exactOrCloseMatch++;
    }
  }

  const demoCount = counts.all.checked - counts.real.checked;
  const demoNoWorkouts = counts.all.noRealWorkoutsAtAll - counts.real.noRealWorkoutsAtAll;

  console.log(`\n=== 2a. RAW results, all ${counts.all.checked} sampled users (comparable to the 26.09.2026 run) ===`);
  console.log(`exact-or-close match (within ${DAY_SLACK} day):`, counts.all.exactOrCloseMatch);
  console.log('streaks STALE — real workout is more recent than streaks claims (THE dangerous direction):', counts.all.streaksStaleBehindReal);
  console.log('streaks AHEAD — no real workout that recent (lastActivityDate may reflect non-workout activity):', counts.all.streaksAheadOfReal);
  console.log('streaks doc exists but user has ZERO workouts docs at all:', counts.all.noRealWorkoutsAtAll);

  console.log(`\n=== 2b. Demo/seed split — ${demoCount} of ${counts.all.checked} sampled uids are military-demo-*/school-demo-* seed users ===`);
  console.log('of those demo uids, zero-workouts count:', demoNoWorkouts, demoCount > 0 ? `(${((demoNoWorkouts / demoCount) * 100).toFixed(0)}% of demo uids)` : '');
  if (demoNoWorkoutExamples.length > 0) {
    console.log('--- demo zero-workout examples (up to 10) ---');
    demoNoWorkoutExamples.forEach((e) => console.log(' ', e));
  }

  console.log(`\n=== 2c. REAL-users-only results, ${counts.real.checked} sampled users (demo/seed excluded — the TRUE rate) ===`);
  console.log(`exact-or-close match (within ${DAY_SLACK} day):`, counts.real.exactOrCloseMatch);
  console.log('streaks STALE — real workout is more recent than streaks claims (THE dangerous direction):', counts.real.streaksStaleBehindReal);
  console.log('streaks AHEAD — no real workout that recent (lastActivityDate may reflect non-workout activity):', counts.real.streaksAheadOfReal);
  console.log('streaks doc exists but user has ZERO workouts docs at all:', counts.real.noRealWorkoutsAtAll);

  if (staleExamples.length > 0) {
    console.log('\n--- stale examples (up to 10, [DEMO] tag where applicable) ---');
    staleExamples.forEach((e) => console.log(' ', e));
  }
  if (aheadExamples.length > 0) {
    console.log('\n--- ahead examples (up to 10, [DEMO] tag where applicable) ---');
    aheadExamples.forEach((e) => console.log(' ', e));
  }

  const checked = counts.real.checked;
  const noRealWorkoutsAtAll = counts.real.noRealWorkoutsAtAll;
  const zeroWorkoutsRateReal = checked > 0 ? (noRealWorkoutsAtAll / checked) * 100 : 0;
  const zeroWorkoutsRateRaw = counts.all.checked > 0 ? (counts.all.noRealWorkoutsAtAll / counts.all.checked) * 100 : 0;
  console.log(`\n=== 3. Verdict ===`);
  console.log(`zero-workouts rate, RAW (all sampled, matches the original 47%-style figure): ${zeroWorkoutsRateRaw.toFixed(1)}%`);
  console.log(`zero-workouts rate, REAL USERS ONLY (demo/seed excluded — the TRUE bug rate): ${zeroWorkoutsRateReal.toFixed(1)}%`);
  const staleRate = checked > 0 ? (counts.real.streaksStaleBehindReal / checked) * 100 : 0;
  console.log(`stale rate (real users only): ${staleRate.toFixed(1)}% of checked users`);
  console.log(staleRate === 0
    ? '✅ Zero stale cases found in this sample — streaks/{uid}.lastActivityDate tracks real workout completions reliably (within this sample).'
    : '❌ Non-zero stale cases — streaks/{uid}.lastActivityDate is NOT reliably in sync with real workout completions. Do not use it as a data source for the roster-workout-summary endpoint.');
}

main().catch((err) => { console.error('failed:', err); process.exit(1); });
