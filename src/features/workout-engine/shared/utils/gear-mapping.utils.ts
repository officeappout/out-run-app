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
  parallel_bars: 'מקבילים',
  'מתקן מקבילים': 'מקבילים',
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
  monkey_bars: 'סולם קופים',
  ab_bench: 'ספסל בטן',
  balance_beam: 'קורת שיווי משקל',
  none: 'ללא ציוד',
};

/**
 * Resolve a raw gear/equipment ID or enum value to a Hebrew label.
 * Synchronous — uses a static map. Falls back to 'ציוד' for opaque Firestore IDs.
 */
export function resolveEquipmentLabel(id: string): string {
  if (EQUIPMENT_NAME_HE[id]) return EQUIPMENT_NAME_HE[id];
  // Try canonical normalization (handles Firestore doc IDs)
  const canonical = ALIAS_TO_CANONICAL[id];
  if (canonical && EQUIPMENT_NAME_HE[canonical]) return EQUIPMENT_NAME_HE[canonical];
  const key = id.toLowerCase().replace(/-/g, '_');
  if (EQUIPMENT_NAME_HE[key]) return EQUIPMENT_NAME_HE[key];
  const canonicalLower = ALIAS_TO_CANONICAL[key];
  if (canonicalLower && EQUIPMENT_NAME_HE[canonicalLower]) return EQUIPMENT_NAME_HE[canonicalLower];
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
  'מתקן מקבילים': 'dip_station',
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
  'סולם קופים': 'monkey_bars',
  'ספסל בטן': 'ab_bench',
  'קורת שיווי משקל': 'balance_beam',
};

/**
 * Firestore document IDs used as gear IDs — map to fallback icon keys.
 * These IDs come from gear_definitions; maps to canonical icon keys.
 */
const FIRESTORE_GEAR_ID_TO_ICON: Record<string, string> = {
  I1K30JehaxSx8dlBOZyd: 'rings',
  mL3YJywh3aobJni7YVdu: 'rings',
  p9jowHV8JO0UAkbHPzUP: 'resistance_bands',
  '9HVoe7t0PmaP5YJOYAlv': 'pullup_bar',
  h3oFM4Xe6FE63OQzfh8x: 'dip_station',
  '7gLOFEfgSvInu7lfLHxV': 'trx',
  '5Rkhxawxj8EwC4spTXVM': 'resistance_bands',
};

// ============================================================================
// CANONICAL GEAR MAP — Source of Truth
// ============================================================================

/**
 * Every alias (snake_case, camelCase, concatenated, Firestore IDs) that
 * maps to the same canonical semantic key. The engine normalises ALL gear
 * IDs through this map before any gating / scoring / comparison.
 *
 * Add new Firestore doc IDs here when equipment is created in Admin.
 */
const ALIAS_TO_CANONICAL: Record<string, string> = {
  // Pull-up bar
  pullup_bar: 'pullup_bar',
  pull_up_bar: 'pullup_bar',
  pullupbar: 'pullup_bar',
  pullupBar: 'pullup_bar',
  pullUpBar: 'pullup_bar',
  // Dip station / parallel bars
  dip_station: 'dip_station',
  dipstation: 'dip_station',
  dipStation: 'dip_station',
  dip_bar: 'dip_station',
  parallel_bars: 'dip_station',
  parallelBars: 'dip_station',
  parallels: 'dip_station',
  bars: 'dip_station',
  'מקבילים': 'dip_station',
  'מתקן מקבילים': 'dip_station',
  // Resistance bands
  resistance_band: 'resistance_bands',
  resistance_bands: 'resistance_bands',
  bands: 'resistance_bands',
  // Rings
  rings: 'rings',
  gymnastic_rings: 'rings',
  // TRX / suspension
  trx: 'trx',
  // Bench
  bench: 'bench',
  park_bench: 'bench',
  street_bench: 'bench',
  streetBench: 'bench',
  // Step / stairs
  step: 'step',
  park_step: 'step',
  stairs: 'stairs',
  // Bars (low/high)
  low_bar: 'low_bar',
  lowBar: 'low_bar',
  high_bar: 'high_bar',
  highBar: 'high_bar',
  // Other common
  ab_wheel: 'ab_wheel',
  parallettes: 'parallettes',
  foam_roller: 'foam_roller',
  medicine_ball: 'medicine_ball',
  mat: 'mat',
  yoga_mat: 'mat',
  wall: 'wall',
  chair: 'chair',
  door: 'door',
  table: 'table',
  monkey_bars: 'monkey_bars',
  ab_bench: 'ab_bench',
  balance_beam: 'balance_beam',
  jump_rope: 'jump_rope',
  kettlebell: 'kettlebell',
  dumbbells: 'dumbbells',
  dumbbell: 'dumbbells',
  barbell: 'barbell',
  bar: 'barbell',
  bodyweight: 'bodyweight',
  none: 'none',
  // Firestore document IDs → canonical keys
  I1K30JehaxSx8dlBOZyd: 'rings',
  mL3YJywh3aobJni7YVdu: 'rings',
  p9jowHV8JO0UAkbHPzUP: 'resistance_bands',
  '9HVoe7t0PmaP5YJOYAlv': 'pullup_bar',
  h3oFM4Xe6FE63OQzfh8x: 'dip_station',
  '7gLOFEfgSvInu7lfLHxV': 'trx',
  '5Rkhxawxj8EwC4spTXVM': 'resistance_bands',
};

