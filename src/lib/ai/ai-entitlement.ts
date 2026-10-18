/**
 * ai-entitlement — the pure "may this user use AI right now?" resolver (OUT AI Phase 0).
 *
 * Zero Firebase imports, so the server (verifyAiRequest — the real gate) and the client
 * hook (useAiEntitlement — UI only) evaluate the exact same rule:
 *
 *   canUseAi = flags.aiCoachEnabled
 *              && (flags.aiCoachFreeForAll || entitlement.aiCoach.active && not expired)
 *
 * entitlements/{uid} is written only by the server / a super admin (firestore.rules).
 * `until` is optional: absent = no expiry. A present-but-unreadable `until` counts as
 * expired (fail closed).
 */

export type AiEntitlementSource = 'free_launch' | 'paid' | 'authority';

/** Firestore Timestamp (client or Admin SDK — both have toMillis), Date, or epoch ms. */
export type TimestampLike = { toMillis: () => number } | Date | number;

export interface AiCoachEntitlement {
  active: boolean;
  source: AiEntitlementSource;
  until?: TimestampLike | null;
}

/** entitlements/{uid} document shape. */
export interface AiEntitlementDoc {
  aiCoach?: AiCoachEntitlement;
}

export interface AiFlags {
  aiCoachEnabled: boolean;
  aiCoachFreeForAll: boolean;
}

function toMillis(v: TimestampLike): number {
  if (typeof v === 'number') return v;
  if (v instanceof Date) return v.getTime();
  if (v && typeof (v as { toMillis?: unknown }).toMillis === 'function') return v.toMillis();
  return Number.NaN;
}

export function isAiEntitlementActive(entitlement: AiEntitlementDoc | null | undefined, now = Date.now()): boolean {
  const coach = entitlement?.aiCoach;
  if (!coach || coach.active !== true) return false;
  if (coach.until == null) return true;
  const until = toMillis(coach.until);
  return Number.isFinite(until) && until > now;
}

export function canUseAi({
  flags,
  entitlement,
  now = Date.now(),
}: {
  flags: AiFlags;
  entitlement: AiEntitlementDoc | null | undefined;
  now?: number;
}): boolean {
  if (flags.aiCoachEnabled !== true) return false;
  if (flags.aiCoachFreeForAll === true) return true;
  return isAiEntitlementActive(entitlement, now);
}
