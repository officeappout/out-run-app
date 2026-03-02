# Workout Generator Deep-Dive Research Report

**Purpose:** Analyze the current WorkoutGenerator logic against TRAINING_LOGIC.md and WORKOUT_ENGINE_SPECS.md to identify physiological and structural flaws reported by a professional fitness coach.

**Version:** 1.0  
**Date:** February 2025

---

## Executive Summary

The research reveals five critical gaps between the documented design (TRAINING_LOGIC.md, WORKOUT_ENGINE_SPECS.md) and the current implementation. The engine lacks a dedicated warmup block, blindly distributes sets without prioritizing compounds, does not implement antagonist pairing logic, has no domain-coverage guarantee for full_body, and exercises are ordered only by priority—not by compound-first sequencing.

---

## 1. Warmup Selection Logic

### Documented Behavior (TRAINING_LOGIC.md, WORKOUT_ENGINE_SPECS.md)

- **TRAINING_LOGIC.md Rule 3.1:** "Full Body: Warmup → Push Compound → Pull Compound → Legs → Core"
- **WORKOUT_ENGINE_SPECS.md 3.2:** Blueprint defines Slot 1 (Golden Slot), Slot 2 (Compounds), Slot 3 (Accessory)
- **FULL_BODY_BLUEPRINT** (blueprint.types.ts): First slot is `type: 'warmup'` with `movementPattern: 'mobility_upper'`

### Current Implementation

**Finding: The home-workout flow does NOT add a warmup block. The warmup is a UI fallback.**

| Component | Behavior |
|-----------|----------|
| **home-workout.service.ts** | No `prependWarmupExercises()` call. Only `appendCooldownExercises()` exists. |
| **WorkoutGenerator** | Receives scored exercises from ContextualEngine. Does not filter or prepend warmup exercises. |
| **ContextualEngine** | Filters by `activeProgramFilters` (push, pull, legs, core). Does NOT filter for `exerciseRole === 'warmup'` or `tags: ['warmup']`. |
| **WorkoutPreviewDrawer** | `groupExercisesIntoSections()`: When no exercises have `exerciseRole === 'warmup'`, the **first exercise in the list** is treated as warmup. |

**Root cause (Pike Stand as warmup):**

```javascript
// WorkoutPreviewDrawer.tsx lines 951-964
if (warmup.length === 0 && cooldown.length === 0) {
  const all = [...exercises];
  if (all.length >= 4) {
    warmup.push(all.shift()!);   // ← FIRST exercise becomes warmup!
    cooldown.push(all.pop()!);
    ...
  }
}
```

So when no exercises have `exerciseRole === 'warmup'`, the **first exercise in the sorted list** (e.g., Pike Stand, a Level 7 strength compound) is arbitrarily displayed as warmup. The exercise pool is never filtered for warmup-only exercises.

### Architectural Changes Needed

1. **Add `prependWarmupExercises()`** in home-workout.service.ts (mirroring `appendCooldownExercises()`).
2. **Strict filter:** Only exercises with `exerciseRole === 'warmup'` OR `tags.includes('warmup')` OR `domain === 'warmup'` (if such a domain exists).
3. **Select 1–2 warmup exercises** (short duration 10–15s or follow-along) from the filtered pool.
4. **Remove the UI fallback** in WorkoutPreviewDrawer that promotes the first exercise to warmup.

---

## 2. Set Distribution (The "2 Sets" Problem)

### Documented Behavior (TRAINING_LOGIC.md)

- **Rule 3.2:** "Skills / Heavy Strength (1-5 Reps): 180s rest. Hypertrophy (6-12 Reps): 90-120s rest."
- **Rule 3.3:** "Beginner (< Level 10): Straight Sets only. Intermediate/Advanced (> Level 10): Antagonist Supersets."
- **Standard fitness logic:** 3 sets for main exercises; compounds typically get 3–4 sets.

### Current Implementation

**Finding: Sets are assigned per-exercise via the Tier Engine, not from a budget distribution. Compounds are not guaranteed 3 sets.**

| Step | Location | Logic |
|------|----------|-------|
| **Base sets** | `BASE_SETS_BY_LEVEL` | Level 7 → 3 sets (correct). |
| **Tier assignment** | `assignVolume()` | Each exercise gets `tier.sets.min` to `tier.sets.max` (TIER_TABLE: match=3–4, easy=3, flow=3). |
| **Priority adjustment** | `assignVolume()` | `skill`: cap at 4; `isolation`: `sets - 1`. |
| **Budget guardrails** | `generateWorkout()` | Safety Brake and Global Budget Guardrail **scale down** all exercises proportionally when total sets exceed cap. |

