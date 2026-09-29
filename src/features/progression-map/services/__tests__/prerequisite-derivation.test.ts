/**
 * prerequisite-derivation.test.ts — Progression System v2, Phase 1.
 *
 * Live-Firestore assertions for derivePrerequisites, restricted to this
 * phase's 4 in-scope skills (front-lever, planche, one-arm-pull, HSPU —
 * human-flag and handstand are explicitly out of scope this round). Values
 * are asserted exactly, independently re-derived through the real
 * derivePrerequisites function rather than trusted from Phase 0's earlier
 * audit — they happen to match Phase 0's published numbers
 * (audit-prerequisite-derivation.test.ts) because both read the same real
 * Firestore data through the same buildSkillTree.
 *
 * Gated on live credentials — same pattern as audit-prerequisite-derivation.test.ts:
 * SKIPPED (not failed) when FIREBASE_SERVICE_ACCOUNT_KEY isn't set (true for
 * this recon worktree; run from an environment that has it, e.g. the
 * progression-map-phase0 worktree):
 *
 *   npx vitest run src/features/progression-map/services/__tests__/prerequisite-derivation.test.ts --reporter=verbose
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import { describe, it, expect, beforeAll } from 'vitest';
import * as admin from 'firebase-admin';
import { derivePrerequisites, DOMAIN_PROGRAM_IDS } from '../prerequisite-derivation.service';
import type { Exercise } from '@/features/content/exercises/core/exercise.types';

const hasCredentials = !!process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

function initFb(): admin.firestore.Firestore {
  const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
  }
  return admin.firestore();
}

describe.skipIf(!hasCredentials)('derivePrerequisites — live Firestore, Phase 1 in-scope skills', () => {
  let allExercises: Exercise[] = [];

  beforeAll(async () => {
    const db = initFb();
    const snap = await db.collection('exercises').get();
    allExercises = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as unknown as Exercise);
    console.log(`Loaded ${allExercises.length} exercises.`);
  });

  it('front-lever (mFcuYlNgKXLqWVUFo0zt) → משיכה level 10', () => {
    const result = derivePrerequisites(allExercises, 'mFcuYlNgKXLqWVUFo0zt');
    expect(result).toEqual([{ domainProgramId: DOMAIN_PROGRAM_IDS.pull, minLevel: 10 }]);
  });

  it('planche (pCI5NHXpowu2ySucqDn8) → דחיפה level 10', () => {
    const result = derivePrerequisites(allExercises, 'pCI5NHXpowu2ySucqDn8');
    expect(result).toEqual([{ domainProgramId: DOMAIN_PROGRAM_IDS.push, minLevel: 10 }]);
  });

  it('one-arm pull-up (cC0BOmm6KIqYAyQynEIo) → משיכה level 10', () => {
    const result = derivePrerequisites(allExercises, 'cC0BOmm6KIqYAyQynEIo');
    expect(result).toEqual([{ domainProgramId: DOMAIN_PROGRAM_IDS.pull, minLevel: 10 }]);
  });

  it('HSPU (PAxprHuT7HjqrWU4wl0T) → דחיפה level 12 (tree starts at level 3, not 1)', () => {
    const result = derivePrerequisites(allExercises, 'PAxprHuT7HjqrWU4wl0T');
    expect(result).toEqual([{ domainProgramId: DOMAIN_PROGRAM_IDS.push, minLevel: 12 }]);
  });
});

describe.skipIf(!hasCredentials)('DOMAIN_PROGRAM_IDS.legs sanity check — live Firestore', () => {
  it('OrAmOH3F375dVio5yGdU resolves to a real program (name logged for report, not asserted — see Phase 1 report)', async () => {
    const db = initFb();
    const doc = await db.collection('programs').doc(DOMAIN_PROGRAM_IDS.legs).get();
    console.log(`legs domain id ${DOMAIN_PROGRAM_IDS.legs} -> exists=${doc.exists}, name=${doc.data()?.name}`);
    expect(doc.exists).toBe(true);
  });
});
