/**
 * Outdoor Equipment Brand Types
 * Defines the structure for outdoor equipment brands in the 'outdoorBrands' collection
 */

export interface OutdoorBrand {
  id: string;
  name: string; // Brand name (e.g., "Saly", "Ludos", "Generic Urban")
  logoUrl?: string; // URL to brand logo image
  brandColor?: string; // Brand color (hex code, e.g., "#FF5733")
  website?: string; // Brand website URL
  videoUrl?: string; // Link to brand video (YouTube/Vimeo)
  description?: string; // Brand description
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Form data for creating/editing outdoor brands
 */
export type OutdoorBrandFormData = Omit<OutdoorBrand, 'id' | 'createdAt' | 'updatedAt'>;