**Root cause of "2 sets across 5 exercises":**

1. **Budget cap:** `remainingWeeklyBudget` or `dailySetBudget` may be low (e.g., 10 sets).
2. **Proportional scaling:** When `totalSets > cap`, the code applies `scale = cap / totalSets` and rounds: `sets = Math.max(2, Math.round(ex.sets * scale))`.
3. **Example:** 5 exercises × 3 sets = 15 → scale = 10/15 ≈ 0.67 → each gets ~2 sets.
4. **No compound-first logic:** The reduction is applied uniformly. Compounds are not guaranteed 3 sets before accessories are reduced.

**Relevant code (home-workout.service.ts / WorkoutGenerator):**

```javascript
// Budget Guardrail: cap to remainingWeeklyBudget
const scale = cap / totalSets;
workoutExercises = workoutExercises.map((ex) => ({
  ...ex,
  sets: Math.max(2, Math.round(ex.sets * scale)),
}));
```

### Architectural Changes Needed

1. **Prioritize compounds:** When scaling down, reduce isolation/accessory sets first. Compounds should keep 3 sets until budget is exhausted.
2. **Minimum sets per compound:** Enforce `compound >= 3` and `skill >= 2` before reducing.
3. **Budget-aware selection:** If budget is 10 sets, prefer fewer exercises (e.g., 3–4) with 3 sets each rather than 5 exercises with 2 sets each.

---

## 3. Superset Pairing Logic (Antagonist Pairs)

### Documented Behavior (TRAINING_LOGIC.md, WORKOUT_ENGINE_SPECS.md)

- **TRAINING_LOGIC.md Rule 3.1:** "Calisthenics Upper: Slot 2 (Compounds): Antagonist Superset (Push + Pull)."
- **TRAINING_LOGIC.md Rule 3.3:** "Introduce Antagonist Supersets (Push exercise → Rest 30s → Pull exercise → Rest 90s)."
- **WORKOUT_ENGINE_SPECS.md 3.2:** "Slot 2 (Compounds): Supports AntagonistPairs (e.g., Push + Pull)."
- **CALISTHENICS_UPPER_BLUEPRINT:** `push_compound` and `pull_compound` have `setType: 'antagonist_pair'` and `pairedSlotId`.

### Current Implementation

**Finding: The antagonist_pair protocol is selected but never applied. No pairing logic exists.**

| Component | Behavior |
|-----------|----------|
| **selectProtocol()** | Returns `{ structure: 'standard', setType: 'antagonist_pair' }` when admin config enables it (10% probability). |
| **WorkoutGenerator** | Uses `protocolResult.structure` to override structure (emom, etc.). **Never uses `protocolResult.setType`.** |
| **WorkoutExercise** | No `pairedSlotId`, `setType`, or `pairedWith` field. |
| **Exercise selection** | No logic to pair Push + Pull. Exercises are selected by score and priority, then sorted by `skill → compound → accessory → isolation`. |

**Result:** When admin enables "antagonist_pair" or "superset", the system selects a protocol but does not:

- Group exercises into pairs
- Ensure Push + Pull pairing (not Chest Flys + Close Grip Pushups)
- Attach paired exercise IDs to workout metadata

The "Chest Flys + Close Grip Pushups" pairing is a **coincidence** of score-based selection and ordering—both are push-dominant exercises. The engine has no antagonist logic.

### Architectural Changes Needed

1. **Implement `applyAntagonistPairing()`** in WorkoutGenerator: When `setType === 'antagonist_pair'`, group compounds into Push + Pull pairs.
2. **Pairing rules:** Use `exerciseMatchesProgram(ex, 'push')` and `exerciseMatchesProgram(ex, 'pull')`; pair one push with one pull.
3. **Add `pairedWith`/`pairedSlotId`** to WorkoutExercise or a wrapper structure for grouped exercises.
4. **Reject agonist pairs:** If pairing would create Push+Push or Pull+Pull, skip pairing or fall back to straight sets.

---

## 4. Missing Body Parts in Full Body (Legs & Core)

### Documented Behavior (TRAINING_LOGIC.md)

- **Rule 3.1:** "Full Body: Warmup → Push Compound → Pull Compound → Legs → Core."
- **Rule 2.2 (Shadow Tracking):** "When generating a Full Body session, pull the specific exercise matching the *muscle's* level, not the program's level."

### Current Implementation

**Finding: The engine does not guarantee at least one exercise per required domain. Selection is score-based, not domain-sequential.**

