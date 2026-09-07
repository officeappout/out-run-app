# Smart-Coach Mechanism Inventory — What Exists, What's Connected, What's Missing

**Status: mapping only, zero code changed, zero fixes applied.** Written 07.09.2026 as direct input
to the schedule-track chat's contract, which will define the boundary: "ideal schedule" (rules) +
"smart coach" (adjusts the rest of the week from what actually happened) as two layers, with every
adjustment written back into the schedule and visible there — the engine decides nothing at
generation time that isn't already in the schedule.

**Method note, per instruction:** every claim below cites `file:line`. Where a claim is inferred
rather than directly read, it's marked "inferred." Where something could not be confirmed from
static code (would require a live Firestore read or device test), it's marked "not verified" —
never silently assumed.

---

## Inventory table (A1-A4)

| # | Mechanism | Classification | Entry point | Consumer | Output shape |
|---|---|---|---|---|---|
| A1 | Weekly volume tracking (sets vs. budget) | **[קיים ומחובר]** | `useWeeklyVolumeStore.recordStrengthSession` (`core/store/useWeeklyVolumeStore.ts:265`) | `StatsOverview.tsx:841-843` (feeds `generateHomeWorkoutTrio`), `build-home-user-context.ts:88`, `LoadAdvisorBanner.tsx:20`, `weekly-load.service.ts:26` | `{totalSetsCompleted, totalSetsPlanned, domainSetsCompleted: Record<domain,number>, sessionLogs: SessionLog[], intenseSessionsCompleted, saSetsCompleted}` — see §A1 for the localStorage-only caveat |
| A2 | Partial-workout detection | **[קיים ומחובר], flag-gated (OFF)** | `useActivitySync.ts` computes `strengthCompletion` → `completion-sync.service.ts:111` → `useProgressionStore.markTodayAsCompleted:846` | `useWeeklyStrengthGoal.ts:64-73` (feeds `StrengthVolumeWidget`, **UI only**) | `dailyProgress/{uid}_{date}`: `{dailyStrengthTargetSets, dailyStrengthCompletedSets, dailyStrengthPct, strengthGoalMet}` — see §A2 |
| A3 | Makeup workout generation | **[לא קיים]** | — | — | — (see §A3 for what exists nearby and is NOT this) |
| A4 | Post-unilateral-session domain rebalancing | **[קיים ומחובר] — but not to `activeDomains`** | `SplitDecisionService.resolvePrioritySkillIds` (`services/split-decision/SplitDecisionService.ts:61`), reads `lastSessionFocus` (`:511`) | `home-workout.service.ts:2455-2458` (→ `WorkoutGenerator`'s dominance/volume path only, NOT `requiredDomains`), `start-hybrid-session.ts:902-922` (hybrid route-stops skill selection) | `{priority1SkillIds, priority2SkillIds, priority3SkillIds, dominanceRatio, sessionType}` — see §A4 |

---

## A1. Weekly volume tracking — source of truth, and what happens on device switch

**Confirmed: localStorage is the ONLY source of truth. No Firestore reconstruction path exists.**

- `useWeeklyVolumeStore` is a Zustand store with `persist(..., { name: 'out-weekly-volume', storage:
  createJSONStorage(() => localStorage) })` (`useWeeklyVolumeStore.ts:513-514`).
- Writer: `recordStrengthSession(setsCompleted, setsPlanned, difficulty, isRecovery, programId,
  durationMinutes, domainSets, exerciseIds, saSets)` (`:265-330`), merging `domainSets` into
  cumulative `strength.domainSetsCompleted` and appending a `SessionLog` (`:277-287`, `:301`, `:327`).
  Called from `useActivitySync.ts:239` and `useHybridRun.ts:254` — both confirmed real,
  workout-completion-triggered call sites (not dead code).
- Reader for the engine: `StatsOverview.tsx:841-843` — `domainSetsCompletedThisWeek =
  budgetDataValid ? volumeStoreState.getDomainSetsCompleted() : {}`, threaded into
  `generateHomeWorkoutTrio({ domainSetsCompletedThisWeek, remainingWeeklyBudget, ... })`
  (`StatsOverview.tsx:867-883`).
- **Device switch / cleared browser**: `budgetDataValid = storeOwnsCurrentUser &&
  hasConsistentStrengthData` (`StatsOverview.tsx:833`), where `storeOwnsCurrentUser =
  volumeStoreState.isInitialized && volumeStoreState.userId === profile.id` (`:818-819`). On a new
  device or cleared storage, `isInitialized` is false → `domainSetsCompletedThisWeek = {}` —
  **silently empty, not reconstructed.** No Firestore read anywhere in this path.
- `recalculateFromActivities` (`useWeeklyVolumeStore.ts:451-496`) does **not** rebuild strength data
  at all — it reads `useActivityStore.getState().weekActivities` (a *different* Zustand store, not
  confirmed here whether Firestore-backed) and only recomputes `running.totalDuration`/
  `activeMinutes.sessionCount` — `strength.domainSetsCompleted`/`sessionLogs` are untouched by it.
- **Independent corroboration, first-party**: `weekly-load.service.ts:12-14,19-21` documents this
  exact caveat itself: *"Domain sets → useWeeklyVolumeStore.getDomainSetsCompleted() (the only
  place per-domain sets exist today — localStorage-scoped)... domainSetsThisWeek is device-local
  (Zustand persist → localStorage). aerobic minutes + strengthDays are server-derived and survive
  device changes."* Two independent code locations agree — this is a known, accepted, documented
  limitation, not a guess.

