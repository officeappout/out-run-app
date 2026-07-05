#!/usr/bin/env npx tsx
/**
 * setup-maccabiah-challenge.ts
 *
 * One-time setup script: creates the Maccabiah L-sit challenge group in Firestore.
 * Run ONCE before the event: npx tsx scripts/setup-maccabiah-challenge.ts
 *
 * Safe to re-run — uses set({ merge: true }) so existing data is preserved.
 */

import * as admin from 'firebase-admin';

// ── Init — same pattern as other scripts (FIREBASE_SERVICE_ACCOUNT_KEY) ───────
if (!admin.apps.length) {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY env var not set');
  const key = JSON.parse(raw);
  admin.initializeApp({ credential: admin.credential.cert(key), projectId: key.project_id });
}

const db = admin.firestore();

// ── Challenge group doc ───────────────────────────────────────────────────────
const GROUP_ID   = 'maccabiah_lsit_2026';
const INVITE_CODE = 'LSIT26';

async function main() {
  console.log(`Writing community_groups/${GROUP_ID} …`);

  await db.doc(`community_groups/${GROUP_ID}`).set(
    {
      id: GROUP_ID,
      name: 'אתגר ה-L-Sit · מכביה 2026',
      description: 'כמה שניות אתה מחזיק L-sit? הצטרף, נסה, ראה את הדירוג בזמן אמת.',
      category: 'calisthenics',
      hasMeetups: false,
      groupSubtype: 'challenge',
      challengeMetric: {
        type: 'time',
        unit: 'seconds',
        higherIsBetter: true,
        targetValue: 60,
      },
      inviteCode: INVITE_CODE,
      isPublic: false,
      source: 'authority',
      isOfficial: true,
      currentParticipants: 0,
      memberCount: 0,
      isActive: true,
      createdBy: 'system',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  console.log(`✅ community_groups/${GROUP_ID} written`);
  console.log(`   inviteCode: ${INVITE_CODE}`);
  console.log(`   QR URL: https://outrun.co.il/challenge/${INVITE_CODE}`);

  // ── Verify exercises/l_sit ──────────────────────────────────────────────────
  const exerciseSnap = await db.doc('exercises/l_sit').get();
  if (exerciseSnap.exists) {
    const data = exerciseSnap.data()!;
    console.log(`✅ exercises/l_sit exists — videoUrl: ${data.videoUrl ?? 'null (fallback OK)'}`);
  } else {
    console.warn(`⚠️  exercises/l_sit NOT FOUND — ExerciseVideoPlayer will use fallback`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
