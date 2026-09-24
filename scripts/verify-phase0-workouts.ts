/**
 * scripts/verify-phase0-workouts.ts — READ ONLY
 *
 * Phase 0 (hybrid plumbing) verification: prints the most recent workout
 * docs and checks the new write shape —
 *   • walking sessions filed as workoutType 'walking' (not 'running')
 *   • strength sessions filed as workoutType 'strength' (lowercase)
 *   • segments[] present with planned-vs-actual per unit
 *
 * Usage: npx tsx scripts/verify-phase0-workouts.ts [hoursBack=6]
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import * as admin from 'firebase-admin';

function initFirebase() {
  if (admin.apps.length) return;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY not set');
  const c = JSON.parse(raw);
  admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
}

async function main() {
  initFirebase();
  const db = admin.firestore();

  const hoursBack = Number(process.argv[2] ?? 6);
  const since = new Date(Date.now() - hoursBack * 3600 * 1000);

  const snap = await db
    .collection('workouts')
    .where('date', '>=', since)
    .orderBy('date', 'desc')
    .limit(25)
    .get();

  console.log(`\n${snap.size} workout docs in the last ${hoursBack}h\n`);

  for (const doc of snap.docs) {
    const d = doc.data();
    const date = d.date?.toDate?.()?.toLocaleString('he-IL') ?? '?';
    const seg = Array.isArray(d.segments) ? d.segments : null;

    console.log(`── ${doc.id}`);
    console.log(`   date=${date}  user=${String(d.userId).slice(0, 8)}…`);
    console.log(`   activityType=${d.activityType}  workoutType=${d.workoutType}  category=${d.category}`);
    console.log(`   distance=${d.distance}km  duration=${d.duration}s  calories=${d.calories}`);
    if (seg) {
      for (const s of seg) {
        console.log(
          `   segments[${s.index}] kind=${s.kind}` +
          (s.aerobicType ? ` aerobicType=${s.aerobicType}` : '') +
          (s.label ? ` label="${s.label}"` : '') +
          (s.parkId ? ` parkId=${s.parkId}` : ''),
        );
        if (s.planned) console.log(`     planned: ${JSON.stringify(s.planned)}`);
        if (s.actual)  console.log(`     actual:  ${JSON.stringify(s.actual)}`);
      }
    } else {
      console.log('   segments: — (pre-Phase-0 doc or legacy writer)');
    }

    // Phase 0 assertions
    const flags: string[] = [];
    if (d.workoutType === 'STRENGTH') flags.push('❌ uppercase STRENGTH (old writer)');
    if (d.activityType === 'walking' && d.workoutType !== 'walking') flags.push("❌ walking filed as '" + d.workoutType + "'");
    if ((d.workoutType === 'walking' || d.workoutType === 'running' || d.workoutType === 'strength') && !seg) flags.push('⚠️ no segments[]');
    if (flags.length) console.log('   ' + flags.join('  '));
    console.log('');
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
