---
name: running-progress-card
description: Running home-page spec — no second screen for runners, one carousel + one widget pair shared with strength, only the content source differs. Documentation only, nothing built; the schedule-builder drawer (Block 3) still precedes this in execution order.
---

# Running Home Page — Spec

**Opened:** 02.09.2026, as a scoping seed for one card (David, after on-device verification of the 2b gate rollout).
**Closed to a full spec:** 03.09.2026 (David). No longer just the card — this is now the spec for the runner's whole home page. One file for the topic; don't open a second one for this.

Documentation only. Nothing in this file is built. The schedule-builder drawer (Block 3) still precedes this in execution order — see `idempotent-booping-sunrise.md`.

## Core principle (David, 03.09.2026)

**There is no second screen for the runner.** Same carousel, same widgets, same structure — the system just identifies which track(s) the user has and offers accordingly. Strength and running are two content sources feeding one layout, not two layouts.

---

## [1] The carousel — same central suggestion area for both tracks

- **Training day:** the planned run sits *inside* the carousel. No separate card above it. This reverses David's own on-device note from 02.09.2026 ("A2", read as an open question at the time) — now a decision: *"the card needs to be part of the carousel, not above it."*
- **Rest day:** a recovery video. Further rest-day suggestions — not now, possibly later.
- **Day with both a run and strength:** the carousel shows both.
- **The top area (weekly schedule strip)** stays exactly as already implemented: day strip + week/count line only. On a rest day, nothing else there — this part is already shipped (`SmartWeeklySchedule.tsx`'s `RunningWorkoutCards`, 02.09.2026 fix).

## [2] The widgets — a pair, same shape strength already has today

- **Left: weekly-progress story bars.** Static, always shown, never swap.
- **Right: the card that swaps.** Strength shows skill+level (e.g. "משיכה / רמה 10/25 / עוד 99% לרמה 11"). Running's equivalent:
  ```
  Program name          (parallel to the skill name)
  Week N of M           (parallel to "רמה 10/25")
  Race forecast + current pace
  ```
- **Dual-track user:** only the right card swaps, with a slide animation and a blue dot underneath. The left story-bars never move.
- **Single-track user:** no dot, no slide.
- **The forecast** takes the current pace as its starting point and improves via formula as workouts complete. Already verified: `deriveBasePace` never returns 0, so there's something to show from day one.

## [3] ⚠️ Reversed decision — the strength-survey gate is cancelled for pure runners (David, 03.09.2026, explicit)

`useProgramProgress.ts`'s own doc comment records an April-2026 doubt: *"hide the ENTIRE Performance row until the strength survey is complete... Run-only users will see race/KM under their own row once strength onboarding is complete."* David saw this and reverses it: **a pure runner sees their own running data with zero dependency on strength.** Recorded as an explicit reversal with the date — someone decided otherwise before, and now it's the opposite. Not a bug fix; a policy change.

## [4] The three gates blocking this today — a map, not yet touched

Independent gates, each re-asking "does this user have data?" in its own words, in its own file — the same pattern already flagged for "what workout is today" (3 independent implementations, parking-lot). This is a fourth instance of that shape, on a different question. Candidate for unification, not unified now.

| Gate | Location | Blocks |
|---|---|---|
| `mode === 'RUNNING'` | `StatsOverview.tsx:680` | The whole trio-generation effect never runs for RUNNING mode. **And** the RUNNING render branch (`:1306-1364`) never calls `renderWorkoutSection()` at all, unlike PERFORMANCE/HYBRID (`:1379`, `:1397`) — no JSX slot exists to show the carousel even if the effect ran. Two places, not one. |
| `hasProgram` | `home/page.tsx:1401-1403` — `Object.keys(profile.progression.domains).length > 0` | The "התקדמות שבועית" tab (`ProgramProgressRow`+`ConsistencyWidget`, home/page.tsx:2603-2606) — hidden entirely when false. `progression.domains` for a runner only fills after their first *completed* workout (XP-driven), never at onboarding — so this is `false` for every fresh runner. |
| `hasStrengthSurvey` | `useProgramProgress.ts:72-78` — `hasPersona \|\| hasDomains \|\| hasTracks` | The entire `PerformanceMetricsRow` (`:120-122`), including `RaceAndKmCarousel` (Riegel pace prediction — genuinely running-relevant). This is the gate [3] above reverses. |

None of these three is `hasAnyAssessedDomain` inside `tryRestDayFastPath` (`home-workout.service.ts:433-436`) — that gate governs the *rest-day recovery-video fast path* specifically and was investigated separately (02-03.09.2026); fixing it would not have moved any of the three gates above.

## [5] Open question, not investigated (David, 03.09.2026 — leave for later)

`safety-net.generator.ts` (`eligible: () => true`, a fully static, zero-I/O fallback — "הליכה קלה", hardcoded) currently outranks `recovery-follow-up.generator.ts` (the generator that actually reaches `tryRestDayFastPath`/real recovery-video content) in the suggestion-engine's ranking for a fresh runner on a rest day. The real question is not "what blocks recovery content" (nothing does, structurally) but **"why does `recovery-follow-up` lose the ranking to `safety-net`."** Not investigated. Recorded so it isn't lost.

---

## Background research, preserved from the original scoping seed (02.09.2026)

Kept as-is — still accurate, still the groundwork for [2] above.

### The visual template: `ProgramProgressCard`
`src/features/home/components/widgets/ProgramProgressCard.tsx:96-231`

- `רמה {currentLevel}/{maxLevel}` — `:159`.
- `עוד {remainingPercent}% לרמה {nextLevel}` — `:169` (`remainingPercent = Math.max(0, 100 - Math.round(progressPercent))`, `:108`; `nextLevel = currentLevel + 1`, `:107`).
- Program/skill name + icon — `:146-156`, from `programName`/`iconKey` props.
- Props (`ProgramProgressCardProps`, `:18-29`): `programName`, `programNameLoading?`, `iconKey?`, `currentLevel`, `maxLevel`, `progressPercent` (0-100), `goals?`, `programCount?`, `className?`.
- Layout: white rounded card, clickable header (icon+title+level-line+sub-line on one side, a circular `ProgressRing` — 68px, strokeWidth 5, centered `%` text — on the other), optional expandable goals list below.
- Populated by `useProgramProgress()` (`src/features/home/hooks/useProgramProgress.ts:86-218`), reading `profile.progression.tracks[slug].{currentLevel,percent}` (`:137,182,189`) with a `progression.domains[slug]` fallback (`:138,148,183`), and `profile.progression.activePrograms[0].templateId` (`:89-90`). Backing type: `DomainTrackProgress` (`src/features/user/core/types/progression.types.ts:71-82`). Written by `progression.service.ts:1751-1764` (inside the per-child-track update block, `buildMuscleGroupProgress`, starts `:1590`).
- Rendered from 4 places: `ProgramProgressRow` (home page Row 2, `src/features/home/components/rows/ProgramProgressRow.tsx:51-58,64-73` → `home/page.tsx:2650`), `StrengthSummaryPage` (`src/features/workout-engine/components/strength/StrengthSummaryPage.tsx:342-349`), `ActiveProgramsCarousel` (profile page, `src/features/profile/components/widgets/ActiveProgramsCarousel.tsx:32-40`), `ProgramsSection` (profile page, `src/features/profile/components/widgets/ProgramsSection.tsx:257,344`).
- An older parallel component, `ProgressCard` (`src/features/home/components/ProgressCard.tsx:33-169`), renders the same two text lines (`:110,114`) with concentric activity rings instead of a single ring — looks like a predecessor, not chased further since `ProgramProgressCard` is the one referenced as current.

### Running-side data — real vs. dead code, itemized

**Program name — real, written, live.** `RunningProfile.generatedProgramTemplate` (`src/features/workout-engine/core/types/running.types.ts:397-399`, a `Pick<RunProgramTemplate,...>`) includes `.name` (`RunProgramTemplate.name`, `running.types.ts:351`). Written at running-onboarding completion, `onboarding-sync.service.ts:1704-1715`, sourced from `bridge.programTemplate.name` (`:1706`) — inside the live `step==='COMPLETED'` running branch (`:1685-1686`).

**Race-pace prediction — exists, but only ever feeds an internal plan label, never a standalone forecast field.** `computePredictedRacePace(basePace, targetDistance)` (`running-engine.service.ts:1700-1706`) is wired: called from `buildRaceDayWorkout` (`:1721`), called from `generatePlan()` (`:1959-1961`), which injects a synthetic "race day" workout into the plan's last week (`:1954-1978`) — live, runs from `onboarding-sync.service.ts:1765`. But the predicted value only ever becomes a workout-block description string (`racePaceLabel`, `:1722,1727,1733,1763`) — nothing stores it as a queryable "predicted race time" on the profile, and no widget reads it back out.

**Self-correcting pace history — fully built, zero callers, dead code.** `recordQualityWorkout()` (`running-engine.service.ts:302-366`) calls `processSelfCorrection()` (`:226`, invoked `:331`) every 3rd quality workout (`QUALITY_WINDOW_SIZE`, `:330`) to recompute `basePace` (`:339,354`) and stamp `lastSelfCorrectionDate` (`:359-362`) — exactly the "forecast improves as workouts complete" mechanism [2] wants. Grepped whole repo for `recordQualityWorkout(`: only its own definition and a section-header comment (`:290`) — zero call sites, not even in tests. Nothing in the live app currently invokes this on workout completion.

**`RunForecastWidget` — fully built, never rendered, dead import.** `src/features/home/components/widgets/RunForecastWidget.tsx:80-207`. Takes `averagePaceMinPerKm`/`referenceDistanceKm` as props (`:23-29`) — does not read `paceProfile.basePace` itself for predictions (caller's job), only reads it for its own upsell-gate check: `runningIncomplete = !profile?.running?.paceProfile?.basePace` (`:103`) combined with `dashboardMode==='PERFORMANCE'` (`:102,104`) to show a blurred CTA instead. Predictions use the Riegel formula (`T2 = T1 × (D2/D1)^1.06`, `:45-52`) over three fixed distances — 5K/10K/half-marathon (`RACES`, `:70-74`) — rendered as a 3-column grid (`:177-197`), header "תחזית מרוצים" (`:166`) + current-pace badge (`:168-173`). Imported once, `StatsOverview.tsx:32` — grepped the whole repo for any `<RunForecastWidget` JSX usage: none. Two other repo mentions are code comments referencing it in passing (`onboarding-entry.ts:72`, `onboarding-sync.service.ts:1877`), not real usages. The component exists, fully built including its own locked/upsell state, and is rendered nowhere.

### Dual-track dot precedent (secondary)

No component built specifically for a 2-item strength/running toggle exists, but two generic N-dot carousel-indicator precedents do, either usable as-is for 2 items:
- `src/features/home/components/WorkoutSelectionCarousel.tsx:232-250` — active dot 16px wide / inactive 6px, color `#00BAF7` active / `rgba(0,186,247,0.28)` inactive, click calls `handleSelect(i)`.
- `src/features/workout-engine/players/running/components/FreeRun/StatsCarousel/index.tsx:138-154` — same expand/shrink pattern, active color driven by a CSS var (`--metrics-accent-color`) so it can theme-swap between contexts.

### What's missing (against [2]'s spec)

- No component assembling `ProgramProgressCard`'s visual template for the running track specifically.
- No profile field storing a "current predicted race pace/time" as a standalone, readable-back value — `computePredictedRacePace`'s output only ever becomes a plan-internal label string today.
- `recordQualityWorkout`/`processSelfCorrection` (the mechanism that would make the forecast actually improve as workouts complete) is never called from anywhere live — needs to be wired to real workout-completion, not just written.
- `RunForecastWidget` is a plausible visual starting point for the forecast half (Riegel-based 5K/10K/half-marathon predictions already built) but isn't positioned/styled to match `ProgramProgressCard`'s layout, and isn't rendered anywhere today.
- No 2-dot strength/running toggle component — generic N-dot precedents exist (above) but nothing wired to switch between two data sources on one card.

## Explicitly not decided here

Exact carousel merge mechanics (how a run-day entry becomes one card among the carousel's suggestions, ranking against strength/safety-net), the swap-card's visual chrome for running, and how/when `recordQualityWorkout` gets wired to real completion — all still TBD when this is actually built. This file records the *shape* of the decision ([1]-[5]), not an implementation plan. The schedule-builder drawer (Block 3) still precedes this in execution order.

See also: `next-run-workout-card-inventory.md` — a full behavior inventory of `NextRunWorkoutCard`, taken before [1] retires it as an independent card, so nothing it currently does gets silently dropped when its content moves into the carousel.
