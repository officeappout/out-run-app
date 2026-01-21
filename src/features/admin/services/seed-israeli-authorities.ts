/**
 * Seed Israeli Municipalities (Authorities) Data
 * 
 * This script populates the Firestore 'authorities' collection with Israeli cities,
 * regional councils, and their sub-locations (settlements/neighborhoods).
 * Each authority has coordinates for map display and a status field (Active if parks exist, Inactive if not).
 * 
 * Usage:
 * 1. Import and call this function from an admin page or Firebase function
 * 2. Or run manually: seedIsraeliAuthorities()
 */

import { createAuthority, getAllAuthorities } from './authority.service';
import { ISRAELI_LOCATIONS, IsraeliLocation, LocationType } from '@/lib/data/israel-locations';
import { AuthorityType } from '@/types/admin-types';

// Map of known coordinates for major locations
const COORDINATES_MAP: Record<string, { lat: number; lng: number }> = {
  // Major cities
  'tel-aviv': { lat: 32.0853, lng: 34.7818 },
  'jerusalem': { lat: 31.7683, lng: 35.2137 },
  'haifa': { lat: 32.7940, lng: 34.9896 },
  'rishon-lezion': { lat: 31.9730, lng: 34.7925 },
  'petah-tikva': { lat: 32.0892, lng: 34.8880 },
  'ashdod': { lat: 31.8044, lng: 34.6553 },
  'netanya': { lat: 32.3320, lng: 34.8599 },
  'beer-sheva': { lat: 31.2530, lng: 34.7915 },
  'holon': { lat: 32.0103, lng: 34.7792 },
  'ramat-gan': { lat: 32.0820, lng: 34.8130 },
  'bat-yam': { lat: 32.0140, lng: 34.7510 },
  'ashkelon': { lat: 31.6690, lng: 34.5715 },
  'rehovot': { lat: 31.8948, lng: 34.8118 },
  'herzliya': { lat: 32.1636, lng: 34.8443 },
  'kfar-saba': { lat: 32.1715, lng: 34.9068 },
  'beit-shemesh': { lat: 31.7511, lng: 34.9881 },
  // Regional Councils
  'emek-hefer': { lat: 32.3667, lng: 34.9167 },
  'mateh-yehuda': { lat: 31.7500, lng: 35.0000 },
  'drom-hasharon': { lat: 32.1500, lng: 34.8500 },
  'hof-hasharon': { lat: 32.2000, lng: 34.8333 },
  'emek-yizrael': { lat: 32.6333, lng: 35.3333 },
  'misgav': { lat: 32.8500, lng: 35.2500 },
  'eshkol': { lat: 31.2500, lng: 34.4000 },
  'shomron': { lat: 32.1667, lng: 35.0833 },
  'binyamin': { lat: 31.9500, lng: 35.2500 },
  'gush-etzion': { lat: 31.6500, lng: 35.1167 },
  'hevel-modiin': { lat: 31.9667, lng: 34.9167 },
  'gezer': { lat: 31.8667, lng: 34.9167 },
  'golan': { lat: 33.0000, lng: 35.7500 },
};

/**
 * Map LocationType to AuthorityType
 */
function mapLocationTypeToAuthorityType(locationType: LocationType): AuthorityType {
  switch (locationType) {
    case 'city':
      return 'city';
    case 'regional_council':
      return 'regional_council';
    case 'local_council':
      return 'local_council';
    case 'neighborhood':
    case 'settlement':
      // Sub-locations (neighborhoods/settlements) are stored as local_council with parentAuthorityId
      return 'local_council';
    default:
      return 'city';
  }
}

/**
 * Get coordinates for a location (parent or sub-location)
 */
function getCoordinates(locationId: string, parentCoordinates?: { lat: number; lng: number }): { lat: number; lng: number } {
  // Try to get from coordinates map first
  if (COORDINATES_MAP[locationId]) {
    return COORDINATES_MAP[locationId];
  }

  // If it's a sub-location and we have parent coordinates, add a small offset
  if (parentCoordinates) {
    // Add a random offset between -0.05 and 0.05 degrees (~5km) for variety
    const offsetLat = (Math.random() * 0.1 - 0.05);
    const offsetLng = (Math.random() * 0.1 - 0.05);
    return {
      lat: parentCoordinates.lat + offsetLat,
      lng: parentCoordinates.lng + offsetLng,
    };
  }

  // Default fallback (center of Israel)
  return { lat: 31.7683, lng: 35.2137 };
}

/**
 * Seed all Israeli authorities into Firestore with hierarchical structure
 * This function creates:
 * 1. Parent authorities (cities, regional councils)
 * 2. Sub-authorities (settlements, neighborhoods) with parentAuthorityId
 * 
 * Note: Status field defaults to 'inactive' and can be updated later based on whether parks exist
 */
