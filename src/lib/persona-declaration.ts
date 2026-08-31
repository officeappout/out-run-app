/**
 * "Answered the persona questions" (C2). `lifestyle.personaAnsweredAt`
 * (written by LifestyleWizard.tsx's handlePersonaNext, at the persona step's
 * completion) is the canonical field going forward. Two legacy/parallel
 * forms are recognized too, single-source pattern (mirrors
 * health-declaration.ts, identity.ts):
 *
 * 1. `personaId` truthy — `LifestyleWizard.tsx` wrote this in
 *    `handleFinalSubmit` only, i.e. only if the user completed all three
 *    wizard steps (persona → schedule → notifications). Known-imprecise
 *    (misses "answered persona, closed before finishing"), kept as a
 *    fallback for users who predate `personaAnsweredAt` rather than asking
 *    them again.
 * 2. `onboardingAnswers.persona` truthy — `OnboardingWizard`/Path A (the
 *    default full-onboarding flow, `OnboardingWizard.tsx:454`'s own
 *    `PersonaStep` rendering) never writes `personaId` or
 *    `personaAnsweredAt` at all; it writes `onboardingAnswers.persona`/
 *    `.personas` instead (`onboarding-sync.service.ts:786-793,852`). A
 *    strength user who completes the default flow genuinely answers
 *    persona questions through this exact path — without this check,
 *    `hasAnsweredPersona` would report `false` for someone who did answer.
 *    Confirmed NOT written by the running onboarding flow (01.09.2026,
 *    read-only verification): `dynamic/page.tsx`'s `savedPersonaId`
 *    (`:358-360`) comes from a sessionStorage key
 *    (`onboarding_selected_persona_id`) whose only writer is
 *    `PersonaStep.tsx`, which is rendered only inside `OnboardingWizard`/
 *    `LifestyleWizard` — and `OnboardingWizard` is mounted only at
 *    `/onboarding-new/setup` (`setup/page.tsx:10`), never on the running
 *    track (`home/page.tsx:130`: "Running items have no OnboardingWizard
 *    step"). So this form is strength-specific by construction, not a
 *    signal that would falsely mark a runner as answered.
 */
export function hasAnsweredPersona(
  profile:
    | {
        personaId?: unknown;
        lifestyle?: { personaAnsweredAt?: unknown };
        onboardingAnswers?: { persona?: unknown };
      }
    | null
    | undefined,
): boolean {
  return !!(
    profile?.lifestyle?.personaAnsweredAt ||
    profile?.personaId ||
    profile?.onboardingAnswers?.persona
  );
}
