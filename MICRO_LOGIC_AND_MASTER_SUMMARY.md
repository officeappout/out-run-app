# Micro-Logic Deep Dive & Workout Engine Master Summary

**Document Purpose:** Micro-logic of workout generation + consolidated source of truth for Identity, Planning, and Vibe layers.

**Version:** 1.0 | **Date:** Feb 2025

---

# Part A: Micro-Logic Deep Dive

## 1. Exercise Ordering

### How WorkoutGenerator.ts Sorts Exercises

| Stage | Logic |
|-------|-------|
| **Selection** | Exercises are selected by **score** (descending) within each priority bucket. `selectExercisesForDifficulty` filters by level, then `sort((a, b) => b.score - a.score)`. |
| **Within Bucket** | Primary pool (skill + compound): score-sorted. Secondary (accessory + isolation): score-sorted. No shuffle within same score. |
| **Final Order** | **Strict priority sort:** `skill → compound → accessory → isolation` (Step 5 in `generateWorkout`). |

```ts
// WorkoutGenerator.ts ~line 637
workoutExercises.sort((a, b) => {
  const priorityOrder: Record<ExercisePriority, number> = { skill: 0, compound: 1, accessory: 2, isolation: 3 };
  return priorityOrder[a.priority] - priorityOrder[b.priority];
});
```

**Priority Classification** (`classifyPriority`): Inferred from `exercise.tags` and `movementType`:
- `tags.includes('skill')` → skill
- `tags.includes('compound')` or `movementType === 'compound'` → compound
- `tags.includes('isolation')` → isolation
- `primaryMuscle === 'full_body'` → compound
- Default → accessory

**Answer:** Ordering is **strictly by priority** (Skill first, then Compound, Accessory, Isolation). Within each priority, exercises are ordered by **ContextualEngine score** (desc). No difficulty score as a separate sort key — score already incorporates level proximity, gear match, persona, etc.

---

## 2. Grouping (Supersets & Circuits)

### Protocol Injection

| Mechanism | Location | Logic |
|-----------|----------|-------|
| **selectProtocol** | WorkoutGenerator | When difficulty ≥ 2, `protocolProbability` from ProgramLevelSettings gates injection. If Admin set `preferredProtocols` (emom, pyramid, antagonist_pair, superset), one is picked at random. Returns `{ structure, setType }`. |
| **Structure** | WorkoutGenerator | `structure` can be `standard`, `emom`, `amrap`, `circuit`. `determineStructure`: blast → emom/amrap; `exercises.length <= 3 && availableTime <= 15` → circuit; else standard. |
| **SetType** | WorkoutGenerator | `setType` can be `straight`, `antagonist_pair`, `superset`, etc. — passed to RestCalculator for rest logic. |

### Does the Engine Create Actual Pairs?

**No.** The home-workout flow produces a **flat list** of exercises. The `structure` and `setType` are metadata on the workout, but:
- There is **no logic** that groups exercises into pairs (e.g. Push A + Pull B)
- The blueprint types (`pairedSlotId`, `pairedExercise`) exist for the **blueprint-based** architecture, which is not used by home-workout.service
- `StrengthSummaryPage` maps exercises to `category: 'superset'` for display, but that mapping is **inferred from segment structure** (e.g. antagonist_pair in WorkoutPlan segments), not from WorkoutGenerator output

**RestCalculator** has `antagonist_pair` and `superset` set-type modifiers (reduced rest between pair), but the WorkoutGenerator does not assign `pairedExercise` or group exercises. The pairing would need to be done by a **post-processing step** or by the UI when rendering — currently the generated workout is a flat list.

**Answer:** Protocol injection sets `structure` and `setType` at the workout level. There is **no automatic pairing** of exercises (e.g. which Push pairs with which Pull). The engine does not decide "which exercises pair well together" — that logic exists in blueprint types but is not wired into the production flow.

---

## 3. Variety & Anti-Repetition

### Current Mechanisms

| Mechanism | Where | Effect |
|-----------|-------|--------|
| **Random exercise count** | `getExerciseCountForDuration` | `config.min + Math.floor(Math.random() * (config.max - config.min + 1))` — e.g. 4–5 exercises for 15–30 min |
| **Random sets/reps** | `assignVolume` | Sets and reps chosen from tier range via `Math.random()` |
| **Random protocol** | `selectProtocol` | When protocols are configured, `adminProtocols[Math.floor(Math.random() * adminProtocols.length)]` |
| **Shuffle among ties** | `workout-metadata.service` | For titles/descriptions: "pick random among highest-scoring rows" |
| **Equipment diversity** | `exercise-replacement.service` | In Smart Swap: prefer candidates with different `requiredGearType` for variety |

