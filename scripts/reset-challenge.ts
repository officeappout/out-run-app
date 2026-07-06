#!/usr/bin/env npx tsx
/**
 * reset-challenge.ts
 *
 * מוחק את כל הדוקים ב-challenge_submissions של מכביה 2026.
 * בטוח לחלוטין — לא נוגע ב-users, קבוצות אחרות, או שדות אחרים.
 *
 * שימוש:
 *   npx tsx scripts/reset-challenge.ts            # dry-run (מציג מה יימחק)
 *   npx tsx scripts/reset-challenge.ts --live      # מחיקה בפועל
 *
 * דרישות:
 *   GOOGLE_APPLICATION_CREDENTIALS מוגדר (או FIREBASE_SERVICE_ACCOUNT_KEY_PATH)
 */

import * as admin from 'firebase-admin';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

// ── Config ────────────────────────────────────────────────────────────────────

const TARGET_GROUP_ID = 'maccabiah_lsit_2026';
const SUBCOLLECTION    = 'challenge_submissions';
const BATCH_SIZE       = 400; // Firestore limit is 500; keep headroom

// ── Init ──────────────────────────────────────────────────────────────────────

if (!admin.apps.length) {
  const keyJson  = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  const keyPath  = process.env.FIREBASE_SERVICE_ACCOUNT_KEY_PATH
    ?? process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (keyJson) {
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(keyJson)) });
  } else if (keyPath) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(keyPath))) });
  } else {
    console.error('❌  Set FIREBASE_SERVICE_ACCOUNT_KEY (JSON string) or FIREBASE_SERVICE_ACCOUNT_KEY_PATH');
    process.exit(1);
  }
}

const db = admin.firestore();

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const isLive = process.argv.includes('--live');
  const collPath = `community_groups/${TARGET_GROUP_ID}/${SUBCOLLECTION}`;

  console.log('\n🗂  Target:', collPath);
  console.log('📋  Mode:', isLive ? '🔴 LIVE — מחיקה בפועל' : '🟡 DRY-RUN — מציג בלבד');
  console.log('─'.repeat(52));

  const collRef = db.collection(collPath);
  let totalDeleted = 0;
  let page = 0;

  while (true) {
    const snap = await collRef.limit(BATCH_SIZE).get();
    if (snap.empty) break;

    page++;
    console.log(`\n📄  עמוד ${page} — ${snap.size} דוקים`);

    for (const doc of snap.docs) {
      const d = doc.data();
      const display = `  • ${doc.id.slice(0, 8)}… | ${d.name ?? '?'} | ${d.gender ?? '?'} | ${d.bestValue ?? 0}s`;
      console.log(display);
    }

    if (isLive) {
      const batch = db.batch();
      snap.docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
      totalDeleted += snap.size;
      console.log(`  ✅ נמחקו ${snap.size} דוקים`);
    } else {
      console.log(`  (dry-run — לא נמחקו)`);
      // In dry-run, no actual deletes — break after one page to avoid infinite loop
      // (real delete would shrink the collection; without delete we'd re-read same page)
      const totalSnap = await collRef.count().get();
      console.log(`\n📊  סה"כ דוקים בקולקשן: ${totalSnap.data().count}`);
      break;
    }
  }

  if (isLive) {
    console.log(`\n✅  הושלם. נמחקו ${totalDeleted} דוקים מ-${collPath}`);
    console.log('   הלוח נקי ומוכן לאירוע.\n');
  } else {
    console.log('\nℹ️   הרץ עם --live כדי למחוק בפועל.\n');
  }
}

main().catch((err) => {
  console.error('❌  שגיאה:', err);
  process.exit(1);
});
