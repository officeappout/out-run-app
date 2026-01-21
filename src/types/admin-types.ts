// Park types have been moved to @/features/parks
// Re-exporting for backward compatibility
export type { Park, ParkFacility, ParkFacilityType, ParkAmenities, ParkStatus } from '@/features/parks';

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
