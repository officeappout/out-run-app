/**
 * scripts/grant-ai-entitlement.ts — give ONE user access to "קלי AI" (the AI coach chat)
 * while aiCoachFreeForAll is off. DRY RUN by default.
 *
 * Writes (only with --write):
 *   entitlements/{uid} = { aiCoach: { active: true, source: 'free_launch' } }   (merge)
 *   app_config/ai      = DEFAULT_AI_CONFIG, ONLY when the document does not exist yet
 *                        (an existing document is never touched; missing keys already
 *                        fall back to the same defaults at runtime)
 *
 * Never writes feature flags. Flip them in the admin panel (system settings):
 *   ai_coach_enabled = ON (ai_coach_free_for_all stays OFF, its default; turn it ON only
 *   to open AI to every adult)
 * This script prints their current values so you can check.
 *
 * Usage:
 *   npx tsx scripts/grant-ai-entitlement.ts --uid=<uid>            # dry run
 *   npx tsx scripts/grant-ai-entitlement.ts --uid=<uid> --write    # commit
 *   npx tsx scripts/grant-ai-entitlement.ts --uid=<uid> --revoke --write
 *
 * Needs FIREBASE_SERVICE_ACCOUNT_KEY (same as the other admin scripts).
 */
import * as admin from 'firebase-admin';
import { DEFAULT_AI_CONFIG } from '../src/lib/ai/ai-config';

const args = process.argv.slice(2);
const isWrite = args.includes('--write');
const isRevoke = args.includes('--revoke');
const uid = args.find((a) => a.startsWith('--uid='))?.slice('--uid='.length).trim() ?? '';

if (!uid || !/^[A-Za-z0-9_-]{6,128}$/.test(uid)) {
  console.error('Usage: npx tsx scripts/grant-ai-entitlement.ts --uid=<uid> [--write] [--revoke]');
  process.exit(1);
}

const key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? '');
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(key as admin.ServiceAccount) });
}
const db = admin.firestore();

async function run() {
  console.log(isWrite ? 'WRITE mode' : 'DRY RUN (no writes). Pass --write to commit.');

  const [userSnap, entSnap, flagsSnap, aiCfgSnap] = await Promise.all([
    db.doc(`users/${uid}`).get(),
    db.doc(`entitlements/${uid}`).get(),
    db.doc('system_config/feature_flags').get(),
    db.doc('app_config/ai').get(),
  ]);

  if (!userSnap.exists) {
    console.error(`users/${uid} does not exist. Nothing to do.`);
    process.exit(1);
  }
  const core = userSnap.data()?.core ?? {};
  console.log(`\nuser:  ${uid}  ageGroup=${core.ageGroup ?? '(missing)'}`);
  if (core.ageGroup !== 'adult') console.warn('  ⚠ core.ageGroup is not "adult": the server will refuse AI for this user.');

  const flags = flagsSnap.data() ?? {};
  console.log(`flags: ai_coach_enabled=${flags.ai_coach_enabled ?? '(missing → false)'}  ai_coach_free_for_all=${flags.ai_coach_free_for_all ?? '(missing → false)'}`);
  if (flags.ai_coach_enabled !== true) console.log('  → turn ai_coach_enabled ON in the admin panel.');
  if (flags.ai_coach_free_for_all === true) console.log('  → ai_coach_free_for_all is ON: EVERY adult gets AI. Turn it OFF to keep it to entitled users.');

  console.log(`entitlements/${uid} now: ${JSON.stringify(entSnap.data() ?? null)}`);
  const next = { aiCoach: { active: !isRevoke, source: 'free_launch' as const } };
  console.log(`entitlements/${uid} →   ${JSON.stringify(next)}`);

  console.log(`app_config/ai: ${aiCfgSnap.exists ? JSON.stringify(aiCfgSnap.data()) : `(missing → would create ${JSON.stringify(DEFAULT_AI_CONFIG)})`}`);

  if (!isWrite) {
    console.log('\nDry run complete. Nothing was written.');
    return;
  }
  await db.doc(`entitlements/${uid}`).set(next, { merge: true });
  console.log(`✓ wrote entitlements/${uid}`);
  if (!aiCfgSnap.exists) {
    await db.doc('app_config/ai').create({ ...DEFAULT_AI_CONFIG });
    console.log('✓ created app_config/ai with defaults');
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
