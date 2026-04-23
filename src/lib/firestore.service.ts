// Firestore service for user data synchronization
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  Timestamp,
  collection,
  query,
  where,
  getDocs
} from 'firebase/firestore';
import { db } from './firebase';
import { auth } from './firebase';
import { UserFullProfile, EquipmentProfile } from '@/types/user-profile';

/**
 * Normalize user equipment profile with default values
 */
function normalizeEquipmentProfile(data: any): EquipmentProfile {
  // Handle both old boolean structure and new string array structure
  if (data.equipment) {
    // New structure: string arrays
    if (Array.isArray(data.equipment.home)) {
      return {
        home: data.equipment.home || [],
        office: data.equipment.office || [],
        outdoor: data.equipment.outdoor || [],
      };
    }
    // Old structure: boolean objects - convert to empty arrays (migration needed)
    if (typeof data.equipment.home === 'object' && !Array.isArray(data.equipment.home)) {
      console.warn(
        `[User Service] User equipment profile uses old boolean structure. ` +
          `Please migrate to new string array structure (gear definition IDs).`
      );
      return {
        home: [],
        office: [],
        outdoor: [],
      };
    }
  }

  // Default: empty arrays
  return {
    home: [],
    office: [],
    outdoor: [],
  };
}

/**
 * Get user document from Firestore
 * If document is missing but user is authenticated, creates a new default user document
 * and restarts their onboarding (instead of logging them out)
 */
export async function getUserFromFirestore(userId: string): Promise<UserFullProfile | null> {
  try {
    const userDocRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userDocRef);

    if (userDoc.exists()) {
      const data = userDoc.data();
      
      // Normalize equipment profile
      const normalizedEquipment = normalizeEquipmentProfile(data);
      
      // Normalize lifestyle + scheduleDays
      const normalizedLifestyle: any = {
        ...(data.lifestyle || {}),
      };
      // If scheduleDays was stored at root (legacy), map it into lifestyle
      if (!normalizedLifestyle.scheduleDays && Array.isArray((data as any).scheduleDays)) {
        normalizedLifestyle.scheduleDays = (data as any).scheduleDays;
      }
      
      // Log info if equipment is missing or empty — skip for MAP_ONLY users
      // who intentionally haven't completed the equipment onboarding step.
      const isMapOnlyPath =
        data.onboardingPath === 'MAP_ONLY' || data.onboardingStatus === 'MAP_ONLY';
      if (
        !isMapOnlyPath &&
        (!data.equipment ||
          (!normalizedEquipment.home.length &&
            !normalizedEquipment.office.length &&
            !normalizedEquipment.outdoor.length))
      ) {
        console.info(
          `[User Service] User ${userId} has missing or empty equipment profile. ` +
            `This may affect Smart Swap functionality. Please update user equipment in the admin panel.`
        );
      }

      // Convert Firestore Timestamp → JS Date for birthDate so Zustand can serialize it
      let birthDate = data.core?.birthDate;
      if (birthDate instanceof Timestamp) {
        birthDate = birthDate.toDate();
      } else if (typeof birthDate === 'object' && birthDate !== null && typeof birthDate.seconds === 'number') {
        birthDate = new Date(birthDate.seconds * 1000);
      }

      const normalizedProfile: UserFullProfile = {
        ...(data as any),
        equipment: normalizedEquipment,
        lifestyle: normalizedLifestyle,
        // --- Access Control defaults ---
        onboardingProgress: data.onboardingProgress ?? 0,
        onboardingPath: data.onboardingPath ?? null,
        core: {
          ...(data.core || {}),
          ...(birthDate ? { birthDate } : {}),
          accessLevel: data.core?.accessLevel ?? 1,
          affiliations: data.core?.affiliations ?? [],
          unlockedProgramIds: data.core?.unlockedProgramIds ?? [],
          isVerified: data.core?.isVerified ?? false,
        },
      };

      return normalizedProfile;
    }

    // Document doesn't exist - check if user is authenticated
    const currentUser = auth.currentUser;
    if (currentUser && currentUser.uid === userId) {
      console.log(`[User Service] User document missing for authenticated user ${userId}. Re-initializing user...`);
      
      // Create a new default user document with onboarding status
      const newUserData: any = {
        id: userId,
        core: {
          name: currentUser.displayName || currentUser.email?.split('@')[0] || 'User',
          email: currentUser.email || undefined,
          photoURL: currentUser.photoURL || undefined,
          initialFitnessTier: 1,
          trackingMode: 'wellness',
          mainGoal: 'healthy_lifestyle',
          gender: 'other',
          weight: 70,
          isApproved: false,
          isSuperAdmin: false,
          role: 'USER',
          // Access Control defaults
          accessLevel: 1,
          affiliations: [],
          unlockedProgramIds: [],
          isVerified: false,
        },
        onboardingProgress: 0,
        onboardingPath: null,
        progression: {
          globalLevel: 1,
          globalXP: 0,
          avatarId: 'default',
          unlockedBadges: [],
          coins: 0,
          totalCaloriesBurned: 0,
          hasUnlockedAdvancedStats: false,
          domains: {},
          activePrograms: [],
          unlockedBonusExercises: [],
        },
        equipment: {
          home: [],
          office: [],
          outdoor: [],
        },
        lifestyle: {
          hasDog: false,
          commute: {
            method: 'walk',
            enableChallenges: false,
          },
        },
        health: {
          injuries: [],
          connectedWatch: 'none',
        },
        running: {
          isUnlocked: false,
          currentGoal: 'couch_to_5k',
          activeProgram: null,
          paceProfile: {
            basePace: 0,
            profileType: 3,
            qualityWorkoutsHistory: [],
            qualityWorkoutCount: 0,
            lastSelfCorrectionDate: null,
          },
        },
        onboardingStatus: 'ONBOARDING',
        onboardingStep: 'LOCATION',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastActive: serverTimestamp(),
      };

      // Save the new user document
      await setDoc(userDocRef, newUserData);
      
      console.log(`[User Service] Created new user document for ${userId} with onboarding status. User will be redirected to onboarding.`);
      
      // Return the new user profile (with normalized equipment)
      return {
        ...newUserData,
        equipment: normalizeEquipmentProfile(newUserData),
        createdAt: new Date(),
        updatedAt: new Date(),
        lastActive: new Date(),
      } as UserFullProfile;
    }

    // Document doesn't exist and user is not authenticated - return null
    return null;
  } catch (error) {
    console.error('Error getting user from Firestore:', error);
    return null;
  }
}

