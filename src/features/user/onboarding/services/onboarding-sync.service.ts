/**
 * Onboarding Sync Service
 * Syncs onboarding progress to Firestore for admin visibility and drop-off tracking
 */
import { doc, setDoc, serverTimestamp, getDoc, Timestamp } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { signInAnonymously, User } from 'firebase/auth';
import { OnboardingData, OnboardingStepId } from '../types';
import { Analytics } from '@/features/analytics/AnalyticsService';
import { IS_COIN_SYSTEM_ENABLED } from '@/config/feature-flags';
import { recalculateAncestorMasters } from '@/features/user/progression/services/progression.service';

// Step order mapping for analytics
const STEP_ORDER: Record<OnboardingStepId, number> = {
  'PERSONA': 1,
  'PERSONAL_STATS': 2,
  'LOCATION': 3,
  'EQUIPMENT': 4,
  'SCHEDULE': 5,
  'HEALTH_DECLARATION': 6,
  'ACCOUNT_SECURE': 7,
  'PROCESSING': 8,
  'HISTORY': 9,
  'SOCIAL_MAP': 10,
  'COMMUNITY': 11,
  'COMPLETED': 12,
  'SUMMARY': 13,
};

// Program mapping: mainGoal → default programId
const GOAL_TO_PROGRAM: Record<string, string> = {
  routine: 'full_body',
  aesthetics: 'upper_body',
  fitness: 'full_body',
  performance: 'calisthenics',
  skills: 'upper_body',
  community: 'full_body',
  // Legacy mainGoal values (UserFullProfile.core.mainGoal)
  healthy_lifestyle: 'full_body',
  performance_boost: 'calisthenics',
  weight_loss: 'full_body',
  skill_mastery: 'upper_body',
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
      // COIN_SYSTEM_PAUSED: Re-enable in April
      // Initialize progression, using onboarding coins as starting balance if available
      const initialCoins = IS_COIN_SYSTEM_ENABLED && typeof data.onboardingCoins === 'number' && data.onboardingCoins > 0
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
    // Store new history fields (locations and sports)
    if (data.historyLocations && data.historyLocations.length > 0) {
      updateData.historyLocations = data.historyLocations;
    }
    if (data.historySports && data.historySports.length > 0) {
      updateData.historySports = data.historySports;
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

    // ================================================================
    // BIOMETRICS: Sync weight & birthDate to core (skip height)
    // ================================================================
    if (data.weight && data.weight > 0) {
      updateData.core = {
        ...updateData.core,
        weight: data.weight,
      };
    }
    // Sync birthDate from sessionStorage (set during the onboarding questionnaire)
    if (typeof window !== 'undefined') {
      const storedBirthDate = sessionStorage.getItem('onboarding_personal_birthdate');
      if (storedBirthDate) {
        try {
          const dateObj = new Date(storedBirthDate);
          if (!isNaN(dateObj.getTime())) {
            updateData.core = {
              ...updateData.core,
              birthDate: Timestamp.fromDate(dateObj), // Firestore Timestamp for proper querying
            };
          }
        } catch (e) {
          console.warn('[OnboardingSync] Could not parse birthDate:', storedBirthDate, e);
        }
      }
    }

    // ================================================================
    // LEGAL & COMPLIANCE: Health declaration + Terms of Use
    // ================================================================
    if ((data as any).healthDeclarationAccepted !== undefined) {
      updateData.healthDeclarationAccepted = (data as any).healthDeclarationAccepted;
    }
    if ((data as any).healthTermsAccepted !== undefined) {
      updateData.healthTermsAccepted = (data as any).healthTermsAccepted;
    }
    if ((data as any).healthTimestamp) {
      updateData.healthTimestamp = (data as any).healthTimestamp;
    }
    if ((data as any).termsVersion) {
      updateData.termsVersion = (data as any).termsVersion;
    }
    if ((data as any).healthDeclarationPdfUrl) {
      updateData.healthDeclarationPdfUrl = (data as any).healthDeclarationPdfUrl;
    }

    // ================================================================
    // ACCOUNT SECURITY: Backup & Security authentication method
    // ================================================================
    if ((data as any).accountSecured !== undefined) {
      updateData.accountSecured = (data as any).accountSecured;
    }
    if ((data as any).accountStatus) {
      updateData.accountStatus = (data as any).accountStatus;
    }
    if ((data as any).accountMethod) {
      updateData.accountMethod = (data as any).accountMethod;
    }
    if ((data as any).securedEmail) {
      updateData.core = {
        ...updateData.core,
        email: (data as any).securedEmail,
      };
    }
    if ((data as any).securedPhone) {
      updateData.core = {
        ...updateData.core,
        phone: (data as any).securedPhone,
      };
    }
    // Terms version for account security step
    if ((data as any).termsVersion && step === 'COMPLETED') {
      updateData.termsVersion = (data as any).termsVersion;
      updateData.termsAcceptedAt = (data as any).termsAcceptedAt || serverTimestamp();
    }

    // ================================================================
    // PERSONA & BI: Aggregate onboardingAnswers object
    // ================================================================
    const onboardingAnswers: any = {};
    let hasOnboardingAnswers = false;

    // Persona(s)
    if ((data as any).selectedPersonaIds && (data as any).selectedPersonaIds.length > 0) {
      onboardingAnswers.persona = (data as any).selectedPersonaId || (data as any).selectedPersonaIds[0];
      onboardingAnswers.personas = (data as any).selectedPersonaIds;
      hasOnboardingAnswers = true;
    } else if ((data as any).selectedPersonaId) {
      onboardingAnswers.persona = (data as any).selectedPersonaId;
      onboardingAnswers.personas = [(data as any).selectedPersonaId];
      hasOnboardingAnswers = true;
    }

    // Goals
    if ((data as any).selectedGoalIds && (data as any).selectedGoalIds.length > 0) {
      onboardingAnswers.allGoals = (data as any).selectedGoalIds;
      onboardingAnswers.primaryGoal = (data as any).selectedGoalIds[0];
      onboardingAnswers.primaryGoalLabel = (data as any).selectedGoalLabel || null;
      hasOnboardingAnswers = true;
    } else if ((data as any).selectedGoal) {
      onboardingAnswers.allGoals = [(data as any).selectedGoal];
      onboardingAnswers.primaryGoal = (data as any).selectedGoal;
      onboardingAnswers.primaryGoalLabel = (data as any).selectedGoalLabel || null;
      hasOnboardingAnswers = true;
    }

    // Training days (actual Hebrew day letters)
    if (data.scheduleDays && data.scheduleDays.length > 0) {
      onboardingAnswers.trainingDays = data.scheduleDays;
      hasOnboardingAnswers = true;
    } else if (updateData.lifestyle?.scheduleDays && updateData.lifestyle.scheduleDays.length > 0) {
      onboardingAnswers.trainingDays = updateData.lifestyle.scheduleDays;
      hasOnboardingAnswers = true;
    }

    // Sports preferences (preserving user ranking order — index 0 = top choice)
    if ((data as any).otherSportsTags && (data as any).otherSportsTags.length > 0) {
      onboardingAnswers.sportsPreferences = (data as any).otherSportsTags;
      onboardingAnswers.preferredSports = (data as any).otherSportsTags; // Alias for BI queries
      hasOnboardingAnswers = true;
    } else if ((data as any).historySports && (data as any).historySports.length > 0) {
      onboardingAnswers.sportsPreferences = (data as any).historySports;
      onboardingAnswers.preferredSports = (data as any).historySports;
      hasOnboardingAnswers = true;
    }

    // Preferred training location (e.g. 'gym', 'home', 'park', 'studio')
    if ((data as any).historyLocations && (data as any).historyLocations.length > 0) {
      onboardingAnswers.preferredLocation = (data as any).historyLocations;
      hasOnboardingAnswers = true;
    }

    // Lifestyle tags (combined persona + goal tags)
    if (data.lifestyleTags && data.lifestyleTags.length > 0) {
      onboardingAnswers.lifestyleTags = data.lifestyleTags;
      hasOnboardingAnswers = true;
    }

    // Training frequency & outdoor gym experience
    if ((data as any).trainingHistory) {
      onboardingAnswers.trainingHistory = (data as any).trainingHistory;
      hasOnboardingAnswers = true;
    }
    if ((data as any).outdoorGymExperience) {
      onboardingAnswers.outdoorGymExperience = (data as any).outdoorGymExperience;
      hasOnboardingAnswers = true;
    }

    if (hasOnboardingAnswers) {
      updateData.onboardingAnswers = onboardingAnswers;
    }

    // ================================================================
    // PROGRAM & LEVEL ASSIGNMENT (on COMPLETED)
    // Priority: assignedResults > legacy fields > GOAL_TO_PROGRAM
    // ================================================================
    if (step === 'COMPLETED') {
      // Determine fitness level from Phase 1 tier or training history
      let fitnessLevel: number = updateData.core?.initialFitnessTier || 1;
      
      // Read from sessionStorage if available (Phase 1 fitness_level answer)
      if (typeof window !== 'undefined') {
        const storedFitness = sessionStorage.getItem('onboarding_fitness_level');
        if (storedFitness) {
          const parsed = parseInt(storedFitness, 10);
          if (parsed >= 1 && parsed <= 3) fitnessLevel = parsed;
        }
      }

      updateData.core = {
        ...updateData.core,
        initialFitnessTier: fitnessLevel as 1 | 2 | 3,
      };

      // ✅ IMMEDIATE INIT: Populate domains + tracks (no lazy init)
      // Map fitness tier to initial level: 1→1, 2→3, 3→5
      const domainLevelMap: Record<number, number> = { 1: 1, 2: 3, 3: 5 };
      const initialLevel = domainLevelMap[fitnessLevel] || 1;
      const DOMAIN_MAX_LEVELS: Record<string, number> = {
        upper_body: 22, lower_body: 10, full_body: 15,
        core: 18, flexibility: 12, running: 20,
        handstand: 25, pull_up_pro: 20,
      };

      const initialDomains: Record<string, { currentLevel: number; maxLevel: number; isUnlocked: boolean }> = {};
      for (const [domainId, maxLevel] of Object.entries(DOMAIN_MAX_LEVELS)) {
        initialDomains[domainId] = { currentLevel: initialLevel, maxLevel, isUnlocked: true };
      }

      // ============================================================
      // PRIORITY 1: Dynamic Questionnaire assignedResults
      // These are the most accurate — derived from actual diagnostic quiz
      // ============================================================
      const assignedResults = (data as any).assignedResults as Array<{
        programId: string;
        levelId: string;
        masterProgramSubLevels?: Record<string, number>;
      }> | undefined;

      // Also try sessionStorage as backup (cross-page persistence)
      let effectiveResults = assignedResults;
      if ((!effectiveResults || effectiveResults.length === 0) && typeof window !== 'undefined') {
        try {
          const storedResults = sessionStorage.getItem('onboarding_assigned_results');
          if (storedResults) {
            effectiveResults = JSON.parse(storedResults);
          }
        } catch (e) {
          console.warn('[OnboardingSync] Could not parse stored assignedResults:', e);
        }
      }

      // Filter out invalid entries (undefined programId/levelId)
      if (effectiveResults) {
        effectiveResults = effectiveResults.filter(
          r => r && typeof r.programId === 'string' && r.programId.trim() !== '' &&
               typeof r.levelId === 'string' && r.levelId.trim() !== ''
        );
        if (effectiveResults.length === 0) {
          effectiveResults = undefined;
        }
      }

      if (effectiveResults && effectiveResults.length > 0) {
        // ✅ USE DYNAMIC QUESTIONNAIRE RESULTS (Highest Priority)
        console.log('[OnboardingSync] Using assignedResults from dynamic questionnaire:', effectiveResults);
        
        // Primary result for backwards compatibility
        const primaryResult = effectiveResults[0];
        const primaryProgramId = primaryResult.programId;
        
        // Extract numeric level from levelId (e.g., "level_3" → 3)
        const levelMatch = primaryResult.levelId.match(/(\d+)/);
        const primaryLevel = levelMatch ? parseInt(levelMatch[1], 10) : initialLevel;

        updateData.currentProgramId = primaryProgramId;
        updateData.fitnessLevel = fitnessLevel;

        // Build tracks from ALL assigned results (accumulative — multi-widget support)
        const quizTracks: Record<string, { currentLevel: number; percent: number }> = {};
        const activeProgramEntries: any[] = [];
        
        // Accumulate: keep existing programs, add new ones from quiz
        const existingActivePrograms = updateData.progression?.activePrograms || [];
        const existingProgramIds = new Set(existingActivePrograms.map((p: any) => p.id));

        for (const result of effectiveResults) {
          const rLevelMatch = result.levelId.match(/(\d+)/);
          const rLevel = rLevelMatch ? parseInt(rLevelMatch[1], 10) : initialLevel;
          
          // Set track for the program itself
          quizTracks[result.programId] = { currentLevel: rLevel, percent: 0 };

          // Set tracks for child programs (masterProgramSubLevels)
          if (result.masterProgramSubLevels) {
            for (const [childId, childLevel] of Object.entries(result.masterProgramSubLevels)) {
              quizTracks[childId] = { currentLevel: childLevel, percent: 0 };
            }
          }

          // Add to activePrograms (accumulative — don't overwrite existing)
          if (!existingProgramIds.has(result.programId)) {
            activeProgramEntries.push({
              id: result.programId,
              templateId: result.programId,
              name: result.programId.replace(/_/g, ' '),
              startDate: new Date().toISOString(),
              durationWeeks: 52,
              currentWeek: 1,
              focusDomains: [result.programId] as any,
            });
          }
        }

        // Merge existing tracks with quiz tracks (quiz overrides on conflict)
        const mergedTracks = {
          ...(updateData.progression?.tracks || {}),
          ...quizTracks,
        };

        // Merge activePrograms (keep existing + add new from quiz)
        const mergedActivePrograms = [
          ...existingActivePrograms,
          ...activeProgramEntries,
        ];

        updateData.progression = {
          ...updateData.progression,
          domains: initialDomains,
          tracks: mergedTracks,
          activePrograms: mergedActivePrograms.length > 0 ? mergedActivePrograms : [{
            id: primaryProgramId,
            templateId: primaryProgramId,
            name: primaryProgramId.replace(/_/g, ' '),
            startDate: new Date().toISOString(),
            durationWeeks: 52,
            currentWeek: 1,
            focusDomains: [primaryProgramId] as any,
          }],
        };

        // Store assignedResults on the document for future reference
        // Sanitize entries to ensure no undefined fields reach Firestore
        updateData.assignedResults = effectiveResults.map(r => ({
          programId: r.programId,
          levelId: r.levelId,
          ...(r.masterProgramSubLevels ? { masterProgramSubLevels: r.masterProgramSubLevels } : {}),
        }));

      } else {
        // ============================================================
        // PRIORITY 2 / FALLBACK: GOAL_TO_PROGRAM legacy mapping
        // Used only when no dynamic questionnaire results are available
        // ============================================================
        console.log('[OnboardingSync] No assignedResults found, falling back to GOAL_TO_PROGRAM mapping');
        
        const primaryGoal = (data as any).selectedGoalIds?.[0] || (data as any).selectedGoal || 'full_body';
        const assignedProgramId = GOAL_TO_PROGRAM[primaryGoal] || 'full_body';

        updateData.currentProgramId = assignedProgramId;
        updateData.fitnessLevel = fitnessLevel;

        // Initialize tracks for the assigned program
        const initialTracks: Record<string, { currentLevel: number; percent: number }> = {
          [assignedProgramId]: { currentLevel: initialLevel, percent: 0 },
        };

        // Also set the main active program in progression if not already set
        const existingPrograms = updateData.progression?.activePrograms;
        if (!existingPrograms || existingPrograms.length === 0) {
          updateData.progression = {
            ...updateData.progression,
            domains: initialDomains,
            tracks: initialTracks,
            activePrograms: [{
              id: assignedProgramId,
              templateId: assignedProgramId,
              name: assignedProgramId.replace(/_/g, ' '),
              startDate: new Date().toISOString(),
              durationWeeks: 52,
              currentWeek: 1,
              focusDomains: [assignedProgramId] as any,
            }],
          };
        } else {
          // At minimum, ensure domains and tracks are populated
          updateData.progression = {
            ...updateData.progression,
            domains: updateData.progression?.domains && Object.keys(updateData.progression.domains).length > 0
              ? updateData.progression.domains
              : initialDomains,
            tracks: updateData.progression?.tracks && Object.keys(updateData.progression.tracks).length > 0
              ? updateData.progression.tracks
              : initialTracks,
          };
        }
      }
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

    // ─── Trigger Master Program Recalculation (if tracks exist) ────────────
    if (step === 'COMPLETED' && updateData.progression?.tracks) {
      try {
        const trackKeys = Object.keys(updateData.progression.tracks);
        console.log(`[OnboardingSync] Recalculating master levels for ${trackKeys.length} tracks...`);
        
        for (const childProgramId of trackKeys) {
          await recalculateAncestorMasters(user.uid, childProgramId);
        }
        
        console.log('✅ [OnboardingSync] Master program levels recalculated after onboarding');
      } catch (masterErr) {
        console.warn('[OnboardingSync] Master recalculation failed (non-critical):', masterErr);
        // Non-critical: will recalculate on first workout if this fails
      }
    }

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
