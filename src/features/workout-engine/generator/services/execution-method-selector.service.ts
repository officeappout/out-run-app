/**
 * Enhanced Execution Method Selector
 * Selects the best execution method considering park brand matching
 */
import { Exercise, ExecutionMethod, ExecutionLocation, RequiredGearType } from '@/features/content/exercises';
import { Park } from '@/features/parks';
import { ParkGymEquipment } from '@/features/content/equipment/gym';
import { UserFullProfile } from '@/types/user-profile';
import { getAllGymEquipment } from '@/features/content/equipment/gym';
import { GymEquipment } from '@/features/content/equipment/gym';

// Cache for gym equipment
let gymEquipmentCache: GymEquipment[] | null = null;

async function getGymEquipment(): Promise<GymEquipment[]> {
  if (!gymEquipmentCache) {
    try {
      gymEquipmentCache = await getAllGymEquipment();
    } catch (error) {
      console.error('Error loading gym equipment:', error);
      gymEquipmentCache = [];
    }
  }
  return gymEquipmentCache;
}

/**
 * Select execution method with brand matching for parks
 * Priority:
 * 1. Match equipment ID AND brand name (if at park)
 * 2. Match equipment ID only
 * 3. User gear
 * 4. Improvised
 */
export async function selectExecutionMethodWithBrand(
  exercise: Exercise,
  location: ExecutionLocation,
  park: Park | null,
  userProfile: UserFullProfile
): Promise<ExecutionMethod | undefined> {
  if (!exercise.execution_methods || exercise.execution_methods.length === 0) {
    return undefined;
  }

  // Filter methods by location
  const locationMethods = exercise.execution_methods.filter((m) => m.location === location);
  if (locationMethods.length === 0) {
    return undefined;
  }

  // If at park, try to match by brand first
  if (location === 'park' && park && park.gymEquipment) {
    const gymEquipmentList = await getGymEquipment();
    
    // First, try to find exact brand match
    for (const method of locationMethods) {
      // Use new array-based fields, with fallback to legacy single fields
      const gearIdsToCheck = method.gearIds?.length ? method.gearIds : (method.gearId ? [method.gearId] : []);
      const equipmentIdsToCheck = method.equipmentIds?.length ? method.equipmentIds : (method.equipmentId ? [method.equipmentId] : []);
      const allEquipmentIds = [...equipmentIdsToCheck, ...gearIdsToCheck];
      
      if (method.requiredGearType === 'fixed_equipment' && allEquipmentIds.length > 0) {
        // Check each equipment ID for park availability
        for (const eqId of allEquipmentIds) {
          // Find the park equipment entry
          const parkEquipment = park.gymEquipment.find(
            (eq) => eq.equipmentId === eqId
          );
          
          if (parkEquipment) {
            // Find the gym equipment definition
            const equipmentDef = gymEquipmentList.find((eq) => eq.id === eqId);
            
            if (equipmentDef) {
              // Check if the park's brand matches any brand in the equipment definition
              const brandMatch = equipmentDef.brands.find(
                (brand) => brand.brandName === parkEquipment.brandName
              );
              
              // If brand matches and has a video URL, prefer this method
              if (brandMatch && brandMatch.videoUrl) {
                // Return method with brand-specific main video
                return {
                  ...method,
                  media: {
                    ...method.media,
                    mainVideoUrl: brandMatch.videoUrl,
                  },
                };
              }
            }
            
            // If equipment matches but no brand-specific video, still return this method
            return method;
          }
        }
      }
    }
  }

  // Fallback to standard selection logic
  let priorityOrder: RequiredGearType[];
  if (location === 'home' || location === 'office' || location === 'school') {
    // Indoor / home-like: user gear first, then improvised
    priorityOrder = ['user_gear', 'improvised'];
  } else if (location === 'park' || location === 'gym') {
    // Environments with fixed equipment
    priorityOrder = ['fixed_equipment', 'user_gear', 'improvised'];
  } else {
    // Street and other outdoor contexts
    priorityOrder = ['user_gear', 'improvised'];
  }

  // Try each priority in order
  for (const gearType of priorityOrder) {
    const methodsOfType = locationMethods.filter((m) => m.requiredGearType === gearType);

    for (const method of methodsOfType) {
      // Use new array-based fields, with fallback to legacy single fields
      const gearIdsToCheck = method.gearIds?.length ? method.gearIds : (method.gearId ? [method.gearId] : []);
      const equipmentIdsToCheck = method.equipmentIds?.length ? method.equipmentIds : (method.equipmentId ? [method.equipmentId] : []);
      const allEquipmentIds = [...equipmentIdsToCheck, ...gearIdsToCheck];
      
      if (method.requiredGearType === 'fixed_equipment' && allEquipmentIds.length > 0) {
        if (park && park.gymEquipment && park.gymEquipment.length > 0) {
          const parkGymEquipment = park.gymEquipment; // Capture for TypeScript
          const hasEquipment = allEquipmentIds.some(id =>
            parkGymEquipment.some((eq) => eq.equipmentId === id)
          );
          if (hasEquipment) {
            return method;
          }
        }
      } else if (method.requiredGearType === 'user_gear' && gearIdsToCheck.length > 0) {
        // TODO: Implement proper user gear checking
        return method;
      } else if (method.requiredGearType === 'improvised' && gearIdsToCheck.length > 0) {
        return method;
      }
    }
  }

  return undefined;
}
