/**
 * mapPrefsOwnership.ts (pure, no I/O)
 *
 * Decides whether the durably-saved map-arrival answer (`map_authority_id`,
 * `map_neighborhood_id`, `map_anchor_lat`, `map_anchor_lng`, see
 * onboardingPrefs.ts) may be used for the account that is signed in now.
 *
 * Owner decision 27.10.2026: a NEW account on a device that previously had
 * another account must not inherit the old account's city, and must see the
 * location ask + globe dive. The prefs therefore carry an owner stamp
 * (`map_prefs_uid`): the uid that answered, or MAP_PREFS_GUEST_OWNER when the
 * answer was given before any account existed (pre-auth explorer).
 *
 * Rules
 *   owner = guest stamp        trust (the person on this device right now gave
 *                              it; sign-out clears the prefs, so a guest stamp
 *                              can never be left over from a previous account).
 *                              claim it for the current uid once one exists.
 *   owner = uid, same uid      trust (returning user, behaviour unchanged).
 *   owner = uid, other uid     ignore + clear (new account on a used device).
 *   owner = uid, no uid yet    ignore, but keep (auth may still be restoring).
 *   no owner (legacy, written  trust only when the signed-in profile already
 *   before the stamp existed)  has that same authority (today's behaviour for
 *                              its real owner); claim it. Otherwise ignore +
 *                              clear: a brand-new account has no city yet, so
 *                              an unstamped answer may belong to someone else.
 */

export const MAP_PREFS_GUEST_OWNER = '__guest__';

export interface MapPrefsOwnershipInput {
  /** Stored `map_prefs_uid` (null = legacy, never stamped). */
  ownerUid: string | null;
  /** Uid signed in now (null = nobody / auth not restored). */
  currentUid: string | null;
  /** Stored `map_authority_id`. */
  prefAuthorityId: string | null;
  /** The signed-in profile's `core.authorityId`, when known. */
  profileAuthorityId?: string | null;
}

export interface MapPrefsOwnershipDecision {
  /** Use the saved answer for this account. */
  trust: boolean;
  /** Re-stamp the prefs with `currentUid`. */
  claim: boolean;
  /** Remove the saved answer from this device. */
  clear: boolean;
}

export function decideMapPrefsOwnership(
  input: MapPrefsOwnershipInput,
): MapPrefsOwnershipDecision {
  const { ownerUid, currentUid, prefAuthorityId, profileAuthorityId } = input;

  if (ownerUid === MAP_PREFS_GUEST_OWNER) {
    return { trust: true, claim: Boolean(currentUid), clear: false };
  }

  if (ownerUid) {
    if (!currentUid) return { trust: false, claim: false, clear: false };
    if (ownerUid === currentUid) return { trust: true, claim: false, clear: false };
    return { trust: false, claim: false, clear: true };
  }

  // Legacy: no owner recorded.
  const sameCity = Boolean(
    currentUid && prefAuthorityId && profileAuthorityId && profileAuthorityId === prefAuthorityId,
  );
  if (sameCity) return { trust: true, claim: true, clear: false };
  return { trust: false, claim: false, clear: true };
}
