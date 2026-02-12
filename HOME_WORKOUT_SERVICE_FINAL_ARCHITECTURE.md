# Home Workout Service: Final Technical Architecture
## Step-by-Step Implementation Plan (NO CODE YET)

**Document Purpose:** Complete technical blueprint for implementing the Professional Workout Generation Service with Full Shadow Matrix and QA Control Room capabilities.

**Status:** 🔴 **ARCHITECTURE REVIEW - AWAITING APPROVAL TO CODE**

**Date:** 2026-02-09

---

## 🎯 Executive Summary

This document provides a **complete technical blueprint** for implementing:

1. **home-workout.service.ts** - Centralized workout generation service
2. **AdjustWorkoutModal.tsx** - Full QA Control Room with Shadow Matrix
3. **UI Integration** - StatsOverview, HeroWorkoutCard, WorkoutPreviewDrawer
4. **Processing Animation** - 2-second transition after regeneration

**Key Principle:** Show the WHAT and HOW, not the actual code.

---

## 📐 Part 1: Shadow Matrix Architecture

### 1.1 Shadow Matrix Structure

The Shadow Matrix allows **per-muscle and per-movement level overrides** for testing the workout engine.

**Data Structure:**
```
Shadow Matrix = {
  // Movement Groups (from Exercise.movementGroup)
  movementGroups: {
    'horizontal_push': { level: number (1-20), override: boolean },
    'vertical_push': { level: number (1-20), override: boolean },
    'horizontal_pull': { level: number (1-20), override: boolean },
    'vertical_pull': { level: number (1-20), override: boolean },
    'squat': { level: number (1-20), override: boolean },
    'hinge': { level: number (1-20), override: boolean },
    'core': { level: number (1-20), override: boolean },
    'isolation': { level: number (1-20), override: boolean },
  },
  
  // Muscle Groups (from Exercise.primaryMuscle)
  muscleGroups: {
    'chest': { level: number (1-20), override: boolean },
    'back': { level: number (1-20), override: boolean },
    'shoulders': { level: number (1-20), override: boolean },
    'biceps': { level: number (1-20), override: boolean },
    'triceps': { level: number (1-20), override: boolean },
    'lats': { level: number (1-20), override: boolean },
    'quads': { level: number (1-20), override: boolean },
    'hamstrings': { level: number (1-20), override: boolean },
    'glutes': { level: number (1-20), override: boolean },
    'calves': { level: number (1-20), override: boolean },
    'abs': { level: number (1-20), override: boolean },
    'obliques': { level: number (1-20), override: boolean },
    'forearms': { level: number (1-20), override: boolean },
  },
  
  // Global Override
  useGlobalLevel: boolean,  // If true, use single level for all
  globalLevel: number (1-20),
}
```

**Priority Logic:**
```
1. If shadowMatrix.useGlobalLevel === true:
   → Return shadowMatrix.globalLevel
   
2. Else if shadowMatrix.movementGroups[exercise.movementGroup].override === true:
   → Return shadowMatrix.movementGroups[exercise.movementGroup].level
   
3. Else if shadowMatrix.muscleGroups[exercise.primaryMuscle].override === true:
   → Return shadowMatrix.muscleGroups[exercise.primaryMuscle].level
   
4. Else:
   → Fallback to userProfile.progression.domains (normal Shadow Tracking)
```

### 1.2 Smart Mapping Function

**Function Name:** `getEffectiveLevelForExercise()`

**Location:** `src/features/workout-engine/services/home-workout.service.ts`

**Input:**
- `exercise: Exercise` - The exercise to map
- `userProfile: UserFullProfile` - User's real progression
- `shadowMatrix?: ShadowMatrix` - Optional test overrides (from modal)

**Output:**
- `number` - Effective level (1-20)

**Logic Flow:**
```
Step 1: Check if shadowMatrix is provided
  ├─ If shadowMatrix.useGlobalLevel === true
  │  └─ Return shadowMatrix.globalLevel
  │
  └─ Else continue to Step 2

Step 2: Check movementGroup override
  ├─ Get exercise.movementGroup
  ├─ If shadowMatrix.movementGroups[movementGroup].override === true
  │  └─ Return shadowMatrix.movementGroups[movementGroup].level
  │
  └─ Else continue to Step 3

Step 3: Check primaryMuscle override
  ├─ Get exercise.primaryMuscle
  ├─ If shadowMatrix.muscleGroups[primaryMuscle].override === true
  │  └─ Return shadowMatrix.muscleGroups[primaryMuscle].level
  │
  └─ Else continue to Step 4

Step 4: Normal Shadow Tracking (from TRAINING_LOGIC.md)
  ├─ Map exercise.movementGroup to domain:
  │  ├─ 'horizontal_push' | 'vertical_push' → userProfile.progression.domains.upper_body
  │  ├─ 'horizontal_pull' | 'vertical_pull' → userProfile.progression.domains.upper_body
  │  ├─ 'squat' | 'hinge' → userProfile.progression.domains.lower_body
  │  ├─ 'core' → userProfile.progression.domains.core
  │  └─ 'isolation' → map via primaryMuscle to appropriate domain
  │
  └─ Return domain.currentLevel

Step 5: Fallback
  └─ Return userProfile.progression.domains.full_body?.currentLevel || 1
```

