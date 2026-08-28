# Block B — Post-Workout "Smart Close" Recommendation: Inputs Map

> Read-only investigation. 27.07.2026. Planning doc for **Block B** — the post-workout central
> home slot that becomes a state-aware recommendation (one hero + 2 alternatives), always
> COMPLEMENTING what was just done, always "an offer, not a push".
> Every claim cites file:line. NOTHING built. Verify against current code before acting —
> snapshots drift. Source design: Drive "ארכיטקטורת הבית ומנוע-ההמלצות v2" §3ג (state-aware
> anchor toggles) + §9 (rings/isRecovery). Related: [[post-workout-landing-map]] (Block A),
> summary-screens-map.md.

Investigation via 3 parallel read-only agents (session-end data · engine+isRecovery · recovery+time)
plus direct checks (A + anchor surface).

---

## 0. Headline

- The **anchor UI (hero + toggle-row) already exists** (`AnchorOptionToggles` under `HOME_ANCHOR_V2`),
  and the **isRecovery isolation law is complete + consistent (5 layers)** — Block B can reuse both.
- **3 big gaps to design around:**
  1. **F ⭐ — end-mode does NOT exist.** completed-as-planned / short-by-design / stopped-midway are
     recorded IDENTICALLY. This is the newest + most important input and is entirely absent.
  2. **B — "what was just done" exists but never reaches home.** `byDomain` is computed but not in the
     `post_workout_completed` handoff, not surfaced; abs-detection is lossy (first-muscle only).
  3. **Engine — no "complementary trio".** The 3 trio options are difficulty tiers of the SAME focus,
     not different types; light-aerobic has no hook at all. A new assembler (call the engine 3-4× with
     different constraints) is required.

---

## A · % of daily goal — EXISTS ✅

- `stripRingPct` = `src/app/home/page.tsx:542-545` — `dailyStrengthTarget.targetSets > 0 ? min(1,
  todayStrengthVolume.setsCompleted / targetSets) : 0`.
- Fed by `useTodayStrengthVolume()` (`home/page.tsx:429`) + `useDailyStrengthTarget(STRENGTH_RING_ENABLED)`
  (`:430`, stable target = weeklyVolumeTarget ÷ scheduleDays, live from currentLevel).