### What Is Missing

- **No `lastPerformedDate`** — Exercises do not carry or check when they were last performed
- **No "shuffle prioritizes not-seen-recently"** — Selection is purely score-based; same high-scoring exercises win every time
- **No anti-repetition penalty** — ContextualEngine does not down-rank exercises performed in the last N days

**Answer:** Variety comes from **randomization** (count, sets, reps, protocol) and **score variance** (equipment, level, persona). There is **no lastPerformedDate check** or shuffle that prioritizes exercises not seen recently. The same exercises can appear repeatedly if they consistently score highest.

---

## 4. Weekly Catch-up (WeeklyVolumeStore)

### How the Engine Uses Weekly Budget

| Direction | Logic | Implemented? |
|-----------|-------|--------------|
| **Budget exhausted** | When `weeklyBudgetUsagePercent > 75` and `remainingWeeklyBudget > 0` → **reduce** planned sets by 20% | ✅ Yes (`calculateVolumeAdjustment`) |
| **User behind** | When user has done few sets (e.g. 2 sessions instead of 4) → **increase** sets in next workout | ❌ **No** |

**WeeklyVolumeStore** provides:
- `getRemainingBudget()` — sets left in the week
- `getBudgetUsagePercent()` — 0–100
- `recordStrengthSession` — updates on completion

**home-workout.service** can receive `remainingWeeklyBudget` and `weeklyBudgetUsagePercent` in options, but **StatsOverview does not pass them** (grep found no usage in home components). The lead-program.service resolves budget; it's unclear if it's wired end-to-end.

**Answer:** The engine **does NOT increase** sets when the user is behind. It only **reduces** when budget is nearly exhausted (>75% used). There is no "catch-up" logic that adds sets to make up for missed volume.

---

## 5. Blueprint vs. Generation — Queue by Goal

### Current Architecture

