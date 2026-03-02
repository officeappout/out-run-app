# Phase 2 Deep Audit: Logic Connectivity Map

**Document Purpose:** Maps the flow from User Entry (Questionnaire) → Program Assignment → Real-world Performance → Adaptive Correction, and answers the four audit questions.

**Version:** 1.0 | **Date:** Feb 2025

---

## Executive Summary

| Question | Answer | Status |
|----------|--------|--------|
| 1. Rule Engine vs TRAINING_LOGIC | **No.** The Rule Engine does NOT enforce TRAINING_LOGIC rules. | ⚠️ Gap |
| 2. Pivot (4-day split → 1 workout → Full-Body?) | **No.** No automatic pivot exists. | ⚠️ Missing |
| 3. Exercise Bank ↔ Lemur Levels | **Implicit.** Exercise selection uses `targetPrograms` + Shadow Tracking; no explicit rule. | ✅ Works |
| 4. Admin Rule Engine overrides home-workout.service? | **No.** Admin rules never reach the workout engine. | ⚠️ Gap |

---

## 1. Rule Engine (מנוע כללים) vs. TRAINING_LOGIC.md

### What the Rule Engine Does

| Component | Location | Scope |
|-----------|----------|-------|
| Admin UI | `/admin/assessment-rules` | CRUD for `assessment_rules` Firestore collection |
| Service | `assessment-rule-engine.service.ts` | `evaluateRules(levels)` — compares push/pull/legs/core (or average) |
| Consumers | `branching-logic.service.ts`, `assessment-visual/page.tsx` | **Onboarding only** |

**Rule Actions (from `visual-assessment.types.ts`):**

- `BRANCH_TO_FOLLOW_UP` — Show follow-up slider for specific categories
- `SKIP_TO_RESULT` — Force program assignment (e.g. `forceProgramId: 'full_body'`)
- `INJECT_QUESTIONS` — Add question IDs to the questionnaire
- `SKIP_CATEGORY` — Skip questionnaire categories
- `SET_PROGRAM_TRACK` — Override `lifestyle.primaryTrack` (health/strength/run/hybrid)

**Conditions:** Numeric comparisons on `push`, `pull`, `legs`, `core`, or `average`.

### Does It Enforce TRAINING_LOGIC?

