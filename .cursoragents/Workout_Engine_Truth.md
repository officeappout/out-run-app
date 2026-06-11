# 🧠 Workout Engine Truth — OUT Application

> **Status:** CANONICAL LAW. Single source of truth for the workout generator's
> architecture, exercise ordering, filter cascade and contextual adaptation.
> **Consolidated from:** `TRAINING_LOGIC.md`, `WORKOUT_ENGINE_SPECS.md`,
> `HOME_WORKOUT_SERVICE_PROFESSIONAL_ARCHITECTURE.md`,
> `MICRO_LOGIC_AND_MASTER_SUMMARY.md`, `LAYER2_LAYER3_TECHNICAL_BREAKDOWN.md`,
> and the 30+ condition chain from `WORKOUT_GENERATION_RESEARCH_REPORT.md`.
> **Source files are kept for history — this file overrides them on conflict.**
> **Rule of engagement:** Do NOT invent new rules. Adhere strictly to the laws below.
> XP / coins / level math lives in `XP_Progression_Truth.md` (sister document).

---

## LAW 0 — Separation of Concerns (Non-Negotiable)

The engine is built on decoupled layers so it can run **isomorphically**
(server-side batch pre-generation + client-side real-time adaptation, offline).

| Module | Path | Role |
|--------|------|------|
| 🧠 The Brain | `src/features/workout-engine/` | Pure logic. NO UI, NO React hooks. |
| 👤 The State | `src/features/user/` | Long-term progression, TrackingMatrix, profile. |
| 📚 The Material | `src/features/content/` | Static exercise data + extended types. |
| ⏱ Real-Time | `useSessionStore` | Active session, timers, current set, superset logic. |
| 🧪 The Lab | `src/app/admin/` | Simulation, QA, Shadow Matrix control room. |

**Isomorphic Constraint (hard rule):** `WorkoutGenerator` MUST be pure TypeScript.
Pass all data as arguments — NEVER call `useUser`, `useQuery` or any hook inside it.

```ts
// Correct
const session = WorkoutGenerator.build(userProfile, context, equipmentList);
```

---

## LAW 1 — The Three-Layer Pipeline

Every generated workout flows through three authority layers, in order:

1. **Identity** — who the user is. Source: profile, onboarding, visual assessment.
   Produces: assigned programs, per-domain levels, equipment, injuries, persona.
2. **Planning** — what is scheduled today. Source: `UserSchedule`, recurring
   template, date. Produces: `scheduledProgramIds`, `isScheduledRestDay`,
   `availableTime`, weekly volume budget. (`scheduledProgramIds` OVERRIDE
   `activePrograms` when present.)
3. **Vibe Override** — what the user chooses NOW. Source: `AdjustWorkoutModal`
   (location, intentMode, availableTime, difficulty, shadow matrix). Regenerates
   and replaces the recommended workout in state.

---

## LAW 2 — The Generation Pipeline (home-workout.service)

```
1. Resolve effective profile (scheduledProgramIds override activePrograms)
2. Fetch exercises, programs, gym equipment (+ park data if location = park)
3. Level-aware filter: exercises matching user program levels ± tolerance
4. Derive context: daysInactive, injuries, persona, equipment, budget
5. ContextualEngine.filterAndScore(exercises, context)   ← hard filters + scoring
6. WorkoutGenerator.generateWorkout(scoredExercises, context)
     - Difficulty resolution (first session / detraining / user choice)
     - getExerciseCountForDuration(availableTime)
     - selectExercisesForDifficulty (level filter)
     - selectExercises (priority buckets, score sort, SA cap)
     - assignVolume (tier-based sets / reps / rest)
     - Sort by priority (skill → compound → accessory → isolation)
     - selectProtocol (emom / antagonist_pair / … from Admin config)
     - determineStructure (standard / emom / amrap / circuit)
7. appendCooldownExercises (2-3 stretch)
8. Resolve metadata (title, description, aiCue) from Firestore
9. Return HomeWorkoutResult
```

---

## LAW 3 — The Generation Condition Chain (32 Conditions)

A cascade applied IN ORDER. Each layer can exclude or modify exercises before the
next. (Extracted from the workout-generation research — the canonical debugging map.)