export async function seedIsraeliAuthorities(): Promise<{ created: number; errors: number; skipped: number }> {
  let created = 0;
  let errors = 0;
  let skipped = 0;
  
  console.log(`[Seed] Starting to seed Israeli authorities from ISRAELI_LOCATIONS...`);
  
  // Fetch all existing authorities once at the start (for duplicate checking)
  // Filter out internal technical records
  const existingAuthorities = await getAllAuthorities();
  const existingNamesMap = new Map<string, string>(); // Map name -> Firestore ID
  const existingIdsMap = new Map<string, string>(); // Map location ID -> Firestore ID (for better uniqueness check)
  existingAuthorities.forEach(auth => {
    existingNamesMap.set(auth.name, auth.id);
    // Also map by ID if we can derive it from the location ID
    // This helps prevent duplicates even if names differ slightly
  });
  
  // Map to store parent authority IDs by location ID
  const parentAuthorityIdMap = new Map<string, string>();

  // First pass: Create parent authorities (cities, regional councils, local councils without parents)
  for (const location of ISRAELI_LOCATIONS) {
    try {
      // Check if already exists by name (primary check)
      const existingIdByName = existingNamesMap.get(location.name);
      if (existingIdByName) {
        console.log(`[Seed] ⊘ Skipped (already exists by name): ${location.name}`);
        skipped++;
        
        // Store existing authority ID for sub-location linking
        parentAuthorityIdMap.set(location.id, existingIdByName);
        continue;
      }

      // Additional check: Skip if this is an internal technical record
      if (location.name.includes('__SCHEMA_INIT__') || location.id.includes('__SCHEMA_INIT__')) {
        console.log(`[Seed] ⊘ Skipped (internal record): ${location.name}`);
        skipped++;
        continue;
      }

        // Get coordinates
        const coordinates = getCoordinates(location.id);

        // Map location type to authority type
        const authorityType = mapLocationTypeToAuthorityType(location.type);

        // Create parent authority
        const authorityId = await createAuthority({
          name: location.name,
          type: authorityType,
          parentAuthorityId: undefined, // No parent for top-level authorities
          logoUrl: undefined,
          managerIds: [],
          userCount: 0,
          status: 'inactive', // Default to inactive, will be updated when parks are added
          isActiveClient: false, // Default to false
          coordinates,
        });

      parentAuthorityIdMap.set(location.id, authorityId);
      created++;
      console.log(`[Seed] ✓ Created parent: ${location.name} (${authorityType})`);
    } catch (error: any) {
      errors++;
      console.error(`[Seed] ✗ Error creating ${location.name}:`, error.message);
    }
  }

  // Second pass: Create sub-authorities (settlements, neighborhoods)
  for (const location of ISRAELI_LOCATIONS) {
    if (!location.subLocations || location.subLocations.length === 0) {
      continue;
    }

    const parentAuthorityId = parentAuthorityIdMap.get(location.id);
    if (!parentAuthorityId) {
      console.warn(`[Seed] ⚠ Parent authority ID not found for ${location.name}, skipping sub-locations`);
      continue;
    }

    // Get parent coordinates for sub-location offset calculation
    const parentCoordinates = COORDINATES_MAP[location.id];

    // Limit to 3-5 sub-locations per parent (as requested)
    const subLocationsToSeed = location.subLocations.slice(0, 5);

    for (const subLocation of subLocationsToSeed) {
      try {
        // Check if already exists (using the pre-loaded existing authorities map)
        const existingSubId = existingNamesMap.get(subLocation.name);
        if (existingSubId) {
          console.log(`[Seed] ⊘ Skipped (already exists): ${subLocation.name}`);
          skipped++;
          continue;
        }

        // Get coordinates (with offset from parent)
        const coordinates = getCoordinates(subLocation.id, parentCoordinates);

        // Create sub-authority (settlement/neighborhood)
        await createAuthority({
          name: subLocation.name,
          type: 'local_council', // Sub-locations are stored as local_council
          parentAuthorityId: parentAuthorityId, // Link to parent
          logoUrl: undefined,
          managerIds: [],
          userCount: 0,
          status: 'inactive', // Default to inactive
          isActiveClient: false, // Default to false
          coordinates,
        });

        created++;
        console.log(`[Seed] ✓ Created sub-location: ${subLocation.name} (parent: ${location.name})`);
      } catch (error: any) {
        errors++;
        console.error(`[Seed] ✗ Error creating sub-location ${subLocation.name}:`, error.message);
      }
    }
  }

  console.log(`[Seed] Completed: ${created} created, ${errors} errors, ${skipped} skipped`);
  return { created, errors, skipped };
}

/**
 * Helper: Get coordinates for an authority by name (from ISRAELI_LOCATIONS)
 */
export function getAuthorityCoordinates(name: string): { lat: number; lng: number } | null {
  const location = ISRAELI_LOCATIONS.find(loc => loc.name === name);
  if (location) {
    return getCoordinates(location.id);
  }
  return null;
}

/**
 * Helper: Check if an authority is active (has parks)
 * Note: This checks the static data, actual status should be checked from Firestore
 */
export function isAuthorityActive(name: string): boolean {
  // In the new system, status is managed dynamically based on parks
  // This function is kept for backward compatibility
  return false;
}
