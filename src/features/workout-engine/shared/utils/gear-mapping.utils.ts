/**
 * Gear Mapping Utilities
 * Maps gear types and IDs to Hebrew labels for UI display
 */
import { RequiredGearType, EquipmentType } from '@/features/content/exercises';
import { getAllGearDefinitions } from '@/features/content/equipment/gear';
import { getAllGymEquipment } from '@/features/content/equipment/gym';
import { GearDefinition } from '@/features/content/equipment/gear';
import { getLocalizedText } from '@/features/content/shared';
import { GymEquipment } from '@/features/content/equipment/gym';

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
  streetBench: 'ספסל רחוב',
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
    lats: 'גב רחב',
    hip_flexors: 'כופפי הירך',
    lower_back: 'גב תחתון',
    upper_back: 'גב עליון',
    neck: 'צוואר',
    adductors: 'מקרבי הירך',
    abductors: 'מרחיקים',
    serratus: 'המסור',
  };

  return MUSCLE_LABELS[muscle] || muscle;
}

// ============================================================================
// Synchronous equipment label resolver (no Firestore calls)
// ============================================================================

const EQUIPMENT_NAME_HE: Record<string, string> = {
  dumbbells: 'משקולות',
  dumbbell: 'משקולת',
  kettlebell: 'קטלבל',
  resistance_band: 'גומיית התנגדות',
  resistance_bands: 'גומיות התנגדות',
  bands: 'גומיות התנגדות',
  pull_up_bar: 'מתח',
  pullup_bar: 'מתח',
  pullUpBar: 'מתח',
  rings: 'טבעות',
  gymnastic_rings: 'טבעות',
  trx: 'TRX',
  jump_rope: 'חבל קפיצה',
  yoga_mat: 'מזרן',
  mat: 'מזרן',
  bench: 'ספסל',
  barbell: 'מוט',
  bar: 'מוט',
  lowBar: 'מוט נמוך',
  low_bar: 'מוט נמוך',
  highBar: 'מוט גבוה',
  high_bar: 'מוט גבוה',
  ab_wheel: 'גלגל בטן',
  dip_station: 'מקבילים',
  dipStation: 'מקבילים',
  parallettes: 'מקבילונים',
  foam_roller: 'רולר',
  medicine_ball: 'כדור כוח',
  step: 'מדרגה',
  stairs: 'מדרגות',
  wall: 'קיר',
  chair: 'כיסא',
  door: 'דלת',
  table: 'שולחן',
  streetBench: 'ספסל רחוב',
  street_bench: 'ספסל רחוב',
  none: 'ללא ציוד',
};

/**
 * Resolve a raw gear/equipment ID or enum value to a Hebrew label.
 * Synchronous — uses a static map. Falls back to 'ציוד' for opaque Firestore IDs.
 */
export function resolveEquipmentLabel(id: string): string {
  if (EQUIPMENT_NAME_HE[id]) return EQUIPMENT_NAME_HE[id];
  const key = id.toLowerCase().replace(/-/g, '_');
  if (EQUIPMENT_NAME_HE[key]) return EQUIPMENT_NAME_HE[key];
  if (/^[a-z_]+$/.test(key) && key.length < 30) return key.replace(/_/g, ' ');
  return 'ציוד';
}

/**
 * Maps Hebrew labels back to a canonical English key for icon filenames.
 * Used to build `/assets/icons/equipment/{key}.svg` paths from resolved labels.
 */
const LABEL_TO_ICON_KEY: Record<string, string> = {
  'משקולות': 'dumbbells',
  'משקולת': 'dumbbell',
  'קטלבל': 'kettlebell',
  'גומיית התנגדות': 'resistance_band',
  'גומיות התנגדות': 'resistance_bands',
  'מתח': 'pull_up_bar',
  'טבעות': 'rings',
  'TRX': 'trx',
  'חבל קפיצה': 'jump_rope',
  'מזרן': 'mat',
  'ספסל': 'bench',
  'מוט': 'barbell',
  'מוט נמוך': 'low_bar',
  'מוט גבוה': 'high_bar',
  'גלגל בטן': 'ab_wheel',
  'מקבילים': 'dip_station',
  'מקבילונים': 'parallettes',
  'רולר': 'foam_roller',
  'כדור כוח': 'medicine_ball',
  'מדרגה': 'step',
  'מדרגות': 'stairs',
  'קיר': 'wall',
  'כיסא': 'chair',
  'דלת': 'door',
  'שולחן': 'table',
  'ספסל רחוב': 'street_bench',
};

/**
 * Firestore document IDs used as gear IDs — map to fallback icon keys.
 * These IDs come from gear_definitions; when no icon exists, use Bands.svg (bodyweight-adjacent).
 */
const FIRESTORE_GEAR_ID_TO_ICON: Record<string, string> = {
  mL3YJywh3aobJni7YVdu: 'Bands',
  '7gLOFEfgSvInu7lfLHxV': 'trx',
  I1K30JehaxSx8dlBOZyd: 'Bands',
  '5Rkhxawxj8EwC4spTXVM': 'Bands',
};

/**
 * Resolve a raw equipment ID to a canonical icon filename (no extension).
 * Tries: Firestore ID map → direct key lookup → normalized key → reverse label-to-key → null.
 */
export function resolveEquipmentIconKey(id: string): string | null {
  if (FIRESTORE_GEAR_ID_TO_ICON[id]) return FIRESTORE_GEAR_ID_TO_ICON[id];
  if (EQUIPMENT_NAME_HE[id]) return id;
  const key = id.toLowerCase().replace(/-/g, '_');
  if (EQUIPMENT_NAME_HE[key]) return key;
  const label = resolveEquipmentLabel(id);
  if (LABEL_TO_ICON_KEY[label]) return LABEL_TO_ICON_KEY[label];
  return null;
}
