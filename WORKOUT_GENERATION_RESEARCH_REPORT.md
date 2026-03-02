# Workout Generation Research Report — Critical Testing Phase

**Date:** Feb 21, 2025  
**Purpose:** Comprehensive documentation of the workout generation priority chain, decision matrix, and debugging aids for Level 6/7 testing.

---

## 1. Priority Chain — Conditions Affecting Workout Generation (Hierarchy)

The workout generation flow is governed by a **cascade of conditions** applied in order. Each layer can exclude or modify exercises before the next.

### 1.1 Full Condition Table (30+ Conditions)

| # | Condition | Source | Effect | Why Level 6 User Might Get Level 1 |
|---|-----------|--------|--------|-----------------------------------|
| 1 | **Onboarding Status** | `onboardingStatus`, `onboardingStep` | Gates access to workout generation | N/A |
| 2 | **Progression.tracks** | Firestore `progression.tracks` | **PRIMARY** source of user level per program | **If empty or not synced** → Level 1 default |
| 3 | **Progression.domains** | Firestore `progression.domains` | Fallback for domain-based levels | If tracks missing, domains may have generic initialLevel |
| 4 | **Progression.activePrograms** | `activePrograms[0].templateId` | Drives program filter and primary program | If no track for templateId → default Level 1 |
| 5 | **Progression.skillFocusIds** | Path C multi-skill | P1/P2/P3 rotation for calisthenics_upper | N/A |
| 6 | **Progression.masterProgramSubLevels** | Path B/C | Per-child level (push, pull, planche, etc.) | Must be in tracks for home-workout to read |
| 7 | **userProgramLevels Map** | Built from tracks → domains → activePrograms | **Critical** — used for level-aware filter | **Tracks must be populated first** (recent fix) |
| 8 | **Level-Aware Filter** | `filterByTolerance(±1, ±2, ±3)` | Exercises with `targetPrograms` must match userLevel ± tolerance | If userProgramLevels has Level 1 → only L1–4 exercises pass |
| 9 | **Strict Program Filter** | `activeProgramFilters` (focusDomains or derived) | Only exercises matching program IDs | N/A |
| 10 | **Location** | `context.location` | **Execution method must have `location` or `locationMapping`** | **Home/Office may have fewer exercises** → Park has most |
| 11 | **findMatchingMethod** | ContextualEngine | Priority: exact location → home fallback → bodyweight | **No method for location = excluded** |
| 12 | **Sweat Limit** | `LOCATION_CONSTRAINTS[location].sweatLimit` | office: 1, home: 2, park/gym: 3 | Office excludes high-sweat |
| 13 | **Noise Limit** | `LOCATION_CONSTRAINTS[location].noiseLimit` | office: 1, home: 2, park/gym: 3 | Office excludes high-noise |
| 14 | **Park bypassLimits** | `park.bypassLimits: true` | Park ignores sweat/noise | Park = most permissive |
| 15 | **Injury Shield** | `health.injuries` | Excludes exercises targeting injury areas | N/A |
| 16 | **48-Hour Muscle Shield** | `lastSessionMuscleGroups`, `lastSessionDate` | Excludes recently trained muscles (Habit Builder) | N/A |
| 17 | **Field Mode** | `intentMode === 'field'` | `passesFieldMode()` filter | N/A |
| 18 | **Equipment** | `availableEquipment` | Park: methods must have equipment in park | Home: user gear |
| 19 | **getUserLevelForExercise** | Shadow Matrix → targetPrograms → domains | Per-exercise effective level | Shadow override > targetPrograms > domain mapping |
| 20 | **Shadow Matrix Override** | QA Control Room | Global / movement / muscle override | Testing only |
| 21 | **Difficulty (Bolts)** | User selection or auto | 1=Easy, 2=Normal, 3=Intense | Affects exercise selection |
| 22 | **Days Inactive** | `lastActiveDate` | >3 days → 40% volume reduction | N/A |
| 23 | **Detraining Lock** | `daysInactive > 3` | Downgrade 3 bolts → 2 | N/A |
| 24 | **First Session** | `isFirstSessionInProgram` | Force difficulty 1 | N/A |
| 25 | **Recovery Day** | `isRecoveryDay` or difficulty 1 | Targets cooldown exercises | N/A |
| 26 | **Scheduled Rest Day** | `isScheduledRestDay` | Force recovery | N/A |
| 27 | **Dominance Ratio** | P1/P2/P3 from split-decision | 65/35 or 50/30/20 set allocation | N/A |
| 28 | **Daily Set Budget** | `weeklyBudget / scheduleDays` | Caps total sets per session | L6: 6 sets/workout × days |
| 29 | **SA/BA Balance** | Max 2 straight_arm per session | Mechanical balance | N/A |
| 30 | **Protocol Injection** | Admin `preferredProtocols`, `protocolProbability` | Supersets, EMOM, etc. | Level 10+ typically |
| 31 | **Blast Mode** | `intentMode === 'blast'` | EMOM/AMRAP structure | N/A |
| 32 | **Available Time** | `availableTime` (min) | Exercise count scaling | 5–60 min tiers |

