/**
 * scripts/_migrate-persona-cleanup.ts — throwaway (but writes real data,
 * per the project convention this stays out of the throwaway exemption in
 * spirit — kept anyway since David authorized standing autonomous data
 * cleanup for this environment, confirmed zero real users).
 *
 * Cleans up every users/{uid} doc with a legacy persona field (personaId,
 * onboardingAnswers.persona/.personas, lifestyle.selectedPersonaId,
 * lifestyle.personaAnsweredAt), per the 01.09.2026 clean redefinition
 * (docs/research/military-persona-unified-architecture.md):
 *   - Maps to the new `personas: AnyPersonaEntry[]` where a clean mapping
 *     exists (reservist/soldier/army_combat -> military, senior -> vatikim,
 *     the 7 canonical values pass through unchanged).
 *   - Deletes the legacy fields outright — no alias, no compat layer.
 *   - Values with no mapping (the 6th legacy vocabulary found in live data:
 *     runners/gym_goers/wellness_seekers/mothers/seniors from
 *     demo-seed-sderot.ts's old script version) are simply dropped — no
 *     personas entry written for them, since there's nothing real to
 *     preserve (confirmed test/demo data only, zero real users).
 *
 * SAFE BY DEFAULT: no flags = backup + dry-run plan only, zero writes.
 * --confirm executes. Idempotent: re-running after success finds nothing
 * left to migrate.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: '/Users/calisthenicsltd/Development/appout-1/.env.local' });
import * as admin from 'firebase-admin';

function init() {
  if (admin.apps.length) return;
  const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
}

// Mirrors PERSONA_ALIAS_MAP's identity+legacy entries
// (src/features/user/onboarding/services/persona-alias-map.service.ts) —
// duplicated here deliberately so this script has zero dependency on the
// app's TS module graph (it's a standalone node/tsx script).
const PERSONA_MAP: Record<string, string> = {
  parent: 'parent', student: 'student', pupil: 'pupil', office_worker: 'office_worker',
  military: 'military', vatikim: 'vatikim', pro_athlete: 'pro_athlete',
  senior: 'vatikim', reservist: 'military', soldier: 'military',
  army_combat: 'military', army_job: 'military', active_soldier: 'military',
  high_tech: 'office_worker',
  // No mapping for: athlete, young_pro, generic, mothers, gym_goers,
  // wellness_seekers, runners, seniors (plural, distinct from 'senior') —
  // dropped outright, confirmed no real content/users depend on them.
};

function mapPersonaId(raw: string): string | null {
  return PERSONA_MAP[raw] ?? null;
}

async function backup(db: admin.firestore.Firestore, docs: admin.firestore.QueryDocumentSnapshot[]) {
  const out = docs.map((d) => ({ path: d.ref.path, data: d.data() }));
  const dir = path.join(__dirname, '_backups');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `persona-cleanup-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify(out, null, 2), 'utf-8');
  return file;
}

async function findTargets(db: admin.firestore.Firestore) {
  const seen = new Map<string, admin.firestore.QueryDocumentSnapshot>();
  const add = (snap: admin.firestore.QuerySnapshot) => snap.docs.forEach((d) => seen.set(d.id, d));

  add(await db.collection('users').where('personaId', '>', '').get());
  add(await db.collection('users').where('onboardingAnswers.persona', '>', '').get());
  add(await db.collection('users').where('lifestyle.selectedPersonaId', '>', '').get());
  add(await db.collection('users').where('lifestyle.personaAnsweredAt', '>', '').get());
  // onboardingAnswers.personas / lifestyle.lifestyleTags are arrays — can't
  // range-query; fetch all users with ANY onboardingAnswers or lifestyle
  // field set and filter client-side. Given the confirmed small population
  // (604 users total, ~92 with any persona field per the research doc),
  // a full collection scan is cheap and safe here.
  const all = await db.collection('users').get();
  all.docs.forEach((d) => {
    const data = d.data() as any;
    const hasLegacy =
      !!data.personaId ||
      !!data.onboardingAnswers?.persona ||
      (Array.isArray(data.onboardingAnswers?.personas) && data.onboardingAnswers.personas.length > 0) ||
      !!data.lifestyle?.selectedPersonaId ||
      !!data.lifestyle?.personaAnsweredAt;
    if (hasLegacy) seen.set(d.id, d);
  });

  return Array.from(seen.values());
}

function planFor(data: any): { newPersonas: { id: string; answers: {}; updatedAt: admin.firestore.Timestamp }[]; deletes: string[] } {
  const deletes = ['personaId', 'onboardingAnswers.persona', 'onboardingAnswers.personas', 'lifestyle.selectedPersonaId', 'lifestyle.personaAnsweredAt'];
  const rawCandidates: string[] = [];
  if (typeof data.personaId === 'string') rawCandidates.push(data.personaId);
  if (typeof data.onboardingAnswers?.persona === 'string') rawCandidates.push(data.onboardingAnswers.persona);
  if (Array.isArray(data.onboardingAnswers?.personas)) rawCandidates.push(...data.onboardingAnswers.personas);
  if (typeof data.lifestyle?.selectedPersonaId === 'string') rawCandidates.push(data.lifestyle.selectedPersonaId);

  const mapped = new Set<string>();
  for (const raw of rawCandidates) {
    const m = mapPersonaId(raw);
    if (m) mapped.add(m);
  }

  const newPersonas = Array.from(mapped).map((id) => ({
    id,
    answers: {},
    updatedAt: admin.firestore.Timestamp.now(),
  }));

  return { newPersonas, deletes };
}

async function main() {
  init();
  const db = admin.firestore();
  const confirm = process.argv.includes('--confirm');

  const targets = await findTargets(db);
  console.log(`found ${targets.length} user(s) with a legacy persona field`);

  if (targets.length === 0) {
    console.log('Already clean — nothing to do.');
    process.exit(0);
  }

  const backupFile = await backup(db, targets);
  console.log(`\n✅ backup written: ${backupFile}`);

  console.log('\n=== MIGRATION PLAN (dry-run unless --confirm) ===');
  let mappedCount = 0;
  let droppedCount = 0;
  for (const doc of targets) {
    const { newPersonas } = planFor(doc.data());
    if (newPersonas.length > 0) mappedCount++;
    else droppedCount++;
    console.log(`  ${doc.id}: -> personas=${JSON.stringify(newPersonas.map((p) => p.id))}, delete legacy fields`);
  }
  console.log(`\n${mappedCount} user(s) get a mapped personas[] entry, ${droppedCount} user(s) just have legacy fields dropped (no mapping).`);

  if (!confirm) {
    console.log('\nDRY RUN ONLY — no writes performed. Re-run with --confirm to execute.');
    process.exit(0);
  }

  console.log('\n--confirm passed — executing migration now.');
  const BATCH_SIZE = 400;
  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const chunk = targets.slice(i, i + BATCH_SIZE);
    for (const doc of chunk) {
      const { newPersonas, deletes } = planFor(doc.data());
      const update: Record<string, any> = {};
      if (newPersonas.length > 0) update.personas = newPersonas;
      for (const field of deletes) update[field] = admin.firestore.FieldValue.delete();
      batch.update(doc.ref, update);
    }
    await batch.commit();
    console.log(`  committed batch ${i / BATCH_SIZE + 1} (${chunk.length} docs)`);
  }
  console.log('\n✅ migration committed.');

  // Sanity check: re-scan for any remaining legacy field.
  const remaining = await findTargets(db);
  console.log(`\nsanity check: ${remaining.length} user(s) still have a legacy field (expect 0).`);
  if (remaining.length > 0) {
    console.error('❌ SANITY CHECK FAILED — some users still have legacy fields:', remaining.map((d) => d.id));
  }

  process.exit(0);
}
main().catch((e) => {
  console.error('FAILED:', e?.message || e);
  process.exit(1);
});
