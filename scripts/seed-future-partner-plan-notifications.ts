#!/usr/bin/env npx tsx
/**
 * scripts/seed-future-partner-plan-notifications.ts
 *
 * Foundation C (minimal) for Phase 3 of the social-activities build plan —
 * a small, light copy set for the new "activity created near you" trigger
 * (triggerType='Future_Partner_Plan', see functions/src/onPlannedActivityCreated.ts).
 * Writes into the SAME existing content library David authors through
 * /admin/workout-settings ("מנהל התראות") — workoutMetadata/notifications/
 * notifications — not a new/parallel store. Same deterministic FNV-1a
 * doc-ID scheme as seed-daily-goal-notifications.ts (same content → same
 * ID → safe re-run).
 *
 * Scope (per the plan — "light, no per-persona variants for launch"):
 *   persona = 'generic' only (selectNotificationContent already matches
 *   'generic' against any user's real persona — no per-persona authoring
 *   needed for v1).
 *   2 copy variants per activityType (running / walking / strength) = 6
 *   entries total. Same message serves both the radius axis and the
 *   partners axis (no axis-specific copy — see the Cloud Function's own
 *   header comment for why).
 *
 * Tags used: @שם (recipient's name, resolved by personaliseNotificationText
 * same as every other trigger) + the Cloud Function's own generic-{key}
 * vars {creatorName} / {placeName} (NOT the client-side @-tag vocabulary —
 * those two are custom vars this trigger introduces, matching the existing
 * `{word}`-replace pattern every scheduler already uses for ad-hoc vars).
 *
 * ⚠️ DRY RUN BY DEFAULT. Prints what would be written and exits — makes NO
 * Firestore writes unless invoked with --apply. Per explicit instruction:
 * this script is committed but HELD — do not run with --apply until told to.
 *
 * Usage:
 *   npx tsx scripts/seed-future-partner-plan-notifications.ts            # dry run (default)
 *   npx tsx scripts/seed-future-partner-plan-notifications.ts --apply    # actually write
 *
 * Requires (--apply only): FIREBASE_SERVICE_ACCOUNT_KEY in .env.local.
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import * as admin from 'firebase-admin';

const APPLY = process.argv.includes('--apply');

// ─── Deterministic doc-ID — identical algorithm to bulk/page.tsx's fnv1aHash,
// same as seed-daily-goal-notifications.ts ──────────────────────────────────

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

// ─── Messages ─────────────────────────────────────────────────────────────────

interface SeedMessage {
  activityType: 'running' | 'walking' | 'strength';
  bundleId: string;
  text: string;
  psychologicalTrigger: 'Support' | 'Challenge' | 'Reward' | 'Social_Proof';
}

const COMMON = {
  triggerType: 'Future_Partner_Plan' as const,
  persona: 'generic' as const,
  gender: 'both' as const,
  calendarIntegration: false,
};

const MESSAGES: SeedMessage[] = [
  // ── running ──
  {
    activityType: 'running',
    bundleId: 'future_partner_plan_running_generic_01',
    text: '@שם, {creatorName} יוצא/ת לרוץ ב{placeName} — רוצה להצטרף?',
    psychologicalTrigger: 'Social_Proof',
  },
  {
    activityType: 'running',
    bundleId: 'future_partner_plan_running_generic_02',
    text: 'מישהו קרוב אליך יוצא לריצה עכשיו — זה הזמן להצטרף 🏃',
    psychologicalTrigger: 'Support',
  },
  // ── walking ──
  {
    activityType: 'walking',
    bundleId: 'future_partner_plan_walking_generic_01',
    text: '@שם, {creatorName} יוצא/ת להליכה ב{placeName} — בוא/י גם',
    psychologicalTrigger: 'Social_Proof',
  },
  {
    activityType: 'walking',
    bundleId: 'future_partner_plan_walking_generic_02',
    text: 'מישהו קרוב אליך יוצא להליכה עכשיו — אל תלכ/י לבד 🚶',
    psychologicalTrigger: 'Support',
  },
  // ── strength ──
  {
    activityType: 'strength',
    bundleId: 'future_partner_plan_strength_generic_01',
    text: '@שם, {creatorName} מתאמן/ת עכשיו ב{placeName} — בוא/י להתאמן ביחד',
    psychologicalTrigger: 'Social_Proof',
  },
  {
    activityType: 'strength',
    bundleId: 'future_partner_plan_strength_generic_02',
    text: 'מישהו קרוב אליך יוצא לאימון כוח עכשיו — שותף/ה לאימון מחכה 💪',
    psychologicalTrigger: 'Support',
  },
];

// ─── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  console.log(
    `📝  ${APPLY ? 'Seeding' : 'DRY RUN — would seed'} ${MESSAGES.length} ` +
      `Future_Partner_Plan notification(s)…\n`,
  );

  if (!APPLY) {
    for (const msg of MESSAGES) {
      const docId = generateDocId(msg.text, COMMON.persona, msg.bundleId, COMMON.gender);
      console.log(`+ [${msg.activityType}] ${msg.bundleId} → ${docId}`);
      console.log(`    text: ${msg.text}`);
      console.log(`    psychologicalTrigger: ${msg.psychologicalTrigger}\n`);
    }
    console.log('🛑  Dry run only — no Firestore writes made. Re-run with --apply to actually write.');
    return;
  }

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

  for (const msg of MESSAGES) {
    const docId = generateDocId(msg.text, COMMON.persona, msg.bundleId, COMMON.gender);
    const ref = db.collection('workoutMetadata').doc('notifications').collection('notifications').doc(docId);
    const existed = (await ref.get()).exists;

    await ref.set(
      {
        triggerType: COMMON.triggerType,
        activityType: msg.activityType,
        gender: COMMON.gender,
        calendarIntegration: COMMON.calendarIntegration,
        persona: COMMON.persona,
        bundleId: msg.bundleId,
        text: msg.text,
        psychologicalTrigger: msg.psychologicalTrigger,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        ...(existed ? {} : { createdAt: admin.firestore.FieldValue.serverTimestamp() }),
      },
      { merge: true },
    );

    console.log(`${existed ? '↻' : '+'} [${msg.activityType}] ${msg.bundleId} → ${docId}`);
  }

  console.log(`\n✅  Done — ${MESSAGES.length} message(s) seeded.`);
}

run()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('❌  Seed failed:', e);
    process.exit(1);
  });