**Pseudocode:**
```
function getEffectiveLevelForExercise(exercise, userProfile, shadowMatrix?) {
  // Step 1: Global override
  if (shadowMatrix?.useGlobalLevel) {
    return shadowMatrix.globalLevel;
  }
  
  // Step 2: Movement group override
  const movementGroup = exercise.movementGroup;
  if (shadowMatrix?.movementGroups[movementGroup]?.override) {
    return shadowMatrix.movementGroups[movementGroup].level;
  }
  
  // Step 3: Muscle group override
  const primaryMuscle = exercise.primaryMuscle;
  if (shadowMatrix?.muscleGroups[primaryMuscle]?.override) {
    return shadowMatrix.muscleGroups[primaryMuscle].level;
  }
  
  // Step 4: Normal Shadow Tracking
  return mapMovementGroupToDomainLevel(exercise, userProfile);
}

function mapMovementGroupToDomainLevel(exercise, userProfile) {
  const movementGroup = exercise.movementGroup;
  const domains = userProfile.progression.domains;
  
  switch (movementGroup) {
    case 'horizontal_push':
    case 'vertical_push':
    case 'horizontal_pull':
    case 'vertical_pull':
      return domains.upper_body?.currentLevel || 1;
    
    case 'squat':
    case 'hinge':
      return domains.lower_body?.currentLevel || 1;
    
    case 'core':
      return domains.core?.currentLevel || 1;
    
    case 'isolation':
      return mapIsolationMuscle(exercise.primaryMuscle, domains);
    
    default:
      return domains.full_body?.currentLevel || 1;
  }
}

function mapIsolationMuscle(primaryMuscle, domains) {
  // Map specific muscles to domains
  const upperBodyMuscles = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'lats', 'forearms'];
  const lowerBodyMuscles = ['quads', 'hamstrings', 'glutes', 'calves'];
  const coreMuscles = ['abs', 'obliques'];
  
  if (upperBodyMuscles.includes(primaryMuscle)) {
    return domains.upper_body?.currentLevel || 1;
  }
  if (lowerBodyMuscles.includes(primaryMuscle)) {
    return domains.lower_body?.currentLevel || 1;
  }
  if (coreMuscles.includes(primaryMuscle)) {
    return domains.core?.currentLevel || 1;
  }
  
  return domains.full_body?.currentLevel || 1;
}
```

**Example Execution:**
```
Exercise: "Advanced Push-up Variation"
- movementGroup: 'horizontal_push'
- primaryMuscle: 'chest'

User Profile:
- domains.upper_body.currentLevel = 12
- domains.lower_body.currentLevel = 5

Scenario 1: No Shadow Matrix (Normal)
→ getEffectiveLevelForExercise() returns 12 (from upper_body domain)

Scenario 2: Shadow Matrix with Global Override
- shadowMatrix.useGlobalLevel = true
- shadowMatrix.globalLevel = 8
→ getEffectiveLevelForExercise() returns 8 (global override)

Scenario 3: Shadow Matrix with Movement Group Override
- shadowMatrix.useGlobalLevel = false
- shadowMatrix.movementGroups['horizontal_push'].override = true
- shadowMatrix.movementGroups['horizontal_push'].level = 15
→ getEffectiveLevelForExercise() returns 15 (movement group override)

Scenario 4: Shadow Matrix with Muscle Group Override
- shadowMatrix.useGlobalLevel = false
- shadowMatrix.movementGroups['horizontal_push'].override = false
- shadowMatrix.muscleGroups['chest'].override = true
- shadowMatrix.muscleGroups['chest'].level = 10
→ getEffectiveLevelForExercise() returns 10 (muscle group override)
```

---

## 🎮 Part 2: AdjustWorkoutModal - QA Control Room

### 2.1 Component Purpose

The AdjustWorkoutModal is a **comprehensive testing dashboard** that allows QA and developers to:
- Test every possible workout generation scenario
- Override Shadow Matrix levels for specific muscle/movement groups
- Verify engine logic with edge cases
- Regenerate workouts in real-time

### 2.2 UI Layout Structure

**Modal Size:** Full-screen on mobile, 90vw max-width on desktop

