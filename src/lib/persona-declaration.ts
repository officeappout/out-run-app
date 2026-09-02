/**
 * "Answered the persona questions" (C2). Simplified 01.09.2026: `personas`
 * (see src/types/persona.types.ts) is now written as soon as the user
 * answers the persona step in EITHER onboarding path —
 * onboarding-sync.service.ts (Path A, per-step sync) and
 * LifestyleWizard.tsx's handlePersonaNext (Path B, an early write added
 * specifically so this doesn't regress the "answered persona, closed
 * before finishing" case that the old two-field
 * personaId/lifestyle.personaAnsweredAt split existed to cover). One field,
 * one check, no fallback chain needed — there are no legacy users with the
 * old fields (zero real users existed at the time of the redefinition, see
 * docs/research/military-persona-unified-architecture.md).
 */
export function hasAnsweredPersona(
  profile: { personas?: unknown[] } | null | undefined,
): boolean {
  return !!(profile?.personas && profile.personas.length > 0);
}
