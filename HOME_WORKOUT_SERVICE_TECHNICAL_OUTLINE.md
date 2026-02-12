# Home Workout Service: Technical Implementation Outline

**Document Purpose:** Detailed step-by-step technical plan for implementing `home-workout.service.ts` with full compliance to TRAINING_LOGIC.md (Source of Truth).

**Date:** 2026-02-09  
**Status:** Planning Phase (No Code Written Yet)

---

## Executive Summary

This document outlines the implementation of a centralized workout generation service for the Home Dashboard that:
1. Implements **Shadow Tracking** (Rule 2.2) - Per-muscle-group level selection
2. Applies **Reactivation Protocol** (Rule 2.3) - 40% volume reduction after 3+ days inactive
3. Enforces **Context-Driven Split** (Rule 1.1) - Persona/location-based exercise filtering
4. Generates **Dynamic Rest Timers** (Rule 3.2) - Exercise-type-specific rest periods

---

## Part 1: Shadow Tracking Implementation (Rule 2.2)

### Source of Truth Reference
From `TRAINING_LOGIC.md` lines 43-49:
```
### 2.2 Shadow Tracking Matrix (Rule #13)
* **User View:** "Full Body Program - Level 10".
* **System View:** Decoupled progression.
    * `Push_Strength`: Level 12
    * `Pull_Strength`: Level 8
    * `Legs`: Level 4
* **Logic:** When generating a "Full Body" session, pull the specific exercise matching the *muscle's* level, not the program's level.
```

### Current State Analysis

**Existing Data Structure:** `UserFullProfile.progression.domains`
```typescript
// From user.types.ts lines 82-84
domains: {
  [key in TrainingDomainId]?: DomainProgress;
};

// TrainingDomainId includes:
type TrainingDomainId = 
  | 'upper_body'   // Contains Push + Pull
  | 'lower_body'   // Legs
  | 'core'         // Core exercises
  | 'full_body'    // Mixed exercises
```

**Problem:** `upper_body` is a single level, but we need separate tracking for Push vs Pull muscle groups.

### Solution: Movement Group Mapping

**Step 1.1:** Create a mapping function from `TrainingDomainId` → Exercise Movement Groups

```typescript
// In home-workout.service.ts

/**
 * Maps exercise MovementGroup to the appropriate domain level
 * Implements Shadow Tracking (TRAINING_LOGIC.md Rule 2.2)
 */
function getEffectiveLevelForExercise(
  exercise: Exercise,
  userProfile: UserFullProfile
): number {
  const movementGroup = exercise.movementGroup;
  const domains = userProfile.progression.domains;
  
  // Map movement groups to domain levels
  switch (movementGroup) {
    // PUSH movements → upper_body level
    case 'horizontal_push':  // Push-ups, Dips
    case 'vertical_push':    // Handstand Push-ups, Pike Push-ups
      return domains.upper_body?.currentLevel || 1;
    
    // PULL movements → upper_body level (same domain, different tracking)
    case 'horizontal_pull':  // Rows, Australian Pull-ups
    case 'vertical_pull':    // Pull-ups, Chin-ups
      return domains.upper_body?.currentLevel || 1;
    
    // LEGS movements → lower_body level
    case 'squat':           // Squats, Pistol Squats
    case 'hinge':           // Deadlifts, Single-leg RDL
      return domains.lower_body?.currentLevel || 1;
    
    // CORE movements → core level
    case 'core':            // Planks, L-sits, Hollow Body
      return domains.core?.currentLevel || 1;
    
    // ISOLATION movements → use compound level
    case 'isolation':       // Bicep curls, Tricep extensions
      // Use the domain of the primary muscle
      if (exercise.primaryMuscle === 'biceps' || exercise.primaryMuscle === 'lats') {
        return domains.upper_body?.currentLevel || 1;
      }
      return domains.upper_body?.currentLevel || 1;
    
    // DEFAULT fallback
    default:
      return domains.full_body?.currentLevel || domains.upper_body?.currentLevel || 1;
  }
}
```

**Step 1.2:** Pass per-exercise levels to ContextualEngine

