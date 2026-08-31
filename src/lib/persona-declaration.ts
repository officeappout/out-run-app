/**
 * "Answered the persona questions" (C2) has no dedicated field today.
 * `LifestyleWizard.tsx` writes `personaId` only in `handleFinalSubmit`, i.e.
 * only if the user completes all three wizard steps (persona → schedule →
 * notifications) — a user who answers persona and closes the wizard before
 * notifications has `personaId` unset, even though they did answer. A second
 * onboarding path (`OnboardingWizard`/Path A) never writes `personaId` at
 * all — see `.claude/knowledge/running-onboarding-schedule-placement.md`.
 *
 * `personaId` truthy is kept as the fallback for users who predate the
 * dedicated field below (`lifestyle.personaAnsweredAt`) — a known-imprecise
 * signal, chosen deliberately over `false` so an existing user who already
 * answered isn't asked again. See idempotent-booping-sunrise.md, Block 2.
 */
export function hasAnsweredPersona(
  profile:
    | { personaId?: unknown; lifestyle?: { personaAnsweredAt?: unknown } }
    | null
    | undefined,
): boolean {
  return !!(profile?.lifestyle?.personaAnsweredAt || profile?.personaId);
}
