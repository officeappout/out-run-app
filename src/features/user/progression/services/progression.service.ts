/**
 * Progression Service
 * Handles domain-specific progression tracking with unified master program view
 * 
 * Key Features:
 * - Base session gain per level
 * - Bonus percentage for exceeding target reps
 * - Linked programs (multi-program progression)
 * - Ready for Split detection
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  updateDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { UserFullProfile, TrainingDomainId } from '../../core/types/user.types';
import { 
  ProgressionRule, 
  DomainTrackProgress, 
  MasterProgramProgress,
  WorkoutCompletionData,
  WorkoutCompletionResult,
  WorkoutExerciseResult,
  ReadyForSplitStatus,
  VolumeBreakdown,
  DEFAULT_PROGRESSION_BY_LEVEL,
  LinkedProgramConfig,
  getDefaultRequiredSets,
  LevelEquivalenceRule,
  LevelEquivalenceResult,
} from '../../core/types/progression.types';
import { Program } from '@/features/content/programs';
import { getProgram } from '@/features/content/programs';

const PROGRAM_LEVEL_SETTINGS_COLLECTION = 'program_level_settings';
const PROGRESSION_RULES_COLLECTION = 'progression_rules';
const LEVEL_EQUIVALENCE_COLLECTION = 'level_equivalence_rules';
const PROGRAMS_COLLECTION = 'programs';
const USERS_COLLECTION = 'users';

// Threshold for "Ready for Split" recommendation
const READY_FOR_SPLIT_LEVEL = 10;
const READY_FOR_SPLIT_PROGRAMS = ['full_body'];

/**
 * Convert Firestore timestamp to Date
 */
function toDate(timestamp: Timestamp | Date | undefined): Date | undefined {
  if (!timestamp) return undefined;
  if (timestamp instanceof Date) return timestamp;
  return timestamp.toDate();
}

/**
 * Initialize default track progress for a domain
 */
function getDefaultTrackProgress(): DomainTrackProgress {
  return {
    currentLevel: 1,
    percent: 0,
  };
}

/**
 * Ensure progression.tracks exists and initialize missing domains
 */
function ensureTracksInitialized(progression: UserFullProfile['progression']): void {
  if (!progression.tracks) {
    progression.tracks = {};
  }
}

/**
 * Get ProgressionRule for a specific program and level
 */
async function getProgressionRule(
  programId: string,
  level: number
): Promise<ProgressionRule | null> {
  try {
    const q = query(
      collection(db, PROGRAM_LEVEL_SETTINGS_COLLECTION),
      where('programId', '==', programId),
      where('level', '==', level)
    );
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      return null;
    }

    const doc = snapshot.docs[0];
    return {
      id: doc.id,
      ...doc.data(),
      createdAt: toDate(doc.data().createdAt),
      updatedAt: toDate(doc.data().updatedAt),
    } as ProgressionRule;
  } catch (error) {
    console.error(`Error fetching progression rule for ${programId} level ${level}:`, error);
    return null;
  }
}

/**
 * Update user progression tracks in Firestore
 */
async function updateProgressionTracks(
  userId: string,
  tracks: { [programId: string]: DomainTrackProgress }
): Promise<boolean> {
  try {
    const userDocRef = doc(db, USERS_COLLECTION, userId);
    await updateDoc(userDocRef, {
      'progression.tracks': tracks,
      updatedAt: serverTimestamp(),
    });
    return true;
  } catch (error) {
    console.error('Error updating progression tracks:', error);
    return false;
  }
}

/**
 * Calculate session progress for exercises
 * 
 * @param userId - User ID
 * @param exercises - Array of exercises with programId (string or string[]), reps, and targetReps
 * @returns Promise<boolean> - Success status
 */
