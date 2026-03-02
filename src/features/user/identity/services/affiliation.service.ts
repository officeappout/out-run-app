'use client';

/**
 * Affiliation Service
 * 
 * Handles two affiliation paths:
 *   1. GPS-based city detection → Municipal tier (2)
 *   2. School/Company code validation → Pro/Elite tier (3)
 * 
 * Affiliations are stored in user.core.affiliations[] and the effective
 * accessLevel is always Math.max() across all affiliation tiers.
 */

import { doc, getDoc, updateDoc, arrayUnion, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import type { UserAffiliation, AccessTier } from '../../core/types/user.types';
import { reverseGeocode, findAuthorityIdByCity } from '../../onboarding/components/steps/UnifiedLocation/location-utils';

// ============================================================================
// GPS — Detect city affiliation from device location
// ============================================================================

/**
 * Attempt to detect the user's city via GPS and resolve it to an authority.
 * Returns a city affiliation with the authority's tier, or null on failure.
 */
export async function detectCityFromGPS(): Promise<UserAffiliation | null> {
  try {
    const position = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: false,
        timeout: 8000,
        maximumAge: 300_000, // 5 min cache
      });
    });

    const { latitude, longitude } = position.coords;
    const geo = await reverseGeocode(latitude, longitude);

    if (!geo.city) return null;

    // Look up the authority to get its tier
    const authorityId = await findAuthorityIdByCity(geo.city);
    let tier: AccessTier = 2; // default municipal tier

    if (authorityId) {
      try {
        const authorityDoc = await getDoc(doc(db, 'authorities', authorityId));
        if (authorityDoc.exists()) {
          const data = authorityDoc.data();
          tier = (data.tier as AccessTier) || 2;
        }
      } catch {
        // Fallback to tier 2
      }
    }

    return {
      type: 'city',
      id: authorityId || geo.city.toLowerCase().replace(/\s+/g, '_'),
      tier,
      name: geo.city,
      joinedAt: new Date(),
    };
  } catch (error) {
    console.warn('[AffiliationService] GPS detection failed:', error);
    return null;
  }
}

// ============================================================================
// CODE — Validate school / company / organization code
// ============================================================================

export interface CodeValidationResult {
  valid: boolean;
  affiliation?: UserAffiliation;
  errorMessage?: string;
}

/**
 * Validate a school or organization code against the `schools` collection.
 * Valid codes grant Tier 3 (Pro/Elite) access.
 * 
 * Expected Firestore document structure in `schools/{code}`:
 *   { name: string, type: 'school' | 'company', tier?: number, active?: boolean }
 */
export async function validateOrganizationCode(code: string): Promise<CodeValidationResult> {
  if (!code || code.trim().length < 3) {
    return { valid: false, errorMessage: 'קוד קצר מדי' };
  }

  const normalizedCode = code.trim().toUpperCase();

  try {
    const docRef = doc(db, 'schools', normalizedCode);
    const snap = await getDoc(docRef);

    if (!snap.exists()) {
      return { valid: false, errorMessage: 'קוד לא נמצא במערכת' };
    }

    const data = snap.data();

    if (data.active === false) {
      return { valid: false, errorMessage: 'הקוד כבר לא פעיל' };
    }

    return {
      valid: true,
      affiliation: {
        type: (data.type as 'school' | 'company') || 'school',
        id: normalizedCode,
        tier: (data.tier as AccessTier) || 3, // Schools/companies default to tier 3
        name: data.name || normalizedCode,
        joinedAt: new Date(),
      },
    };
  } catch (error) {
    console.error('[AffiliationService] Code validation error:', error);
    return { valid: false, errorMessage: 'שגיאה בבדיקת הקוד' };
  }
}

// ============================================================================
// PERSISTENCE — Save affiliation to Firestore
// ============================================================================

/**
 * Add an affiliation to the user's document and recalculate accessLevel.
 */
export async function addAffiliation(affiliation: UserAffiliation): Promise<boolean> {
  const userId = auth.currentUser?.uid;
  if (!userId) return false;

  try {
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);

    if (!userDoc.exists()) return false;

    const data = userDoc.data();
    const existing: UserAffiliation[] = data.core?.affiliations || [];

    // Prevent duplicate affiliations by id
    const alreadyExists = existing.some((a) => a.id === affiliation.id);
    if (alreadyExists) return true; // Already has it

    // Recalculate max tier
    const allTiers = [...existing.map((a) => a.tier), affiliation.tier];
    const newAccessLevel = Math.min(Math.max(...allTiers), 3) as AccessTier;

    await updateDoc(userRef, {
      'core.affiliations': arrayUnion({
        type: affiliation.type,
        id: affiliation.id,
        tier: affiliation.tier,
        name: affiliation.name || null,
        joinedAt: new Date().toISOString(),
      }),
      'core.accessLevel': newAccessLevel,
      updatedAt: serverTimestamp(),
    });

    return true;
  } catch (error) {
    console.error('[AffiliationService] Error adding affiliation:', error);
    return false;
  }
}