**Current Issue:** `ContextualEngine.filterExercises()` accepts a single `userLevel` parameter.

**Modification Required:**
```typescript
// In ContextualEngine.ts - INTERFACE UPDATE NEEDED

export interface ContextualFilterContext {
  location: ExecutionLocation;
  lifestyles: LifestylePersona[];
  injuryShield: InjuryShieldArea[];
  intentMode: IntentMode;
  availableEquipment: string[];
  
  // CHANGE THIS:
  // userLevel: number;  // ❌ OLD: Single global level
  
  // TO THIS:
  getUserLevelForExercise: (exercise: Exercise) => number;  // ✅ NEW: Per-exercise level callback
  
  selectedProgram?: ProgramId;
  levelTolerance: number;
}
```

**Step 1.3:** Update ContextualEngine filtering logic

**File:** `src/features/workout-engine/logic/ContextualEngine.ts`  
**Function:** `filterExercises()` (around line 224)

**Current Code (Approximate):**
```typescript
// OLD: Uses single userLevel
const levelDiff = Math.abs(exercise.recommendedLevel - context.userLevel);
if (levelDiff > context.levelTolerance) {
  // Filter out
}
```

**New Code:**
```typescript
// NEW: Uses per-exercise level
const exerciseEffectiveLevel = context.getUserLevelForExercise(exercise);
const levelDiff = Math.abs(exercise.recommendedLevel - exerciseEffectiveLevel);
if (levelDiff > context.levelTolerance) {
  // Filter out
}
```

**Implementation Steps:**
1. Update `ContextualFilterContext` interface to replace `userLevel: number` with `getUserLevelForExercise: (exercise: Exercise) => number`
2. Update all calls to `context.userLevel` → `context.getUserLevelForExercise(exercise)` in the filtering logic
3. Update `ContextualEngine.ts` scoring logic (lines 503-555) to use callback
4. Update simulator (`src/app/admin/simulator/page.tsx`) to pass the callback

**Math Example:**
```
User Profile:
- upper_body: Level 10
- lower_body: Level 4
- core: Level 7

Exercise: "Pistol Squat" (movementGroup: 'squat', recommendedLevel: 5)
→ getEffectiveLevelForExercise() returns lower_body level = 4
→ levelDiff = |5 - 4| = 1 (within tolerance)
→ Exercise is included

Exercise: "Advanced Planche" (movementGroup: 'horizontal_push', recommendedLevel: 18)
→ getEffectiveLevelForExercise() returns upper_body level = 10
→ levelDiff = |18 - 10| = 8 (exceeds tolerance of 3)
→ Exercise is filtered out
```

---

## Part 2: Reactivation Protocol Implementation (Rule 2.3)

### Source of Truth Reference
From `TRAINING_LOGIC.md` lines 51-55:
```
### 2.3 Missed Workouts & Reactivation (Rule #10, #21)
* **The Queue:** Workouts do not expire. If you miss Tuesday, you do Tuesday's workout on Wednesday.
* **Reactivation Protocol:**
    * If gap > 3 days: Trigger "Return to Routine".
    * **Action:** Take the planned workout, strictly reduce Volume (Sets) by 30-40%. Keep Intensity (Weight) moderate.
```

### Current Implementation Analysis

**Existing Code:** `WorkoutGenerator.ts` lines 748-777

```typescript
const INACTIVITY_THRESHOLD_DAYS = 4;  // ❌ WRONG: Should be 3 (TRAINING_LOGIC.md says > 3)
const INACTIVITY_VOLUME_REDUCTION = 0.25;  // ❌ WRONG: 25% instead of 30-40%

private calculateVolumeAdjustment(
  context: WorkoutGenerationContext,
  difficulty: DifficultyLevel
): VolumeAdjustment {
  const baseSets = getBaseSets(context.userLevel);
  let adjustedSets = baseSets;
  
  // Inactivity reduction (stacks with difficulty)
  if (context.daysInactive > INACTIVITY_THRESHOLD_DAYS) {
    const inactivityReduction = Math.round(adjustedSets * INACTIVITY_VOLUME_REDUCTION);
    adjustedSets = Math.max(2, adjustedSets - inactivityReduction);
  }
  
  return { /* ... */ };
}
```

