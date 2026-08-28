# Kickoff — Decouple StrengthSummaryPage; retire StrengthHistoryDetail

> Created 23.08.2026. This is the paste-in starting memo for a NEW dedicated chat/thread — spun off from a long session that covered several other hybrid/summary-screen topics. Investigate + plan only in that new thread — no code — same discipline as every other thread this project has run this session.

## Status
New dedicated topic, split off 23.08.2026 from a session that had grown too loaded to safely take on a live, XP-critical refactor alongside everything else it was tracking. This is a real refactor of a production component with real side effects (XP award, streak, activity sync) — not a quick fix.

## How we got here
Earlier work in this project established a principle: workout summary screens should be pure view — all calculation/award of XP, coins, streak, etc. happens at the save/finish moment, not inside the summary screen's own mount effects. An audit ([[summary-screens-write-audit]]) confirmed **Strength is the only one of the three summary screens (Strength/Aerobic/Hybrid) that violates this** — `StrengthSummaryPage` fires `useXpAward` + `useActivitySync` on mount (real Firestore/Cloud-Function writes), guarded only by in-memory refs that reset on remount, with no server-side idempotency marker.

A separate question then came up: why does the unified `/workouts/[id]/history` route reuse the real `FreeRunSummary` (read-only mode) for cardio, but a completely separate, much simpler component (`StrengthHistoryDetail.tsx`) for strength/hybrid/recovery — missing XP status, streak, `GainBreakdownCard`'s progression %, `LevelGoalsChecklist`, `PersonalRecords`, `WeeklyAchievementsGrid`, `ProgramSuggestionCard`? Git archaeology answered this precisely (see [[summary-screens-write-audit]]'s 23.08.2026 update for full file:line detail):

- `StrengthHistoryDetail.tsx` predates the unified-history project entirely — created 23.04.2026, already serving `ProfilePage`'s history tab.
- `commit d71c0a74` (19.08.2026, "F1.3") built the new shared `/workouts/[id]/history` route and simply wired strength/hybrid/recovery to the pre-existing `StrengthHistoryDetail`. For cardio, which had no equivalent pre-existing simple component, F1.3 wrote a brand-new bespoke view instead.
- That new cardio view was caught by adversarial review the same day and replaced with genuine reuse of `FreeRunSummary` in `isReadOnly` mode (documented directly in `history/page.tsx`'s own docblock).
- **Strength's path never went through that same scrutiny** — because it wasn't new code in F1.3, it was a wire-up to something already existing, so it never looked like "we just built a shortcut" the way cardio's fresh code did. No commit message documents an explicit safety rationale for keeping `StrengthHistoryDetail` separate (contrast with other deliberate scope calls documented explicitly in the same commits).
- The formal safety hazard in `StrengthSummaryPage` (the mount-time write hooks above) was only discovered by this project's own audit on 21.08.2026 — two days AFTER F1.3. It's not plausible anyone weighed that specific risk and chose `StrengthHistoryDetail` because of it.

**Conclusion: this was missed, not a deliberate informed trade-off.** `StrengthHistoryDetail` survived because it already worked, not because someone decided `StrengthSummaryPage` was unsafe to reuse. The result is a second, incomplete implementation of the strength summary — exactly what the original view-only principle exists to prevent.

## The proposed fix (approved direction — investigate + plan the actual implementation in the new thread)
1. Refactor `StrengthSummaryPage` so its write-side hooks (`useXpAward`, `useActivitySync`, and whatever `useProgressionSync` still does live — re-verify current state, it may have shifted since the 21.08 audit) run at the workout-finish moment instead of on summary-mount — mirroring the pattern `useHybridRun`'s `finishHybrid()` already uses (compute + write once, before the summary ever mounts; the summary then only reads precomputed/saved values).
2. Once `StrengthSummaryPage` is genuinely safe to mount repeatedly (live finish AND history reopen) without re-triggering any one-time side effect, wire `history/page.tsx`'s strength/recovery branch to reuse it directly in a read-only mode — matching exactly how the cardio branch already does `<FreeRunSummary workout={workout} isReadOnly onClose onDelete />`.
3. Delete `StrengthHistoryDetail.tsx` entirely once nothing references it — do not leave it as dead code or a fallback.
4. Hybrid note: hybrid's own history routing was already fixed this session (separate commits, see [[hybrid-history-summary-mapping]]) — this refactor is strength/recovery-specific, but should double check `StrengthHistoryDetail.tsx`'s current strength/hybrid/recovery split doesn't leave recovery orphaned once strength moves off it (recovery workouts may still need SOME simple detail view — verify what recovery actually needs before deleting).

## What the new thread should do
Same rules as every other thread this session: **investigate and plan only, no code**, until the plan is reviewed and approved. Concretely:
1. Re-verify current state of `StrengthSummaryPage`'s mount-time hooks (`useXpAward`/`useActivitySync`/`useProgressionSync`) — the 21.08.2026 audit is the starting point but re-confirm nothing has shifted since (this session made several unrelated commits to adjacent files).
2. Map every current caller of `StrengthSummaryPage` (today: only the live route, `/workouts/[id]/active`) and every current caller of `StrengthHistoryDetail.tsx` (`history/page.tsx`, and check `ProfilePage`/`HistoryTab` directly too — `StrengthHistoryDetail` predates the unified route and may still have a direct caller outside it).
3. Design exactly what "finish-time write, mount-time read" looks like for strength specifically — what precomputed shape needs to be threaded through (mirroring `HybridFinalizeResult`'s role for hybrid), what changes at the `/workouts/[id]/active` call site to compute-then-pass instead of mount-and-compute.
4. Handle the recovery-workout question (point 4 above) before proposing `StrengthHistoryDetail.tsx`'s deletion.
5. Report a written plan — file:line grounded, same standard as every other plan this session produced — before any implementation.
