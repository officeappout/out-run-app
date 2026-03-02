# Frequency & Split Research — Logic Gaps Report

**Date:** Feb 21, 2025  
**Goal:** Identify where the system handles Training Frequency (daysPerWeek), recovery/fatigue, level-based branching, and where the "Split Decision" happens — before implementing Focus/Priority logic.

---

## Executive Summary

| Area | Current State | Gap |
|------|---------------|-----|
| **Frequency → Split** | ❌ Not implemented | No logic switches Full Body / Push-Pull / Upper-Lower based on daysPerWeek |
| **Recovery / Fatigue** | ⚠️ Partial | Recovery day exists; no "trained yesterday" muscle-group logic |
| **Level-Based Branching** | ⚠️ Partial | Program assigned at onboarding; generator does NOT change strategy by level |
| **Upper Body 5-day** | ❌ Same logic | No variety/rotation; identical logic every session |
| **Split Decision** | ❌ No central point | Split is determined by onboarding/assessment, not by frequency |

---

## 1. Frequency Mapping (daysPerWeek)

### Where `scheduleDays` / `trainingDays` Lives

| Location | Field | Format |
|----------|-------|--------|
| `profile.lifestyle.scheduleDays` | Array of Hebrew day letters | `['א', 'ב', 'ג', 'ד', 'ה']` |
| `profile.lifestyle.trainingDays` | Implied | `scheduleDays.length` |
| Onboarding `ScheduleStep` | `frequency` (state) → `trainingDays` | Number 1–7 |
| `onboarding-sync.service` | `scheduleDays`, `trainingDays` | Persisted to Firestore |

### Where It Is Used Today

| File | Usage |
|------|--------|
| `useWeeklyVolumeStore.ts` | `calculateWeeklyBudget(userLevel, scheduleDays)` — **Budget = setsPerWorkout × scheduleDays** |
| `workout-generator.service.ts` | In `inferUserLifestyleTags()` — if `scheduleDays.length > 0` → adds `student`, `parent` tags (for exercise matching) |
| `useSmartSchedule.ts` | Builds week schedule (which days are workout vs rest) |
| `SmartWeeklySchedule.tsx` | UI display of selected days |
| `profile-completion.service.ts` | Schedule completion check |

### What Is NOT Implemented

- **No logic** that maps `daysPerWeek` → workout type:
  - 3 days → Full Body
  - 4 days → Push/Pull or Upper/Lower
  - 5–6 days → High-frequency rotation
- `TRAINING_LOGIC.md` Rule 2.1 describes this intent but it is **not coded**.

### Budget Initialization Gap

- `calculateWeeklyBudget(userLevel, scheduleDays)` exists and is correct.
- `initializeWeek(userId, weeklyBudget)` and `checkAndResetWeek()` exist in `useWeeklyVolumeStore`.
- **No caller** invokes `checkAndResetWeek` or `initializeWeek` with the computed budget.
- StatsOverview and AdjustWorkoutModal do **not** pass `remainingWeeklyBudget` or `weeklyBudgetUsagePercent` to `generateHomeWorkout`.
- Result: Weekly volume store may never be initialized with `scheduleDays.length`; budget-based throttling is effectively unused.

---

## 2. Recovery & Fatigue Logic

### What Exists

| Feature | Location | Behavior |
|---------|----------|----------|
| **Recovery Day** | `home-workout.service.ts`, `WorkoutGenerator.ts` | `isScheduledRestDay` or `isRecoveryDay` → difficulty 1, targets `exerciseRole:'cooldown'` |
| **Detraining** | `home-workout.service.ts` | `daysInactive > 3` → 40% volume reduction |
| **Recovery workouts** | `useWeeklyVolumeStore` | `isRecovery=true` → excluded from weekly budget |
| **Load Advisor** | `LoadAdvisorBanner.tsx` | When budget > 90% → "Recovery recommended" |

### What Is Missing

- **No "trained yesterday" logic** — generator does not know which muscle groups were trained on the previous session.
- **No muscle-group recovery** — no logic to skip chest if chest was trained yesterday when user trains 5–6×/week.
- **No rotation** — no day-of-week or session-index based rotation to prevent overuse.

---

## 3. Level-Based Branching

### What Exists

| Feature | Location | Behavior |
|---------|----------|----------|
| **Ready for Split** | `progression.service.ts` | `checkReadyForSplit()` — when `full_body` level ≥ 10, suggests `['upper_body', 'lower_body', 'push', 'pull', 'legs']` |
| **Program assignment** | `program-threshold-mapper.service.ts` | Assessment average → program: Beginner (1–5) → Full Body, Intermediate (6–12) → Full Body, Advanced (13–18) → Upper Body, Elite (19–25) → Calisthenics |
| **Volume by level** | `useWeeklyVolumeStore.calculateWeeklyBudget()` | L1–5: 4 sets/workout, L6–15: 6, L16+: 8 |
| **Protocol injection** | `WorkoutGenerator` | Level 10+ → antagonist supersets, advanced protocols |

### What Is Missing

