/**
 * Enhanced Execution Method Selector
 * Selects the best execution method considering park brand matching,
 * media availability, and pullup-bar priority for מתח exercises.
 */
import { Exercise, ExecutionMethod, ExecutionLocation, RequiredGearType } from '@/features/content/exercises';
import { Park } from '@/features/parks';
import { UserFullProfile } from '@/types/user-profile';
import { getAllGymEquipment } from '@/features/content/equipment/gym';
import { GymEquipment } from '@/features/content/equipment/gym';
import { normalizeGearId, isEquipmentFamilyMatch } from '@/features/workout-engine/shared/utils/gear-mapping.utils';

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

function methodMatchesLocation(method: ExecutionMethod, location: ExecutionLocation): boolean {
  if (method.location === location) return true;
  if (method.locationMapping?.includes(location)) return true;
  return false;
}

function methodHasMedia(method: ExecutionMethod): boolean {
  const m = method.media as Record<string, any> | undefined;
  return !!(m?.mainVideoUrl || m?.videoUrl || m?.imageUrl);
}

function getMethodEquipmentIds(method: ExecutionMethod): string[] {
  const gearIds = method.gearIds?.length ? method.gearIds : (method.gearId ? [method.gearId] : []);
  const equipmentIds = method.equipmentIds?.length ? method.equipmentIds : (method.equipmentId ? [method.equipmentId] : []);
  return [...equipmentIds, ...gearIds];
}

function methodUsesPullupBar(method: ExecutionMethod): boolean {
  const ids = getMethodEquipmentIds(method);
  return ids.some((id) => {
    const canonical = normalizeGearId(id);
    return canonical === 'pullup_bar' || isEquipmentFamilyMatch('pullup_bar', canonical);
  });
}

function exerciseNameContainsPullup(exercise: Exercise): boolean {
  const heName = typeof exercise.name === 'string'
    ? exercise.name
    : (exercise.name as any)?.he || '';
  return heName.includes('מתח');
}

interface ScoredCandidate {
  method: ExecutionMethod;
  hasMedia: boolean;
  usesPullupBar: boolean;
}

function rankCandidates(candidates: ScoredCandidate[], preferPullup: boolean): ExecutionMethod | undefined {
  if (candidates.length === 0) return undefined;
  if (candidates.length === 1) return candidates[0].method;

  candidates.sort((a, b) => {
    // 1. Prefer methods WITH media over those without
    if (a.hasMedia !== b.hasMedia) return a.hasMedia ? -1 : 1;
    // 2. For מתח exercises, prefer pullup_bar over rings
    if (preferPullup && a.usesPullupBar !== b.usesPullupBar) return a.usesPullupBar ? -1 : 1;
    return 0;
  });

  return candidates[0].method;
}