| # | Condition | Source | Effect |
|---|-----------|--------|--------|
| 1 | Onboarding Status | `onboardingStatus`, `onboardingStep` | Gates access to generation |
| 2 | **Progression.tracks** | Firestore `progression.tracks` | **PRIMARY** level source per program |
| 3 | Progression.domains | `progression.domains` | Fallback for domain-based levels |
| 4 | Progression.activePrograms | `activePrograms[0].templateId` | Drives program filter + primary program |
| 5 | Progression.skillFocusIds | Path C multi-skill | P1/P2/P3 rotation (calisthenics_upper) |
| 6 | Progression.masterProgramSubLevels | Path B/C | Per-child level (push, pull, planche…) |
| 7 | **userProgramLevels Map** | tracks → domains → activePrograms | Built for level-aware filter (tracks first) |
| 8 | Level-Aware Filter | `filterByTolerance(±1, ±2, ±3)` | `targetPrograms` must match userLevel ± tolerance |
| 9 | Strict Program Filter | `activeProgramFilters` | Only exercises matching program IDs |
| 10 | Location | `context.location` | Method must have `location`/`locationMapping` |
| 11 | findMatchingMethod | ContextualEngine | exact location → home fallback → bodyweight |
| 12 | Sweat Limit | `LOCATION_CONSTRAINTS.sweatLimit` | office:1, home:3, park/gym:3 |
| 13 | Noise Limit | `LOCATION_CONSTRAINTS.noiseLimit` | office:1, home:2, park/gym:3 |
| 14 | Park bypassLimits | `park.bypassLimits = true` | Park ignores sweat/noise |
| 15 | **Injury Shield** | `health.injuries` | HARD-excludes exercises stressing injury areas |
| 16 | 48-Hour Muscle Shield | `lastSessionMuscleGroups`, `lastSessionDate` | Excludes recently-trained muscles |
| 17 | Field Mode | `intentMode === 'field'` | `passesFieldMode()` (fieldReady, no equipment) |
| 18 | Equipment | `availableEquipment` | Park: method equip must exist; Home: user gear |
| 19 | getUserLevelForExercise | Shadow Matrix → targetPrograms → domains | Per-exercise effective level |
| 20 | Shadow Matrix Override | QA Control Room | Global/movement/muscle override (testing) |
| 21 | Difficulty (Bolts) | User or auto | 1=Easy, 2=Normal, 3=Intense |
| 22 | Days Inactive | `lastActiveDate` | >3 days → 40% volume reduction |
| 23 | Detraining Lock | `daysInactive > 3` | Downgrade 3 bolts → 2 |
| 24 | First Session | `isFirstSessionInProgram` | Force difficulty 1 |
| 25 | Recovery Day | `isRecoveryDay` / difficulty 1 | Level −1 exercises, no protocol |
| 26 | Scheduled Rest Day | `isScheduledRestDay` | Force recovery path |
| 27 | Dominance Ratio | P1/P2/P3 split-decision | 65/35 or 50/30/20 set allocation |
| 28 | Daily Set Budget | `weeklyBudget / scheduleDays` | Caps total sets per session |
| 29 | **SA/BA Balance** | Max 2 straight_arm per session | Mechanical balance |
| 30 | Protocol Injection | Admin `preferredProtocols`, `protocolProbability` | Supersets, EMOM, etc. |
| 31 | Blast Mode | `intentMode === 'blast'` | EMOM/AMRAP structure |
| 32 | Available Time | `availableTime` (min) | Exercise-count scaling (5–60 min tiers) |

> **Critical invariant:** `userProgramLevels` MUST be built from `tracks` FIRST
> (assessment levels), then domains, then activePrograms. Building from domains
> only is the documented root cause of "Level 6 user gets Level 1 exercises".

---

## LAW 4 — Exercise Ordering (Authoritative)

- **Selection within a bucket:** by ContextualEngine **score (descending)**. No shuffle among equal scores.
- **Final order:** STRICT priority sort — `skill → compound → accessory → isolation`.

```ts
const priorityOrder = { skill: 0, compound: 1, accessory: 2, isolation: 3 };
workoutExercises.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
```

**Priority classification** (`classifyPriority`, inferred from `tags` + `movementType`):
`skill` tag → skill · `compound` tag / `movementType==='compound'` / `primaryMuscle==='full_body'` → compound · `isolation` tag → isolation · default → accessory.