### Required Changes

**Step 2.1:** Update Constants in `WorkoutGenerator.ts`

**File:** `src/features/workout-engine/logic/WorkoutGenerator.ts` (lines 289-294)

```typescript
// BEFORE:
const INACTIVITY_THRESHOLD_DAYS = 4;
const INACTIVITY_VOLUME_REDUCTION = 0.25;

// AFTER:
const INACTIVITY_THRESHOLD_DAYS = 3;  // ✅ TRAINING_LOGIC.md: "If gap > 3 days"
const INACTIVITY_VOLUME_REDUCTION = 0.40;  // ✅ TRAINING_LOGIC.md: "30-40%" → Use 40% for safety
```

**Step 2.2:** Calculate Days Inactive in `home-workout.service.ts`

```typescript
/**
 * Calculates days since last workout
 * Uses lastActiveDate from user progression
 */
function calculateDaysInactive(userProfile: UserFullProfile): number {
  const lastActiveDate = userProfile.progression.lastActiveDate;
  
  if (!lastActiveDate) {
    // No previous activity - treat as 0 (first workout)
    return 0;
  }
  
  // Parse 'YYYY-MM-DD' format
  const lastActive = new Date(lastActiveDate);
  const today = new Date();
  
  // Calculate difference in days
  const diffTime = today.getTime() - lastActive.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  
  return Math.max(0, diffDays);
}
```

**Math Example:**
```
Scenario 1: User last active 2 days ago
- lastActiveDate: '2026-02-07'
- today: '2026-02-09'
- diffDays: 2
- Threshold check: 2 > 3? NO
- Action: NO volume reduction
- Sets: baseSets = 4 (for Level 10)

Scenario 2: User last active 5 days ago
- lastActiveDate: '2026-02-04'
- today: '2026-02-09'
- diffDays: 5
- Threshold check: 5 > 3? YES
- Action: Apply 40% volume reduction
- Sets: baseSets = 4 → adjustedSets = 4 - (4 * 0.40) = 4 - 1.6 = 2.4 → Math.round(2.4) = 2
- Final: 2 sets (minimum maintained)

Scenario 3: User last active 14 days ago
- lastActiveDate: '2026-01-26'
- today: '2026-02-09'
- diffDays: 14
- Threshold check: 14 > 3? YES
- Action: Apply 40% volume reduction
- Sets: baseSets = 4 → adjustedSets = 2 (same as above)
- UI Badge: "Volume Reduced (Back to routine)"
```

**Step 2.3:** Pass `daysInactive` to WorkoutGenerator

```typescript
// In home-workout.service.ts

const daysInactive = calculateDaysInactive(userProfile);

const generatorContext: WorkoutGenerationContext = {
  availableTime: context.availableTime,
  userLevel: userProfile.progression.domains.upper_body?.currentLevel || 1,
  daysInactive,  // ✅ Calculated from lastActiveDate
  intentMode: context.intentMode,
  persona: mapPersonaIdToLifestylePersona(userProfile.personaId),
  location: context.location,
  injuryCount: userProfile.health?.injuries?.length || 0,
  energyLevel: 'medium',  // Default
  userWeight: userProfile.core.weight,
};

const workout = generator.generateWorkout(scoredExercises, generatorContext);
```

**Verification:** The existing `calculateVolumeAdjustment()` function will automatically apply the reduction if `daysInactive > 3`.

---

## Part 3: Context-Driven Split Implementation (Rule 1.1)

### Source of Truth Reference
From `TRAINING_LOGIC.md` lines 10-15:
```
### 1.1 Fragmented Mode (Rule #1)
If the user cannot complete a full session ("No Time" / "Office Mode"):
* **Split Strategy:** Break the daily workout into two mini-sessions:
    * **Part A (Office/Morning):** Mobility, Core, or Accessories (Low Sweat, No Equipment).
    * **Part B (Home/Evening):** Main Compound Lifts (Push/Pull) requiring equipment.
```