**Layout:** 3-column grid
```
┌─────────────────────────────────────────────────────────────────┐
│  ADJUST WORKOUT MODAL (QA CONTROL ROOM)                    [X] │
├─────────────────┬───────────────────────┬───────────────────────┤
│ LEFT COLUMN     │ MIDDLE COLUMN         │ RIGHT COLUMN          │
│ Context         │ Shadow Matrix         │ Live Preview          │
│ Controls        │ Level Overrides       │                       │
│                 │                       │                       │
│ • Persona       │ Movement Groups:      │ Workout Title         │
│ • Location      │  [Sliders 1-20]       │ Description           │
│ • Intent        │  - Push               │                       │
│ • Duration      │  - Pull               │ Stats Box             │
│ • Injuries      │  - Legs               │ • Duration            │
│ • Equipment     │  - Core               │ • Calories            │
│                 │  - Skills             │ • Difficulty          │
│ Difficulty:     │                       │                       │
│  ⚡⚡⚡          │ Muscle Groups:        │ SA:BA Balance         │
│                 │  [Sliders 1-20]       │ 2:5 ✅ Balanced       │
│ Days Inactive:  │  - Chest              │                       │
│  [5 days]       │  - Back               │ Volume Adjustment     │
│                 │  - Shoulders          │ -33% (Back to routine)│
│                 │  - Biceps             │                       │
│ [REGENERATE]    │  - Triceps            │ Exercise List         │
│                 │  - Quads              │ 1. Pull-ups 3×8 90s   │
│                 │  - etc...             │ 2. Push-ups 3×10 90s  │
│                 │                       │ 3. Squats 3×12 90s    │
│                 │ [RESET TO AUTO]       │ 4. Plank 3×30s 120s   │
└─────────────────┴───────────────────────┴───────────────────────┘
```

### 2.3 State Management

**Modal State:**
```typescript
interface ModalState {
  // Context Controls (LEFT COLUMN)
  context: {
    persona: LifestylePersona | null;
    additionalLifestyles: LifestylePersona[];
    location: ExecutionLocation;
    intentMode: IntentMode;
    availableTime: number;
    injuries: InjuryShieldArea[];
    equipmentOverride: string[];
    difficulty: DifficultyLevel;
    daysInactiveOverride: number | null;  // null = use real value
  };
  
  // Shadow Matrix (MIDDLE COLUMN)
  shadowMatrix: {
    useGlobalLevel: boolean;
    globalLevel: number;
    movementGroups: {
      [key in MovementGroup]: { level: number; override: boolean };
    };
    muscleGroups: {
      [key in MuscleGroup]: { level: number; override: boolean };
    };
  };
  
  // Live Preview (RIGHT COLUMN)
  currentWorkout: GeneratedWorkout | null;
  isRegenerating: boolean;
  lastRegeneratedAt: Date | null;
}
```

### 2.4 Shadow Matrix UI Components

**Middle Column Layout:**
```
┌─────────────────────────────────────┐
│ SHADOW MATRIX CONTROLS              │
├─────────────────────────────────────┤
│                                     │
│ ┌─ Global Override ─────────────┐  │
│ │ [ ] Use Single Level for All  │  │
│ │ Level: [====|====] 10          │  │
│ └───────────────────────────────┘  │
│                                     │
│ ┌─ Movement Groups ──────────────┐ │
│ │ Push (horizontal_push)         │ │
│ │ [x] Override  [====|====] 12   │ │
│ │                                │ │
│ │ Push (vertical_push)           │ │
│ │ [ ] Override  [====|====] 10   │ │
│ │                                │ │
│ │ Pull (horizontal_pull)         │ │
│ │ [x] Override  [====|====] 8    │ │
│ │                                │ │
│ │ Pull (vertical_pull)           │ │
│ │ [ ] Override  [====|====] 10   │ │
│ │                                │ │
│ │ Legs (squat)                   │ │
│ │ [x] Override  [====|====] 4    │ │
│ │                                │ │
│ │ Legs (hinge)                   │ │
│ │ [ ] Override  [====|====] 10   │ │
│ │                                │ │
│ │ Core                           │ │
│ │ [x] Override  [====|====] 7    │ │
│ │                                │ │
│ │ Isolation                      │ │
│ │ [ ] Override  [====|====] 10   │ │
│ └────────────────────────────────┘ │
│                                     │
│ ┌─ Muscle Groups ────────────────┐ │
│ │ Chest                          │ │
│ │ [ ] Override  [====|====] 10   │ │
│ │                                │ │
│ │ Back                           │ │
│ │ [x] Override  [====|====] 9    │ │
│ │                                │ │
│ │ Shoulders                      │ │
│ │ [ ] Override  [====|====] 10   │ │
│ │                                │ │
│ │ Biceps                         │ │
│ │ [ ] Override  [====|====] 10   │ │
│ │                                │ │
│ │ ... (all 13 muscle groups)     │ │
│ └────────────────────────────────┘ │
│                                     │
│ [RESET TO AUTO] [COPY CONFIG]      │
└─────────────────────────────────────┘
```

**Slider Component Specs:**
- Range: 1-20
- Step: 1
- Visual: Material-UI style slider with value label
- Color: Cyan/Blue gradient when override enabled, Gray when disabled
- Checkbox: Toggle override on/off

