/**
 * The dynamic-questionnaire re-entry guard (dynamic/page.tsx). Extracted to a
 * pure, dependency-free predicate so it's unit-testable without mounting the
 * full page component — this project's test setup is unit-tests-only (no
 * jsdom/component testing yet, see vitest.config.ts), and dynamic/page.tsx
 * itself pulls in the whole onboarding engine, Firebase, and Analytics.
 *
 * hasCompletedOnboarding is whole-profile (strength-shaped) and has no
 * concept of tracks — bypass it for the running track so a returning
 * strength user (or a running user hitting Reset/Rebuild) can re-enter. For
 * every other case (isRunningTrack false — i.e. the strength track), this
 * must reduce to exactly !hasCompletedOnboarding, unchanged from before.
 */
export function shouldInitOnboardingEngine(
  isRunningTrack: boolean,
  hasCompletedOnboarding: boolean,
): boolean {
  return isRunningTrack || !hasCompletedOnboarding;
}
