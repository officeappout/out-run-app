/**
 * Category Branding Service
 * Manages brand icons for facility types, sub-types, and sports categories.
 * Data is stored in Firestore `category_branding` collection (single config doc).
 */

import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

// ============================================
// TYPES
// ============================================

/**
 * All brandable category keys — facility types + sub-types
 */
export type BrandingCategoryKey =
  // Facility groups
  | 'gym_park'
  | 'court'
  | 'route'
  | 'zen_spot'
  | 'urban_spot'
  | 'nature_community'
  // Court sub-types
  | 'basketball'
  | 'football'
  | 'tennis'
  | 'padel'
  // Urban sub-types — Movement
  | 'stairs'
  | 'bench'
  | 'skatepark'
  // Urban sub-types — Assets
  | 'water_fountain'
  | 'toilets'
  | 'parking'
  | 'bike_rack'
  // Nature sub-types
  | 'spring'
  | 'observation_point'
  | 'dog_park';

export interface CategoryBrandingEntry {
  /** Custom icon URL in Firebase Storage (SVG or PNG) */
  iconUrl?: string;
  /** Timestamp of last upload */
  updatedAt?: string;
}

/** The full branding config document shape */
export type CategoryBrandingConfig = Record<string, CategoryBrandingEntry>;

// ============================================
// CONSTANTS — System defaults (emoji fallbacks)
// ============================================

export const SYSTEM_DEFAULT_ICONS: Record<BrandingCategoryKey, string> = {
  gym_park: '🏋️',
  court: '🏀',
  route: '🛤️',
  zen_spot: '🧘',
  urban_spot: '🏙️',
  nature_community: '🌿',
  basketball: '🏀',
  football: '⚽',
  tennis: '🎾',
  padel: '🏓',
  stairs: '🪜',
  bench: '🪑',
  skatepark: '🛹',
  water_fountain: '🚰',
  toilets: '🚻',
  parking: '🅿️',
  bike_rack: '🚲',
  spring: '🌊',
  observation_point: '🏔️',
  dog_park: '🐕',
};

/** Human-readable Hebrew labels for each category */
export const CATEGORY_LABELS: Record<BrandingCategoryKey, string> = {
  gym_park: 'גינות כושר',
  court: 'מגרשי ספורט',
  route: 'מסלולים',
  zen_spot: 'גוף-נפש',
  urban_spot: 'אורבן / אקסטרים',
  nature_community: 'טבע וקהילה',
  basketball: 'כדורסל',
  football: 'כדורגל',
  tennis: 'טניס',
  padel: 'פאדל',
  stairs: 'מדרגות',
  bench: 'ספסלים',
  skatepark: 'סקייטפארק',
  water_fountain: 'ברזיות מים',
  toilets: 'שירותים',
  parking: 'חנייה',
  bike_rack: 'מתקני אופניים',
  spring: 'מעיינות',
  observation_point: 'נקודות תצפית',
  dog_park: 'גינות כלבים',
};

/** Grouping for the UI grid */
export interface BrandingGroup {
  label: string;
  color: string;
  keys: BrandingCategoryKey[];
}

export const BRANDING_GROUPS: BrandingGroup[] = [
  {
    label: 'סוגי מתקנים ראשיים',
    color: '#8B5CF6',
    keys: ['gym_park', 'court', 'route', 'zen_spot', 'urban_spot', 'nature_community'],
  },
  {
    label: 'מגרשי ספורט',
    color: '#F59E0B',
    keys: ['basketball', 'football', 'tennis', 'padel'],
  },
  {
    label: 'תשתית עירונית',
    color: '#6366F1',
    keys: ['stairs', 'bench', 'skatepark', 'water_fountain', 'toilets', 'parking', 'bike_rack'],
  },
  {
    label: 'טבע וקהילה',
    color: '#10B981',
    keys: ['spring', 'observation_point', 'dog_park'],
  },
];

// ============================================
// FIRESTORE CONFIG DOC
// ============================================

const CONFIG_DOC_PATH = 'category_branding';
const CONFIG_DOC_ID = 'icons';

// ============================================
// IN-MEMORY CACHE
// ============================================

let _cache: CategoryBrandingConfig | null = null;
let _cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ============================================
// SERVICE FUNCTIONS
// ============================================

/**
 * Fetch the full branding config from Firestore (with cache)
 */
export async function getCategoryBranding(): Promise<CategoryBrandingConfig> {
  const now = Date.now();
  if (_cache && now - _cacheTimestamp < CACHE_TTL_MS) {
    return _cache;
  }

  try {
    const docRef = doc(db, CONFIG_DOC_PATH, CONFIG_DOC_ID);
    const snapshot = await getDoc(docRef);

    if (snapshot.exists()) {
      _cache = snapshot.data() as CategoryBrandingConfig;
    } else {
      _cache = {};
    }
    _cacheTimestamp = now;
    return _cache;
  } catch (error) {
    console.error('Error fetching category branding:', error);
    return _cache || {};
  }
}

/**
 * Update a single category's brand icon URL
 */
export async function setCategoryBrandIcon(
  key: BrandingCategoryKey,
  iconUrl: string
): Promise<void> {
  try {
    const docRef = doc(db, CONFIG_DOC_PATH, CONFIG_DOC_ID);
    const entry: CategoryBrandingEntry = {
      iconUrl,
      updatedAt: new Date().toISOString(),
    };

    await setDoc(docRef, { [key]: entry }, { merge: true });

    // Update cache
    if (_cache) {
      _cache[key] = entry;
    }
  } catch (error) {
    console.error(`Error setting brand icon for ${key}:`, error);
    throw error;
  }
}

/**
 * Reset a category's brand icon (remove custom icon, revert to system default)
 */
export async function resetCategoryBrandIcon(
  key: BrandingCategoryKey
): Promise<void> {
  try {
    const docRef = doc(db, CONFIG_DOC_PATH, CONFIG_DOC_ID);
    const entry: CategoryBrandingEntry = {
      iconUrl: undefined,
      updatedAt: new Date().toISOString(),
    };

    await setDoc(docRef, { [key]: entry }, { merge: true });

    // Update cache
    if (_cache) {
      _cache[key] = entry;
    }
  } catch (error) {
    console.error(`Error resetting brand icon for ${key}:`, error);
    throw error;
  }
}

/**
 * Invalidate cache (useful after admin changes)
 */
export function invalidateBrandingCache(): void {
  _cache = null;
  _cacheTimestamp = 0;
}
