/**
 * Gear Mapping Utilities
 * Maps gear types and IDs to Hebrew labels for UI display
 */
import type { RequiredGearType, EquipmentType } from '@/features/content/exercises/core/exercise.types';
import { getAllGearDefinitions } from '@/features/content/equipment/gear';
import { getAllGymEquipment } from '@/features/content/equipment/gym';
import { GearDefinition } from '@/features/content/equipment/gear';
import { getLocalizedText } from '@/features/content/shared';
import { GymEquipment } from '@/features/content/equipment/gym';

// Cache for gear data
let gearDefinitionsCache: GearDefinition[] | null = null;
let gymEquipmentCache: GymEquipment[] | null = null;
let _cacheLoadPromise: Promise<void> | null = null;

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

/**
 * Populate both runtime caches so that synchronous resolvers
 * (resolveEquipmentLabel, normalizeGearId, resolveEquipmentSvgPath)
 * can find Firestore items by document ID, iconKey, or Hebrew name.
 *
 * Safe to call multiple times — deduplicates via a shared promise.
 * Call this early in app lifecycle (StatsOverview, Admin layout, etc.).
 */
export async function ensureEquipmentCachesLoaded(): Promise<void> {
  if (gearDefinitionsCache && gymEquipmentCache) return;
  if (_cacheLoadPromise) return _cacheLoadPromise;

  _cacheLoadPromise = (async () => {
    try {
      await Promise.all([getGearDefinitions(), getGymEquipment()]);
    } catch (err) {
      console.error('[ensureEquipmentCachesLoaded] failed:', err);
    }
  })();

  return _cacheLoadPromise;
}

/**
 * Accept pre-fetched data to seed the caches without a second Firestore call.
 * Useful when the caller already has the data (e.g. audit page, admin pages).
 */
export function seedEquipmentCaches(
  gearDefs: GearDefinition[],
  gymEquip: GymEquipment[],
): void {
  if (!gearDefinitionsCache) gearDefinitionsCache = gearDefs;
  if (!gymEquipmentCache) gymEquipmentCache = gymEquip;
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
  // ── Weights ─────────────────────────────────────────────────────────────────
  dumbbells: 'משקולות',
  dumbbell: 'משקולת',
  kettlebell: 'קטלבל',
  barbell: 'מוט',
  bar: 'מוט',
  // ── Resistance bands (EVERY possible key) ───────────────────────────────────
  resistance_band: 'גומיות התנגדות',
  resistance_bands: 'גומיות התנגדות',
  bands: 'גומיות התנגדות',
  long_resistance_band: 'גומיות התנגדות',
  'גומייה': 'גומיות התנגדות',
  'גומיות': 'גומיות התנגדות',
  'גומי': 'גומיות התנגדות',
  'גומיית התנגדות': 'גומיות התנגדות',
  // ── Pull-up bar (all variants resolve to the same Hebrew label) ─────────────
  pull_up_bar: 'מתח',
  pullup_bar: 'מתח',
  pullUpBar: 'מתח',
  pullupbar: 'מתח',
  pullupbar_park: 'מתח',      // park fixture SVG filename used as gear ID in some documents
  pullup_bar_park: 'מתח',
  pull_up_bar_park: 'מתח',
  'מתח': 'מתח',
  'מתח רחב': 'מתח',
  'מתח צר': 'מתח',
  'מתח סובב': 'מתח',
  'מתח סטנדרטי': 'מתח',
  'מתח גבוה': 'מתח',
  'מוט מתח': 'מתח',
  'סרגל מתח': 'מתח',
  'מתקן מתח': 'מתח',
  'סולם שוודי': 'מתח',
  'מתח נמוך': 'מוט נמוך',
  'מתח אוסטרלי': 'מוט נמוך',
  'במת בטן': 'ספסל בטן',
  'מתקן בטן': 'ספסל בטן',
  // ── Rings ────────────────────────────────────────────────────────────────────
  rings: 'טבעות',
  gymnastic_rings: 'טבעות',
  'טבעות': 'טבעות',
  'טבעות התעמלות': 'טבעות',
  // ── Dip station / parallel bars ─────────────────────────────────────────────
  dip_station: 'מקבילים',
  dipStation: 'מקבילים',
  parallel_bars: 'מקבילים',
  'מקבילים': 'מקבילים',
  'מתקן מקבילים': 'מקבילים',
  // ── Suspension ──────────────────────────────────────────────────────────────
  trx: 'TRX',
  // ── Jump rope ───────────────────────────────────────────────────────────────
  jump_rope: 'חבל קפיצה',
  skipping_rope: 'חבל קפיצה',
  // ── Mat ──────────────────────────────────────────────────────────────────────
  yoga_mat: 'מזרן',
  mat: 'מזרן',
  // ── Bench / seating ─────────────────────────────────────────────────────────
  bench: 'ספסל',
  streetBench: 'ספסל רחוב',
  street_bench: 'ספסל רחוב',
  ab_bench: 'ספסל בטן',
  // ── Bars (low/high) ─────────────────────────────────────────────────────────
  lowBar: 'מוט נמוך',
  low_bar: 'מוט נמוך',
  highBar: 'מוט גבוה',
  high_bar: 'מוט גבוה',
  // ── Core / abs ──────────────────────────────────────────────────────────────
  ab_wheel: 'גלגל בטן',
  abdominal_wheel: 'גלגל בטן',
  // ── Other equipment ─────────────────────────────────────────────────────────
  parallettes: 'מקבילונים',
  foam_roller: 'רולר',
  medicine_ball: 'כדור כוח',
  step: 'מדרגה',
  stairs: 'מדרגות',
  wall: 'קיר',
  chair: 'כיסא',
  door: 'דלת',
  table: 'שולחן',
  monkey_bars: 'סולם קופים',
  balance_beam: 'קורת שיווי משקל',
  sofa: 'ספה',
  back_pack: 'תיק גב',
  backpack: 'תיק גב',
  weight_belt: 'חגורת משקולות',
  yoga_block: 'בלוק יוגה',
  stool: 'שרפרף',
  pants: 'מכנסיים',
  climbing_rope: 'חבל טיפוס',
  // ── Meta ─────────────────────────────────────────────────────────────────────
  none: 'ללא ציוד',
  bodyweight: 'משקל גוף',
  unknown_gear: 'לא מזוהה',
};

