/**
 * scripts/_seed-emulator-persona-users.ts — throwaway, EMULATOR ONLY.
 * Seeds realistic pre-migration test users into the Firestore emulator
 * to rehearse scripts/_migrate-persona-consolidation.ts safely.
 * Refuses to run unless FIRESTORE_EMULATOR_HOST is set.
 */
import * as admin from 'firebase-admin';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error('REFUSING TO RUN: FIRESTORE_EMULATOR_HOST is not set. This script only ever touches the emulator.');
  process.exit(1);
}
admin.initializeApp({ projectId: 'appout-1' });

async function main() {
  const db = admin.firestore();
  const seed = [
    { id: 'seed_reservist_1', personaId: 'reservist', onboardingAnswers: { persona: 'reservist', personas: ['reservist'] }, lifestyle: { lifestyleTags: ['reservist', 'military', 'busy'] }, name: 'Test Reservist One' },
    { id: 'seed_reservist_2', personaId: 'reservist', onboardingAnswers: { persona: 'reservist', personas: ['reservist', 'parent'] }, lifestyle: { lifestyleTags: ['reservist', 'military', 'busy', 'parent'] }, name: 'Test Reservist Two' },
    { id: 'seed_soldier_1', personaId: 'soldier', onboardingAnswers: { persona: 'soldier', personas: ['soldier'] }, lifestyle: { lifestyleTags: ['soldier', 'military', 'active'] }, name: 'Test Soldier One' },
    { id: 'seed_office_worker', personaId: 'office_worker', onboardingAnswers: { persona: 'office_worker' }, lifestyle: { lifestyleTags: ['office_worker'] }, name: 'Test Office Worker (control — must NOT be touched)' },
  ];
  const batch = db.batch();
  for (const u of seed) {
    const { id, ...data } = u;
    batch.set(db.collection('users').doc(id), data);
  }
  await batch.commit();
  console.log(`seeded ${seed.length} test users into emulator.`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