/**
 * Save/Update user document in Firestore
 */
export async function saveUserToFirestore(userId: string, profile: UserFullProfile): Promise<boolean> {
  try {
    const userDocRef = doc(db, 'users', userId);
    
    // Ensure all required fields are present, including authorityId
    const userData: any = {
      ...profile,
      core: {
        ...profile.core,
        authorityId: profile.core?.authorityId ?? undefined,
      },
      updatedAt: serverTimestamp(),
    };
    
    await setDoc(userDocRef, userData, { merge: true });

    return true;
  } catch (error) {
    console.error('Error saving user to Firestore:', error);
    return false;
  }
}

/**
 * Update user progression (coins and calories) via the Guardian Cloud Function.
 *
 * NOTE: As of the Fortress Phase (Apr 2026), direct client writes to
 * `progression.coins` / `progression.totalCaloriesBurned` are blocked by
 * Firestore Security Rules (noGameIntegrityFieldsChanged). All updates
 * MUST go through the `awardWorkoutXP` callable, which performs atomic
 * server-side increments and validates per-call caps.
 *
 * The signature is preserved so existing callers compile, but `coins`
 * and `totalCaloriesBurned` are now interpreted as DELTAS to add (not
 * absolute values to set). Callers that previously read-modify-write
 * absolute totals must be migrated to pass a delta.
 *
 * `userId` is accepted for backwards compatibility but unused — the
 * Guardian derives uid from request.auth.
 */