/**
 * Resolve a raw gear/equipment ID or enum value to a Hebrew label.
 * Synchronous — uses static map → canonical alias → runtime caches.
 *
 * Priority order:
 *   1. Runtime caches first (Firestore is source of truth — David's data wins)
 *   2. Static EQUIPMENT_NAME_HE dictionary
 *   3. Canonical alias resolution
 *   4. FIRESTORE_GEAR_ID_TO_ICON fallback
 *   5. 'ציוד לא מזוהה' only if nothing works
 */
export function resolveEquipmentLabel(id: string): string {
  // ── 1. Runtime caches FIRST — Firestore names always win ─────────────────
  // Search by Firestore doc ID
  if (gearDefinitionsCache) {
    const gear = gearDefinitionsCache.find((g) => g.id === id);
    if (gear) {
      const name = gear.name?.he || gear.name?.en;
      if (name) return name;
    }
  }
  if (gymEquipmentCache) {
    const gym = gymEquipmentCache.find((g) => g.id === id);
    if (gym?.name) return gym.name;
  }
  // Search by iconKey (for already-normalized canonical keys like 'pullup_bar')
  if (gearDefinitionsCache) {
    const gearByIcon = gearDefinitionsCache.find((g) => g.iconKey === id);
    if (gearByIcon) {
      const name = gearByIcon.name?.he || gearByIcon.name?.en;
      if (name) return name;
    }
  }
  if (gymEquipmentCache) {
    const gymByIcon = gymEquipmentCache.find((g) => g.iconKey === id);
    if (gymByIcon?.name) return gymByIcon.name;
  }

  // ── 2. Static dictionary — covers all canonical English keys ─────────────
  if (EQUIPMENT_NAME_HE[id]) return EQUIPMENT_NAME_HE[id];

  // ── 3. Canonical alias → dictionary ──────────────────────────────────────
  const canonical = ALIAS_TO_CANONICAL[id];
  if (canonical && EQUIPMENT_NAME_HE[canonical]) return EQUIPMENT_NAME_HE[canonical];

  // ── 4. Lowercase/underscore normalization ────────────────────────────────
  const key = id.toLowerCase().replace(/-/g, '_');
  if (EQUIPMENT_NAME_HE[key]) return EQUIPMENT_NAME_HE[key];
  const canonicalLower = ALIAS_TO_CANONICAL[key];
  if (canonicalLower && EQUIPMENT_NAME_HE[canonicalLower]) return EQUIPMENT_NAME_HE[canonicalLower];

  // ── 5. FIRESTORE_GEAR_ID_TO_ICON → dictionary ───────────────────────────
  const iconFromFirestore = FIRESTORE_GEAR_ID_TO_ICON[id];
  if (iconFromFirestore && EQUIPMENT_NAME_HE[iconFromFirestore]) return EQUIPMENT_NAME_HE[iconFromFirestore];

  // ── 6. Runtime cache — search by normalized canonical key or Hebrew name ─
  if (gearDefinitionsCache) {
    const gear = gearDefinitionsCache.find((g) => {
      if (g.iconKey) {
        const normIcon = ALIAS_TO_CANONICAL[g.iconKey] ?? g.iconKey;
        return normIcon === id || normIcon === key || normIcon === canonical;
      }
      // Items without iconKey: try matching by Hebrew name's canonical key
      const heName = g.name?.he;
      if (heName) {
        const heCanonical = LABEL_TO_ICON_KEY[heName] ?? ALIAS_TO_CANONICAL[heName];
        return heCanonical === id || heCanonical === key || heCanonical === canonical;
      }
      return false;
    });
    if (gear) {
      const name = gear.name?.he || gear.name?.en;
      if (name) return name;
    }
  }
  if (gymEquipmentCache) {
    const gym = gymEquipmentCache.find((g) => {
      if (g.iconKey) {
        const normIcon = ALIAS_TO_CANONICAL[g.iconKey] ?? g.iconKey;
        return normIcon === id || normIcon === key || normIcon === canonical;
      }
      if (g.name) {
        const heCanonical = LABEL_TO_ICON_KEY[g.name] ?? ALIAS_TO_CANONICAL[g.name];
        return heCanonical === id || heCanonical === key || heCanonical === canonical;
      }
      return false;
    });
    if (gym?.name) return gym.name;
  }

  // ── 7. Last resort ──────────────────────────────────────────────────────
  if (process.env.NODE_ENV === 'development') {
    console.warn(`[resolveEquipmentLabel] No Hebrew label for: "${id}"`);
  }
  return 'ציוד לא מזוהה';
}

/**
 * Maps Hebrew labels back to a canonical English key for icon filenames.
 * Used to build `/assets/icons/equipment/{key}.svg` paths from resolved labels.
 */