### 1.2 Why Level 6 User Received Level 1 Exercises — Root Causes

| Cause | Fix Applied |
|-------|-------------|
| **userProgramLevels built from domains only** | Now builds from **tracks first** (assessment levels) |
| **activePrograms default to Level 1** when no track | Tracks must be populated by onboarding-sync |
| **getBaseUserLevel ignored tracks** | Now includes tracks (skill programs) |
| **Location filter too strict** | Temporary Park default for testing (see §2) |
| **Exercises lack `location: home` methods** | Many exercises have `park` only → Home/Office exclude them |

---

## 2. Temporary 'Park' Default (Testing)

**Until Home/Office exercises are uploaded**, the ExerciseFilter uses **Park** as the effective location so Level 6/7 exercises (which often have park execution methods) are included.

- **Implementation:** `USE_PARK_FOR_TESTING` flag in `home-workout.service.ts`
- **Behavior:** When `true`, `filterContext.location` is overridden to `'park'` before ContextualEngine runs
- **Park:** `bypassLimits: true` → no sweat/noise filtering; `findMatchingMethod` accepts park + home fallback + bodyweight

---

## 3. Workout Structure Logic — Straight Sets vs Supersets, Reps vs Time

### 3.1 Structure Decision Flow

```
determineStructure(context, exercises) →
  if intentMode === 'blast' → random('emom' | 'amrap')
  if exercises.length <= 3 && availableTime <= 15 → 'circuit'
  else → 'standard'

selectProtocol(difficulty, context) →
  if difficulty === 1 → { structure: 'standard', setType: 'straight' }
  if !adminProtocols or probability <= 0 → { structure: 'standard', setType: 'straight' }
  if random() > protocolProbability → { structure: 'standard', setType: 'straight' }
  else → selected from preferredProtocols (emom | antagonist_pair | superset)
```

### 3.2 Straight Sets vs Supersets (TRAINING_LOGIC.md Rule 3.3)

| User Level | Structure | Set Type |
|-------------|-----------|----------|
| **< Level 10** | Straight Sets only | `straight` |
| **≥ Level 10** | Antagonist Supersets possible | `antagonist_pair` or `superset` (if Admin configured) |

- **Protocol injection** is gated by `protocolProbability` from Admin (ProgramLevelSettings)
- If Admin has not configured `preferredProtocols`, the engine always uses **straight sets**

### 3.3 Reps vs Time for Level 6

| Exercise Type | Level 6 | Source |
|---------------|---------|--------|
| **Standard (reps)** | 8–9 reps | `BASE_REPS_BY_LEVEL[6].standard` = 8 |
| **Time-based (holds)** | 28s | `BASE_REPS_BY_LEVEL[6].timeBased` = 28 |

- **Tier system:** `levelDelta` (exercise.level − user.level) maps to `below` | `match` | `above` | `elite`
- **Level 6** falls in **intermediate** tier (L6–13)
- **Reps:** From `TIER_TABLE[tierName].reps` (min/max range)
- **Holds:** From `TIER_TABLE[tierName].hold` with isometric guardrails (SA cap 15s, handstand up to 60s)

---

## 4. Volume & Budget — Weekly Set Budget

### 4.1 Formula (`useWeeklyVolumeStore.calculateWeeklyBudget`)

