/**
 * Bulk Re-mapping Script for Parks to Authorities
 * 
 * This script scans all Parks and automatically maps them to Authorities
 * based on city name matching. It supports major Israeli cities and handles
 * fuzzy matching for common variations.
 * 
 * Usage:
 * 1. Import and call this function from an admin page
 * 2. Or run manually: remapParksToAuthorities()
 * 
 * This script will:
 * - Find all parks without authorityId or with mismatched city/authority
 * - Match parks to authorities based on city name
 * - Update parks with correct authorityId
 * - Report statistics on matches/errors
 */

import { getAllParks } from './parks.service';
import { getAllAuthorities, getAuthority } from './authority.service';
import { updatePark } from './parks.service';
import { Park } from '@/types/admin-types';
import { updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
// findAuthorityByCityName (+ its normalizer/variant table) moved to
// src/lib/route-collections/authority-resolution.ts (Stage 1B) so it's
// shared with the route-enrichment chokepoint instead of duplicated.
import { findAuthorityByCityName, normalizeCityName } from '@/lib/route-collections/authority-resolution';

const PARKS_COLLECTION = 'parks';

/**
 * Bulk re-map parks to authorities
 * Scans all parks and updates their authorityId based on city name matching
 */
export async function remapParksToAuthorities(): Promise<{
  total: number;
  updated: number;
  skipped: number;
  errors: number;
  unmatched: Array<{ parkId: string; parkName: string; city: string }>;
}> {
  let total = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;
  const unmatched: Array<{ parkId: string; parkName: string; city: string }> = [];

  console.log('[Remap] Starting bulk re-mapping of parks to authorities...');

  try {
    // Fetch all parks and authorities
    const parks = await getAllParks();
    const authorities = await getAllAuthorities();
    
    // Create authority lookup map
    const authorityMap = new Map<string, { id: string; name: string }>();
    authorities.forEach(auth => {
      authorityMap.set(auth.id, { id: auth.id, name: auth.name });
    });

    const authorityList = Array.from(authorityMap.values());
    total = parks.length;

    console.log(`[Remap] Found ${total} parks and ${authorities.length} authorities`);

    // Process each park
    for (const park of parks) {
      try {
        // Check if park already has a valid authorityId
        if (park.authorityId) {
          // Verify the authority still exists
          const existingAuthority = authorityMap.get(park.authorityId);
          if (existingAuthority) {
            // Check if city name matches authority name (fuzzy)
            const normalizedParkCity = normalizeCityName(park.city || '');
            const normalizedAuthorityName = normalizeCityName(existingAuthority.name);
            
            // If they match, skip (already correctly mapped)
            if (normalizedParkCity === normalizedAuthorityName || 
                normalizedParkCity.includes(normalizedAuthorityName) ||
                normalizedAuthorityName.includes(normalizedParkCity)) {
              console.log(`[Remap] ⊘ Skipped (already mapped): ${park.name} -> ${existingAuthority.name}`);
              skipped++;
              continue;
            }
          }
          // Authority doesn't exist or doesn't match - we'll re-map it
        }

        // Find authority by city name
        const authorityId = findAuthorityByCityName(park.city || '', authorityList);

        if (!authorityId) {
          // No match found - log as unmatched
          unmatched.push({
            parkId: park.id,
            parkName: park.name,
            city: park.city || 'לא צוין',
          });
          console.warn(`[Remap] ⚠ No authority found for: ${park.name} (city: ${park.city || 'לא צוין'})`);
          skipped++;
          continue;
        }

        // Update park with authorityId
        const authority = authorityMap.get(authorityId);
        if (!authority) {
          console.error(`[Remap] ✗ Authority not found in map: ${authorityId}`);
          errors++;
          continue;
        }

        // Direct Firestore update (bypassing edit request system for bulk operations)
        const parkRef = doc(db, PARKS_COLLECTION, park.id);
        await updateDoc(parkRef, {
          authorityId: authorityId,
          updatedAt: serverTimestamp(),
        });

        updated++;
        console.log(`[Remap] ✓ Updated: ${park.name} (${park.city}) -> ${authority.name} (${authorityId})`);

      } catch (error: any) {
        errors++;
        console.error(`[Remap] ✗ Error processing park ${park.name}:`, error.message);
      }
    }

    console.log(`[Remap] Completed: ${updated} updated, ${skipped} skipped, ${errors} errors, ${unmatched.length} unmatched`);

    return {
      total,
      updated,
      skipped,
      errors,
      unmatched,
    };
  } catch (error: any) {
    console.error('[Remap] Fatal error:', error);
    throw error;
  }
}

/**
 * Get unmatched parks (parks without authority or with unmatched city)
 * Useful for manual review
 */
export async function getUnmatchedParks(): Promise<Array<{ parkId: string; parkName: string; city: string; authorityId?: string }>> {
  try {
    const parks = await getAllParks();
    const authorities = await getAllAuthorities();
    
    const authorityList = authorities.map(a => ({ id: a.id, name: a.name }));
    const unmatched: Array<{ parkId: string; parkName: string; city: string; authorityId?: string }> = [];

    for (const park of parks) {
      // Check if park has no authorityId
      if (!park.authorityId) {
        unmatched.push({
          parkId: park.id,
          parkName: park.name,
          city: park.city || 'לא צוין',
        });
        continue;
      }

      // Check if authorityId exists and matches city
      const authority = authorities.find(a => a.id === park.authorityId);
      if (!authority) {
        unmatched.push({
          parkId: park.id,
          parkName: park.name,
          city: park.city || 'לא צוין',
          authorityId: park.authorityId,
        });
        continue;
      }

      // Verify city matches authority name (fuzzy)
      const normalizedParkCity = normalizeCityName(park.city || '');
      const normalizedAuthorityName = normalizeCityName(authority.name);
      
      if (normalizedParkCity !== normalizedAuthorityName && 
          !normalizedParkCity.includes(normalizedAuthorityName) &&
          !normalizedAuthorityName.includes(normalizedParkCity)) {
        // Try to find correct authority
        const correctAuthorityId = findAuthorityByCityName(park.city || '', authorityList);
        if (correctAuthorityId && correctAuthorityId !== park.authorityId) {
          unmatched.push({
            parkId: park.id,
            parkName: park.name,
            city: park.city || 'לא צוין',
            authorityId: park.authorityId, // Current (incorrect) authorityId
          });
        }
      }
    }

    return unmatched;
  } catch (error) {
    console.error('Error getting unmatched parks:', error);
    throw error;
  }
}
