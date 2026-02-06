/**
 * Workout Generator Service
 * Generates exercise plans based on user level and active program
 * Handles Master Programs with hidden sub-level tracking
 * Checks exercise requirements (gym equipment and user gear)
 */
import { UserFullProfile } from '@/types/user-profile';
import { TrainingDomainId } from '@/types/user-profile';
import { getPrograms, ProgramDoc } from '@/features/admin/services/questionnaire.service';
import { Exercise as ExerciseDoc, ExecutionMethod, ExecutionLocation, RequiredGearType, getLocalizedText } from '@/features/content/exercises';
import { Park } from '@/types/admin-types';
import { getAllGearDefinitions } from '@/features/content/equipment/gear';
import { GearDefinition } from '@/features/content/equipment/gear';
import { getAllGymEquipment, GymEquipment } from '@/features/content/equipment/gym';

export interface Exercise {
  id: string;
  name: string;
  domain: TrainingDomainId;
  difficulty: number; // 1-5
  equipment?: string[];
  selectedExecutionMethod?: ExecutionMethod; // The execution method selected for this exercise
  matchesUserEquipment?: boolean; // Whether this exercise was selected because of user-owned equipment
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

/**
 * Infer user lifestyle tags from profile
 */
function inferUserLifestyleTags(userProfile: UserFullProfile): string[] {
  const tags: string[] = [];
  
  // Check core.mainGoal for lifestyle hints
  if (userProfile.core.mainGoal === 'healthy_lifestyle') {
    tags.push('athlete');
  }
  
  // Check lifestyle.commute for office worker
  if (userProfile.lifestyle?.commute?.method === 'car' || 
      userProfile.lifestyle?.commute?.method === 'bus') {
    tags.push('office_worker');
  }
  
  // Check if user has schedule (might indicate student/parent)
  if (userProfile.lifestyle?.scheduleDays && userProfile.lifestyle.scheduleDays.length > 0) {
    // Could be student or parent - we'll match both
    tags.push('student', 'parent');
  }
  
  return tags;
}

/**
 * Check if user owns specific equipment
 */
function userOwnsEquipment(equipmentId: string, userProfile: UserFullProfile): boolean {
  if (!userProfile.equipment) return false;
  
  const allOwnedEquipment = [
    ...(userProfile.equipment.home || []),
    ...(userProfile.equipment.office || []),
    ...(userProfile.equipment.outdoor || []),
  ];
  
  return allOwnedEquipment.includes(equipmentId);
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

  // Get user lifestyle tags
  const userLifestyleTags = inferUserLifestyleTags(userProfile);

  // Step 1: Filter methods by locationMapping (if specified) OR location
  const locationFilteredMethods = exercise.execution_methods.filter((m) => {
    if (m.locationMapping && m.locationMapping.length > 0) {
      return m.locationMapping.includes(location);
    }
    // Fallback to old location field for backward compatibility
    return m.location === location;
  });

  if (locationFilteredMethods.length === 0) {
    return null; // No methods for this location
  }

  // Step 2: Filter by lifestyle tags (if specified)
  const lifestyleFilteredMethods = locationFilteredMethods.filter((m) => {
    if (!m.lifestyleTags || m.lifestyleTags.length === 0) {
      return true; // No lifestyle filter means available to all
    }
    // Method is available if user has at least one matching lifestyle tag
    return m.lifestyleTags.some(tag => userLifestyleTags.includes(tag));
  });

  // Step 3: Filter by equipment availability
  const equipmentFilteredMethods = lifestyleFilteredMethods.filter((m) => {
    // If method has specific equipmentId, check if user owns it
    if (m.equipmentId) {
      return userOwnsEquipment(m.equipmentId, userProfile);
    }
    // If no equipmentId specified, method is available
    return true;
  });

  // Use equipment-filtered methods if available, otherwise fall back to lifestyle-filtered
  const candidateMethods = equipmentFilteredMethods.length > 0 
    ? equipmentFilteredMethods 
    : lifestyleFilteredMethods;

  if (candidateMethods.length === 0) {
    return null;
  }

  // Step 4: Priority order based on location and gear type
  let priorityOrder: RequiredGearType[];
  if (location === 'home' || location === 'office' || location === 'school') {
    priorityOrder = ['user_gear', 'improvised'];
  } else if (location === 'park' || location === 'gym') {
    priorityOrder = ['fixed_equipment', 'user_gear', 'improvised'];
  } else {
    priorityOrder = ['user_gear', 'improvised'];
  }

  // Try each priority in order
  for (const gearType of priorityOrder) {
    const methodsOfType = candidateMethods.filter((m) => m.requiredGearType === gearType);

    for (const method of methodsOfType) {
      // Use new array-based gearIds/equipmentIds, with fallback to legacy single fields
      const gearIdsToCheck = method.gearIds?.length ? method.gearIds : (method.gearId ? [method.gearId] : []);
      const equipmentIdsToCheck = method.equipmentIds?.length ? method.equipmentIds : (method.equipmentId ? [method.equipmentId] : []);
      const allEquipmentIds = [...equipmentIdsToCheck, ...gearIdsToCheck];
      
      if (method.requiredGearType === 'fixed_equipment' && allEquipmentIds.length > 0) {
        // Check if park has ANY of the required equipment
        if (park && park.gymEquipment && park.gymEquipment.length > 0) {
          const parkGymEquipment = park.gymEquipment; // Capture for TypeScript
          const hasEquipment = allEquipmentIds.some(id =>
            parkGymEquipment.some((eq) => eq.equipmentId === id)
          );
          if (hasEquipment) {
            return method; // Found matching park equipment
          }
        }
      } else if (method.requiredGearType === 'user_gear' && gearIdsToCheck.length > 0) {
        // Check if user has ANY of the required gear
        const userHasGear = gearIdsToCheck.some(id => userOwnsGear(id, userProfile));
        if (userHasGear) {
          return method;
        }
      } else if (method.requiredGearType === 'improvised' && gearIdsToCheck.length > 0) {
        // Improvised items are always available
        return method;
      }
    }
  }

  // Fallback: return first available method if no priority match
  return candidateMethods[0] || null;
}

/**
 * Map ExecutionLocation to EquipmentLocation
 */
function mapExecutionLocationToEquipmentLocation(location: ExecutionLocation): 'home' | 'park' | 'office' | 'gym' {
  switch (location) {
    case 'home':
      return 'home';
    case 'park':
    case 'street':
      return 'park';
    case 'office':
    case 'school':
      return 'office';
    case 'gym':
      return 'gym';
    default:
      return 'park';
  }
}

/**
 * Check if equipment is available in the given location
 */
async function isEquipmentAvailableInLocation(
  equipmentId: string,
  location: ExecutionLocation
): Promise<boolean> {
  try {
    const allEquipment = await getAllGymEquipment();
    const equipment = allEquipment.find(eq => eq.id === equipmentId);
    if (!equipment) return false;
    
    const equipmentLocation = mapExecutionLocationToEquipmentLocation(location);
    return equipment.availableInLocations?.includes(equipmentLocation) ?? true; // Default to true if not specified
  } catch (error) {
    console.error('Error checking equipment availability:', error);
    return true; // Default to available on error
  }
}

/**
 * Check if user owns the required gear
 */
function userOwnsGear(gearId: string, userProfile: UserFullProfile): boolean {
  // Check if gearId is in user's equipment profile
  const equipment = userProfile.equipment;
  if (!equipment) return false;
  
  // Check all location arrays (home, office, outdoor)
  const allOwnedGear = [
    ...(equipment.home || []),
    ...(equipment.office || []),
    ...(equipment.outdoor || []),
  ];
  
  return allOwnedGear.includes(gearId);
}

/**
 * Check if an exercise can be performed based on alternative requirements
 * Checks requirements in priority order (1, 2, 3) and returns true if ANY requirement is met
 * Also checks location-based equipment availability
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
        // Priority 1: Check if park has the specific gym equipment AND it's available in location
        if (park && park.gymEquipment) {
          const hasEquipment = park.gymEquipment.some(
            (eq) => eq.equipmentId === requirement.equipmentId
          );
          if (hasEquipment) {
            // Also check if equipment is available in this location
            const isAvailable = await isEquipmentAvailableInLocation(requirement.equipmentId, location);
            if (isAvailable) {
              return true; // Found a match - exercise can be performed
            }
          }
        }
        // Also check if user owns this equipment and it's available in location
        const userOwnedGear = userProfile.equipment?.home || [];
        const userOwnedOffice = userProfile.equipment?.office || [];
        const userOwnedOutdoor = userProfile.equipment?.outdoor || [];
        const allUserEquipment = [...userOwnedGear, ...userOwnedOffice, ...userOwnedOutdoor];
        
        if (allUserEquipment.includes(requirement.equipmentId)) {
          const isAvailable = await isEquipmentAvailableInLocation(requirement.equipmentId, location);
          if (isAvailable) {
            return true;
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
        if (userOwnsGear(requirement.gearId, userProfile)) {
          return true;
        }
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
        
        // Check if exercise uses user-owned equipment
        let matchesUserEquipment = false;
        if (ex.alternativeEquipmentRequirements) {
          for (const req of ex.alternativeEquipmentRequirements) {
            if (req.type === 'user_gear' && req.gearId) {
              if (userOwnsGear(req.gearId, userProfile)) {
                matchesUserEquipment = true;
                break;
              }
            } else if (req.type === 'gym_equipment' && req.equipmentId) {
              const userOwnedGear = [
                ...(userProfile.equipment?.home || []),
                ...(userProfile.equipment?.office || []),
                ...(userProfile.equipment?.outdoor || []),
              ];
              if (userOwnedGear.includes(req.equipmentId)) {
                matchesUserEquipment = true;
                break;
              }
            }
          }
        }
        
        filteredExercises.push({
          id: ex.id,
          name: getLocalizedText(ex.name, 'he'),
          domain,
          difficulty: getExerciseMinLevel(ex, activeProgramId),
          equipment: ex.equipment,
          selectedExecutionMethod: selectedMethod || undefined,
          matchesUserEquipment,
        });
      }
    }
    
    // Fallback: If no exercises found, try bodyweight-only exercises
    if (filteredExercises.length === 0) {
      // Filter for bodyweight exercises (no equipment required)
      const bodyweightExercises = candidateExercises.filter(ex => {
        const hasNoEquipment = !ex.alternativeEquipmentRequirements || 
          ex.alternativeEquipmentRequirements.length === 0;
        const hasOnlyImprovised = ex.alternativeEquipmentRequirements?.every(req => 
          req.type === 'urban_asset' || req.type === 'improvised'
        );
        return hasNoEquipment || hasOnlyImprovised;
      });
      
      // Return bodyweight exercises for the same movement pattern
      return bodyweightExercises.slice(0, Math.min(3, bodyweightExercises.length)).map((ex) => ({
        id: ex.id,
        name: getLocalizedText(ex.name, 'he'),
        domain,
        difficulty: getExerciseMinLevel(ex, activeProgramId),
        equipment: ex.equipment,
      }));
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
