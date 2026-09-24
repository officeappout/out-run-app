# 45 — Return-Point Fix + Health-Sync Retry (P0 follow-ups, item 1 addendum + item 2)

**Date:** 24.09.2026
**Branch:** `fix/return-point-and-sync-retry`
**Status:** implemented. Not merged — David merges.

## Part A — item 1 addendum: bounded retry for the background sync

David's question before approving item 2: the background sync in [44](44-health-declaration-stuck-screen.md)'s fix no longer blocks navigation, but what happens if it *fails*? Does `onboardingStatus` stay unmarked as `COMPLETED`, and if so, does the user get sent back into onboarding on next launch?

Traced the real consumer: `home/page.tsx`'s cold-start Firestore fallback reads `onboardingStatus`/`onboardingComplete` (written by `onboarding-sync.service.ts`) and redirects to `/onboarding-new/profile` if neither is a "done" state. The risk is **asymmetric**:

- **Returning users** (this bug's actual reported population — already had `onboardingStatus: 'COMPLETED'` from an earlier successful onboarding): a failed/hung background write here is a harmless no-op — Firestore never rolls back an existing field value on a write that never completes. No risk.
- **Brand-new first-time users**: this write is the FIRST one that sets that field. If it silently fails, and no retry exists anywhere, they'd land back in onboarding on their next cold start.

Fix, scoped to that one real gap: `syncOnboardingToFirestore('COMPLETED', ...)` inside `health/page.tsx`'s fire-and-forget block now runs with a bounded retry — 2 attempts, ~2s apart, each individually raced against a 10-second timeout so a genuine hang (not just a rejection) can't block the retry either. Still fire-and-forget from the screen's point of view — navigation already happened per item 1's original fix.

## Part B — item 2: cheap return-point fix

Scope, per instruction: **not** reconstructing the full composed hybrid workout — just enough that a user detoured through onboarding from the map knows where they were.

1. `mini-domain-assessment.ts` — new durable key `MAP_RETURN_TARGET_PREF_KEY` (via `onboardingPrefs.ts`, axioms.md rule 19's convention), written alongside the existing `MINI_ASSESSMENT_RETURN_TO_KEY` sessionStorage key inside `startMiniDomainAssessment`. Needed because sessionStorage doesn't reliably survive a detour through the full general-onboarding wizard chain (demographics gate → program-path → dynamic → health → health-connect), which can span a native HealthKit permission dialog backgrounding the app. Cleared alongside the sessionStorage keys in `consumeMiniAssessmentState` (the clean mini-branch's own cleanup).
2. `health-connect/page.tsx` — `handleContinue`'s hardcoded `router.replace('/home')` now checks this durable pref first; if set, navigates there instead and clears it. Every other entry point (StrengthSummaryPage, profile widgets, home's own unlock CTA) never sets this key, so they land on `/home` exactly as before — byte-identical for them.
3. `DiscoverLayer.tsx` — the 2 map entry points that call `startMiniDomainAssessment`, per David's explicit line-numbered authorization to touch this file at these 2 spots only:
   - `assessment_prompt` slot (~line 946): now passes `'/map'` explicitly.
   - `HybridOverviewScreen.onAssessmentLink` (route-stops drawer, ~line 1797): now computes `routeId = logic.focusedRoute?.id` and passes `/map?focusRouteId=<id>` (or plain `/map` if no id), so on return the user lands back on the map focused on the same route.

### Known limitation — flagged for David, not built

For a **hybrid composed session** specifically, `logic.focusedRoute.id` resolves to the synthetic placeholder string `'hybrid-route'`, not a real re-fetchable `official_routes` doc id. Landing on `/map?focusRouteId=hybrid-route` does not by itself re-focus anything — confirmed via grep that no "fetch a route by id from a URL param and call `setFocusedRoute`" mechanism exists anywhere in `DiscoverLayer.tsx` today (every existing `setFocusedRoute` call site already holds the full `Route` object in hand, not just an id).

Building that mount-time fetch+focus logic would be new map/nav behavior, which per David's explicit ownership boundary ("אתה הבעלים של רגע התחנה... אם אתה נוגע בקובץ שנראה כמו מפה או ניווט — עצור ותגיד לי לפני") requires his go-ahead first. **Question for David:** build the URL-param auto-refocus now, or is landing on `/map` (or `/map?focusRouteId=X` with no-op for the hybrid case) sufficient for this pass? For a regular (non-hybrid) curated-route session, `focusedRoute.id` is already the real doc id, so the fix works end-to-end there today with no further changes.

## Regression

`git merge --ff-only origin/main` — clean fast-forward, none of the 8 new upstream commits touched any file in this change.
`tsc --noEmit`: 445/445, zero new errors.
`vitest run`: 232/234 files, 2237/2264 tests passed. The 2 failing files (`tests/firestore-rules.test.ts`, `logMultiCategoryWorkout.smoke.test.ts`) are the same pre-existing flaky-emulator failures documented in every prior field-test doc this wave — confirmed unrelated (neither test touches any file this change modifies).

One test file needed an update as a direct, expected consequence of this change: `hybrid-overview-screen-assessment-link.test.ts`'s `onAssessmentLink` source-text assertion expected the old 2-argument `startMiniDomainAssessment(router, domain)` call; updated to the new, intentional 3-argument shape (`..., mapReturnTo)`) plus a new test asserting the `routeId`/`mapReturnTo` computation itself. Not a weakened test — same file/line-anchored technique as items in Wave 1, updated for a real structural change, not to paper over a regression.

## Not yet done

- Item 3 (demographics-gate detour theory) — report how to cheaply prove/disprove, after David confirms this ships.
- Item 4 (station-approach moment) — mapping/estimate only, not yet started.