const LABEL_TO_ICON_KEY: Record<string, string> = {
  // ── Weights ─────────────────────────────────────────────────────────────
  'משקולות': 'dumbbells',
  'משקולת': 'dumbbell',
  'משקולות יד': 'dumbbells',
  'קטלבל': 'kettlebell',
  'קיטלבל': 'kettlebell',           // alt spelling David might use
  'כדור כוח': 'medicine_ball',
  // ── Resistance bands ──────────────────────────────────────────────────
  'גומיית התנגדות': 'resistance_bands',
  'גומיות התנגדות': 'resistance_bands',
  'גומייה': 'resistance_bands',
  'גומיות': 'resistance_bands',
  'גומי': 'resistance_bands',
  // ── Pull-up bar (all Hebrew variants incl. park installations) ────────
  'מתח': 'pullup_bar',
  'מתח רחב': 'pullup_bar',
  'מתח צר': 'pullup_bar',
  'מתח סובב': 'pullup_bar',
  'מתח סטנדרטי': 'pullup_bar',
  'מתח גבוה': 'pullup_bar',         // high bar variant
  'מוט מתח': 'pullup_bar',
  'סרגל מתח': 'pullup_bar',
  'מתקן מתח': 'pullup_bar',         // "pull-up device"
  'סולם שוודי': 'pullup_bar',       // Swedish ladder (functionally pull-up)
  // ── Low bar / Australian bar ──────────────────────────────────────────
  'מתח נמוך': 'low_bar',
  'מתח אוסטרלי': 'low_bar',
  'מתח נמוך / אוסטרלי': 'low_bar',  // compound name from CSV/mock data
  'אוסטרלי': 'low_bar',
  // ── Rings ─────────────────────────────────────────────────────────────
  'טבעות': 'rings',
  'טבעות התעמלות': 'rings',
  // ── TRX / suspension ──────────────────────────────────────────────────
  'TRX': 'trx',
  'רצועות TRX': 'trx',
  'רצועות': 'trx',
  // ── Dip station / parallel bars ───────────────────────────────────────
  'מקבילים': 'dip_station',
  'מתקן מקבילים': 'dip_station',
  'מוט מקבילים': 'dip_station',
  'ברים': 'dip_station',            // slang for bars
  'מקבילונים': 'parallettes',
  // ── Bench / seating ───────────────────────────────────────────────────
  'ספסל': 'bench',
  'ספסל רחוב': 'street_bench',
  'ספסל בטן': 'ab_bench',
  'ספסל שיפוע': 'bench',
  'ספסל ישיבה': 'bench',
  // ── Ab equipment ──────────────────────────────────────────────────────
  'במת בטן': 'ab_bench',            // ab platform from mock data
  'מתקן בטן': 'ab_bench',           // ab device
  'גלגל בטן': 'ab_wheel',
  // ── Fixed machines (park hydraulic / outdoor gym) ─────────────────────
  'מתקן לחיצת חזה': 'bench',        // chest press → bench family
  'מתקן כתפיים': 'bench',           // shoulder machine
  'מתקן גב': 'pullup_bar',          // back machine → pull family
  // ── Bars (generic) ────────────────────────────────────────────────────
  'מוט': 'barbell',
  'מוט נמוך': 'low_bar',
  'מוט גבוה': 'high_bar',
  // ── Mat / floor ───────────────────────────────────────────────────────
  'מזרן': 'mat',
  'מזרן יוגה': 'mat',
  'מזרן אימון': 'mat',
  // ── Jump rope ─────────────────────────────────────────────────────────
  'חבל קפיצה': 'jump_rope',
  'חבל קפיצה לאימון': 'jump_rope',
  // ── Other equipment ───────────────────────────────────────────────────
  'סולם קופים': 'monkey_bars',
  'קורת שיווי משקל': 'balance_beam',
  'רולר': 'foam_roller',
  'מדרגה': 'step',
  'מדרגות': 'stairs',
  'קיר': 'wall',
  'כיסא': 'chair',
  'דלת': 'door',
  'שולחן': 'table',
  'ספה': 'sofa',
  'תיק גב': 'back_pack',
  'חגורת משקולות': 'weight_belt',
  'בלוק יוגה': 'yoga_block',
  'שרפרף': 'stool',
  'חבל טיפוס': 'climbing_rope',
};

/**
 * Firestore document IDs used as gear IDs — map to fallback icon keys.
 * These IDs come from gear_definitions; maps to canonical icon keys.
 */
