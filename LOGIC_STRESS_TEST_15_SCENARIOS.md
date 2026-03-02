# Logic Stress Test: 15 User Scenarios

**Document Purpose:** Blueprint for the new Workout Engine architecture. For each scenario: Current Path, Gap, and Pivot Potential.

**Version:** 1.0 | **Date:** Feb 2025 | **Based on:** Phase 2 Deep Audit

---

## Summary Table

| # | Scenario | Status | Current Path | Gap | Pivot Potential |
|---|----------|--------|--------------|-----|-----------------|
| 1 | Leg-Refuser | **Logic-Broken** | No muscle exclusion | No preference for 0 legs | Admin: `excludedMuscleGroups` in user profile |
| 2 | Skill-Addict | **Logic-Broken** | No frequency cap | Handstand 7x/week allowed | Admin: `maxSkillDaysPerWeek` rule |
| 3 | Minimalist | **Partially-Handled** | Equipment from profile | No "refuse equipment" override | Admin: `equipmentPreference: 'bodyweight_only'` |
| 4 | Core-Junkie | **Logic-Broken** | Fixed duration scaling | No "add 20 min abs" | Admin: `extraCoreMinutes` preference |
| 5 | Extreme Optimist | **Logic-Broken** | No validation | L1 + 7 days accepted | Admin: `maxFrequencyByLevel` threshold |
| 6 | Busy Pro | **Partially-Handled** | Duration scaling exists | 15 min + elite = poor fit | Admin: `minDurationByLevel` rule |
| 7 | Ghost | **Partially-Handled** | daysInactive > 3 → 40% vol | No re-ghost detection | Admin: `consecutiveReturns` tracking |
| 8 | Late-Nighter | **System-Handled** | isLateNightPivot → 15 min | Circadian warning missing | Admin: optional `circadianWarning` |
| 9 | Over-Estimator | **Partially-Handled** | SwapEngine + too_hard x2 | TrackingMatrix not persisted | Fix: Wire swap → progression.domains |
| 10 | Plateaued | **Logic-Broken** | No plateau detection | 4 weeks no level-up ignored | Admin: `plateauWeeksThreshold` + nudge |
| 11 | Asymmetrical | **System-Handled** | Shadow Tracking per domain | Works | — |
| 12 | Injured | **Partially-Handled** | injuryShield from profile | No real-time "mark during workout" | Add: mid-session injury toggle |
| 13 | Traveler | **Partially-Handled** | equipmentOverride, location | No "today only" context | Add: `sessionEquipmentOverride` |
| 14 | Distracted | **Partially-Handled** | Early exit exists | No partial-completion learning | Add: `partialCompletionRatio` to progression |
| 15 | Under-Achiever | **Logic-Broken** | PostWorkoutSurvey "too easy" | Not persisted; first 3 only | Fix: Persist + nudge level-up |

---

## Category A: The Specialists (Preferences vs. Balance)

### 1. The Leg-Refuser
**Profile:** Level 17 Upper Body, explicitly wants 0 leg exercises.

| Aspect | Detail |
|--------|--------|
| **Current Path** | ContextualEngine filters by program (push/pull/upper_body). Full-body and upper-body programs include legs. No user preference for "exclude legs" exists. The engine selects exercises from the active program's domains; if program is full_body or upper_body+legs, legs are included. |
| **The Gap** | No `excludedMuscleGroups` or `excludedDomains` in user profile. Schedule/program assignment doesn't support "upper body only" as an explicit preference. Users cannot opt out of leg work. |
| **Pivot Potential** | **Yes.** Add `user.lifestyle.excludedMuscleGroups?: MuscleGroup[]` or `excludedDomains?: TrainingDomainId[]`. ContextualEngine already has `passesInjuryShield`; add `passesMuscleExclusion(exercise, excludedGroups)`. Admin Rule Engine could support `EXCLUDE_DOMAIN` action for questionnaire-derived preferences. |

---

### 2. The Skill-Addict
**Profile:** Wants Handstand training 7 days a week (risk of overtraining).

