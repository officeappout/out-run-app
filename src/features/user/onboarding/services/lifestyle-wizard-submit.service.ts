/**
 * LifestyleWizard's final write to users/{uid} — personas, the lifestyle
 * fields from buildLifestyleWizardFinalWrite (only what was answered in this
 * session) and the completion markers. A merge write: any field the builder
 * leaves out (e.g. lifestyle.scheduleDays for a runner) stays as stored.
 *
 * Takes the Firestore instance so the emulator suite can run the real write.
 */

import { doc, setDoc, serverTimestamp, Timestamp, type Firestore } from 'firebase/firestore';
import type { LifestyleWizardFinalWrite } from '../utils/lifestyle-wizard-final-write';

export async function writeLifestyleWizardCompletion(
  db: Firestore,
  uid: string,
  personaIds: string[],
  lifestyleWrite: LifestyleWizardFinalWrite,
): Promise<void> {
  await setDoc(
    doc(db, 'users', uid),
    {
      // Final/authoritative personas write — overwrites the early write from
      // LifestyleWizard's handlePersonaNext in case the user went back and
      // changed their selection.
      personas: personaIds.map((id) => ({ id, answers: {}, updatedAt: Timestamp.now() })),
      ...lifestyleWrite,
      onboardingStatus: 'COMPLETED',
      onboardingStep: 'COMPLETED',
      // P0-2 (24.09.2026, docs/audit-2026-09/00-MASTER-PLAN.md §13.23): a
      // redundant completion signal on top of onboardingStatus/onboardingStep —
      // page.tsx and gateway/page.tsx's resume-router check
      // `onboardingStatus === 'COMPLETED' || onboardingComplete`.
      onboardingComplete: true,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}
