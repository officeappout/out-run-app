/**
 * mapPrefs.ts
 *
 * Read / write / clear helpers for the durable map-arrival answer, scoped to
 * the account that gave it. See mapPrefsOwnership.ts for the trust rules.
 */

import {
  getOnboardingPref,
  getOnboardingPrefAsync,
  removeOnboardingPref,
  setOnboardingPref,
} from '@/lib/onboardingPrefs';
import { MAP_PREFS_GUEST_OWNER, decideMapPrefsOwnership } from '@/lib/mapPrefsOwnership';

export const MAP_PREFS_OWNER_KEY = 'map_prefs_uid';

/** Account data: cleared on sign-out and when owned by another uid. */
export const MAP_PREF_KEYS = [
  'map_authority_id',
  'map_neighborhood_id',
  'map_anchor_lat',
  'map_anchor_lng',
] as const;

export interface SavedMapPrefs {
  authorityId: string | null;
  neighborhoodId: string | null;
  lat: string | null;
  lng: string | null;
}

/** Stamp the owner when the answer is written (uid, or guest before auth). */
export function stampMapPrefsOwner(uid: string | null | undefined): void {
  setOnboardingPref(MAP_PREFS_OWNER_KEY, uid || MAP_PREFS_GUEST_OWNER);
}

/** Remove the saved answer and its owner stamp from this device. */
export function clearMapPrefs(): void {
  for (const key of MAP_PREF_KEYS) removeOnboardingPref(key);
  removeOnboardingPref(MAP_PREFS_OWNER_KEY);
}

/**
 * Returns the saved answer only when it belongs to `currentUid` (or is a
 * guest answer from this device); otherwise null, clearing foreign or
 * unowned legacy values as decided by decideMapPrefsOwnership.
 */
export async function readOwnedMapPrefs(params: {
  currentUid: string | null;
  profileAuthorityId?: string | null;
  /** Lazy profile lookup, only called for legacy (unstamped) prefs. */
  loadProfileAuthorityId?: () => Promise<string | null | undefined>;
}): Promise<SavedMapPrefs | null> {
  const authorityId = await getOnboardingPrefAsync('map_authority_id');
  const neighborhoodId = await getOnboardingPrefAsync('map_neighborhood_id');
  const lat = await getOnboardingPrefAsync('map_anchor_lat');
  const lng = await getOnboardingPrefAsync('map_anchor_lng');
  if (!authorityId && !lat) return null;

  const ownerUid = await getOnboardingPrefAsync(MAP_PREFS_OWNER_KEY);
  let profileAuthorityId = params.profileAuthorityId ?? null;
  if (!ownerUid && !profileAuthorityId && params.currentUid && params.loadProfileAuthorityId) {
    try {
      profileAuthorityId = (await params.loadProfileAuthorityId()) ?? null;
    } catch {
      profileAuthorityId = null;
    }
  }

  const decision = decideMapPrefsOwnership({
    ownerUid,
    currentUid: params.currentUid,
    prefAuthorityId: authorityId,
    profileAuthorityId,
  });
  if (decision.clear) clearMapPrefs();
  if (!decision.trust) return null;
  if (decision.claim && params.currentUid) stampMapPrefsOwner(params.currentUid);
  return { authorityId, neighborhoodId, lat, lng };
}

/**
 * Sync check for map centering only (never written to a profile): true when
 * the stamp names an account other than `currentUid`.
 */
export function mapPrefsBelongToOtherAccount(currentUid: string | null | undefined): boolean {
  if (!currentUid) return false;
  const owner = getOnboardingPref(MAP_PREFS_OWNER_KEY);
  return Boolean(owner && owner !== MAP_PREFS_GUEST_OWNER && owner !== currentUid);
}