### 2.5 Regeneration Flow

**User Interaction:**
```
1. User opens AdjustWorkoutModal
   ↓
2. Modal loads current workout context
   ↓
3. User adjusts parameters:
   - Changes persona to 'office_worker'
   - Changes location to 'office'
   - Enables movement group override: horizontal_push → Level 15
   - Enables muscle group override: chest → Level 12
   ↓
4. User clicks "REGENERATE" button
   ↓
5. Modal state: isRegenerating = true (show spinner on button)
   ↓
6. Call home-workout.service.generateHomeWorkout() with:
   - context (persona, location, intent, duration, etc.)
   - shadowMatrix (level overrides)
   ↓
7. Service generates workout:
   - Fetches exercises
   - Applies ContextualEngine filters
   - Uses getEffectiveLevelForExercise() with shadowMatrix
   - Applies WorkoutGenerator volume/difficulty logic
   ↓
8. Workout generated: GeneratedWorkout object returned
   ↓
9. Modal updates RIGHT COLUMN (Live Preview) with new workout
   ↓
10. Modal state: isRegenerating = false (hide spinner)
   ↓
11. User reviews workout in Live Preview
    ├─ If satisfied: Click "SAVE & APPLY"
    └─ If not: Adjust parameters again and repeat
```

**SAVE & APPLY Flow:**
```
1. User clicks "SAVE & APPLY" button in modal
   ↓
2. Modal closes with fade-out animation
   ↓
3. Trigger PROCESSING STEP ANIMATION (2 seconds)
   ├─ Full-screen overlay
   ├─ Dark background (bg-[#0F172A])
   ├─ Pulsing loader/rings animation
   ├─ Message: "מעדכן אימון..."
   └─ Duration: exactly 2000ms
   ↓
4. Processing animation completes
   ↓
5. Update StatsOverview state with new workout
   ↓
6. Home Dashboard re-renders with new workout card
   ↓
7. Success toast: "אימון עודכן בהצלחה!" ✅
```

---

## 🎬 Part 3: Processing Animation

### 3.1 Animation Specs

**Component:** `ProcessingOverlay.tsx`

**Location:** `src/features/home/components/ProcessingOverlay.tsx`

**Trigger:** Called after "SAVE & APPLY" in AdjustWorkoutModal

**Visual Design:**
```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│                    [FULL SCREEN OVERLAY]                    │
│                                                             │
│              bg-[#0F172A] with backdrop-blur-md             │
│                                                             │
│                                                             │
│                     ⭕ Pulsing Rings                        │
│                    ⭕⭕ Animation                           │
│                   ⭕⭕⭕ (SVG)                              │
│                                                             │
│                                                             │
│                    מעדכן אימון...                          │
│                   (16px, cyan text)                         │
│                                                             │
│                                                             │
│                   ▰▰▰▰▰▰▰▱▱▱                               │
│                  Progress Bar (80%)                         │
│                                                             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Animation Sequence:**
```
Time 0ms:
  - Overlay mounts with opacity: 0
  - Rings start at scale: 0.8

Time 0-200ms (Fade In):
  - Opacity: 0 → 1 (ease-out)

Time 200-1800ms (Pulsing):
  - Rings pulse: scale 0.95 → 1.05 → 0.95 (continuous)
  - Progress bar fills: 0% → 80% (linear)
  - Text opacity pulses: 0.7 → 1.0 → 0.7

Time 1800-2000ms (Fade Out):
  - Opacity: 1 → 0 (ease-in)

Time 2000ms:
  - Overlay unmounts
  - Trigger onComplete() callback
```

**Pseudocode:**
```
Component: ProcessingOverlay

Props:
  - isVisible: boolean
  - onComplete: () => void

State:
  - progress: number (0-100)

Effects:
  - On mount:
    1. Start progress animation (0 → 80% over 1800ms)
    2. Start ring pulse animation (continuous)
    3. Start text pulse animation (continuous)
    4. After 2000ms total: call onComplete()