---

## A2. Partial-workout detection — exists, real consumer, but display-only and flag-gated off

- **Distinction exists**: `StrengthCompletionSnapshot { targetSets, completedSets, pct, met }`
  (`completion-sync.service.ts:29-34`), computed in `useActivitySync.ts` (exact computation site not
  traced line-by-line this pass) and passed to `markTodayAsCompleted`
  (`completion-sync.service.ts:111`).
- **Where it's written**: `useProgressionStore.markTodayAsCompleted` (`useProgressionStore.ts:846`)
  writes to `dailyProgress/{userId}_{today}` (Firestore): `dailyStrengthTargetSets`,
  `dailyStrengthCompletedSets`, `dailyStrengthPct`, `strengthGoalMet` (`:910-917`) — **but only when
  `HOME_DAILY_GOAL_V1 && strengthCompletion`** (`:889-891`, `:910`). `HOME_DAILY_GOAL_V1 = false`
  (`config/feature-flags.ts:327`, default) — **so in production today, these 4 fields are never
  written**; `workoutCompleted` falls back to the unconditional legacy `true` (`:889-891`) regardless
  of how much of the session was actually completed.
- **Who reads it back**: `useWeeklyStrengthGoal.ts:64-73` reads `dailyStrengthPct`/`strengthGoalMet`
  from `dailyProgress` docs, explicitly to feed `StrengthVolumeWidget` (per the hook's own doc
  comment, `:6`) — **a UI display widget**. No call site found where this distinction feeds back
  into `generateHomeWorkoutTrio`'s inputs or any domain/volume decision. The underlying raw ratio
  (`setsCompleted` vs `setsPlanned`) IS separately preserved in `useWeeklyVolumeStore`'s
  `SessionLog` (`useActivitySync.ts:229,239-248` — `plannedSets = totalPlannedSets ??
  actualSetsCompleted`, both threaded into `recordStrengthSession`), but the store's own
  accumulation logic (`:276-329`) treats a partial session's completed sets exactly like a full
  one's — no separate "this was interrupted" flag or differential handling.
- **Conclusion**: the distinction between "finished" and "did some sets and stopped" is technically
  computable and has one real, wired Firestore write path — but that path is inert in production
  (flag off) and its only confirmed reader is UI display, not generation input.

---

## A3. Makeup workouts — not found; do not build assuming it exists

