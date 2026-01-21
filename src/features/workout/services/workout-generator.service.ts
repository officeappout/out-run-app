/**
 * Workout Generator Service
 * Generates exercise plans based on user level and active program
 * Handles Master Programs with hidden sub-level tracking
 * Checks exercise requirements (gym equipment and user gear)
 */
import { UserFullProfile } from '@/types/user-profile';
import { TrainingDomainId } from '@/types/user-profile';
import { getPrograms, ProgramDoc } from '@/features/admin/services/questionnaire.service';
import { Exercise as ExerciseDoc, ExecutionMethod, ExecutionLocation, RequiredGearType, getLocalizedText } from '@/types/exercise.type';
import { Park } from '@/types/admin-types';
import { getAllGearDefinitions } from '@/features/admin/services/gear-definition.service';
import { GearDefinition } from '@/types/gear-definition.type';

export interface Exercise {
  id: string;
  name: string;
  domain: TrainingDomainId;
  difficulty: number; // 1-5
  equipment?: string[];
  selectedExecutionMethod?: ExecutionMethod; // The execution method selected for this exercise
}

export interface WorkoutPlan {
  id: string;
  name: string;
  exercises: Exercise[];
  estimatedDuration: number; // minutes
  focusDomains: TrainingDomainId[];
}

export type WorkoutIntensity = 'high' | 'normal' | 'low';

/**
 * Get user's effective level for a specific domain
 * For Master Programs, uses hidden sub-levels; otherwise uses domain level
 */
export function getUserEffectiveLevel(
  userProfile: UserFullProfile,
  domain: TrainingDomainId
): number {
  const activeProgram = userProfile.progression.activePrograms?.[0];
  
  // If no active program, use domain level directly
  if (!activeProgram) {
    return userProfile.progression.domains[domain]?.currentLevel || 1;
  }

  // Check if active program is a Master Program
  // We'll need to fetch program details to check isMaster
  // For now, assume we can check via programId lookup
  
  // If Master Program, check for hidden sub-levels
  const masterSubLevels = userProfile.progression.masterProgramSubLevels?.[activeProgram.id];
  
  if (masterSubLevels) {
    // Map domain to sub-level key
    if (domain === 'upper_body' && masterSubLevels.upper_body_level !== undefined) {
      return masterSubLevels.upper_body_level;
    }
    if (domain === 'lower_body' && masterSubLevels.lower_body_level !== undefined) {
      return masterSubLevels.lower_body_level;
    }
    if (domain === 'core' && masterSubLevels.core_level !== undefined) {
      return masterSubLevels.core_level;
    }
  }

  // Fallback to domain level
  return userProfile.progression.domains[domain]?.currentLevel || 1;
}

/**
 * Generate workout plan based on user profile and active program
 * @param userProfile - User profile with equipment and progression
 * @param targetDuration - Target workout duration in minutes
 * @param park - Optional park data to check gym equipment availability
 */
export async function generateWorkoutPlan(
  userProfile: UserFullProfile,
  targetDuration?: number,
  park?: Park | null,
  intensity: WorkoutIntensity = 'normal'
): Promise<WorkoutPlan | null> {
  const activeProgram = userProfile.progression.activePrograms?.[0];
  
  if (!activeProgram) {
    // No active program - use default domain levels
    return generateDefaultWorkout(userProfile, targetDuration, park, intensity);
  }

  // Fetch program details to check if it's a Master Program
  let programDoc: ProgramDoc | null = null;
  try {
    const programs = await getPrograms();
    programDoc = programs.find(p => p.id === activeProgram.id) || null;
  } catch (error) {
    console.error('Error fetching program details:', error);
  }

  const isMasterProgram = programDoc?.isMaster === true;

  if (isMasterProgram && programDoc?.subPrograms) {
    // ✅ Master Program Logic: Mix exercises from sub-programs
    return generateMasterProgramWorkout(userProfile, programDoc, targetDuration, park, intensity);
  } else {
    // Regular program: use focusDomains from activeProgram
    return generateRegularProgramWorkout(userProfile, activeProgram, targetDuration, park, intensity);
  }
}

/**
 * Generate workout for Master Program (e.g., "Full Body")
 * Picks exercises from sub-programs based on hidden sub-levels
 */
