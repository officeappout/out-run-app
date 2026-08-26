/**
 * Health declaration acceptance has been stored under two different shapes
 * historically — top-level `healthDeclarationAccepted` and nested
 * `health.healthDeclarationAccepted` — and every consumer re-implemented the
 * same `||` check independently: profile-completion.service.ts,
 * OnboardingWizard.tsx, useRequiredSetup.ts, home/page.tsx. One definition,
 * all callers use it.
 *
 * Checks acceptance only. `termsVersion` (the accepted legal-text version,
 * written alongside this flag by HealthDeclarationStep.tsx from
 * LEGAL_VERSION) is recorded for audit/admin-display purposes
 * (admin/users/all/page.tsx shows it) — no mechanism anywhere in the live
 * app compares it against the current LEGAL_VERSION to force re-acceptance
 * on a version bump. This function preserves that exact status quo; it does
 * not introduce or remove any version-based gating.
 */
export function hasAcceptedHealthDeclaration(
  profile:
    | { healthDeclarationAccepted?: unknown; health?: { healthDeclarationAccepted?: unknown } }
    | null
    | undefined,
): boolean {
  return !!(profile?.healthDeclarationAccepted || profile?.health?.healthDeclarationAccepted);
}
