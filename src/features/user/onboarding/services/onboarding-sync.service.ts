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
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { recalculateAncestorMasters } from '@/features/user/progression/services/progression.service';
import { derivePrimaryTrack, trackToDashboardMode } from './track-mapper.service';
import { isRunningBranchCompleted, bridgeRunningOnboarding } from './running-onboarding-bridge.service';
import { loadAssessmentContext } from './branching-logic.service';
import { generatePlan } from '@/features/workout-engine/core/services/running-engine.service';
import {
  getPaceMapConfig,
  getRunWorkoutTemplates,
} from '@/features/workout-engine/core/services/running-admin.service';
import { DEFAULT_PACE_MAP_CONFIG } from '@/features/workout-engine/core/config/pace-map-config';
import type { PaceProfile, WorkoutCategory } from '@/features/workout-engine/core/types/running.types';
import {
  getProgramPathFromStorage,
  getMuscleFocusFromStorage,
  getSkillFocusFromStorage,
  deriveActiveProgramFromMuscleFocus,
  deriveActiveProgramFromSkillFocus,
  getFocusDomainsForMuscleFocus,
} from './assessment-path-config.service';
import { getAccessCodeResult, clearAccessCodeResult } from './access-code.service';
import { getProgramByTemplateId } from '@/features/content/programs';
import { buildAttributionPayload } from '@/lib/marketingAttribution';
import { triggerKellyWelcomeBot } from '@/features/social/services/kelly-welcome-bot.service';
import { updateUserAuthority } from '@/lib/firestore.service';

// ── Canonical program slug allow-list ──────────────────────────────
//
// These slugs are domain-known to be valid program identifiers across the
// entire system (GOAL_TO_PROGRAM, MASTER_PROGRAM_SLUG_TO_ID, SKILL_MAX_LEVELS,
// tracking matrix, visual content resolver, etc.).  They are used as a
// zero-read fast-path inside isValidProgramTemplateId so that:
//   a) The post-onboarding Firestore write is never blocked by a failed
//      getProgramByTemplateId() lookup for canonical skill slugs that
//      happen to store their Firestore doc under a hash ID (not a slug).
//   b) We save unnecessary Firestore reads for values we already know are valid.
//
// Extend this set whenever a new canonical program category is added to the app.
const CANONICAL_PROGRAM_SLUGS = new Set<string>([
  // Master programs
  'full_body', 'upper_body', 'calisthenics_upper', 'muscle_up',
  // Primary movement categories
  'push', 'pull', 'legs', 'core', 'lower_body',
  // Calisthenics skill programs
  'front_lever', 'planche', 'handstand', 'hspu', 'one_arm_pullup',
]);

// ─────────────────────────────────────────────────────────────────────────────
// Physiological Skill → Foundation Domain Mapping ("David's Matrix")
//
// Root scale relationship (from master training spreadsheets):
//   Foundational Upper Body Track Level = Assessed Skill Level + SKILL_TO_FOUNDATION_OFFSET
//
// Examples (with offset = 9):
//   Planche L7  → Push  L16   (7  + 9 = 16)
//   Front Lever L9 → Pull L18  (9  + 9 = 18)
//
// Directionality is strict and unidirectional — this mapping ONLY fires for
// Path C (skill-only) users who have not undergone a separate foundational
// push/pull assessment.  For those users, legs and core tracks are intentionally
// left absent (no ghost data, no default fallback).
// ─────────────────────────────────────────────────────────────────────────────

/** Offset added to a skill level to derive the paired foundational domain level. */
const SKILL_TO_FOUNDATION_OFFSET = 9;

/**
 * Maps a canonical skill program slug to the foundational movement domain
 * whose track level should be inferred from the assessed skill level.
 *
 * Push-family skills → 'push'
 * Pull-family skills → 'pull'
 *
 * Skills absent from this map (e.g. 'human_flag') have no direct foundational
 * pairing and leave both push and pull tracks unwritten — by design.
 */
const SKILL_TO_FOUNDATION_DOMAIN: Readonly<Record<string, 'push' | 'pull'>> = {
  planche:          'push',
  handstand:        'push',
  handstand_pushup: 'push',
  hspu:             'push',
  front_lever:      'pull',
  back_lever:       'pull',
  muscle_up:        'pull',
  one_arm_pullup:   'pull',
};

/**
 * Resolve a programId against the `programs` Firestore collection BEFORE
 * we persist it into `progression.activePrograms[].templateId`. Any value
 * that doesn't resolve (corrupt slug like the legendary single-letter
 * "פ" that bricked WorkoutTrio, hand-edited or stale Firestore data,
 * etc.) is rejected so we don't propagate the corruption forward.
 *
 * Returns:
 *   - `true`  → templateId is a known canonical slug OR resolved to a real
 *               Program document in Firestore
 *   - `false` → templateId is empty / non-string / unresolvable / errored
 *               (caller should skip the write and log loudly)
 *
 * Soft-fails on errors (returns `false` after logging) rather than
 * throwing — the caller is in the middle of a multi-step onboarding
 * write and we don't want a single bad id to abort the entire sync.
 */
async function isValidProgramTemplateId(templateId: unknown): Promise<boolean> {
  if (typeof templateId !== 'string' || templateId.trim() === '') {
    return false;
  }
  // Cheap shape gate before we spend a Firestore read: real program
  // template ids are slugs (lowercase ASCII / underscores), so a single
  // Hebrew character or any non-ASCII junk can be rejected without
  // hitting the network. This is what would have caught the "פ" case
  // immediately, and it's also what protects us from rate-limited
  // Firestore reads when a malformed value gets retried in a loop.
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(templateId)) {
    return false;
  }
  // Fast-path: canonical slugs are always valid — no Firestore read needed.
  // Skill programs (front_lever, planche, …) store their Firestore documents
  // under auto-generated hash IDs, so getProgramByTemplateId() can only find
  // them if the program's movementPattern or slug fields are set correctly in
  // the DB. The allow-list is the zero-latency safety net for the sync write.
  if (CANONICAL_PROGRAM_SLUGS.has(templateId)) {
    return true;
  }
  try {
    const program = await getProgramByTemplateId(templateId);
    return program !== null;
  } catch (err) {
    console.warn(
      '[OnboardingSync] programId validation threw — treating as invalid:',
      templateId, err,
    );
    return false;
  }
}