```
setsPerWorkout(level) =
  L1–5:  4
  L6–15: 6
  L16+:  8

weeklyBudget = setsPerWorkout × scheduleDays
```

**Example:** Level 6, 3 days/week → 6 × 3 = **18 sets/week**

### 4.2 Daily Budget

```
dailySetBudget = max(2, floor(weeklyBudget / scheduleDays))
```

**Example:** 18 / 3 = **6 sets per session**

### 4.3 Missed Workouts

- **Per TRAINING_LOGIC.md Rule 2.3:** Workouts do not expire. If you miss Tuesday, you do Tuesday's workout on Wednesday.
- **Current implementation:** `remainingWeeklyBudget` = `weeklyBudget - totalSetsCompleted`
- **Recovery workouts** (`isRecovery=true`): **Excluded** from budget consumption
- **Reactivation Protocol:** If `daysInactive > 3` → 40% volume reduction (sets reduced by ~40%)

### 4.4 Budget Initialization Gap (FREQUENCY_SPLIT_RESEARCH.md)

- `checkAndResetWeek()` and `initializeWeek()` exist but **may not be called** on app mount
- StatsOverview and Home may not pass `remainingWeeklyBudget` to `generateHomeWorkout`
- **Result:** Budget-based throttling may be unused until wired

---

## 5. Decision Matrix — Full Body Level 6 User

| Input | Value |
|-------|-------|
| Program | full_body |
| Level | 6 |
| Schedule Days | 3 (example) |
| Location | home (or Park if testing override) |
| Difficulty | 2 (Normal) |

| Decision | Result |
|----------|--------|
| **weeklyBudget** | 6 × 3 = 18 |
| **dailySetBudget** | 6 |
| **sessionType** | full_body_ab (3 days, intermediate) |
| **Structure** | standard (straight sets) |
| **Protocol** | straight (unless Admin configured) |
| **Reps (standard)** | 8–9 |
| **Holds** | ~28s |
| **Sets per exercise** | 2–3 (from tier) |
| **Level filter** | ±3 tolerance → exercises L3–9 |
| **Location filter** | Must have home/park/bodyweight method |

---

## 6. Title & Description Resolution Logic

### 6.1 Firestore Scoring (workout-metadata.service)

| Field | Match | Bonus |
|-------|-------|-------|
| persona | Exact | +1 |
| location | Exact | +1 |
| timeOfDay | Exact | +1 |
| gender | Exact or 'both' | +1 or 0 |
| sportType | Exact | +1 |
| progressRange | User in range | +1 |
| progressRange 90-100 | User >90% | +5 |

### 6.2 Program Hard Filter

- If row has `programId` and it's not `activeProgramId` or ancestor → **score = 0** (excluded)
- Exact match: +3
- Ancestor match: +1

### 6.3 Logging (Enhanced)

When `DEBUG_METADATA_RESOLUTION` is true in `workout-metadata.service.ts`, the console logs for each resolved Title, Description, and Phrase:

```
[WorkoutMetadata] Title resolution
  Result: "אימון כוח מלא"
  Score: 5 | Tied rows: 1
  Why chosen: location=park; activeProgramId=full_body(+3); timeOfDay=morning
```

---

## 7. Testing Flags

| Flag | File | Purpose |
|------|------|---------|
| `USE_PARK_FOR_TESTING` | `home-workout.service.ts` | Override filter location to `park` until Home/Office exercises are uploaded |
| `DEBUG_METADATA_RESOLUTION` | `workout-metadata.service.ts` | Log Title/Description/Phrase resolution and match reasons |

---

## 8. File References

| Purpose | File |
|---------|------|
| Priority chain | `home-workout.service.ts` |
| Location filter | `ContextualEngine.ts` → `findMatchingMethod` |
| Level resolution | `shadow-level.utils.ts` → `getEffectiveLevelForExercise` |
| Structure/Protocol | `WorkoutGenerator.ts` → `selectProtocol`, `determineStructure` |
| Weekly budget | `useWeeklyVolumeStore.ts` → `calculateWeeklyBudget` |
| Title/Description | `workout-metadata.service.ts` → `resolveWorkoutMetadata` |
| Onboarding sync | `onboarding-sync.service.ts` |