| Aspect | Detail |
|--------|--------|
| **Current Path** | No per-exercise-type or per-movement-pattern frequency cap. The engine generates workouts based on schedule; if user has 7 training days, they get 7 workouts. Skill exercises (handstand, planche, etc.) are selected when they match level and program. No CNS/skill-recovery logic. |
| **The Gap** | TRAINING_LOGIC Rule #20: "Skill sessions include Golden Slot" — but no rule limiting skill frequency. Overtraining risk (wrist, shoulder, CNS) is not modeled. |
| **Pivot Potential** | **Yes.** Add `program_level_settings.skillFrequencyCap` or a `workout_rules` collection rule: `maxSkillDaysPerWeek: 3`. WeeklyVolumeStore could track `skillSessionCount` and gate skill inclusion when cap is hit. Admin-configurable. |

---

### 3. The Minimalist
**Profile:** High level, but refuses all equipment even if stuck in a plateau.

| Aspect | Detail |
|--------|--------|
| **Current Path** | Equipment comes from `user.equipment.[home|office|outdoor]`. If empty, engine defaults to `['bodyweight']`. User can have empty equipment lists → bodyweight-only. No explicit "I refuse to use equipment" flag. |
| **The Gap** | User might have equipment in profile (from onboarding) but wants bodyweight-only. No override. Plateau: no plateau detection, so "stuck" isn't detected. |
| **Pivot Potential** | **Yes.** Add `user.lifestyle.equipmentPreference?: 'all' | 'bodyweight_only' | 'minimal'`. When `bodyweight_only`, pass `equipmentOverride: ['bodyweight']` to generateHomeWorkout. Admin could add a questionnaire question that sets this. Plateau handling is separate (Scenario 10). |

---

### 4. The Core-Junkie
**Profile:** Wants an extra 20 mins of abs on top of a 60-min session.

| Aspect | Detail |
|--------|--------|
| **Current Path** | Duration scaling is fixed: `DURATION_SCALING` maps 5/15/30/45/60 min → exercise count. No "add extra core" or "extend session" option. Core exercises are part of the normal mix (priority: skill → compound → accessory → isolation). |
| **The Gap** | No `extraCoreMinutes` or `coreEmphasis` preference. Session structure is rigid. User cannot request "60 min + 20 min abs." |
| **Pivot Potential** | **Yes.** Add `availableTime` override or `extraDomains: [{ domain: 'core', minutes: 20 }]`. WorkoutGenerator would need to support append logic. Admin: `lifestyle.coreEmphasis` or questionnaire-derived. |

---

## Category B: The Realists (Expectations vs. Reality)

### 5. The Extreme Optimist
**Profile:** Beginner (Level 1) requesting 7-day-a-week frequency.

| Aspect | Detail |
|--------|--------|
| **Current Path** | ScheduleStep allows 1–7 days. No validation against level. Program thresholds map level → program, not level → max frequency. User can select 7 days at L1. |
| **The Gap** | TRAINING_LOGIC implies 2 days → Full Body, 3 → Undulating, 4 → Split. No enforcement. Beginner doing 7 days risks burnout/injury. No `maxFrequencyByLevel` or similar. |
| **Pivot Potential** | **Yes.** Add `program_thresholds` or new `frequency_rules`: `{ levelRange: [1,5], maxDaysPerWeek: 4 }`. ScheduleStep could warn or cap. Assessment rules could inject a "frequency sanity check" question. |

---

### 6. The Busy Pro
**Profile:** Elite Level (20), but only has 15 mins, 2x a week.

| Aspect | Detail |
|--------|--------|
| **Current Path** | `DURATION_SCALING['15']` → 4–5 exercises, no accessories. Works. Volume is reduced. But elite level + 15 min = very condensed; may feel unsatisfying. No "minimum effective dose" guidance. |
| **The Gap** | No `minDurationByLevel` rule. Elite user with 15 min gets a stripped workout; engine doesn't suggest "consider 30 min for better results" or adjust expectations. |
| **Pivot Potential** | **Yes.** Add `program_level_settings.minRecommendedMinutes` or a soft warning when `availableTime < 20 && userLevel > 15`. Admin-configurable. |