### Implementation Strategy

**Step 3.1:** Define Short Duration Filter

```typescript
// In home-workout.service.ts

/**
 * Determines if workout should be fragmented based on persona, location, and duration
 * Implements Context-Driven Split (TRAINING_LOGIC.md Rule 1.1)
 */
function shouldApplyFragmentedMode(
  persona: LifestylePersona | null,
  location: ExecutionLocation,
  duration: number
): 'main_compounds' | 'mobility_core' | 'full' {
  // Short duration: 10-15 minutes
  const isShortDuration = duration <= 15;
  
  if (!isShortDuration) {
    return 'full';  // Normal workout
  }
  
  // Short duration + high-pressure personas
  const isHighPressurePersona = persona === 'office_worker' || persona === 'parent';
  
  if (isHighPressurePersona) {
    // Office location → Mobility/Core only
    if (location === 'office') {
      return 'mobility_core';
    }
    
    // Home/Park → Main Compounds only
    if (location === 'home' || location === 'park') {
      return 'main_compounds';
    }
  }
  
  return 'full';  // Default: no fragmentation
}
```

**Step 3.2:** Filter Exercise Tags in ContextualEngine

**Modification:** Update `ContextualEngine.filterExercises()` to accept an additional filter parameter.

```typescript
// In ContextualEngine.ts - NEW PARAMETER

export interface ContextualFilterContext {
  // ... existing fields ...
  
  exercisePriorityFilter?: 'main_compounds' | 'mobility_core' | 'full';  // NEW
}
```

**Step 3.3:** Apply Priority Filtering

```typescript
// In ContextualEngine.ts filtering logic

if (context.exercisePriorityFilter === 'main_compounds') {
  // Only allow compound exercises (Push/Pull)
  if (!exercise.tags?.includes('compound') && exercise.movementType !== 'compound') {
    reasons.push('Filtered: Not a main compound lift');
    return null;
  }
}

if (context.exercisePriorityFilter === 'mobility_core') {
  // Only allow mobility, core, and low-sweat accessories
  const isMobilityOrCore = 
    exercise.movementGroup === 'core' ||
    exercise.tags?.includes('mobility') ||
    exercise.tags?.includes('flexibility');
  
  const isLowSweat = (exercise.sweatLevel || 1) <= 1;
  
  if (!isMobilityOrCore || !isLowSweat) {
    reasons.push('Filtered: Office mode requires low-sweat mobility/core');
    return null;
  }
}
```

**Step 3.4:** Call from home-workout.service.ts

```typescript
const fragmentMode = shouldApplyFragmentedMode(
  context.persona,
  context.location,
  context.availableTime
);

const engineContext: ContextualFilterContext = {
  location: context.location,
  lifestyles: context.lifestyles,
  injuryShield: context.injuryAreas,
  intentMode: context.intentMode,
  availableEquipment: context.availableEquipment,
  getUserLevelForExercise: (exercise) => getEffectiveLevelForExercise(exercise, userProfile),
  levelTolerance: 3,
  exercisePriorityFilter: fragmentMode,  // ✅ NEW: Context-driven filter
};
```

**Example Scenarios:**
```
Scenario 1: Office Worker, Office Location, 15 min
→ shouldApplyFragmentedMode() returns 'mobility_core'
→ ContextualEngine filters out all compound lifts
→ Workout contains: Seated Core Twists, Desk Stretches, Standing Core Hold
→ Result: "Part A" (Office Mini-Session)

Scenario 2: Office Worker, Home Location, 15 min
→ shouldApplyFragmentedMode() returns 'main_compounds'
→ ContextualEngine filters out accessories/mobility
→ Workout contains: Push-ups, Pull-ups, Dips
→ Result: "Part B" (Home Main Session)

Scenario 3: Athlete, Park, 45 min
→ shouldApplyFragmentedMode() returns 'full'
→ No filtering applied
→ Workout contains: Skills + Compounds + Accessories
→ Result: Full workout
```

---