/**
 * Essential park fixtures — canonical IDs that are always assumed to exist
 * at any park / outdoor gym. applyParkGating force-allows these.
 */
export const ESSENTIAL_PARK_GEAR: ReadonlySet<string> = new Set([
  'pullup_bar',
  'dip_station',
  'bench',
  'low_bar',
  'high_bar',
]);

/**
 * Normalise a raw gear/equipment ID (from Firestore, Admin, or legacy data)
 * to its canonical semantic key. Returns the original ID lowercased if no
 * alias is found — this ensures unknown IDs still participate in matching.
 */
export function normalizeGearId(rawId: string): string {
  if (ALIAS_TO_CANONICAL[rawId]) return ALIAS_TO_CANONICAL[rawId];
  const lower = rawId.toLowerCase().replace(/-/g, '_');
  if (ALIAS_TO_CANONICAL[lower]) return ALIAS_TO_CANONICAL[lower];
  return lower;
}

/**
 * Normalise an array of raw IDs. Deduplicates after normalisation.
 */
export function normalizeGearIds(rawIds: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of rawIds) {
    if (!id) continue;
    const canonical = normalizeGearId(id);
    if (!seen.has(canonical)) {
      seen.add(canonical);
      result.push(canonical);
    }
  }
  return result;
}

/**
 * Register a Firestore document ID as an alias for a canonical key.
 * Call at app boot once gym_equipment / gear_definitions are fetched.
 */
export function registerGearAlias(firestoreId: string, canonicalKey: string): void {
  ALIAS_TO_CANONICAL[firestoreId] = canonicalKey;
}

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

const ICON_KEY_TO_SVG: Record<string, string> = {
  pull_up_bar: '/assets/icons/equipment/pullupbar.svg',
  pullup_bar: '/assets/icons/equipment/pullupbar.svg',
  pullUpBar: '/assets/icons/equipment/pullupbar.svg',
  dip_station: '/assets/icons/equipment/parallelbars.svg',
  dipStation: '/assets/icons/equipment/parallelbars.svg',
  parallel_bars: '/assets/icons/equipment/parallelbars.svg',
  rings: '/assets/icons/equipment/rings.svg',
  gymnastic_rings: '/assets/icons/equipment/rings.svg',
  resistance_bands: '/assets/icons/equipment/bands.svg',
  resistance_band: '/assets/icons/equipment/bands.svg',
  bands: '/assets/icons/equipment/bands.svg',
  trx: '/assets/icons/equipment/trx.svg',
};

/**
 * Resolve a canonical gear ID to a `/assets/icons/equipment/*.svg` path.
 * Returns null when no dedicated SVG exists (caller should use a fallback icon).
 */
export function resolveEquipmentSvgPath(id: string): string | null {
  if (ICON_KEY_TO_SVG[id]) return ICON_KEY_TO_SVG[id];
  // Try canonical normalization (handles Firestore doc IDs)
  const canonical = ALIAS_TO_CANONICAL[id];
  if (canonical && ICON_KEY_TO_SVG[canonical]) return ICON_KEY_TO_SVG[canonical];
  const iconKey = resolveEquipmentIconKey(id);
  if (iconKey && ICON_KEY_TO_SVG[iconKey]) return ICON_KEY_TO_SVG[iconKey];
  return null;
}