| Concept | Implementation |
|---------|----------------|
| **Blueprint** | `WorkoutBlueprint` with slots, `fragmentPart`, `pairedSlotId` — used by Fragmenter. **Not used** by home-workout.service. |
| **Generation** | `generateHomeWorkout` uses `scheduledProgramIds` (from UserSchedule) + `userProfile` + `location`, `availableTime`, etc. Exercises are **regenerated fresh** each time from ContextualEngine + WorkoutGenerator. |
| **Queue** | TRAINING_LOGIC mentions a Queue (workouts don't expire, miss Tuesday → do Tuesday on Wednesday). **Not implemented.** UserSchedule is a calendar (date → programIds), not a queue. |

### Can the Queue Work by Blueprint Goal?

**Yes.** The system already works by **program goal**, not fixed exercises:
- `scheduledProgramIds` = e.g. `['push', 'pull']` for a given day
- These are **program IDs** (Upper Body Strength, Push, etc.), not exercise lists
- Each call to `generateHomeWorkout` **regenerates** exercises from the pool matching those programs, current location, equipment, level, etc.

So the "Queue" can hold **goals** (e.g. "Upper Body Strength", "Push Day") and the engine regenerates the actual exercise list each time based on:
- Current location (home/park/office)
- Current equipment
- User level (Shadow Tracking)
- Available time
- Injury shield
- etc.

**Answer:** The Queue **can** work by moving the Blueprint Goal (program IDs) rather than a fixed exercise list. The generation is already **dynamic** — exercises are chosen at runtime. What's missing is the Queue itself (ordering of workouts, "next in queue" when user misses a day, persistence of completion state per scheduled item).

---

# Part B: Workout Engine Master Summary

## Layer 1: Identity

**Source:** User profile, onboarding, assessment.

| Component | Role |
|-----------|------|
| **Visual Assessment** | Slider levels (push, pull, legs, core) → `mapLevelsToProgram` (program_thresholds) → programId + levelId |
| **Assessment Rules** | Questionnaire branching only (BRANCH_TO_FOLLOW_UP, SKIP_TO_RESULT, etc.). Do NOT affect workout generation. |
| **Program Thresholds** | Map average level → program. Admin-configurable. |
| **Level Equivalence** | Program→program propagation on level-up (e.g. Push L15 → Planche L4). |
| **User Profile** | `progression.tracks`, `progression.activePrograms`, `progression.domains`, `equipment`, `health.injuries`, `lifestyle` |

**Output:** Assigned programs, levels per domain, equipment, injuries, persona.

---

## Layer 2: Planning

**Source:** UserSchedule, recurring template, date.

| Component | Role |
|-----------|------|
| **UserSchedule** | `getScheduleEntry(date)` → `type: 'training'|'rest'`, `programIds`. Calendar, not queue. |
| **Rest Day** | `isScheduledRestDay` → difficulty 1, isRecoveryDay, level -1 exercises (not cooldown-only). |
| **Late-Night Pivot** | `isLateNightPivot` → availableTime: 15, compound-only. |
| **Lead Program** | Resolves weekly volume budget, max intense sessions from program hierarchy. |
| **Fragmenter** | Not integrated. Would split Office/Home; no remaining-fragment persistence. |

**Output:** `scheduledProgramIds`, `isScheduledRestDay`, `availableTime`, budget context.

---

## Layer 3: Vibe Override

**Source:** User choices at generation time.

| Component | Role |
|-----------|------|
| **AdjustWorkoutModal** | Overrides: location, intentMode, availableTime, difficulty, shadow matrix. Regenerates workout. Replaces recommended workout in state. |
| **Session Context** | `sessionStorage.currentWorkoutLocation`, `equipmentOverride` (not passed from UI for "travel mode"). |
| **Progression on Completion** | `processWorkoutCompletion` uses `activePrograms[0]` — no distinction between scheduled vs. vibe override. |
| **Queue Authority** | No queue. Schedule entry not marked complete. Cannot distinguish "did scheduled Push" vs "did custom Abs/Back". |

**Output:** Final workout (may differ from planned). Completion credits first active program regardless.

---

## Generation Pipeline (home-workout.service)

```
1. Resolve effective profile (scheduledProgramIds override activePrograms)
2. Fetch exercises, programs, gym equipment
3. Level-aware filter: exercises matching user program levels ±tolerance
4. Derive context: daysInactive, injuries, persona, equipment, budget
5. ContextualEngine.filterAndScore(exercises, context)
6. WorkoutGenerator.generateWorkout(scoredExercises, context)
   - Difficulty resolution (first session, detraining, user choice)
   - getExerciseCountForDuration(availableTime)
   - selectExercisesForDifficulty (level filter)
   - selectExercises (priority buckets, score sort, SA cap)
   - assignVolume (tier-based sets/reps/rest)
   - Sort by priority (skill→compound→accessory→isolation)
   - selectProtocol (emom, antagonist_pair, etc. from Admin)
   - determineStructure (standard/emom/amrap/circuit)
7. appendCooldownExercises (2-3 stretch)
8. Resolve metadata (title, description, aiCue) from Firestore
9. Return HomeWorkoutResult
```

---

## Key Gaps (Consolidated)

| Gap | Layer | Recommendation |
|-----|-------|-----------------|
| Rule Engine not used for workouts | Identity | Extend or document: Rule Engine = onboarding only |
| No frequency→split pivot | Planning | Add performance-based pivot when underperforming |
| No Queue | Planning | Implement queue with goal-based items; mark complete on finish |
| Fragmenter not integrated | Planning | Wire Fragmenter when office/low time; persist Part A/B |
| No lastPerformedDate variety | Generation | Add anti-repetition scoring or shuffle |
| No weekly catch-up | Generation | Add "behind budget" path to increase sets |
| No superset pairing | Generation | Add pairing logic (Push+Pull) when setType=antagonist_pair |
| TrackingMatrix not persisted | Vibe | Wire SwapEngine "too hard" → progression.domains |
| Vibe override not tracked | Vibe | Add scheduledWorkoutId to metadata; mark schedule on completion |

---

## Document Index

| Document | Purpose |
|----------|---------|
| **TRAINING_LOGIC.md** | Canonical rules (21 points). Many not implemented. |
| **PHASE2_LOGIC_CONNECTIVITY_MAP.md** | Rule Engine vs TRAINING_LOGIC, pivot, level equivalency, source of truth |
| **LOGIC_STRESS_TEST_15_SCENARIOS.md** | 15 user scenarios: System-Handled, Partially-Handled, Logic-Broken |
| **LAYER2_LAYER3_TECHNICAL_BREAKDOWN.md** | Fragmenter, Recovery/Maintenance, Late-Night/Office, Queue Authority |
| **MICRO_LOGIC_AND_MASTER_SUMMARY.md** | This document — micro-logic + Master Summary |

---

*End of Micro-Logic & Master Summary*
