/**
 * Clean Re-seed Israeli Authorities
 * 
 * This script:
 * 1. Deletes ALL existing authorities (except __SCHEMA_INIT__)
 * 2. Re-seeds from ISRAELI_LOCATIONS with proper hierarchy:
 *    - Top-level items (cities, regional councils, local councils) have parentAuthorityId: null
 *    - Sub-locations (neighborhoods, settlements) have parentAuthorityId pointing to parent
 *    - Type field matches exactly: 'city', 'local_council', 'regional_council', 'neighborhood', 'settlement'
 */

import { collection, getDocs, deleteDoc, doc, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { createAuthority, getAllAuthorities } from './authority.service';
import { ISRAELI_LOCATIONS, IsraeliLocation, LocationType } from '@/lib/data/israel-locations';
import { AuthorityType } from '@/types/admin-types';

const AUTHORITIES_COLLECTION = 'authorities';

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
 * Map LocationType to AuthorityType (preserving exact types from data)
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
      return 'neighborhood';
    case 'settlement':
      return 'settlement';
    default:
      return 'city';
  }
}

/**
 * Get coordinates for a location
 */
function getCoordinates(locationId: string, parentCoordinates?: { lat: number; lng: number }): { lat: number; lng: number } {
  if (COORDINATES_MAP[locationId]) {
    return COORDINATES_MAP[locationId];
  }

  if (parentCoordinates) {
    const offsetLat = (Math.random() * 0.1 - 0.05);
    const offsetLng = (Math.random() * 0.1 - 0.05);
    return {
      lat: parentCoordinates.lat + offsetLat,
      lng: parentCoordinates.lng + offsetLng,
    };
  }

  return { lat: 31.7683, lng: 35.2137 };
}

/**
 * Clean and Re-seed all Israeli authorities
 */
export async function reSeedIsraeliAuthorities(): Promise<{ 
  deleted: number; 
  created: number; 
  errors: number;
  report: string;
}> {
  let deleted = 0;
  let created = 0;
  let errors = 0;
  const errorMessages: string[] = [];

  console.log('[Re-Seed] Starting clean re-seed of Israeli authorities...');

  try {
    // Step 1: Delete ALL existing authorities (except internal records)
    console.log('[Re-Seed] Step 1: Deleting existing authorities...');
    const authoritiesRef = collection(db, AUTHORITIES_COLLECTION);
    const snapshot = await getDocs(authoritiesRef);
    
    for (const docSnapshot of snapshot.docs) {
      const data = docSnapshot.data();
      const docId = docSnapshot.id;
      
      // Skip internal technical records
      if (docId.includes('__SCHEMA_INIT__') || data?.name?.includes('__SCHEMA_INIT__')) {
        console.log(`[Re-Seed] ⊘ Skipped internal record: ${docId}`);
        continue;
      }

      try {
        await deleteDoc(doc(db, AUTHORITIES_COLLECTION, docId));
        deleted++;
      } catch (error: any) {
        errors++;
        const msg = `Failed to delete ${docId}: ${error.message}`;
        errorMessages.push(msg);
        console.error(`[Re-Seed] ✗ ${msg}`);
      }
    }

    console.log(`[Re-Seed] Deleted ${deleted} authorities`);

    // Step 2: Create parent authorities (top-level only: cities, regional councils, local councils)
    console.log('[Re-Seed] Step 2: Creating parent authorities...');
    const parentAuthorityIdMap = new Map<string, string>();

    for (const location of ISRAELI_LOCATIONS) {
      try {
        // Skip internal records
        if (location.name.includes('__SCHEMA_INIT__') || location.id.includes('__SCHEMA_INIT__')) {
          continue;
        }

        // Get coordinates
        const coordinates = getCoordinates(location.id);

        // Map location type to authority type (preserve exact type)
        const authorityType = mapLocationTypeToAuthorityType(location.type);

        // Create parent authority with parentAuthorityId: null
        const authorityId = await createAuthority({
          name: location.name,
          type: authorityType,
          parentAuthorityId: undefined, // Explicitly null for top-level
          logoUrl: undefined,
          managerIds: [],
          userCount: 0,
          status: 'inactive',
          isActiveClient: false,
          coordinates,
        });

        parentAuthorityIdMap.set(location.id, authorityId);
        created++;
        console.log(`[Re-Seed] ✓ Created parent: ${location.name} (${authorityType})`);
      } catch (error: any) {
        errors++;
        const msg = `Failed to create parent ${location.name}: ${error.message}`;
        errorMessages.push(msg);
        console.error(`[Re-Seed] ✗ ${msg}`);
      }
    }

    // Step 3: Create sub-authorities (neighborhoods and settlements)
    console.log('[Re-Seed] Step 3: Creating sub-authorities...');
    
    for (const location of ISRAELI_LOCATIONS) {
      if (!location.subLocations || location.subLocations.length === 0) {
        continue;
      }

      const parentAuthorityId = parentAuthorityIdMap.get(location.id);
      if (!parentAuthorityId) {
        console.warn(`[Re-Seed] ⚠ Parent authority ID not found for ${location.name}, skipping sub-locations`);
        continue;
      }

      const parentCoordinates = COORDINATES_MAP[location.id];

      for (const subLocation of location.subLocations) {
        try {
          // Map sub-location type (neighborhood/settlement) preserving exact type
          const authorityType = mapLocationTypeToAuthorityType(subLocation.type);

          // Get coordinates (with offset from parent)
          const coordinates = getCoordinates(subLocation.id, parentCoordinates);

          // Create sub-authority with parentAuthorityId pointing to parent
          await createAuthority({
            name: subLocation.name,
            type: authorityType, // 'neighborhood' or 'settlement'
            parentAuthorityId: parentAuthorityId, // Link to parent
            logoUrl: undefined,
            managerIds: [],
            userCount: 0,
            status: 'inactive',
            isActiveClient: false,
            coordinates,
          });

          created++;
          console.log(`[Re-Seed] ✓ Created sub-location: ${subLocation.name} (${authorityType}, parent: ${location.name})`);
        } catch (error: any) {
          errors++;
          const msg = `Failed to create sub-location ${subLocation.name}: ${error.message}`;
          errorMessages.push(msg);
          console.error(`[Re-Seed] ✗ ${msg}`);
        }
      }
    }

    const report = `Re-seed completed: ${deleted} deleted, ${created} created, ${errors} errors${errorMessages.length > 0 ? '\nErrors:\n' + errorMessages.join('\n') : ''}`;
    console.log(`[Re-Seed] ${report}`);

    return {
      deleted,
      created,
      errors,
      report,
    };
  } catch (error: any) {
    const msg = `Critical error during re-seed: ${error.message}`;
    console.error(`[Re-Seed] ✗ ${msg}`);
    throw new Error(msg);
  }
}
