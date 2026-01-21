/**
 * Onboarding Sync Service
 * Syncs onboarding progress to Firestore for admin visibility and drop-off tracking
 */
import { doc, setDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { signInAnonymously, User } from 'firebase/auth';
import { OnboardingData, OnboardingStepId } from '../types';
import { Analytics } from '@/features/analytics/AnalyticsService';

const USERS_COLLECTION = 'users';

/**
 * Ensure user is authenticated (anonymous if needed)
 */
async function ensureAuthenticated(): Promise<User | null> {
  let user = auth.currentUser;
  
  // If not authenticated, sign in anonymously
  if (!user) {
    try {
      const userCredential = await signInAnonymously(auth);
      user = userCredential.user;
      console.log('[OnboardingSync] Anonymous user created:', user.uid);
    } catch (error) {
      console.error('[OnboardingSync] Error signing in anonymously:', error);
      return null;
    }
  }
  
  return user;
}

/**
 * Sync onboarding progress to Firestore
 */
export async function syncOnboardingToFirestore(
  step: OnboardingStepId,
  data: Partial<OnboardingData>
): Promise<boolean> {
  try {
    // Ensure user is authenticated (anonymous if needed)
    const user = await ensureAuthenticated();
    if (!user) {
      console.warn('[OnboardingSync] Cannot sync: user not authenticated');
      return false;
    }

    const userDocRef = doc(db, USERS_COLLECTION, user.uid);
    
    // Check if document exists to determine if we should merge or create
    const userDoc = await getDoc(userDocRef);
    const exists = userDoc.exists();
    
    // Prepare user data structure
    const isAnonymous = user.isAnonymous;
    
    // Get name from sessionStorage (set during Phase 1 onboarding)
    const userName = typeof window !== 'undefined' 
      ? sessionStorage.getItem('onboarding_personal_name') 
      : null;
    
    const updateData: any = {
      id: user.uid,
      lastActive: serverTimestamp(),
      onboardingStep: step,
      onboardingStatus: step === 'COMPLETED' ? 'COMPLETED' : 'ONBOARDING',
      updatedAt: serverTimestamp(),
    };

    // If this is a new user (first time syncing), create initial structure
    if (!exists) {
      // Get authority ID from sessionStorage if set during city selection
      const selectedAuthorityId = typeof window !== 'undefined' 
        ? sessionStorage.getItem('selected_authority_id') 
        : null;
      
      updateData.core = {
        name: userName || data.city || 'User', // Use name from sessionStorage, or city, or fallback
        ...(user.email ? { email: user.email } : {}), // Only include email if it exists (not undefined)
        role: 'USER', // Regular app user role
        isApproved: false, // Regular users don't need admin approval
        requiresApproval: false, // Regular app users don't require approval
        isSuperAdmin: false,
        initialFitnessTier: 1,
        trackingMode: 'wellness',
        mainGoal: 'healthy_lifestyle',
        ...(data.pastActivityLevel ? { gender: 'other' } : {}), // Only include gender if we have data
        weight: 70,
        isAnonymous: isAnonymous,
        ...(selectedAuthorityId ? { authorityId: selectedAuthorityId } : {}), // Link to authority for B2G billing
      };
      // Initialize progression, using onboarding coins as starting balance if available
      const initialCoins = typeof data.onboardingCoins === 'number' && data.onboardingCoins > 0
        ? data.onboardingCoins
        : 0;
      updateData.progression = {
        globalLevel: 1,
        globalXP: 0,
        coins: initialCoins,
        totalCaloriesBurned: 0,
        hasUnlockedAdvancedStats: false,
        avatarId: 'default',
        unlockedBadges: [],
        domains: {},
        activePrograms: [],
        unlockedBonusExercises: [],
      };
      updateData.equipment = {
        home: [],
        office: [],
        outdoor: [],
      };
      updateData.lifestyle = {
        hasDog: false,
        commute: { method: 'walk', enableChallenges: false },
        scheduleDays: [], // Will be populated from onboarding data
        trainingTime: undefined,
      };
      updateData.health = { injuries: [], connectedWatch: 'none' };
      updateData.running = {
        weeklyMileageGoal: 0,
        runFrequency: 1,
        activeProgram: null,
        paceProfile: { easyPace: 0, thresholdPace: 0, vo2MaxPace: 0, qualityWorkoutsHistory: [] },
      };
      updateData.createdAt = serverTimestamp();
    } else {
      // Update existing document - merge with existing data
      const existingData = userDoc.data();
      
      // Preserve core structure if it exists
      if (existingData?.core) {
        const coreUpdate: any = {
          ...existingData.core,
        };
        
        // Ensure role is set for existing users (if not set, default to 'USER')
        if (!coreUpdate.role) {
          coreUpdate.role = 'USER';
        }
        
        // Ensure requiresApproval is set (default to false for regular users)
        if (coreUpdate.requiresApproval === undefined) {
          coreUpdate.requiresApproval = false;
        }
        
        // Update name if we have it from onboarding
        if (userName && (!existingData.core.name || existingData.core.name === 'User')) {
          coreUpdate.name = userName;
        }
        
        // Update authority ID from sessionStorage if set during city selection (for B2G billing)
        const selectedAuthorityId = typeof window !== 'undefined' 
          ? sessionStorage.getItem('selected_authority_id') 
          : null;
        if (selectedAuthorityId) {
          coreUpdate.authorityId = selectedAuthorityId;
        }
        
        // Sanitize undefined values - remove them
        Object.keys(coreUpdate).forEach(key => {
          if (coreUpdate[key] === undefined) {
            delete coreUpdate[key];
          }
        });
        
        updateData.core = coreUpdate;
      }
      
      // Preserve progression if it exists
      if (existingData?.progression) {
        updateData.progression = existingData.progression;
      }
      
      // Preserve other structures
      if (existingData?.equipment) {
        updateData.equipment = existingData.equipment;
      }
      if (existingData?.lifestyle) {
        updateData.lifestyle = existingData.lifestyle;
      }
      if (existingData?.health) {
        updateData.health = existingData.health;
      }
      if (existingData?.running) {
        updateData.running = existingData.running;
      }
    }

    // Update with onboarding data
    if (data.equipmentList && data.equipmentList.length > 0) {
      updateData.equipment = {
        ...updateData.equipment,
        home: data.equipmentList || [],
      };
    }

    if (data.hasGym !== undefined) {
      // Store gym access preference
      updateData.core = {
        ...updateData.core,
        hasGymAccess: data.hasGym,
      };
    }

    // Store historyFrequency and historyTypes (critical for impact reports)
    if (data.historyFrequency !== undefined) {
      updateData.historyFrequency = data.historyFrequency;
    }
    if (data.historyTypes && data.historyTypes.length > 0) {
      updateData.historyTypes = data.historyTypes;
    }

    // Store city name (for location display)
    if (data.city) {
      updateData.city = data.city;
    }

    // Update schedule days and training time
    if (data.trainingDays !== undefined) {
      const dayMap = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];
      // Use actual selected days if available, otherwise fall back to first N days
      let scheduleDays: string[];
      if (data.scheduleDays && Array.isArray(data.scheduleDays) && data.scheduleDays.length > 0) {
        // Use the actual selected days from ScheduleStep
        scheduleDays = data.scheduleDays;
      } else if (data.scheduleDayIndices && Array.isArray(data.scheduleDayIndices)) {
        // Convert indices to Hebrew day letters
        scheduleDays = data.scheduleDayIndices.map((index: number) => dayMap[index]).sort();
      } else {
        // Fallback: use first N days (legacy behavior)
        scheduleDays = Array.from({ length: Math.min(data.trainingDays, 7) }, (_, i) => dayMap[i]);
      }
      updateData.lifestyle = {
        ...updateData.lifestyle,
        scheduleDays,
      };
    }
    if (data.trainingTime) {
      updateData.lifestyle = {
        ...updateData.lifestyle,
        trainingTime: data.trainingTime,
      };
    }
    
    // Update name if we have it from sessionStorage
    if (userName && updateData.core) {
      updateData.core.name = userName;
    }
    
    // Sanitize all undefined values before saving to Firestore
    // Firestore doesn't accept undefined - we need to either omit or use null
    const sanitizeObject = (obj: any): any => {
      if (obj === null || obj === undefined) {
        return null;
      }
      if (Array.isArray(obj)) {
        return obj.map(sanitizeObject);
      }
      if (typeof obj === 'object') {
        const sanitized: any = {};
        Object.keys(obj).forEach(key => {
          if (obj[key] !== undefined) {
            sanitized[key] = sanitizeObject(obj[key]);
          }
        });
        return sanitized;
      }
      return obj;
    };
    
    const sanitizedUpdateData = sanitizeObject(updateData);

    // Save to Firestore (merge with existing data)
    // Use sanitized data to ensure no undefined values
    await setDoc(userDocRef, sanitizedUpdateData, { merge: true });

    // Log analytics event
    await Analytics.logOnboardingStepComplete(step, 0); // Time spent can be calculated if needed

    console.log(`[OnboardingSync] Synced step "${step}" to Firestore for user ${user.uid}`);
    return true;
  } catch (error) {
    console.error('[OnboardingSync] Error syncing to Firestore:', error);
    // Don't throw - onboarding sync failures shouldn't break the flow
    return false;
  }
}