---

### 7. The Ghost
**Profile:** Inactive for 14 days, returns for 1 day, disappears again.

| Aspect | Detail |
|--------|--------|
| **Current Path** | `daysInactive > 3` → 40% volume reduction, detraining lock (max 2 bolts). Works for first return. No tracking of "returned then left again." |
| **The Gap** | No "consecutive returns" or "re-ghost" detection. If user comes back after 14 days, does 1 workout, leaves for 14 more — next return still gets same 40% reduction. No escalation (e.g. "simplified reactivation protocol"). |
| **Pivot Potential** | **Yes.** Add `progression.lastReturnDate` and `consecutiveShortReturns`. When pattern detected, could trigger a different flow (e.g. maintenance-only mode). Admin rule: `reactivationProtocol` based on history. |

---

### 8. The Late-Nighter
**Profile:** Starts a high-intensity session at 11 PM (circadian mismatch).

| Aspect | Detail |
|--------|--------|
| **Current Path** | `isLateNightPivot(trainingTime)` → when hour ≥ 20, `availableTime: 15` is passed. Condensed 15-min compound-only workout. **Works.** |
| **The Gap** | No explicit "circadian warning" (e.g. "Late training may affect sleep"). Purely behavioral condensing, not educational. |
| **Pivot Potential** | **Yes.** Add optional `circadianWarning: boolean` in workout metadata. UI can show a soft message. Low priority. |

---

## Category C: The Adapters (Performance vs. Progression)

### 9. The Over-Estimator
**Profile:** High level in profile, but swaps every hard exercise for an easier one.

| Aspect | Detail |
|--------|--------|
| **Current Path** | SwapEngine: "Too Hard" x2 → permanent downgrade (TrackingMatrix). ExerciseReplacementModal offers lower/same/higher variations. **But:** TrackingMatrix is not persisted to Firestore. Shadow-level.utils uses `progression.domains`/tracks, not TrackingMatrix. So swap downgrade is **session-only** in practice. |
| **The Gap** | Phase 1 audit: "TrackingMatrix persistence" missing. SwapEngine.applyPermanentSwap updates an in-memory matrix that is never written to user profile. Next workout still uses old domain levels. |
| **Pivot Potential** | **Yes.** Wire SwapEngine persistence to `progression.domains` or a new `progression.movementOverrides` map. When user swaps "too hard" x2, write `domains[push].currentLevel -= 1` (or equivalent). Code change, not Admin. |

---

### 10. The Plateaued
**Profile:** Completes all sets/reps but hasn't increased intensity in 4 weeks.

| Aspect | Detail |
|--------|--------|
| **Current Path** | No plateau detection. Progression tracks level-up via double progression (reps → level). If user never hits upper rep range, they never level up. No "weeks since last level-up" metric. |
| **The Gap** | No plateau logic. User could be stuck at same weight/variation for months with no nudge (e.g. "Try adding 1 rep" or "Consider next progression"). |
| **Pivot Potential** | **Yes.** Add `progression.plateauWeeks` or derive from `lastLevelUpDate`. When `plateauWeeks >= 4`, inject a nudge (UI or workout metadata). Admin: `plateauWeeksThreshold` in program_level_settings. |

---

### 11. The Asymmetrical
**Profile:** Level 15 Push / Level 3 Pull.

| Aspect | Detail |
|--------|--------|
| **Current Path** | Shadow Tracking: `getEffectiveLevelForExercise` maps movementGroup/primaryMuscle → domain level. Push exercises use push level (15), pull exercises use pull level (3). **Works.** |
| **The Gap** | None. System handles this. |
| **Pivot Potential** | — |

---

### 12. The Injured
**Profile:** Marks "Shoulder Pain" during the workout.

