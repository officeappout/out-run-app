/**
 * Onboarding Sync Service
 * Syncs onboarding progress to Firestore for admin visibility and drop-off tracking
 */
import { doc, setDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { signInAnonymously, User } from 'firebase/auth';
import { OnboardingData, OnboardingStepId } from '../types';
import { Analytics } from '@/features/analytics/AnalyticsService';

// Step order mapping for analytics
const STEP_ORDER: Record<OnboardingStepId, number> = {
  'LOCATION': 1,
  'EQUIPMENT': 2,
  'HISTORY': 3,
  'SCHEDULE': 4,
  'SOCIAL_MAP': 5,
  'COMMUNITY': 6,
  'COMPLETED': 7,
  'SUMMARY': 8,
};

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
    
    // Get gender from sessionStorage (set during roadmap page) or from data
    // Priority: sessionStorage > data.personal_gender > data.gender > null
    let userGender: 'male' | 'female' | 'other' | null = null;
    if (typeof window !== 'undefined') {
      userGender = (sessionStorage.getItem('onboarding_personal_gender') || null) as 'male' | 'female' | 'other' | null;
    }
    // Fallback: check if gender is in the data object (from dynamic questionnaire answers)
    if (!userGender && (data as any).personal_gender) {
      userGender = (data as any).personal_gender as 'male' | 'female' | 'other';
    }
    if (!userGender && (data as any).gender) {
      userGender = (data as any).gender as 'male' | 'female' | 'other';
    }
    
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
        gender: userGender || (data.gender as 'male' | 'female' | 'other') || 'other', // Get gender from sessionStorage or data, default to 'other'
        weight: 70,
        isAnonymous: isAnonymous,
        ...(selectedAuthorityId ? { authorityId: selectedAuthorityId } : {}), // Link to authority for B2G billing
      };
      
      // Ensure gender is always set (even if it's 'other')
      if (!updateData.core.gender) {
        updateData.core.gender = 'other';
      }
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
      
      // Ensure createdAt exists (set it if missing for existing users)
      if (!existingData?.createdAt) {
        updateData.createdAt = serverTimestamp();
      }
      
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
        
        // Update gender if we have it from sessionStorage and it's not already set
        if (userGender && !coreUpdate.gender) {
          coreUpdate.gender = userGender;
        } else if ((data as any).gender && !coreUpdate.gender) {
          // Fallback: use gender from data if available
          coreUpdate.gender = (data as any).gender as 'male' | 'female' | 'other';
        } else if (!coreUpdate.gender) {
          // Ensure gender is always set (default to 'other' if missing)
          coreUpdate.gender = 'other';
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
      
      // Preserve progression if it exists, but ensure globalLevel is set
      if (existingData?.progression) {
        updateData.progression = {
          ...existingData.progression,
          // Ensure globalLevel is set (default to 1 if missing)
          globalLevel: existingData.progression.globalLevel || 1,
        };
      } else {
        // If no progression exists, initialize it with level 1
        updateData.progression = {
          globalLevel: 1,
          globalXP: 0,
          coins: 0,
          totalCaloriesBurned: 0,
          hasUnlockedAdvancedStats: false,
          avatarId: 'default',
          unlockedBadges: [],
          domains: {},
          activePrograms: [],
          unlockedBonusExercises: [],
        };
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
    
    // Update gender if we have it and it's not already set (final check)
    if (userGender && updateData.core && !updateData.core.gender) {
      updateData.core.gender = userGender;
    }
    
    // Ensure gender is always set (final safeguard - default to 'other' if still missing)
    if (updateData.core && !updateData.core.gender) {
      updateData.core.gender = 'other';
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

    // Log analytics event with step index
    const stepIndex = STEP_ORDER[step] || 0;
    if (step === 'COMPLETED') {
      // Log completion event
      await Analytics.logOnboardingCompleted(undefined, stepIndex);
    } else {
      // Log step completion event
      await Analytics.logOnboardingStepComplete(step, 0, stepIndex); // Time spent can be calculated if needed
    }

    console.log(`[OnboardingSync] Synced step "${step}" to Firestore for user ${user.uid}`);
    return true;
  } catch (error) {
    console.error('[OnboardingSync] Error syncing to Firestore:', error);
    // Don't throw - onboarding sync failures shouldn't break the flow
    return false;
  }
}
