export type ParkFacilityType = 'static' | 'cardio' | 'machine';

export interface ParkFacility {
    name: string;       // e.g., "מתח", "מקבילים"
    type: ParkFacilityType;
    image?: string;
    video?: string;
}

import { ParkGymEquipment } from './gym-equipment.type';

export interface ParkAmenities {
    hasShadow: boolean;    // יש צל
    hasLighting: boolean;  // יש תאורה
    hasToilets: boolean;   // יש שירותים
    hasWater: boolean;     // יש מים
}

export type ParkStatus = 'open' | 'under_repair' | 'closed';

export interface Park {
    id: string;
    name: string;       // e.g., "ספורטק הרצליה"
    city: string;       // e.g., "הרצליה"
    description: string;
    location: { lat: number; lng: number };
    image?: string;     // Main park image
    facilities: ParkFacility[]; // Array of machines
    gymEquipment?: ParkGymEquipment[]; // Array of gym equipment with brand selection
    amenities?: ParkAmenities; // Park amenity tags
    authorityId?: string; // Link to authority (for Authority Manager access)
    status?: ParkStatus; // Current status: open, under_repair, closed
    createdAt?: Date;
    updatedAt?: Date;
}

export type AuthorityType = 'city' | 'regional_council' | 'local_council' | 'neighborhood' | 'settlement';

export interface Authority {
    id: string;
    name: string;           // Authority/City name
    type: AuthorityType;    // Type: city, regional_council, local_council
    parentAuthorityId?: string; // For settlements (Kibbutzim/Moshavim) - links to parent Regional Council
    logoUrl?: string;      // URL for the authority's logo
    managerIds: string[];  // List of user IDs assigned as health coordinators/managers
    userCount: number;     // Count of users associated with this authority
    status?: 'active' | 'inactive'; // Active if parks exist, Inactive if not yet mapped
    isActiveClient?: boolean; // Whether this authority is an active paying client (לקוח פעיל)
    coordinates?: { lat: number; lng: number }; // City center coordinates for map display
    createdAt?: Date;
    updatedAt?: Date;
}