- Post-workout available (reads today's completed sets vs stable target).
- **GAP:** the target hook only reads Firestore when `STRENGTH_RING_ENABLED` is on (else targetSets=0 →
  pct=0). Block B's %-signal requires the ring engine enabled.

## B · what was just done (completed domains/muscles) — PARTIAL 🟡

- `summarizeTodayStrengthVolume` (`src/features/home/utils/todayStrengthVolume.ts:46-79`) → `{setsCompleted,
  setsPlanned, byDomain: Record<string,number>, sessionCount}`. `byDomain` from `SessionLog.domainSets`
  (`:71-75`); recovery excluded (`:60`); bucketed to today. Hook `useTodayStrengthVolume.ts:22-28` reads
  `useWeeklyVolumeStore.sessionLogs`.
- **GAP B-1:** `byDomain` is computed but **consumed nowhere in home** — only `setsCompleted` is read
  (`home/page.tsx:429,498,544`). The "which domains today" signal exists but is unsurfaced.
- **GAP B-2 (handoff):** `post_workout_completed` payload (`completion-sync.service.ts:131-146`) carries
  completedAt/workoutType/durationMinutes/workoutTitle/thumbnailUrl/streak/calories/exerciseCount — **no
  domain/muscle data**. Home knows THAT strength was done + how long, not WHAT.
- **GAP B-3 (per-muscle record):** 3 separate stores, none a clean "today's muscles": `SessionLog.domainSets`
  (daily, in-memory, `useWeeklyVolumeStore.ts:88-89`, computed `active/page.tsx:767-799`) · weekly
  `strength.domainSetsCompleted` (`useWeeklyVolumeStore.ts:36-37`) · Firestore `progression.lastSessionMuscleGroups`
  (`muscle-fatigue.service.ts:40-48`, typed `user.types.ts:190-194`) — **overwritten every session** (2/day loses
  the earlier), only read by the 48h shield for generation, never surfaced to home.
- **GAP B-4 (abs done today?):** taxonomy exists — `MuscleGroup` incl. `abs/obliques/core`
  (`exercise.types.ts:176-198`), collapse `MUSCLE_TO_DOMAIN` core/abs/obliques→'core' (`active/page.tsx:67-72`).
  Queryable via `byDomain['core']>0`. But: (a) no dedicated boolean; (b) `byDomain.core` credited only from the
  **first** muscle group (`ex.muscleGroups?.[0]`, `active/page.tsx:781`) → abs as a secondary muscle, or in a
  cardio/hybrid session, is uncounted; (c) `lastSessionMuscleGroups` overwritten + 48h-gated. **No unified
  "domains trained today" record designed for a recommendation to read.**

## C · remaining budget (time + energy) — PARTIAL 🟡

- **Weekly-set shrink EXISTS:** `getRemainingBudget()` = weeklyBudget − totalSetsCompleted
  (`useWeeklyVolumeStore.ts:362-365`). Deficit-aware DAILY shrink `SplitDecisionService.ts:480-486`
  (`remainingSets / effectiveDays`). Budget Floor `home-workout.service.ts:571-624` (remainingWeeklyBudget<6
  → all 3 options collapse to recovery). Time cap: `availableTime` + `BOLT_DURATION_CAPS`
  (`home-workout.service.ts:516-520`) + `enforceVolumeCap` (`:793-798`).
- **GAP (energy / time-left-in-day):** `energyLevel?:'low'|'medium'|'high'` exists (`workout-generator.types.ts:310`)
  but is **hardcoded 'medium'** (`home-workout.service.ts:1932`). No per-session "energy spent in THIS session",
  no "minutes left in the calendar DAY". A smart-close shrink sizing a follow-on to leftover time+energy = **NEW**.

## D ⚠️ · muscle-fatigue + isRecovery isolation law — EXISTS ✅ (pre-condition, complete)

- **muscle-fatigue.service EXISTS:** `src/features/workout-engine/services/split-decision/muscle-fatigue.service.ts`.
  `trackMuscleUsage(:32)` writes `progression.lastSessionMuscleGroups/lastSessionDate/lastSessionFocus`. The
  **48h Muscle Shield**: written `useActivitySync.ts:232`; read+window `SplitDecisionService.ts:506-523`
  (`isWithin48Hours`, `FORTY_EIGHT_HOURS_MS`); passed `home-workout.service.ts:1647-1648`; enforced
  `ContextualEngine.ts:254` → `passesMuscleShield(:457)`. **GAP:** shield gated to `isHabitBuilder` only;
  `lastSessionMuscleGroups` is a single overwritten snapshot (no rolling history).
- **isRecovery isolation — 5 layers, consistent (Block B MUST NOT break):**
  1. **Generation pool filter:** `WorkoutGenerator.ts:481` (`isRecovery = context.isRecoveryDay===true`),
     Active-Recovery-Guard hard-filters to cooldown/warmup/flexibility `:484-498`, emitted on GeneratedWorkout
     `:1225`. Source: `home-workout.service.ts:549,1148,1938`.
  2. **Flatten onto WorkoutPlan:** `buildRunnerWorkoutPlanFromGenerated.ts:274` (`isRecovery: gw.isRecovery ?? false`);
     **hand-flattened again** at `app/home/page.tsx:946`; read `active/page.tsx:839,1448,1469`.
  3. **Progression short-circuit:** `active/page.tsx:839` (`if (workoutPlan?.isRecovery) return;` BEFORE
     processWorkoutCompletion) + `useProgressionSync.ts:107`. `processWorkoutCompletion` itself
     (`progression.service.ts:1856`) has **no internal guard** — caller-side only.
  4. **Weekly volume budget:** `useWeeklyVolumeStore.ts:298-304` — recordStrengthSession returns before
     totalSets/domainSets/intense when isRecovery (active-minutes DO still accrue `:289-295`). Hybrid:
     `weekly-load.service.ts:88-89`.
  5. **XP:** `useXpAward.ts:101-105` (recoveryXp=0, skips awardStrengthXP). **Daily-goal:** `useActivitySync.ts:129`
     (`!isRecovery`).
- **3 HOLES to respect in Block B:** (a) processWorkoutCompletion trusts caller guards — a NEW caller must
  re-check isRecovery; (b) `isRecovery` is hand-flattened in 3 places — a new plan-build path must copy
  `gw.isRecovery` or it silently defaults false and leaks into progression/budget/XP; (c) recovery
  active-minutes accrue (matters if a smart-close "energy budget" reads active-minutes).

## E · time of day — EXISTS ✅ (evening rule disabled)

- Hour readers: canonical `detectTimeOfDay()` (`workout-metadata.service.ts:182-188` → morning 5-12 /
  afternoon 12-17 / evening 17-21 / night ≥21); greeting (`DailyPhrase.tsx:38-43`,
  `contentService.getGreetingForHour:113-128`); persona-by-hour `branding.service.ts:28-29` (isEvening 17-21 →
  'parent').
- **GAP:** the one real behavior — late-night condense — is **stubbed off**: `isLateNightPivot()`
  (`dateUtils.ts:97-107`) meant to condense to 15-min when `getHours()>=20`, body = `return false` (`:106`);
  consumer `StatsOverview.tsx:735-739` (`lateNight?15:60`). **No active late-evening rule suggests
  lighter/recovery** — recovery selection is gated purely on `isRestDay`, never on time. Infra exists, unwired.

## F ⭐ · how the workout ENDED (3 modes) — DOES NOT EXIST ❌ (the central gap)

The 3 target modes: (1) completed-as-planned · (2) short-by-design (pre-picked 15-min/easy) · (3) stopped-midway.
- **Session status is binary:** `SessionStatus='idle|active|paused|finished'` (`useSessionStore.ts:9`); `endSession()`
  sets 'finished' (`:94-96`), `clearSession()` resets (`:132-143`). 'finished' is IDENTICAL for full-finish and quit.
  Store carries only totalDuration/calories/distance — no counts, no plan, no reason.
- **Full-finish vs quit-midway — NO distinction (core gap):** full completion fires `onComplete` from the state
  machine (`useWorkoutStateMachine.ts:330,420,473`); early exit `ExitConfirmModal` → `StrengthRunner.handleEarlyExit`
  (`StrengthRunner.tsx:317-320`) calls the **exact same** `onComplete`. Both → `active/page.tsx handleComplete
  (:738-821)` → dopamine → `handleSummaryFinish(:1017-1200)` → sync/record, with **no differentiating flag**. A
  quit records to rings/streak/volume/XP/celebration identically to a full finish.
- **What IS captured:** actual duration, totalReps, completedExercises[], difficulty, domainSets (`workoutStats`
  `active/page.tsx:57-65`). Planned-vs-actual persisted as raw counts only: `saveWorkout` segment
  `planned:{exercises,sets}` vs `actual` (`active/page.tsx:1071-1093`); `recordStrengthSession(actualSets,
  plannedSets,…)` → `SessionLog.setsCompleted` vs `setsPlanned` (`useActivitySync.ts:178-187`).
- **GAP:** no `endMode`/`abandoned`/`completedAsPlanned`/`exitedEarly` field anywhere. Only derivable signal =
  heuristic `setsCompleted < setsPlanned` (a proxy for mode 3 only). It **cannot separate mode 2 from mode 1** (a
  short-by-design workout completed fully has completed==planned, same as a normal finish).
- **Short-by-design (F-3):** intensity IS recorded (`difficulty`→bolts `active/page.tsx:1042-1044`,
  `SessionLog.difficulty`); the chosen `availableTime` (15-min, picked in `WorkoutBuilderSheet.tsx:260`) is **never
  persisted** — `saveWorkout` stores only actual elapsed (`:1099`), planned has no duration. `difficulty=easy`
  conflates intensity with brevity. Mode 2 has no dedicated signal.
- **Dead `partial_workout` infra:** message type + `isPartial` (`useSmartGreeting.ts:37-38,117-119`) driven only by
  URL `?is_partial=true` (`:141-143`) which **nothing ever sets** — strength finish does a bare `router.push('/home')`
  (`active/page.tsx:1199`). Wired-to-read-never-written → confirms no end-mode reaches home.

---

## ENGINE · generateHomeWorkoutTrio — EXISTS ✅ (not complementary)

- `home-workout.service.ts:546`. Builds ONE shared scored pool (`_buildSharedPipeline:1077`), loops 3× over
  **fixed difficulty configs** (`:644-963`): `TRAINING_DAY_CONFIGS:522-526` [D1 flow, D2 balanced, D3 intense],
  `REST_DAY_CONFIGS:528-532` [flexibility, balanced, mobility]. Per-option diversity via Session Blacklist
  (`:669-677,946-949`). Scoring in `ContextualEngine.filterAndScore:100`→`scoreExercise:525`, sorted `:311`.
- **Inputs (`HomeWorkoutOptions`, `home-workout.types.ts:26-194`):** location, availableTime, difficulty/
  targetDifficulty, isRecoveryDay/isScheduledRestDay, `requiredDomains`(:125)+`strictDomains`(:133),
  scheduledProgramIds, remainingWeeklyBudget, preferredProtocols, generateSingleOption. **GAP:** no
  "goal"/"intensity scalar"/"workoutType" enum. Intensity=bolt 1-3; focus=`requiredDomains` (push/pull/legs/core).
- **Constrainable to complementary types — PARTIAL:** abs/core → `requiredDomains:['core']+strictDomains`
  (enforced `:1988-1989`→`WorkoutGenerator.ts:1533`) · recovery-stretch → `isRecoveryDay:true` (Active-Recovery-Guard
  `WorkoutGenerator.ts:484-498`; + `tryBuildRecoveryVideoTrio:350`, `generateRecoveryWorkout:217`) · short-strength →
  `targetDifficulty:1` + low availableTime. **light-aerobic → NO HOOK** (engine is strength/calisthenics only; cardio
  is a separate `trainingType` outside this generator; the `category` map `:812-822` is OUTPUT metadata not an input).
- **GAP:** no single "workoutType" enum forces a trio of DIFFERENT complementary types → **need a new assembler**
  that calls the engine 3-4× (varying requiredDomains/isRecoveryDay/targetDifficulty) and composes the smart-close
  trio; **and light-aerobic has no path at all**. Hook point: context assembly `home-workout.service.ts:1924-2010`
  + the config arrays `:522-532`.

## RECOVERY VIDEOS · pool + display API — PARTIAL 🟡

- **Pool:** Firestore `exercises` collection tagged `exerciseRole:'recovery'` (enum `exercise.types.ts:267`) +
  `showOnRestDays:true` (`:676`, companion `restDayProgramIds:681`). Fetch `getAllExercises()`
  (`exercise.service.ts:76-78`, collection `:67`). Admin UI `BasicsSection.tsx:435,443`. Video read from
  `execution_methods[0].media.mainVideoUrl`. No dedicated recovery collection; ~7 records are Firestore-only.
- **Fetch service:** no standalone `getRecoveryVideos()`. Only `tryBuildRecoveryVideoTrio()`
  (`home-workout.service.ts:350-479`, filters role+showOnRestDays `:358-359`, program-affinity, picks 3), invoked
  ONLY from generateHomeWorkoutTrio when `isRestDay` (`:549,559-568`). **GAP:** for wave-1 you'd call
  `getAllExercises()` + re-filter, or expose a new selector.
- **Display:** recovery currently plays through the FULL `StrengthRunner` player (`StatsOverview.handleTrioStart`→
  `onStartWorkout`, `StrengthRunner.tsx:400,458-459`). A LIGHTER player-independent renderer EXISTS:
  `content/exercises/client/components/ExerciseVideoPlayer.tsx` (`TutorialVideoPlayer`, props `:32-55` —
  video/mode/legacyVideoUrl/lazyPlay, provider-aware, no workout coupling). **GAP:** no component composes "message +
  recovery video card" outside the player; `SmartGreeting` + `TutorialVideoPlayer` exist separately, never combined.

## ANCHOR SURFACE · where the hero + 2 alternatives go — EXISTS ✅ (UI reusable)

- **The hero+toggle-row UI EXISTS:** `AnchorOptionToggles.tsx` (R Track 1) — props `labels[]/selectedIndex/onSelect/
  recommendedIndex→"מומלץ" badge`. Rendered `StatsOverview.tsx:1188` inside `renderWorkoutSection(:1120)`, gated by
  `HOME_ANCHOR_V2_ENABLED`, `labels={trioResult.options.map(o=>o.label)}`, recommended from
  `trio.meta.defaultFocusIndex`(`:909`). State: `selectedOptionIndex(:539)` + `handleTrioSelect(:973)`.
- **But:** current toggles = **intensity** (easy/normal/intense), not complementary types; and the whole section
  (hero+toggles) is inside `renderWorkoutSection`, gated `!hideWorkoutSection` (`:1418,1436,1509`) → **hidden when a
  workout is done**. Post-workout the slot shows the completion card / **Block A bridge** (`home/page.tsx:1455-1459`;
  the `POST_WORKOUT_LANDING_V1 ?` branch = the "אני על הגל" button, `handleRequestMore:561`).
- **Block B lands here:** replace the Block-A bridge with a POST-mode hero + toggles (complementary types), reusing
  `AnchorOptionToggles`, wrapped in a NEW flag. `HOME_ANCHOR_V2` (shell) + `POST_WORKOUT_LANDING_V1` (Block A) are the
  neighboring flags; Block B = its own flag over the post-mode content.

---

## Consolidated table

| input/engine | exists? | key anchor (file:line) | main gap |
|---|---|---|---|
| A · % of goal | ✅ | stripRingPct `home/page.tsx:542` | needs STRENGTH_RING_ENABLED on |
| B · what-was-done | 🟡 | `byDomain` `todayStrengthVolume.ts:46` | not in handoff, not surfaced, abs lossy (first-muscle) |
| C · remaining budget | 🟡 | weekly-shrink `SplitDecisionService.ts:480` | no per-session energy / time-left-in-day |
| D · fatigue + isRecovery | ✅ | fatigue.service + 5-layer isolation | 3 holes: caller-guard, hand-flatten×3, active-min accrues |
| E · time of day | ✅ | `detectTimeOfDay` `workout-metadata.service.ts:182` | evening→light rule stubbed off `dateUtils.ts:106` |
| F ⭐ · end-mode | ❌ | — | **no distinction between the 3 modes — the central gap** |
| engine · trio | ✅ | `home-workout.service.ts:546` | 3=difficulty not type; light-aerobic no hook; need assembler + 3-4× calls |
| recovery videos | 🟡 | tag `exercise.types.ts:676`; `tryBuildRecoveryVideoTrio:350` | no standalone hook; no lightweight "message+stretch" (TutorialVideoPlayer exists) |
| anchor surface | ✅ | `AnchorOptionToggles` `StatsOverview.tsx:1188` | toggles=intensity; hidden post-workout; Block B replaces the bridge, new flag |

## Existing infra that shortcuts Block B
hero+toggle UI (`AnchorOptionToggles`) · % (`stripRingPct`) · isRecovery isolation (complete, 5 layers) ·
`muscle-fatigue.service` + 48h shield · `detectTimeOfDay` + `isLateNightPivot` (unwired) · recovery pool tags +
`TutorialVideoPlayer` · engine constraints (requiredDomains/strictDomains/isRecoveryDay/targetDifficulty).

## The 3 things to design (not built)
1. **F ⭐ — an `endMode` signal** on the finish path (completed-as-planned / short-by-design / stopped-midway),
   propagated to home. Today: absent; both finish + quit call the same `onComplete`, and chosen duration isn't saved.
2. **B — surface "domains trained today"** to home (extend the `post_workout_completed` handoff or read `byDomain`),
   with a non-lossy abs/core signal.
3. **Engine — a "smart-close assembler"** producing a complementary trio (short-strength / abs / recovery-stretch /
   light-aerobic) sized by remaining time+energy — new orchestration over the existing generator; light-aerobic
   needs a new (cardio) path.

---

## CONTRACT ADDITION — coordination signal for the map chat (28-29.07)

Block B needs two NEW `UserContext` fields. Per David (approved option A): **the definition lives ONLY in
`docs/architecture/workout-recommendation-engine.md` §4.1 (the shared SoT) — the map chat adopts these into
`UserContext`; Block B CONSUMES, never defines a competing local type.** This block is the concrete signal to
hand the map chat (we do NOT edit the shared doc ourselves — avoid clobbering a doc the other chat may be editing).

**Add to §4.1 (UserContext):**

| field | description |
|---|---|
| `endMode` | how the LAST session ended — closed enum: `'full'` (completed as planned) · `'short'` (completed, but the workout was pre-selected brief) · `'quit'` (exited before the end). |
| `intendedDurationMin` | the target duration the user picked up front (minutes). Splits `short` vs `full` and is a raw shrink signal for the post_workout suggestion. |

**Derivation rule (crisp + closed):**
`endMode = exitedBeforeCompletion ? 'quit' : (intendedDurationMin <= 20 ? 'short' : 'full')`.
- `quit` = the session left via the early-exit path (ExitConfirmModal → `StrengthRunner.handleEarlyExit`) before the
  state machine fired its natural completion.
- `short` vs `full` = a COMPLETED session, split by the user's chosen `intendedDurationMin` (≤20 min ⇒ short).
- `intendedDurationMin` source = `WorkoutBuilderSheet` `availableTime` (the pre-workout duration pick).

**Block B code stance:** F (data-capture) derives `endMode` + `intendedDurationMin` at session end and carries them
in the completion handoff, using the literal union inline — NO authoritative `UserContext`/`EndMode` type is
declared in code (that is the map chat's contract). Coordination checkpoint (condition #4): when the map chat lands
`UserContext`, verify these two fields match this spec before Block B's assembler leans on the typed context.

Related: [[post-workout-landing-map]] · [[home-daily-goal-v1]] · summary-screens-map.md · [[recovery-progression-guard]] · [[workout-rec-engine-master-doc]].