// Step order mapping for analytics
const STEP_ORDER: Record<OnboardingStepId, number> = {
  'ACCESS_CODE': 0,
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
  performance: 'calisthenics_upper',
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

    // Immediately correct profile.id in the Zustand store to match Firebase UID.
    // This closes the race window where profile.id is the stale local ID.
    const storeProfile = useUserStore.getState().profile;
    if (storeProfile && storeProfile.id !== user.uid) {
      console.log(`[OnboardingSync] Correcting profile.id: "${storeProfile.id}" → "${user.uid}"`);
      useUserStore.setState({ profile: { ...storeProfile, id: user.uid } });
    }

    const userDocRef = doc(db, USERS_COLLECTION, user.uid);

    // Check if document exists to determine if we should merge or create
    const userDoc = await getDoc(userDocRef);
    const exists = userDoc.exists();

    // ── [DIAG] Who created the doc + what's in it? ──────────────────────────
    // Answers two questions:
    //   1. Is this CREATE or UPDATE? (did session-token/confirm run first?)
    //   2. Does the existing doc have progression.globalLevel already seeded?
    //      If not, the shell doc was created by old code or a route that didn't
    //      include the progression seed — that is the root cause of the
    //      noGameIntegrityFieldsChanged PERMISSION-DENIED.
    const existingRaw = userDoc.data() ?? {};
    console.log('[OnboardingSync][DIAG] doc snapshot', {
      uid: user.uid,
      step,
      mode: exists ? 'UPDATE' : 'CREATE',
      hasCore: 'core' in existingRaw,
      coreRole: existingRaw.core?.role ?? '(absent)',
      hasProgression: 'progression' in existingRaw,
      progressionLevel: existingRaw.progression?.globalLevel ?? '(absent)',
      progressionXP: existingRaw.progression?.globalXP ?? '(absent)',
      progressionCoins: existingRaw.progression?.coins ?? '(absent)',
      hasSocial: 'social' in existingRaw,
      socialGroupIds: existingRaw.social?.groupIds ?? '(absent)',
      tenantId: existingRaw.core?.tenantId ?? '(absent)',
      authorityId: existingRaw.core?.authorityId ?? '(absent)',
    });
    
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

    // ── Growth Hub Phase 3 — Marketing Attribution flush ──────────────
    // Run exactly once per user at the COMPLETED write gate. We do this
    // here (not on the initial create) so that:
    //   • The attribution document is written alongside the canonical
    //     "user has activated" signal, keeping growth analytics in sync
    //     with the funnel completion event.
    //   • Users who abandon mid-onboarding are not counted in CAC
    //     calculations — we only attribute spend to converted users.
    //
    // `buildAttributionPayload()` returns a fully-formed object even
    // when sessionStorage is empty (organic fallback), so the write
    // never throws and the `marketingAttribution` field is always
    // well-shaped. `onboardingCompletedAt` is a server timestamp so the
    // funnel-activation-velocity report can compute (completedAt -
    // createdAt) reliably.
    if (step === 'COMPLETED') {
      try {
        updateData.marketingAttribution = buildAttributionPayload();
        updateData.onboardingCompletedAt = serverTimestamp();
      } catch (attrError) {
        // Never let attribution capture block onboarding completion —
        // a missing/corrupt sessionStorage entry is a non-fatal degraded
        // state, not a reason to fail the user's account activation.
        console.warn('[OnboardingSync] Marketing attribution flush failed:', attrError);
      }
    }

    // Collects authorityId (+ neighborhoodId, when they change together) to
    // write in ONE atomic Admin-SDK call after the main setDoc.
    // core.authorityId is locked by noTenantFieldsChanged() in firestore.rules —
    // it must go through /api/user/update-authority (Admin SDK) rather than
    // being embedded in the main client write payload. neighborhoodId itself
    // isn't locked, but a city+neighborhood pick is one logical user action:
    // bundling both into the same Admin call (rather than neighborhoodId
    // going into this client setDoc while authorityId goes through a
    // separate, independently-racing call) is what makes the pair atomic.
    // Fixes a real bug where the two landed out of order and left
    // core.authorityId / core.neighborhoodId pointing at unrelated cities.
    let authorityIdToSync: string | null = null;
    let neighborhoodIdToSync: string | null | undefined = undefined; // undefined = leave untouched

    // If this is a new user (first time syncing), create initial structure
    if (!exists) {
      // Get authority ID from sessionStorage if set during city selection
      const selectedAuthorityId = typeof window !== 'undefined'
        ? sessionStorage.getItem('selected_authority_id')
        : null;
      const selectedNeighborhoodId = typeof window !== 'undefined'
        ? sessionStorage.getItem('selected_neighborhood_id')
        : null;

      if (selectedAuthorityId) {
        // City is changing this cycle — route neighborhoodId through the
        // same atomic call below instead of this client setDoc.
        authorityIdToSync = selectedAuthorityId;
        neighborhoodIdToSync = selectedNeighborhoodId;
      }

      updateData.core = {
        name: userName || data.city || 'User', // Use name from sessionStorage, or city, or fallback
        ...(user.email ? { email: user.email } : {}), // Only include email if it exists (not undefined)
        // core.role is intentionally absent — Firestore CREATE rule requires core.role == ''.
        // The role is set to 'USER' by /api/user/complete-profile (Admin SDK) after onboarding.
        isApproved: false, // Regular users don't need admin approval
        requiresApproval: false, // Regular app users don't require approval
        isSuperAdmin: false,
        initialFitnessTier: 1,
        trackingMode: 'wellness',
        mainGoal: 'healthy_lifestyle',
        gender: userGender || (data.gender as 'male' | 'female' | 'other') || 'other', // Get gender from sessionStorage or data, default to 'other'
        weight: 70,
        isAnonymous: isAnonymous,
        ...(!selectedAuthorityId && selectedNeighborhoodId ? { neighborhoodId: selectedNeighborhoodId } : {}),
        // authorityId (+ neighborhoodId, when paired with it) written
        // together via updateUserAuthority() after setDoc — see above.
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
        isUnlocked: false,
        currentGoal: 'couch_to_5k',
        activeProgram: null,
        paceProfile: { basePace: 0, profileType: 3, qualityWorkoutsHistory: [], qualityWorkoutCount: 0, lastSelfCorrectionDate: null },
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

        // ageGroup and birthDate are written by Admin SDK (/api/user/complete-profile).
        // Echoing them back in a client setDoc triggers noLockedCoreFieldsChanged()
        // → PERMISSION-DENIED. Leave them in Firestore unchanged by not sending them.
        delete coreUpdate.ageGroup;
        delete coreUpdate.birthDate;

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
        
        // authority ID is written after the main setDoc via updateUserAuthority()
        // because noTenantFieldsChanged() in firestore.rules blocks client writes.
        const selectedAuthorityId = typeof window !== 'undefined'
          ? sessionStorage.getItem('selected_authority_id')
          : null;
        const selectedNeighborhoodId = typeof window !== 'undefined'
          ? sessionStorage.getItem('selected_neighborhood_id')
          : null;

        if (selectedAuthorityId) {
          // City is changing this cycle — route neighborhoodId through the
          // same atomic call below instead of this client setDoc (see
          // create-branch comment above for why).
          authorityIdToSync = selectedAuthorityId;
          neighborhoodIdToSync = selectedNeighborhoodId;
        } else if (selectedNeighborhoodId) {
          // City isn't changing this cycle — no atomicity concern, write
          // neighborhoodId directly (not lock-protected).
          coreUpdate.neighborhoodId = selectedNeighborhoodId;
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
    if (data.equipmentList !== undefined) {
      updateData.equipment = {
        ...updateData.equipment,
        home: data.equipmentList,
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

    // ── [Smart Schedule v1.3] UTS Bridge ────────────────────────────────────
    // Persist the per-day program/skill template so the UTS hydrator can
    // seed userSchedule documents for strength users — closing the gap that
    // previously left strength onboarding without a recurringTemplate (and
    // therefore without calendar hydration). Mirrors the running bridge
    // block further down. We MERGE rather than overwrite so a user who
    // completes both strength and running onboarding keeps both worlds.
    if (
      (data as any).recurringTemplate &&
      typeof (data as any).recurringTemplate === 'object' &&
      Object.keys((data as any).recurringTemplate).length > 0
    ) {
      updateData.lifestyle = {
        ...updateData.lifestyle,
        recurringTemplate: {
          ...((updateData.lifestyle as any)?.recurringTemplate ?? {}),
          ...(data as any).recurringTemplate,
        },
      } as any;
    }

    // ── Running Schedule (from RunningScheduleStep) ──────────────────────────
    // weeklyFrequency is consumed by PlanGeneratorService via bridgeRunningOnboarding.
    // Merged directly into updateData.running (same fix as scheduleDays).
    if ((data as any).runningWeeklyFrequency !== undefined) {
      if (!updateData.running) updateData.running = {} as any;
      updateData.running.weeklyFrequency = (data as any).runningWeeklyFrequency;
    }
    // Store the running-specific reminder time under lifestyle.reminders.runningTime
    if ((data as any).runningScheduleTime) {
      updateData.lifestyle = {
        ...updateData.lifestyle,
        reminders: {
          ...(updateData.lifestyle?.reminders ?? {}),
          runningTime: (data as any).runningScheduleTime,
        },
      };
    }
    // Keep a dedicated running schedule days array on the running sub-document.
    // Merged directly into updateData.running to avoid dot-notation vs full-object
    // race condition when the COMPLETED block reassigns updateData.running.
    if ((data as any).runningScheduleDays && Array.isArray((data as any).runningScheduleDays)) {
      if (!updateData.running) updateData.running = {} as any;
      updateData.running.scheduleDays = (data as any).runningScheduleDays;
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
    // Age-gate validation (client-side enforcement layer).
    // SECURITY (Compliance Phase 2.1): under-14 must be blocked before any
    // Firestore write. A modified client could bypass the UI check and call
    // this directly — re-validate here and throw so no write happens.
    //
    // NOTE: birthDate and ageGroup are NOT written to core here.
    // Firestore rules lock both fields behind Admin SDK:
    //   CREATE rule: !('ageGroup' in core) && !('birthDate' in core)
    //   UPDATE rule: noLockedCoreFieldsChanged()
    // Writing them from the client causes PERMISSION-DENIED for both paths.
    // /api/user/complete-profile (Admin SDK) sets them authoritatively.
    if (typeof window !== 'undefined') {
      const storedBirthDate = sessionStorage.getItem('onboarding_personal_dob');
      if (storedBirthDate) {
        try {
          const dateObj = new Date(storedBirthDate);
          if (!isNaN(dateObj.getTime())) {
            const ageYears = (Date.now() - dateObj.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
            if (ageYears < 14) {
              const err = new Error(
                'AppOut מיועדת למשתמשים מגיל 14 ומעלה. לא ניתן להמשיך בתהליך ההרשמה.',
              );
              (err as any).code = 'UNDER_AGE';
              throw err;
            }
            // birthDate and ageGroup are set by /api/user/complete-profile (Admin SDK).
            // Do NOT add them to core here — both are blocked by Firestore rules.
          }
        } catch (e: any) {
          if (e?.code === 'UNDER_AGE') throw e;
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

    // ── Calendar sync preference ──────────────────────────────────────
    // calendarSyncEnabled is set by ScheduleStep / RunningScheduleStep.
    // Write it to settings.calendarSync so the app and admin can read it.
    if ((data as any).calendarSyncEnabled !== undefined) {
      updateData.settings = {
        ...(updateData.settings ?? {}),
        calendarSync: Boolean((data as any).calendarSyncEnabled),
      };
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
    // PERSONA ENGINE: Derive primaryTrack from goals (on COMPLETED)
    // Sets lifestyle.primaryTrack + lifestyle.dashboardMode atomically.
    // Priority: SET_PROGRAM_TRACK rule override > goal-based derivation
    // ================================================================
    if (step === 'COMPLETED') {
      const assessmentCtx = loadAssessmentContext();
      const ruleOverrideTrack = assessmentCtx?.programTrack;

      const goalIds: string[] =
        (data as any).selectedGoalIds ||
        onboardingAnswers.allGoals ||
        [];

      const primaryTrack = ruleOverrideTrack || derivePrimaryTrack(goalIds, onboardingAnswers) || 'health';
      const dashboardMode = trackToDashboardMode(primaryTrack) || 'DEFAULT';

      updateData.lifestyle = {
        ...updateData.lifestyle,
        primaryTrack,
        dashboardMode,
      };

      updateData.onboardingComplete = true;

      console.log(
        '[OnboardingSync] Persona Engine → primaryTrack:', primaryTrack,
        ruleOverrideTrack ? '(SET_PROGRAM_TRACK override)' : '(goal-derived)',
        '→ dashboardMode:', dashboardMode,
      );
    }

    // ================================================================
    // RUNNING BRANCH DETECTION (on COMPLETED) — hoisted ahead of PROGRAM &
    // LEVEL ASSIGNMENT below.
    //
    // The strength-fallback skip-check further down needs to know whether
    // THIS call will unlock a running program, but `updateData.running.isUnlocked`
    // is only set true inside the RUNNING IMPROVEMENT BRIDGE block, which used
    // to run AFTER program/level assignment — so on a user's first-ever running
    // completion the skip-check always saw isUnlocked=false and fell through to
    // the GOAL_TO_PROGRAM fallback, silently assigning a phantom full_body
    // strength program to running-only users.
    //
    // This detection itself is cheap and side-effect-free (sessionStorage read +
    // a pure two-field type check) — no Firestore, no await — so it's hoisted
    // here rather than reordering the much heavier RUNNING IMPROVEMENT BRIDGE
    // block (which does two awaited Firestore fetches + plan generation).
    // `runningAnswers` is reused verbatim by the RUNNING IMPROVEMENT BRIDGE
    // block further below instead of being recomputed.
    //
    // Declared outside the COMPLETED gate (so both blocks below can read them)
    // but only ever populated inside it — every other block in this function
    // scopes its work to `if (step === 'COMPLETED')`, and sessionStorage/JSON.parse
    // work has no reason to run on JIT/partial-step calls (PERSONA, SCHEDULE, etc.).
    // ================================================================
    let runningAnswers: Record<string, string> | null = null;
    let runningBranchWillComplete = false;
    if (step === 'COMPLETED') {
      if (typeof window !== 'undefined') {
        try {
          const storedRunning = sessionStorage.getItem('onboarding_running_answers');
          if (storedRunning) {
            runningAnswers = JSON.parse(storedRunning);
          }
        } catch (e) {
          console.warn('[OnboardingSync] Could not parse running answers:', e);
        }
      }
      // Inject weeklyFrequency from RunningScheduleStep (single source of truth).
      // The bridge's parseAnswers expects a number, so we pass a numeric value.
      if (runningAnswers && (data as any).runningWeeklyFrequency !== undefined) {
        (runningAnswers as any).weeklyFrequency = Number((data as any).runningWeeklyFrequency);
      }
      // Inject user-selected plan length from PlanLengthStep (overrides resolveWeeks)
      if (runningAnswers) {
        try {
          const storedAnswers = sessionStorage.getItem('onboarding_running_answers');
          if (storedAnswers) {
            const parsed = JSON.parse(storedAnswers);
            if (typeof parsed.runningPlanWeeks === 'number') {
              (runningAnswers as any).runningPlanWeeks = parsed.runningPlanWeeks;
            }
          }
        } catch {}
      }
      runningBranchWillComplete = !!(runningAnswers && isRunningBranchCompleted(runningAnswers));
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

      // ─────────────────────────────────────────────────────────────────────
      // maxLevel resolution: CMS (`programs/{id}.maxLevels`) is the SOLE source
      // of truth. We attempt a live fetch and use ONLY those values when it
      // succeeds. The hardcoded EMERGENCY_FALLBACK is only used when the
      // Firestore fetch throws (network down, permission error, etc.) so we
      // can still seed a usable progression instead of leaving the user empty.
      // ─────────────────────────────────────────────────────────────────────
      const EMERGENCY_FALLBACK_DOMAIN_MAX_LEVELS: Record<string, number> = {
        upper_body: 22, lower_body: 20, full_body: 25,
        core: 18, flexibility: 12, running: 20,
        handstand: 25, pull_up_pro: 20,
      };

      let cmsMaxLevels: Record<string, number> = {};
      let cmsFetchSucceeded = false;
      try {
        const { getAllPrograms } = await import('@/features/content/programs/core/program.service');
        const programs = await getAllPrograms();
        cmsFetchSucceeded = true;
        for (const prog of programs) {
          if (prog.maxLevels != null && prog.maxLevels > 0) {
            // Key by canonical slug (prog.slug → movementPattern → id) so that
            // the initialDomains lookup later (cmsMaxLevels[programId]) can find
            // the entry using the same slug that quiz results write to tracks.
            // Using prog.id (hash) was the root cause of domains.<hash>.currentLevel=0
            // being written alongside domains.<slug>.currentLevel=<real>, which in
            // turn produced the L1 shadow entry that blocked advanced exercises.
            const key = prog.slug || prog.movementPattern || prog.id;
            cmsMaxLevels[key] = prog.maxLevels;
          }
        }
      } catch (e) {
        console.warn('[onboarding-sync] CMS programs fetch failed — using emergency fallback', e);
      }

      const DOMAIN_MAX_LEVELS: Record<string, number> = cmsFetchSucceeded
        ? cmsMaxLevels
        : EMERGENCY_FALLBACK_DOMAIN_MAX_LEVELS;

      console.log(
        '[onboarding-sync] maxLevels source:',
        cmsFetchSucceeded
          ? `CMS (${Object.keys(cmsMaxLevels).length} programs)`
          : 'EMERGENCY_FALLBACK (CMS unreachable)',
        DOMAIN_MAX_LEVELS,
      );

      // Seed every CMS program with maxLevel metadata only.
      // currentLevel is intentionally set to 0 ("not yet assessed") — NOT to
      // initialLevel.  The quiz-result mirror loop later in this function
      // overwrites each entry the user actually completed with their real
      // assessed level.
      //
      // Previously, every unselected program was stamped with the flat tier
      // value (e.g. L5 for a tier-3 user), which caused "profile pollution":
      // muscle_up, upper_body, calisthenics_upper, push, legs, etc. all
      // appeared at L5 even though the user only assessed Pull.  This also
      // fed the master-level averaging formula with ghost L5 values, making
      // upper_body appear at avg(pull=16, push=5) ≈ L10 instead of L16.
      const initialDomains: Record<string, { currentLevel: number; maxLevel: number; isUnlocked: boolean }> = {};
      for (const [domainId, maxLevel] of Object.entries(DOMAIN_MAX_LEVELS)) {
        initialDomains[domainId] = { currentLevel: 0, maxLevel, isUnlocked: true };
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
      // Guard against silent regression to L1: if the user reached COMPLETED with
      // some assignedResults but ALL of them are malformed, log loudly so we don't
      // silently fall through to GOAL_TO_PROGRAM with initialLevel (1/3/5).
      if (effectiveResults) {
        const beforeCount = effectiveResults.length;
        effectiveResults = effectiveResults.filter(
          r => r && typeof r.programId === 'string' && r.programId.trim() !== '' &&
               typeof r.levelId === 'string' && r.levelId.trim() !== ''
        );
        if (effectiveResults.length === 0) {
          if (beforeCount > 0) {
            console.error(
              `🚨 [OnboardingSync] All ${beforeCount} assignedResults entries were invalid ` +
              `(missing programId or levelId). User would silently fall back to Level ${initialLevel}. ` +
              `Check the visual-assessment payload — this is a regression.`,
            );
          }
          effectiveResults = undefined;
        } else if (effectiveResults.length < beforeCount) {
          console.warn(
            `[OnboardingSync] Dropped ${beforeCount - effectiveResults.length}/${beforeCount} ` +
            `malformed assignedResults entries. Continuing with ${effectiveResults.length} valid entries.`,
          );
        }
      }

      // Path B (body_focus): Override program assignment from muscle selection
      const path = getProgramPathFromStorage();
      const muscleIds = getMuscleFocusFromStorage();
      const isPathBBodyFocus = path === 'body_focus' && muscleIds.length > 0;

      // Path B safety net: if the user chose a muscle focus (e.g. "Chest only" →
      // ['chest']) but the questionnaire produced no assignedResults (sessionStorage
      // was cleared between pages, or the quiz page never wrote results), we
      // synthesise a valid effectiveResults entry from the muscle selection so the
      // program is never silently reassigned to the GOAL_TO_PROGRAM table.
      // The synthesised level is initialLevel (derived from the fitness-tier answer);
      // this is equivalent to what the quiz would have returned had results been present.
      if (isPathBBodyFocus && (!effectiveResults || effectiveResults.length === 0)) {
        const syntheticProgramId = deriveActiveProgramFromMuscleFocus(muscleIds);
        const syntheticFocusDomains = getFocusDomainsForMuscleFocus(muscleIds);
        const syntheticMasterSub: Record<string, number> = {
          push: syntheticFocusDomains.includes('push') ? initialLevel : 0,
          pull: syntheticFocusDomains.includes('pull') ? initialLevel : 0,
          legs: syntheticFocusDomains.includes('legs') ? initialLevel : 0,
          core: syntheticFocusDomains.includes('core') ? initialLevel : 0,
        };
        effectiveResults = [{
          programId: syntheticProgramId,
          levelId: `${syntheticProgramId}_level_${initialLevel}`,
          masterProgramSubLevels: syntheticMasterSub,
        }];
        console.log(
          '[OnboardingSync] Path B: no assignedResults found — synthesised from muscle focus.',
          `muscleIds=[${muscleIds.join(', ')}] → programId="${syntheticProgramId}"` +
          ` @L${initialLevel}, focusDomains=[${syntheticFocusDomains.join(', ')}]`,
        );
      }

      // Path C (skills): Specialist (1 skill) vs Generalist (2+ skills) program linkage
      let skillIds = getSkillFocusFromStorage();
      if (path === 'skills' && effectiveResults && effectiveResults.length > 0 && skillIds.length === 0) {
        skillIds = effectiveResults.map((r) => r.programId);
      }
      const isPathCSkills = path === 'skills' && skillIds.length > 0;

      if (effectiveResults && effectiveResults.length > 0) {
        // Path C: Override activeProgramId and focusDomains from skill focus (Specialist vs Generalist)
        if (isPathCSkills) {
          const activeProgramId = deriveActiveProgramFromSkillFocus(skillIds);
          const focusDomains = [...skillIds];
          // Filter to selected skills only, preserve order
          const skillResults = skillIds
            .map((sid) => effectiveResults.find((r) => r.programId === sid))
            .filter((r): r is NonNullable<typeof r> => r != null);
          if (skillResults.length === 0) {
            const fallback = effectiveResults[0];
            skillResults.push(fallback);
          }
          const primaryResult = skillResults[0];
          if (skillIds.length === 1) {
            effectiveResults = [{ ...primaryResult, programId: skillIds[0], levelId: primaryResult.levelId }];
          } else {
            effectiveResults = [
              {
                ...primaryResult,
                programId: 'calisthenics_upper',
                levelId: primaryResult.levelId,
                masterProgramSubLevels: Object.fromEntries(
                  skillResults.map((r) => {
                    const m = r.levelId.match(/(\d+)/);
                    return [r.programId, m ? Math.max(1, parseInt(m[1], 10)) : 1];
                  })
                ),
              },
            ];
          }
          console.log(
            '[OnboardingSync] Path C: activeProgram=',
            activeProgramId,
            'skillFocusIds=',
            skillIds,
            'focusDomains=',
            focusDomains,
          );
        }
        // Path B: Multi-track expansion from muscle selection
        //
        // Previous behaviour: collapse push+pull → one master result ('upper_body')
        //   activePrograms: [upper_body]  tracks: {upper_body, push, pull}
        //
        // New behaviour: one result PER assessed child domain
        //   activePrograms: [push, pull]  tracks: {push, pull}
        //
        // Single-domain selections (chest only → push) continue to write a
        // single entry with that domain's own slug. Multi-domain selections
        // (chest+back → push+pull) now write one entry per slug so the home
        // screen renders separate cards and the split engine rotates them.
        else if (isPathBBodyFocus) {
          const focusDomains = getFocusDomainsForMuscleFocus(muscleIds);
          const primaryResult = effectiveResults[0];
          const masterSub: Record<string, number> =
            primaryResult.masterProgramSubLevels ?? { push: 0, pull: 0, legs: 0, core: 0 };

          // Only expand domains that have a real assessed level (> 0).
          const assessedDomains = focusDomains.filter(d => (masterSub[d] ?? 0) > 0);

          if (assessedDomains.length > 1) {
            // ── Multi-domain: one independent result per assessed domain ──────
            // masterProgramSubLevels is intentionally omitted — each domain is
            // its own leaf program, not a master with children.
            effectiveResults = assessedDomains.map(domain => ({
              programId: domain,
              levelId: `${domain}_level_${masterSub[domain]}`,
              masterProgramSubLevels: undefined,
            }));
            console.log(
              '[OnboardingSync] Path B multi-track expansion: ' +
              `muscleIds=[${muscleIds.join(', ')}] → ` +
              assessedDomains.map(d => `${d}=L${masterSub[d]}`).join(', '),
            );
          } else {
            // ── Single-domain: keep current single-result behaviour ────────────
            // Use the specific leaf slug (e.g. 'push') rather than a master slug
            // so the active program card is labelled correctly.
            const singleDomain = assessedDomains[0] ?? focusDomains[0] ?? 'push';
            const singleLevel = (masterSub[singleDomain] ?? 0)
              || Math.max(...Object.values(masterSub)) || 1;
            effectiveResults = [{
              ...primaryResult,
              programId: singleDomain,
              levelId: `${singleDomain}_level_${singleLevel}`,
              masterProgramSubLevels: undefined,
            }];
            console.log(
              '[OnboardingSync] Path B single-domain: ' +
              `muscleIds=[${muscleIds.join(', ')}] → ${singleDomain}=L${singleLevel}`,
            );
          }
        }

        // ✅ USE DYNAMIC QUESTIONNAIRE RESULTS (Highest Priority)
        console.log('[OnboardingSync] Using assignedResults from dynamic questionnaire:', effectiveResults);

        // Primary result for backwards compatibility
        const primaryResult = effectiveResults[0];
        const primaryProgramId = primaryResult.programId;
        
        // Extract numeric level from levelId (e.g., "level_3" → 3).
        // Math.max(1, …) guards against pathological inputs like "level_0" that
        // would otherwise dump the user back to a non-existent Level 0.
        const levelMatch = primaryResult.levelId.match(/(\d+)/);
        const primaryLevel = levelMatch
          ? Math.max(1, parseInt(levelMatch[1], 10))
          : initialLevel;

        updateData.currentProgramId = primaryProgramId;
        updateData.fitnessLevel = fitnessLevel;

        // Build tracks from ALL assigned results (accumulative — multi-widget support)
        const quizTracks: Record<string, { currentLevel: number; percent: number }> = {};
        const activeProgramEntries: any[] = [];
        
        // Accumulate: keep existing programs, add new ones from quiz
        const existingActivePrograms = updateData.progression?.activePrograms || [];
        // Check both `id` AND `templateId` so that legacy hash-ID entries and
        // new slug entries for the same program are treated as the same slot.
        // Without this, "H2279XsRGDg9G370J7S9" (old hash) and "full_body" (new
        // slug) would both pass the dedup gate and create a duplicate row.
        const existingProgramIds = new Set(
          existingActivePrograms.flatMap((p: any) =>
            [p.id, p.templateId].filter((v): v is string => typeof v === 'string' && v.trim() !== ''),
          ),
        );

        for (const result of effectiveResults) {
          const rLevelMatch = result.levelId.match(/(\d+)/);
          // absent=absent (⑨): resolve the assessed level; if the levelId has no number, do NOT
          // fabricate L1 — leave the track (and its derived foundation) absent.
          const rLevel = rLevelMatch ? Math.max(1, parseInt(rLevelMatch[1], 10)) : 0;

          // Set track for the program itself (only when a real level resolved)
          if (rLevel > 0) {
            quizTracks[result.programId] = { currentLevel: rLevel, percent: 0 };
          }

          // ── Path C: Strict Skill → Foundation derivation ─────────────────
          // For single-skill Path C results (e.g. programId = 'planche'):
          // infer the paired foundational track using the physio offset formula.
          // Legs and core are explicitly NOT written — they are unassessed and
          // must remain absent from the progression document (no ghost data).
          // KEPT (⑨): this is inference from a GENUINELY assessed skill, not tier-fabrication.
          if (isPathCSkills && rLevel > 0) {
            const foundationDomain = SKILL_TO_FOUNDATION_DOMAIN[result.programId];
            if (foundationDomain) {
              const maxFoundation = cmsMaxLevels[foundationDomain] ?? 25;
              const foundationLevel = Math.min(rLevel + SKILL_TO_FOUNDATION_OFFSET, maxFoundation);
              quizTracks[foundationDomain] = { currentLevel: foundationLevel, percent: 0 };
              console.log(
                `[OnboardingSync] Skill→Foundation: ${result.programId} L${rLevel} → ` +
                `${foundationDomain} L${foundationLevel} (offset +${SKILL_TO_FOUNDATION_OFFSET}, ` +
                `cap=${maxFoundation})`,
              );
            }
          }

          // Set tracks for child programs (masterProgramSubLevels).
          // Only write entries where childLevel > 0 — zero values represent
          // un-assessed or un-selected sub-domains (e.g. `legs: 0` on a push/pull
          // body-focus user, or an un-assessed skill in a multi-skill result).
          // Writing them would create ghost tracks that pollute master-program
          // averages (upper_body, full_body) with meaningless L0 entries.
          if (result.masterProgramSubLevels) {
            for (const [childId, childLevel] of Object.entries(result.masterProgramSubLevels)) {
              if (childLevel > 0) {
                quizTracks[childId] = { currentLevel: childLevel, percent: 0 };
              }
            }

            // ── Path C multi-skill: derive foundational tracks from each sub-skill ─
            // For a calisthenics_upper result (multi-skill user with e.g.
            // masterProgramSubLevels = { planche: 7, front_lever: 9 }), derive the
            // corresponding foundational track for every skill sub-level present.
            // When multiple push-family (or pull-family) skills are present, we take
            // the MAX derived level so the foundational track reflects the user's
            // highest applicable capability.
            // Legs and core remain unwritten (no fallback, no ghost data).
            if (isPathCSkills) {
              const derivedFoundations: Partial<Record<'push' | 'pull', number>> = {};
              for (const [skillId, skillLvl] of Object.entries(
                result.masterProgramSubLevels as Record<string, number>,
              )) {
                if (skillLvl <= 0) continue;
                const fd = SKILL_TO_FOUNDATION_DOMAIN[skillId];
                if (!fd) continue;
                const maxFd = cmsMaxLevels[fd] ?? 25;
                const derived = Math.min(skillLvl + SKILL_TO_FOUNDATION_OFFSET, maxFd);
                if ((derivedFoundations[fd] ?? 0) < derived) derivedFoundations[fd] = derived;
              }
              for (const [fd, level] of Object.entries(derivedFoundations) as Array<['push' | 'pull', number]>) {
                quizTracks[fd] = { currentLevel: level, percent: 0 };
                console.log(
                  `[OnboardingSync] Skill→Foundation (multi-skill): ` +
                  `${fd} L${level} (max derived from sub-levels, offset +${SKILL_TO_FOUNDATION_OFFSET})`,
                );
              }
            }

            // Virtual Core Level: only for Path B body-focus users who have assessed
            // push / pull / legs but skipped core.  Path C skill users intentionally
            // leave core unset — a skill specialist's core needs are served through
            // the foundational domain pair (push/pull), not a virtual average.
            // absent=absent (⑨): REMOVED the write-side Virtual-Core derivation
            // (core = avg(push,pull,legs) when core was skipped). An unassessed core now stays
            // ABSENT — no invented core level is persisted. Mirrors the read-side removal in
            // level-resolution.utils.ts; the user fills the core questionnaire to get core content.
          }

          // Add to activePrograms (accumulative — don't overwrite existing).
          // Validate the templateId resolves to a real Program before
          // writing — this is the safety net against the "פ" bug class
          // (corrupt single-character ids, hand-edited Firestore data,
          // legacy slugs that no longer match any program). A rejected
          // entry is logged loudly so the regression is visible without
          // requiring the user to hit WorkoutTrio's "0 exercises" edge.
          if (!existingProgramIds.has(result.programId)) {
            if (!(await isValidProgramTemplateId(result.programId))) {
              console.warn(
                '🚨 [OnboardingSync] Rejecting activePrograms entry — programId ' +
                'failed getProgramByTemplateId() validation:',
                JSON.stringify(result.programId),
              );
              continue;
            }
            // focusDomains resolution:
            //   • Path C calisthenics_upper: skill focus IDs (e.g. [planche, front_lever])
            //   • Path B multi-track:        [result.programId] — each leaf program
            //                                owns only its own domain so the workout
            //                                engine doesn't receive a cross-domain
            //                                filter list for a single-track program.
            //   • All other paths:           [result.programId] (same as before)
            const PRIMARY_DOMAIN_SLUGS = new Set(['push', 'pull', 'legs', 'core']);
            const focusDomains =
              isPathCSkills && result.programId === 'calisthenics_upper'
                ? skillIds
                : isPathBBodyFocus && !PRIMARY_DOMAIN_SLUGS.has(result.programId)
                  // Fallback: Path B result is still a master slug (shouldn't happen
                  // after the multi-track expansion, but kept for safety).
                  ? getFocusDomainsForMuscleFocus(muscleIds)
                  : [result.programId];
            activeProgramEntries.push({
              id: result.programId,
              templateId: result.programId,
              name: result.programId.replace(/_/g, ' '),
              startDate: new Date().toISOString(),
              durationWeeks: 52,
              currentWeek: 1,
              focusDomains: focusDomains as any,
            });
          }
        }

        // Merge existing tracks with quiz tracks (quiz overrides on conflict)
        const mergedTracks = {
          ...(updateData.progression?.tracks || {}),
          ...quizTracks,
        };
        console.log(
          '[OnboardingSync] Writing progression.tracks (Path B/C assessment levels):',
          mergedTracks
        );

        // Mirror quiz currentLevels into the seeded `initialDomains` so the two
        // paths agree from day 1. Without this, `domains.{id}.currentLevel` would
        // hold the stale tier-derived initialLevel (1/3/5) while `tracks.{id}.currentLevel`
        // holds the real assessed level (e.g. 10) — causing any consumer that reads
        // `domains.{id}.currentLevel` directly to display the wrong number.
        const seededDomains: Record<string, { currentLevel: number; maxLevel: number; isUnlocked: boolean }> = { ...initialDomains };
        for (const [programId, track] of Object.entries(quizTracks)) {
          const existing = seededDomains[programId];
          if (existing) {
            seededDomains[programId] = { ...existing, currentLevel: track.currentLevel };
          } else {
            // Quiz produced a track for a program that wasn't in DOMAIN_MAX_LEVELS
            // (e.g. a CMS program with no maxLevels set, or a child like `push`/`pull`).
            // Seed it with the quiz level; maxLevel will be resolved live by useProgramProgress.
            seededDomains[programId] = {
              currentLevel: track.currentLevel,
              maxLevel: cmsMaxLevels[programId] ?? 0,
              isUnlocked: true,
            };
          }
        }

        // ── Ghost Data Purge (Path C) ─────────────────────────────────
        // Path C users register via a single (or multi) skill selection and are
        // never assessed on the legs / core foundational tracks.  The
        // `initialDomains` bootstrap stamps every CMS program with
        // `currentLevel: 0` so the document has a complete shape, but for skill
        // users those zeros are pure ghost data — they would otherwise:
        //   • Pollute master-program averages (upper_body, full_body) with L0
        //     summands that drag the computed master level downwards.
        //   • Render fake "Level 0" progress bars on the dashboard for tracks
        //     the user was never offered to assess.
        //   • Break the strict spreadsheet rule that unassessed foundational
        //     domains must remain ABSENT (not zero).
        //
        // The purge is strictly conditional:
        //   • Only fires for Path C users (`isPathCSkills`).
        //   • Only strips `legs` and `core` (push/pull may have been derived
        //     via SKILL_TO_FOUNDATION_OFFSET and must be preserved).
        //   • Only strips entries the quiz did NOT explicitly assess
        //     (currentLevel === 0) — any legitimately assessed value stays.
        if (isPathCSkills) {
          for (const ghostDomain of ['legs', 'core'] as const) {
            const wasAssessed = (quizTracks[ghostDomain]?.currentLevel ?? 0) > 0;
            if (wasAssessed) continue;
            const seeded = seededDomains[ghostDomain];
            if (seeded && seeded.currentLevel === 0) {
              delete seededDomains[ghostDomain];
            }
            const merged = mergedTracks[ghostDomain];
            if (merged && (merged.currentLevel ?? 0) === 0) {
              delete mergedTracks[ghostDomain];
            }
          }
          console.log(
            '[OnboardingSync] Path C Ghost Purge: stripped unassessed `legs`/`core` placeholders. ' +
            `Remaining domains: [${Object.keys(seededDomains).join(', ')}], ` +
            `tracks: [${Object.keys(mergedTracks).join(', ')}]`,
          );
        }

        // Merge activePrograms (keep existing + add new from quiz)
        const mergedActivePrograms = [
          ...existingActivePrograms,
          ...activeProgramEntries,
        ];

        // Validate the primary fallback before we use it as the sole
        // activePrograms entry. If `mergedActivePrograms` is non-empty
        // we don't need this fallback at all and skip the validation.
        const primaryFallbackValid =
          mergedActivePrograms.length > 0 ||
          (await isValidProgramTemplateId(primaryProgramId));
        if (mergedActivePrograms.length === 0 && !primaryFallbackValid) {
          console.warn(
            '🚨 [OnboardingSync] primaryProgramId failed validation — refusing ' +
            'to seed activePrograms with a corrupt fallback:',
            JSON.stringify(primaryProgramId),
          );
        }

        updateData.progression = {
          ...updateData.progression,
          domains: seededDomains,
          tracks: mergedTracks,
          activePrograms: mergedActivePrograms.length > 0
            ? mergedActivePrograms
            : primaryFallbackValid
              ? [{
                  id: primaryProgramId,
                  templateId: primaryProgramId,
                  name: primaryProgramId.replace(/_/g, ' '),
                  startDate: new Date().toISOString(),
                  durationWeeks: 52,
                  currentWeek: 1,
                  focusDomains: [primaryProgramId] as any,
                }]
              : [],
          ...(isPathCSkills && skillIds.length >= 2 ? { skillFocusIds: skillIds } : {}),
        };

        // Store assignedResults on the document for future reference
        // Sanitize entries to ensure no undefined fields reach Firestore
        updateData.assignedResults = effectiveResults.map(r => ({
          programId: r.programId,
          levelId: r.levelId,
          ...(r.masterProgramSubLevels ? { masterProgramSubLevels: r.masterProgramSubLevels } : {}),
        }));

      } else if (updateData.running?.isUnlocked || runningBranchWillComplete) {
        // Running-only user with no strength quiz results — skip strength program assignment.
        // Covers both an already-unlocked returning user (isUnlocked, carried over from Firestore)
        // and a user whose running branch is about to unlock in THIS call (runningBranchWillComplete,
        // detected above — isUnlocked itself isn't set true until the RUNNING IMPROVEMENT BRIDGE
        // block runs, further below).
        console.log('[OnboardingSync] Running-only user detected (no assignedResults, running.isUnlocked=' + !!updateData.running?.isUnlocked + ', runningBranchWillComplete=' + runningBranchWillComplete + '). Skipping strength program fallback.');
      } else {
        // ============================================================
        // PRIORITY 2 / FALLBACK: GOAL_TO_PROGRAM legacy mapping
        // Used only when no dynamic questionnaire results are available
        // ============================================================
        console.log('[OnboardingSync] No assignedResults found, falling back to GOAL_TO_PROGRAM mapping');

        // ── Resolve ALL selected goals to unique program IDs ──────────────────
        // selectedGoalIds may contain multiple goals (e.g. ['aesthetics', 'fitness']).
        // Map each to its program, deduplicate, then validate every candidate
        // before writing to activePrograms so no corrupt ID sneaks through.
        const rawGoalIds: string[] =
          (data as any).selectedGoalIds?.length
            ? (data as any).selectedGoalIds
            : (data as any).selectedGoal
              ? [(data as any).selectedGoal]
              : ['healthy_lifestyle'];

        // Deduplicated program IDs preserving goal order
        const goalProgramIds: string[] = [];
        const _goalSeen = new Set<string>();
        for (const goalId of rawGoalIds) {
          const pid = GOAL_TO_PROGRAM[goalId] || 'full_body';
          if (!_goalSeen.has(pid)) { _goalSeen.add(pid); goalProgramIds.push(pid); }
        }
        // Primary = first goal's mapped program (backwards-compat for currentProgramId)
        const assignedProgramId = goalProgramIds[0] ?? 'full_body';

        updateData.currentProgramId = assignedProgramId;
        updateData.fitnessLevel = fitnessLevel;

        // Build tracks for every mapped program
        const initialTracks: Record<string, { currentLevel: number; percent: number }> = {};
        for (const pid of goalProgramIds) {
          initialTracks[pid] = { currentLevel: initialLevel, percent: 0 };
        }

        // Validate each candidate; reject any whose templateId can't be resolved
        const validatedGoalPrograms: string[] = [];
        for (const pid of goalProgramIds) {
          if (await isValidProgramTemplateId(pid)) {
            validatedGoalPrograms.push(pid);
          } else {
            console.warn(
              '🚨 [OnboardingSync] GOAL_TO_PROGRAM produced an unresolvable id — ' +
              'refusing to seed activePrograms with it:',
              JSON.stringify(pid),
            );
          }
        }

        // Also set the main active program in progression if not already set
        const existingPrograms = updateData.progression?.activePrograms;
        if (!existingPrograms || existingPrograms.length === 0) {
          updateData.progression = {
            ...updateData.progression,
            domains: initialDomains,
            tracks: initialTracks,
            activePrograms: validatedGoalPrograms.map(pid => ({
              id: pid,
              templateId: pid,
              name: pid.replace(/_/g, ' '),
              startDate: new Date().toISOString(),
              durationWeeks: 52,
              currentWeek: 1,
              focusDomains: [pid] as any,
            })),
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

    // ================================================================
    // RUNNING IMPROVEMENT BRIDGE (on COMPLETED)
    // If the dynamic questionnaire included a running improvement branch,
    // aggregate answers into RunningOnboardingData, generate a program
    // template via PlanGeneratorService, and persist both on the user doc.
    //
    // `runningAnswers` was built once, above, ahead of PROGRAM & LEVEL ASSIGNMENT
    // (sessionStorage read + weeklyFrequency/runningPlanWeeks injection) — reused
    // verbatim here rather than recomputed. `isRunningBranchCompleted` is
    // re-evaluated (not reused from `runningBranchWillComplete`) purely so
    // TypeScript narrows `runningAnswers` to non-null below; it's a pure,
    // trivial two-field check, not the part that was actually duplicated.
    // ================================================================
    if (step === 'COMPLETED') {
      if (runningAnswers && isRunningBranchCompleted(runningAnswers)) {
        try {
          const bridge = bridgeRunningOnboarding(runningAnswers);

          const paceProfile: PaceProfile = {
            basePace: bridge.basePace,
            profileType: bridge.programTemplate.targetProfileTypes[0] ?? 2,
            qualityWorkoutsHistory: [],
            qualityWorkoutCount: 0,
            lastSelfCorrectionDate: null,
          };

          updateData.running = {
            ...updateData.running,
            isUnlocked: true,
            currentGoal: bridge.runnerGoal,
            paceProfile,
            onboardingData: bridge.runningOnboardingData,
            generatedProgramTemplate: {
              id: bridge.programTemplate.id,
              name: bridge.programTemplate.name,
              targetDistance: bridge.programTemplate.targetDistance,
              canonicalWeeks: bridge.programTemplate.canonicalWeeks,
              canonicalFrequency: bridge.programTemplate.canonicalFrequency,
              targetProfileTypes: bridge.programTemplate.targetProfileTypes,
              maxIntensityRank: bridge.programTemplate.maxIntensityRank,
              ...(bridge.programTemplate.excludeCategories
                ? { excludeCategories: bridge.programTemplate.excludeCategories }
                : {}),
            },
          };

          // ── Generate ActiveRunningProgram with full schedule ──────────
          // Fetch workout templates + pace config from Firestore, then call
          // generatePlan() to produce the week-by-week workout schedule.
          try {
            const [paceMapConfig, workoutTemplates] = await Promise.all([
              getPaceMapConfig().catch(() => DEFAULT_PACE_MAP_CONFIG),
              getRunWorkoutTemplates().catch(() => []),
            ]);

            // ── Matchmaker Diagnostic ─────────────────────────────────
            const dist = bridge.programTemplate.targetDistance;
            const profiles = bridge.programTemplate.targetProfileTypes;
            const maxRank = bridge.programTemplate.maxIntensityRank ?? Infinity;
            const excludeCats = bridge.programTemplate.excludeCategories ?? [];

            const categoryCounts: Record<string, number> = {};
            const profileCounts: Record<string, number> = {};
            for (const t of workoutTemplates) {
              const cat = t.category ?? 'unknown';
              categoryCounts[cat] = (categoryCounts[cat] ?? 0) + 1;
              const key = JSON.stringify(t.targetProfileTypes ?? []);
              profileCounts[key] = (profileCounts[key] ?? 0) + 1;
            }

            const matchingProfile = workoutTemplates.filter((t) => {
              if (!t.targetProfileTypes || t.targetProfileTypes.length === 0) return true;
              return t.targetProfileTypes.some((p) => profiles.includes(p));
            });

            console.log(
              `🧪 [Matchmaker] Searching for workouts with: dist=${dist}, profiles=[${profiles}], maxRank=${maxRank}, excludeCats=[${excludeCats}]`,
            );
            console.log(
              `🧪 [Matchmaker] Template census: ${workoutTemplates.length} total | ${matchingProfile.length} match profile [${profiles}]`,
            );
            console.log(`🧪 [Matchmaker] Categories in DB:`, categoryCounts);
            console.log(`🧪 [Matchmaker] Profile distributions:`, profileCounts);

            if (matchingProfile.length === 0 && workoutTemplates.length > 0) {
              console.error(
                `🚨 [Matchmaker] PROFILE MISMATCH: ${workoutTemplates.length} templates exist but NONE match profiles [${profiles}]. ` +
                `DB has profiles: ${Object.keys(profileCounts).join(', ')}. ` +
                `Run the Fix Profiles admin script or upload templates for profiles [${profiles}].`,
              );
            }

            if (workoutTemplates.length > 0) {
              const planResult = generatePlan(
                bridge.programTemplate,
                paceProfile,
                paceMapConfig,
                workoutTemplates,
              );

              // Build category lookup from workout templates (templateId → category + name)
              const templateCategoryMap = new Map<string, { category?: WorkoutCategory; name: string }>();
              for (const tpl of workoutTemplates) {
                templateCategoryMap.set(tpl.id, { category: tpl.category, name: tpl.name });
              }

              // Flatten plan weeks → ActiveRunningProgram.schedule entries
              const schedule: Array<{
                week: number;
                day: number;
                workoutId: string;
                status: 'pending';
                category?: WorkoutCategory;
                workoutName?: string;
              }> = [];

              for (const planWeek of planResult.plan.weeks) {
                planWeek.workouts.forEach((workout, dayIdx) => {
                  // workout.id = `${templateId}_w${weekNumber}` — extract templateId
                  const templateId = workout.id.replace(/_w\d+$/, '');
                  const tplMeta = templateCategoryMap.get(templateId);

                  schedule.push({
                    week: planWeek.weekNumber,
                    day: dayIdx + 1,
                    workoutId: workout.id,
                    status: 'pending',
                    category: tplMeta?.category,
                    workoutName: tplMeta?.name ?? workout.title,
                  });
                });
              }

              updateData.running.activeProgram = {
                programId: bridge.programTemplate.id,
                startDate: new Date().toISOString(),
                currentWeek: 1,
                schedule,
              };

              console.log(
                `[OnboardingSync] ActiveRunningProgram created: ${schedule.length} entries across ${planResult.plan.weeks.length} weeks`,
                planResult.warnings.length > 0 ? `(${planResult.warnings.length} warnings)` : '',
              );

              // Bridge: build recurringTemplate from running scheduleDays so that
              // hydrateFromTemplate() can produce UTS entries for running training days.
              // activePrograms is intentionally NOT touched — mode is the UI guard.
              // Hybrid users keep their strength activePrograms intact.
              const runScheduleDays: string[] = (data as any).runningScheduleDays
                ?? updateData.running?.scheduleDays ?? [];
              if (runScheduleDays.length > 0) {
                const runTemplate: Record<string, string[]> = {};
                for (const dayLetter of runScheduleDays) {
                  runTemplate[dayLetter] = [bridge.programTemplate.id];
                }
                // MERGE (not overwrite) — same pattern as the strength block above
                // (Smart Schedule v1.3 UTS Bridge). A wholesale replace here would
                // silently drop a returning user's existing strength training days
                // from the calendar the moment they complete running onboarding.
                updateData.lifestyle = {
                  ...updateData.lifestyle,
                  recurringTemplate: {
                    ...((updateData.lifestyle as any)?.recurringTemplate ?? {}),
                    ...runTemplate,
                  },
                };
                console.log('[OnboardingSync] recurringTemplate merged with scheduleDays:', runScheduleDays);
              }
            } else {
              console.warn('[OnboardingSync] No workout templates available — activeProgram deferred to first run');
            }
          } catch (planErr) {
            console.warn('[OnboardingSync] Plan generation failed (non-critical, activeProgram deferred):', planErr);
          }

          // Deliberate, temporary policy — the running branch always wins primaryTrack/
          // dashboardMode on success, even if THIS SAME call also assigned a real
          // strength program above (PRIORITY 1 / assignedResults). Not an accident:
          // there's no designed "hybrid" home experience yet, so a single-session
          // dual-track user is routed to the running view rather than a half-built
          // blended one. Revisit once hybrid dashboard design lands.
          //
          // primaryTrack is not display-only — it's also read by:
          //   - useDailyActivity.ts (trackToProgram[primaryTrack] → which program
          //     feeds the daily activity ring)
          //   - StrengthVolumeWidget.tsx (gates cardio- vs strength-widget content)
          //   - dashboardMode derivation (track-mapper.service.ts) → indirectly the
          //     WHO activity rings ('health' track → DEFAULT mode → WHO rings)
          if (updateData.lifestyle) {
            updateData.lifestyle.primaryTrack = 'run';
            updateData.lifestyle.dashboardMode = 'RUNNING';
          } else {
            updateData.lifestyle = { primaryTrack: 'run', dashboardMode: 'RUNNING' } as any;
          }

          console.log('[OnboardingSync] Running bridge completed:', bridge.programTemplate.name);
        } catch (err) {
          console.warn('[OnboardingSync] Running bridge failed (non-critical):', err);
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
    
    // ── Multi-Tenant: merge tenant fields from access code validation ──
    const accessCodeResult = getAccessCodeResult();
    if (accessCodeResult) {
      updateData.core = {
        ...updateData.core,
        tenantId: accessCodeResult.tenantId,
        unitId: accessCodeResult.unitId,
        unitPath: accessCodeResult.unitPath,
        tenantType: accessCodeResult.tenantType,
      };
      if (step === 'COMPLETED') {
        clearAccessCodeResult();
      }
    }
    // Also merge from onboarding data (set by AccessCodeStep via updateData)
    if (data.tenantId && !updateData.core?.tenantId) {
      updateData.core = {
        ...updateData.core,
        tenantId: data.tenantId,
        unitId: data.unitId,
        unitPath: data.unitPath,
        tenantType: data.tenantType,
      };
    }

    const sanitizedUpdateData = sanitizeObject(updateData);

    // ── [DIAG] Exact payload about to be written ─────────────────────────────
    // Compare this against each UPDATE rule clause to find the failing one:
    //   noAdminFieldsChanged   → core.role / isSuperAdmin / isApproved / managedVertical
    //   noTenantFieldsChanged  → core.tenantId / unitId / unitPath / tenantType / authorityId
    //   noGameIntegrityFields  → progression.globalLevel / globalXP / coins
    //   noSocialGroupIdsChanged → social.groupIds
    //   noLockedCoreFields     → core.ageGroup / birthDate
    console.log('[OnboardingSync][DIAG] payload', {
      uid: user.uid,
      step,
      mode: exists ? 'UPDATE' : 'CREATE',
      topLevelKeys: Object.keys(sanitizedUpdateData),
      coreKeys: sanitizedUpdateData.core ? Object.keys(sanitizedUpdateData.core) : '(absent)',
      coreRole: sanitizedUpdateData.core?.role ?? '(absent)',
      coreIsApproved: sanitizedUpdateData.core?.isApproved ?? '(absent)',
      coreIsSuperAdmin: sanitizedUpdateData.core?.isSuperAdmin ?? '(absent)',
      coreTenantId: sanitizedUpdateData.core?.tenantId ?? '(absent)',
      coreUnitId: sanitizedUpdateData.core?.unitId ?? '(absent)',
      coreAuthorityId: sanitizedUpdateData.core?.authorityId ?? '(absent)',
      progressionLevel: sanitizedUpdateData.progression?.globalLevel ?? '(absent)',
      progressionXP: sanitizedUpdateData.progression?.globalXP ?? '(absent)',
      progressionCoins: sanitizedUpdateData.progression?.coins ?? '(absent)',
      socialGroupIds: (sanitizedUpdateData as any).social?.groupIds ?? '(absent)',
      coreAgeGroup: sanitizedUpdateData.core?.ageGroup ?? '(absent)',
      coreBirthDate: sanitizedUpdateData.core?.birthDate ?? '(absent)',
      topLevelRole: (sanitizedUpdateData as any).role ?? '(absent)',
    });

    // Save to Firestore (merge with existing data)
    // Use sanitized data to ensure no undefined values
    await setDoc(userDocRef, sanitizedUpdateData, { merge: true });

    // core.authorityId is locked from direct client writes (noTenantFieldsChanged).
    // Written after the main setDoc via the Admin SDK endpoint, bundled with
    // neighborhoodId (when both changed this cycle) into ONE update() call so
    // the pair is atomic — either both land or neither does.
    //
    // Failure is NOT swallowed: it throws, caught by this function's outer
    // try/catch below, which returns false. The caller (useOnboardingStore's
    // debounced sync) surfaces that as a toast via OnboardingSyncErrorToast.
    // The rest of the onboarding data from the main setDoc above is still
    // committed either way — only this authority/neighborhood pair is at
    // risk, and staying silent about that is exactly what let
    // core.authorityId / core.neighborhoodId drift to mismatched cities with
    // zero visible error previously.
    if (authorityIdToSync) {
      const authorityWriteOk = await updateUserAuthority(authorityIdToSync, neighborhoodIdToSync);
      if (!authorityWriteOk) {
        throw new Error('[OnboardingSync] updateUserAuthority failed — authorityId/neighborhoodId not persisted');
      }
    }

    // ── Kelly Welcome Bot (Phase 1) ───────────────────────────────────────
    // Seed the one-time Kelly greeting DM the moment onboarding completes.
    // Fire-and-forget + internally idempotent (hasWelcomeBotTriggered guard),
    // so it never blocks navigation and never duplicates on retries.
    if (step === 'COMPLETED') {
      void triggerKellyWelcomeBot(user.uid);
    }

    // Diagnostic: confirm what running data was saved
    if (step === 'COMPLETED' && sanitizedUpdateData.running) {
      const hasActiveProgram = !!sanitizedUpdateData.running.activeProgram?.schedule?.length;
      const hasTemplate = !!sanitizedUpdateData.running.generatedProgramTemplate;
      if (hasActiveProgram) {
        const schedLen = sanitizedUpdateData.running.activeProgram.schedule.length;
        console.log(`✅ [Onboarding] Active Program successfully saved to Firestore (${schedLen} workouts)`);
      } else if (hasTemplate) {
        console.warn('⚠️ [Onboarding] generatedProgramTemplate saved, but activeProgram is MISSING — workout templates could not be read from Firestore');
      }
    }

    // ─── Trigger Master Program Recalculation (if tracks exist) ────────────
    // This runs FIRE-AND-FORGET so it does NOT block router.replace('/home').
    // Rationale:
    //   • The operation is explicitly non-critical (will re-run on first workout).
    //   • Each of the 12+ track keys spawns a Firestore waterfall
    //     (getDocs + getDoc × N + updateDoc). Running them serially with `await`
    //     inside syncOnboardingToFirestore was the dominant cause of the 3-8 s lag
    //     between clicking the final CTA and seeing the Home screen.
    //   • We kick off all keys concurrently with Promise.all (not sequentially)
    //     to halve the Firestore round-trips even in the background.
    if (step === 'COMPLETED' && updateData.progression?.tracks) {
      const trackKeys = Object.keys(updateData.progression.tracks);
      console.log(
        `[OnboardingSync] Kicking off background master-level recalculation for ${trackKeys.length} tracks (non-blocking).`,
      );
      // Intentionally NOT awaited — navigation proceeds immediately.
      Promise.all(
        trackKeys.map((childProgramId) =>
          recalculateAncestorMasters(user.uid, childProgramId),
        ),
      )
        .then(() => {
          console.log('✅ [OnboardingSync] Background master program levels recalculated.');
        })
        .catch((masterErr) => {
          console.warn('[OnboardingSync] Background master recalculation failed (non-critical):', masterErr);
        });
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
  } catch (error: any) {
    console.error('[OnboardingSync] Error syncing to Firestore:', error);
    // PERMISSION-DENIED analysis: which rule clause is the likely culprit?
    if (error?.code === 'permission-denied' || String(error).includes('permission-denied')) {
      console.error('[OnboardingSync][DIAG] PERMISSION-DENIED — check browser console for the two [DIAG] logs above.');
      console.error('[OnboardingSync][DIAG] Rule checklist (UPDATE mode):');
      console.error('  1. noAdminFieldsChanged   → incoming core.role must equal stored core.role');
      console.error('  2. noTenantFieldsChanged  → incoming tenantId/unitId/authorityId must equal stored (or stored must be empty if rule allows initial write)');
      console.error('  3. noGameIntegrityFields  → incoming progression.globalLevel/XP/coins must equal stored (or stored progression map absent)');
      console.error('  4. noSocialGroupIdsChanged → incoming social.groupIds must equal stored (merge:true should preserve it)');
      console.error('  5. noLockedCoreFields     → ageGroup/birthDate must be absent from payload');
      console.error('[OnboardingSync][DIAG] Most likely: stored doc has no "progression" map but old rule required exact match (default 0) → rule fix in firestore.rules needed');
    }
    // Don't throw - onboarding sync failures shouldn't break the flow
    return false;
  }
}
