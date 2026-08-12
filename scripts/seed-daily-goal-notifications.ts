#!/usr/bin/env npx tsx
/**
 * scripts/seed-daily-goal-notifications.ts
 *
 * Wave 1 seed for the notification/measurement engine — a small, MEASURABLE
 * content library for the new daily-goal-completion axis
 * (triggerType='Daily_Goal', activityType, dailyGoalBucket — see
 * branding.types.ts). Writes into the SAME existing content library at
 * workoutMetadata/notifications/notifications David authors through
 * /admin/workout-settings ("מנהל התראות") — not a new/parallel store.
 *
 * Scope THIS wave (per David's "steps only" decision — the real strength
 * daily-goal-completion field, dailyStrengthPct, lives only on the unmerged
 * feat/home-daily-goal-v1 branch and is deferred until it ships):
 *   activityType = 'walking' only
 *   dailyGoalBucket ∈ {start, mid, close} only — hit/over (celebration
 *   copy) is schema-ready but not seeded yet, deliberately small library.
 *
 * 3 personas × 3 buckets. generic gets 2 copy variants per bucket (it's the
 * fallback every persona-less user hits); parent/office_worker get 1 each —
 * "measurable seed, not the full library."
 *
 * Copy uses the new @ tags wired in this wave (@צעדים_שנותרו, @מרחק, @רצף)
 * — resolved server-side by functions/src/services/notification-content.
 * service.ts's personaliseNotificationText(), same tag names the admin
 * panel's live preview resolves via resolveContentTags(). No brainstorm doc
 * was available for this wave's exact wording — treat as a first pass,
 * refine later, same as the original step-goal test copy.
 *
 * Doc ID: the SAME deterministic FNV-1a hash the bulk-uploader
 * (src/app/admin/workout-settings/bulk/page.tsx: fnv1aHash/generateDocId)
 * uses — same content → same ID → safe re-run (merge:true upsert).
 *
 * Supersedes the earlier ad-hoc step-goal test message (bundleId
 * 'steps_evening_generic_01', triggerType='Habit_Maintenance') — that
 * message no longer matches the scheduler's selector (now filters on
 * triggerType='Daily_Goal'), so it's deleted to avoid an orphaned,
 * unreachable doc in the corpus.
 *
 * Usage:
 *   npx tsx scripts/seed-daily-goal-notifications.ts
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

// ─── Messages ─────────────────────────────────────────────────────────────────

interface SeedMessage {
  persona: string;
  dailyGoalBucket: 'start' | 'mid' | 'close';
  bundleId: string;
  text: string;
  psychologicalTrigger: 'Support' | 'Challenge' | 'Reward';
}

const COMMON = {
  triggerType: 'Daily_Goal' as const,
  activityType: 'walking' as const,
  gender: 'both' as const,
  calendarIntegration: false,
};

const MESSAGES: SeedMessage[] = [
  // ── generic — 2 variants per bucket (fallback, highest real traffic) ──
  {
    persona: 'generic', dailyGoalBucket: 'start',
    bundleId: 'daily_goal_walking_generic_start_01',
    text: '@שם, יום חדש — @צעדים_שנותרו צעדים ליעד היום 👟',
    psychologicalTrigger: 'Support',
  },
  {
    persona: 'generic', dailyGoalBucket: 'start',
    bundleId: 'daily_goal_walking_generic_start_02',
    text: 'בוא/י נתחיל את היום נכון — @צעדים_שנותרו צעדים ליעד היומי',
    psychologicalTrigger: 'Challenge',
  },
  {
    persona: 'generic', dailyGoalBucket: 'mid',
    bundleId: 'daily_goal_walking_generic_mid_01',
    text: 'באמצע הדרך! עוד @צעדים_שנותרו צעדים ואת/ה ביעד',
    psychologicalTrigger: 'Support',
  },
  {
    persona: 'generic', dailyGoalBucket: 'mid',
    bundleId: 'daily_goal_walking_generic_mid_02',
    text: 'רצף של @רצף ימים מאחוריך — אל תעצור/י עכשיו, עוד @צעדים_שנותרו צעדים',
    psychologicalTrigger: 'Challenge',
  },
  {
    persona: 'generic', dailyGoalBucket: 'close',
    bundleId: 'daily_goal_walking_generic_close_01',
    text: 'כמעט שם! רק @צעדים_שנותרו צעדים נשארו — סיבוב קצר של @מרחק וזה שלך',
    psychologicalTrigger: 'Reward',
  },
  {
    persona: 'generic', dailyGoalBucket: 'close',
    bundleId: 'daily_goal_walking_generic_close_02',
    text: 'היעד ממש קרוב — @צעדים_שנותרו צעדים בלבד. @מרחק וסגרת את היום 💪',
    psychologicalTrigger: 'Reward',
  },
  // ── parent — 1 variant per bucket ──
  {
    persona: 'parent', dailyGoalBucket: 'start',
    bundleId: 'daily_goal_walking_parent_start_01',
    text: '@שם, לפני שהבית מתמלא רעש — @צעדים_שנותרו צעדים ליעד היום',
    psychologicalTrigger: 'Support',
  },
  {
    persona: 'parent', dailyGoalBucket: 'mid',
    bundleId: 'daily_goal_walking_parent_mid_01',
    text: 'גם עם כל הריצות אחרי הילדים — נשארו רק @צעדים_שנותרו צעדים ליעד',
    psychologicalTrigger: 'Support',
  },
  {
    persona: 'parent', dailyGoalBucket: 'close',
    bundleId: 'daily_goal_walking_parent_close_01',
    text: 'כמעט סיימת את היום — @צעדים_שנותרו צעדים ו-@מרחק סוגרים את זה',
    psychologicalTrigger: 'Reward',
  },
  // ── office_worker — 1 variant per bucket ──
  {
    persona: 'office_worker', dailyGoalBucket: 'start',
    bundleId: 'daily_goal_walking_office_worker_start_01',
    text: 'לפני שיושבים מול המסך כל היום — @צעדים_שנותרו צעדים ליעד',
    psychologicalTrigger: 'Support',
  },
  {
    persona: 'office_worker', dailyGoalBucket: 'mid',
    bundleId: 'daily_goal_walking_office_worker_mid_01',
    text: 'הפסקה קצרה מהמשרד? @צעדים_שנותרו צעדים ואת/ה באמצע הדרך',
    psychologicalTrigger: 'Challenge',
  },
  {
    persona: 'office_worker', dailyGoalBucket: 'close',
    bundleId: 'daily_goal_walking_office_worker_close_01',
    text: 'סיום יום עבודה — @מרחק הליכה סוגרת @צעדים_שנותרו צעדים אחרונים ליעד',
    psychologicalTrigger: 'Reward',
  },
];

// Superseded from the earlier ad-hoc test — no longer reachable by the
// scheduler's selector (triggerType changed from Habit_Maintenance to
// Daily_Goal this wave). Delete so the corpus doesn't carry a dead doc.
const SUPERSEDED_DOC_IDS = [
  'c91f271d', // 11.08.2026 — original static-text test message
  'bfc49eec', // 12.08.2026 — {steps_left}-templated test message, Habit_Maintenance
];

// ─── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  console.log(`📝  Seeding ${MESSAGES.length} daily-goal notification(s)…\n`);

  const writtenDocIds: string[] = [];

  for (const msg of MESSAGES) {
    const docId = generateDocId(msg.text, msg.persona, msg.bundleId, COMMON.gender);
    writtenDocIds.push(docId);
    const ref = db.collection('workoutMetadata').doc('notifications').collection('notifications').doc(docId);
    const existed = (await ref.get()).exists;

    await ref.set(
      {
        triggerType: COMMON.triggerType,
        activityType: COMMON.activityType,
        gender: COMMON.gender,
        calendarIntegration: COMMON.calendarIntegration,
        persona: msg.persona,
        dailyGoalBucket: msg.dailyGoalBucket,
        bundleId: msg.bundleId,
        text: msg.text,
        psychologicalTrigger: msg.psychologicalTrigger,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        ...(existed ? {} : { createdAt: admin.firestore.FieldValue.serverTimestamp() }),
      },
      { merge: true },
    );

    console.log(
      `${existed ? '↻' : '+'} [${msg.persona}/${msg.dailyGoalBucket}] ${msg.bundleId} → ${docId}`,
    );
  }

  console.log('\n🧹  Cleaning up superseded doc(s)…');
  for (const oldId of SUPERSEDED_DOC_IDS) {
    if (writtenDocIds.includes(oldId)) continue; // a new doc happened to hash to an old id — don't delete it
    const oldRef = db.collection('workoutMetadata').doc('notifications').collection('notifications').doc(oldId);
    const oldSnap = await oldRef.get();
    if (oldSnap.exists) {
      await oldRef.delete();
      console.log(`    deleted superseded doc: ${oldId}`);
    } else {
      console.log(`    (already absent, nothing to do: ${oldId})`);
    }
  }

  console.log(`\n✅  Done — ${MESSAGES.length} message(s) seeded.`);
  process.exit(0);
}

run().catch((e) => {
  console.error('❌  Seed failed:', e);
  process.exit(1);
});