JSX Structure:
  <AnimatePresence>
    {isVisible && (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-[#0F172A] backdrop-blur-md"
      >
        {/* Pulsing Rings SVG */}
        <motion.div
          animate={{ scale: [0.95, 1.05, 0.95] }}
          transition={{ repeat: Infinity, duration: 2 }}
        >
          <ConcentricRings />
        </motion.div>
        
        {/* Message */}
        <motion.p
          animate={{ opacity: [0.7, 1.0, 0.7] }}
          transition={{ repeat: Infinity, duration: 1.5 }}
          className="text-cyan-400"
        >
          מעדכן אימון...
        </motion.p>
        
        {/* Progress Bar */}
        <div className="progress-bar">
          <motion.div
            animate={{ width: `${progress}%` }}
            className="progress-fill"
          />
        </div>
      </motion.div>
    )}
  </AnimatePresence>
```

### 3.2 Integration with Modal

**In AdjustWorkoutModal:**
```typescript
State:
  - showProcessing: boolean = false

Function: handleSaveAndApply()
  1. Validate that workout exists
  2. Close modal with animation
  3. Wait 300ms (modal close animation)
  4. Set showProcessing = true
  5. Wait 2000ms (processing animation)
  6. Set showProcessing = false
  7. Call onSave(currentWorkout) prop
  8. Trigger success toast

JSX:
  <>
    {/* Main Modal */}
    <Modal isOpen={isOpen} onClose={onClose}>
      {/* ... modal content ... */}
      <button onClick={handleSaveAndApply}>
        SAVE & APPLY
      </button>
    </Modal>
    
    {/* Processing Overlay */}
    <ProcessingOverlay
      isVisible={showProcessing}
      onComplete={() => {}}
    />
  </>
```

**In StatsOverview (Parent):**
```typescript
State:
  - dynamicWorkout: GeneratedWorkout | null
  - isAdjustModalOpen: boolean = false

Function: handleSaveWorkout(workout: GeneratedWorkout)
  1. Update dynamicWorkout state
  2. Map to HeroWorkoutCard format
  3. Re-render dashboard with new workout

JSX:
  <AdjustWorkoutModal
    isOpen={isAdjustModalOpen}
    onClose={() => setIsAdjustModalOpen(false)}
    currentWorkout={dynamicWorkout}
    userProfile={userProfile}
    onSave={handleSaveWorkout}
  />
```

---

## 🖼️ Part 4: WorkoutPreviewDrawer Simplification

### 4.1 UI Change: Remove Rest Timers

**Current Display (REMOVE):**
```
┌────────────────────────────────────┐
│ Pull-ups                           │
│ 3 × 8 reps                         │
│ Rest: 1:30 (Hypertrophy)      ❌  │  ← REMOVE THIS LINE
└────────────────────────────────────┘
```

**New Display (KEEP ONLY):**
```
┌────────────────────────────────────┐
│ Pull-ups                           │
│ 3 × 8 reps                     ✅  │  ← KEEP ONLY THIS
└────────────────────────────────────┘
```

### 4.2 Display Logic

**For Rep-Based Exercises:**
```
Display Format: "{sets} × {reps} reps"
Example: "3 × 10 reps"
```

**For Time-Based Exercises (Holds):**
```
Display Format: "{sets} × {holdSeconds}s hold"
Example: "3 × 30s hold"
```

**No Rest Timer Display:** Remove all rest time UI elements

### 4.3 Component Update Plan

**File:** `src/features/workouts/components/WorkoutPreviewDrawer.tsx`

**Changes:**
1. Remove all rest timer display code
2. Remove Timer icon imports
3. Remove formatRestTime() helper function
4. Remove getRestLabel() helper function
5. Keep only sets and reps/hold-time display

**Pseudocode:**
```
Component: WorkoutPreviewDrawer

Props:
  - workout: GeneratedWorkout
  - isOpen: boolean
  - onClose: () => void

Render Exercise Card:
  <div className="exercise-card">
    {/* Exercise Name */}
    <h3>{exercise.exercise.name}</h3>
    
    {/* Sets × Reps */}
    <p className="sets-reps">
      {exercise.sets} × {
        exercise.isTimeBased 
          ? `${exercise.reps}s hold` 
          : `${exercise.reps} reps`
      }
    </p>
    
    {/* NO REST TIMER - REMOVED */}
  </div>
```

---

## 🔄 Part 5: Complete Data Flow

### 5.1 Initial Load (Home Dashboard)

```
USER OPENS HOME PAGE
  ↓
1. HomePage.tsx mounts
  ↓
2. Load UserFullProfile from Firestore
   - progression.domains (normal Shadow Tracking)
   - progression.lastActiveDate (for daysInactive)
   - health.injuries (for Injury Shield)
   - equipment.home/office/outdoor (for equipment filtering)
   - personaId (for persona mapping)
  ↓
3. StatsOverview.tsx useEffect triggers
  ↓
4. Call generateHomeWorkout() with default context:
   {
     location: 'home',
     intentMode: 'normal',
     availableTime: 30,
     shadowMatrix: undefined  // No overrides on initial load
   }
  ↓
5. home-workout.service.ts executes:
   a. Fetch exercises from Firestore
   b. Fetch gym equipment from Firestore
   c. calculateDaysInactive() → 5 days
   d. extractInjuryShield() → ['wrist']
   e. Build ContextualFilterContext with getUserLevelForExercise callback
   f. Call ContextualEngine.filterAndScore()
   g. Build WorkoutGenerationContext with daysInactive, injuryCount
   h. Call WorkoutGenerator.generateWorkout()
   i. Return GeneratedWorkout
  ↓
6. StatsOverview sets dynamicWorkout state
  ↓
7. HeroWorkoutCard displays workout
  ↓
HOME DASHBOARD READY ✅
```

### 5.2 User Adjusts Workout (QA Testing)

```
USER CLICKS "התאם אימון" BUTTON
  ↓
1. AdjustWorkoutModal opens
  ↓
2. Modal loads current context:
   - persona: 'parent'
   - location: 'home'
   - intentMode: 'normal'
   - availableTime: 30
   - shadowMatrix: initialized to AUTO (all overrides disabled)
  ↓
3. Modal displays RIGHT COLUMN with current workout
  ↓
USER MAKES CHANGES:
  ├─ Changes location: 'home' → 'office'
  ├─ Enables movement group override: horizontal_push → Level 15
  ├─ Enables muscle group override: chest → Level 12
  └─ Changes duration: 30 → 15 minutes
  ↓
4. User clicks "REGENERATE" button
  ↓
5. Modal state: isRegenerating = true
  ↓
6. Call generateHomeWorkout() with:
   {
     location: 'office',
     intentMode: 'normal',
     availableTime: 15,
     shadowMatrix: {
       useGlobalLevel: false,
       movementGroups: {
         horizontal_push: { level: 15, override: true },
         // ... others disabled
       },
       muscleGroups: {
         chest: { level: 12, override: true },
         // ... others disabled
       }
     }
   }
  ↓
7. home-workout.service.ts executes (same as initial load, but with shadowMatrix):
   - getEffectiveLevelForExercise() now checks shadowMatrix FIRST
   - Exercise "Advanced Push-up" (horizontal_push) → returns 15 (override)
   - Exercise "Chest Fly" (primaryMuscle: chest) → returns 12 (override)
   - Exercise "Squat" (squat) → returns 5 (normal Shadow Tracking)
  ↓
8. New GeneratedWorkout returned
  ↓
9. Modal updates RIGHT COLUMN with new workout
  ↓
10. Modal state: isRegenerating = false
  ↓
USER REVIEWS WORKOUT IN LIVE PREVIEW
  ├─ Sees new title: "אימון משרד קצר"
  ├─ Sees new exercise list (4 exercises, office-friendly)
  ├─ Sees SA:BA balance: 0:4 ✅
  ├─ Sees volume adjustment: -33% (still 5 days inactive)
  └─ Satisfied with results ✅
  ↓
11. User clicks "SAVE & APPLY" button
  ↓
12. Modal closes (300ms fade-out)
  ↓
13. ProcessingOverlay mounts (2000ms animation)
  ↓
14. Processing animation completes
  ↓
15. StatsOverview.handleSaveWorkout(newWorkout) executes:
    - Updates dynamicWorkout state
    - Maps to HeroWorkoutCard format
  ↓
16. Home Dashboard re-renders with new workout
  ↓
17. Success toast: "אימון עודכן בהצלחה!" ✅
  ↓
USER SEES UPDATED WORKOUT ON HOME DASHBOARD ✅
```

### 5.3 Shadow Matrix Priority Example

```
Exercise: "Advanced Push-up Variation"
- movementGroup: 'horizontal_push'
- primaryMuscle: 'chest'
- recommendedLevel: 13

User Profile (Normal):
- domains.upper_body.currentLevel = 10

Shadow Matrix (QA Override):
- useGlobalLevel: false
- movementGroups.horizontal_push: { level: 15, override: true }
- muscleGroups.chest: { level: 12, override: true }

getEffectiveLevelForExercise() Execution:

Step 1: Check useGlobalLevel
  → false, continue

Step 2: Check movementGroups override
  → movementGroups.horizontal_push.override = true
  → Return 15 ✅

Result: Exercise uses Level 15 (movement group override wins)

---

Exercise: "Chest Fly" (Isolation)
- movementGroup: 'isolation'
- primaryMuscle: 'chest'
- recommendedLevel: 8

Shadow Matrix:
- useGlobalLevel: false
- movementGroups.isolation: { level: 10, override: false }  ← DISABLED
- muscleGroups.chest: { level: 12, override: true }  ← ENABLED

getEffectiveLevelForExercise() Execution:

Step 1: Check useGlobalLevel
  → false, continue

Step 2: Check movementGroups override
  → movementGroups.isolation.override = false
  → Not overridden, continue

Step 3: Check muscleGroups override
  → muscleGroups.chest.override = true
  → Return 12 ✅

Result: Exercise uses Level 12 (muscle group override wins)
```

---

## 📁 Part 6: File Structure

### 6.1 New Files to Create

```
src/features/workout-engine/services/
  └─ home-workout.service.ts  (NEW)
     ├─ Types: ShadowMatrix, WorkoutContext, HomeWorkoutOptions
     ├─ Functions:
     │  ├─ generateHomeWorkout()
     │  ├─ getEffectiveLevelForExercise()
     │  ├─ calculateDaysInactive()
     │  ├─ extractInjuryShield()
     │  ├─ mapPersonaIdToLifestylePersona()
     │  └─ fetchParkDataIfNeeded()

src/features/home/components/
  ├─ AdjustWorkoutModal.tsx  (NEW)
  │  ├─ Main modal component
  │  ├─ 3-column layout
  │  ├─ Shadow Matrix controls
  │  └─ Live preview panel
  │
  └─ ProcessingOverlay.tsx  (NEW)
     ├─ Full-screen animation
     ├─ Pulsing rings SVG
     └─ Progress bar

src/features/home/components/
  └─ ShadowMatrixPanel.tsx  (NEW - optional sub-component)
     ├─ Movement group sliders
     ├─ Muscle group sliders
     └─ Reset/Copy buttons
```

### 6.2 Files to Modify

```
src/features/workout-engine/logic/
  └─ ContextualEngine.ts  (MODIFY)
     ├─ Update ContextualFilterContext interface:
     │  ├─ REMOVE: userLevel: number
     │  └─ ADD: getUserLevelForExercise: (exercise: Exercise) => number
     └─ Update scoreExercise() to use callback

src/features/workout-engine/logic/
  └─ WorkoutGenerator.ts  (MODIFY)
     ├─ Update INACTIVITY_THRESHOLD_DAYS: 4 → 3
     └─ Update INACTIVITY_VOLUME_REDUCTION: 0.25 → 0.40

src/features/home/components/
  └─ StatsOverview.tsx  (MODIFY)
     ├─ Remove static heroWorkoutData
     ├─ Add dynamicWorkout state
     ├─ Add useEffect for initial generation
     └─ Add AdjustWorkoutModal integration

src/features/home/components/
  └─ HeroWorkoutCard.tsx  (MODIFY)
     ├─ Add "התאם אימון" button
     └─ Pass onAdjust callback

src/features/workouts/components/
  └─ WorkoutPreviewDrawer.tsx  (MODIFY)
     ├─ Remove rest timer display
     ├─ Remove formatRestTime() function
     ├─ Remove getRestLabel() function
     └─ Keep only sets/reps display
```

---

## 🧪 Part 7: Testing Scenarios

### 7.1 Shadow Matrix Testing

**Test 1: Global Override**
```
Setup:
- shadowMatrix.useGlobalLevel = true
- shadowMatrix.globalLevel = 5

Expected:
- All exercises use Level 5
- Push exercises (normally Level 12) → Level 5
- Leg exercises (normally Level 4) → Level 5
- Core exercises (normally Level 8) → Level 5

Verification:
- Check ContextualEngine.filterAndScore() result
- Verify all exercises have levelDiff calculated from Level 5
```

**Test 2: Movement Group Override**
```
Setup:
- shadowMatrix.useGlobalLevel = false
- shadowMatrix.movementGroups.horizontal_push = { level: 18, override: true }
- shadowMatrix.movementGroups.squat = { level: 2, override: true }

Expected:
- Push exercises use Level 18
- Leg exercises use Level 2
- Other exercises use normal Shadow Tracking

Verification:
- Exercise "Push-ups" (horizontal_push) → Level 18
- Exercise "Squats" (squat) → Level 2
- Exercise "Pull-ups" (horizontal_pull, not overridden) → Level 10 (from domains.upper_body)
```

**Test 3: Muscle Group Override**
```
Setup:
- shadowMatrix.useGlobalLevel = false
- shadowMatrix.movementGroups.isolation = { level: 10, override: false }
- shadowMatrix.muscleGroups.biceps = { level: 15, override: true }

Expected:
- Isolation exercise "Bicep Curls" (primaryMuscle: biceps) → Level 15
- Isolation exercise "Tricep Extensions" (primaryMuscle: triceps) → normal tracking

Verification:
- Check getEffectiveLevelForExercise() return value
```

### 7.2 Reactivation Protocol Testing

**Test 4: Days Inactive = 5**
```
Setup:
- userProfile.progression.lastActiveDate = '2026-02-04'
- Today: '2026-02-09'
- User Level: 10

Expected:
- calculateDaysInactive() returns 5
- 5 > INACTIVITY_THRESHOLD_DAYS (3) → TRUE
- baseSets = 3 (for Level 10)
- inactivityReduction = Math.round(3 * 0.40) = 1
- adjustedSets = 3 - 1 = 2

Verification:
- Check workout.volumeAdjustment.adjustedSets = 2
- Check workout.volumeAdjustment.badge = "Volume Reduced (Back to routine)"
```

### 7.3 Office Mode Testing

**Test 5: Office Location with Parent Persona**
```
Setup:
- location: 'office'
- persona: 'parent'
- duration: 15 minutes

Expected:
- Only exercises with sweatLevel <= 1
- Only exercises with noiseLevel <= 1
- No push-ups, burpees, jumping jacks
- Only seated core, stretches, mobility

Verification:
- Check ContextualEngine.filterAndScore() excluded exercises
- Verify all selected exercises have sweatLevel = 1 and noiseLevel = 1
```

### 7.4 SA/BA Balance Testing

**Test 6: SA Limit Enforcement**
```
Setup:
- Generate workout with many straight_arm exercises available

Expected:
- Max 2 straight_arm exercises in final workout
- 3rd+ straight_arm exercises penalized by -5 per excess
- Final workout SA:BA ratio balanced

Verification:
- Check workout.mechanicalBalance.straightArm <= 2
- Check workout.mechanicalBalance.isBalanced = true
```

---

## ✅ Part 8: Implementation Checklist

### Phase 1: Core Service Implementation
- [ ] Create `src/features/workout-engine/services/home-workout.service.ts`
- [ ] Implement `ShadowMatrix` type definition
- [ ] Implement `getEffectiveLevelForExercise()` with 4-step priority logic
- [ ] Implement `calculateDaysInactive()` using lastActiveDate
- [ ] Implement `extractInjuryShield()` from user health profile
- [ ] Implement `mapPersonaIdToLifestylePersona()` mapper
- [ ] Implement `generateHomeWorkout()` main orchestrator function

### Phase 2: Engine Updates
- [ ] Update `ContextualEngine.ts` interface to use `getUserLevelForExercise` callback
- [ ] Update `ContextualEngine.ts` scoring logic to use callback
- [ ] Update `WorkoutGenerator.ts` INACTIVITY_THRESHOLD_DAYS to 3
- [ ] Update `WorkoutGenerator.ts` INACTIVITY_VOLUME_REDUCTION to 0.40

### Phase 3: AdjustWorkoutModal Implementation
- [ ] Create `src/features/home/components/AdjustWorkoutModal.tsx`
- [ ] Implement 3-column layout (Context, Shadow Matrix, Live Preview)
- [ ] Implement LEFT COLUMN: Context controls (persona, location, intent, duration, injuries, equipment)
- [ ] Implement MIDDLE COLUMN: Shadow Matrix controls
  - [ ] Global override toggle + slider
  - [ ] Movement group sliders (8 groups)
  - [ ] Muscle group sliders (13 groups)
  - [ ] Reset to Auto button
- [ ] Implement RIGHT COLUMN: Live Preview
  - [ ] Workout title & description
  - [ ] Stats box (duration, calories, difficulty)
  - [ ] SA:BA balance display
  - [ ] Volume adjustment badge
  - [ ] Exercise list with sets/reps
- [ ] Implement REGENERATE button handler
- [ ] Implement SAVE & APPLY button handler

### Phase 4: Processing Animation
- [ ] Create `src/features/home/components/ProcessingOverlay.tsx`
- [ ] Implement pulsing rings SVG animation
- [ ] Implement progress bar (0 → 80% over 1800ms)
- [ ] Implement text pulse animation
- [ ] Implement 2000ms timer with onComplete callback
- [ ] Integrate into AdjustWorkoutModal save flow

### Phase 5: UI Updates
- [ ] Update `StatsOverview.tsx`:
  - [ ] Remove static `heroWorkoutData`
  - [ ] Add `dynamicWorkout` state
  - [ ] Add `useEffect` for initial workout generation
  - [ ] Add modal integration
- [ ] Update `HeroWorkoutCard.tsx`:
  - [ ] Add "התאם אימון" button
  - [ ] Pass `onAdjust` callback prop
- [ ] Update `WorkoutPreviewDrawer.tsx`:
  - [ ] Remove all rest timer display code
  - [ ] Keep only sets/reps display
  - [ ] Update display format for holds

### Phase 6: Testing
- [ ] Test Shadow Matrix global override
- [ ] Test Shadow Matrix movement group override
- [ ] Test Shadow Matrix muscle group override
- [ ] Test Reactivation Protocol (5 days inactive → 40% reduction)
- [ ] Test Office Mode filtering (sweat/noise limits)
- [ ] Test SA/BA balance enforcement
- [ ] Test Processing animation timing
- [ ] Test modal save flow end-to-end

---

## 🎯 Conclusion

This architecture provides a **complete blueprint** for implementing:

1. ✅ **Full Shadow Matrix** - All movement groups and muscle groups with level overrides (1-20)
2. ✅ **Smart Mapping** - Priority logic: Global → Movement → Muscle → Domain
3. ✅ **QA Control Room** - Comprehensive testing dashboard in AdjustWorkoutModal
4. ✅ **Processing Animation** - 2-second transition after save
5. ✅ **Simplified UI** - WorkoutPreviewDrawer shows only sets/reps (no rest timers)

**Status:** ✅ **ARCHITECTURE COMPLETE**

**Next Action Required:** User approval to begin coding implementation

**No code has been written yet.** This document provides the WHAT and HOW for every component, function, and data flow.

Awaiting your approval to proceed with implementation. 🚀
