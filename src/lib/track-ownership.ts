/**
 * Track ownership — the existing source of truth already used for each
 * track, not invented here. Extracted from two independent, previously-
 * inconsistent copies:
 *
 * - `hasStrengthTrack`: verbatim from `home/page.tsx`'s `hasStrengthProgram`
 *   (currently ~line 1380, moved multiple times already — verify by content,
 *   not line number, before citing it again). A plain "domains non-empty"
 *   check is wrong: `progression.domains.running` is a real, live key (any
 *   assessed running domain lands there too, confirmed via
 *   `useProgressionStore.ts`/`AnalyticsService.ts`/`progression.service.ts`
 *   mirroring `tracks`→`domains`), so a pure runner would be misclassified
 *   as strength-track-having without the `NON_STRENGTH` exclusion. Requires
 *   both: the key isn't running/flexibility, AND `currentLevel > 0` (an
 *   assessed domain, not merely a present key).
 *   `profile-completion.service.ts` had its own separate, simpler
 *   `hasStrengthTrack` (its own `:246-248`) that only checked domains
 *   non-empty, without the exclusion — the exact bug this predicate exists
 *   to avoid, live in that file until it became a consumer of this one.
 *
 * - `hasRunningTrack`: `running.isUnlocked` — the flag set by the running
 *   bridge (`onboarding-sync.service.ts`) alongside `activeProgram`/
 *   `paceProfile`. Means "has running unlocked," NOT "is currently a
 *   runner" or "running is their primary track" — a dual-track user (both
 *   strength assessed AND running unlocked) gets `true` from both
 *   predicates. This is deliberate, not a gap: in the 2b+2d round's gate
 *   (`hasRunningTrack ? !hasAnsweredPersona || !isRunningScheduleUserConfirmed(profile)
 *   : !hasSchedule || !hasAnsweredPersona`), a dual-track user who has
 *   running unlocked but never confirmed real running days still passes
 *   through the running branch — correct, since the guiding rule is
 *   "the system adapts to the user," and a user with running access left on
 *   system-default days indefinitely isn't adapted, regardless of which
 *   track they'd call "primary."
 *
 * ⚠️ KNOWN GAP, not fixed here (David, 01.09.2026) — `hasStrengthTrack`
 * conflates "took a strength assessment" with "actively has a strength
 * program." It fires from ANY strength domain at `currentLevel > 0`,
 * including a single one-off assessment test — there is no signal in this
 * file (or anywhere checked) that distinguishes "assessed once" from
 * "added a program and is training it." Product-wise these are different:
 * a runner who did one push-up assessment is still a runner, not a
 * dual-track user.
 *
 * Per David's product model (01.09.2026): a first-ever signup (single
 * track) goes through the onboarding wizard; a user *adding a second
 * track* is routed to the schedule-builder drawer (Block 3 — not yet
 * built), which merges two programs without clobbering either. That
 * drawer is exactly where this gap will bite: a curious runner who only
 * ever took one strength assessment would satisfy `hasStrengthTrack`,
 * get treated as dual-track, and land in a screen built to merge two real
 * programs when they genuinely have only one.
 *
 * Does NOT break the current (2b+2d) round: commit 3 branches purely on
 * `hasRunningTrack`, so a curious runner is correctly routed to
 * `RunningScheduleStep` either way, regardless of `hasStrengthTrack`'s
 * imprecision. Tracked in `.claude/knowledge/track-ownership-assessment-vs-program-gap.md`.
 * Not fixed here — no product decision yet on how to distinguish
 * "assessed" from "actively training" (e.g. a program-start timestamp,
 * an explicit "added program" flag). Do not silently narrow
 * `hasStrengthTrack`'s behavior without that decision.
 */
export function hasStrengthTrack(
  profile:
    | {
        progression?: {
          domains?: Record<string, { currentLevel?: number; level?: number } | null | undefined>;
          tracks?: Record<string, { currentLevel?: number; level?: number } | null | undefined>;
        };
      }
    | null
    | undefined,
): boolean {
  const NON_STRENGTH = new Set(['running', 'flexibility']);
  const readLevel = (v: { currentLevel?: number; level?: number } | null | undefined): number =>
    v == null ? 0 : (v.currentLevel ?? v.level ?? 0);
  // Explicit `if (!obj) return false` rather than a `= {}` default param --
  // a default only ever kicks in for `undefined`, not `null`, and Firestore
  // can hold an explicit null for a field this type already declares as
  // `| null` at the profile level. This function is a shared library
  // consumer now, not a local IIFE with a known-shape input; the guard
  // costs nothing and closes a real crash path (David, 01.09.2026).
  const anyAssessed = (
    obj: Record<string, { currentLevel?: number; level?: number } | null | undefined> | null | undefined,
  ): boolean => {
    if (!obj) return false;
    return Object.entries(obj).some(([key, value]) => !NON_STRENGTH.has(key) && readLevel(value) > 0);
  };
  return anyAssessed(profile?.progression?.domains) || anyAssessed(profile?.progression?.tracks);
}

export function hasRunningTrack(
  profile: { running?: { isUnlocked?: unknown } } | null | undefined,
): boolean {
  return !!profile?.running?.isUnlocked;
}
