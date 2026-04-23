/**
 * User Gear Definitions Types
 * Simple gear items that users own (e.g., "גומיות", "משקולות", "חבל קפיצה")
 * These do NOT have brands or videos - they are simple definitions
 */

import type { LocalizedText } from '../../../shared/localized-text.types';

/**
 * User Gear Definition document structure in Firestore
 */
export interface GearDefinition {
  id: string;
  /**
   * Localized gear name (Hebrew/English).
   */
  name: Pick<LocalizedText, 'he' | 'en'>;
  /**
   * Localized description (Hebrew/English).
   */
  description?: Pick<LocalizedText, 'he' | 'en'>;
  icon?: string; // Lucide icon name (e.g., "Dumbbell", "Package")
  /**
   * Custom branded icon URL (uploaded to Firebase Storage)
   * If provided, this takes precedence over the Lucide icon
   */
  customIconUrl?: string;
  /**
   * Filename stem of the SVG icon in /public/assets/icons/equipment/.
   * E.g. "pullupbar" → /assets/icons/equipment/pullupbar.svg
   * Takes precedence over `icon` and `customIconUrl` in the workout card UI.
   * Used by resolveEquipmentSvgPath via registerGearAlias at runtime.
   */
  iconKey?: string;
  /**
   * Equipment family (physical type, not movement type)
   * Allowed values (UX-aligned):
   * - suspension   (e.g., Rings, TRX)
   * - resistance   (e.g., Bands)
   * - weights      (e.g., Dumbbells, Kettlebells)
   * - stationary   (e.g., Pull-up Bar, Dip Station)
   * - accessories  (e.g., Yoga Mat, Jump Rope)
   * - cardio       (e.g., Bike, Treadmill)
   */
  category?: string;

  /**
   * Optional affiliate/shop URL for this gear item
   * Used for "Shop" CTAs in the app
   */
  shopLink?: string;

  /**
   * Optional URL for a tutorial / product explanation video
   * Can be a YouTube/Vimeo link or any video URL
   */
  tutorialVideo?: string;
  /**
   * Locations where this gear is allowed/available
   * Options: 'home' | 'park' | 'office' | 'street' | 'gym'
   */
  allowedLocations?: string[];
  /**
   * Default/primary location for this gear
   */
  defaultLocation?: string;
  /**
   * Lifestyle tags for this gear (e.g., ['student', 'parent', 'office_worker'])
   */
  lifestyleTags?: string[];
  /**
   * When true, this gear is "nice to have" — exercises won't be blocked
   * if the user doesn't own it, and the SwapEngine penalty is reduced.
   * Examples: Mat, Jump Rope, Chair, Stool.
   */
  isOptional?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Form data for creating/editing gear definitions
 */
export type GearDefinitionFormData = Omit<GearDefinition, 'id' | 'createdAt' | 'updatedAt'>;