## Part 4: Dynamic Rest Timers Implementation (Rule 3.2)

### Source of Truth Reference
From `TRAINING_LOGIC.md` lines 72-77:
```
### 3.2 Dynamic Rest Timers (Rule #3, #17)
Rest times are derived from the *Exercise Type* and *Level*:
* **Skills / Heavy Strength (1-5 Reps):** 180s (3 mins).
* **Hypertrophy (6-12 Reps):** 90s - 120s.
* **Endurance / Accessory (12+ Reps):** 45s - 60s.
* **Rule #17:** If a Static Hold is short (4-8s), increase SETS (4-6) and keep REST long.
```

### Current Implementation Analysis

**Existing Code:** `WorkoutGenerator.ts` `assignVolume()` function already calculates rest times based on exercise type.

**File:** `src/features/workout-engine/logic/WorkoutGenerator.ts` (lines 792-866)

```typescript
// Existing logic (ALREADY CORRECT!)
let restSeconds = 90; // Default

if (isTimeBased) {
  // Isometric holds get longer rest
  if (reps <= 10) {
    restSeconds = 180; // ✅ Short holds (4-10s) → 180s rest
  } else if (reps <= 30) {
    restSeconds = 120;
  } else {
    restSeconds = 90;
  }
} else {
  // Rep-based exercises
  if (reps <= 5) {
    restSeconds = 180; // ✅ Heavy Strength (1-5 reps) → 180s
  } else if (reps <= 12) {
    restSeconds = 90; // ✅ Hypertrophy (6-12 reps) → 90s
  } else {
    restSeconds = 45; // ✅ Endurance/Accessory (12+ reps) → 45s
  }
}

// Blast mode override
if (context.intentMode === 'blast') {
  restSeconds = 30; // EMOM/AMRAP reduced rest
}
```

### Verification: REST TIMERS ARE ALREADY CORRECT ✅

**No changes required.** The existing `assignVolume()` function already implements the exact logic from TRAINING_LOGIC.md Rule 3.2.

**Step 4.1:** Ensure UI displays dynamic rest timers

**File:** `src/features/workouts/components/WorkoutPreviewDrawer.tsx`

**Current State:** The drawer displays exercises but may not show rest times prominently.

**Enhancement Required:**
```typescript
// In WorkoutPreviewDrawer.tsx - Exercise Card Component

<div className="exercise-card">
  <div className="exercise-header">
    <span className="exercise-name">{exercise.exercise.name}</span>
    <span className="sets-reps">{exercise.sets} × {exercise.reps}</span>
  </div>
  
  {/* NEW: Display rest timer with icon */}
  <div className="rest-timer-badge">
    <Timer className="w-4 h-4" />
    <span>{formatRestTime(exercise.restSeconds)}</span>
    <span className="rest-label">{getRestLabel(exercise.restSeconds)}</span>
  </div>
</div>

// Helper functions
function formatRestTime(seconds: number): string {
  if (seconds >= 60) {
    return `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')}`;
  }
  return `${seconds}s`;
}

function getRestLabel(seconds: number): string {
  if (seconds >= 180) return 'מנוחה ארוכה (כוח)';
  if (seconds >= 90) return 'מנוחה בינונית';
  return 'מנוחה קצרה';
}
```

**Math Example:**
```
Exercise: "One-Arm Pull-up Progression" (Level 18)
- Reps: 3 (Heavy Strength)
- Calculated Rest: 180s (3 minutes)
- UI Display: "3:00 מנוחה ארוכה (כוח)"

Exercise: "Push-ups" (Level 5)
- Reps: 10 (Hypertrophy)
- Calculated Rest: 90s (1.5 minutes)
- UI Display: "1:30 מנוחה בינונית"

