/**
 * Park Management Types
 * Unified types for Parks (formerly Park + MapPark)
 */
import { ParkGymEquipment } from '@/features/content/equipment/gym';

export type ParkFacilityType = 'static' | 'cardio' | 'machine';

export interface ParkFacility {
  name: string;       // e.g., "מתח", "מקבילים"
  type: ParkFacilityType;
  image?: string;
  video?: string;
}

export interface ParkAmenities {
  hasShadow: boolean;    // יש צל
  hasLighting: boolean;  // יש תאורה
  hasToilets: boolean;   // יש שירותים
  hasWater: boolean;     // יש מים
}

export type ParkStatus = 'open' | 'under_repair' | 'closed';

/**
 * Unified Park Interface
 * Combines admin Park and client MapPark into single type
 */
export interface Park {
  id: string;
  name: string;
  city?: string;       // Optional for MapPark compatibility
  address?: string;    // From MapPark
  description?: string; // Optional for MapPark compatibility
  
  // Location (dual format for backward compatibility)
  location: { lat: number; lng: number };
  lat?: number;  // Deprecated: use location.lat
  lng?: number;  // Deprecated: use location.lng
  
  // Equipment & Facilities
  image?: string;     // Main park image
  facilities?: ParkFacility[]; // Optional for MapPark compatibility
  gymEquipment?: ParkGymEquipment[];
  amenities?: ParkAmenities;
  
  // Admin metadata
  authorityId?: string; // Link to authority (for Authority Manager access)
  status?: ParkStatus;
  
  // Display metadata (from MapPark)
  rating?: number;
  adminQualityScore?: number;
  imageUrl?: string;  // Alternative to 'image'
  whatsappLink?: string;
  isVerified?: boolean;
  distance?: number;  // Runtime field - distance from user
  
  // MapPark-specific features
  hasDogPark?: boolean;
  hasWaterFountain?: boolean;
  hasLights?: boolean;
  isShaded?: boolean;
  
  // Timestamps
  createdAt?: Date;
  updatedAt?: Date;
  
  // Legacy support
  maximumTime?: {
    [key: number]: number;
  };
  
  // Linear park support
  segmentEndpoints?: {
    start: { lat: number; lng: number };
    end: { lat: number; lng: number };
  };
}

/**
 * @deprecated Use Park instead. MapPark is kept for backward compatibility.
 */
export type MapPark = Park;