| Step | Location | Logic |
|------|----------|-------|
| **Child domains** | home-workout.service.ts | `resolveChildDomainsForParent('full_body')` → `['push', 'pull', 'legs', 'core']`. |
| **activeProgramFilters** | home-workout.service.ts | Set to `['push', 'pull', 'legs', 'core']`. |
| **ContextualEngine** | filterAndScore | Includes exercises that match **any** of these programs. Pool is a union of push + pull + legs + core. |
| **WorkoutGenerator** | selectExercises | Selects by **score** and **priority** (skill, compound, accessory, isolation). **No domain loop.** |

**Root cause:** The selection is `score-sorted` and `count-capped`. If push exercises score higher (e.g., more equipment match, better level alignment), they dominate the selection. The engine can run out of slots before reaching legs or core.

**Relevant flow (selectExercises):**

```javascript
// 60% primary (skill + compound), 40% secondary (accessory + isolation)
const primaryPool = [...byPriority.skill, ...byPriority.compound];
primaryPool.sort((a, b) => b.score - a.score);
const primaryCount = Math.min(Math.ceil(count * 0.6), primaryPool.length);
selected.push(...primaryPool.slice(0, primaryCount));
// ... fill remaining with secondary
```

There is no step that ensures "at least 1 legs" or "at least 1 core". The budget is not allocated per domain.

### Architectural Changes Needed

1. **Domain-aware selection:** For `full_body`, iterate over `['push', 'pull', 'legs', 'core']` and reserve at least 1 exercise (and a minimum set budget) per domain before filling remaining slots.
2. **Reserve-first allocation:** Allocate `min(1, domainPool.length)` per domain, then distribute remaining slots by score.
3. **Fallback:** If a domain has no exercises (e.g., no legs equipment), log a warning and skip—but do not silently omit legs when exercises exist.

---

## 5. Exercise Order (Compound vs. Isolation)

### Documented Behavior (TRAINING_LOGIC.md)

- **Rule 3.1:** "Full Body: Warmup → Push Compound → Pull Compound → Legs → Core."
- **Rule 3.3:** "Slot 1 (Golden Slot): Skill/Power. Never superset. Fresh CNS. Slot 2 (Compounds): Antagonist Pairs. Slot 3 (Accessory): High volume, shorter rest."

### Current Implementation

**Finding: Ordering is by priority only (skill → compound → accessory → isolation). No compound-first sequencing within compounds, no domain order (Push → Pull → Legs → Core).**

| Step | Location | Logic |
|------|----------|-------|
| **Sort** | WorkoutGenerator line 515-518 | `workoutExercises.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])`. |
| **Priority** | classifyPriority() | `skill` > `compound` > `accessory` > `isolation` (inferred from tags/movementType). |

**Within the same priority group, order is undefined** (stable sort preserves insertion order). So:

- All compounds are grouped together, but Pull-ups and Squats are not necessarily before isolation.
- There is no "Push → Pull → Legs → Core" ordering.
- No distinction between "heavy compound" (e.g., Pull-ups) and "light compound" (e.g., Push-ups) for ordering.

**TRAINING_LOGIC.md specifies:** Warmup → Push Compound → Pull Compound → Legs → Core. The current sort does not enforce this.

### Architectural Changes Needed

1. **Domain-aware ordering:** Within compounds, order by domain sequence: Push → Pull → Legs → Core.
2. **Heavy compound first:** Within a domain, prefer exercises with higher `recommendedLevel` or `mechanicalType === 'straight_arm'` earlier.
3. **Slot-based ordering:** Align with blueprint slots: Warmup → Golden (skill) → Compounds (push, pull, legs) → Accessory → Core → Cooldown.

---

## Summary Table

| # | Issue | Current Behavior | Doc Alignment | Fix Priority |
|---|-------|------------------|---------------|--------------|
| 1 | Warmup | First exercise used as warmup when no role-based warmup | ❌ | High |
| 2 | Set distribution | Uniform scaling; no compound-first | ❌ | High |
| 3 | Antagonist pairing | Protocol selected but not applied | ❌ | High |
| 4 | Full body coverage | Score-based; no domain guarantee | ❌ | High |
| 5 | Exercise order | Priority only; no domain sequence | ❌ | Medium |

---

## References

- `TRAINING_LOGIC.md` — Rules 2.2, 2.3, 3.1, 3.2, 3.3
- `WORKOUT_ENGINE_SPECS.md` — Sections 3.1, 3.2
- `src/features/workout-engine/logic/WorkoutGenerator.ts`
- `src/features/workout-engine/services/home-workout.service.ts`
- `src/features/workout-engine/logic/ContextualEngine.ts`
- `src/features/workouts/components/WorkoutPreviewDrawer.tsx`
- `src/features/workout-engine/core/types/blueprint.types.ts`
