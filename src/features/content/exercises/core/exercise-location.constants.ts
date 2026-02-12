/**
 * Centralized ExecutionLocation Constants
 *
 * SINGLE SOURCE OF TRUTH for location IDs, Hebrew labels, and icons.
 * Every file in the codebase that needs location labels MUST import
 * from here. No local duplicates allowed.
 *
 * IDs match the Firestore `execution_methods[].location` field exactly.
 * @see exercise.types.ts – ExecutionLocation type definition
 */

import { ExecutionLocation } from './exercise.types';

// ============================================================================
// LABELS (Hebrew + English)
// ============================================================================

/**
 * Canonical Hebrew + English labels for every ExecutionLocation.
 * These labels are used across Admin Panel, AdjustWorkoutModal,
 * Simulator, Content Matrix, and anywhere else locations appear.
 */
export const EXECUTION_LOCATION_LABELS: Record<
  ExecutionLocation,
  { he: string; en: string; icon: string }
> = {
  home:    { he: 'בית',        en: 'Home',    icon: '🏠' },
  park:    { he: 'פארק',       en: 'Park',    icon: '🌳' },
  street:  { he: 'רחוב',       en: 'Street',  icon: '🏃' },
  office:  { he: 'משרד',       en: 'Office',  icon: '💼' },
  school:  { he: 'בית ספר',    en: 'School',  icon: '🏫' },
  gym:     { he: 'חדר כושר',   en: 'Gym',     icon: '🏋️' },
  airport: { he: 'שדה תעופה',  en: 'Airport', icon: '✈️' },
  library: { he: 'ספרייה',     en: 'Library', icon: '📚' },
};

// ============================================================================
// DERIVED ARRAYS (for dropdowns / selectors)
// ============================================================================

/**
 * All 8 locations as a flat array — ready for UI selectors.
 * Each entry carries the exact ExecutionLocation ID plus labels.
 */
export const LOCATION_OPTIONS_ARRAY: {
  id: ExecutionLocation;
  label: string;
  labelEn: string;
  icon: string;
}[] = (Object.entries(EXECUTION_LOCATION_LABELS) as [ExecutionLocation, { he: string; en: string; icon: string }][]).map(
  ([id, data]) => ({
    id,
    label: data.he,
    labelEn: data.en,
    icon: data.icon,
  }),
);

/**
 * Hebrew-only label map (convenience for quick lookups).
 * Equivalent to the old local LOCATION_LABELS constants.
 */
export const LOCATION_LABELS_HE: Record<ExecutionLocation, string> = Object.fromEntries(
  Object.entries(EXECUTION_LOCATION_LABELS).map(([k, v]) => [k, v.he]),
) as Record<ExecutionLocation, string>;