export async function calculateSessionProgress(
  userId: string,
  exercises: { programId: string | string[]; reps: number; targetReps: number }[]
): Promise<boolean> {
  try {
    // Fetch user profile
    const userDocRef = doc(db, USERS_COLLECTION, userId);
    const userDoc = await getDoc(userDocRef);

    if (!userDoc.exists()) {
      console.error('User not found:', userId);
      return false;
    }

    const userData = userDoc.data() as UserFullProfile;
    const progression = userData.progression;

    // Ensure tracks are initialized
    ensureTracksInitialized(progression);

    // Group exercises by domain
    const domainPerformance: Record<string, { totalReps: number; totalTargetReps: number; count: number }> = {};

    for (const exercise of exercises) {
      const programIds = Array.isArray(exercise.programId) ? exercise.programId : [exercise.programId];

      for (const programId of programIds) {
        if (!domainPerformance[programId]) {
          domainPerformance[programId] = {
            totalReps: 0,
            totalTargetReps: 0,
            count: 0,
          };
        }

        domainPerformance[programId].totalReps += exercise.reps;
        domainPerformance[programId].totalTargetReps += exercise.targetReps;
        domainPerformance[programId].count += 1;
      }
    }

    // Calculate average performance per domain and apply bonuses
    const updatedTracks = { ...progression.tracks };

    for (const [domain, performance] of Object.entries(domainPerformance)) {
      // Calculate average performance percentage
      const avgPerformance = performance.totalTargetReps > 0
        ? (performance.totalReps / performance.totalTargetReps) * 100
        : 0;

      // Initialize track if missing
      if (!updatedTracks[domain]) {
        updatedTracks[domain] = getDefaultTrackProgress();
      }

      const track = updatedTracks[domain];
      const currentLevel = track.currentLevel;

      // Fetch progression rule for bonus calculation
      const rule = await getProgressionRule(domain, currentLevel);
      const bonusPercent = rule?.bonusPercent || 0;

      // Calculate base progress (average performance as percentage)
      // Cap at 100% to prevent over-performance from giving excessive progress
      const baseProgress = Math.min(avgPerformance, 100);
      
      // Apply bonus: bonusPercent is a multiplier (e.g., 10 = 10% bonus)
      // Example: 80% performance with 10% bonus = 80% * 1.10 = 88% total progress
      const bonusAmount = (baseProgress * bonusPercent) / 100;
      const totalProgress = baseProgress + bonusAmount;

      // Add to existing percent
      track.percent = Math.min(track.percent + totalProgress, 100);

      // Check for level-up
      if (track.percent >= 100) {
        track.currentLevel += 1;
        track.percent = 0; // Reset percent after level-up
      }

      updatedTracks[domain] = track;
    }

    // Update Firestore
    await updateProgressionTracks(userId, updatedTracks);

    // Also update local progression object for consistency
    progression.tracks = updatedTracks;

    // ✅ Recalculate ancestor master programs for each updated domain
    try {
      for (const domain of Object.keys(domainPerformance)) {
        await recalculateAncestorMasters(userId, domain);
      }
    } catch (e) {
      console.error('[Progression] Failed to recalculate masters after session:', e);
    }

    return true;
  } catch (error) {
    console.error('Error calculating session progress:', error);
    return false;
  }
}

/**
 * Get master program progress (unified view) — recursive.
 * If a sub-program is itself a master program, its level is resolved recursively
 * before averaging. This supports multi-level hierarchies:
 *   Full Body → Upper Body (master) → Push / Pull
 *
 * @param userId - User ID
 * @param masterProgramId - Master program ID (e.g., "full_body")
 * @param _programCache - (internal) avoid re-fetching the same program
 * @returns Promise<MasterProgramProgress | null>
 */
