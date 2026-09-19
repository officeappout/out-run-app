/**
 * gateway-explore-map.service.ts
 *
 * Pure builder for the gateway's "explore map" profile write (gateway/page.tsx's
 * handleExploreMap). Framework-agnostic (no Firestore imports) so it can be unit
 * tested without a Firebase app.
 *
 * Guard rationale: handleExploreMap fires for ANY resolved uid, including an
 * already-onboarded returning user who lands on /gateway during the async
 * auto-redirect's lookup window (see docs/research/gateway-home-strength-card-investigation.md).
 * Returning `null` when a doc already exists mirrors the guarded pattern already
 * used by onboarding-sync.service.ts's own `!userDoc.exists()` branch and
 * firestore.service.ts's re-init branch — only a genuinely new user gets scaffolded.
 */

export interface ExploreMapProfileWrite {
  id: string;
  onboardingPath: 'MAP_ONLY';
  onboardingStatus: 'MAP_ONLY';
  onboardingProgress: 0;
  core: {
    name: string;
    initialFitnessTier: number;
    trackingMode: string;
    mainGoal: string;
    gender: string;
    weight: number;
    accessLevel: number;
    affiliations: unknown[];
    unlockedProgramIds: unknown[];
    isVerified: boolean;
  };
  progression: {
    globalLevel: number;
    globalXP: number;
    coins: number;
    totalCaloriesBurned: number;
    hasUnlockedAdvancedStats: boolean;
    domains: Record<string, unknown>;
    activePrograms: unknown[];
    unlockedBonusExercises: unknown[];
  };
  equipment: { home: unknown[]; office: unknown[]; outdoor: unknown[] };
  lifestyle: { hasDog: boolean; commute: { method: string; enableChallenges: boolean } };
  health: { injuries: unknown[]; connectedWatch: string };
  running: {
    isUnlocked: boolean;
    currentGoal: string;
    activeProgram: null;
    paceProfile: {
      basePace: number;
      profileType: number;
      qualityWorkoutsHistory: unknown[];
      qualityWorkoutCount: number;
      lastSelfCorrectionDate: null;
    };
  };
}

/**
 * Returns the full new-user scaffold when `existingUserData` is `undefined`
 * (doc doesn't exist yet — genuinely new guest), or `null` when a doc already
 * exists — the caller must skip the destructive setDoc (and the
 * `onboarding_path: 'MAP_ONLY'` local pref) in that case. `createdAt`/`updatedAt`
 * are intentionally NOT included here — the caller stamps those with
 * `serverTimestamp()` at write time, same as today.
 */
export function buildExploreMapProfileWrite(
  userId: string,
  existingUserData: Record<string, unknown> | undefined,
): ExploreMapProfileWrite | null {
  if (existingUserData) {
    return null;
  }

  return {
    id: userId,
    onboardingPath: 'MAP_ONLY',
    onboardingStatus: 'MAP_ONLY',
    onboardingProgress: 0,
    core: {
      name: '',
      initialFitnessTier: 1,
      trackingMode: 'wellness',
      mainGoal: 'healthy_lifestyle',
      gender: 'other',
      weight: 0,
      accessLevel: 1,
      affiliations: [],
      unlockedProgramIds: [],
      isVerified: false,
    },
    progression: {
      globalLevel: 1,
      globalXP: 0,
      coins: 0,
      totalCaloriesBurned: 0,
      hasUnlockedAdvancedStats: false,
      domains: {},
      activePrograms: [],
      unlockedBonusExercises: [],
    },
    equipment: { home: [], office: [], outdoor: [] },
    lifestyle: { hasDog: false, commute: { method: 'walk', enableChallenges: false } },
    health: { injuries: [], connectedWatch: 'none' },
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
  };
}