async function generateMasterProgramWorkout(
  userProfile: UserFullProfile,
  masterProgram: ProgramDoc,
  targetDuration?: number,
  park?: Park | null,
  intensity: WorkoutIntensity = 'normal'
): Promise<WorkoutPlan> {
  const subLevels = userProfile.progression.masterProgramSubLevels?.[masterProgram.id] || {};
  
  // Determine focus domains from sub-programs
  const focusDomains: TrainingDomainId[] = [];
  if (masterProgram.subPrograms?.includes('upper_body')) {
    focusDomains.push('upper_body');
  }
  if (masterProgram.subPrograms?.includes('lower_body')) {
    focusDomains.push('lower_body');
  }
  if (masterProgram.subPrograms?.includes('core')) {
    focusDomains.push('core');
  }

  // Default to all if no sub-programs specified
  if (focusDomains.length === 0) {
    focusDomains.push('upper_body', 'lower_body', 'core');
  }

  // Generate exercises for each domain using hidden sub-levels
  const exercises: Exercise[] = [];
  
  for (const domain of focusDomains) {
    const effectiveLevel = getUserEffectiveLevel(userProfile, domain);
    const domainExercises = await fetchExercisesForDomain(domain, effectiveLevel, park, userProfile, intensity);
    exercises.push(...domainExercises);
  }

  // Mix exercises (alternate between domains for variety)
  const mixedExercises = mixExercisesByDomain(exercises, focusDomains);

  return {
    id: `workout-${Date.now()}`,
    name: masterProgram.name || 'Full Body Workout',
    exercises: mixedExercises,
    estimatedDuration: targetDuration || 45,
    focusDomains,
  };
}

/**
 * Generate workout for regular (non-master) program
 */
async function generateRegularProgramWorkout(
  userProfile: UserFullProfile,
  activeProgram: any,
  targetDuration?: number,
  park?: Park | null,
  intensity: WorkoutIntensity = 'normal'
): Promise<WorkoutPlan> {
  const focusDomains = activeProgram.focusDomains || ['full_body'];
  const exercises: Exercise[] = [];

  for (const domain of focusDomains) {
    const effectiveLevel = getUserEffectiveLevel(userProfile, domain);
    const domainExercises = await fetchExercisesForDomain(domain, effectiveLevel, park, userProfile, intensity);
    exercises.push(...domainExercises);
  }

  return {
    id: `workout-${Date.now()}`,
    name: activeProgram.name || 'Workout',
    exercises,
    estimatedDuration: targetDuration || 45,
    focusDomains,
  };
}

/**
 * Generate default workout when no program is active
 */
async function generateDefaultWorkout(
  userProfile: UserFullProfile,
  targetDuration?: number,
  park?: Park | null,
  intensity: WorkoutIntensity = 'normal'
): Promise<WorkoutPlan> {
  const defaultDomains: TrainingDomainId[] = ['full_body', 'core'];
  const exercises: Exercise[] = [];

  for (const domain of defaultDomains) {
    const level = userProfile.progression.domains[domain]?.currentLevel || 1;
    const domainExercises = await fetchExercisesForDomain(domain, level, park, userProfile, intensity);
    exercises.push(...domainExercises);
  }

  return {
    id: `workout-${Date.now()}`,
    name: 'Default Workout',
    exercises,
    estimatedDuration: targetDuration || 45,
    focusDomains: defaultDomains,
  };
}

/**
 * Select the best execution method for an exercise based on context
 * Returns the selected execution method or null if none available
 * 
 * Priority logic:
 * 1. At home: user_gear > improvised
 * 2. At park: fixed_equipment > user_gear > improvised
 * 3. On street: user_gear > improvised
 */
// Cache for gear definitions (to avoid repeated fetches)
let gearDefinitionsCache: GearDefinition[] | null = null;

async function getGearDefinitions(): Promise<GearDefinition[]> {
  if (!gearDefinitionsCache) {
    try {
      gearDefinitionsCache = await getAllGearDefinitions();
    } catch (error) {
      console.error('Error loading gear definitions:', error);
      gearDefinitionsCache = [];
    }
  }
  return gearDefinitionsCache;
}