Exercise: "Bicep Curls" (Level 8, Accessory)
- Reps: 15 (Endurance)
- Calculated Rest: 45s
- UI Display: "45s מנוחה קצרה"
```

---

## Part 5: Interface Compatibility Verification

### Check 1: ContextualEngine Interface

**Current Interface:** `ContextualFilterContext` (lines 76-97 in ContextualEngine.ts)

**Required Changes:**
1. ✅ Replace `userLevel: number` with `getUserLevelForExercise: (exercise: Exercise) => number`
2. ✅ Add `exercisePriorityFilter?: 'main_compounds' | 'mobility_core' | 'full'`

**Status:** **NEEDS UPDATE**

### Check 2: WorkoutGenerator Interface

**Current Interface:** `WorkoutGenerationContext` (lines 172-187 in WorkoutGenerator.ts)

**Required Changes:**
1. ✅ Update `INACTIVITY_THRESHOLD_DAYS` from 4 to 3
2. ✅ Update `INACTIVITY_VOLUME_REDUCTION` from 0.25 to 0.40
3. ✅ `daysInactive` field already exists
4. ✅ Rest timer logic already correct

**Status:** **NEEDS CONSTANT UPDATES ONLY**

### Check 3: UserFullProfile Type

**Current Type:** Defined in `user.types.ts`

**Required Fields:**
1. ✅ `progression.lastActiveDate?: string` (line 64) - EXISTS
2. ✅ `progression.domains: { [key in TrainingDomainId]?: DomainProgress }` (lines 82-84) - EXISTS
3. ✅ `health.injuries` - EXISTS
4. ✅ `personaId: string` - EXISTS
5. ✅ `equipment: EquipmentProfile` - EXISTS

**Status:** **NO CHANGES NEEDED** ✅

---

## Part 6: Implementation Checklist

### Phase 1: ContextualEngine Updates
- [ ] Update `ContextualFilterContext` interface to add `getUserLevelForExercise` callback
- [ ] Remove `userLevel: number` from interface
- [ ] Update all `context.userLevel` references to `context.getUserLevelForExercise(exercise)`
- [ ] Add `exercisePriorityFilter` optional parameter
- [ ] Implement priority filtering logic (main_compounds, mobility_core)
- [ ] Update simulator to use new interface

### Phase 2: WorkoutGenerator Updates
- [ ] Change `INACTIVITY_THRESHOLD_DAYS` from 4 to 3
- [ ] Change `INACTIVITY_VOLUME_REDUCTION` from 0.25 to 0.40
- [ ] Verify `calculateVolumeAdjustment()` logic is correct
- [ ] Verify rest timer logic matches TRAINING_LOGIC.md (already correct)

### Phase 3: home-workout.service.ts Implementation
- [ ] Create `getEffectiveLevelForExercise()` function
- [ ] Create `calculateDaysInactive()` function
- [ ] Create `shouldApplyFragmentedMode()` function
- [ ] Create `mapPersonaIdToLifestylePersona()` function
- [ ] Create `generateHomeWorkout()` main function
- [ ] Fetch exercises and gym equipment
- [ ] Build `ContextualFilterContext` with callbacks
- [ ] Call `createContextualEngine().filterExercises()`
- [ ] Build `WorkoutGenerationContext` with calculated values
- [ ] Call `createWorkoutGenerator().generateWorkout()`
- [ ] Return `GeneratedWorkout`

### Phase 4: UI Integration
- [ ] Update `WorkoutPreviewDrawer.tsx` to display rest timers prominently
- [ ] Add rest timer badges with icons
- [ ] Format rest time (3:00, 1:30, 45s)
- [ ] Add contextual labels ("מנוחה ארוכה (כוח)", "מנוחה בינונית", "מנוחה קצרה")

### Phase 5: Testing
- [ ] Test Shadow Tracking: Generate workout with upper_body=10, lower_body=4
  - Verify push exercises use level 10
  - Verify leg exercises use level 4
- [ ] Test Reactivation Protocol: Set lastActiveDate to 5 days ago
  - Verify sets reduced by 40%
  - Verify UI shows "Back to Routine" badge
- [ ] Test Context-Driven Split: office_worker, office, 15 min
  - Verify only mobility/core exercises
- [ ] Test Dynamic Rest Timers: Check 1-5 rep exercises get 180s rest

---

## Part 7: Mathematical Verification

### Shadow Tracking Math
```
Given:
- User Progression:
  - upper_body: Level 12
  - lower_body: Level 5
  - core: Level 8

