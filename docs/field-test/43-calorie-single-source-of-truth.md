# 43 — Calorie Single Source of Truth (item 5 of the live-moment wave)

**Date:** 24.09.2026
**Branch:** `fix/calorie-single-source-of-truth`
**Status:** implemented. Not merged — David merges.

## The bug

`WorkoutSummaryPage.tsx` independently recomputed calories via `calculateCalories(activityType, durationMinutes, userWeight)` — a formula distinct from the engine's own `safeCalories` (`useRunningPlayer.ts`'s `finishWorkout`, `distanceKm × weightKg × 1.036`), already written onto `savedWorkoutSnapshot.calories` before this component ever mounts. Confirmed via read: the summary screens the user actually sees (`AerobicSummaryShell`/`AerobicSummary`, the live path since `AEROBIC_SOLO_ENABLED=true`) already display `snap.calories` — the correct, engine value. But `handleFinish` used the **locally recomputed** number, not `snap.calories`, to award coins and update `profile.progression.totalCaloriesBurned` — unconditionally, not gated behind the (currently-disabled) coin system flag. Every aerobic workout finish wrote a lifetime-calorie total that could diverge from the number the user was just shown.

## The fix

Deleted the local recompute entirely — no `calculateCalories` import, no second formula. One value, `engineCalories = savedWorkoutSnapshot?.calories ?? 0`, read once near the top of the component and used everywhere calories are needed: the reward-award call, the profile update, the Firestore `totalCaloriesBurned` sync, the guest-claim query param, and the (dead-code, `AEROBIC_SOLO_ENABLED` makes it unreachable today) legacy `workoutData.calories` fallback. Per instruction: not aligning the two formulas — removing the second one.

`calculateCalories`/`lib/calories.utils.ts` itself is untouched — confirmed via grep it has real, unrelated callers elsewhere (strength summary, route filtering, workout preferences) and stays exactly as-is; only this one file's own duplicate use of it is gone.

`?? 0` fallback: inside `handleFinish`, `savedWorkoutSnapshot` is already confirmed non-null by an earlier early-return (`if (!savedWorkoutSnapshot) {...return;}`), so `engineCalories` is guaranteed the real engine value by the time any award/write code runs. The `?? 0` only matters for the brief render before a snapshot exists, or the guest-claim path, where it's a display-only fallback, not a data-integrity concern.

## Regression

`tsc --noEmit`: 445/445 (matches the confirmed baseline on the current `origin/main` tip, zero new errors). `vitest run`: 232/234, same 2 pre-existing unrelated failures as every prior baseline this engagement. No existing test references `WorkoutSummaryPage.tsx`.