export async function selectExecutionMethod(
  exercise: ExerciseDoc,
  location: ExecutionLocation,
  park: Park | null,
  userProfile: UserFullProfile
): Promise<ExecutionMethod | null> {
  if (!exercise.execution_methods || exercise.execution_methods.length === 0) {
    return null; // No execution methods defined
  }

  // Filter methods by location
  const locationMethods = exercise.execution_methods.filter((m) => m.location === location);
  if (locationMethods.length === 0) {
    return null; // No methods for this location
  }

  // Priority order based on location
  let priorityOrder: RequiredGearType[];
  if (location === 'home' || location === 'office' || location === 'school') {
    // At home / office / school: prioritize user gear, then improvised
    priorityOrder = ['user_gear', 'improvised'];
  } else if (location === 'park' || location === 'gym') {
    // At park or gym: prioritize fixed equipment, then user gear, then improvised
    priorityOrder = ['fixed_equipment', 'user_gear', 'improvised'];
  } else {
    // On street and other outdoor contexts: prioritize user gear, then improvised
    priorityOrder = ['user_gear', 'improvised'];
  }

  // Try each priority in order
  for (const gearType of priorityOrder) {
    const methodsOfType = locationMethods.filter((m) => m.requiredGearType === gearType);

    for (const method of methodsOfType) {
      if (method.requiredGearType === 'fixed_equipment' && method.gearId) {
        // Check if park has this equipment
        if (park && park.gymEquipment) {
          const hasEquipment = park.gymEquipment.some(
            (eq) => eq.equipmentId === method.gearId
          );
          if (hasEquipment) {
            return method; // Found matching park equipment
          }
        }
      } else if (method.requiredGearType === 'user_gear' && method.gearId) {
        // Check if user has this gear
        // TODO: Implement proper gear checking
        // Option 1: Add userGearIds: string[] to UserFullProfile
        // Option 2: Map gear IDs to EquipmentProfile boolean fields
        // For "Door Pull-up Bar" example:
        // const userGearIds = userProfile.userGearIds || [];
        // if (userGearIds.includes(method.gearId)) {
        //   return method;
        // }
        
        // Placeholder: For now, return method (you should implement actual check)
        // The system will prioritize user_gear methods when at home
        return method;
      } else if (method.requiredGearType === 'improvised' && method.gearId) {
        // Improvised items are always available (door, chair, wall, etc.)
        return method;
      }
    }
  }

  return null; // No suitable method found
}

/**
 * Check if an exercise can be performed based on alternative requirements
 * Checks requirements in priority order (1, 2, 3) and returns true if ANY requirement is met
 */
export async function canPerformExercise(
  exercise: ExerciseDoc,
  park: Park | null,
  userProfile: UserFullProfile,
  location: ExecutionLocation = 'park'
): Promise<boolean> {
  // First check if we can select an execution method
  const executionMethod = await selectExecutionMethod(exercise, location, park, userProfile);
  if (executionMethod) {
    return true; // Found a suitable execution method
  }
  // If exercise has alternative requirements, check them in priority order
  if (exercise.alternativeEquipmentRequirements && exercise.alternativeEquipmentRequirements.length > 0) {
    // Sort by priority (1 = highest, 2 = medium, 3 = lowest)
    const sortedRequirements = [...exercise.alternativeEquipmentRequirements].sort(
      (a, b) => a.priority - b.priority
    );

    // Check each requirement in priority order - return true if ANY is met
    for (const requirement of sortedRequirements) {
      if (requirement.type === 'gym_equipment' && requirement.equipmentId) {
        // Priority 1: Check if park has the specific gym equipment
        if (park && park.gymEquipment) {
          const hasEquipment = park.gymEquipment.some(
            (eq) => eq.equipmentId === requirement.equipmentId
          );
          if (hasEquipment) {
            return true; // Found a match - exercise can be performed
          }
        }
      } else if (requirement.type === 'urban_asset' && requirement.urbanAssetName) {
        // Priority 2: Generic urban assets are generally available
        // Urban assets like "Street Bench", "Park Step", "Stairs" are assumed to be available
        // You can add more specific logic here if needed (e.g., check park facilities)
        const assetName = requirement.urbanAssetName.toLowerCase();
        if (assetName.includes('bench') ||
            assetName.includes('step') ||
            assetName.includes('stairs') ||
            assetName.includes('wall') ||
            assetName.includes('bar')) {
          return true; // Generic urban assets are available
        }
        // If it's a recognized urban asset name, consider it available
        // You can extend this list or add a proper urban assets collection
        return true; // Default: assume urban assets are available
      } else if (requirement.type === 'user_gear' && requirement.gearId) {
        // Priority 3: Check if user has the required gear
        // TODO: Implement proper gear checking
        // For now, we'll need to add userGearIds to UserFullProfile or map to EquipmentProfile
        // Placeholder: Assume user has gear (you should implement actual check)
        // const userGearIds = userProfile.userGearIds || [];
        // if (userGearIds.includes(requirement.gearId)) {
        //   return true;
        // }
        // For now, return true as placeholder
        return true;
      }
    }

    // If we've checked all requirements and none matched, return false
    return false;
  }

  // Legacy support: Check old requiredGymEquipment and requiredUserGear fields
  if (exercise.requiredGymEquipment) {
    if (!park || !park.gymEquipment) {
      return false;
    }
    const hasEquipment = park.gymEquipment.some(
      (eq) => eq.equipmentId === exercise.requiredGymEquipment
    );
    if (!hasEquipment) {
      return false;
    }
  }

  if (exercise.requiredUserGear && exercise.requiredUserGear.length > 0) {
    // TODO: Implement proper gear checking for legacy field
    // Placeholder: Return true for now
  }

  return true; // All requirements met (or no requirements)
}