| TRAINING_LOGIC Rule | Enforced by Rule Engine? | Where It Lives (or Doesn't) |
|---------------------|-------------------------|-----------------------------|
| **Rule #6: Deload Week** | ❌ No | Not implemented anywhere |
| **Rule #5, #14, #18: Frequency → Split** | ❌ No | Hardcoded `READY_FOR_SPLIT_LEVEL = 10` in `progression.service.ts`; no frequency-based split assignment |
| **Rule #10, #21: Missed Workouts / Reactivation** | ⚠️ Partial | `daysInactive > 3` → 40% volume reduction in `home-workout.service.ts` (hardcoded) |
| **Rule #1: Fragmented Mode** | ⚠️ Partial | Logic exists in `Fragmenter` / `ContextualEngine` (hardcoded) |
| **Rule #12, #8: Smart Swap** | ✅ Yes | `SwapEngine`, `exercise-replacement.service.ts` (hardcoded) |

**Conclusion:** The Rule Engine is **purely for questionnaire branching**. It never touches workout generation, deload, frequency-to-split, or session structure.

---

## 2. Dynamic Questionnaire & Progression Tracks — Pivot Logic

### How Program Assignment Works

```
Visual Assessment (sliders) 
    → mapLevelsToProgram(program_thresholds) 
    → programId + levelId 
    → onboarding-sync.service 
    → user.progression.tracks, user.progression.activePrograms
```

- **Program Thresholds** (`program_thresholds`): Map `average(push,pull,legs)` → `programId` + `levelId`
- **Assessment Rules** can override via `SKIP_TO_RESULT` (e.g. force `full_body` when core is weak)

### Does the System Handle a "Pivot"?

**Scenario:** User is on a 4-day Split but only performs 1 workout in a week.

| Expected (TRAINING_LOGIC) | Actual Implementation |
|--------------------------|------------------------|
| Suggest Full-Body instead | ❌ **Not implemented** |
| Progression Manager authority | Progression Manager does NOT reassign programs based on performance |
| Rule Engine authority | Rule Engine is not used at runtime for workouts |

**What Exists Today:**

1. **Ready for Split** (`progression.service.ts`): When `full_body` level ≥ 10, sets `progression.readyForSplit` — **recommendation only**, no auto-assignment.
2. **Late-Night Pivot** (`dateUtils.ts`): If user's preferred time is late PM → condensed 15-min workout. **Time-based**, not performance-based.
3. **Volume Reduction** (`home-workout.service.ts`): `daysInactive > 3` → 40% volume cut. **Safety**, not split→FBW pivot.

**Conclusion:** There is **no automatic pivot** from Split to Full-Body when a user underperforms (e.g. 1 workout/week on a 4-day plan). Neither the Progression Manager nor the Rule Engine has this authority.

---

## 3. Exercise Bank & Level Equivalency (שקילות רמות)

### How Calisthenics "Scales" Link to Lemur Levels

| Concept | Storage | Usage |
|---------|---------|-------|
| **Exercise Level** | `exercise.targetPrograms: [{ programId, level }]` or `recommendedLevel` | Content classification in Exercise Bank |
| **User Level** | `user.progression.tracks[programId].currentLevel` | Runtime level per program |
| **Shadow Tracking** | `getEffectiveLevelForExercise()` | Maps exercise → user level via movementGroup/primaryMuscle |

### Flow: User Level 14 → 15, Tuck Planche → Full Planche

1. **Level Equivalence Rules** (`level_equivalence_rules`):  
   - Map **program-to-program** (e.g. `push L15 → planche L4`).  
   - Used when user **levels up** in one program to propagate levels to others.  
   - **Does NOT** map exercises to exercises.

2. **Exercise Selection** (`ContextualEngine` + `WorkoutGenerator`):
   - `getEffectiveLevelForExercise(exercise, userProfile)` → user's effective level for that exercise
   - `getExerciseLevel(exercise)` → `targetPrograms[0].level` or `recommendedLevel`
   - Exercises are filtered by level proximity: `|exerciseLevel - userLevel| ≤ tolerance`
   - When user levels 14→15, the **next workout** picks from the pool of exercises matching level 15

3. **No Explicit "Replace Tuck with Full Planche" Rule:**
   - Replacement is **implicit**: the engine selects exercises whose `targetPrograms` level matches the user's current level.
   - If "Full Planche" is tagged `planche L15` and "Tuck Planche" is `planche L14`, leveling to 15 shifts selection toward Full Planche.

**Conclusion:** Calisthenics progressions are linked via **exercise.targetPrograms** in the Exercise Bank. Level Equivalency propagates levels **between programs** (e.g. Push→Planche). Exercise replacement on level-up is driven by **level-matching in the ContextualEngine**, not by a named rule in the Rule Engine.

---

## 4. Documentation & Source of Truth

### Admin Panel vs. Hardcoded Logic

| Admin Config | Firestore Collection | Consumed By | Overrides home-workout.service? |
|--------------|----------------------|-------------|----------------------------------|
| **Assessment Rules** | `assessment_rules` | `branching-logic.service`, `assessment-visual` | ❌ No |
| **Program Thresholds** | `program_thresholds` | `program-threshold-mapper.service` (onboarding) | ❌ No |
| **Level Equivalence** | `level_equivalence_rules` | `progression.service` (on level-up) | ❌ No |
| **Program Level Settings** | `program_level_settings` | `home-workout.service`, `WorkoutGenerator` | ✅ Yes (targetGoals, protocolProbability, etc.) |

**Critical Finding:** Changing a rule in the Admin Rule Engine (`assessment_rules`) has **zero effect** on `home-workout.service.ts`. The workout engine does not import or call `evaluateRules`, `getActiveRules`, or any assessment-rule logic.

**Source of Truth for Workout Logic:** `TRAINING_LOGIC.md` + hardcoded logic in:

- `home-workout.service.ts`
- `WorkoutGenerator.ts`
- `ContextualEngine.ts`
- `progression.service.ts`

---

## 5. Logic Connectivity Map

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                        USER ENTRY (Questionnaire & Assessment)                            │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                          │
│  Dynamic Questionnaire ──► Assessment Rules (assessment_rules) ──► Branching Logic     │
│       (ניהול שאלון)              (מנוע כללים)                    (skip/inject/branch)   │
│                                                                                          │
│  Visual Assessment ──────► Program Thresholds (program_thresholds) ──► mapLevelsToProgram│
│       (sliders)                   (סיפי תוכנית)                      programId + levelId  │
│                                                                                          │
│  Output: user.progression.tracks, activePrograms, lifestyle.primaryTrack                  │
│                                                                                          │
└─────────────────────────────────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                           PROGRAM ASSIGNMENT (Persisted)                                  │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                          │
│  onboarding-sync.service ──► Firestore users/{id}                                        │
│  progression.tracks, activePrograms, readyForSplit (recommendation only)                  │
│                                                                                          │
└─────────────────────────────────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                        REAL-WORLD PERFORMANCE (Workout Generation)                       │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                          │
│  home-workout.service.ts                                                                  │
│       │                                                                                  │
│       ├── resolveActivePrograms (from user profile OR scheduledProgramIds)                │
│       ├── getEffectiveLevelForExercise (shadow-level.utils) ← user.progression.tracks     │
│       ├── ContextualEngine (filter + score exercises by level, equipment, injury)        │
│       ├── WorkoutGenerator (volume, difficulty, protocol, set types)                    │
│       ├── Program Level Settings (program_level_settings) ← targetGoals, protocols         │
│       │                                                                                  │
│       └── HARDCODED: daysInactive>3 → 40% vol, detraining lock, intensity gating         │
│                                                                                          │
│  Exercise Bank (targetPrograms) ──► Level matching ──► Exercise selection                 │
│                                                                                          │
└─────────────────────────────────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                         ADAPTIVE CORRECTION (Post-Workout)                                │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                          │
│  progression.service.processWorkoutCompletion()                                           │
│       │                                                                                  │
│       ├── Double progression (reps → level up)                                          │
│       ├── applyLevelEquivalences() ← level_equivalence_rules (program→program propagation)│
│       ├── checkReadyForSplit() → sets readyForSplit flag (recommendation only)           │
│       └── Linked program gains                                                           │
│                                                                                          │
│  SwapEngine (during workout):                                                             │
│       ├── "Too Hard" x2 → TrackingMatrix downgrade (permanent)                            │
│       └── "Equipment missing" → Session-only swap                                         │
│                                                                                          │
│  NOT IMPLEMENTED:                                                                         │
│       ├── Deload Week (Rule #6)                                                          │
│       ├── Frequency→Split pivot (4-day user doing 1/wk → suggest Full-Body)                │
│       └── Queue-based scheduling (Rule #10)                                              │
│                                                                                          │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Recommendations

1. **Rule Engine vs TRAINING_LOGIC:** Either extend the Rule Engine to support workout-time rules (deload, frequency→split) or document that TRAINING_LOGIC is the source of truth and the Rule Engine is onboarding-only.

2. **Pivot Logic:** Add a "performance-based pivot" in `home-workout.service` or a new service that checks `workoutsThisWeek` vs `assignedSplitDays` and suggests Full-Body when the user underperforms.

3. **Source of Truth:** If Admin rules should drive workout logic, add a dedicated `workout_rules` collection and have `home-workout.service` evaluate it at generation time. Today, Admin rules do not reach the engine.

4. **Level Equivalency:** The current design (program→program propagation + exercise `targetPrograms`) works. Consider documenting the implicit "level-up → exercise replacement" flow for maintainers.

---

*End of Phase 2 Deep Audit*
