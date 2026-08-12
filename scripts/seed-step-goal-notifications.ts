#!/usr/bin/env npx tsx
/**
 * ⚠️ SUPERSEDED (12.08.2026, Wave 1) — do not re-run. The doc this script
 * writes (bundleId 'steps_evening_generic_01', triggerType='Habit_Maintenance')
 * is deleted by scripts/seed-daily-goal-notifications.ts's SUPERSEDED_DOC_IDS
 * cleanup and is no longer reachable by stepGoalNudgeScheduler.ts's selector
 * (now filters on triggerType='Daily_Goal'). Kept only as a historical record
 * of the original ad-hoc test. Use seed-daily-goal-notifications.ts instead.
 *
 * scripts/seed-step-goal-notifications.ts
 *
 * Seeds the FIRST step-goal message into the EXISTING notification-manager
 * content library at workoutMetadata/notifications/notifications — the
 * same 201-entry store David authors through /admin/workout-settings
 * ("מנהל התראות"). This is not a new/parallel store.
 *
 * Copy approved 11.08.2026. Fields chosen per
 * .claude/knowledge/notification-manager-wiring-design.md: existing,
 * UI-dropdown-supported enum values only (triggerType='Habit_Maintenance',
 * psychologicalTrigger='Support') — zero schema/type changes required
 * anywhere. No deepLink field (doesn't exist on this schema) — the deep
 * link is hardcoded in functions/src/stepGoalNudgeScheduler.ts instead.
 *
 * Doc ID: the SAME deterministic FNV-1a hash the bulk-uploader
 * (src/app/admin/workout-settings/bulk/page.tsx: fnv1aHash/generateDocId)
 * already uses for exactly this purpose — same content → same ID → this
 * script is a safe upsert (merge:true) on re-run, not a duplicate-creator.
 * If David later re-uploads the identical row via the bulk-upload UI, it
 * resolves to the same doc ID too.
 *
 * 12.08.2026 update: copy changed to template in the real remaining-steps
 * count ({steps_left}, computed by stepGoalNudgeScheduler.ts at send time).
 * Since the doc ID is a hash of the text itself, this is a genuinely
 * DIFFERENT message, not an edit of the old one — the script now also
 * deletes the superseded doc (tracked in SUPERSEDED_DOC_IDS below) so the
 * corpus doesn't end up with two competing steps_-bundle candidates that
 * the selector could inconsistently alternate between. Safe to re-run
 * (deleting an already-deleted doc is a no-op).
 *
 * Usage:
 *   npx tsx scripts/seed-step-goal-notifications.ts
 *
 * Requires: FIREBASE_SERVICE_ACCOUNT_KEY in .env.local (auto-loaded below).
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import * as admin from 'firebase-admin';

// ─── Auth ─────────────────────────────────────────────────────────────────────

const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!rawKey) {
  console.error('❌  FIREBASE_SERVICE_ACCOUNT_KEY not set (.env.local).');
  process.exit(1);
}
const key = JSON.parse(rawKey);
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(key as admin.ServiceAccount) });
}
const db = admin.firestore();

// ─── Deterministic doc-ID — identical algorithm to bulk/page.tsx's fnv1aHash ──

function fnv1aHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function generateDocId(text: string, persona: string, bundleId: string, gender: string): string {
  const raw = [text.trim(), persona.trim(), bundleId.trim(), gender.trim()]
    .filter(Boolean)
    .join('|');
  return fnv1aHash(raw);
}

// ─── Message ──────────────────────────────────────────────────────────────────

const MESSAGE = {
  triggerType: 'Habit_Maintenance', // existing enum value, 0 real usage before this, UI-dropdown-supported
  persona: 'generic',
  gender: 'both',
  psychologicalTrigger: 'Support', // existing enum value, 0 real usage before this, UI-dropdown-supported
  text: 'נשארו לך {steps_left} צעדים ליעד היום 👟 סיבוב קצר בפארק וזה שלך.',
  calendarIntegration: false,
  bundleId: 'steps_evening_generic_01', // the selector's bundleIdPrefix filter ('steps_') matches this
};

// Doc IDs from prior copy revisions of this same logical message — deleted
// after the new doc is written, so only one steps_-bundle candidate exists
// at a time. Append here (don't remove old entries) if the copy changes again.
const SUPERSEDED_DOC_IDS = [
  'c91f271d', // 11.08.2026 — static text, no {steps_left} templating
];

// ─── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  const docId = generateDocId(MESSAGE.text, MESSAGE.persona, MESSAGE.bundleId, MESSAGE.gender);

  console.log('📝  Seeding step-goal notification…');
  console.log(`    doc ID (deterministic): ${docId}`);
  console.log(`    bundleId: ${MESSAGE.bundleId}`);

  const ref = db
    .collection('workoutMetadata')
    .doc('notifications')
    .collection('notifications')
    .doc(docId);

  const existed = (await ref.get()).exists;

  await ref.set(
    {
      ...MESSAGE,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      ...(existed ? {} : { createdAt: admin.firestore.FieldValue.serverTimestamp() }),
    },
    { merge: true },
  );

  console.log(`✅  ${existed ? 'Updated existing' : 'Created new'} doc: ${docId}`);

  const snap = await ref.get();
  console.log('\n📖  Read-back:');
  console.log(JSON.stringify(snap.data(), null, 2));

  console.log('\n🧹  Cleaning up superseded doc(s)…');
  for (const oldId of SUPERSEDED_DOC_IDS) {
    if (oldId === docId) continue; // current content hashed back to an old id — nothing to delete
    const oldRef = db.collection('workoutMetadata').doc('notifications').collection('notifications').doc(oldId);
    const oldSnap = await oldRef.get();
    if (oldSnap.exists) {
      await oldRef.delete();
      console.log(`    deleted superseded doc: ${oldId}`);
    } else {
      console.log(`    (already absent, nothing to do: ${oldId})`);
    }
  }

  process.exit(0);
}

run().catch((e) => {
  console.error('❌  Seed failed:', e);
  process.exit(1);
});