| Aspect | Detail |
|--------|--------|
| **Current Path** | Injury shield from `user.health.injuries` (profile). ContextualEngine excludes exercises with `injuryShield` overlapping user injuries. Pre-workout only. |
| **The Gap** | No **real-time** "I feel pain now" during workout. User would need to go to profile, add shoulder, regenerate. Swap modal has "injury" reason but that finds variations, doesn't update profile for rest of session. |
| **Pivot Potential** | **Yes.** Add "Report pain" button in StrengthRunner → add to session-scoped `injuryOverride` → filter remaining exercises. Optionally persist to `health.injuries` for future. |

---

### 13. The Traveler
**Profile:** Usually gym-based, but today has 0 equipment (park/hotel).

| Aspect | Detail |
|--------|--------|
| **Current Path** | `location` + `equipmentOverride` in generateHomeWorkout. Caller can pass `location: 'park'` and `equipmentOverride: ['bodyweight']` to force no-equipment. StatsOverview uses `sessionStorage.currentWorkoutLocation` and profile's `lifestyle.locationPreference`. |
| **The Gap** | No "today only" context. User would need to change profile or use a "Travel mode" toggle. No one-tap "I'm at a hotel, no equipment" for this session only. |
| **Pivot Potential** | **Yes.** Add `sessionEquipmentOverride` or "Travel mode" in pre-workout flow. Passes `equipmentOverride: ['bodyweight']` for this generation only. Doesn't persist to profile. |

---

### 14. The Distracted
**Profile:** Starts a 45-min session but hits "Finish Early" after 15 mins.

| Aspect | Detail |
|--------|--------|
| **Current Path** | Early exit exists (StrengthRunner `handleEarlyExit`). Workout completion can be partial. `processWorkoutCompletion` receives `completedExercises` and can compute partial completion. MessageService has `partial_workout` type for "quit early" messaging. |
| **The Gap** | No **learning** from partial completion. Does the engine reduce next workout's length? No. Does it track "user often quits at 15 min" to suggest shorter default? No. |
| **Pivot Potential** | **Yes.** Add `progression.partialCompletionRatio` or `avgCompletedDuration`. When high, suggest shorter default (e.g. 20 min instead of 45). Admin: optional `adaptToPartialCompletion` flag. |

---

### 15. The Under-Achiever
**Profile:** High level, always marks "Too Easy" but never increases load.

| Aspect | Detail |
|--------|--------|
| **Current Path** | PostWorkoutSurvey: "Too Easy" → +5% progress bonus, suggests level-up. **But:** Survey only shows for first 3 sessions (`MAX_SESSIONS_FOR_SURVEY = 3`). After that, no feedback loop. "Too Easy" is not persisted to Firestore. Progression level-up is driven by double progression (reps), not by survey. |
| **The Gap** | Survey is early-journey only. Veteran user with "too easy" pattern has no channel. No automatic level-up from consistent "too easy" feedback. |
| **Pivot Potential** | **Yes.** (1) Extend survey to all sessions (or add compact always-visible feedback). (2) Persist "too easy" to profile. (3) When streak of "too easy" (e.g. 3 sessions), nudge level-up or auto-suggest next progression. Admin: `tooEasyStreakThreshold`. |

---

## Architecture Recommendations

1. **User Preferences Layer:** Add `user.lifestyle` extensions: `excludedMuscleGroups`, `equipmentPreference`, `coreEmphasis`, `extraCoreMinutes`.
2. **Session Context:** Support `sessionEquipmentOverride`, `sessionInjuryOverride` for one-off changes.
3. **Persistence Fixes:** Wire SwapEngine "too hard" persistence to `progression.domains` or equivalent. Extend PostWorkoutSurvey persistence.
4. **Rule Engine Extension:** Create `workout_rules` or extend `program_level_settings` for: `maxSkillDaysPerWeek`, `maxFrequencyByLevel`, `minDurationByLevel`, `plateauWeeksThreshold`, `tooEasyStreakThreshold`.
5. **Real-Time Injury:** Add "Report pain" flow in StrengthRunner with session-scoped filtering.
6. **Learning Loops:** Track `partialCompletionRatio`, `plateauWeeks`, `consecutiveShortReturns` for adaptive suggestions.

---

*End of Logic Stress Test*