**[לא קיים]** as a content-generation mechanism. Searched the full codebase for `makeup`,
`missedWorkout`, and adjacent terms. What exists nearby, explicitly NOT the same thing:

1. **`SmartWeeklySchedule.tsx:1132-1170`** — a *retrospective streak-accounting* pairing: when a user
   trains on a day marked rest (`day.isRest && day.hasActivity && day.isCompleted`), it's paired
   with the oldest prior missed training day to clear that day's "debt" for **streak display only**
   (`debtCleared` flag, `:1141`). This does not generate, suggest, or alter any workout's content —
   it only relabels an already-freely-chosen session after the fact.
2. **`workout-completion.service.ts:24-28`** — `AlignmentAction` type includes a `'quality_makeup'`
   variant, but this file's own header states its scope explicitly: *"Handles the lifecycle of a
   **running** program"* (`:4`) — this is running-specific, not strength. Its only confirmed
   consumer, `StatsOverview.tsx:1361-1368`, renders a dismissible `MissedWorkoutBanner` whose
   `onDoIt` callback is `() => onStartWorkout?.()` (`:1364`) — the **normal, unmodified** start-workout
   flow. No special makeup-content generation happens.
3. **`MessageService.ts:169-171`** — CRM/messaging copy templates (`missed_workout` type, e.g. "פספסת
   את האימון של אתמול? רוצה להשלים אותו עכשיו?") — text content for a notification/message system,
   not a workout generator. Presumed (not traced) to route back to the same normal flow as #2.

None of the three generates a workout with different content, volume, or domain coverage to
compensate for what was missed. If "makeup workout" is meant as a distinct engine capability, it
does not exist today.

---

## A4. Post-unilateral-session rebalancing — confirmed disconnected from `activeDomains`, connected elsewhere

**Re-verified, current line numbers** (this exact question was answered once already this session,
in `docs/workout-engine/10-WHO-DECIDES-TODAYS-WORKOUT.md` §2 — re-confirmed here with fresh reads
per the instruction not to rely on memory):

- `SplitDecisionService.resolvePrioritySkillIds` (`SplitDecisionService.ts:61-270`) has a complete
  PPL rotation: `PPL_ORDER = ['push','pull','legs']` (`:197`), keyed on `lastSessionFocus`
  (`:511`, read from `userProfile.progression?.lastSessionFocus` — confirmed real and written, see
  below), producing `priority1SkillIds`/`priority2SkillIds` that correctly rotate to "the next
  domain after whatever was last trained" (`:200-213`).
- **`lastSessionFocus` is real, not a phantom field**: written by `trackMuscleUsage`
  (`services/split-decision/muscle-fatigue.service.ts:47`, `updateData['progression.lastSessionFocus']
  = sessionFocus`), called from `useActivitySync.ts:293` on real workout completion —
  `sessionFocus` derived from the completed session's `programId` string-match or muscle-group
  dominance (`useActivitySync.ts:279-291`).
- **Confirmed NOT wired to `activeDomains`**: `home-workout.service.ts:2453-2459` builds the
  `WorkoutGenerationContext` object — `splitType`, `dominanceRatio`, `priority1/2/3SkillIds`,
  `dailySetBudget` (`:2453-2458`) sit in the SAME object literal as `requiredDomains:
  requiredDomainsOverride ?? (resolvedChildDomains.length > 0 ? resolvedChildDomains : undefined)`
  (`:2459`) — and `resolvedChildDomains` is derived entirely from `activePrograms[0]` (via
  `resolveChildDomainsForParent`, traced in doc 10 §1), with **zero reference** to `splitContext` in
  its computation. Two fields, one object, no shared computation.
- **Who DOES read `priority1SkillIds`, precisely** (answering "who reads this output, if anyone"):
  - `WorkoutGenerator.ts:1407,1621` and `workout-selection.utils.ts:952,990` —
    `selectExercisesWithDominance`'s dominance-day selection path, gated on
    `context.priority1SkillIds?.length` (`WorkoutGenerator.ts:1621`). This picks WHICH exercises
    win, by score, favoring the priority-1 skill — but only from whatever pool `requiredDomains`
    already scoped. It cannot introduce a domain that isn't already in scope.
  - `start-hybrid-session.ts:902-922` — a second, independent consumer (hybrid route-stops path):
    `priority1SkillIds`/`priority2SkillIds` refine which SKILL exercises fill a station, but
    `requiredDomains: targetDomains` is set from a *separate* variable (`:917`), not from
    `priority1SkillIds` — same pattern as home: refinement within scope, not scope-determination.
- **Additional, independently-found push/pull-imbalance detector — not one of David's 4 named
  anchors, found while checking A1's consumers**: `LoadAdvisorBanner.tsx:53-85` computes its own
  push/pull set-ratio from `sessionLogs` (`>1.5x` either direction) and renders a **text-only Hebrew
  advice banner** ("Focus on Pull training for muscle balance") — confirmed by reading `deriveAdvice`
  (`:36-98`) that its return value only ever becomes a rendered `<Advice>` — no callback, no
  generation input. A **fifth, separate** place this codebase computes a push/pull ratio, also UI-only.
- **A REAL generation-time domain-balance consumer exists — but scoped to hybrid, not home
  strength**: `weekly-load.service.ts` computes `neglectedDomains: StrengthDomain[]` (domains with
  zero sets this week) as part of `WeeklyLoadSnapshot` (`:44-50`), consumed by
  `complementary-short.generator.ts` and `compose-hybrid-session.service.ts` (confirmed via grep,
  not traced line-by-line this pass) — this is a genuine domain-balancing signal that reaches
  generation, but for the **hybrid** engine's complementary-workout logic specifically, not
  `generateHomeWorkoutTrio`.

**Conclusion for A4**: the rotation algorithm exists and is correct; its output has two real
consumers, both scoped to "which exercise wins within an already-domain-scoped pool," never to
"which domains are in scope." A parallel, independently-built domain-balance signal
(`neglectedDomains`) exists and DOES reach generation, but only for hybrid sessions.

---

## B. Does a toggle for this already exist?

**[לא קיים]** — no toggle for "adaptive smart-coach behavior" as a coherent concept exists in
`src/config/feature-flags.ts` (all 48 exported flags read; full list cross-checked against
adapt/rotat/balance/smart/makeup/coach/split/domain/rebalanc keywords — 2 matches, both unrelated
or tangential):

- `IS_ADAPTIVE_SHED_ENABLED` (`:209`) — map performance (marker hiding under memory pressure).
  Unrelated despite the name.
- `BLOCK_B_SMART_CLOSE_V1` (`:394`) — explicitly documented as **superseded and never wired**:
  *"this approach is SUPERSEDED by the unified suggestion engine actually built and shipped...
  Do not build a second competing post_workout mechanism behind this flag... kept for continuity...
  not as a live build target"* (`:386-394`). About which post-workout suggestion CARD to show, not
  domain rotation.
- The one flag actually relevant to this inventory is `HOME_DAILY_GOAL_V1` (`:327`, default
  `false`) — gates A2's partial-completion Firestore write, covered above. It is a plain
  compile-time boolean constant (`export const ... = false`), same pattern as every other flag in
  this file — **global, not per-user**. No Firestore-profile-scoped variant found for it.
- **Not verified**: `IS_LEAGUES_ENABLED`'s comment (`:104-106`) references a parallel
  Firestore-based runtime flag system (`system_config/feature_flags.enable_leagues`) used for
  *some* features. Whether that Firestore document contains anything relevant to adaptive
  scheduling could not be checked from static code — it's data, not code. **Explicitly not
  verified — would require a live Firestore read.**
- **If a toggle needs to exist**, the natural placement (not implemented, description only): a new
  compile-time flag in `feature-flags.ts` following the established pattern (default `false`,
  byte-identical-while-off documented explicitly), read at the same point `home-workout.service.ts`
  Step 1c already reads `scheduledProgramIds` (`:1490-1544`, per doc 10 §6) — the natural chokepoint
  since that's already where schedule-vs-fallback branching happens.

---

## C. The contract, both directions

### C1. What the engine reads from the schedule / history today

| Field | Source (file:line) | What happens when empty/missing |
|---|---|---|
| `scheduledProgramIds` | `StatsOverview.tsx:872` → `generateHomeWorkoutTrio` option → `home-workout.service.ts:1459` | Falls back to `activePrograms[0].templateId` (`:1483,1492`) — the exact bug this whole thread started from. Doc 10 §1 covers this in full. |
| `isScheduledRestDay` | `StatsOverview.tsx:873` (from `resolveScheduledProgram`'s `isRestDay`) | Defaults `false` (`home-workout.service.ts:1460`) — treated as a training day. |
| `remainingWeeklyBudget` | `StatsOverview.tsx:874`, from `useWeeklyVolumeStore.getRemainingBudget()` (getter, `:362`) | `undefined` when `<= 0` (`StatsOverview.tsx:874` ternary) — `home-workout.service.ts` computes its own fallback via `calculateWeeklyBudget(userLevel, scheduleDays)` (`:447-448`) rather than treating "no budget info" as zero. |
| `domainSetsCompletedThisWeek` | `StatsOverview.tsx:876-877`, from `useWeeklyVolumeStore.getDomainSetsCompleted()` (A1) | `undefined` when the resulting object is empty (`Object.keys(...).length > 0 ? ... : undefined`) — deficit-merge logic (`detectDomainDeficit`, `SplitDecisionService.ts:303-337`) simply never fires; no domain is ever flagged as under-served. |
| `remainingScheduleDays` | `StatsOverview.tsx:878` (computed from `scheduleDays`, not traced further this pass) | Falls back to `scheduleDaysForBudget` (full schedule length) inside `getWorkoutContext` (`SplitDecisionService.ts:484-486`) when `null`/`≤0`. |
| `recentExerciseIds` | `StatsOverview.tsx:879`, gated by the same `storeOwnsCurrentUser` check as A1 | `undefined` when empty — presumed (not traced) to disable whatever variety-guard consumes it. |
| `activePrograms[0]` (raw, not schedule-derived) | `userProfile.progression.activePrograms[0]`, read independently in **at least 3 places**: `InputSanitizerMiddleware.ts:237`, `home-workout.service.ts:1483` (fallback), `SplitDecisionService.ts:395-396` | This is the field with no "empty" fallback problem — the problem is the opposite: it's *always* present (or a synthetic default) and gets trusted directly when schedule data is thin. |
| `lastSessionFocus` | `userProfile.progression.lastSessionFocus`, read at `SplitDecisionService.ts:511` | `undefined` → PPL rotation logic defaults to push as P1 (`:216-222`) — **always**, every time, not just once; see doc 10 §1c for why this doesn't satisfy "merge instead of getting stuck." |

### C2. What the engine writes back after a workout

| What | Where (collection/doc/field) | Writer (file:line) | Timing | Is it a FUTURE adjustment, or a historical record? |
|---|---|---|---|---|
| `progression.lastSessionMuscleGroups`, `lastSessionDate`, `lastSessionFocus` | `users/{uid}` (Firestore) | `trackMuscleUsage`, `muscle-fatigue.service.ts:47` ← called from `useActivitySync.ts:293` | On workout completion | **The one genuine future-adjustment write** — `lastSessionFocus` directly changes what `SplitDecisionService`'s PPL rotation computes on the NEXT call (§A4). Scoped to volume/dominance weighting, not domain scope. |
| `strength.domainSetsCompleted`, `sessionLogs`, `totalSetsCompleted` | localStorage only (`useWeeklyVolumeStore`, A1) | `recordStrengthSession`, `useWeeklyVolumeStore.ts:265` ← `useActivitySync.ts:239` | On workout completion | Historical accumulator. `getRemainingBudget()`/`getDomainSetsCompleted()` are pure getters (`:362,388` — confirmed, no write side effect) — every future read recomputes live from the same accumulated history; nothing is pre-decided and stored as a plan. |
| `dailyProgress/{uid}_{date}` — `workoutCompleted`, `dailyStrength*` (A2) | Firestore | `markTodayAsCompleted`, `useProgressionStore.ts:846` ← `completion-sync.service.ts:111` | On workout completion | Historical record of that specific day. No forward-looking field. |
| `progression.lastSessionFocus` consumers | *(see above — same field, listed once)* | | | |

**Direct answer to "does anything write a future adjustment"**: yes, exactly one thing —
`lastSessionFocus`. Everything else this pass found is either a pure historical log or a running
total whose *interpretation* changes on the next read (not a stored future plan). No mechanism
writes "tomorrow should be X" anywhere — the closest thing is `lastSessionFocus` implicitly shaping
what `SplitDecisionService` will compute next time it's asked, and that computation never reaches
`activeDomains` (§A4).

### C3. The gap against "every adjustment is written to the schedule and visible there"

Factual list, no implementation proposed:

1. **No adjustment is written to the schedule at all, ever, today.** `lastSessionFocus` (the one
   real future-affecting write, C2) goes to `users/{uid}.progression`, not to
   `recurringTemplate`/`UserScheduleEntry` (doc 10's schedule data structures). The schedule and the
   one real adaptive signal live in completely separate documents with no code connecting them.
2. **The two real domain-balance signals that exist — `domainSetsCompleted`/`neglectedDomains` (A1,
   A4) and `SplitDecisionService`'s rotation (A4) — never write anywhere.** They're recomputed fresh
   from raw history on every read (C2 table). There is no "smart coach decision" object anywhere
   that a schedule layer could read, because none is ever persisted as a decision — only as raw
   inputs (sessionLogs, lastSessionFocus) that get re-derived each time.
3. **No mechanism connects a detected imbalance (push>pull by 1.5x, a neglected domain, a missed
   day) to a schedule mutation.** `LoadAdvisorBanner` and `SmartWeeklySchedule`'s makeup-pairing
   both detect real signals and stop at rendering text/UI state — neither writes anything back.
4. **A2's partial-completion signal (`strengthGoalMet`) is flag-gated off in production
   (`HOME_DAILY_GOAL_V1 = false`)** — even as a historical record, it currently isn't being written
   for real users, so there is nothing yet to build a "responds to partial completion" adjustment
   on top of, until that flag ships.
5. **No makeup-workout mechanism exists to adjust for missed content (A3)** — so "the rest of the
   week gets corrected based on what happened" has no engine-side hook to attach to for the
   specific case of a fully-skipped day, only for the render-layer streak/banner concepts already
   found.

---

## Open questions — only David can decide

1. Given A2 is flag-gated off in production, does the smart-coach contract wait for
   `HOME_DAILY_GOAL_V1` to ship, or does "adjustment" only need `domainSetsCompleted` +
   `lastSessionFocus` (both already live) to start?
2. `SplitDecisionService`'s PPL rotation (A4) and the schedule layer's forthcoming rotation (doc 10
   §8's joint recommendation: schedule wins) are now two rotation algorithms with overlapping intent
   — is `SplitDecisionService`'s version retired/absorbed once the schedule owns rotation, or does
   it stay for its current volume/dominance-weighting role only?
3. `weekly-load.service.ts`'s `neglectedDomains` (A4) is a real, already-wired domain-balance signal
   — but scoped to the hybrid engine only. Does the new schedule/smart-coach contract adopt this
   existing mechanism for home-strength too, or build something new alongside it?
4. Is `lastSessionFocus` (the one confirmed real future-affecting write today) meant to be
   superseded by whatever the schedule layer writes, or does it stay as a secondary signal?