- **No split change by level** — a Level 1 user with 4 days gets the same program structure as a Level 22 user with 4 days.
- **Ready for Split** is a **post-workout suggestion**, not a runtime split decision.
- WorkoutGenerator does not receive `scheduleDays` or `daysPerWeek` and does not branch on level + frequency.

---

## 4. Upper Body Calisthenics — 5 Days/Week

### Current Behavior

- Upper Body is a **Master Program** with `subPrograms: ['push', 'pull']`.
- `generateMasterProgramWorkout()` in `workout-generator.service.ts`:
  - Sets `focusDomains = ['upper_body']` (no lower_body, no core for pure Upper Body).
  - Fetches exercises per domain, mixes with `mixExercisesByDomain()`.
- **Same logic every session** — no day-of-week or session-index variation.
- No rotation (e.g., Day 1: Push-heavy, Day 2: Pull-heavy, Day 3: Push, etc.).
- No "avoid same muscle group two days in a row" logic.

---

## 5. Where the "Split Decision" Happens

### Answer: There Is No Central Split Decision

The split is determined by:

1. **Onboarding / Assessment** (`program-threshold-mapper.service.ts`, `assessment-rule-engine.service.ts`)
   - User's assessment level → program assignment (full_body, upper_body, calisthenics, etc.).

2. **Active Program** (`userProfile.progression.activePrograms`, `progression.domains`)
   - Which program the user is in drives `activeProgramFilters` in `home-workout.service.ts`.

3. **Program structure** (Firestore `programs` collection)
   - Master programs have `subPrograms`; each workout pulls from those domains.
   - No runtime decision based on frequency or level.

### TRAINING_LOGIC.md vs Code

| TRAINING_LOGIC.md (Rule 2.1) | Code |
|-----------------------------|------|
| 2 days → Full Body A/B | ❌ Not implemented |
| 3 days → Undulating or Push/Pull/Mixed | ❌ Not implemented |
| 4 days → Upper/Lower or Push/Pull | ❌ Not implemented |
| Queue-based (workouts don't expire) | ⚠️ Partial (reactivation protocol exists) |

---

## 6. Key File Locations

| Purpose | File |
|---------|------|
| Weekly budget formula | `useWeeklyVolumeStore.ts` → `calculateWeeklyBudget(userLevel, scheduleDays)` |
| Workout generation entry | `home-workout.service.ts` → `generateHomeWorkout()` |
| Program filter / scoring | `ContextualEngine.ts` → `filterAndScore()` |
| Volume & structure | `WorkoutGenerator.ts` → `generateWorkout()` |
| Master program logic | `workout-generator.service.ts` → `generateMasterProgramWorkout()` |
| Ready for Split | `progression.service.ts` → `checkReadyForSplit()` |
| Program assignment | `program-threshold-mapper.service.ts` |
| Schedule / rest day | `userSchedule.service.ts`, `schedule.types.ts` |
| Recovery path | `home-workout.service.ts` (isRecoveryDay), `WorkoutGenerator.ts` (difficulty 1) |

---

## 7. Recommended Master Rulebook (Target State)

| Frequency | Level | Target Split |
|-----------|-------|--------------|
| 3 days/week | Beginner | Full Body + rest days |
| 3 days/week | Advanced | Full Body or Undulating |
| 4 days/week | Beginner | Full Body (2×) or Upper/Lower |
| 4 days/week | Advanced | Push/Pull or Upper/Lower |
| 5–6 days/week | Any | High-frequency focus with rotation |

### Implementation Hooks

1. **Split Decision Point** — Add a new service or module that:
   - Receives: `userLevel`, `scheduleDays.length`, `activeProgramId`
   - Returns: `splitType` ('full_body' | 'push_pull' | 'upper_lower' | 'high_frequency_rotation')
   - Called from `generateHomeWorkout` before or during context building.

2. **Frequency & Budget Wiring** — Ensure:
   - `checkAndResetWeek(userId, calculateWeeklyBudget(level, scheduleDays.length))` is called on app mount / profile load.
   - `generateHomeWorkout` receives `remainingWeeklyBudget` and `weeklyBudgetUsagePercent` from the store.

3. **Recovery / Rotation** — Add:
   - `lastTrainedMuscleGroups` or `lastSessionDomains` to session log / activity store.
   - Pass to `generateHomeWorkout` and use in `ContextualEngine` or `WorkoutGenerator` to down-score or exclude recently trained muscle groups.

4. **Upper Body 5-day** — Add session index or day-of-week to context; use to alternate focus (e.g., Push-heavy vs Pull-heavy).

---

## 8. Summary Table

| Question | Answer |
|----------|--------|
| Where is daysPerWeek used for workout type? | **Nowhere** — only for budget formula and lifestyle tags |
| Is there muscle recovery / "trained yesterday" logic? | **No** |
| Does WorkoutGenerator change strategy by level? | **No** — only volume and protocol injection |
| How does Upper Body behave with 5 days? | **Same logic every session** — no variety |
| Where is the Split Decision? | **No central decision** — it's onboarding/assessment + active program |