export async function getMasterProgramProgress(
  userId: string,
  masterProgramId: string,
  _programCache?: Map<string, Program | null>,
): Promise<MasterProgramProgress | null> {
  const programCache = _programCache ?? new Map<string, Program | null>();

  try {
    // Fetch master program (use cache to prevent N+1 in recursive calls)
    let masterProgram = programCache.get(masterProgramId);
    if (masterProgram === undefined) {
      masterProgram = await getProgram(masterProgramId);
      programCache.set(masterProgramId, masterProgram ?? null);
    }
    if (!masterProgram || !masterProgram.isMaster) {
      console.error('Master program not found or not a master program:', masterProgramId);
      return null;
    }

    // Fetch user profile
    const userDocRef = doc(db, USERS_COLLECTION, userId);
    const userDoc = await getDoc(userDocRef);

    if (!userDoc.exists()) {
      console.error('User not found:', userId);
      return null;
    }

    const userData = userDoc.data() as UserFullProfile;
    const progression = userData.progression;

    // Ensure tracks are initialized
    ensureTracksInitialized(progression);

    // Get sub-programs
    const subProgramIds = masterProgram.subPrograms || [];
    if (subProgramIds.length === 0) {
      console.warn('Master program has no sub-programs:', masterProgramId);
      return null;
    }

    // Resolve each sub-program — may recurse if the child is also a master
    const subPrograms: { programId: string; level: number; percent: number }[] = [];
    let totalLevel = 0;
    let totalPercent = 0;

    for (const subProgramId of subProgramIds) {
      // Check if the sub-program is itself a master (multi-level hierarchy)
      let childProgram = programCache.get(subProgramId);
      if (childProgram === undefined) {
        childProgram = await getProgram(subProgramId);
        programCache.set(subProgramId, childProgram ?? null);
      }

      if (childProgram?.isMaster) {
        // Recursive: calculate the child-master's aggregated level
        const childMasterProgress = await getMasterProgramProgress(userId, subProgramId, programCache);
        const level = childMasterProgress?.displayLevel ?? 1;
        const percent = childMasterProgress?.displayPercent ?? 0;
        subPrograms.push({ programId: subProgramId, level, percent });
        totalLevel += level;
        totalPercent += percent;
      } else {
        // Leaf child — read directly from tracks
        const track = progression.tracks?.[subProgramId] || getDefaultTrackProgress();
        subPrograms.push({
          programId: subProgramId,
          level: track.currentLevel,
          percent: track.percent,
        });
        totalLevel += track.currentLevel;
        totalPercent += track.percent;
      }
    }

    // Calculate weighted average
    const domainCount = subProgramIds.length;
    const displayLevel = Math.floor(totalLevel / domainCount);
    const displayPercent = totalPercent / domainCount;

    return {
      displayLevel,
      displayPercent: Math.round(displayPercent * 100) / 100,
      subPrograms,
    };
  } catch (error) {
    console.error('Error getting master program progress:', error);
    return null;
  }
}

/**
 * Recalculate and persist a master program's level based on current child tracks.
 * This is called after any child track is updated (XP award, workout completion, etc.)
 * to keep the master-level view in sync.
 *
 * The result is written to `progression.tracks[masterProgramId]`.
 */
export async function recalculateMasterLevel(
  userId: string,
  masterProgramId: string,
): Promise<{ level: number; percent: number } | null> {
  const progress = await getMasterProgramProgress(userId, masterProgramId);
  if (!progress) return null;

  // Persist the aggregated level into the master program's own track
  const userDocRef = doc(db, USERS_COLLECTION, userId);
  await updateDoc(userDocRef, {
    [`progression.tracks.${masterProgramId}.currentLevel`]: progress.displayLevel,
    [`progression.tracks.${masterProgramId}.percent`]: progress.displayPercent,
    updatedAt: serverTimestamp(),
  });

  return { level: progress.displayLevel, percent: progress.displayPercent };
}

/**
 * Given a child programId, find all ancestor master programs that reference it
 * (directly or transitively) and recalculate their levels.
 */
export async function recalculateAncestorMasters(
  userId: string,
  childProgramId: string,
): Promise<void> {
  try {
    // Fetch all programs that list this child in subPrograms
    const q = query(
      collection(db, PROGRAMS_COLLECTION),
      where('isMaster', '==', true),
    );
    const snapshot = await getDocs(q);
    const masterPrograms = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Program));

    for (const master of masterPrograms) {
      if (master.subPrograms?.includes(childProgramId)) {
        await recalculateMasterLevel(userId, master.id);
        // Recurse upward in case this master is itself a child of a grand-master
        await recalculateAncestorMasters(userId, master.id);
      }
    }
  } catch (error) {
    console.error('Error recalculating ancestor masters:', error);
  }
}

// ============================================================================
// LEVEL EQUIVALENCE: Auto-map levels between programs
// ============================================================================

/**
 * Fetch all level equivalence rules that match a given source program and level.
 * Called after a child program levels up to check if any target programs should be unlocked/set.
 *
 * @param sourceProgramId - The program that just leveled up
 * @param sourceLevel - The new level reached
 * @returns Matching equivalence rules
 */
