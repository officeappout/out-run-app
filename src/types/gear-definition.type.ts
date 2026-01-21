/**
 * User Gear Definitions Types
 * Simple gear items that users own (e.g., "גומיות", "משקולות", "חבל קפיצה")
 * These do NOT have brands or videos - they are simple definitions
 */

import type { LocalizedText } from './exercise.type';

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
   * Used for \"Shop\" CTAs in the app
   */
  shopLink?: string;

  /**
   * Optional URL for a tutorial / product explanation video
   * Can be a YouTube/Vimeo link or any video URL
   */
  tutorialVideo?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Form data for creating/editing gear definitions
 */
export type GearDefinitionFormData = Omit<GearDefinition, 'id' | 'createdAt' | 'updatedAt'>;