const FIRESTORE_GEAR_ID_TO_ICON: Record<string, string> = {
  // Resistance bands — ALL known Firestore IDs (duplicated docs from Admin)
  I1K30JehaxSx8dlBOZyd: 'resistance_bands',
  p9jowHV8JO0UAkbHPzUP: 'resistance_bands',
  '5Rkhxawxj8EwC4spTXVM': 'resistance_bands',
  FqFlaNZ02dlAQcXmhjOP: 'resistance_bands',
  // Rings
  mL3YJywh3aobJni7YVdu: 'rings',
  // Pull-up bar
  '9HVoe7t0PmaP5YJOYAlv': 'pullup_bar',
  // Dip station
  h3oFM4Xe6FE63OQzfh8x: 'dip_station',
  // TRX
  '7gLOFEfgSvInu7lfLHxV': 'trx',
  // Back pack
  kp7fek6IloLYhKmUs0VU: 'back_pack',
  // Unknown/unclassified
  F0vUP3Ro6wf1cUrmj2xR: 'unknown_gear',
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
export const ALIAS_TO_CANONICAL: Record<string, string> = {
  // ── Pull-up bar ────────────────────────────────────────────────────────────
  pullup_bar: 'pullup_bar',
  pull_up_bar: 'pullup_bar',
  pullupbar: 'pullup_bar',
  pullupBar: 'pullup_bar',
  pullUpBar: 'pullup_bar',
  pullupbar_park: 'pullup_bar',     // park fixture SVG filename used as a gear ID
  pullup_bar_park: 'pullup_bar',
  pull_up_bar_park: 'pullup_bar',
  // Hebrew: all pull-up bar variants (wide, narrow, rotating, high, devices)
  'מתח': 'pullup_bar',
  'מתח רחב': 'pullup_bar',
  'מתח צר': 'pullup_bar',
  'מתח סובב': 'pullup_bar',
  'מתח סטנדרטי': 'pullup_bar',
  'מתח גבוה': 'pullup_bar',
  'מוט מתח': 'pullup_bar',
  'סרגל מתח': 'pullup_bar',
  'מתקן מתח': 'pullup_bar',
  'סולם שוודי': 'pullup_bar',
  'מתקן גב': 'pullup_bar',
  // ── Dip station / parallel bars ───────────────────────────────────────────
  dip_station: 'dip_station',
  dipstation: 'dip_station',
  dipStation: 'dip_station',
  dip_bar: 'dip_station',
  parallel_bars: 'dip_station',
  parallelBars: 'dip_station',
  parallels: 'dip_station',
  bars: 'dip_station',
  // Hebrew: מקבילים / מתקן מקבילים + variants
  'מקבילים': 'dip_station',
  'מתקן מקבילים': 'dip_station',
  'מוט מקבילים': 'dip_station',
  'ברים': 'dip_station',
  // ── Resistance bands ───────────────────────────────────────────────────────
  resistance_band: 'resistance_bands',
  resistance_bands: 'resistance_bands',
  long_resistance_band: 'resistance_bands',
  bands: 'resistance_bands',
  // Hebrew: colloquial (גומייה / גומיות / גומי) + formal (גומיית התנגדות)
  'גומייה': 'resistance_bands',
  'גומיות': 'resistance_bands',
  'גומי': 'resistance_bands',
  'גומיית התנגדות': 'resistance_bands',
  'גומיות התנגדות': 'resistance_bands',
  // ── Rings ──────────────────────────────────────────────────────────────────
  rings: 'rings',
  gymnastic_rings: 'rings',
  // Hebrew: טבעות
  'טבעות': 'rings',
  'טבעות התעמלות': 'rings',
  // ── TRX / suspension ───────────────────────────────────────────────────────
  trx: 'trx',
  // ── Bench ──────────────────────────────────────────────────────────────────
  bench: 'bench',
  park_bench: 'bench',
  street_bench: 'bench',
  streetBench: 'bench',
  // ── Step / stairs ──────────────────────────────────────────────────────────
  step: 'step',
  park_step: 'step',
  stairs: 'stairs',
  // ── Bars (low/high) ────────────────────────────────────────────────────────
  low_bar: 'low_bar',
  lowBar: 'low_bar',
  high_bar: 'high_bar',
  highBar: 'high_bar',
  // ── Other common ───────────────────────────────────────────────────────────
  ab_wheel: 'ab_wheel',
  abdominal_wheel: 'ab_wheel',
  parallettes: 'parallettes',
  foam_roller: 'foam_roller',
  medicine_ball: 'medicine_ball',
  mat: 'mat',
  yoga_mat: 'mat',
  wall: 'wall',
  chair: 'chair',
  door: 'door',
  table: 'table',
  sofa: 'sofa',
  back_pack: 'back_pack',
  backpack: 'back_pack',
  yoga_block: 'yoga_block',
  weight_belt: 'weight_belt',
  pants: 'pants',
  monkey_bars: 'monkey_bars',
  ab_bench: 'ab_bench',
  balance_beam: 'balance_beam',
  jump_rope: 'jump_rope',
  skipping_rope: 'jump_rope',
  kettlebell: 'kettlebell',
  dumbbells: 'dumbbells',
  dumbbell: 'dumbbells',
  barbell: 'barbell',
  bar: 'barbell',
  climbing_rope: 'climbing_rope',
  bodyweight: 'bodyweight',
  none: 'none',
  // ── Hebrew equipment names used as iconKey or label in Firestore ────────────
  // These catch cases where Admin saved the Hebrew name as the iconKey.
  'ספה': 'sofa',
  'תיק גב': 'back_pack',
  'חגורת משקולות': 'weight_belt',
  'גלגל בטן': 'ab_wheel',
  'בלוק יוגה': 'yoga_block',
  'מכנסיים': 'pants',
  'שרפרף': 'stool',
  stool: 'stool',
  // ── Low bar / Australian bar (Hebrew) ──────────────────────────────────────
  'מתח נמוך': 'low_bar',
  'מתח אוסטרלי': 'low_bar',
  'מתח נמוך / אוסטרלי': 'low_bar',
  'אוסטרלי': 'low_bar',
  // ── Ab equipment (Hebrew) ──────────────────────────────────────────────────
  'במת בטן': 'ab_bench',
  'מתקן בטן': 'ab_bench',
  // ── Fixed machines — map to nearest canonical family ───────────────────────
  'מתקן לחיצת חזה': 'bench',
  'מתקן כתפיים': 'bench',
  // ── Bench variants (Hebrew) ────────────────────────────────────────────────
  'ספסל שיפוע': 'bench',
  'ספסל ישיבה': 'bench',
  // ── TRX (Hebrew) ──────────────────────────────────────────────────────────
  'רצועות TRX': 'trx',
  'רצועות': 'trx',
  // ── Alt spellings ─────────────────────────────────────────────────────────
  'קיטלבל': 'kettlebell',
  'משקולות יד': 'dumbbells',
  'מזרן יוגה': 'mat',
  'מזרן אימון': 'mat',
  'חבל קפיצה לאימון': 'jump_rope',
  // ── Firestore document IDs → canonical keys ────────────────────────────────
  // Resistance bands — ALL known Firestore IDs
  I1K30JehaxSx8dlBOZyd: 'resistance_bands',
  p9jowHV8JO0UAkbHPzUP: 'resistance_bands',
  '5Rkhxawxj8EwC4spTXVM': 'resistance_bands',
  FqFlaNZ02dlAQcXmhjOP: 'resistance_bands',
  // Rings
  mL3YJywh3aobJni7YVdu: 'rings',
  // Pull-up bar
  '9HVoe7t0PmaP5YJOYAlv': 'pullup_bar',
  // Dip station
  h3oFM4Xe6FE63OQzfh8x: 'dip_station',
  // TRX
  '7gLOFEfgSvInu7lfLHxV': 'trx',
  // Back pack
  kp7fek6IloLYhKmUs0VU: 'back_pack',
  // Unknown/unclassified
  F0vUP3Ro6wf1cUrmj2xR: 'unknown_gear',
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

// ============================================================================
// EQUIPMENT FAMILIES (Super-Keys)
// ============================================================================
//
// Groups of canonical keys that can satisfy each other's requirements.
// If an exercise requires ANY member of a family, having ANY OTHER member
// of the same family is a valid (though potentially sub-optimal) substitute.
//
// Use case: A park has a "Wide Pull-up Bar" (pullup_bar) but the exercise
// was tagged with a "Monkey Bars" ID. Both belong to FAMILY_OVERHEAD_BAR,
// so the exercise should still be available.
// ============================================================================

const EQUIPMENT_FAMILIES: Record<string, ReadonlySet<string>> = {
  overhead_bar: new Set(['pullup_bar', 'high_bar', 'monkey_bars']),
  dip_surface:  new Set(['dip_station', 'parallel_bars', 'parallettes']),
  bench_seat:   new Set(['bench', 'street_bench', 'ab_bench']),
  band_elastic: new Set(['resistance_bands', 'resistance_band', 'long_resistance_band']),
  bar_low:      new Set(['low_bar', 'parallel_bars']),
};

/** Reverse index: canonical key → family name (built once at module load). */
const CANONICAL_TO_FAMILY: Record<string, string> = {};
for (const [familyName, members] of Object.entries(EQUIPMENT_FAMILIES)) {
  members.forEach((member) => {
    CANONICAL_TO_FAMILY[member] = familyName;
  });
}

/**
 * Check whether two canonical equipment keys belong to the same family.
 * Returns true if either they are identical OR they share an equipment family.
 */
export function isEquipmentFamilyMatch(
  requiredCanonical: string,
  availableCanonical: string,
): boolean {
  if (requiredCanonical === availableCanonical) return true;
  const family = CANONICAL_TO_FAMILY[requiredCanonical];
  if (!family) return false;
  return EQUIPMENT_FAMILIES[family]?.has(availableCanonical) ?? false;
}

/**
 * Get the equipment family name for a canonical key, or null if it doesn't
 * belong to any family.
 */
export function getEquipmentFamily(canonicalKey: string): string | null {
  return CANONICAL_TO_FAMILY[canonicalKey] ?? null;
}

/**
 * Get all canonical keys in the same family as the given key.
 * Returns a set containing at least the key itself.
 */
export function getEquipmentFamilyMembers(canonicalKey: string): ReadonlySet<string> {
  const family = CANONICAL_TO_FAMILY[canonicalKey];
  if (!family) return new Set([canonicalKey]);
  return EQUIPMENT_FAMILIES[family];
}

/**
 * Check whether a gear item is marked as optional ("nice to have").
 * Accepts a raw Firestore ID or a canonical key.
 * Falls back to false if the item is not found in the cache.
 */
export function isGearOptional(rawId: string): boolean {
  if (!gearDefinitionsCache) return false;
  const gear = gearDefinitionsCache.find((g) => g.id === rawId);
  if (gear) return gear.isOptional === true;
  const canonical = normalizeGearId(rawId);
  const byCanonical = gearDefinitionsCache.find(
    (g) => g.iconKey === canonical || normalizeGearId(g.id) === canonical,
  );
  return byCanonical?.isOptional === true;
}

/**
 * Normalise a raw gear/equipment ID (from Firestore, Admin, or legacy data)
 * to its canonical semantic key. Returns the original ID lowercased if no
 * alias is found — this ensures unknown IDs still participate in matching.
 */
export function normalizeGearId(rawId: string): string {
  if (ALIAS_TO_CANONICAL[rawId]) return ALIAS_TO_CANONICAL[rawId];
  const lower = rawId.toLowerCase().replace(/-/g, '_');
  if (ALIAS_TO_CANONICAL[lower]) return ALIAS_TO_CANONICAL[lower];
  // If the ID is a Hebrew label, resolve through the label map.
  if (LABEL_TO_ICON_KEY[rawId]) return LABEL_TO_ICON_KEY[rawId];

  // FIRESTORE_GEAR_ID_TO_ICON — static fallback before runtime cache
  if (FIRESTORE_GEAR_ID_TO_ICON[rawId]) return FIRESTORE_GEAR_ID_TO_ICON[rawId];

  // Runtime cache: resolve Firestore IDs that aren't in the static map.
  // Try iconKey first, then fall back to the item's Hebrew name.
  if (gearDefinitionsCache) {
    const gear = gearDefinitionsCache.find((g) => g.id === rawId);
    if (gear) {
      // Name-based resolution takes priority: avoids incorrect iconKey values.
      const heName = gear.name?.he;
      if (heName) {
        const fromLabel = LABEL_TO_ICON_KEY[heName] ?? ALIAS_TO_CANONICAL[heName];
        if (fromLabel) return fromLabel;
      }
      if (gear.iconKey) {
        return ALIAS_TO_CANONICAL[gear.iconKey] ?? LABEL_TO_ICON_KEY[gear.iconKey] ?? gear.iconKey;
      }
    }
  }
  if (gymEquipmentCache) {
    const gym = gymEquipmentCache.find((g) => g.id === rawId);
    if (gym) {
      // Name-based resolution takes priority over iconKey for gym equipment,
      // because some Firestore docs have incorrect iconKey values (e.g. 'rings'
      // on a pullup bar installation).
      if (gym.name) {
        const fromLabel = LABEL_TO_ICON_KEY[gym.name] ?? ALIAS_TO_CANONICAL[gym.name];
        if (fromLabel) return fromLabel;
      }
      if (gym.iconKey) {
        return ALIAS_TO_CANONICAL[gym.iconKey] ?? LABEL_TO_ICON_KEY[gym.iconKey] ?? gym.iconKey;
      }
    }
  }

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

// ============================================================================
// Category priority — lower number = displayed first in equipment badge rows.
// Values match the 'category' field saved by GearDefinitionEditorForm.tsx.
// ============================================================================

/**
 * Display priority for each GearDefinition category.
 * Edit this object if you add new categories in the Admin.
 */
export const CATEGORY_PRIORITY: Record<string, number> = {
  stationary:  0, // pull-up bar, dip station, rings
  suspension:  1, // TRX, gymnastics rings (treated as stationary-ish)
  resistance:  2, // bands
  weights:     3, // dumbbells, kettlebells, barbell
  accessories: 4, // mat, jump rope
  cardio:      5, // bike, treadmill
  improvised:  6, // chair, table, wall
};

/** Canonical iconKey → category (populated by registerGearAlias at runtime). */
const GEAR_CATEGORY_MAP: Record<string, string> = {};

/**
 * Register a Firestore document ID as an alias for a canonical key.
 *
 * Now also accepts an optional Hebrew `name` so that items WITHOUT an
 * iconKey can still be resolved.  Resolution order:
 *   1. rawIconKey (explicit) → canonicalised via LABEL_TO_ICON_KEY
 *   2. hebrewName → canonicalised via LABEL_TO_ICON_KEY
 *   3. If both fail, the item is still stored with its raw iconKey (or
 *      name) so that normalizeGearId's runtime-cache path can catch it.
 *
 * Call at app boot once gym_equipment / gear_definitions are fetched.
 */
export function registerGearAlias(
  firestoreId: string,
  rawIconKey: string | undefined | null,
  category?: string,
  hebrewName?: string,
): void {
  // Resolve the canonical key from iconKey first, then from Hebrew name.
  let iconKey: string | undefined;
  if (rawIconKey) {
    iconKey = LABEL_TO_ICON_KEY[rawIconKey] ?? ALIAS_TO_CANONICAL[rawIconKey] ?? rawIconKey;
  }
  if (!iconKey && hebrewName) {
    iconKey = LABEL_TO_ICON_KEY[hebrewName] ?? ALIAS_TO_CANONICAL[hebrewName];
  }

  if (iconKey) {
    ALIAS_TO_CANONICAL[firestoreId] = iconKey;
    if (!ICON_KEY_TO_SVG[iconKey]) {
      ICON_KEY_TO_SVG[iconKey] = `/assets/icons/equipment/${iconKey}.svg`;
    }
    if (category) GEAR_CATEGORY_MAP[iconKey] = category;
  }
}

/**
 * Resolve a canonical or raw gear ID to its GearDefinition category string
 * (e.g. 'stationary', 'accessories', 'improvised').
 * Returns null when the category is unknown.
 */
export function resolveEquipmentCategory(id: string): string | null {
  if (GEAR_CATEGORY_MAP[id]) return GEAR_CATEGORY_MAP[id];
  const canonical = ALIAS_TO_CANONICAL[id];
  if (canonical && GEAR_CATEGORY_MAP[canonical]) return GEAR_CATEGORY_MAP[canonical];
  return null;
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

/**
 * Maps canonical gear keys to the actual SVG file that exists on disk.
 * IMPORTANT: Every path here MUST correspond to a real file in
 * /public/assets/icons/equipment/. Pointing to a missing file causes
 * every badge to fall through to the Dumbbell fallback.
 *
 * Verified files (ls public/assets/icons/equipment/):
 *   pullupbar_park.svg, parallel_bars.svg, parallel_bars_home.svg,
 *   long_resistance_band.svg, rings.svg, ring_park.svg,
 *   trx.svg, mat.svg, chair.svg, kettlebell.svg, table.svg,
 *   street_bench.svg, skipping_rope.svg, steps.svg, stool.svg,
 *   parallel_bars_home.svg
 *
 * Location-aware resolution: resolveEquipmentSvgPathList appends a
 * _{location} suffix before the .svg extension so, for example,
 * parallel_bars + home → parallel_bars_home.svg (which exists).
 */
// ── Base paths (generic / park default) ──────────────────────────────────────
// Each key maps to the file that ACTUALLY exists on disk.
// Location-specific variants are in the _LOCATION_VARIANTS section below.
const ICON_KEY_TO_SVG: Record<string, string> = {
  // Pull-up bar — park asset is the primary; door variant available for home.
  pull_up_bar:      '/assets/icons/equipment/pullupbar_park.svg',
  pullup_bar:       '/assets/icons/equipment/pullupbar_park.svg',
  pullUpBar:        '/assets/icons/equipment/pullupbar_park.svg',
  pullupbar_park:   '/assets/icons/equipment/pullupbar_park.svg', // park SVG ID used as gear ID
  pullup_bar_park:  '/assets/icons/equipment/pullupbar_park.svg',
  // Dip station / parallel bars
  dip_station:   '/assets/icons/equipment/parallel_bars.svg',
  dipStation:    '/assets/icons/equipment/parallel_bars.svg',
  parallel_bars: '/assets/icons/equipment/parallel_bars.svg',
  // Rings — generic base (no location); park-specific variant listed below.
  rings:           '/assets/icons/equipment/rings.svg',
  gymnastic_rings: '/assets/icons/equipment/rings.svg',
  // Resistance bands (colloquial + formal, all share one file)
  resistance_bands: '/assets/icons/equipment/long_resistance_band.svg',
  resistance_band:  '/assets/icons/equipment/long_resistance_band.svg',
  bands:            '/assets/icons/equipment/long_resistance_band.svg',
  // TRX / suspension
  trx: '/assets/icons/equipment/trx.svg',
  // Common accessories (verified files on disk)
  mat:           '/assets/icons/equipment/mat.svg',
  yoga_mat:      '/assets/icons/equipment/mat.svg',
  chair:         '/assets/icons/equipment/chair.svg',
  kettlebell:    '/assets/icons/equipment/kettlebell.svg',
  table:         '/assets/icons/equipment/table.svg',
  street_bench:  '/assets/icons/equipment/street_bench.svg',
  bench:         '/assets/icons/equipment/street_bench.svg',
  jump_rope:     '/assets/icons/equipment/skipping_rope.svg',
  skipping_rope: '/assets/icons/equipment/skipping_rope.svg',
  step:          '/assets/icons/equipment/steps.svg',
  stairs:        '/assets/icons/equipment/steps.svg',
  stool:         '/assets/icons/equipment/stool.svg',
  sofa:          '/assets/icons/equipment/sofa.svg',
  back_pack:     '/assets/icons/equipment/back_pack.svg',
  backpack:      '/assets/icons/equipment/back_pack.svg',
  yoga_block:    '/assets/icons/equipment/yoga_block.svg',
  weight_belt:   '/assets/icons/equipment/weight_belt.svg',
  ab_wheel:      '/assets/icons/equipment/Abdominal_wheel.svg',
  abdominal_wheel: '/assets/icons/equipment/Abdominal_wheel.svg',
  pants:          '/assets/icons/equipment/pants.svg',
  climbing_rope:  '/assets/icons/equipment/Climbing rope.svg',

  // ── Location-specific variants ────────────────────────────────────────────
  // Keys follow the pattern `{canonical}_{location}`.
  // resolveEquipmentSvgPathList looks these up explicitly so it NEVER
  // requests a path that does not exist on disk (zero 404s).
  rings_park:           '/assets/icons/equipment/ring_park.svg',
  parallel_bars_home:   '/assets/icons/equipment/parallel_bars_home.svg',
  dip_station_home:     '/assets/icons/equipment/parallel_bars_home.svg',
  pullup_bar_home:      '/assets/icons/equipment/pullup_bar_door.svg',
  pull_up_bar_home:     '/assets/icons/equipment/pullup_bar_door.svg',
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

/**
 * Returns an ordered list of SVG paths to try for a given equipment ID and
 * optional workout location context (e.g. 'park', 'home', 'gym').
 *
 * Resolution order:
 *   1. Location-specific variant (e.g. `rings_park` → `ring_park.svg`)
 *      — ONLY included when the variant key is explicitly in ICON_KEY_TO_SVG.
 *      This prevents 404s: we never request a path we don't know exists.
 *   2. Generic base path (e.g. `rings.svg`)
 *
 * The caller should attempt each path in sequence; fall back to PersonStanding
 * (bodyweight) when the list is empty (i.e. resolveEquipmentSvgPath returned null).
 */
export function resolveEquipmentSvgPathList(
  id: string,
  location?: string | null,
): string[] {
  const base = resolveEquipmentSvgPath(id);
  if (!base) return [];
  if (!location) return [base];

  const suffix = location.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!suffix) return [base];

  // Resolve the canonical key so the variant lookup uses consistent keys.
  const canonical = ALIAS_TO_CANONICAL[id] ?? id.toLowerCase().replace(/-/g, '_');
  const variantKey = `${canonical}_${suffix}`;
  const variantPath = ICON_KEY_TO_SVG[variantKey];

  // Return [variant, base] only when the variant file is known to exist.
  // If base already encodes the location (e.g. pullupbar_park.svg + location=park),
  // the variant path would be identical to base — deduplicate silently.
  if (variantPath && variantPath !== base) return [variantPath, base];

  return [base];
}

// ============================================================================
// Equipment Resolution Report — temporary diagnostic tool
//
// Call reportEquipmentResolution() from any component to get a full trace of
// how each gear ID is normalised, which SVG paths are attempted, and why a
// Dumbbell fallback appears. Remove calls once the mapping is finalised.
// ============================================================================

/** One entry per exercise for the diagnostic report. */
export interface GearReportExercise {
  exerciseName: string;
  rawIds: string[];
}

/**
 * Prints a structured console report showing the full resolution pipeline for
 * every piece of gear in the given exercise list.
 *
 * @param source  Label identifying which component is calling (e.g. 'TrioCard').
 * @param exercises  Per-exercise breakdown of raw gear IDs.
 * @param location  Workout location context ('park' | 'home' | null).
 */
export function reportEquipmentResolution(
  source: string,
  exercises: GearReportExercise[],
  location?: string | null,
): void {
  // Set of paths that are explicitly registered in ICON_KEY_TO_SVG (≡ exist on disk).
  const knownPaths = new Set(Object.values(ICON_KEY_TO_SVG));

  const seenNorms = new Set<string>();
  const countedNorms: string[] = [];   // norms that pass all filters and enter the final count
  const skippedNorms: { norm: string; reason: string }[] = [];

  console.group(`🔧 [EquipmentReport][${source}] location="${location ?? 'none'}"`);

  for (const ex of exercises) {
    console.group(`📦 Exercise: "${ex.exerciseName}"`);
    console.log('  Raw IDs:', ex.rawIds.length ? ex.rawIds : '(none)');

    for (const raw of ex.rawIds) {
      // ── Step 1: normalisation ─────────────────────────────────────────────
      const aliasHit = ALIAS_TO_CANONICAL[raw];
      const norm     = normalizeGearId(raw);

      // ── Step 2: skip checks ───────────────────────────────────────────────
      if (norm === 'bodyweight' || norm === 'none' || norm === 'unknown_gear') {
        skippedNorms.push({ norm: raw, reason: `filtered (norm="${norm}")` });
        console.log(
          `  ⛔ "${raw}" → norm="${norm}" — SKIPPED (bodyweight/none/unknown_gear)`,
        );
        continue;
      }
      if (seenNorms.has(norm)) {
        skippedNorms.push({ norm: raw, reason: `duplicate of "${norm}"` });
        console.log(`  🔁 "${raw}" → norm="${norm}" — SKIPPED (duplicate)`);
        continue;
      }
      seenNorms.add(norm);

      // ── Step 3: asset resolution ──────────────────────────────────────────
      const basePath  = resolveEquipmentSvgPath(norm);
      const srcList   = resolveEquipmentSvgPathList(norm, location);
      const label     = resolveEquipmentLabel(norm);

      const pathAnalysis = srcList.map((p) => ({
        path: p,
        knownOnDisk: knownPaths.has(p),
      }));

      const aliasNote = aliasHit
        ? `ALIAS_TO_CANONICAL["${raw}"] → "${aliasHit}"`
        : `no alias — lowercased to "${norm}"`;

      console.log(
        `  ✅ "${raw}"\n` +
        `     Normalisation : ${aliasNote}\n` +
        `     Canonical key : "${norm}"\n` +
        `     Label         : "${label}"\n` +
        `     Base SVG path : ${basePath ?? '❌ null (no entry in ICON_KEY_TO_SVG)'}`,
      );

      if (pathAnalysis.length === 0) {
        console.warn(
          `     Asset list    : ⚠️ EMPTY — Dumbbell will render.\n` +
          `     ➜ Fix: add "${norm}" or an alias to ICON_KEY_TO_SVG in gear-mapping.utils.ts`,
        );
        skippedNorms.push({ norm, reason: 'no SVG path resolved' });
        continue;
      }

      console.log(`     Asset list (${srcList.length} path${srcList.length > 1 ? 's' : ''}, tried in order):`);
      pathAnalysis.forEach(({ path, knownOnDisk }, i) => {
        const tag = knownOnDisk ? '✅ exists in ICON_KEY_TO_SVG' : '⚠️ NOT in ICON_KEY_TO_SVG — may 404';
        console.log(`       [${i}] ${path}   ${tag}`);
      });
      console.log(`     Final decision: will show icon (first path that loads without error)`);

      countedNorms.push(norm);
    }

    console.groupEnd();
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.group(`📊 Summary`);
  console.log(`  Total counted (icons array) : ${countedNorms.length}`);
  console.log(`  Displayed (max 4)           : ${Math.min(countedNorms.length, 4)}`);
  console.log(`  Overflow (+N) pill          : ${countedNorms.length > 4 ? `+${countedNorms.length - 4}` : 'none'}`);
  console.log(`  Counted canonical keys      :`, countedNorms);
  if (skippedNorms.length) {
    console.log(`  Skipped entries             :`, skippedNorms);
  }
  console.groupEnd();

  console.groupEnd(); // root group
}

// ============================================================================
// DIAGNOSTIC: Full mapping audit table
// Call from browser console: import('/path').then(m => m.printMappingAudit())
// Or call from any component: printMappingAudit()
// ============================================================================

/**
 * Print a formatted table of ALL Firestore IDs, canonical keys, Hebrew labels,
 * and SVG paths. Helps David verify every mapping is correct.
 */
export function printMappingAudit(): void {
  console.log('\n' + '='.repeat(90));
  console.log('📋 EQUIPMENT MAPPING AUDIT TABLE');
  console.log('='.repeat(90));

  // ── Section 1: Firestore Document IDs ──────────────────────────────────────
  console.log('\n── FIRESTORE IDs → Canonical → Hebrew ──');
  const firestoreEntries = Object.entries(FIRESTORE_GEAR_ID_TO_ICON);
  const firestoreRows = firestoreEntries.map(([fsId, iconKey]) => ({
    'Firestore ID': fsId,
    'Canonical Key': iconKey,
    'Hebrew Label': EQUIPMENT_NAME_HE[iconKey] ?? '❌ MISSING',
    'SVG Path': ICON_KEY_TO_SVG[iconKey] ?? '❌ NO SVG',
    'Also in ALIAS': ALIAS_TO_CANONICAL[fsId] === iconKey ? '✅' : `❌ (${ALIAS_TO_CANONICAL[fsId] ?? 'absent'})`,
  }));
  console.table(firestoreRows);

  // ── Section 2: All canonical keys in EQUIPMENT_NAME_HE ─────────────────────
  console.log('\n── ALL Canonical Keys → Hebrew Labels ──');
  const hebrewRows = Object.entries(EQUIPMENT_NAME_HE).map(([key, label]) => ({
    'Key': key,
    'Hebrew Label': label,
    'Has SVG': ICON_KEY_TO_SVG[key] ? '✅' : (ICON_KEY_TO_SVG[ALIAS_TO_CANONICAL[key]] ? '✅ (via alias)' : '—'),
  }));
  console.table(hebrewRows);

  // ── Section 3: Consistency check — keys in ALIAS but NOT in EQUIPMENT_NAME_HE
  console.log('\n── Consistency Check: Canonical Keys Missing Hebrew Labels ──');
  const uniqueCanonicals = new Set(Object.values(ALIAS_TO_CANONICAL));
  const missing: string[] = [];
  uniqueCanonicals.forEach((canonical) => {
    if (!EQUIPMENT_NAME_HE[canonical]) {
      missing.push(canonical);
    }
  });
  if (missing.length === 0) {
    console.log('✅ All canonical keys have Hebrew labels.');
  } else {
    console.warn('❌ These canonical keys have NO Hebrew label:');
    missing.forEach((k) => console.warn(`   • ${k}`));
  }

  // ── Section 4: Reverse check — SVG keys without Hebrew label
  console.log('\n── SVG Keys Without Hebrew Label ──');
  const svgMissing: string[] = [];
  Object.keys(ICON_KEY_TO_SVG).forEach((svgKey) => {
    if (!EQUIPMENT_NAME_HE[svgKey] && !svgKey.includes('_park') && !svgKey.includes('_home')) {
      svgMissing.push(svgKey);
    }
  });
  if (svgMissing.length === 0) {
    console.log('✅ All SVG keys have Hebrew labels.');
  } else {
    console.warn('❌ These SVG keys have NO Hebrew label:');
    svgMissing.forEach((k) => console.warn(`   • ${k} → ${ICON_KEY_TO_SVG[k]}`));
  }

  console.log('\n' + '='.repeat(90));
}
