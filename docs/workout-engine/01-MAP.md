# Workout Engine — Code-Truth Map

> **Status:** Pure mapping document. No code was changed to produce this file.
> **Method:** Direct reading of the live working tree (branch `chore/persona-content-relabel`,
> verified 2026-09-02) — every claim below cites `file:line`. Where the code was ambiguous,
> contradictory, or not fully traced, it is marked **GAP** rather than guessed. See
> [Gaps and Open Questions](#gaps-and-open-questions) at the end.
> **Scope:** the **strength / home workout** generator (`WorkoutGenerator.ts` +
> `home-workout.service.ts`) and its live player (`StrengthRunner.tsx`). Running and hybrid
> are referenced only where they intersect (e.g. shared level scale, hybrid reusing
> `StrengthRunner`).

## ⚠️ Before reading further: two existing docs are partly stale

Two pre-existing documents describe this engine and were used as orientation for this map, but
**both contain claims contradicted by the current live code**:

| Document | Stale claim | Current reality |
|---|---|---|
| `.cursoragents/Workout_Engine_Truth.md` (LAW 14) | Generator lives at `generator/services/workout-generator.service.ts` | That file does not exist. Live path: `services/home-workout.service.ts` → `core/pipeline/PipelineOrchestrator.ts` → `logic/WorkoutGenerator.ts` (see [§3](#3-full-flow-chain)) |
| Same doc, LAW 5 | Slot 3 = "isolation / core / grip" (core folded into a generic accessory slot) | Core has its **own** `domain: 'core'` block, added last, `isAccessorySlot: true` — not folded into isolation/grip (`StructureDirector.ts:196-203`, see [§9](#9-coreabs-exercises)) |
| Same doc, LAW 11.1 | Office-mode splits workouts into Part A / Part B via `Fragmenter.ts`, routing `core_*` patterns to Part A | `Fragmenter.ts` and the `blueprint.types.ts` slot system it depends on are **dead code** — zero live call sites (`Fragmenter.ts`, see [§9.B4](#9-coreabs-exercises)) |
| `.claude/knowledge/workout-generator-map.md` (2026-07-12 static audit) | "Tabata does not exist anywhere in the codebase" | Tabata is now live — a separate finisher probability track (`resolveTabataFinisher`, `buildTabataBlock`, `WorkoutGenerator.ts:1109-1124`) |

Everything below was re-verified against the current tree, not copied from either document.

---

## 1. Entry Point

There is **no single** entry point — 4 distinct call sites, all funneling into the same two
exported functions in `src/features/workout-engine/services/home-workout.service.ts`:
`generateHomeWorkoutTrio()` (line 683) and its thin wrapper `generateHomeWorkout()` (line 210,
which calls `generateHomeWorkoutTrio` and unwraps one slot — `:213`).

### 1a. Primary — Home dashboard auto-generation

- **File / component:** `src/features/home/components/StatsOverview.tsx` (`StatsOverview`),
  mounted from `src/app/home/page.tsx:45`.
- **Trigger:** **not a button.** A `useEffect` (`StatsOverview.tsx:657`) fires on mount and again
  on `targetDate` change — the workout is generated proactively, before the user asks.
- **Call site:** `StatsOverview.tsx:852` — `generateHomeWorkoutTrio({ userProfile, location, ... })`,
  after resolving GPS/park context (`resolveWorkoutContext`, `:732`) and the day's schedule
  (`getScheduleEntries`/`resolveScheduledProgram`, `:759-783`).
- **Result:** `setTrioResult(trio)` (`:870`), auto-focused to `trio.meta.defaultFocusIndex`
  (`:872-874`); UI renders a 3-card Easy/Balanced/Intense carousel — nothing is generated
  on-demand from the carousel itself, all 3 options already exist.

### 1b. Custom Workout Builder — explicit user-driven generation

- **File / component:** `src/features/home/components/WorkoutBuilderSheet.tsx`
  (`WorkoutBuilderSheet`), mounted from `src/app/home/page.tsx:3150`.
- **Trigger:** real button. `WorkoutBuilderSheet.tsx:1215-1216` —
  `<button onClick={handleGenerate} disabled={isLoading || !profile} ...>`.
- **Handler:** `handleGenerate` (`:603-666`).
- **Call site:** `:635` — `generateHomeWorkout({ userProfile, testLocation, availableTime,
  difficulty, targetDifficulty: difficulty, isManualOverride: true, ... })`.
- The panel where the user picks location/duration/difficulty/muscle chips and taps a single
  "generate" CTA. Sets `targetDifficulty` — a single-slot fast path (see §2).

### 1c. Adjust / Quick-Swap sheet — `UserWorkoutAdjuster`

- **File / component:** `src/features/home/components/UserWorkoutAdjuster.tsx`
  (`UserWorkoutAdjuster`), mounted from `StatsOverview.tsx:1219`.
- **Trigger:** button. `:393` — `onClick={handleApply}`.
- **Handler:** `handleApply` (`:112-152`).
- **Call site:** `:127` — `generateHomeWorkout({ userProfile, testLocation, availableTime,
  difficulty, requiredDomains: derivedRequiredDomains, ... })`, then
  `onApplyAndStart(result.workout)` (`:141`).
- Lighter sibling of 1b — quick intensity/duration/muscle-focus adjustment that immediately
  generates and starts one workout.

### 1d. Admin QA tool — Workout Simulator (not user-facing)

- **File:** `src/app/admin/workout-simulator/page.tsx:421` —
  `generateHomeWorkoutTrio(options)`, built from `buildMockProfile(...)` (`:399`), not a real
  Firestore profile. Useful as a reference for the full `HomeWorkoutOptions` surface (exposes
  level/persona/injuries/gear/daysInactive/coldStart/activePrograms overrides in its own form).

**Other internal callers** exist but are downstream/derived flows, not primary entries:
`services/first-workout.service.ts:224` (onboarding), `hybrid/start-hybrid-session.ts:221,371`
(hybrid park sessions), `core/generators/full-strength.generator.ts:103,167,233` (post-workout
suggestions).

---

## 2. Parameters (`HomeWorkoutOptions`)

Source of truth: `src/features/workout-engine/services/home-workout.types.ts:26-209`
(interface `HomeWorkoutOptions`), cross-checked against `_buildSharedPipeline`
(`home-workout.service.ts:1376-2507`) and `generateHomeWorkoutTrio` (`:683-1194`).

| Param | Type | Default | Source |
|---|---|---|---|
| `userProfile` | `UserFullProfile` | required | Full Firestore user doc, passed by caller |
| `location` | `ExecutionLocation` | `'park'` (`DEFAULT_LOCATION`, `:163`) unless `testLocation` set | `StatsOverview.tsx:701-708` chain: `sessionStorage['currentWorkoutLocation']` → `profile.lifestyle.locationPreference` → `profile.firstWorkoutLocation` → `'home'`; re-resolved via GPS/park lookup into `effectiveLocation`. Builder/Adjuster: explicit pill selection |
| `intentMode` | `IntentMode` | `'normal'` (`:1382`) | Builder sets `'blast'` when `difficulty===3 && availableTime<=20` (`WorkoutBuilderSheet.tsx:611,641`) |
| `availableTime` | `number` (min) | `30` (`:1383`) | UI duration state; StatsOverview computes `condensedTime` (60, or 15 for late-night pivot, `:717-719`) |
| `difficulty` | `1\|2\|3` | `2` (`:1384`, param `requestedDifficulty`) | User intensity pill (Builder/Adjuster); StatsOverview never sets it explicitly — trio loop assigns all 3 bolts anyway |
| `shadowMatrix` | `ShadowMatrix` | undefined | QA-only override |
| `injuryOverride` | `InjuryShieldArea[]` | undefined → `extractInjuryShield(userProfile)` (`:1565`) | Real value: user's injury/shield profile fields; override is QA-only |
| `equipmentOverride` | `string[]` | undefined → `normalizeEquipmentArray` (`:1573-1579`) | Real gear: `userProfile.equipment[location]` + gym catalog + park inventory; Adjuster passes `[]` for bodyweight-only toggle (`:133`) |
| `daysInactiveOverride` | `number` | undefined → `calculateDaysInactive(userProfile)` (`:1564`) | Real: last-session timestamp; override QA-only |
| `personaOverride` | `LifestylePersona` | undefined → `mapPersonaIdToLifestylePersona(userProfile)` (`:1566`) | Real: profile persona field; override QA-only |
| `timeOfDay` | `TimeOfDay` | undefined → `detectTimeOfDay()` (`:1580`) | Auto-detected clock read; no real caller overrides it |
| `isFirstSessionInProgram` | `boolean` | undefined | Not set by any of the 3 primary UI callers — feeds `resolveEffectiveDifficulty`'s first-session guard (`WorkoutGenerator.ts:475-482`) |
| `remainingWeeklyBudget` | `number` | undefined | `useWeeklyVolumeStore.getState().getRemainingBudget()` (Zustand) — `StatsOverview.tsx:820-822` etc. |
| `weeklyBudgetUsagePercent` | `number` | undefined | Same store, `getBudgetUsagePercent()` |
| `weeklyIntenseCount` | `number` | `0` (`:1394`) | Not set by real UI callers; feeds `getAvailableDifficulties` gating (`:1785-1790`) |
| `isRecoveryDay` | `boolean` | undefined/false | Rest-day path normally drives this via `isScheduledRestDay` instead |
| `maxIntenseWorkoutsPerWeek` | `number` | undefined → `resolveGlobalMaxIntense` (`:1585,1782`) | Real: Firestore `programLevelSettings` (Lead Program); override QA-only |
| `protocolProbability` | `number` | undefined | Real source: Firestore `programLevelSettings.protocolProbability`, resolved per-program (`:2091-2254`); option-level value is fallback only (`:2322`) |
| `preferredProtocols` | protocol keys | undefined | Same — real source `programLevelSettings.preferredProtocols` (`:2357-2358`) |
| `straightArmRatio` | `number` | undefined → `0.4` internal default (`:2366`) | SA/BA tendonitis guard; may be capped by periodization Deload (`sessionPolicy.straightArmCap`) |
| `weeklySASets` | `number` | undefined | Straight-arm sets completed this week, `useWeeklyVolumeStore` |
| `levelDefaultRestSeconds` / `restMultiplier` | `number` | undefined | Firestore `programLevelSettings` (per-level rest defaults) |
| `selectedDate` | `string` (`YYYY-MM-DD`) | undefined → today | `StatsOverview` passes calendar-selected `targetDate` (`:856`) |
| `scheduledProgramIds` | `string[]` | undefined → `userProfile.progression.activePrograms[0].templateId` (`:1428-1437`) | `resolveScheduledProgram` for target date (`StatsOverview.tsx:776-783`); Builder: pill selection (`:626-627`); Adjuster: selected skill (`:137`) |
| `isScheduledRestDay` | `boolean` | `false` (`:1405`) | `resolveScheduledProgram`'s `isRestDay` flag — drives the rest-day fast path |
| `domainSetsCompletedThisWeek` | `Record<string, number>` | undefined | `useWeeklyVolumeStore.getState().getDomainSetsCompleted()` |
| `remainingScheduleDays` | `number` | undefined | Computed from `userProfile.lifestyle.scheduleDays` vs. today (`StatsOverview.tsx:834-842`) |
| `recentExerciseIds` | `string[]` | undefined | Last 2 sessions, anti-repetition (`getRecentExerciseIds(2)`) |
| `requiredDomains` | `string[]` | undefined → auto-selected from scheduled programs | Builder/Adjuster: muscle-chip UI selection |
| `strictDomains` | `boolean` | undefined | Builder: `(derivedRequiredDomains?.length ?? 0) > 0` |
| `testLocation` | `ExecutionLocation` | undefined | QA/Builder/Adjuster only — bypasses "Ultimate Park Force" default |
| `parkEquipmentIds` | `string[]` | undefined | GPS-nearest-park inventory via `resolveWorkoutContext` |
| `targetDifficulty` | `1\|2\|3` | undefined | Builder only — single-slot fast path, skips 2 of 3 trio bolts |
| `isManualOverride` | `boolean` | undefined | Builder only, `true` — bypasses weekly-deficit budget clamping |
| `generateSingleOption` | `boolean` | undefined | StatsOverview, conditionally, for a drawer fast-path |
| `targetOptionIndex` | `0\|1\|2` | undefined → periodization's `sessionPolicy.defaultFocusIndex` | Not set by the 3 primary UI callers |
| `skipCycleRestart` | `boolean` | undefined | Used by read-only preview callers (e.g. hybrid preview) |

**`WorkoutGenerationContext`** (the generator-internal type built by `_buildSharedPipeline`,
`:2302-2415`) is a **derived superset**, not a 1:1 passthrough of the above. Notable
derived/injected fields: `userLevel` (`getBaseUserLevel`), resolved `persona` object,
`detrainingLock`/`volumeReductionOverride`/`periodizationWeek` (periodization engine),
`tabataPool`/`tabataProbability`, `domainBudgets` (per-program-type resolved budgets),
`splitType`/`dominanceRatio`/`priority1-3SkillIds`/`dailySetBudget` (Split Decision Engine),
`globalExercisePool` (post-filter pool), `exerciseHistoryMap` ("David Staircase floor"),
`goalExerciseIds`/`goalTargets` (Progressive Overload goals).

---

## 3. Full Flow Chain

Numbered as an editor-followable trace. All `file:line` verified directly this session.

1. **Entry** — UI calls `generateHomeWorkoutTrio(options)` or `generateHomeWorkout(options)` →
   `home-workout.service.ts:210` (wrapper) or `:683`.
2. **Rest-day fast path** — `:692-695`: if `isScheduledRestDay || isRecoveryDay`, tries
   `tryRestDayFastPath(options)` (`:430`, targeted recovery-video Firestore query). If it
   returns a result, the rest of the pipeline is skipped entirely.
3. **`_buildSharedPipeline(options)`** — `:700` calling `:1376`. Runs **once** per trio call:
   1. `resolveEffectivePipelineLocation()` (`:1418`/`:1280`) — final `location` ("Ultimate Park
      Force" logic).
   2. Normalize `scheduledProgramIds` (`:1435-1437`).
   3. Parallel fetch: `getAllExercises()`, `getAllGymEquipment()`, `getCachedPrograms()`,
      `ensureEquipmentCachesLoaded()` (`:1450-1455`).
   4. Build Firestore-ID→slug map (`:1463`).
   5. Master-program identity guard + `calisthenics_upper` child-domain normalization
      (`:1471-1550`).
   6. `resolveExercisePool()` (`:1555`) — Tier-1 middleware: ±3 level tolerance + per-domain
      rescue candidate pool.
   7. Derive `daysInactive`, `injuries`, `persona`, `lifestyles` (`:1564-1567`).
   8. `normalizeEquipmentArray()` (`:1573`) — final `availableEquipment`.
   9. Lead Program budget: `resolveActiveProgramBudget` + `resolveGlobalMaxIntense`
      (`:1583-1586`).
   10. **Split Decision Engine** (`:1588-1780`) — branches on program type, resolves
       `resolvedDomainBudgets` and `splitContext`.
   11. Intensity gating: `getAvailableDifficulties()` (`:1785-1790`).
   12. Periodization: `derivePeriodizationWeek()` + `resolveSessionPolicy()` (`:1799-1801`) →
       `sessionPolicy` (Build/Peak/Deload/Rebuild).
   13. Build `ContextualFilterContext` (`:1883-1962`), including the `getUserLevelForExercise`
       closure.
   14. **`createPoolFactory().build(...)`** (`:2012`, `PoolFactory.ts:78`) → internally calls
       `ContextualEngine.filterAndScore()` (`ContextualEngine.ts:100`, `PoolFactory.ts:87`) —
       hard filters ([§7](#7-every-filterquery-site)), scoring, SA/BA balancing, sort-by-score,
       mechanical-balance calc. `PoolFactory` also runs a PoolRescue retry (±5 tolerance) for
       thin single-domain pools and an onboarding-stale-profile guard.
   15. Domain-precedence rescue fallback if a chip-vs-program conflict emptied the pool
       (`:2029-2051`).
   16. Protocol & Goal resolution loop over enrolled programs (`:2114-2254`) — reads Firestore
       `programLevelSettings` per program/level, resolves `adminPreferredProtocols`,
       `adminProtocolProbability`, `goalExerciseIds`/`goalTargets`, and the Tabata-candidate
       union track (`resolveTabataFinisher`, `:2258`).
   17. Per-exercise history: `getHistoryMapForExercises()` (`:2290`) — "David Staircase floor".
   18. Build `baseGeneratorContext: WorkoutGenerationContext` (`:2302-2415`) and
       `metadataCtxBase` (`:2460-2479`).
   19. Return `SharedPipelineState` (`:2481-2506`).
4. **Needs-assessment short-circuit** — `:709-728`: if no assessed level exists for any
   requested domain, returns an explicit "needs assessment" trio for all 3 slots and skips
   generation.
5. **Recovery Video Trio** (rest days) — `:733-743`: `tryBuildRecoveryVideoTrio()` (`:487`).
6. **Budget Floor** — `:745-798`: if `remainingWeeklyBudget < 6` (outside first-program-week
   grace), all 3 slots become `generateRecoveryWorkout()` (`:224`).
7. **Trio labels** — `fetchTrioLabels()` (`:801`, Firestore `app_config/workout_trio`, Hebrew
   fallback).
8. **Trio loop** (`:829-1154`), 3 "bolts" (Easy/D1, Balanced/D2, Intense/D3):
   1. Skip logic for `targetDifficulty`/`generateSingleOption` fast paths (`:833-846`).
   2. Clone the shared scored pool per option (`:852-856`); apply session-blacklist score
      penalty from prior bolts (`:859-866`).
   3. `resolveEffectiveBoltTime()` — per-bolt duration ceiling via `BOLT_DURATION_CAPS`
      (`:882-886`).
   4. Build `optionContext`; Bolt 3 pins `preferredProtocols: ['pyramid']`,
      `protocolProbability: 1.0` (`:912-916`).
   5. **`orchestrator.run(optionPool, optionContext)`** (`:919`) → `PipelineOrchestrator.run()`
      (`PipelineOrchestrator.ts:117`):
      1. Empty-pool short-circuit → `buildRestDayFallback()` (`:132-146`).
      2. `createStructureDirector().plan(context, difficulty)` (`:158`) → blueprint
         (`strategy`: single_domain/antagonist_split/full_body; `blocks`; `budgetConstraints`).
      3. Domain-strict pool filter for single-domain non-master sessions (`filterForDomain`,
         `:161-281` — see [§7.3](#7-every-filterquery-site)).
      4. Stale-profile guard (`:284-295`).
      5. **`createWorkoutGenerator().generateWorkout(filteredPool, context)`** (`:308-309`) →
         `WorkoutGenerator.ts:454` — the core "brain", step 6 below.
      6. `BudgetDistributor.reapplyCaps()` post-correction pass (`:326-338`).
      7. Merge pipeline logs, return `{ workout, ... }`.
   6. **Inside `WorkoutGenerator.generateWorkout()`** (`WorkoutGenerator.ts:454-1251`):
      1. `resolveEffectiveDifficulty()` (`:475`) — final difficulty (detraining/periodization/
         first-session guard).
      2. Active Recovery Guard — cooldown/warmup/flexibility only if `isRecoveryDay` (`:487-501`).
      3. `getExerciseCountForDuration()` (`:512`) — pool sizing.
      4. Variety jitter, deterministic seeded RNG (`:515-523`).
      5. `applySynergyBonuses()` (`:526`/`:1255`) — Master Synergy Scoring.
      6. `applyDifficultyFilter()` (`:529`).
      7. Bolt-2 per-domain level ceiling (`:554-613`) / Bolt-1 regression window (`:631-699`).
      8. `selectExercises()` (`:702`/`:1506`) — the selection router.
      9. Movement-Group Diversity Pass (`:712-807`).
      10. **Volume/Budget:** `calculateVolumeAdjustment()` (`:819`) then
          `createBudgetDistributor().distribute()` (`:823-829`, `BudgetDistributor.ts:107`) —
          `assignVolume → maxSets cap → weeklyBudget cap → dailyBudget cap → set rebalance →
          skill cluster cap` in one call.
      11. **"David Rule"** relative-gap guard (`:833-963`) — rescues under-level exercises via
          `findLevelAppropriateSubstitute` (progressive ±2→±4→±6 radius search).
      12. `selectProtocol()` (`:966`/`:1575`) — protocol lottery (straight/pyramid/emom/
          superset/antagonist_pair), Bolt-3's forced pyramid override applies.
      13. `applyPhysiologicalSort()` (`:972`) — first-pass sort.
      14. Protocol processor dispatch (`:994-1020`) — pyramid gets surgical target selection.
      15. `deduplicateExercises()` (`:1023`).
      16. `runAllGuarantees()` (`:1040`, `GuaranteePassRunner.ts:543`) — Horizontal, Vertical
          Foundation, Full-Body Domain guarantees.
      17. Legs Cap for full-body (max 2, `:1048-1083`).
      18. `applyPhysiologicalSort()` again — final anchor sort (`:1086`).
      19. `generateTitle()`/`generateDescription()`/`generateAICue()` (`:1105-1107`).
      20. **Tabata finisher roll** (`:1109-1124`) — separate probability track
          (`context.tabataProbability`), difficulty ≥ 2, user level ≥ `MIN_TABATA_USER_LEVEL`;
          on success calls `buildTabataBlock()`.
      21. `calculateEstimatedDuration()` (`:1127`) then Time-Volume Feedback Loop
          (`:1142-1178`) — trims sets via `applySmartSetCap()` while duration exceeds
          `availableTime + 3min` (max 20 iterations).
      22. `determineStructure()` (`:1183`/`:1691`) — overridden by the protocol's own structure
          if not `'standard'`.
      23. `calculateMechanicalBalance()` (`:1190`/`:1705`).
      24. `calculateWorkoutStats()` (`:1193`) — calories/coins/reps/hold-time.
      25. Returns `GeneratedWorkout` (`:1233-1250`).
   7. Attach AI-cue fallback (`:923-925`).
   8. **Warmup:** `prependWarmupExercises()` (`services/warmup.service.ts:455`, called `:936`) —
      uses the full unfiltered `allExercises` pool, not the scored pool.
   9. **Cooldown:** `appendCooldownExercises()` (`services/cooldown.service.ts:27`, `:949`).
   10. Trio post-processing modifiers (`trio-modifiers.service.ts`: `applyIntenseOption` /
       `applyFlowRegression` / `applyTagPreference`, `:958-973`).
   11. **`enforceVolumeCap()`** (`PresentationFormatter.ts:430`, `:982-987`) — final
       duration-ceiling trim.
   12. `resolveWorkoutMetadata()` — Firestore-backed title/description/cue (`:990-1072`).
   13. Desk-workout constraint filter, title-keyword-triggered (`:1074-1105`).
   14. Title-collision dedup suffix (`:1107-1113`).
   15. **`sortAndPair()`** (`PresentationFormatter.ts:336`, `:1124-1128`) — locked final
       ordering: antagonist re-pair, then strict Domain-Priority sort.
   16. **`annotateRepRanges()`** (`PresentationFormatter.ts:283`, `:1135`) — Hebrew rep-range
       display strings.
   17. Collect main-exercise IDs into `sessionBlacklist` for the next bolt (`:1138-1140`).
   18. Push `{ label, result }` into `results[]` (`:1147`).
9. **Single-option padding** — `:1160-1164`: for `targetDifficulty`/`generateSingleOption` fast
   paths, slots 1 & 2 are padded so the 3-tuple type contract holds.
10. **Cycle Restart** — `:1175-1179`: 21+ day gap + `!skipCycleRestart` → fire-and-forget
    `_persistCycleRestart()` (`:1200`) writes a fresh `activePrograms[].startDate`.
11. **Return** — `:1183-1193`: `HomeWorkoutTrioResult` — 3 labeled options, `isRestDay`,
    `labelsSource`, `meta` (`periodizationWeek`, `coachCue`, `defaultFocusIndex`).
12. **Back at the UI caller:** `generateHomeWorkout()` unwraps `trio.options[targetDifficulty
    != null ? 0 : 1].result` (`:216-217`) for Builder/Adjuster; `StatsOverview` keeps the full
    trio, auto-focused to `defaultFocusIndex`.

---

## 4. Exercise Schema

**Canonical type:** `Exercise` — `src/features/content/exercises/core/exercise.types.ts:606-780`.

**Collection:** literal string `'exercises'` (`EXERCISES_COLLECTION`,
`src/features/content/exercises/core/exercise.service.ts:67`, re-declared identically in 5+
other files rather than imported from one constant). One collection, not per-language — HE/EN
are **separate documents** linked by `base_movement_id` (videos differ: HE original audio vs. EN
AI-voiceover — doc comment `exercise.types.ts:591-604`), distinguished by a `lang` field.
`supportedLangs?: ExerciseLang[]` (`:618`) tracks which languages have video content.

| Field | Type | Optional? | Note |
|---|---|---|---|
| `id` | `string` | required | doc id |
| `supportedLangs` | `('he'\|'en')[]` | optional | drives EN-content `array-contains` filtering |
| `name` | `LocalizedText` | required | multi-language display name |
| `type` | `'reps'\|'time'\|'rest'` | required | |
| `loggingMode` | `'reps'\|'completion'` | required | `'completion'` = checkmark only, no numeric input |
| `equipment` | `EquipmentType[]` | required | **legacy** — superseded by `execution_methods[].gearIds/equipmentIds` |
| `muscleGroups` | `MuscleGroup[]` | required | **legacy** — superseded by `primaryMuscle`/`secondaryMuscles` |
| `primaryMuscle` | `MuscleGroup` | optional | single primary target |
| `secondaryMuscles` | `MuscleGroup[]` | optional | |
| `programIds` | `string[]` | required | links to program docs (`'upper_body'`, `'core'`, etc.) |
| `media` | `ExerciseMedia` | required | **legacy** exercise-level media; per-method media takes priority |
| `execution_methods` | `ExecutionMethod[]` | optional | canonical Firestore field (snake_case) |
| `executionMethods` | `ExecutionMethod[]` | optional | camelCase alias, same data |
| `content` | `ExerciseContent` | required | `{description?, instructions?, specificCues?, goal?, notes?, highlights?}` |
| `stats` | `ExerciseStats` | required | `{views: number}` |
| `movementGroup` | `MovementGroup` | optional | `squat\|hinge\|horizontal_push\|vertical_push\|horizontal_pull\|vertical_pull\|core\|isolation\|flexibility` — keeps Smart Swap within the same movement family |
| `targetPrograms` | `TargetProgramRef[]` | optional | `{programId, level, strengthScore?, balanceScore?, mobilityScore?}` — **level source of truth**; empty ⇒ Level 1 default |
| `requiredGymEquipment` | `string` | optional | **legacy** single-value |
| `requiredUserGear` | `string[]` | optional | **legacy** |
| `alternativeEquipmentRequirements` | `AlternativeEquipmentRequirement[]` | optional | priority-ordered alternatives |
| `base_movement_id` | `string` | optional | groups movement variants; links HE/EN docs |
| `tags` | `ExerciseTag[]` | optional | `skill\|compound\|isolation\|explosive\|hiit_friendly\|desk_mobility\|chair_stretch` |
| `exerciseRole` | `ExerciseRole` | optional | `warmup\|cooldown\|main\|recovery\|reinforcement` |
| `showOnRestDays` | `boolean` | optional | meaningful only when `exerciseRole==='recovery'` |
| `restDayProgramIds` | `string[]` | optional | subset of `programIds` gating rest-day injection |
| `isFinisherVideo` | `boolean` | optional | meaningful only when `exerciseRole==='reinforcement'` |
| `isFollowAlong` | `boolean` | optional | video plays start-to-finish, timer syncs; default true for warmup/cooldown |
| `hasAudio` | `boolean` | optional | default false ⇒ player mutes video |
| `secondsPerRep` | `number` | optional | default 3s, duration estimation |
| `defaultRestSeconds` | `number` | optional | **`@deprecated`** — "Tier Engine is now the single source of truth for rest" |
| `movementType` | `'compound'\|'isolation'` | optional | |
| `symmetry` | `'bilateral'\|'unilateral'` | optional | unilateral doubles total duration calc |
| `noiseLevel` | `1\|2\|3` | optional | 1=silent/apartment-friendly, 3=loud |
| `sweatLevel` | `1\|2\|3` | optional | 1=low, 3=high/HIIT |
| `injuryShield` | `InjuryShieldArea[]` | optional | `wrist,elbow,shoulder,lower_back,neck,knees,ankles,hips` |
| `mechanicalType` | `'straight_arm'\|'bent_arm'\|'hybrid'\|'none'` | optional | SA/BA balancing |
| `fieldReady` | `boolean` | optional | zero-equipment/surface requirement — tactical/military mode |
| `requiredLocations` | `ExecutionLocation[]` | optional | content-gap analysis, not generation |
| `requiredTier` | `1\|2\|3` | optional | access tier gate; default 1 |
| `createdAt`/`updatedAt` | `Date` | optional | |
| `recommendedLevel` | `number` | optional | **`@deprecated`** — level now derives from `targetPrograms` |

### `ExecutionMethod` sub-object (`exercise.types.ts:424-538`)

One exercise carries an array of these — each a distinct way to perform the movement in context.

| Field | Type | Note |
|---|---|---|
| `methodName` | `LocalizedText` | optional; per-variant display name |
| `notificationText` | `LocalizedText\|string\|GenderedText` | push copy, ≤100 chars |
| `location` | `ExecutionLocation` | required — `home\|park\|street\|office\|school\|gym\|airport\|library\|desk\|service` |
| `requiredGearType` | `'fixed_equipment'\|'user_gear'\|'improvised'` | required |
| `gearIds` / `equipmentIds` | `string[]` | user_gear/improvised ids / gym-equipment ids |
| `gearId` / `equipmentId` | `string` | **`@deprecated`** single-value, auto-migrated to arrays |
| `brandId` | `string\|null` | optional; ref into `outdoorBrands` for fixed_equipment brand video |
| `locationMapping` | `ExecutionLocation[]` | optional; explicit multi-location tag |
| `lifestyleTags` | `string[]` | e.g. `['student','parent','office_worker']` |
| `specificCues` / `highlights` | `LocalizedText[]` | per-variant coaching points / benefits |
| `media` | inline object | `{mainVideoUrl?, videoDurationSeconds?, instructionalVideos?, imageUrl?, previewVideo?, fullTutorial?}` |
| `workflow` | `ProductionWorkflow` | `{filmed, filmedAt?, audio, audioAt?, edited, editedAt?, uploaded, uploadedAt?}` |
| `needsLongExplanation` / `explanationStatus` | `boolean` / `'missing'\|'ready'` | content-production tracking |

---

## 5. Workout Schema (generated output)

### ⚠️ Two unrelated "blueprint" systems exist — only one is live

1. **Legacy, dead:** `core/types/blueprint.types.ts` (`BlueprintSlot`, `WorkoutBlueprint`,
   `ExerciseInstance`, `FilledSlot`, `GeneratedSession`). Consumed only by `logic/Fragmenter.ts`
   and `logic/SwapEngine.ts` — grep for instantiation (`new Fragmenter`, `new SwapEngine`, or any
   downstream import) returns **zero** live call sites. Treat as dead code (see [§9.B4](#9-coreabs-exercises)).
2. **Live:** `core/pipeline/pipeline.types.ts` defines a *different* `WorkoutBlueprint`
   (`{strategy, blocks: BlockToken[], protocolHints, budgetConstraints}`, `:176-183`) plus
   `BlockToken` (`:51-82`). This is what `StructureDirector.plan()`
   (`core/pipeline/StructureDirector.ts:67`) actually produces, consumed by `PoolFactory` →
   `BudgetDistributor` → `PipelineOrchestrator`. Wired into `WorkoutGenerator.ts:88,709`.

### Top-level generated object — `GeneratedWorkout`

`src/features/workout-engine/logic/workout-generator.types.ts:243-304`:

```ts
export interface GeneratedWorkout {
  title: string;
  description: string;
  aiCue?: string;
  logicCue?: string;
  exercises: WorkoutExercise[];
  estimatedDuration: number;
  structure: WorkoutStructure;              // 'standard'|'emom'|'amrap'|'circuit'
  difficulty: DifficultyLevel;               // 1|2|3
  volumeAdjustment?: VolumeAdjustment;
  blastMode?: BlastModeDetails;
  mechanicalBalance: MechanicalBalanceSummary;
  stats: WorkoutStats;
  isRecovery: boolean;
  totalPlannedSets: number;
  needsAssessment?: boolean;
  assessmentDomains?: string[];
  appliedProtocol?: string;
  tabataBlock?: TabataBlockSpec;
  pipelineLog?: string[];
  metadataCtx?: WorkoutMetadataSnapshot;
  executionLocation?: ExecutionLocation;
}
```

No separate "block"/"slot" wrapper — `exercises` is a **flat array**. Structural grouping
(warmup/main/cooldown, supersets, tabata blocks) is expressed via *fields on each exercise*
(`exerciseRole`, `pairedWith`, `protocolBlock`), not nested block objects, at this layer.

### `BlockToken` — generation-time slot placeholder (transient, pre-fill only)

`core/pipeline/pipeline.types.ts:51-82` — the closest thing to a "slot" in the live pipeline, but
exists only inside `StructureDirector`/`PoolFactory`/`BudgetDistributor`; never appears on the
final `GeneratedWorkout`.

```ts
export interface BlockToken {
  id: string;                                // e.g. "main_0_vertical_pull"
  role: 'main' | 'warmup' | 'cooldown';
  domain?: string;                            // 'pull'|'push'|'legs'|'core'
  movementGroup?: string;                     // 'vertical_pull'|'horizontal_pull'|'squat'...
  requiredPriority?: ExercisePriority;
  isHorizontalBalance?: boolean;
  isAccessorySlot?: boolean;
  tempoModifier?: TempoModifier;
}
```

### Exercise instance — `WorkoutExercise` (where sets/reps/rest live)

`workout-generator.types.ts:81-170`:

```ts
export interface WorkoutExercise {
  exercise: Exercise;                         // full content.exercises doc (§4)
  method: ScoredExercise['method'];           // resolved ExecutionMethod — see §6
  mechanicalType: MechanicalType;
  sets: number;
  reps: number;                               // target reps, OR seconds when isTimeBased
  repsRange?: { min: number; max: number };
  isTimeBased: boolean;
  restSeconds: number;                        // rest AFTER this exercise
  priority: ExercisePriority;
  score: number;
  reasoning: string[];
  programLevel?: number;
  isOverLevel?: boolean;
  tier?: TierName;                            // 'elite'|'hard'|'match'|'easy'|'flow'
  levelDelta?: number;
  isGoalExercise?: boolean;
  rampedTarget?: number;
  exerciseRole?: 'warmup' | 'main' | 'cooldown';
  isGeneralWarmup?: boolean;
  pairedWith?: string;                        // superset partner exerciseId
  supersetType?: 'staggered' | 'compound';
  repsSequence?: number[];                    // per-set rep ladder (pyramid/dropset)
  pyramidSequence?: PyramidStep[];             // per-set exercise-variant swap
  protocolBlock?: 'tabata';
  wasSwapped?: boolean;
  dimensionUnavailable?: { dimension: string; value: string };
  formattedRepRange?: string;                 // pre-computed UI string
}
```

Sets/reps/rest: `sets` (count), `reps` (target reps *or* seconds — disambiguated by
`isTimeBased`), `repsRange` (min/max, double-progression display), `restSeconds` (rest after this
exercise), `repsSequence` (per-set rep values, overrides `reps` for pyramid/dropset). Hold
duration is **not a separate field** — for time-based exercises, `reps`/`repsRange` ARE the hold
seconds (`hold` only exists as a `TierConfig` axis below, not a `WorkoutExercise` field). Set-type/
protocol lives in three places depending on shape: `priority` (structural role), `pairedWith` +
`supersetType` (pairing), `protocolBlock`/`GeneratedWorkout.appliedProtocol`/`tabataBlock`
(block-level protocols).

### `TierConfig` — the rest/reps/hold/sets source table

`workout-generator.types.ts:30-57`:

```ts
export interface TierConfig {
  reps: { min: number; max: number };
  hold: { min: number; max: number };
  rest: { min: number; max: number };
  sets: { min: number; max: number };
}
export const TIER_TABLE: Record<TierName, TierConfig> = {
  elite: { reps: {min:1,max:3},   hold: {min:3,max:6},   rest: {min:180,max:240}, sets: {min:4,max:5} },
  hard:  { reps: {min:1,max:3},   hold: {min:5,max:10},  rest: {min:150,max:180}, sets: {min:4,max:5} },
  match: { reps: {min:3,max:6},   hold: {min:10,max:15}, rest: {min:120,max:150}, sets: {min:3,max:4} },
  easy:  { reps: {min:10,max:15}, hold: {min:15,max:25}, rest: {min:90,max:120},  sets: {min:3,max:3} },
  flow:  { reps: {min:10,max:15}, hold: {min:25,max:45}, rest: {min:60,max:90},   sets: {min:3,max:3} },
};
```

### Downstream player shape — `WorkoutPlan` / `WorkoutSegment` / `Exercise`

`src/features/parks/core/types/route.types.ts` — this is what `StrengthRunner` /
`useWorkoutStateMachine` actually consume (via `sessionStorage`), **not** `GeneratedWorkout`
directly (see [§10](#10-live-workout-logic--relationship-to-the-generator)):

```ts
// route.types.ts:162-179 (abridged)
export interface WorkoutPlan {
  id: string;
  name: string;
  segments: WorkoutSegment[];
  totalDuration: number;
  difficulty: 'easy' | 'medium' | 'hard';
  trainingType?: 'strength' | 'cardio';
  aiCue?: string;
  workoutLocation?: 'home' | 'park' | 'gym' | 'street' | 'office' | string;
}

// route.types.ts:133-160
export interface WorkoutSegment {   // the real "block" the player renders
  id: string;
  type: WorkoutSegmentType;         // 'travel' | 'station'
  title: string;
  target: { type: 'distance'|'time'|'reps'; value: number; unit?: string };
  exercises?: Exercise[];
  isCompleted: boolean;
  restBetweenExercises?: number;
  protocol?: SegmentProtocolId;     // block-scoped dispatch key (tabata/emom/amrap)
  protocolConfig?: SegmentProtocolConfig;
}

// route.types.ts:43-118 (abridged) — doc comment: "Single Source of Truth" for WorkoutPlan
export interface Exercise {
  id: string;
  name: string;
  reps?: string;               // pre-formatted display string, e.g. "8-12 חזרות"
  duration?: string;            // pre-formatted, time-based
  videoUrl?: string; imageUrl?: string; bunnyVideoId?: string;
  equipment?: string[];         // resolved gear/equipment IDs — feeds the "chip", see §6
  restSeconds?: number;
  repsRange?: { min: number; max: number };
  isTimeBased?: boolean;
  sets?: number;
  exerciseRole?: 'warmup' | 'main' | 'cooldown' | 'recovery';
  pyramidSequence?: PyramidStep[];
  repsSequence?: number[];
  symmetry?: 'bilateral' | 'unilateral';
}
```

Segments are built in `buildRunnerWorkoutPlanFromGenerated.ts:192-224`: warmup-role exercises →
`seg-warmup`, main exercises minus a tabata split → `seg-main`, tabata members → their own
segment, cooldown → cooldown segment.

**Net picture:** the generator's canonical, numeric `GeneratedWorkout`/`WorkoutExercise` is the
source of truth; the player consumes a flattened, segment-grouped, partly-pre-formatted
`WorkoutPlan`/`Exercise`, produced by a mapping step detailed in [§10.2](#10-live-workout-logic--relationship-to-the-generator).

---

## 6. Execution-Method "Chip"

### Two independent selection code paths — do not conflate them

- **(A) `selectMethodForContext`** (`shared/utils/method-selection.utils.ts`) — file header calls
  it the "SINGLE SOURCE OF TRUTH" (line 2), and it IS wired into every generation-time call site.
  Decides the method baked into `WorkoutExercise.method`, therefore what the live screen's
  equipment pill shows.
- **(B) `selectExecutionMethodWithBrand`** (`generator/services/execution-method-selector.service.ts`)
  — genuine park-brand matching (matches `park.gymEquipment` brand names to
  `gymEquipmentList[].brands[].brandName`, swaps in a brand-specific `mainVideoUrl`, lines
  94-184). Its only callers are `generator/services/exercise-replacement.service.ts` and
  `players/strength/components/ExerciseReplacementModal.tsx` — i.e. it fires **only when the user
  manually opens the "swap exercise" modal**, not during normal generation.

### (A) Stage in the pipeline: per-exercise, during pool scoring — before slot-filling

`selectMethodForContext(exercise, location, availableGear, options?)`
(`method-selection.utils.ts:57-222`) is called from `ContextualEngine.findMatchingMethod()`
(`ContextualEngine.ts:514-520`), a private helper invoked once per candidate exercise inside
`filterAndScore()`. That's called from `PoolFactory.buildPool()` at `PoolFactory.ts:87` —
**at candidate-pool build/scoring time**, before `BudgetDistributor` fills final slots. A `null`
return excludes the exercise from the pool entirely — method selection doubles as a viability
filter, not just a display choice (see [§7](#7-every-filterquery-site) gate #9).

A second invocation, `resolveSubstituteMethod()` (`WorkoutGenerator.ts:433-447`), re-calls
`selectMethodForContext` for any exercise injected by the David Rule or `GuaranteePassRunner`
coverage passes — a substitute gets a freshly-resolved, context-correct method.

Both call sites are inside the pure `logic`/`core` layer — **method selection happens entirely
at generation time**, pure-TS, not lazily at render/UI time. By the time `GeneratedWorkout`
exists, every `WorkoutExercise.method` is already final.

### (A) Inputs

`selectMethodForContext(exercise, location, availableGear, options?)`:
- `exercise.execution_methods ?? exercise.executionMethods` — candidate method array (§4)
- `location` — session's `ExecutionLocation`
- `availableGear: string[]` — resolved session gear, pre-merged upstream with
  `ESSENTIAL_PARK_GEAR`/`ASSUMED_HOME_GEAR` baselines (`method-selection.utils.ts:95-97`) — park
  brand/equipment IDs enter here via `HomeWorkoutOptions.parkEquipmentIds`
- `options.homeParkFallback` — **disabled by all callers** (doc comment, lines 43-49): a dead-but-
  present feature flag
- Brand data (`brandId`, `outdoorBrands`) is **not read here at all** — exclusive to path (B)

### (A) Priority cascade (current code, `method-selection.utils.ts:57-222`)

**Park** (`:145-176`) — strict, no cross-location fallback:
1. Filter to methods tagged `location==='park'` or `locationMapping` includes it (`:146-148`).
2. Gate survivors by equipment (`applyParkGating`, `:111-122`); if any pass → return the
   media-preferred one (`:152`).
3. If park-tagged methods exist but ALL fail gating → **hard-reject `null`** — no home/gear
   fallback (`:154-166`). Explicit intent (comment `:135-144`): prevent location mixing, e.g. a
   TRX-dependent "home" method must never fire just because TRX happens to be at this park.
4. If no park-tagged methods exist at all → only pure bodyweight/surface methods
   (`SURFACE_GEAR_AT_PARK = {mat, yoga_mat, wall, chair}`) survive (`:168-176`); home-tagged
   methods never used even if gear-satisfied.

**Non-park locations** (`:178-221`):
1. Priority 1 (`:179-183`): exact `location` (or `locationMapping`) match → media-preferred.
2. Priority 2 (`:186-191`): if `location !== 'home'`, fall back to any `location==='home'` method.
3. Priority 2.5 (`:194-195`): any method whose required gear ⊆ `availableGear`.
4. Priority 2.75 (`:197-207`): opt-in, **currently always off** (`homeParkFallback`).
5. Priority 3 (`:209-218`): bodyweight-only methods (no required gear, or gear ⊆
   `{bodyweight, none, mat, yoga_mat, wall, chair}`).
6. No viable method → `null` (`:221`), exercise excluded from the pool.

Within any tier, `preferMedia()` (`:76-83`) breaks ties: exact-location-with-media >
exact-location > any-with-media > any.

### (A) Where the chip value attaches

1. `ContextualEngine.filterAndScore()` attaches the method to `ScoredExercise.method:
   ExecutionMethod` (`contextual-engine.types.ts:171-179`).
2. `BudgetDistributor` promotes it into `WorkoutExercise.method` (typed literally as
   `ScoredExercise['method']`, `workout-generator.types.ts:83` — same object, renamed field).
3. `buildRunnerWorkoutPlanFromGenerated()` (`:151-168`) reads
   `ex.method.equipmentIds/.gearIds/.gearId/.equipmentId`, merges + dedupes, runs each through
   `normalizeGearId` (`shared/utils/gear-mapping.utils.ts`), writes the result onto the
   flattened player-facing `Exercise.equipment: string[]` (`route.types.ts:83`); `bodyweight`/
   `none` filtered out.
4. Rendered in `RunnerHeader.tsx:230-264` ("Row 3: Equipment Pills", REST state) — one pill per
   `equipment[]` entry, icon via `resolveEquipmentSvgPathList`, label via `resolveEquipmentLabel`
   (`gear-mapping.utils.ts:322`) — priority order: Firestore `gear_definitions`/`gym_equipment`
   runtime cache name → static `EQUIPMENT_NAME_HE` dictionary → canonical-alias lookup →
   normalized-key retry → `FIRESTORE_GEAR_ID_TO_ICON` fallback → last-resort cache scan →
   `'ציוד לא מזוהה'`. **This never reads `brandId` or park brand data** — a generic Hebrew
   equipment-type name (e.g. "מתקן מתח"), never brand-qualified.
5. Feeding prop type: `RestPreviewExerciseShape.equipment: string[]` (`RunnerHeader.tsx:38`);
   built inline in `StrengthRunner.tsx:247-249` from `sm.activeExercise.equipment`.

### (B) Brand-aware selector — swap modal only, separate cascade

`selectExecutionMethodWithBrand()` (`execution-method-selector.service.ts:94-243`):
1. Match `equipmentId` **and** park brand name (park-only, `park.gymEquipment` present) —
   exact Firestore equipment-ID match (`:127-149`), then family match (`isEquipmentFamilyMatch`,
   `:152-177`); on match, enriches `media.mainVideoUrl` with `brand.videoUrl` (`:133-141,160-168`)
   — the **only** place in the codebase that swaps in brand-specific media/label data.
2. Fallback standard priority by location: home/office/school → `['user_gear','improvised']`;
   park/gym → `['fixed_equipment','user_gear','improvised']`; else `['user_gear','improvised']`
   (`:187-194`).
3. Within each tier, `rankCandidates()` (`:65-78`) sorts by has-media first, then (for "מתח"-named
   exercises) pullup_bar over rings.

Consumed by `exercise-replacement.service.ts`, rendered as "gear badges" in
`ExerciseReplacementModal.tsx:356-388` (`resolveGearBadges`, sharing the label-resolution
function with path A, but the *selection* logic and brand enrichment are unique to B).

### Summary

| | Path A — `selectMethodForContext` | Path B — `selectExecutionMethodWithBrand` |
|---|---|---|
| File | `shared/utils/method-selection.utils.ts` | `generator/services/execution-method-selector.service.ts` |
| Called when | Generation time (pool scoring) + substitute injection | Only when swap-exercise modal opens |
| Callers | `ContextualEngine`, `WorkoutGenerator`, `PoolFactory` (indirect), `warmup/cooldown.service`, `home-workout.service`, `tabata.block`, `useSwapAll` | `exercise-replacement.service.ts`, `ExerciseReplacementModal.tsx` |
| Brand-aware | No | Yes (park brand-name match → brand video) |
| Feeds | `WorkoutExercise.method` → `GeneratedWorkout.exercises[].method` → flattened `WorkoutPlan.Exercise.equipment[]` → live chip | Swap-modal candidate list only |

**GAP:** confirm with David whether brand-specific chip text is intended to ever appear on the
primary (non-swap) workout screen — as traced, it currently does not; the primary chip is a
generic Hebrew equipment-type label, never a brand name.

---

## 7. Every Filter/Query Site

### 7.0 Firestore fetch — confirmed broad, no `.where()`

```ts
// src/features/content/exercises/core/exercise.service.ts:76-86
export async function getAllExercises(): Promise<Exercise[]> {
  const q = query(collection(db, EXERCISES_COLLECTION), orderBy('name', 'asc'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => normalizeExercise(doc.id, doc.data()));
}
```

No `.where()` — fetches **every document** in `exercises`, called once per generation
(`home-workout.service.ts:1451`, inside a `Promise.all`). **100% of exercise filtering happens
in-memory, after a full-collection fetch.** (`contentService.ts`/`contentFragmentService.ts` are
out of scope — they query `time_contexts`/`focus_descriptions`/`content_fragments`/
`funny_titles`, never `exercises`.)

### 7.1 `InputSanitizerMiddleware.resolveExercisePool` — pre-filter (Tier 1)

`core/middleware/InputSanitizerMiddleware.ts`, `resolveExercisePool` (`:355-458`), called from
`home-workout.service.ts:1555` — runs **before** `ContextualEngine`.

| Site | Line | Predicate | Type |
|---|---|---|---|
| `filterByTolerance(3)` | `:400-414` | `Math.abs(tp.level - userLevel) <= tolerance` per `targetPrograms` entry (or `programIds` membership) | Hard |
| Domain rescue | `:436-455` | If a domain has 0 survivors after ±3, re-adds from the full pool | Relaxation |
| `<4 survive → abandon` | `:457` | `return levelMatched.length >= 4 ? levelMatched : allExercises;` | Fallback (undoes the filter) |
| Early bail-out | `:362-364` | No level/domain data → `return allExercises` | Bail-out |

```ts
// InputSanitizerMiddleware.ts:400-414
const filterByTolerance = (tolerance: number) =>
  allExercises.filter(ex => {
    if (ex.targetPrograms?.length) {
      return ex.targetPrograms.some(tp => Math.abs(tp.level - resolveUserLevelForProgram(tp.programId)) <= tolerance);
    }
    if (ex.programIds?.length) {
      return ex.programIds.some(pid => validProgramIds.has(pid) || validProgramIds.has(resolveToSlug(pid)));
    }
    return false;
  });
```

### 7.2 `ContextualEngine.filterAndScore` — the main hard-filter cascade

`logic/ContextualEngine.ts`, `filterAndScore()` (`:100-328`) — a loop over every exercise
(`:137-293`) with **11 sequential hard `continue` gates**, in order:

| # | Gate | Line(s) | Excludes |
|---|---|---|---|
| 1 | Strict program filter | `:140-148` | No match in `activeProgramFilters` (only when set) |
| 2 | Level tolerance ±N | `:163-171` | `programLevel` outside `userLevel ± levelTolerance` (default 3) |
| 3 | Exclusive skill-domain gate | `:173-205` | All `targetPrograms` in `GATED_SKILL_DOMAINS=['muscle_up']`, no baseline overlap, skill not active |
| 4 | Balance-score gate | `:207-231` | `balanceScore>10` unless `handstand`/`hspu` active |
| 5 | Skill gate (elite) | `:233-246` | Skill-tagged or `programLevel>15`, user effective `<15` |
| 6 | **Injury shield** | `:248-252,442-451` | `injuryShield ∩ health.injuries` non-empty |
| 7 | 48h muscle shield | `:254-258,457-462` | Muscle in `excludedMuscleGroups` |
| 8 | Field mode | `:260-266,467-489` | `intentMode==='field'` and not `fieldReady`/no-equipment |
| 9 | Location/method match | `:268-273,514-520` | No viable `ExecutionMethod` (delegates to §6 selector) |
| 10 | Sweat limit | `:275-283` | `sweatLevel > effectiveSweatLimit` (skipped: `bypassLimits`/`blast`; `on_the_way`→1) |
| 11 | Noise limit | `:285-289` | `noiseLevel > constraints.noiseLimit` (skipped: `bypassLimits`) |

Soft scoring (not exclusion) runs on survivors: lifestyle +2/tag, level proximity
`max(0, 3-|Δ|)`, blast bonuses, +1 video, and a **penalty** (not exclusion) for the 3rd+
straight-arm exercise (`score -= (count-2)*5`).

### 7.3 `PoolFactory` — post-`ContextualEngine` domain filter + substitute-search filters

`core/pipeline/PoolFactory.ts`:

- **`filterForDomain`** (`:357-409`) — hard post-filter for single-domain sessions, called from
  `PipelineOrchestrator.run()` (`:214-270`, bypassed for master programs
  `['calisthenics_upper','upper_body','full_body']`). Re-evaluates each survivor strictly
  against its domain-specific `targetPrograms` level; excludes exercises whose domain-specific
  level is outside tolerance, or that have `targetPrograms` but none for this domain.
- **`findLevelAppropriateSubstitute`** (`:211-311`) — filters the *substitute-search candidate
  space* for guarantee/rescue injections (movement-group match, unused IDs, progressive ±2→±4→±6
  radius).
- **PoolRescue** (`:78-165`) — not a filter, a retry: if `single_domain` and result `<
  MIN_HEALTHY_POOL (6)`, re-runs `filterAndScore` with tolerance expanded to
  `EXPANDED_LEVEL_TOLERANCE = 5`.

### 7.4 `WorkoutGenerator.generateWorkout()` — in-brain filters

`logic/WorkoutGenerator.ts`, after `ContextualEngine` + `PoolFactory`:

| Site | Line(s) | Excludes |
|---|---|---|
| Active Recovery Guard | `:487-501` | Every non-cooldown/warmup/flexibility exercise, `isRecoveryDay===true` |
| Bolt-2 per-domain level ceiling | `:553-613` | Exercises above `domainLevel+1`, D2 only |
| Bolt-1 recovery window | `:615-699` | Exercises outside `[domainRef-3, domainRef-1]`, D1 only |
| SA hard block | `:1528-1551` | All straight-arm exercises (except handstand) once weekly SA cap met |
| MG-Diversity cap | `:712-804` | Multi-domain: max 1/movement-group (`STRICT_MG_MAX=1`); single-domain: exact-ID dedup only |
| Legs Cap | `:1060-1083` | Lowest-scored legs beyond 2, full-body sessions only |

### 7.5 `workout-selection.utils.ts` — selection-band and domain-quota filters

- **`selectExercisesForDifficulty`** (`:410-470`) — bolt-band `levelDiff` filter: D3→[0,+1],
  D2→[-1], D1→[-2], with relax-then-overflow fallback if too thin.
- **`selectExercisesWithDomainQuotas`** (`:522-814`) — primary domain pool filter, relaxed
  fallback, then a 3-step rescue against `context.globalExercisePool` (bypasses the already-
  scored pool): Step 1 strict exact level (`:642-647`), Step 2 progressive ±1/±2/±3 window,
  Step 3 broad muscle fallback. Also a domain-fill cap stop-condition (`:747-754`).
- **`selectExercisesWithDominance`** (`:820-953`) — partitions (not excludes) by P1/P2/P3, actual
  bound is `count`-slicing.

### 7.6 `GuaranteePassRunner.ts` — candidate-search filters for injections (run AFTER selection)

Runs after budgeting (`WorkoutGenerator.ts:1040`); can inject exercises that bypass the
difficulty-band filters above (injected level clamped to `domainLevel+6`, not re-checked).

- **Vertical Foundation Guarantee** (`:308-319`) — `foundationCandidates` filter: unused IDs,
  wrong movement group, non-foundation priority, outside ±6 of target level.
- **Full-Body Domain Guarantee** (`:458-469`) — victim-selection filter (never replaces sole
  domain representative or a foundation exercise).

Both search `context.globalExercisePool` directly — **GAP:** whether `globalExercisePool` was
itself passed through `ContextualEngine`'s gates before being attached to `context` was not
traced; worth confirming before assuming guarantee-injected exercises are injury/sweat/noise/
location-safe.

### 7.7 `BudgetDistributor.ts` — post-selection culling (volume-driven, not context-driven)

- **`_skillClusterCap`** (D3 only, `:412-503`) — excludes main exercises beyond
  `SKILL_CLUSTER_MAX_MAIN = 4`, lowest tier-rank first.
- **`_balancedClusterCap`** (D2 only, `:541-649`) — excludes beyond
  `BALANCED_CLUSTER_MAX_MAIN_BASELINE = 3` (4 if ≥3 domains or `availableTime≥45`).

### 7.8 `PresentationFormatter.enforceVolumeCap` — final duration-driven exclusion

Called from `home-workout.service.ts:767`, the last step of the trio loop, after warmup/cooldown.

- **Phase A** (`:451-489`) — iteratively removes the lowest-scored "expendable" exercise (core/
  anti-extension/anti-rotation, isolation/accessory, or extra legs beyond the first — pooled
  together, not tiered — see [§9.B3](#9-coreabs-exercises) for the docstring/code contradiction
  this produces) until `estimatedMin ≤ durationCap`.
- **Phase C** (`:518-548`) — ultra-short-budget convergence: drops the lowest-scored remaining
  main exercise, floored at `MIN_MAIN_EXERCISES = 2`.

### 7.9 `home-workout.service.ts` — adjacent-path filters (not the main cascade)

- **Desk Workout Constraint** (`:1074-1097`) — post-generation guard: if `workout.title`
  contains `'כיסא'`/`'שולחן'`, filters `workout.exercises` to desk/mobility/flexibility-tagged
  only (if ≥2 survive).
- **`generateRecoveryWorkout`** pool (`:233-237`), **`tryBuildRecoveryVideoTrio`** pool
  (`:493-507`), **`tabataPool`** (`:2362`) — three **separate side-pools** built directly from
  raw `allExercises`, bypassing the entire cascade above. Not part of the main strength
  selection — flagged so they aren't mistaken for it.

### Summary table (pipeline order, hard excludes only)

| Stage | File:Line | Excludes |
|---|---|---|
| 0 | `exercise.service.ts:76-86` | (fetch — no filter) |
| 1 | `InputSanitizerMiddleware.ts:400-414` | ±3-tolerance pre-filter |
| 2 | `ContextualEngine.ts:140-289` | 11 gates (program/level/skill/balance/injury/48h/field/location/sweat/noise) |
| 3 | `PoolFactory.ts:357-409` | Domain-specific tolerance, single-domain only |
| 4 | `WorkoutGenerator.ts:487-501` | Active recovery guard |
| 5 | `WorkoutGenerator.ts:553-699` | Bolt-2 ceiling / Bolt-1 window |
| 6 | `WorkoutGenerator.ts:1528-1551` | SA hard block |
| 7 | `WorkoutGenerator.ts:712-804` | MG-diversity cap |
| 8 | `WorkoutGenerator.ts:1060-1083` | Legs cap |
| 9 | `workout-selection.utils.ts:410-703` | Bolt-band + domain-quota + rescue |
| 10 | `GuaranteePassRunner.ts:308-319,458-469` | Injection candidate / victim filters |
| 11 | `BudgetDistributor.ts:429-503,541-649` | Skill/balanced cluster caps |
| 12 | `PresentationFormatter.ts:451-548` | Duration-cap removal |
| 13 | `home-workout.service.ts:1074-1097` | Desk-workout guard |

---

## 8. Level / Difficulty / Prerequisite Scales

Six genuinely different scales exist. They are **not** one unified number space, and only two
real derivation relationships exist in code — everything else that "looks related" either shares
only a UI widget, or has **no mapping code at all** (flagged as GAP).

### A. Per-Domain Program Level — the real engine-facing scale

The scale the exercise-selection engine actually filters/scores against.

- **Range:** open-ended int, starts 1 (`progression.service.ts:325`,
  `track.currentLevel += 1`); no universal ceiling for leaf programs (live seed data reaches L22
  for Pull and OAP, per `.cursoragents/XP_Progression_Truth.md` LAW 8). `Program.maxLevels?:
  number` is an optional per-program admin ceiling (`program.types.ts:43`).
- **Type:** `DomainTrackProgress` — `src/features/user/core/types/progression.types.ts`
  (`currentLevel`, `percent`); mirrored in legacy `DomainProgress` shape (`user.types.ts:45-50`).
- **Persisted:** `users/{uid}.progression.tracks.{programId}.currentLevel` (primary), dual-
  written to `progression.domains.{programId}.currentLevel` (legacy mirror —
  `resolveDataLevel`, `level-resolution.utils.ts:34-38`, reads `currentLevel ?? level` from
  either).
- **Primary writer:** `processWorkoutCompletion` → `progression.service.ts:2024-2027`. **Dead
  sibling:** `calculateSessionProgress` (`progression.service.ts:249-352`) — structurally similar
  writer to the same field, **zero callers anywhere in `src/`**.
- **Primary reader:** `buildUserProgramLevels(profile, masterProgramIds)` —
  `services/level-resolution.utils.ts:92-237` — builds `userProgramLevels: Map<domainId, level>`,
  the whole strength engine's level input. Called from `home-workout.service.ts:1495`,
  `build-home-user-context.ts:89`, `partial-completion.generator.ts:107`, and (hybrid)
  `hybrid-context.util.ts:56`.

### B. Master-Program Derived Level — not a separate scale, a formula on top of A

For `isMaster: true` programs (Full Body, Upper Body…), level is derived, never accrued
(`baseGain=0` per XP Truth LAW 3.1). `recalculateMasterLevel` (`progression.service.ts:683-753`)
computes `avg(push, pull, legs)` (core excluded), monotonic floor, capped at
`MASTER_LEVEL_CAP = 15` (independently redeclared in `level-resolution.utils.ts:21`), dual-writes
`tracks`/`domains` for the master program. `SKILL_GATE_MIN_LEVEL=15` (scale D) is the same
number space, not a coincidence.

### C. Difficulty "Bolts" — a session selector, NOT a level

- **Range:** closed `1|2|3` (Easy/Normal/Intense). `DifficultyLevel` —
  `workout-generator.types.ts:18`.
- **Persisted:** ephemeral, per-session param (`WorkoutGenerationContext.difficulty`) — not a
  Firestore field on the user profile.
- **Operates ON TOP of A:** `levelDiff = exerciseLevel(A) − domainUserLevel(A)`; the bolt selects
  which `levelDiff` band to target — D3: 0 to +1, D2: −1, D1: −2
  (`workout-selection.utils.ts:416-423`). Also drives session XP rate
  (`DIFFICULTY_MULTIPLIER`, `xp-rules.ts:12-16`, `{1:2.0, 2:3.5, 3:5.0}`).

### D. Skill Gates / Prerequisite Thresholds — constants in scale-A units

- `GATED_SKILL_DOMAINS = ['muscle_up']` (`ContextualEngine.ts:74`) — a domain allow/deny gate,
  not numeric.
- `SKILL_GATE_MIN_LEVEL = 15` (`ContextualEngine.ts:234`) — scale-A units.
- `BALANCE_GATE_THRESHOLD = 10` compares against `balanceScore` (1-15 "Handstand Triad" exercise
  metadata) — **GAP: no mapping found between `balanceScore` and scale A**; it's an intrinsic
  exercise-difficulty attribute, compared only to its own fixed threshold.

### E. Hybrid Engine — no independent scale, reuses A directly

`hybrid/hybrid-context.util.ts:1-82` (`resolveHybridUserLevels`) calls the exact same
`buildUserProgramLevels`/`getBaseUserLevel` as the strength engine (comment: *"Extend here, never
duplicate"*). No hybrid-specific level field/type/Firestore path exists anywhere under
`hybrid/`. Hybrid's aerobic side uses running's pace-zone system (F) unmodified — no fusion.

### F. Running — Pace Zones (NOT a level scale)

No level/skill scale exists for running:
- `RunZoneType` — 11-value pace-band enum (`running.types.ts:56-67`), a seconds/km band per
  zone, not a level.
- `RunnerProfileType` — closed `1|2|3|4` **archetype classification** (fast improver / slow
  improver / beginner / maintenance), used to select which `PaceMapConfig` table governs pace
  math — does not increment, not a progression level.
- `RunningProfile.level?: number` (`running.types.ts:319`) — **GAP: dead field**, zero
  reads/writes anywhere outside the declaration.
- `intensityRank` on `RunWorkoutTemplate` — an admin-authored content ordinal (analogous to
  scale D's `balanceScore`), not a user level.

**GAP: no mapping code found between running (F) and scale A, or between F and G.** Fully
independent number spaces.

### G. Global XP Level (`progression.globalLevel`) — RPG layer, independent of A

- **Range:** `1-10` in all live code (`GLOBAL_LEVEL_THRESHOLDS`, `xp-rules.ts:52-63`; `LEVEL_STAGES`,
  `lemur-stages.ts:23-34`; `DashboardTab.tsx:92` `isMaxLevel = globalLevel >= 10`). The true live
  values are admin-managed in the Firestore `levels` collection per `xp.service.ts`'s comment,
  but the code-level range is 1-10.
  **Discrepancy:** `user.types.ts:82` comments `globalLevel: number; // שלב 1-50` — this does not
  match any live threshold table, config, or UI cap found (all stop at 10). Flagged as a stale
  comment, not a real range.
- **Persisted:** `users/{uid}.progression.globalLevel`/`globalXP` — server-owned,
  `noGameIntegrityFieldsChanged()`-guarded (axioms.md §2).
- **Sole authorized writer:** `computeGlobalLevel(totalXP)` —
  `functions/src/services/progression.service.ts:106-112`, called from `applyAward` and
  `functions/src/reverseWorkoutXP.ts:153`.
- **Relationship to A: GAP — no mapping code found.** `globalLevel` derives exclusively from
  lifetime XP across all workout types, and is never read by/written from/compared against any
  `progression.tracks[domain].currentLevel`. The only interaction: `globalLevel` is a
  **last-resort fallback** substituted when scale A is entirely absent for an exercise
  (`workout-selection.utils.ts:301,377`, itself fed from `profile.progression?.globalLevel ?? 1`
  at `build-home-user-context.ts:187`) — wiring, not a derivation.

### H. Route/Park Difficulty — different domain, mentioned to prevent confusion

`Route.difficulty: 'easy'|'medium'|'hard'` (`route.types.ts:167,374`; numeric
`difficultyLevel?: 1|2|3` variant on `map.types.ts:29,42`) is a **park/route content rating**,
unrelated to any workout progression scale. It shares only a UI widget
(`DifficultyBolts.tsx`, `STRING_TO_NUMERIC` map at `:31-35`) with scale C, for visual rendering
only — not a data-model unification. `src/lib/difficulty-display.ts` is the shared display-only
color/label lookup.

### 8.2 Comparison table

| Scale | Range | Storage | Used by | Mapped to |
|---|---|---|---|---|
| **A. Per-domain level** | Open int, starts 1, no universal cap | `progression.tracks.{id}.currentLevel` + `.domains` mirror | Strength engine; Hybrid (direct reuse) | B is a derived aggregate of A. No mapping to G (fallback substitution only) or F (none). |
| **B. Master-program level** | Same units as A, capped 15 | Same fields as A | Master-program display, split-suggestion logic | Formula-derived from A |
| **C. Difficulty bolts** | Closed `1\|2\|3` | Ephemeral session param | Selection-band modifier; XP-rate multiplier | Operates on top of A via `levelDiff` band |
| **D. Skill gate thresholds** | Domain allow-list + fixed `15` | Hardcoded constants | Session-level exercise gating | Expressed in scale-A units. `balanceScore` (1-15): GAP, no mapping to A |
| **E. Hybrid level** | *(none — reuses A)* | *(none)* | Hybrid park/route strength stations | Identical to A, direct code reuse |
| **F. Running pace/archetype** | 11-zone pace bands; closed `1-4` archetype; dead `level?:number` field | `paceProfile.profileType` | Running plan generation | **GAP: no mapping to A or G anywhere** |
| **G. Global XP level** | Closed `1-10` (all live paths; a `1-50` type comment is stale) | `progression.globalLevel`/`globalXP`, server-owned | RPG/gamification UI; fallback-only input to strength engine | Derived from `globalXP` only. **GAP: no derivation relationship with A** — fallback substitution when A is absent |
| **H. Route/park difficulty** *(out of scope)* | `'easy'\|'medium'\|'hard'` or `1\|2\|3` | Route/curated_route docs | Park/route content rating | Shares only a UI widget with C |

### 8.3 Direct answer

**Multiple, genuinely different scales — not one unified number space:**
1. **A** is the one true "skill level" the engine filters/scores against — open-ended, per-domain,
   the only scale both Strength and Hybrid consume (Hybrid via direct code reuse).
2. **B** is a display/derivation formula on top of A (capped 15), not independent.
3. **C** (bolts) is a per-session selection modifier — an offset band on A, never stored.
4. **D** (skill gates) are constants expressed in A's units; `balanceScore` inside the same
   engine has no mapping to A at all (GAP).
5. **F** (running) is entirely disjoint — zero mapping code to A or G anywhere.
6. **G** (globalLevel) is a separate RPG number derived solely from lifetime XP — no derivation
   relationship with A; only a last-resort fallback substitution.
7. **H** (route difficulty) is a different domain (content rating, not user progression), sharing
   only a UI widget with C.

---

## 9. Core/Abs Exercises

### Part A — Storage & Fields

Core/abs exercises are **not** a separate collection or type — ordinary `Exercise` documents in
`'exercises'` (§4), distinguished purely by field values, via **three overlapping vocabularies**:

| Field | Core-marking value(s) |
|---|---|
| `primaryMuscle` | `'core'`, `'abs'`, `'obliques'` |
| `movementGroup` | `'core'` |
| `programIds` / `targetPrograms[].programId` | `'core'` |

**No single canonical field.** The most authoritative resolver,
`exerciseMatchesProgram(exercise, 'core')` (`services/shadow-level.utils.ts:213-227`), does a
quadruple fallback:

```ts
// shadow-level.utils.ts:213-227
if (programKey === 'core') {
  if (exercise.movementGroup === 'core') return true;
  if (exercise.primaryMuscle && ['abs','core','obliques'].includes(exercise.primaryMuscle)) return true;
  if (exercise.programIds?.includes('core')) return true;
  if (exercise.targetPrograms?.some(tp => tp.programId === 'core' || resolveToSlug(tp.programId) === 'core')) return true;
  const combined = `${nameStr} ${tagsStr}`.toLowerCase();
  if (['core','plank','abs','בטן','פלאנק'].some(s => combined.includes(s))) return true;
  return false;
}
```

`movementGroup==='core'` OR `primaryMuscle ∈ {abs,core,obliques}` OR `programIds` contains
`'core'` OR a `targetPrograms` slug resolves to `'core'` OR (last resort) a **string match** on
name/tags for `core`/`plank`/`abs`/Hebrew `בטן`/`פלאנק`.

**Drift — at least 5 partial-duplicate detectors exist, not one chokepoint:**
- `workout-budgeting.utils.ts:430-434` (`MUSCLE_TO_DOMAIN`) — `primaryMuscle`-only, no
  `movementGroup` check
- `compose-hybrid-session.service.ts:54` — same 3-key map, independently redefined for hybrid
- `workout-sorting.utils.ts` — delegates to the full `exerciseMatchesProgram` chain (correct)
- `trio-modifiers.service.ts:243-246` — `mg==='core' || pm==='core' || pm==='abs'` —
  **omits `'obliques'`**, unlike the canonical resolver
- `workout-budgeting.utils.ts:404-407` (`calculateHoldTimeTier`) — `primaryMuscle` + name-string
  check only, no `movementGroup`/`'obliques'`

### Core-specific behavior different from other exercises

**Hold-time** — `workout-budgeting.utils.ts:390-420` (`calculateHoldTimeTier`):

```ts
// :398-419
const isHandstand = tags.includes('handstand') || name.includes('handstand') || name.includes('עמידת ידיים');
const isCorePlank = name.includes('plank') || name.includes('פלאנק')
  || exercise.primaryMuscle === 'core' || exercise.primaryMuscle === 'abs';
let holdTime = tier.hold.min + Math.floor(Math.random() * (tier.hold.max - tier.hold.min + 1));
if (isHandstand) { holdTime = Math.min(holdTime, ISOMETRIC_GUARDRAILS.handstandMaxHold); }
else if (isCorePlank) { /* follow tier range — no cap */ }
else if (exercise.mechanicalType === 'straight_arm') { holdTime = Math.min(holdTime, ISOMETRIC_GUARDRAILS.straightArmMaxHold); }
```

Core/plank holds are the **only** isometric category with no extra guardrail cap beyond the
normal tier range — handstands and straight-arm skills both get clamped, core does not.

**Rest table** — no core-specific entry in `RestCalculator.ts` (which is itself dead code, see
[§3](#3-full-flow-chain)). Rest derives from `ExerciseCategory`
(`skill|strength|hypertrophy|endurance|static_hold|mobility|follow_along`), not muscle group — a
core plank falls into `static_hold` the same as a handstand hold. **GAP: no core-specific
rest-time rule found.**

**Rep ranges** — no core-specific numeric rep-range constant exists in the *live* pipeline. A
`{min:30,max:60}` core-accessory value appears only in the dead `blueprint.types.ts` slot data —
not live.

**Warmup-floor exemption** — `trio-modifiers.service.ts:83-93`: `MG_TO_WARMUP_PATTERN` maps only
`vertical_pull/horizontal_pull→pull`, `vertical_push/horizontal_push→push`,
`squat/hinge/lunge→legs`. `'core'` is absent — push/pull/legs each get a guaranteed
pattern-specific warmup item when represented; core never does.

### Part B — Placement Rules

#### B.1 Live pipeline: core is an optional accessory slot, added last

Live blueprint (`core/pipeline/pipeline.types.ts`, built by `StructureDirector.ts`). Full-body
strategy (`StructureDirector.ts:143-206`):

```ts
// StructureDirector.ts:138,196-203
const activeCore = domains.includes('core');
...
if (activeCore) {
  blocks.push({ id: `main_${idx++}_core`, role: 'main', domain: 'core', isAccessorySlot: true });
}
```

Runs **after** pull, push, legs blocks; core is `isAccessorySlot: true` — same flag as the
"secondary legs" slot, no other slot gets it. Its presence is gated purely on
`domains.includes('core')` (§B.6) — **not** on any duration/`availableTime` check inside
`StructureDirector`.

Single-domain "core day" falls to the generic fallback branch (`:287-291`) — 3 slots (primary/
secondary/accessory), with no named `movementGroup` sub-pattern the way push/pull/legs get
(`vertical_pull` vs `horizontal_pull`).

#### B.2 `GuaranteePassRunner`: core is explicitly excluded from the domain-completeness guarantee

```ts
// GuaranteePassRunner.ts:56-64
const DOMAIN_MG_CANDIDATES: Record<string, string[]> = {
  push: ['vertical_push','horizontal_push'], pull: ['vertical_pull','horizontal_pull'], legs: ['squat','hinge','lunge'],
};
const PRIMARY_DOMAINS = new Set(['push', 'pull', 'legs']);
```

The Full-Body Domain Guarantee ("at least 1 exercise from each primary domain") is scoped to
exactly push/pull/legs. If a full-body session ends with zero core exercises, **no guarantee
pass rescues it** — consistent with core being accessory/optional per B.1.

#### B.3 `enforceVolumeCap` trim order — docstring and code disagree

```ts
// PresentationFormatter.ts:399
const CORE_MGS = new Set(['core', 'anti_extension', 'anti_rotation']);
```

Docstring (`:426-434`) claims strict tiered removal: 1. Core, 2. Isolation/accessory, 3. Extra
legs. **The actual implementation does not enforce that ordering:**

```ts
// PresentationFormatter.ts:452-467
const isExpendable = (ex: WorkoutExercise): boolean => {
  if (ex.exerciseRole !== 'main' || ex.protocolBlock) return false;
  const mg = ex.exercise.movementGroup ?? '';
  if (CORE_MGS.has(mg)) return true;                      // comment: "core removed first"
  if (ex.priority === 'isolation' || ex.priority === 'accessory') return true;
  const legsCount = workout.exercises.filter(e => e.exerciseRole==='main' && LEGS_MGS.has(e.exercise.movementGroup??'')).length;
  if (LEGS_MGS.has(mg) && legsCount > 1) return true;
  return false;
};
while (estimatedMin > config.durationCap && guardIterations < maxIterations) {
  const removeCandidate = workout.exercises.filter(isExpendable).sort((a,b) => a.score - b.score)[0]; // lowest score, ANY category
  ...
}
```

**Contradiction, flagged explicitly:** the code comment and docstring both assert core is removed
before isolation/accessory and extra-legs. The real logic pools all three expendability classes
together and removes whichever single exercise has the **lowest `score`**, regardless of
category — a high-scoring core exercise can survive longer than a low-scoring isolation
exercise, in direct contradiction of the stated rule. This is the closest thing to a
duration-dependent core-inclusion rule in the codebase, and it is score-driven, not
category-driven, despite the comments.

#### B.4 `Fragmenter.ts` — confirmed dead code

`logic/Fragmenter.ts` implements the Truth doc's LAW 11.1 Part A/B office-split, importing from
the legacy `core/types/blueprint.types.ts`:

```ts
// Fragmenter.ts:87-97
const PART_A_SLOT_TYPES = ['warmup', 'cooldown', 'accessory'];
const PART_A_MOVEMENT_PATTERNS = [
  'core_anti_extension', 'core_anti_rotation', 'core_flexion',
  'mobility_upper', 'mobility_lower', 'handstand_balance',
];
```

**Verified dead:** `grep -rn "new Fragmenter(\|createFragmenter(\|\.analyze("` across `src/`
returns zero call sites outside `Fragmenter.ts` itself, its own barrel re-export
(`logic/index.ts:13-18`, never imported downstream), a listing comment
(`workout-engine/index.ts:11`), and two historical-reference comments in
`src/features/home/utils/setsToMinutes.ts` citing `Fragmenter.ts:240` as the *origin* of a
constant, not a live call. **This entire routing rule does not execute in the live product** —
see the top-of-document staleness table.

#### B.5 `classifyPriority` has no core branch; a different function owns core's ordering

`classifyPriority` (`logic/workout-selection.utils.ts:233-241`) has no core-specific branch — an
untagged core exercise falls to the default `'accessory'` classification like any other. The
actual core-specific rule is **ordering**, in `workout-sorting.utils.ts`'s
`applyPhysiologicalSort` (`:34-70`):

```ts
/**
 * 5-tier physiological priority (lower = earlier):
 *   0 = Vertical Compounds   1 = Horizontal Compounds   2 = Legs
 *   3 = Isolation/Accessory  4 = Core/Abs (must be last to preserve stabilizer availability)
 */
const getDomainPriority = (ex: WorkoutExercise): number => {
  if (exerciseMatchesProgram(ex.exercise, 'core')) return 4;   // always last
  if (exerciseMatchesProgram(ex.exercise, 'legs')) return options?.femaleFullBody ? 0 : 2;
  ...
};
```

Core is placed in the strictly-last ordering tier (after even generic isolation/accessory) in
final in-workout order — a **hard, unconditional rule, no duration gate.** This is the one
unambiguous core placement rule found.

#### B.6 How `'core'` enters `requiredDomains` at all — assessment-gated, not duration-gated

`services/program-hierarchy.utils.ts:243-262` (`resolveChildDomainsForParent`):

```ts
// :221,243-262
export const FULL_BODY_CHILD_DOMAINS = ['push', 'pull', 'legs', 'core'] as const;
// A static-master's child domains are intersected with domains the user has ACTUALLY assessed
// (a real level > 0 in domains OR tracks). Unassessed children are dropped.
const isAssessed = (dom: string): boolean => isDomainAssessed(profile, dom);
if (activeProgramSlug === 'full_body' || activeProgramId === 'full_body') {
  return FULL_BODY_CHILD_DOMAINS.filter(isAssessed);
}
```

`core` is a candidate domain by default for full-body master programs, but filtered out entirely
if the user has no assessed core level. **This is a real, live gate — assessment-based, not
duration-based.**

**GAP: no duration/`availableTime`-based inclusion or exclusion rule for core was found**
anywhere in the live pipeline (`StructureDirector`, `GuaranteePassRunner`, `PoolFactory`,
`BudgetDistributor`). Core's presence is gated by (a) domain assessment (B.6) and (b)
score-ranking once a slot exists (B.1) — never by `availableTime` directly.

#### B.7 Two post-workout suggestion generators special-case core (outside the main pipeline)

**`complementary-short.generator.ts`** hardcodes `requiredDomains: ['core']` at a fixed 12-minute
duration (`SHORT_DURATION_MIN=12`, `:24-37`), eligible only on `context.stepsRemaining > 0` — a
deliberate simplification, per the file's own comment, rather than a domain-neglect signal.

**`partial-completion.generator.ts`** is the domain-aware sibling — compares real per-domain
gaps and ranks core last on ties: `DOMAIN_ORDER = ['push','pull','legs','core']` (`:75`), *"per
David's explicit instruction, not a data-driven priority"* (`:26-27`).

#### B.8 "Intense" trio option caps core at exactly 1, excludes it from the push/pull/legs quota

`trio-modifiers.service.ts` (`applyIntenseOption`):

```ts
// :217-218, 243-249, 253-257, 316-318
const MAX_MAIN = 5; const MAX_CORE = 1;
const isCore = (ex) => { const mg=ex.exercise.movementGroup, pm=ex.exercise.primaryMuscle; return mg==='core'||pm==='core'||pm==='abs'; }; // omits 'obliques' — drift vs A.2
const REQUIRED_DOMAINS_INTENSE = ['push', 'pull', 'legs'] as const;
// guarantee runs against nonCorePool only; core appended and capped separately:
const keptMain = [...intenseSelected, ...corePool.slice(0, MAX_CORE)];
```

The push/pull/legs domain-quota guarantee for the Intense option runs entirely against
`nonCorePool` — core is deliberately excluded from that quota, then appended on top and capped
at 1 (highest-scored candidate).

#### B.9 Split-decision service groups core with legs as a "lower body" proxy

`services/split-decision/SplitDecisionService.ts:348-373`:

```ts
const LOWER_DOMAINS = new Set(['legs', 'core']);
if (LOWER_DOMAINS.has(domain) && isUpperSession) {
  // upgrade session to full_body_high to catch up on the deficit
}
```

If a user on an upper-only session type has a real deficit in **either** legs or core, the
session upgrades to `full_body_high` — core is treated as interchangeable with legs for this
trigger, not its own category.

### Summary

1. **Storage:** same `exercises` collection, marked via `primaryMuscle ∈ {core,abs,obliques}`
   and/or `movementGroup==='core'` and/or `programIds`/`targetPrograms` — no single canonical
   field, ≥5 independent partial-duplicate detectors with visible drift.
2. **Domain inclusion:** gated by assessment, not duration (B.6). **GAP: no duration-threshold
   gate for core found.**
3. **Slot topology (live):** core is its own domain slot, `isAccessorySlot: true`, added last
   after pull/push/legs — but **not** part of the domain-completeness guarantee (B.2).
4. **Final ordering:** hard rule, always last (tier 4 of 5), via `applyPhysiologicalSort` (B.5) —
   the one unconditional, unambiguous placement rule.
5. **Time-trimming:** docstring claims core is removed first; **code contradicts this** and
   removes by lowest score across a pooled core+isolation+extra-legs set (B.3).
6. **Legacy `Fragmenter.ts` office/home split** citing `core_*` routing — confirmed dead (B.4).
7. **Two post-workout suggestion generators** special-case core outside the main pipeline (B.7).
8. **"Intense" trio variant** caps core at exactly 1, excludes it from its own domain quota (B.8).
9. Core is a "lower body" proxy alongside legs for one session-upgrade trigger (B.9), and exempt
   from the warmup-floor guarantee push/pull/legs get (A.3 above).

---

## 10. Live Workout Logic & Relationship to the Generator

### 10.1 Where the live player lives (legacy-sibling check performed)

Single component: `src/features/workout-engine/players/strength/StrengthRunner.tsx` (655 lines).
Self-description (`:1-30`): *"Spotify-style decoupled live workout player"* — layered
architecture (Base: `WorkoutPlaylist`; Top: active workout, draggable to `MiniPlayerBar`); state
machine routes `PREPARING → PreparingStateView`, `ACTIVE → ActiveExerciseView`,
`INPUT → InputStateView`, `RESTING → RestingStateView`.

**Legacy-sibling check** (per CLAUDE.md's own warning not to trust a filename): searched for any
other `*Runner*`/`*WorkoutPlayer*`/`*ActiveWorkout*`/`*LiveWorkout*` component. All candidates
found belong to the **running** domain, not strength (`ActiveWorkoutLayer.tsx`,
`ActiveWorkoutOverlay.tsx`, `FreeRunActive.tsx`/`PlannedRunActive.tsx` — the latter two explicitly
comment "mirrors StrengthRunner exactly", confirming StrengthRunner as the canonical pattern they
copy, not a peer duplicate). `active-workout-ui/page.tsx` builds a hardcoded `mockPlan` and does
**not** mount `StrengthRunner` — a component-showcase page, not a live duplicate. No `.old`/
`.bak`/`.v1`/`legacy`/`deprecated`-named files exist under `workout-engine/`. `players/strength/
index.ts:6` exports exactly one `// Main Runner` — `StrengthRunner`.

**Confirmed live mount points:**
1. `src/app/workouts/[id]/active/page.tsx:1657` — the standalone `/workouts/[id]/active` route.
2. `hybrid/HybridStationLayer.tsx:39` — full-screen for the strength "station" leg of a hybrid
   session (comment `:9`: *"one-card law §9"*, obeying axioms.md §9).

**Conclusion:** no ambiguity, unlike the running domain (which does have a real legacy-naming
risk — `FreeRunActive` vs `FreeRunLayer`, called out by name in CLAUDE.md). Strength has a single
implementation, two legitimate mount sites (standalone + hybrid-embedded, differentiated by the
`embedded` prop).

```ts
// StrengthRunner.tsx:64-79
interface StrengthRunnerProps {
  workout: WorkoutPlan;
  onComplete?: (exerciseLog?: ExerciseResultLog[]) => void;
  onPause?: () => void; onResume?: () => void;
  onSwapExercise?: (exerciseId: string, segmentIndex: number, exerciseIndex: number) => void;
  exerciseHistoryMap?: Record<string, number[]>;
  embedded?: boolean;
  initialCheckpoint?: InitialWorkoutCheckpoint;
}
```

### 10.2 How the generator's plan is handed off

`GeneratedWorkout` (flat `exercises: WorkoutExercise[]`, §5) is **not** consumed directly —
`StrengthRunner` only accepts the older, segment-based `WorkoutPlan` (§5's route.types.ts shape).
A mandatory mapping step exists, and — a documented, currently-existing duplication, not
speculative — there are **two parallel implementations**:

**(A) `logic/buildRunnerWorkoutPlanFromGenerated.ts`** (308 lines) — pure function
`buildRunnerWorkoutPlanFromGenerated(gw, opts): WorkoutPlan` (`:48`), no React/Firebase/
sessionStorage. Called from `useWorkoutSession.ts:85` — the **CustomBuilder/WorkoutPreviewDrawer
"Start"** hand-off. Its own doc comment explains why it exists: the custom-builder flow had no
conversion at its start hand-off, so tapping "start" fell through to a **stale**
`active_workout_data` snapshot and ran a different workout than the one the builder/preview
showed — this module is a faithful extraction of the home path's existing inline mapping.

**(B) `services/workout-plan.mapper.ts`** (322 lines) — `buildWorkoutPlanFromGenerated(gw,
workoutId, location?)`. Doc comment claims *"both the home flow and the drawer hand-off build the
plan from the SAME mapper"* — **but `src/app/home/page.tsx` does not actually call this exported
function.** It still contains its own inline near-duplicate mapping (`home/page.tsx:1975-1998`),
writing straight to `sessionStorage`. This is acknowledged in mapper (A)'s own `NOTE` comment as
unconsolidated technical debt, not something newly discovered here.

**Hand-off mechanism:** `sessionStorage`, read with a 3-tier priority in
`active/page.tsx:745-849`:
1. `active_workout_data` — written by `home/page.tsx:2000` at generation time
2. `currentWorkoutPlan`/`currentWorkoutPlanId` — written by `useWorkoutSession.ts:94-95` (via
   mapper A)
3. Firestore fetch as last resort (`fetchWorkoutFromFirestore`)

```
WorkoutGenerator.ts (GeneratedWorkout, pure)
  → buildRunnerWorkoutPlanFromGenerated.ts (builder flow)  OR  home/page.tsx inline copy (dashboard flow)
  → WorkoutPlan (segment-based)
  → sessionStorage['active_workout_data' | 'currentWorkoutPlan']
  → active/page.tsx useState(workoutPlan)
  → <StrengthRunner workout={workoutPlan}>
  → useWorkoutStateMachine(workout, ...)
```

For hybrid specifically, a **third** mapper, `hybrid/strength-block-to-plan.ts`, wraps a hybrid
strength *block* as a `WorkoutPlan` — passed via `HybridStationLayer.tsx:39` in-memory, no
sessionStorage round-trip (generation and the hybrid station live in the same orchestrator).

### 10.3 State management

Two distinct, non-overlapping layers:

**(a) `core/store/useSessionStore.ts`** (Zustand) — *"Unified Session Store... shared session
state across all workout modes (running, strength, hybrid)"*. Holds only mode-agnostic fields:
`mode`, `status`, `totalDuration`, `totalCalories`, `totalDistance`, timestamps,
`isRecoveryVideoSession`. `StrengthRunner` does not touch it directly — `active/page.tsx`
registers/ticks it at the page level (`:569,589`).

**(b) `players/strength/hooks/useWorkoutStateMachine.ts`** (1088 lines) — the actual per-exercise/
per-set runtime state, confirmed plain `useState`, **not** a store:
```ts
// :229-264
const [workoutState, setWorkoutState] = useState<WorkoutState>(initialCheckpoint?.workoutState ?? 'PREPARING');
const [currentSegmentIndex, setCurrentSegmentIndex] = useState(...);
const [currentExerciseIndex, setCurrentExerciseIndex] = useState(...);
// ...isPaused, completedReps, videoProgress, isLogDrawerOpen, currentSetIndex, currentSide, pendingSideData
```
`WorkoutState = 'PREPARING'|'ACTIVE'|'INPUT'|'RESTING'|'PAUSED'` drives which view
`StrengthRunner` renders.

Sub-hooks (each one job): `useWorkoutTimers` (elapsed/prep-countdown/rest-left clocks, local
state), `usePyramidManager` (pure computation, no state — reads `pyramidSequence[currentSetIndex]`),
`useExerciseLog` (log ref + `logVersion` counter → `ExerciseResultLog[]` for `onComplete`),
`useSupersetPredicates`, `useExerciseDerivedValues`. Peripheral hooks composed directly in
`StrengthRunner.tsx`: `usePlayerMedia`, `usePlayerDrag`, `useInputPickerState`,
`usePlayerLifecycle`, `usePlayerMediaSession`.

**Conclusion:** per-set/per-exercise runtime state is component-local React state, not Zustand —
consistent with axioms.md §7 (Zustand-only for *stores*; local component state for ephemeral UI
runtime is not a store).

### 10.4 Protocol "advance" logic — plan-driven vs. player-re-derived (hybrid, by design)

Entry: `computeAdvanceDecision()` (`protocols/compute-advance.ts:22-47`), called from
`useWorkoutStateMachine.ts:9`.

**Tier 1 — block-scoped (tabata today; emom/amrap reserved): explicit plan field wins.**
```ts
// compute-advance.ts:30-36
const blockStrategy = resolveBlockStrategy(segments[currentSegmentIndex]);
if (blockStrategy) return blockStrategy(ctx);
```
`resolveBlockProtocol()` (`protocols/block-protocol.ts:16-31`) reads `segment.protocol`
**directly off the plan** — set by the generator/mapper (`partitionByTabataBlock`, invoked in
both mappers). The plan is the single source of truth for dispatch; the player never infers
"this looks like tabata."

**Tier 2 — exercise-scoped (straight/superset/pyramid): player re-derives from markers, by
explicit design.**
```ts
// advance-registry.ts:30-40
/** Legacy derivation — mirrors what the monolith checked inline:
 * pairedWith → superset; pyramidSequence → pyramid; else straight.
 * Old plans in sessionStorage carry no protocol field, so this stays the fallback forever. */
export function resolveExerciseProtocol(ex) {
  if (ex?.pairedWith) return 'superset';
  if (ex?.pyramidSequence) return 'pyramid';
  return 'straight';
}
```
A segment-level `inferSegmentProtocol()` exists but its own doc comment forbids feeding it into
dispatch for mixed segments — *"METADATA ONLY... never feed this into the advance dispatch"*
(`advance-registry.ts:63-66`).

- `straight.advance.ts` — default: same exercise while sets remain → next exercise → segment
  chain.
- `superset.advance.ts` — reads `pairedWith` to find the partner; A→B same round, B→A increments
  round, rounds equalized to `max(A.sets, B.sets)`.
- `pyramid.advance.ts` — **intentional re-export**, not separate logic:
  `export { straightAdvance as pyramidAdvance }` — pyramid is "an ORDER protocol, not a clock
  protocol"; per-step reps/hold come from `resolveSetTarget`, but the advance decision is
  identical to straight sets.
- `tabata.advance.ts` — block-scoped: round-robins the segment's exercises, one work interval
  each, until `config.rounds` complete; the clock itself lives in the state machine, not here.

**Answer:** both, split by protocol class. Tabata (and future emom/amrap) dispatches off an
explicit `segment.protocol` field the generator/mapper writes. Straight/superset/pyramid dispatch
by the player re-deriving the protocol from `pairedWith`/`pyramidSequence` markers the generator
also writes — the player infers the *classification* rather than reading an enum, deliberately,
for backward compatibility with old sessionStorage plans that carry no `protocol` field. All
advance heads are pure functions (`compute-advance.ts:5`: *"no React, no refs, no timers"*).

### 10.5 Generator purity check (LAW 0) — re-verified against current code

`logic/WorkoutGenerator.ts` (1732 lines) — full import list grepped for React/Firebase/hooks:
zero matches for `react|Firebase|firebase|useState|useEffect|firestore`. Every import is a
type/util from within `workout-engine`, a content-domain type, or `CONTEXT_AWARE_SELECTION_ENABLED`
(a plain boolean constant from `@/config/feature-flags`, not a hook). **LAW 0 holds in current
code**, not just as an aspirational claim.

### 10.6 Completed-session write-back (decoupling evidence)

`StrengthRunner.tsx` itself contains **zero Firebase/Firestore imports**. All persistence happens
at the page level or in dedicated services:

1. State machine calls `onComplete?.(exerciseLog)` (`StrengthRunner.tsx:66`).
2. `active/page.tsx:965` `handleComplete` — computes stats, transitions `flowState` to
   `'dopamine'`; **no Firestore write** in the normal path.
3. Actual writes happen later: either the `RECOVERY_VIDEO_SKIP_SUMMARY_ENABLED` shortcut
   (`:1054-1101`, calls `runActivitySync` + local `saveWorkoutToHistory`), or normally from
   `handleSummaryFinish` (`:1338`) → `processWorkoutCompletion(...)` (`:1223`, program-progression
   %) and `saveExerciseHistory(uid, exerciseResults)` (`:1234`, from
   `services/exercise-history.service.ts`).
4. `exercise-history.service.ts:6-15` doc block confirms the dual-write model and names
   `StrengthRunner` as a **reader**, not writer: Write 1 = `exerciseHistory/{exerciseId}`
   (overwritten each session, pre-fills next workout's default reps), Write 2 = time-series
   `exerciseHistory/{exerciseId}/sessions/{auto-id}`.
5. XP/progression itself: per axioms.md §2, `progression.coins`/`globalLevel`/`globalXP` are
   server-owned, writable only via the `awardWorkoutXP` Callable — not independently re-traced in
   this pass, cited as background.

**Conclusion:** live-player writes are fully decoupled from generation. The generator never runs
again once the plan is built; all persistence happens in page-level orchestration calling
dedicated service modules — neither the generator nor `StrengthRunner` writes to Firestore
directly anywhere in this path.

---

## Gaps and Open Questions

Everything below could not be resolved from the code with confidence, or reveals a real
inconsistency in the live code itself. Nothing here was guessed or invented.

1. **§3 — internal steps not read line-by-line.** `BudgetDistributor.distribute()`
   (`core/pipeline/BudgetDistributor.ts:107`), `runAllGuarantees()`
   (`core/pipeline/GuaranteePassRunner.ts:543`), and `selectExercises()`
   (`WorkoutGenerator.ts:1506`, the selection router) were confirmed to exist and be called in
   the order documented, but their full internal sub-steps were not read line-by-line — only
   call sites and inline-comment summaries. Read those files directly for exhaustive internals.
2. **§6 — brand-aware chip never reaches the primary screen.** `selectExecutionMethodWithBrand`
   (path B) is fully built and does real park-brand matching, but only fires from the swap-
   exercise modal. Confirm with David whether brand-qualified chip text (e.g. "Kompan pull-up
   bar") is *intended* to ever appear on the primary (non-swap) workout screen — as traced, it
   currently cannot.
3. **§7 — `GuaranteePassRunner`'s injection-candidate search queries `context.globalExercisePool`
   directly**, not the `ContextualEngine`-filtered pool. Whether `globalExercisePool` was itself
   ever passed through `ContextualEngine`'s injury/sweat/noise/field/location gates before being
   attached to `context` was not traced (lives in `home-workout.service.ts`'s context-
   construction code) — worth confirming before assuming guarantee-injected exercises are safe.
4. **§7 — `isWithinBolt1Window`** (used at `WorkoutGenerator.ts:664/670/677/681`) is defined in
   `shared/constants/domain-mapping.constants.ts`; its exact predicate body was not re-verified
   line-by-line, only its call sites.
5. **§8 — no mapping code found between `balanceScore` (1-15 exercise metadata) and scale A**
   (per-domain program level) — compared only to its own fixed threshold (`10`).
6. **§8 — no mapping code found between running (scale F) and either scale A or scale G.** Fully
   independent number spaces; `RunningProfile.level?: number` is a dead, unwired field.
7. **§8 — no derivation relationship found between global XP level (G) and per-domain program
   level (A).** The only interaction is a last-resort fallback substitution when A is entirely
   absent for an exercise — not a mapping. The two numbers can diverge arbitrarily.
8. **§8 — stale type comment:** `user.types.ts:82` comments `globalLevel: number; // שלב 1-50`;
   no live threshold table, config, or UI cap exceeds 10. The comment appears to be inaccurate,
   not a real 1-50 range.
9. **§8 — dead code:** `calculateSessionProgress` (`progression.service.ts:249-352`) is a
   structurally-similar sibling to the live level-up writer `processWorkoutCompletion`, but has
   zero callers anywhere in `src/`.
10. **§9 — no duration/`availableTime`-based inclusion or exclusion rule for core was found**
    anywhere in the live pipeline. Core's presence is gated by domain assessment and score-
    ranking only, never by requested workout length directly.
11. **§9 — `enforceVolumeCap`'s docstring and code disagree** on trim priority: the docstring
    claims a strict core → isolation → legs removal order; the actual code pools all three
    classes and removes by lowest `score` regardless of category. This is a genuine
    comment/code mismatch in the live file, not a documentation gap about the map.
12. **§9 — at least 5 independent, partially-drifted "is this exercise core" detector functions**
    exist across the codebase (`shadow-level.utils.ts`, `workout-budgeting.utils.ts` ×2,
    `compose-hybrid-session.service.ts`, `trio-modifiers.service.ts`) — some include
    `'obliques'`, some don't; some check `movementGroup`, some don't. No single chokepoint.
13. **§10 — two parallel `GeneratedWorkout → WorkoutPlan` mappers exist**
    (`buildRunnerWorkoutPlanFromGenerated.ts` for the builder path vs. an inline, unconsolidated
    copy in `home/page.tsx` for the dashboard path, plus a third, apparently-intended-to-be-
    shared-but-actually-unused `workout-plan.mapper.ts`). This is acknowledged in the codebase's
    own comments as existing technical debt, confirmed still present as of this audit — not
    something newly asserted here.
14. **§10 — the XP-award callable (`awardWorkoutXP`) was not independently re-opened/traced** in
    this pass; its existence and server-ownership rule is cited from `axioms.md §2` as
    background only.
15. **General — the Truth doc's remaining, unflagged LAW claims** (LAW 1-4, 6-10, 12-13) were
    not individually re-verified line-by-line in this pass; only LAW 0, LAW 5, LAW 11.1, and
    LAW 14 were directly contradicted by evidence found during this map and are called out at
    the top of this document. Treat the rest of the Truth doc as unverified-but-not-contradicted,
    not as confirmed.
