// Firestore service for user data synchronization
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
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
      
      // Log warning if equipment is missing or empty
      if (!data.equipment || (!normalizedEquipment.home.length && !normalizedEquipment.office.length && !normalizedEquipment.outdoor.length)) {
        console.warn(
          `[User Service] User ${userId} has missing or empty equipment profile. ` +
            `This may affect Smart Swap functionality. Please update user equipment in the admin panel.`
        );
      }

      const normalizedProfile: UserFullProfile = {
        ...(data as any),
        equipment: normalizedEquipment,
        lifestyle: normalizedLifestyle,
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
        },
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
          weeklyMileageGoal: 0,
          runFrequency: 1,
          activeProgram: null,
          paceProfile: {
            easyPace: 0,
            thresholdPace: 0,
            vo2MaxPace: 0,
            qualityWorkoutsHistory: [],
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
 * Update user progression (coins and calories) in Firestore
 */
export async function updateUserProgression(
  userId: string,
  updates: {
    coins?: number;
    totalCaloriesBurned?: number;
  }
): Promise<boolean> {
  try {
    const userDocRef = doc(db, 'users', userId);
    await updateDoc(userDocRef, {
      'progression.coins': updates.coins,
      'progression.totalCaloriesBurned': updates.totalCaloriesBurned,
      updatedAt: serverTimestamp(),
    });

    return true;
  } catch (error) {
    console.error('Error updating user progression:', error);
    return false;
  }
}

/**
 * Get user progression (coins) from Firestore with retry logic
 */
export async function getUserProgression(
  userId: string, 
  retries: number = 3
): Promise<{ coins: number; totalCaloriesBurned: number } | null> {
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
