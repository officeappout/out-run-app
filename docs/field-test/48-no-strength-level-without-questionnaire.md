# 48 — No strength level without the questionnaire (G8.2)

**Sderot pilot gap G8.2, 15.10.2026.** David's decision: a user never gets a strength level
without the strength questionnaire. Shipped behind `enable_no_auto_strength_level`
(fail-closed, admin card "אין רמת כוח בלי שאלון").

> **Status (16.10.2026):** onboarding/workout fix #307 and the summary guard (below) are both
> merged. The flag is still **OFF**; David turns it on himself after field-testing.

## Why it kept coming back

The home strength card and every other "is this user assessed?" gate read
`hasAssessedStrengthDomain` (any strength domain/track with level > 0). Three writers created a
level with no questionnaire, so the gate said "assessed":

| # | Writer | What it wrote |
|---|---|---|
| W1 | `onboarding-sync.service.ts`, `GOAL_TO_PROGRAM` fallback (no results, no running branch) | `full_body` (or goal-mapped) program at the fitness-tier level 1/3/5 |
| W2 | Same file, "Path B" (muscle focus picked, no results) | Fabricated `assignedResults` at the fitness-tier level |
| W3 | `processWorkoutCompletion` (called by the active page and `useProgressionSync`, both defaulting to `full_body`) | `full_body` + push/pull/legs/core at L1 (`getDefaultTrackProgress`) into tracks **and** domains |

Earlier fixes covered other cases only: `975ee4f7` (running-only users), `94b7b94f` (users
who already have a program), and #203 `f3b22c2c` (where the invite card renders). None of
them touched these writers.

## With the flag ON

- **W1:** with no questionnaire results, no level or program is written; the whole
  `GOAL_TO_PROGRAM` fallback is skipped.
- **W2:** Path B fabricates nothing. A fitness-level answer is not the questionnaire, so the
  user stays unassessed.
- **W3:** for an unassessed user, `processWorkoutCompletion` returns
  `{ success: true, skipped: 'no_questionnaire' }` with zero gains and writes nothing.
  Workout history (`saveExerciseHistory`) and XP (`awardWorkoutXP` via the outbox) are
  separate calls and are unchanged.
- **Existing users** who already have a made-up level are left as they are (David: no repair
  script).

## Summary-screen guard (done after design-v2 4a, #305)

When progression is skipped, the strength summary would still show a program-level ring built
from the fallback level (`currentLevel ?? 1`, prop default 5): a made-up level.

Design-v2 4a (**#305**, `d0213dea`, merged 16.10.2026) split the summary into
`StrengthSummaryPage.tsx` (data only) and `StrengthSummaryView.tsx` (markup), and replaced
`ProgramProgressCard` with `LevelRingCard`. The guard sits on `LevelRingCard`'s render site in
`StrengthSummaryView.tsx`, through `shouldShowLevelRing`
(`strength/utils/level-ring-visibility.ts`). The ring is hidden when the progression result
has `skipped === 'no_questionnaire'`. The history view hides it as before.

- **Flag OFF:** `skipped` is never set, so the ring is unchanged.
- **Tests:** `level-ring-visibility.test.ts` (the rule) and
  `strength-summary-level-ring-guard.test.ts`, which server-renders the real
  `StrengthSummaryView`: ring shown normally, hidden when skipped, hidden in history.

**Gain card (17.10.2026, David):** the "התקדמות" gain card (`GainBreakdownCard`, which showed
"+0.0%") is now hidden by the same rule (`shouldShowLevelRing`) whenever the ring is hidden.
`strength-summary-level-ring-guard.test.ts` covers it: shown with real progression, hidden when
skipped, hidden in history.