export async function updateUserProgression(
  _userId: string,
  updates: {
    coins?: number;              // delta to add (>= 0)
    totalCaloriesBurned?: number; // delta to add (>= 0)
  }
): Promise<boolean> {
  const { awardWorkoutXP } = await import('@/lib/awardWorkoutXP');
  const result = await awardWorkoutXP({
    coinsDelta: Math.max(0, Math.floor(updates.coins ?? 0)),
    caloriesDelta: Math.max(0, Math.floor(updates.totalCaloriesBurned ?? 0)),
    source: 'firestore-service:updateUserProgression',
  });
  return result !== null;
}

/**
 * Get user progression from Firestore with retry logic.
 * Returns all fields used by useProgressionStore for full hydration.
 */
export async function getUserProgression(
  userId: string,
  retries: number = 3
): Promise<{
  coins: number;
  totalCaloriesBurned: number;
  globalXP: number;
  globalLevel: number;
  daysActive: number;
  lemurStage: number;
  currentStreak: number;
  lastActiveDate: string;
} | null> {
  for (let attempt = 0; attempt < retries; attempt++) {
  try {
    const userDocRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userDocRef);

    if (userDoc.exists()) {
      const data = userDoc.data();
      // Ensure progression exists before accessing its properties
      const progression = data.progression || {};
      return {
        coins: progression.coins || 0,
        totalCaloriesBurned: progression.totalCaloriesBurned || 0,
        globalXP: progression.globalXP || 0,
        globalLevel: progression.globalLevel || 1,
        daysActive: progression.daysActive || 0,
        lemurStage: progression.lemurStage || 1,
        currentStreak: progression.currentStreak || 0,
        lastActiveDate: progression.lastActiveDate || '',
      };
    }

    return null; // Return null if the user document does not exist
    } catch (error: any) {
      const isNetworkError = 
        error?.code === 'ERR_QUIC_PROTOCOL_ERROR' ||
        error?.code === 'unavailable' ||
        error?.message?.includes('network') ||
        error?.message?.includes('quic') ||
        error?.message?.includes('Failed to fetch');

      if (isNetworkError && attempt < retries - 1) {
        const delay = 1000 * (attempt + 1); // Exponential backoff
        console.warn(`[Firestore] Network error, retrying (${attempt + 1}/${retries}) in ${delay}ms...`, error);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

    console.error('Error getting user progression:', error);
    return null;
  }
  }
  return null;
}

/**
 * Write a single dot-path field to the current user's Firestore document.
 * Uses updateDoc with merge semantics so sibling fields are preserved.
 *
 * Usage:
 *   syncFieldToFirestore('core.authorityId', 'tel_aviv')
 *   syncFieldToFirestore('core.email', 'user@example.com')
 *   syncFieldToFirestore('equipment.home', ['pull_up_bar', 'bands'])
 */
export async function syncFieldToFirestore(
  fieldPath: string,
  value: unknown,
): Promise<boolean> {
  const uid = auth.currentUser?.uid;
  if (!uid) return false;

  try {
    const userRef = doc(db, 'users', uid);
    await updateDoc(userRef, {
      [fieldPath]: value,
      updatedAt: serverTimestamp(),
    });
    return true;
  } catch (error) {
    console.error(`[syncFieldToFirestore] Failed to sync "${fieldPath}":`, error);
    return false;
  }
}

/**
 * Write all location anchor fields in a single updateDoc call.
 * Prevents write-collision errors (INTERNAL ASSERTION FAILED) that occur
 * when three separate syncFieldToFirestore calls race on the same document.
 *
 * Only the fields that are actually provided are written.
 */
export async function syncLocationToFirestore(data: {
  authorityId?: string | null;
  anchorLat?: number | null;
  anchorLng?: number | null;
}): Promise<boolean> {
  const uid = auth.currentUser?.uid;
  if (!uid) return false;

  const fields: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (data.authorityId != null) fields['core.authorityId'] = data.authorityId;
  if (data.anchorLat != null) fields['core.anchorLat'] = data.anchorLat;
  if (data.anchorLng != null) fields['core.anchorLng'] = data.anchorLng;

  if (Object.keys(fields).length === 1) return true; // nothing to write

  try {
    const userRef = doc(db, 'users', uid);
    await updateDoc(userRef, fields);
    return true;
  } catch (error) {
    console.error('[syncLocationToFirestore] Failed to sync location fields:', error);
    return false;
  }
}
