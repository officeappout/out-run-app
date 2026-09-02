---
name: running-progress-card
description: Feature spec seed for a running-track progress card, visually parallel to the existing strength ProgramProgressCard — not a bug, not parking-lot. Full spec TBD, to be authored alongside the schedule-builder drawer.
---

# Running Progress Card — scoping seed

**Opened:** 02.09.2026 · **Source:** David, after on-device verification of the 2b gate rollout.

Not a bug. Not parking-lot. This file exists so the "what already exists in code" groundwork isn't lost before David authors the full spec (planned alongside the schedule-builder drawer, Block 3).

## The ask, as described

A running-track progress card, visually parallel to the existing strength card:

| | Strength (today) | Running (target) |
|---|---|---|
| Title | Skill name (e.g. "משיכה") | Program name (e.g. "תוכנית לשיפור 5 ק״מ") |
| Middle stat | Level fraction ("רמה 10/25") | Race forecast (predicted pace + predicted time) |
| Sub-line | "עוד 99% לרמה 11" | Same idea — forecast that improves as workouts complete |
| Dual-track | — | Blue dot to toggle between strength/running when the user has both |

## What already exists — verified by direct file read, not assumed

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

**Self-correcting pace history — fully built, zero callers, dead code.** `recordQualityWorkout()` (`running-engine.service.ts:302-366`) calls `processSelfCorrection()` (`:226`, invoked `:331`) every 3rd quality workout (`QUALITY_WINDOW_SIZE`, `:330`) to recompute `basePace` (`:339,354`) and stamp `lastSelfCorrectionDate` (`:359-362`) — exactly the "forecast improves as workouts complete" mechanism the design wants. Grepped whole repo for `recordQualityWorkout(`: only its own definition and a section-header comment (`:290`) — zero call sites, not even in tests. Nothing in the live app currently invokes this on workout completion.

**`RunForecastWidget` — fully built, never rendered, dead import.** `src/features/home/components/widgets/RunForecastWidget.tsx:80-207`. Takes `averagePaceMinPerKm`/`referenceDistanceKm` as props (`:23-29`) — does not read `paceProfile.basePace` itself for predictions (caller's job), only reads it for its own upsell-gate check: `runningIncomplete = !profile?.running?.paceProfile?.basePace` (`:103`) combined with `dashboardMode==='PERFORMANCE'` (`:102,104`) to show a blurred CTA instead. Predictions use the Riegel formula (`T2 = T1 × (D2/D1)^1.06`, `:45-52`) over three fixed distances — 5K/10K/half-marathon (`RACES`, `:70-74`) — rendered as a 3-column grid (`:177-197`), header "תחזית מרוצים" (`:166`) + current-pace badge (`:168-173`). Imported once, `StatsOverview.tsx:32` — grepped the whole repo for any `<RunForecastWidget` JSX usage: none. Two other repo mentions are code comments referencing it in passing (`onboarding-entry.ts:72`, `onboarding-sync.service.ts:1877`), not real usages. The component exists, fully built including its own locked/upsell state, and is rendered nowhere.

### Dual-track dot precedent (secondary)

No component built specifically for a 2-item strength/running toggle exists, but two generic N-dot carousel-indicator precedents do, either usable as-is for 2 items:
- `src/features/home/components/WorkoutSelectionCarousel.tsx:232-250` — active dot 16px wide / inactive 6px, color `#00BAF7` active / `rgba(0,186,247,0.28)` inactive, click calls `handleSelect(i)`.
- `src/features/workout-engine/players/running/components/FreeRun/StatsCarousel/index.tsx:138-154` — same expand/shrink pattern, active color driven by a CSS var (`--metrics-accent-color`) so it can theme-swap between contexts.

## What's missing

- No component assembling `ProgramProgressCard`'s visual template for the running track specifically.
- No profile field storing a "current predicted race pace/time" as a standalone, readable-back value — `computePredictedRacePace`'s output only ever becomes a plan-internal label string today.
- `recordQualityWorkout`/`processSelfCorrection` (the mechanism that would make the forecast actually improve as workouts complete) is never called from anywhere live — needs to be wired to real workout-completion, not just written.
- `RunForecastWidget` is a plausible visual starting point for the forecast half (Riegel-based 5K/10K/half-marathon predictions already built) but isn't positioned/styled to match `ProgramProgressCard`'s layout, and isn't rendered anywhere today.
- No 2-dot strength/running toggle component — generic N-dot precedents exist (above) but nothing wired to switch between two data sources on one card.

## Explicitly not decided here

Full spec (exact card layout, which forecast metric(s) to surface, whether/how to wire `recordQualityWorkout`, dot-toggle interaction) — David will author alongside the schedule-builder drawer scoping. This file is groundwork only.