async function getLevelEquivalenceRules(
  sourceProgramId: string,
  sourceLevel: number,
): Promise<LevelEquivalenceRule[]> {
  try {
    const q = query(
      collection(db, LEVEL_EQUIVALENCE_COLLECTION),
      where('sourceProgramId', '==', sourceProgramId),
      where('sourceLevel', '<=', sourceLevel),
    );
    const snapshot = await getDocs(q);
    return snapshot.docs
      .map(d => ({ id: d.id, ...d.data() } as LevelEquivalenceRule))
      .filter(rule => rule.isEnabled !== false); // Enabled by default
  } catch (error) {
    console.error('[LevelEquivalence] Error fetching rules:', error);
    return [];
  }
}

/**
 * Apply level equivalence rules after a program levels up.
 * For each matching rule:
 *   - If the target track doesn't exist or is below the rule's targetLevel, set it.
 *   - Optionally add the target to activePrograms.
 *   - Recalculate ancestor masters for the target.
 *
 * @param userId - User ID
 * @param sourceProgramId - The program that leveled up
 * @param newSourceLevel - The new level reached in the source
 * @returns Array of applied equivalence results
 */
export async function applyLevelEquivalences(
  userId: string,
  sourceProgramId: string,
  newSourceLevel: number,
): Promise<LevelEquivalenceResult[]> {
  const results: LevelEquivalenceResult[] = [];

  try {
    const rules = await getLevelEquivalenceRules(sourceProgramId, newSourceLevel);
    if (rules.length === 0) return results;

    // Fetch user document once
    const userDocRef = doc(db, USERS_COLLECTION, userId);
    const userSnap = await getDoc(userDocRef);
    if (!userSnap.exists()) return results;

    const userData = userSnap.data() as UserFullProfile;
    const tracks = userData.progression?.tracks || {};
    const activePrograms = userData.progression?.activePrograms || [];

    const updates: Record<string, any> = {};
    let activeUpdated = false;
    const updatedActivePrograms = [...activePrograms];

    for (const rule of rules) {
      const currentTrack = tracks[rule.targetProgramId];
      const currentLevel = currentTrack?.currentLevel ?? 0;
      const wasNewlyUnlocked = !currentTrack;

      // Only apply if the target's current level is BELOW the rule's target
      if (currentLevel < rule.targetLevel) {
        updates[`progression.tracks.${rule.targetProgramId}.currentLevel`] = rule.targetLevel;
        updates[`progression.tracks.${rule.targetProgramId}.percent`] = rule.targetPercent ?? 0;

        // Add to activePrograms if requested and not already present
        if (rule.addToActivePrograms) {
          const alreadyActive = updatedActivePrograms.some(
            (p: any) => p.id === rule.targetProgramId || p.templateId === rule.targetProgramId,
          );
          if (!alreadyActive) {
            updatedActivePrograms.push({
              id: rule.targetProgramId,
              templateId: rule.targetProgramId,
              name: rule.targetProgramId.replace(/_/g, ' '),
              startDate: new Date().toISOString(),
              durationWeeks: 52,
              currentWeek: 1,
              focusDomains: [rule.targetProgramId] as any,
            });
            activeUpdated = true;
          }
        }

        results.push({
          ruleId: rule.id,
          targetProgramId: rule.targetProgramId,
          previousLevel: currentLevel,
          newLevel: rule.targetLevel,
          wasNewlyUnlocked,
        });

        console.log(
          `[LevelEquivalence] ${sourceProgramId} Lvl ${newSourceLevel} → ` +
          `${rule.targetProgramId} set to Lvl ${rule.targetLevel}` +
          (wasNewlyUnlocked ? ' (newly unlocked)' : ` (was Lvl ${currentLevel})`),
        );
      }
    }

    // Write all updates in one batch
    if (Object.keys(updates).length > 0) {
      updates['updatedAt'] = serverTimestamp();
      if (activeUpdated) {
        updates['progression.activePrograms'] = updatedActivePrograms;
      }
      await updateDoc(userDocRef, updates);

      // Recalculate master programs for each affected target
      for (const result of results) {
        await recalculateAncestorMasters(userId, result.targetProgramId);
      }
    }
  } catch (error) {
    console.error('[LevelEquivalence] Error applying rules:', error);
  }

  return results;
}

