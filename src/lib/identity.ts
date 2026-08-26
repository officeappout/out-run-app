/**
 * "Identity" in this product is one atomic bundle: name + gender + birthDate.
 * All three are collected together on the same screen (IdentityProfilePage);
 * none is optional. A user with only some of them is a user we don't
 * actually know yet.
 *
 * Single-field proxies for this (core.name alone, onboardingStatus alone)
 * are exactly how this bug class keeps recurring — see
 * complete-profile/route.ts and onboarding-entry.ts, which both call this
 * one definition instead of each inventing their own.
 */
export function hasKnownIdentity(
  core: { name?: unknown; gender?: unknown; birthDate?: unknown } | null | undefined,
): boolean {
  return !!(core?.name && core?.gender && core?.birthDate);
}
