/**
 * Outdoor Equipment Brand Types
 * Defines the structure for outdoor equipment brands in the 'outdoorBrands' collection
 */

import type { LocalizedText } from '../../../shared/localized-text.types';

export interface OutdoorBrand {
  id: string;
  /** Hebrew string always; Firestore may hold {he,en} (the service normalizes, English rides in nameLocalized). */
  name: string; // Brand name (e.g., "Saly", "Ludos", "Generic Urban")
  nameLocalized?: LocalizedText;
  logoUrl?: string; // URL to brand logo image
  brandColor?: string; // Brand color (hex code, e.g., "#FF5733")
  website?: string; // Brand website URL
  videoUrl?: string; // Link to brand video (YouTube/Vimeo)
  description?: string; // Brand description
  descriptionLocalized?: LocalizedText;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Form data for creating/editing outdoor brands
 */
export type OutdoorBrandFormData = Omit<OutdoorBrand, 'id' | 'createdAt' | 'updatedAt'>;
