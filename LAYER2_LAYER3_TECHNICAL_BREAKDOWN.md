# 3-Layer Logic: Technical Breakdown for Layer 2 & 3

**Document Purpose:** Technical breakdown of Fragmenter, Recovery/Maintenance, Late-Night/Office context, and Queue Authority for the Identity → Planning → Vibe Override design.

**Version:** 1.0 | **Date:** Feb 2025

---

## 1. The Fragmenter

### How Fragmenter.ts Works

**Location:** `src/features/workout-engine/logic/Fragmenter.ts`

**Design (TRAINING_LOGIC Rule #1):** When the user cannot complete a full session ("No Time" / "Office Mode"), split the daily workout into two mini-sessions:
- **Part A (Office/Morning):** Mobility, Core, Accessories — Low Sweat, No Equipment
- **Part B (Home/Evening):** Main Compound Lifts (Push/Pull) requiring equipment
- **Completion:** Day is "Done" only when Part A + Part B are completed

**Implementation:**

| Step | Logic |
|------|-------|
| **Trigger** | `analyze(blueprint, context)` returns `shouldFragment: true` when: (a) `context.timeAvailable < blueprint.minDuration` OR (b) `context.location === 'office'` AND blueprint needs equipment |
| **Slot Split** | Slots with `fragmentPart: 'A'` → Part A; `fragmentPart: 'B'` → Part B. Otherwise: `PART_A_SLOT_TYPES` (warmup, cooldown, accessory) or `PART_A_MOVEMENT_PATTERNS` (core_*, mobility_*, handstand_balance) → Part A; rest → Part B |
| **Output** | `FragmentationResult`: `partASlots`, `partBSlots`, `partADuration`, `partBDuration` |
| **Completion Check** | `isSessionComplete(session)` → `session.fragments.every(f => f.isCompleted)` |

**Critical:** Fragmenter operates on `WorkoutBlueprint` (blueprint-based architecture). The main `home-workout.service` flow does **not** use WorkoutBlueprint or Fragmenter. It uses `ContextualEngine` + `WorkoutGenerator` with a flat exercise pool. **Fragmenter is not integrated into the production generation path.**

### If User Stops Early — Is the Remaining Fragment Stored?

**No.** The Fragmenter does not persist anything. There is no logic that:
- Stores "remaining Part B" when the user completes Part A and stops
- Offers "Part B" as a separate workout next time
- Tracks fragment completion across sessions

**What exists instead:**
- `useWorkoutPersistence` (StrengthRunner): Saves checkpoint (`segmentIndex`, `exerciseIndex`, `elapsedTime`, `exerciseLog`) to localStorage for **resuming the same workout** — not for offering the remainder as a new session.
- No queue or "remaining fragment" document in Firestore.

**Gap:** TRAINING_LOGIC Rule #1 says "day is Done only when Part A + Part B are completed" — but there is no persistence of Part A/B completion state or "offer Part B next" logic.

---

## 2. Recovery & Maintenance Logic

### Definitions (TRAINING_LOGIC.md + Exercise Bank)

| Term | TRAINING_LOGIC | Exercise Bank / Code |
|------|----------------|----------------------|
| **Maintenance** | Rule #2: "If user is inactive/low energy/rest day" → Follow-along videos (Mobility/Flexibility). 2–3 videos for Library/Office vs. 2–3 for Home. Preserves streak without CNS fatigue. | `exerciseRole: 'cooldown'` + `tags: ['mobility']`; category `maintenance` in rings (purple). No explicit "maintenance" exercise role. |
| **Mobility** | Implicit in Rule #2 (Mobility/Flexibility content). | `tags: ['mobility']`; `movementPattern: 'mobility_upper' | 'mobility_lower'`; `mechanicalType: 'none'` for non-calisthenics. |
| **Recovery** | Rule #2 (low energy), Rule #10/#21 (reactivation). | `isRecoveryDay: true` → difficulty 1, level -1 exercises; `isRecovery` flag on workout → excluded from weekly volume budget. |

### When Are These Triggered?

| Trigger | Mechanism | Rest Day? | Duration Fallback? |
|---------|------------|-----------|--------------------|
| **Scheduled Rest Day** | `isScheduledRestDay: true` when `getScheduleEntry(date).type === 'rest'`. StatsOverview passes this to `generateHomeWorkout`. | ✅ Yes | No — explicit rest day from schedule |
| **Recovery content** | `effectiveDifficulty = 1`, `isRecoveryDay = true` → WorkoutGenerator uses difficulty 1 path: level -1 exercises, no protocol injection, recovery AI cue | — | No — schedule-driven |
| **Duration-based** | When `availableTime <= 10` → `DURATION_SCALING['5']` (2–3 exercises, no accessories). When `availableTime = 15` (Late-Night Pivot) → 4–5 exercises, compounds only. | No | ✅ Yes — `getExerciseCountForDuration` |
| **Maintenance ring** | Activity is categorized as `maintenance` when workout has >50% mobility-tagged exercises (`inferCategory()`). Feeds purple ring. | — | Indirect — content-based inference |

**Important:** The "rest day" workout is **not** cooldown-only. The doc comment says "targets exerciseRole:'cooldown'" but the implementation uses the **same exercise pool** with difficulty 1 → level -1 (easier) exercises. `appendCooldownExercises` adds 2–3 cooldown exercises to **every** workout (including rest day). There is no pre-filter that restricts the pool to `exerciseRole === 'cooldown'` for rest days.

**Summary:** Recovery/Maintenance are triggered **on Rest Days** via `isScheduledRestDay` (schedule-driven). There is no duration-based fallback that says "if user has only 10 min and it's not a rest day, offer maintenance instead." The short-duration path just reduces exercise count; it does not switch to mobility-only.

---

## 3. Late-Night / Office Context

### How isLateNightPivot Changes Exercise Selection

**Location:** `src/features/user/scheduling/utils/dateUtils.ts`

```ts
export function isLateNightPivot(trainingTime: string | undefined): boolean {
  if (!trainingTime) return false;
  const now = new Date();
  return now.getHours() >= 20;  // 8 PM
}
```

**Flow (StatsOverview.tsx):**
1. `isTargetToday && isLateNightPivot(profile.lifestyle?.trainingTime)` → `condensedTime = 15`
2. `generateHomeWorkout({ ..., availableTime: condensedTime })` with 15 min
3. `WorkoutGenerator.getExerciseCountForDuration(15)` → `DURATION_SCALING['15']`: **4–5 exercises, no accessories**
4. `selectExercises` with `includeAccessories: false` → **strictly compounds + skills** (no isolation/accessory)
5. Shorter workout, compound-focused

**Effect:** Late-night does **not** change exercise *type* (e.g. no switch to mobility). It only:
- Reduces `availableTime` to 15 min
- Caps exercise count to 4–5
- Excludes accessories (isolation work)

### Office / Work Location in ContextualEngine

**Location:** `src/features/workout-engine/logic/ContextualEngine.ts`

| Location | Constraints |
|----------|-------------|
| `office` | `sweatLimit: 1`, `noiseLimit: 1`, `methodPriority: 3` (office methods preferred) |
| `library` | Same as office |
| `school` | Same as office |
| `airport` | Same as office |

**Effect:** When `context.location === 'office'`:
- Exercises with `sweatLevel > 1` are **excluded**
- Exercises with `noiseLevel > 1` are **excluded**
- Execution method selection prefers methods tagged for office (via `locationMapping` / `location`)

**Intent modes:**
- `on_the_way`: Sweat limit 1, max duration cap (`ON_THE_WAY_MAX_DURATION`), "Quick workout before work"
- `field`: `passesFieldMode(exercise)` → `fieldReady === true`, no equipment

**No Office-specific pivot:** There is no `isOfficePivot` equivalent to `isLateNightPivot`. Office is handled purely by `LOCATION_CONSTRAINTS.office` (sweat/noise limits). The Fragmenter would split Office (Part A) vs Home (Part B), but Fragmenter is not wired into the home-workout flow.

---

## 4. The Queue Authority

### Vibe Override: AdjustWorkoutModal

**Flow:**
1. User sees recommended workout (from `generateHomeWorkout` with `scheduledProgramIds`, `targetDate`, etc.)
2. User opens AdjustWorkoutModal ("התאם") and changes: location, intentMode, availableTime, difficulty, shadow matrix, etc.
3. User clicks "Save & Apply" → `onSave(previewWorkout)` → `handleSaveAdjustedWorkout`
4. `setDynamicWorkout(workout)` — the adjusted workout replaces the recommended one in state
5. User starts workout → `active_workout_data` in sessionStorage contains the **adjusted** workout

### How Does ProgressionManager Log This?

**Completion flow (`active/page.tsx`):**
1. `processWorkoutCompletion({ userId, activeProgramId: userProgression.programId, exercises, ... })`
2. `activeProgramId` = `prog?.activePrograms?.[0]?.id` (from user profile) — **not** from the workout
3. The workout plan (`WorkoutPlan`) does **not** carry `scheduledProgramIds` or "which scheduled workout this was"
4. Progression credits the user's **first active program** (`activePrograms[0]`), regardless of workout content

**Does it count as completing the scheduled workout?**
- **Yes** — in the sense that `processWorkoutCompletion` runs and updates progression for `activeProgramId`
- **No distinction** — the system does not compare "what was scheduled" vs "what was done"
- The **scheduled** workout (from `getScheduleEntry` + `scheduledProgramIds`) is only used at **generation** time. Once the user overrides via AdjustWorkoutModal, the new workout has no link back to the schedule

**Does the scheduled workout stay in the queue?**
- There is **no queue** in the codebase. TRAINING_LOGIC Rule #5 mentions "The Queue" (workouts don't expire, miss Tuesday → do Tuesday on Wednesday), but it is **not implemented**
- `UserSchedule` stores `{ date, type: 'training'|'rest', programIds }` per day — it's a calendar, not a queue
- When the user completes a workout (any workout), there is no logic that marks "scheduled workout X as done" or "removes it from queue"
- The schedule entry for that date is **not** updated on completion (no "completedProgramIds" or "workoutCompleted" flag)

**Summary:** A Vibe Override (e.g. 20 min Abs/Back instead of recommended Push session) is logged as a normal workout completion. Progression credits `activePrograms[0]`. The scheduled workout is **not** marked complete, and there is **no queue** to retain or advance. The system cannot distinguish "did scheduled Push" vs "did custom Abs/Back" for queue authority.

---

## 5. Recommendations for Layer 2 & 3

| Area | Current State | Recommendation |
|------|---------------|----------------|
| **Fragmenter** | Not integrated; no remaining-fragment persistence | Wire Fragmenter into home-workout when `location === 'office'` or `timeAvailable < threshold`; persist Part A/B completion and "offer Part B" next session |
| **Recovery on Rest Day** | Difficulty 1 + level -1; not cooldown-only | Add `exerciseRole` filter when `isScheduledRestDay`: restrict pool to `cooldown` + `warmup` + `mobility` before generation |
| **Maintenance fallback** | No duration-based "offer maintenance" | Add rule: when `availableTime < 15` and not rest day → optional "Quick maintenance?" with mobility-only workout |
| **Office pivot** | Location constraints only | Add `isOfficePivot`-style condensed flow (e.g. 15 min, sweat 1) similar to late-night |
| **Queue Authority** | No queue; no scheduled vs completed tracking | Add `scheduledWorkoutId` / `scheduledProgramIds` to workout metadata; on completion, mark schedule entry and support "scheduled vs vibe override" for queue advancement |

---

*End of Technical Breakdown*