/**
 * Get the minimum entry level (minLevel) for an exercise based on targetPrograms.
 * If the exercise has targetPrograms matching the user's active program, use that level as the anchor.
 * Otherwise, default to Level 1.
 */
function getExerciseMinLevel(
  exercise: ExerciseDoc,
  activeProgramId?: string
): number {
  // If exercise has targetPrograms and user has an active program, check for a match
  if (exercise.targetPrograms && activeProgramId) {
    const matchingTarget = exercise.targetPrograms.find(
      (tp) => tp.programId === activeProgramId
    );
    if (matchingTarget) {
      return matchingTarget.level; // Use the program-specific level as minLevel anchor
    }
  }
  // Default to Level 1 if no targetPrograms match
  return 1;
}

/**
 * Fetch exercises for a specific domain and user level.
 * Anchor-based selection:
 * - Safety: only exercises where minLevel <= userLevel + 1 (minimum-entry-level rule)
 * - Intensity buckets (relativeDifficulty = minLevel - userLevel):
 *   - high:   minLevel between userLevel and userLevel + 1 (inclusive)
 *   - normal: minLevel between userLevel - 2 and userLevel (inclusive)
 *   - low:    minLevel between userLevel - 5 and userLevel - 3 (inclusive)
 */
async function fetchExercisesForDomain(
  domain: TrainingDomainId,
  userLevel: number,
  park?: Park | null,
  userProfile?: UserFullProfile,
  intensity: WorkoutIntensity = 'normal'
): Promise<Exercise[]> {
  // TODO: Replace with actual Firestore query to exercises collection
  // Filter by:
  // 1. programIds includes domain OR programIds is empty
  // 2. minLevel (from targetPrograms or recommendedLevel) <= userLevel + 1
  // 3. canPerformExercise(exercise, park, userProfile) === true
  
  const activeProgramId = userProfile?.progression.activePrograms?.[0]?.templateId || 
                          userProfile?.progression.activePrograms?.[0]?.id;
  
  // Placeholder exercises
  const allExercises: ExerciseDoc[] = [
    {
      id: `ex-${domain}-${userLevel}-1`,
      name: { he: `${domain} Exercise 1`, en: `${domain} Exercise 1` },
      type: 'reps',
      loggingMode: 'reps',
      equipment: [],
      muscleGroups: [],
      programIds: [domain],
      media: {},
      content: {},
      stats: { views: 0 },
      targetPrograms: activeProgramId ? [{ programId: activeProgramId, level: Math.min(userLevel, 5) }] : undefined,
    },
    {
      id: `ex-${domain}-${userLevel}-2`,
      name: { he: `${domain} Exercise 2`, en: `${domain} Exercise 2` },
      type: 'reps',
      loggingMode: 'reps',
      equipment: [],
      muscleGroups: [],
      programIds: [domain],
      media: {},
      content: {},
      stats: { views: 0 },
      targetPrograms: activeProgramId ? [{ programId: activeProgramId, level: Math.min(userLevel, 5) }] : undefined,
    },
  ];

  // Safety guard: only allow exercises where minLevel <= userLevel + 1
  const safeExercises = allExercises.filter((ex) => {
    const minLevel = getExerciseMinLevel(ex, activeProgramId);
    return minLevel <= userLevel + 1;
  });

  const matchesIntensity = (minLevel: number): boolean => {
    switch (intensity) {
      case 'high':
        // minLevel between userLevel and userLevel + 1 (inclusive)
        return minLevel >= userLevel && minLevel <= userLevel + 1;
      case 'low':
        // minLevel between userLevel - 5 and userLevel - 3 (inclusive)
        return minLevel >= userLevel - 5 && minLevel <= userLevel - 3;
      case 'normal':
      default:
        // minLevel between userLevel - 2 and userLevel (inclusive)
        return minLevel >= userLevel - 2 && minLevel <= userLevel;
    }
  };

  const intensityFiltered = safeExercises.filter((ex) => {
    const minLevel = getExerciseMinLevel(ex, activeProgramId);
    return matchesIntensity(minLevel);
  });

  // If no exercises match the intensity bucket, fall back to the safe pool
  const candidateExercises = intensityFiltered.length > 0 ? intensityFiltered : safeExercises;

  // Filter exercises based on requirements if park and userProfile are provided
  if (park && userProfile) {
    // Determine location based on context (you can pass this as parameter)
    const location: ExecutionLocation = park ? 'park' : 'street';
    
    const filteredExercises: Exercise[] = [];
    for (const ex of candidateExercises) {
      const canPerform = await canPerformExercise(ex, park, userProfile, location);
      if (canPerform) {
        const selectedMethod = await selectExecutionMethod(ex, location, park, userProfile);
        filteredExercises.push({
          id: ex.id,
          name: getLocalizedText(ex.name, 'he'),
          domain,
          difficulty: getExerciseMinLevel(ex, activeProgramId),
          equipment: ex.equipment,
          selectedExecutionMethod: selectedMethod || undefined,
        });
      }
    }
    return filteredExercises;
  }

  // Return all candidates if no filtering needed
  return candidateExercises.map((ex) => ({
    id: ex.id,
    name: getLocalizedText(ex.name, 'he'),
    domain,
    difficulty: getExerciseMinLevel(ex, activeProgramId),
    equipment: ex.equipment,
  }));
}

