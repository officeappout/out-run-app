/**
 * Gear Mapping Utilities
 * Maps gear types and IDs to Hebrew labels for UI display
 */
import { RequiredGearType, EquipmentType } from '@/types/exercise.type';
import { getAllGearDefinitions } from '@/features/admin/services/gear-definition.service';
import { getAllGymEquipment } from '@/features/admin/services/gym-equipment.service';
import { GearDefinition } from '@/types/gear-definition.type';
import { getLocalizedText } from '@/types/exercise.type';
import { GymEquipment } from '@/types/gym-equipment.type';

// Cache for gear data
let gearDefinitionsCache: GearDefinition[] | null = null;
let gymEquipmentCache: GymEquipment[] | null = null;

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

// Equipment type to Hebrew mapping
const EQUIPMENT_TYPE_LABELS: Record<EquipmentType, string> = {
  rings: 'טבעות',
  bar: 'מוט',
  dumbbells: 'משקולות',
  bands: 'גומיות התנגדות',
  pullUpBar: 'מתח',
  mat: 'מזרן',
  kettlebell: 'כדור ברזל',
  bench: 'ספסל',
  lowBar: 'מוט נמוך',
  highBar: 'מוט גבוה',
  dipStation: 'מקבילים',
  wall: 'קיר',
  stairs: 'מדרגות',
  none: 'ללא ציוד',
};

// Improvised items to Hebrew mapping
const IMPROVISED_ITEMS: Record<string, string> = {
  chair: 'כיסא',
  door: 'דלת',
  wall: 'קיר',
  stairs: 'מדרגות',
  bench: 'ספסל',
  streetBench: 'ספסל רחוב',
  street_bench: 'ספסל רחוב',
  table: 'שולחן',
};

/**
 * Get Hebrew label for gear based on gear type and ID
 */
export async function getGearLabel(
  gearType: RequiredGearType,
  gearId: string
): Promise<string> {
  if (gearType === 'improvised') {
    // Check if it's a known improvised item
    const lowerGearId = gearId.toLowerCase();
    if (IMPROVISED_ITEMS[lowerGearId]) {
      return IMPROVISED_ITEMS[lowerGearId];
    }
    // Return the gearId as-is if not found in mapping
    return gearId;
  }

  if (gearType === 'user_gear') {
    const gearDefinitions = await getGearDefinitions();
    const gear = gearDefinitions.find((g) => g.id === gearId);
    if (gear) {
      // Use Hebrew label for now (admin UI is Hebrew-first)
      return gear.name?.he || gear.name?.en || '';
    }
    // Fallback: try to match by equipment type
    const lowerGearId = gearId.toLowerCase();
    for (const [key, label] of Object.entries(EQUIPMENT_TYPE_LABELS)) {
      if (lowerGearId.includes(key)) {
        return label;
      }
    }
    return gearId; // Return ID if not found
  }

  if (gearType === 'fixed_equipment') {
    const gymEquipment = await getGymEquipment();
    const equipment = gymEquipment.find((eq) => eq.id === gearId);
    if (equipment) {
      return equipment.name;
    }
    return gearId; // Return ID if not found
  }

  return 'ללא ציוד';
}

/**
 * Get gear badge props for UI rendering
 */
export async function getGearBadgeProps(
  gearType: RequiredGearType,
  gearId: string
): Promise<{ label: string }> {
  const label = await getGearLabel(gearType, gearId);
  return { label };
}

/**
 * Get muscle group Hebrew label
 */
export function getMuscleGroupLabel(muscle: string): string {
  const MUSCLE_LABELS: Record<string, string> = {
    chest: 'חזה',
    back: 'גב',
    shoulders: 'כתפיים',
    abs: 'בטן',
    obliques: 'אלכסונים',
    forearms: 'אמה',
    biceps: 'דו ראשי',
    triceps: 'שלוש ראשי',
    quads: 'ארבע ראשי',
    hamstrings: 'מיתר ברך',
    glutes: 'ישבן',
    calves: 'שוקיים',
    traps: 'טרפז',
    cardio: 'קרדיו',
    full_body: 'כל הגוף',
    core: 'ליבה',
    legs: 'רגליים',
  };

  return MUSCLE_LABELS[muscle] || muscle;
}