/**
 * Select execution method with brand matching for parks.
 *
 * Priority:
 *  1. Match equipment ID AND brand name (if at park)
 *  2. Match equipment ID only
 *  3. User gear
 *  4. Improvised
 *
 * Within each tier, methods are ranked by:
 *  - Media availability (methods WITH video/image beat those without)
 *  - Pull-up priority (for exercises whose name contains 'מתח',
 *    methods using pullup_bar beat methods using rings)
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

  const locationMethods = exercise.execution_methods.filter((m) => methodMatchesLocation(m, location));
  if (locationMethods.length === 0) {
    return undefined;
  }

  const preferPullup = exerciseNameContainsPullup(exercise);

  // ── Park: collect ALL matching methods, then rank ──
  if (location === 'park' && park && park.gymEquipment) {
    const gymEquipmentList = await getGymEquipment();
    const parkCanonicalMap = park.gymEquipment.map((eq) => ({
      ...eq,
      canonical: normalizeGearId(eq.equipmentId),
    }));

    const candidates: ScoredCandidate[] = [];

    for (const method of locationMethods) {
      const allEquipmentIds = getMethodEquipmentIds(method);

      if (method.requiredGearType === 'fixed_equipment' && allEquipmentIds.length > 0) {
        for (const eqId of allEquipmentIds) {
          // Try exact Firestore ID match first (preserves brand-specific videos)
          const exactMatch = park.gymEquipment.find((eq) => eq.equipmentId === eqId);

          if (exactMatch) {
            const equipmentDef = gymEquipmentList.find((eq) => eq.id === eqId);
            let enrichedMethod = method;
            if (equipmentDef) {
              const brandMatch = equipmentDef.brands.find(
                (brand) => brand.brandName === exactMatch.brandName
              );
              if (brandMatch?.videoUrl) {
                enrichedMethod = {
                  ...method,
                  media: { ...method.media, mainVideoUrl: brandMatch.videoUrl },
                };
              }
            }
            candidates.push({
              method: enrichedMethod,
              hasMedia: methodHasMedia(enrichedMethod),
              usesPullupBar: methodUsesPullupBar(method),
            });
            break;
          }

          // Canonical / family match
          const requiredCanonical = normalizeGearId(eqId);
          const familyMatch = parkCanonicalMap.find(
            (eq) => eq.canonical === requiredCanonical
              || isEquipmentFamilyMatch(requiredCanonical, eq.canonical)
          );
          if (familyMatch) {
            const equipmentDef = gymEquipmentList.find((eq) => eq.id === familyMatch.equipmentId);
            let enrichedMethod = method;
            if (equipmentDef) {
              const brandMatch = equipmentDef.brands.find(
                (brand) => brand.brandName === familyMatch.brandName
              );
              if (brandMatch?.videoUrl) {
                enrichedMethod = {
                  ...method,
                  media: { ...method.media, mainVideoUrl: brandMatch.videoUrl },
                };
              }
            }
            candidates.push({
              method: enrichedMethod,
              hasMedia: methodHasMedia(enrichedMethod),
              usesPullupBar: methodUsesPullupBar(method),
            });
            break;
          }
        }
      }
    }

    const parkWinner = rankCandidates(candidates, preferPullup);
    if (parkWinner) return parkWinner;
  }

  // ── Fallback: standard gear-type priority ──
  let priorityOrder: RequiredGearType[];
  if (location === 'home' || location === 'office' || location === 'school') {
    priorityOrder = ['user_gear', 'improvised'];
  } else if (location === 'park' || location === 'gym') {
    priorityOrder = ['fixed_equipment', 'user_gear', 'improvised'];
  } else {
    priorityOrder = ['user_gear', 'improvised'];
  }

  for (const gearType of priorityOrder) {
    const methodsOfType = locationMethods.filter((m) => m.requiredGearType === gearType);
    const candidates: ScoredCandidate[] = [];

    for (const method of methodsOfType) {
      const allEquipmentIds = getMethodEquipmentIds(method);

      if (method.requiredGearType === 'fixed_equipment' && allEquipmentIds.length > 0) {
        if (park?.gymEquipment?.length) {
          const parkGymEquipment = park.gymEquipment;
          const hasEquipment = allEquipmentIds.some((id) => {
            if (parkGymEquipment.some((eq) => eq.equipmentId === id)) return true;
            const requiredCanonical = normalizeGearId(id);
            return parkGymEquipment.some((eq) => {
              const parkCanonical = normalizeGearId(eq.equipmentId);
              return parkCanonical === requiredCanonical
                || isEquipmentFamilyMatch(requiredCanonical, parkCanonical);
            });
          });
          if (hasEquipment) {
            candidates.push({
              method,
              hasMedia: methodHasMedia(method),
              usesPullupBar: methodUsesPullupBar(method),
            });
          }
        }
      } else if (method.requiredGearType === 'user_gear') {
        candidates.push({
          method,
          hasMedia: methodHasMedia(method),
          usesPullupBar: methodUsesPullupBar(method),
        });
      } else if (method.requiredGearType === 'improvised') {
        candidates.push({
          method,
          hasMedia: methodHasMedia(method),
          usesPullupBar: methodUsesPullupBar(method),
        });
      }
    }

    const winner = rankCandidates(candidates, preferPullup);
    if (winner) return winner;
  }

  return undefined;
}
