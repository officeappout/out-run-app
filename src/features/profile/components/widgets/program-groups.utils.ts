import type { MiniAssessmentDomainType } from '@/features/user/onboarding/services/mini-domain-assessment';

// Mirrors PRIMARY_CATEGORIES (single-domain-assessment.service.ts) — not
// imported directly because that module transitively pulls in
// onboarding-sync.service.ts → a .tsx icon barrel, which vitest's plain
// 'node' test environment (no JSX transform configured) can't parse. The
// value itself (the 4 body categories) is stable and canonical.
const PRIMARY_CATEGORIES = ['push', 'pull', 'legs', 'core'] as const;

/**
 * Given the full `activePrograms` array, returns the resolved slugs of every
 * entry EXCEPT index 0 (the master, handled entirely separately by
 * ProgramsSection — see `masterTemplateId`/`childSlugs` there). Entries
 * missing a `templateId` are dropped rather than producing a null/undefined
 * slug. `slugResolver` is injected (matches `resolveBaseCategoryForProgramId`'s
 * pattern in mini-domain-assessment.ts) so this is unit-testable without the
 * live Firestore-backed slug map `resolveToSlug` depends on.
 *
 * Kept in a plain .ts module (not ProgramsSection.tsx) so it can be imported
 * by vitest — vitest.config.ts runs in a plain 'node' environment with no
 * JSX transform configured, so a .tsx component file can't be imported here.
 */
export function resolveAdditionalProgramSlugs(
  activePrograms: ReadonlyArray<{ templateId?: string }> | undefined,
  slugResolver: (id: string) => string,
): string[] {
  return (activePrograms ?? [])
    .slice(1)
    .map((p) => (p.templateId ? slugResolver(p.templateId) : null))
    .filter((slug): slug is string => !!slug);
}

/**
 * A resolved slug is either a body category (push/pull/legs/core) or a skill
 * (planche/handstand/front_lever/muscle_up/one_arm_pullup/hspu/...) — picks
 * the right startMiniDomainAssessment routing mode for the "not yet
 * assessed" CTA. Children (Group 2) are always categories today (the only
 * MASTER_PROGRAM_CHILDREN entry, full_body, lists only categories), but an
 * additional independent program (Group 3) can genuinely be either.
 */
export function domainTypeForSlug(slug: string): MiniAssessmentDomainType {
  return (PRIMARY_CATEGORIES as readonly string[]).includes(slug) ? 'category' : 'skill';
}
