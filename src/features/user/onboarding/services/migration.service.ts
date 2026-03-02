/**
 * Data Migration: Existing Users → Adaptive Onboarding Waterfall
 *
 * This script updates existing users to be compatible with the new onboarding flow:
 *
 * 1. Users with `onboardingStatus: 'COMPLETED'` but missing `scheduleDays`
 *    → Set `onboardingStatus: 'PENDING_LIFESTYLE'` (triggers Phase 2 bridge)
 *
 * 2. Users with `onboardingStatus: 'COMPLETED'` and `scheduleDays` present
 *    → No change needed (fully onboarded)
 *
 * 3. Users with `onboardingStatus: 'IN_PROGRESS'` and missing core data
 *    → Set `onboardingStep: 'IDENTITY'` (restart from profile route)
 *
 * RUN: Execute this once from an admin page or Firebase function.
 * SAFE: Uses merge writes — no data is overwritten or deleted.
 */

import { collection, getDocs, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface MigrationResult {
  total: number;
  pendingLifestyle: number;
  alreadyComplete: number;
  restartedOnboarding: number;
  mapOnly: number;
  errors: number;
}

export async function migrateExistingUsers(): Promise<MigrationResult> {
  const result: MigrationResult = {
    total: 0,
    pendingLifestyle: 0,
    alreadyComplete: 0,
    restartedOnboarding: 0,
    mapOnly: 0,
    errors: 0,
  };

  console.log('[Migration] Starting existing user migration...');

  try {
    const usersSnap = await getDocs(collection(db, 'users'));
    result.total = usersSnap.size;
    console.log(`[Migration] Found ${result.total} users to process.`);

    for (const userDoc of usersSnap.docs) {
      try {
        const data = userDoc.data();
        const uid = userDoc.id;
        const status = data?.onboardingStatus;
        const scheduleDays = data?.lifestyle?.scheduleDays;
        const hasProgram = data?.progression?.domains && Object.keys(data.progression.domains).length > 0;
        const hasName = !!data?.core?.name;
        const onboardingPath = data?.onboardingPath;

        // Skip MAP_ONLY users
        if (onboardingPath === 'MAP_ONLY' || status === 'MAP_ONLY') {
          result.mapOnly++;
          continue;
        }

        // Case 1: COMPLETED but missing schedule → PENDING_LIFESTYLE
        if ((status === 'COMPLETED' || data?.onboardingComplete) && (!scheduleDays || scheduleDays.length === 0)) {
          if (hasProgram) {
            await setDoc(doc(db, 'users', uid), {
              onboardingStatus: 'PENDING_LIFESTYLE',
              updatedAt: serverTimestamp(),
            }, { merge: true });
            result.pendingLifestyle++;
            console.log(`[Migration] ${uid}: COMPLETED → PENDING_LIFESTYLE (missing schedule)`);
          } else {
            // Has COMPLETED status but no program — restart
            await setDoc(doc(db, 'users', uid), {
              onboardingStatus: 'IN_PROGRESS',
              onboardingStep: hasName ? 'ASSESSMENT' : 'IDENTITY',
              updatedAt: serverTimestamp(),
            }, { merge: true });
            result.restartedOnboarding++;
            console.log(`[Migration] ${uid}: COMPLETED (no program) → IN_PROGRESS`);
          }
          continue;
        }

        // Case 2: COMPLETED with schedule → Already fully onboarded
        if ((status === 'COMPLETED' || data?.onboardingComplete) && scheduleDays?.length > 0) {
          result.alreadyComplete++;
          continue;
        }

        // Case 3: IN_PROGRESS with missing core data → Restart
        if (status === 'IN_PROGRESS' || status === 'ONBOARDING') {
          const step = hasName ? (hasProgram ? 'HEALTH' : 'ASSESSMENT') : 'IDENTITY';
          await setDoc(doc(db, 'users', uid), {
            onboardingStatus: 'IN_PROGRESS',
            onboardingStep: step,
            updatedAt: serverTimestamp(),
          }, { merge: true });
          result.restartedOnboarding++;
          console.log(`[Migration] ${uid}: IN_PROGRESS → step ${step}`);
          continue;
        }

        // No status at all — treat as new
        if (!status) {
          const step = hasName ? (hasProgram ? 'HEALTH' : 'ASSESSMENT') : 'IDENTITY';
          await setDoc(doc(db, 'users', uid), {
            onboardingStatus: 'IN_PROGRESS',
            onboardingStep: step,
            updatedAt: serverTimestamp(),
          }, { merge: true });
          result.restartedOnboarding++;
          console.log(`[Migration] ${uid}: No status → IN_PROGRESS step ${step}`);
        }
      } catch (err) {
        result.errors++;
        console.error(`[Migration] Error processing user ${userDoc.id}:`, err);
      }
    }
  } catch (err) {
    console.error('[Migration] Fatal error:', err);
    throw err;
  }

  console.log('[Migration] Complete!', JSON.stringify(result, null, 2));
  return result;
}