There is NO separate difficulty sort key — score already incorporates level
proximity, gear match and persona.

---

## LAW 5 — Session Structure (Blueprint Slots)

Workouts are lists of **Slots**, not raw exercise lists.

- **Slot 1 — Golden Slot:** Skill / Power (Planche, Front Lever, Handstand). Fresh
  CNS. **NEVER supersetted.**
- **Slot 2 — Compounds:** supports **Antagonist Pairs** (Push + Pull).
- **Slot 3 — Accessory:** isolation / core / grip. High volume, short rest.

Canonical flows:
- **Full Body:** Warmup → Push Compound → Pull Compound → Legs → Core.
- **Pull Only:** Skill (OAP) → Main Pull (weighted) → Isolation/Accessory.
- **Calisthenics Upper:** Slot 1 Skills → Slot 2 Antagonist Superset → Slot 3 Accessory.

---

## LAW 6 — The 4-Level Execution-Method Cascade

For each exercise, pick the optimal `ExecutionMethod` via a strict cascade
(`execution-method-selector.service.ts → selectExecutionMethodWithBrand`):

```
Priority 1: Brand Matching (Park only)  → return brand-specific demo video
   ↓ (no match)
Priority 2: Equipment ID Match (fixed equipment)
   ↓
Priority 3: User Gear Match (personal equipment)
   ↓
Priority 4: Improvised Method (bodyweight / household items)
```

Location priority sets:
- `home` / `office` → `['user_gear', 'improvised']`
- `park` / `gym` → `['fixed_equipment', 'user_gear', 'improvised']`

Brand match goal: the user sees a demo filmed on the EXACT equipment brand
(e.g. "Kompan" pull-up bar) they are physically standing at.

---

## LAW 7 — Contextual Filters & Scoring

### 7.1 Hard Filters (exclude, score never calculated)
- **Injury Shield:** if ANY overlap between `exercise.injuryShield` and
  `health.injuries` → EXCLUDED.
- **Sweat / Noise:** if `sweatLevel`/`noiseLevel` exceeds the location limit → EXCLUDED
  (ignored in `blast` mode; `on_the_way` forces sweatLimit 1; park `bypassLimits`).
- **Field Mode:** `intentMode==='field'` → only `fieldReady`, no-equipment exercises.

### 7.2 Soft Scoring (rank survivors)
- Lifestyle match: **+2 per matching tag**.
- Level proximity: **+3 for exact level** (degrades with distance).
- Blast-mode bonus, Video bonus **+1**.

### 7.3 Location Constraints Table
| Location | sweatLimit | noiseLimit | methodPriority | bypassLimits |
|----------|-----------|-----------|----------------|--------------|
| office / library / school / airport | 1 | 1 | 3 | false |
| home | 3 | 2 | 2 | false |
| park | 3 | 3 | 1 | **true** |

---

## LAW 8 — SA/BA Mechanical Balance

- `MAX_STRAIGHT_ARM_PER_SESSION = 2`.
- The 3rd+ straight-arm exercise is **penalized, not excluded**:
  `penalty = (straightArmCount − 2) × 5` points off the score.
- Balanced when `SA ≤ 2` AND `|SA − BA| ≤ 2`. Mechanical types: `straight_arm`,
  `bent_arm`, `hybrid`, `none`.

---

## LAW 9 — Dynamic Rest Timers

Derived from rep range / hold type (`WorkoutGenerator.assignVolume`):

| Exercise type | Rep / hold range | Rest |
|---------------|------------------|------|
| Heavy Strength | 1 – 5 reps | 180s |
| Hypertrophy | 6 – 12 reps | 90s |
| Endurance / Accessory | 12+ reps | 45s |
| Isometric hold (short) | ≤ 10s hold | 180s |
| Isometric hold (mid) | ≤ 30s hold | 120s |
| Isometric hold (long) | 30s+ hold | 90s |
| Blast mode (EMOM/AMRAP) | — | 30s (override) |

`defaultBaseRest` from exercise metadata seeds the baseline; rep-range logic overrides.
**Rule #17:** short static holds (4–8s) → INCREASE sets (4–6), keep rest long.

---