/**
 * Initialize progression tracks for a user with default values
 * 
 * @param userId - User ID
 * @param domains - Array of domain IDs to initialize
 * @returns Promise<boolean> - Success status
 */
export async function initializeProgressionTracks(
  userId: string,
  domains: string[]
): Promise<boolean> {
  try {
    const userDocRef = doc(db, USERS_COLLECTION, userId);
    const userDoc = await getDoc(userDocRef);

    if (!userDoc.exists()) {
      console.error('User not found:', userId);
      return false;
    }

    const userData = userDoc.data() as UserFullProfile;
    const progression = userData.progression;

    // Ensure tracks are initialized
    ensureTracksInitialized(progression);

    // Initialize missing domains
    const updatedTracks = { ...progression.tracks };
    let hasChanges = false;

    for (const domain of domains) {
      if (!updatedTracks[domain]) {
        updatedTracks[domain] = getDefaultTrackProgress();
        hasChanges = true;
      }
    }

    // Update Firestore if there were changes
    if (hasChanges) {
      await updateProgressionTracks(userId, updatedTracks);
    }

    return true;
  } catch (error) {
    console.error('Error initializing progression tracks:', error);
    return false;
  }
}

// ============================================================================
// NEW: WORKOUT COMPLETION PROCESSING WITH LINKED PROGRAMS
// ============================================================================

/**
 * Progression rule result with all settings including volume-based fields
 */
interface ProgressionRuleResult {
  baseSessionGain: number;
  bonusPercent: number;
  requiredSetsForFullGain: number;
  linkedPrograms: LinkedProgramConfig[];
}

/**
 * Get progression rule for a specific program and level
 * Falls back to defaults if no rule is defined
 */
async function getProgressionRuleForLevel(
  programId: string,
  level: number
): Promise<ProgressionRuleResult> {
  try {
    const ruleId = `${programId}_level_${level}`;
    const ruleDoc = await getDoc(doc(db, PROGRESSION_RULES_COLLECTION, ruleId));
    
    if (ruleDoc.exists()) {
      const data = ruleDoc.data();
      return {
        baseSessionGain: data.baseSessionGain || 10,
        bonusPercent: data.bonusPercent || 5,
        requiredSetsForFullGain: data.requiredSetsForFullGain || getDefaultRequiredSets(level),
        linkedPrograms: data.linkedPrograms || [],
      };
    }
    
    // Fallback to defaults
    const defaults = DEFAULT_PROGRESSION_BY_LEVEL[Math.min(level, 10)] || DEFAULT_PROGRESSION_BY_LEVEL[10];
    return {
      baseSessionGain: defaults.baseGain,
      bonusPercent: defaults.bonusPercent,
      requiredSetsForFullGain: getDefaultRequiredSets(level),
      linkedPrograms: [],
    };
  } catch (error) {
    console.error('Error fetching progression rule:', error);
    // Return safe defaults
    const defaults = DEFAULT_PROGRESSION_BY_LEVEL[Math.min(level, 10)] || DEFAULT_PROGRESSION_BY_LEVEL[10];
    return {
      baseSessionGain: defaults.baseGain,
      bonusPercent: defaults.bonusPercent,
      requiredSetsForFullGain: getDefaultRequiredSets(level),
      linkedPrograms: [],
    };
  }
}

/**
 * Detect linked programs from exercise programLevels
 * Returns programs that exist in the exercise's programLevels
 */
function detectLinkedProgramsFromExercises(
  exercises: WorkoutExerciseResult[],
  activeProgramId: string
): Set<string> {
  const linkedPrograms = new Set<string>();
  
  for (const exercise of exercises) {
    if (exercise.programLevels) {
      for (const programId of Object.keys(exercise.programLevels)) {
        if (programId !== activeProgramId && exercise.programLevels[programId] !== undefined) {
          linkedPrograms.add(programId);
        }
      }
    }
  }
  
  return linkedPrograms;
}