/**
 * Mix exercises by alternating between domains for variety
 */
function mixExercisesByDomain(
  exercises: Exercise[],
  domains: TrainingDomainId[]
): Exercise[] {
  const byDomain: Record<string, Exercise[]> = {};
  
  for (const domain of domains) {
    byDomain[domain] = exercises.filter(e => e.domain === domain);
  }

  const mixed: Exercise[] = [];
  const maxLength = Math.max(...domains.map(d => byDomain[d]?.length || 0));

  for (let i = 0; i < maxLength; i++) {
    for (const domain of domains) {
      if (byDomain[domain]?.[i]) {
        mixed.push(byDomain[domain][i]);
      }
    }
  }

  return mixed;
}

/**
 * Calculate Global Level for beginners (Level 1-5)
 * Uses average or lowest of sub-levels for Master Programs
 */
export function calculateGlobalLevelForDisplay(
  userProfile: UserFullProfile
): number {
  const activeProgram = userProfile.progression.activePrograms?.[0];
  
  if (!activeProgram) {
    // No program: use average of all domain levels
    const domainLevels = Object.values(userProfile.progression.domains)
      .map(d => d?.currentLevel || 1);
    return Math.round(domainLevels.reduce((a, b) => a + b, 0) / domainLevels.length);
  }

  // Check if Master Program
  // For now, check if masterProgramSubLevels exist
  const subLevels = userProfile.progression.masterProgramSubLevels?.[activeProgram.id];
  
  if (subLevels) {
    // Master Program: use average or lowest of sub-levels
    const subLevelValues = [
      subLevels.upper_body_level,
      subLevels.lower_body_level,
      subLevels.core_level,
    ].filter((v): v is number => v !== undefined);

    if (subLevelValues.length > 0) {
      const average = Math.round(
        subLevelValues.reduce((a, b) => a + b, 0) / subLevelValues.length
      );
      const lowest = Math.min(...subLevelValues);
      
      // For beginners (Level 1-5), show the lowest to avoid overwhelming
      // For advanced (Level 6+), show average
      return average <= 5 ? lowest : average;
    }
  }

  // Fallback: use average of all domains
  const domainLevels = Object.values(userProfile.progression.domains)
    .map(d => d?.currentLevel || 1);
  return Math.round(domainLevels.reduce((a, b) => a + b, 0) / domainLevels.length);
}