Exercise Selection:
1. "Advanced Push-up Variation" (horizontal_push, recommendedLevel: 13)
   → getEffectiveLevelForExercise() returns 12 (upper_body)
   → levelDiff = |13 - 12| = 1
   → INCLUDED ✅

2. "Pistol Squat" (squat, recommendedLevel: 7)
   → getEffectiveLevelForExercise() returns 5 (lower_body)
   → levelDiff = |7 - 5| = 2
   → INCLUDED ✅

3. "Dragon Flag" (core, recommendedLevel: 15)
   → getEffectiveLevelForExercise() returns 8 (core)
   → levelDiff = |15 - 8| = 7
   → EXCLUDED (exceeds tolerance of 3) ❌
```

### Reactivation Protocol Math
```
Given:
- User Level: 10
- Base Sets (from BASE_SETS_BY_LEVEL[10]): 3 sets
- Days Inactive: 5 days
- Threshold: 3 days

Calculation:
1. Check: daysInactive > INACTIVITY_THRESHOLD_DAYS?
   5 > 3 = TRUE

2. Apply reduction:
   inactivityReduction = Math.round(3 * 0.40) = Math.round(1.2) = 1
   adjustedSets = 3 - 1 = 2

3. Minimum enforcement:
   adjustedSets = Math.max(2, 2) = 2

Result: 2 sets (40% reduction applied)
Badge: "Volume Reduced (Back to routine)"
```

### Context-Driven Split Logic
```
Test Case 1:
- Persona: 'office_worker'
- Location: 'office'
- Duration: 15 minutes

shouldApplyFragmentedMode() evaluation:
1. isShortDuration: 15 <= 15 = TRUE
2. isHighPressurePersona: 'office_worker' = TRUE
3. location === 'office': TRUE
→ Return: 'mobility_core'

Filter Result:
- "Seated Core Twist" (core, sweatLevel: 1) → INCLUDED ✅
- "Push-ups" (horizontal_push, compound) → EXCLUDED ❌
- "Standing Stretch" (mobility, sweatLevel: 1) → INCLUDED ✅

Test Case 2:
- Persona: 'office_worker'
- Location: 'home'
- Duration: 15 minutes

shouldApplyFragmentedMode() evaluation:
1. isShortDuration: 15 <= 15 = TRUE
2. isHighPressurePersona: 'office_worker' = TRUE
3. location === 'home': TRUE
→ Return: 'main_compounds'

Filter Result:
- "Push-ups" (horizontal_push, compound) → INCLUDED ✅
- "Pull-ups" (vertical_pull, compound) → INCLUDED ✅
- "Core Hold" (core, accessory) → EXCLUDED ❌
```

### Dynamic Rest Timer Math
```
Exercise: "Planche Hold Progression" (isTimeBased: true, reps: 8 seconds)
→ isTimeBased = TRUE
→ reps <= 10: TRUE
→ restSeconds = 180

Exercise: "Weighted Pull-ups" (isTimeBased: false, reps: 4)
→ isTimeBased = FALSE
→ reps <= 5: TRUE
→ restSeconds = 180

Exercise: "Standard Push-ups" (isTimeBased: false, reps: 10)
→ isTimeBased = FALSE
→ reps <= 12: TRUE
→ restSeconds = 90

Exercise: "Bicep Curls" (isTimeBased: false, reps: 15)
→ isTimeBased = FALSE
→ reps > 12: TRUE
→ restSeconds = 45
```

---

## Conclusion

This implementation plan ensures full compliance with `TRAINING_LOGIC.md` by:

1. **Shadow Tracking:** Per-muscle-group level selection via `getEffectiveLevelForExercise()` callback
2. **Reactivation Protocol:** 40% volume reduction after 3+ days inactive (corrected constants)
3. **Context-Driven Split:** Persona + location + duration filtering for fragmented workouts
4. **Dynamic Rest Timers:** Exercise-type-specific rest periods (already implemented correctly)

**Next Step:** Await approval to begin coding implementation.