/**
 * Calculate total sets performed across all exercises
 */
function calculateTotalSetsPerformed(exercises: WorkoutExerciseResult[]): number {
  return exercises.reduce((sum, exercise) => sum + exercise.setsCompleted, 0);
}

/**
 * Calculate volume breakdown for Dopamine Screen display
 */
function calculateVolumeBreakdown(
  setsPerformed: number,
  requiredSets: number
): VolumeBreakdown {
  const volumeRatio = Math.min(1, setsPerformed / requiredSets);
  return {
    setsPerformed,
    requiredSets,
    volumeRatio,
    isFullVolume: volumeRatio >= 1,
  };
}

/**
 * Calculate performance ratio (actual vs target)
 */
function calculatePerformanceRatio(exercises: WorkoutExerciseResult[]): number {
  let totalActual = 0;
  let totalTarget = 0;
  
  for (const exercise of exercises) {
    const actualReps = exercise.repsPerSet.reduce((sum, r) => sum + r, 0);
    const targetReps = exercise.targetReps * exercise.setsCompleted;
    
    totalActual += actualReps;
    totalTarget += targetReps;
  }
  
  if (totalTarget === 0) return 1;
  return totalActual / totalTarget;
}

/**
 * Calculate volume contribution per linked program
 * Based on how many exercises from each program were performed
 */
function calculateVolumeContribution(
  exercises: WorkoutExerciseResult[],
  linkedProgramId: string
): number {
  let linkedExerciseCount = 0;
  let totalExerciseCount = exercises.length;
  
  for (const exercise of exercises) {
    if (exercise.programLevels && exercise.programLevels[linkedProgramId] !== undefined) {
      linkedExerciseCount++;
    }
  }
  
  if (totalExerciseCount === 0) return 0;
  return linkedExerciseCount / totalExerciseCount;
}

/**
 * Check if user is ready for split training
 */
function checkReadyForSplit(
  tracks: { [programId: string]: DomainTrackProgress },
  activeProgramId: string,
  newLevel: number
): ReadyForSplitStatus | undefined {
  // Only check for full_body program
  if (!READY_FOR_SPLIT_PROGRAMS.includes(activeProgramId)) {
    return undefined;
  }
  
  // Check if level threshold is reached
  if (newLevel >= READY_FOR_SPLIT_LEVEL) {
    return {
      isReady: true,
      triggeredAt: new Date(),
      suggestedSplit: ['upper_body', 'lower_body', 'push', 'pull', 'legs'],
    };
  }
  
  return undefined;
}

/**
 * Process workout completion with multi-program progression
 * 
 * This is the main function that:
 * 1. Calculates gain for the active program
 * 2. Detects linked programs from exercise data
 * 3. Applies proportional increases to linked programs
 * 4. Checks for "Ready for Split" threshold
 * 
 * @param data - Workout completion data
 * @returns Promise<WorkoutCompletionResult>
 */