## LAW 10 — Volume Adjustment & Reactivation

- **Reactivation Protocol:** `daysInactive > 3` (`INACTIVITY_THRESHOLD_DAYS = 3`)
  → reduce sets by **40%** (`INACTIVITY_VOLUME_REDUCTION = 0.40`), floor at 2 sets.
  Keep intensity moderate. Also downgrades difficulty 3 bolts → 2 (Detraining Lock).
- **Deload:** every 4th/5th week → Volume −50%, intensity maintained.
- **Weekly budget cutback:** when `weeklyBudgetUsagePercent > 75` and budget remains
  → reduce planned sets by 20% (`calculateVolumeAdjustment`).
- **First session in a level** → force difficulty 1.
- Set types: `< Level 10` → straight sets only; `> Level 10` → antagonist supersets
  (Push → rest 30s → Pull → rest 90s) + optional HIIT in Full Body.

---

## LAW 11 — Context Engine Adaptations

### 11.1 Fragmented Mode (Office / "No Time")
Split the day into two mini-sessions when `timeAvailable < minDuration` OR
`location === 'office'` with equipment-dependent blueprint:
- **Part A (Office/Morning):** Mobility, Core, Accessories — `sweatLevel 1`, no equipment.
- **Part B (Home/Evening):** Heavy compounds (Push/Pull) requiring equipment.
- Day is "Done" ONLY when Part A + Part B both complete.
- Slot routing: `fragmentPart` field, else `PART_A_SLOT_TYPES` (warmup/cooldown/
  accessory) + `PART_A_MOVEMENT_PATTERNS` (core_*, mobility_*, handstand_balance) → A; rest → B.

### 11.2 Late-Night Pivot
`now.getHours() >= 20` → `availableTime = 15`, cap 4–5 exercises, exclude accessories
(compounds + skills only). Does NOT change exercise TYPE (no switch to mobility).

### 11.3 Maintenance & Streaks
Inactive / low energy / rest day → 2–3 follow-along mobility/flexibility videos
(separate sets for Library/Office vs Home). Preserves streak with zero CNS fatigue.

### 11.4 The Queue (design intent)
Workouts do not expire — miss Tuesday, do Tuesday's workout on Wednesday. The Queue
holds **goals (program IDs)**, not fixed exercise lists; the engine regenerates the
exercise list at runtime from current location/equipment/level/time/injury.

---

## LAW 12 — Shadow Tracking (Decoupled Progression)

User sees one number ("Full Body — Level 10"); the system tracks per-domain levels:

```
Push_Strength: 12   Pull_Strength: 8   Legs: 4
```

When generating, pull each exercise at the level of its **muscle/movementGroup**, not
the program's headline level (`getEffectiveLevelForExercise`):
`horizontal_push`/`vertical_push`/`horizontal_pull`/`vertical_pull` → `upper_body`;
`squat`/`hinge` → `lower_body`; `core` → `core`; `isolation` → primary-muscle domain.

---

## LAW 13 — Smart Swap (SwapEngine) Persistence Rule

When the user swaps an exercise, the engine infers the REASON:

| Reason | Action | Persistence |
|--------|--------|-------------|
| Equipment occupied / missing (contextual) | Alternative in same MovementGroup + same Level | **None** — session-only Shadow Swap |
| Too Hard / Pain (capability) | Regression (Level − 1) or injury variation | **Permanent** — downgrade level in `TrackingMatrix` |

"Too Hard" only persists after it happens **×2 times** for the same movement.

---

## LAW 14 — Implementation Map

| Concern | File |
|---------|------|
| Pure generator (Brain) | `src/features/workout-engine/generator/services/workout-generator.service.ts` |
| Contextual filter + scoring | `ContextualEngine.ts` |
| Execution method cascade | `generator/services/execution-method-selector.service.ts` |
| Exercise replacement (Smart Swap) | `generator/services/exercise-replacement.service.ts` |
| Fragmenter (blueprint split) | `workout-engine/logic/Fragmenter.ts` |
| Active session state | `workout-engine/core/store/useSessionStore.ts` |
| Per-level tuning (sets/gain) | Firestore `program_level_settings` (see `XP_Progression_Truth.md`) |

---

*End of Workout Engine Truth — adhere strictly; do not invent rules.*
