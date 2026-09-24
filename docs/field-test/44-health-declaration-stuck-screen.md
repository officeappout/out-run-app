# 44 — Health Declaration Stuck Screen (P0, blocks conversion)

**Date:** 24.09.2026
**Branch:** `fix/health-declaration-stuck-screen`
**Status:** implemented. Not merged — David merges, then field-verifies in Sderot.

## The bug

Field report: tapping "מלא שאלון כוח" from the map routed a user (already holding an old health declaration) to `/onboarding-new/health`, which hung on "טוען..." forever — no error shown, no escape besides force-quitting the app. Exiting and re-entering immediately let them through.

## Root cause, confirmed by direct code read

`/onboarding-new/health/page.tsx`'s `alreadyAccepted` check (`hasAcceptedHealthDeclaration`, a synchronous in-memory read on the already-hydrated profile) fires correctly and instantly — this was **not** the bug, contrary to the original hypothesis. The hang was one step downstream: on `alreadyAccepted`, an effect silently fired `handleContinue(true)`, which **awaited** `syncOnboardingToFirestore('COMPLETED', ...)` (a 1868-line function, including an earlier `getDoc` fallback) before navigating to `/onboarding-new/health-connect`. The render gate (`alreadyAccepted && !skipFailed`) shows only a bare "טוען..." with zero error affordance, and `skipFailed` — the only escape — is set exclusively by a **thrown** error from that chain. The Firestore Web SDK does not time out a `getDoc`/`setDoc` on its own; a bad connection can leave the awaited promise **never settling** — neither resolving nor rejecting — which the existing round-3-review retry mechanism could not catch (it only handles rejection, not a genuine hang).

Per David's framing: a screen whose only exit is a thrown error is a trap, not a bug with an edge case — confirmed via direct read of the render-gate logic, not reproduced live.

## The fix

Checked first, as instructed: does `health-connect` (the next screen) actually need anything `syncOnboardingToFirestore` writes? **No** — confirmed by reading `HealthConnectOptInStep.tsx` in full: it takes only an `onContinue: () => void` callback, reads no `profile`/`progression` data at all (it's a native HealthKit/Health Connect OS-permission prompt, entirely independent).

So: the await was unnecessary. `handleContinue` is now **synchronous** — it navigates to `health-connect` immediately, and the entire persistence chain (the `getDoc` fallback, `syncOnboardingToFirestore`, `refreshProfile`) runs as a fire-and-forget background task with its own `try/catch` and `console.error` logging on failure. The only remaining synchronous failure path is `!auth.currentUser?.uid` (genuinely immediate, not async) — that still shows the existing retry UI, which is a real, always-available escape (a visible "נסה שוב" button), not a trap.

Applies uniformly to both real callers of `handleContinue`: the silent auto-skip (this bug's trigger) and `HealthDeclarationStep`'s manual first-time submit — confirmed via read that the component doesn't await or otherwise depend on `handleContinue`'s return value being a Promise (`onContinue?: (value: boolean) => void`).

Per David's explicit instruction: did not attempt to pinpoint which specific awaited call inside `syncOnboardingToFirestore` was the one that hangs — the fix (don't block on data the next screen doesn't need) is identical regardless.

## Production count (David's ask, real execution)

688 total `users` docs. 263 have an accepted health declaration (either historical field shape). **41 of those have zero domain-specific strength assessment** — the population most exposed to this path per the investigation (see field-test doc for the fuller station/questionnaire report — not repeated here). Counts only, no names/ids.

## Regression

`tsc --noEmit`: 445/445, zero new errors. `vitest run`: confirmed via a direct stash-based A/B — the exact same 8 sub-test failures (7 in the pre-existing-flaky `tests/firestore-rules.test.ts` emulator suite, 1 in an unrelated activity-store test) occur identically on the clean baseline and with this change applied. Zero regression. No existing test depends on `handleContinue`'s async shape or hardcoded line numbers in this file.

## Not yet done (separate PRs, per the agreed order)

- The return-point fix (`health-connect/page.tsx:27`'s hardcoded `/home`, and the two map entry points not passing `returnTo`) — next PR.
- The demographics-gate detour theory (why a mini-assessment tap falls into the general onboarding chain at all) — flagged as unproven; a cheap way to confirm or rule it out is owed after items 1 and 2 ship.