export async function processWorkoutCompletion(
  data: WorkoutCompletionData
): Promise<WorkoutCompletionResult> {
  try {
    const { userId, activeProgramId, exercises, completedAt } = data;
    
    // Fetch user profile
    const userDocRef = doc(db, USERS_COLLECTION, userId);
    const userDoc = await getDoc(userDocRef);
    
    if (!userDoc.exists()) {
      throw new Error('User not found');
    }
    
    const userData = userDoc.data() as UserFullProfile;
    const progression = userData.progression;
    
    // Ensure tracks are initialized
    ensureTracksInitialized(progression);
    
    // Get current track for active program
    const currentTrack = progression.tracks?.[activeProgramId] || getDefaultTrackProgress();
    const currentLevel = currentTrack.currentLevel;
    
    // Get progression rule for this level
    const rule = await getProgressionRuleForLevel(activeProgramId, currentLevel);
    
    // Calculate total sets performed
    const setsPerformed = calculateTotalSetsPerformed(exercises);
    const requiredSets = rule.requiredSetsForFullGain;
    
    // Calculate volume ratio (capped at 1)
    const volumeRatio = Math.min(1, setsPerformed / requiredSets);
    
    // Calculate volume breakdown for Dopamine Screen
    const volumeBreakdown = calculateVolumeBreakdown(setsPerformed, requiredSets);
    
    // Calculate performance ratio for bonus
    const performanceRatio = calculatePerformanceRatio(exercises);
    
    // Calculate base gain using volume-based formula:
    // Session Progress = min(1, Sets Performed / requiredSetsForFullGain) × baseSessionGain
    const baseGain = volumeRatio * rule.baseSessionGain;
    
    // Apply bonus if exceeding target reps
    let bonusGain = 0;
    if (performanceRatio > 1) {
      const excessPercent = (performanceRatio - 1) * 100;
      // Bonus is also scaled by volume ratio
      bonusGain = Math.min(excessPercent * (rule.bonusPercent / 100), rule.bonusPercent) * volumeRatio;
    }
    
    const totalGain = baseGain + bonusGain;
    
    // Update active program track
    const updatedTracks = { ...progression.tracks };
    
    const newPercent = currentTrack.percent + totalGain;
    let leveledUp = false;
    let newLevel = currentLevel;
    
    if (newPercent >= 100) {
      // Level up!
      newLevel = currentLevel + 1;
      leveledUp = true;
      updatedTracks[activeProgramId] = {
        currentLevel: newLevel,
        percent: newPercent - 100, // Carry over excess
        lastWorkoutDate: completedAt,
        totalWorkoutsCompleted: (currentTrack.totalWorkoutsCompleted || 0) + 1,
      };
    } else {
      updatedTracks[activeProgramId] = {
        ...currentTrack,
        percent: newPercent,
        lastWorkoutDate: completedAt,
        totalWorkoutsCompleted: (currentTrack.totalWorkoutsCompleted || 0) + 1,
      };
    }
    
    // Process linked programs
    const linkedProgramGains: WorkoutCompletionResult['linkedProgramGains'] = [];
    
    // Get linked programs from rule AND detected from exercises
    const ruleLinkedPrograms = rule.linkedPrograms || [];
    const detectedLinkedPrograms = detectLinkedProgramsFromExercises(exercises, activeProgramId);
    
    // Combine linked programs (rule takes priority for multiplier)
    const allLinkedPrograms = new Map<string, number>();
    
    // Add rule-defined linked programs
    for (const lp of ruleLinkedPrograms) {
      allLinkedPrograms.set(lp.targetProgramId, lp.multiplier);
    }
    
    // Add detected linked programs with volume-based multiplier
    Array.from(detectedLinkedPrograms).forEach(programId => {
      if (!allLinkedPrograms.has(programId)) {
        const volumeContribution = calculateVolumeContribution(exercises, programId);
        // Default multiplier is 50% of volume contribution
        allLinkedPrograms.set(programId, volumeContribution * 0.5);
      }
    });
    
    // Apply gains to linked programs
    Array.from(allLinkedPrograms.entries()).forEach(([linkedProgramId, multiplier]) => {
      const linkedTrack = updatedTracks[linkedProgramId] || getDefaultTrackProgress();
      const linkedGain = totalGain * multiplier;
      
      const linkedNewPercent = linkedTrack.percent + linkedGain;
      let linkedLeveledUp = false;
      let linkedNewLevel = linkedTrack.currentLevel;
      
      if (linkedNewPercent >= 100) {
        linkedNewLevel = linkedTrack.currentLevel + 1;
        linkedLeveledUp = true;
        updatedTracks[linkedProgramId] = {
          currentLevel: linkedNewLevel,
          percent: linkedNewPercent - 100,
          lastWorkoutDate: completedAt,
          totalWorkoutsCompleted: (linkedTrack.totalWorkoutsCompleted || 0) + 1,
        };
      } else {
        updatedTracks[linkedProgramId] = {
          ...linkedTrack,
          percent: linkedNewPercent,
          lastWorkoutDate: completedAt,
          totalWorkoutsCompleted: (linkedTrack.totalWorkoutsCompleted || 0) + 1,
        };
      }
      
      linkedProgramGains.push({
        programId: linkedProgramId,
        gain: linkedGain,
        newPercent: linkedLeveledUp ? linkedNewPercent - 100 : linkedNewPercent,
        leveledUp: linkedLeveledUp,
        newLevel: linkedLeveledUp ? linkedNewLevel : undefined,
      });
    });
    
    // Save updated tracks to Firestore
    await updateProgressionTracks(userId, updatedTracks);

    // ✅ Recalculate all ancestor master programs after child track update
    // This keeps the Parent→Child hierarchy in sync (e.g., Push workout → Upper Body → Full Body)
    try {
      await recalculateAncestorMasters(userId, activeProgramId);
      // Also recalculate for linked programs that received gains
      for (const linked of linkedProgramGains) {
        await recalculateAncestorMasters(userId, linked.programId);
      }
    } catch (e) {
      console.error('[Progression] Failed to recalculate master levels:', e);
    }

    // ✅ LEVEL EQUIVALENCE: Check if any level-ups unlock/set levels in other programs
    // e.g., Push Lvl 15 → Planche Lvl 4
    try {
      if (leveledUp) {
        const equivalences = await applyLevelEquivalences(userId, activeProgramId, newLevel);
        if (equivalences.length > 0) {
          console.log(`[Progression] Level equivalences applied:`,
            equivalences.map(eq => `${eq.targetProgramId} → Lvl ${eq.newLevel}`).join(', '));
        }
      }
      // Also check linked programs that leveled up
      for (const linked of linkedProgramGains) {
        if (linked.leveledUp && linked.newLevel) {
          const linkedEquivalences = await applyLevelEquivalences(userId, linked.programId, linked.newLevel);
          if (linkedEquivalences.length > 0) {
            console.log(`[Progression] Linked equivalences applied:`,
              linkedEquivalences.map(eq => `${eq.targetProgramId} → Lvl ${eq.newLevel}`).join(', '));
          }
        }
      }
    } catch (e) {
      console.error('[Progression] Failed to apply level equivalences:', e);
    }
    
    // Check for Ready for Split
    const readyForSplit = checkReadyForSplit(updatedTracks, activeProgramId, newLevel);
    
    // If ready for split, save flag to user profile
    if (readyForSplit?.isReady) {
      await updateDoc(userDocRef, {
        'progression.readyForSplit': readyForSplit,
        updatedAt: serverTimestamp(),
      });
    }
    
    return {
      success: true,
      activeProgramGain: {
        programId: activeProgramId,
        baseGain,
        bonusGain,
        totalGain,
        newPercent: leveledUp ? newPercent - 100 : newPercent,
        leveledUp,
        newLevel: leveledUp ? newLevel : undefined,
      },
      linkedProgramGains,
      volumeBreakdown,
      readyForSplit,
    };
    
  } catch (error) {
    console.error('Error processing workout completion:', error);
    return {
      success: false,
      activeProgramGain: {
        programId: data.activeProgramId,
        baseGain: 0,
        bonusGain: 0,
        totalGain: 0,
        newPercent: 0,
        leveledUp: false,
      },
      linkedProgramGains: [],
      volumeBreakdown: {
        setsPerformed: 0,
        requiredSets: 4,
        volumeRatio: 0,
        isFullVolume: false,
      },
    };
  }
}

/**
 * Get user's ready for split status
 */
export async function getReadyForSplitStatus(userId: string): Promise<ReadyForSplitStatus | null> {
  try {
    const userDocRef = doc(db, USERS_COLLECTION, userId);
    const userDoc = await getDoc(userDocRef);
    
    if (!userDoc.exists()) {
      return null;
    }
    
    const userData = userDoc.data() as UserFullProfile & { progression?: { readyForSplit?: ReadyForSplitStatus } };
    return userData.progression?.readyForSplit || null;
  } catch (error) {
    console.error('Error getting ready for split status:', error);
    return null;
  }
}

/**
 * Dismiss ready for split recommendation
 */
export async function dismissReadyForSplit(userId: string): Promise<boolean> {
  try {
    const userDocRef = doc(db, USERS_COLLECTION, userId);
    await updateDoc(userDocRef, {
      'progression.readyForSplit.isReady': false,
      'progression.readyForSplit.dismissedAt': serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return true;
  } catch (error) {
    console.error('Error dismissing ready for split:', error);
    return false;
  }
}
