# composeHybridSession — Engine Design v1.0

> Status: DESIGN — approved decisions locked (David, 08.07.2026). No code yet.
> Basis: research report (strength generator + aerobic mechanism, 08.07.2026)
> + composition model v0.1 + David's decisions on the 7 open questions
> + WHO weekly guidelines + Self-Determination Theory framing.
> Governing laws: Workout_Engine_Truth.md LAW 0 (pure TS), XP_Progression_Truth.md LAW 0
> (XP formulas are David-owned — the hybrid XP line is PENDING, do not invent).

---

## 0. Locked decisions (do not re-litigate)

| # | Decision |
|---|---|
| 1 | Auto-with-edit: engine composes; user can swap exercise (existing SwapEngine) / route |
| 2 | Default emphasis = `weekly_smart` (fills WHO gap); 3 manual presets (aerobic/balanced/strength) as override |
| 3 | Entry point MVP: FreeRunDrawer, pre-workout, with the recommendation line; geofence suggestion = later phase |
| 4 | Same engine for beginners via "טיול כושר" entry (walking + flow-tier strength) |
| 5 | Station rest × 0.5 (existing blast mechanism) EXCEPT advanced holds/skill (planche/handstand/front-lever families) → full tier rest |
| 6 | Strength calories: MET estimate (no more 0). Hybrid XP = aerobic XP + strength XP + small completion bonus — exact line WAITS for David in XP_Progression_Truth |
| 7 | Stations are FLEXIBLE, not capped at a constant: count = f(strength time × emphasis), bounded by the stations available on the route, user-editable. Range 1 (single block) to 3-4 (circuit sweep). The "mode" DERIVES from the count — no separate mode flag. Default 8-12 min per station |

WHO weekly targets the engine tracks: aerobic 150–300 min moderate (75–150 vigorous,
1 vigorous ≡ 2 moderate) + strength ≥2 days/week covering all major muscle groups.

SDT mapping: competence → one simple default CTA + one-line "why" (the WHO gap);
autonomy → preset/goal overrides always visible; relatedness → plan model stays
group-composable (groupId/attendanceId already on the workout doc).

---

## 1. Placement, purity & THE ARCHITECTURAL LAW

`src/features/workout-engine/hybrid/compose-hybrid-session.service.ts`
Pure TypeScript per LAW 0: no hooks, no Firebase, all data as arguments.
Callers (drawer / orchestrator) fetch and pass everything.

**COMPOSITION-LAYER-ONLY (mandatory, David 08.07.2026):**
composeHybridSession COMPOSES — it never re-implements. It calls the EXISTING
strength engine (WorkoutGenerator + its tiers/time-model) and the EXISTING
aerobic mechanisms (pace-map zones, RunBlock, route utils) and only splits
budget / orders segments / fits the route. Zero duplicated exercise-selection,
volume, timing or pace logic. Single source of truth: a fix in the shared
engine fixes standalone strength + hybrid + the block-builder ("צור אימון")
at once — the generator's block mode (§5 build item 2) is the SAME building
block all three consume.

**UI COROLLARY:** the hybrid pre-workout UI is a COMPOSITION of existing
pieces — the aerobic drawer components (route / time / park-transition) +
the strength page components (muscles / program / difficulty). No new screen
from scratch.

---

## 2. API

```ts
export type HybridEmphasis = 'weekly_smart' | 'aerobic' | 'balanced' | 'strength';
export type AerobicKind = 'walking' | 'running';

/** Computed by weekly-load.service (caller side) from the workouts collection. */
export interface WeeklyLoadSnapshot {
  aerobicModerateEquivMin: number;   // walking min + 2 × running min (WHO equivalence)
  strengthDays: number;              // distinct days with a strength segment
  domainSetsThisWeek: Record<'push' | 'pull' | 'legs' | 'core', number>;
}

export interface HybridComposeInput {
  timeBudgetMin: number;                       // user budget, e.g. 40
  emphasis: HybridEmphasis;                    // default 'weekly_smart'
  aerobicKind: AerobicKind;
  paceProfile: PaceProfile;                    // basePace + profileType (1-4)
  programLevels: Map<string, number>;          // buildUserProgramLevels() output
  route: Route;                                // path + facilityStops (isHybrid)
  equipmentByStop: Record<string, GymEquipment[]>; // stopId → park equipment
  exercisePool: Exercise[];                    // pre-filtered by caller (level-aware filter)
  weeklyLoad: WeeklyLoadSnapshot;
  userWeightKg: number;
}

export interface HybridPlan {
  /** planned{} matches SessionSegmentRecord (storage.service.ts) — the Phase-0 doc shape. */
  segments: HybridPlannedSegment[];
  totals: { aerobicMin: number; strengthMin: number; distanceKm: number;
            estCalories: number; stations: number };
  meta: {
    emphasisResolved: Exclude<HybridEmphasis, 'weekly_smart'>;
    /** One-line SDT competence hook for the drawer, e.g. "חסרות לך 40 דק' אירובי ויום כוח השבוע". */
    whoGapNote: string | null;
  };
}

export interface HybridPlannedSegment {
  index: number;
  kind: 'aerobic' | 'strength';
  // aerobic
  aerobicType?: AerobicKind;
  zone?: RunZoneType;                          // walk zone fixed for walking
  targetPaceSecPerKm?: { min: number; max: number };
  durationSec?: number;
  distanceKm?: number;
  fromWaypointIdx?: number; toWaypointIdx?: number;
  // strength
  stationStopId?: string; parkId?: string;
  domainFocus?: 'push' | 'pull' | 'legs_core';
  exercises?: WorkoutExercise[];               // full sets/reps/rest from generator
  estDurationSec?: number;
}
```

---

## 3. Algorithm

### Step 1 — Resolve emphasis (`weekly_smart`)
```
aerobicGapMin  = max(0, 150 − weeklyLoad.aerobicModerateEquivMin)
strengthGapDays = max(0, 2 − weeklyLoad.strengthDays)
neglectedDomains = domains with domainSetsThisWeek == 0 (priority list)

resolve:
  strengthGapDays ≥ 1 AND aerobicGapMin == 0       → 'strength'
  aerobicGapMin ≥ 60  AND strengthGapDays == 0     → 'aerobic'
  otherwise                                         → 'balanced'
whoGapNote = human sentence from the two gaps (null if both met → "שימור")
```
Manual preset overrides skip Step 1 (autonomy) but whoGapNote is still computed
for display.

### Step 2 — Budget split
```
aerobic 70/30 · balanced 55/45 · strength 35/65   (aerobic/strength of timeBudgetMin)
```

### Step 3 — Stations (flexible, decision 7)
```
S_suggested = clamp(round(T_str / 10), 1, min(4, route.facilityStops.length))
S = userStationOverride ?? S_suggested          // autonomy: user-editable
perStationMin = clamp(T_str / S, 8, 12)         // default window 8-12 min
// The "mode" derives from S — no flag:
//   S = 1  → single block (בלוק)   S ≥ 2 → circuit sweep (סבב)
```
`HybridComposeInput` gains `stationOverride?: number`.

### Step 4 — Domain focus per station
Order stations by `neglectedDomains` first (weekly_smart), else push → pull → legs_core.
Skill/CNS-heavy work goes to the EARLIEST station (freshest — mirrors Golden Slot law).

### Step 4b — GENERIC STOP MODEL (vision guardrail, David 08.07.2026)
A stop is generic on TWO independent axes — never hard-code "stop = strength
station":

```ts
export type StopLocationKind =
  | 'gym' | 'bench' | 'stairs' | 'viewpoint' | 'spring'
  | 'scenic' | 'dog_park' | 'open_area';
export type StopActivityKind =
  | 'strength' | 'mobility' | 'stretch' | 'core' | 'yoga'
  | 'meditation' | 'rest_view';

export interface HybridStop {
  stopId: string; parkId?: string;
  location: { kind: StopLocationKind; lat: number; lng: number; waypointIndex: number };
  activityType: StopActivityKind;
  /** Gear-id list available at THIS stop (normalized). Bodyweight-only = []. */
  availableEquipment: string[];
  /** Produced by the activity-type dispatcher below. */
  content: StrengthBlockResult /* | MobilityBlock | YogaContent | … (future) */;
}
```

**Content dispatch by activityType** — the composer routes each stop to a
content generator; TODAY only one exists: `strength → generateStrengthBlock`.
Future kinds (mobility / yoga / rest_view → other generators or curated
content, incl. agent-pulled POIs) plug into the same dispatch WITHOUT engine
rewrites. Experience stops (יוגה בתצפית) are a content plugin, not a fork.

**Equipment flow (verified in code, 08.07.2026):** the equipment axis is
ALREADY generic end-to-end. `ContextualEngine.filterAndScore` receives
`availableEquipment: string[]` (normalized gear-ids, ContextualEngine.ts:534-538)
and filters execution methods against it. The composer therefore builds a
PER-STOP pool — `filterAndScore(masterPool, { …, location: 'park',
availableEquipment: stop.availableEquipment })` — and hands it to
`generateStrengthBlock`, which by contract takes a pre-filtered pool and
never builds pools. A bench/stairs stop passes `['bench']` / `['stairs']`
(+ implicit bodyweight) and yields only matching exercises — no
block-service change needed.

### Step 5 — Strength block per station (reuse the generator)
Call WorkoutGenerator in a new **block mode** (build item — see §5):
- `availableTime = perStationMin` → existing DURATION_SCALING ≤10 tier: 2-3 exercises, no accessories.
- `location='park'`, equipment = `equipmentByStop[stop]`, `domainBudgets` = station focus.
- Post-pass:
  - strip warmup/cooldown appends (the surrounding aerobic legs are the warmup/cooldown);
  - rest × 0.5 (existing blast multiplier) EXCEPT tier hard/elite or isometric-skill
    exercises (mechanicalType straight_arm / handstand family) → full tier rest (decision 5);
  - estimate with the existing time model (3 s/rep, ×2 unilateral, 30 s transitions);
    overshoot > 2 min → applySmartSetCap (exists).

### Step 6 — Aerobic legs
```
legs = S + 1;  legMin = T_aer / legs
zones: first = warmup  (walking: fixed walk zone · running: jogging/easy)
       middle = easy   (balanced/strength) | tempo (aerobic emphasis, running only)
       last  = recovery (running) | walk (walking)
legKm = legMin / zoneMidpointPace(paceProfile, zone)     // walk zone: fixed 8:30–11:30
```

### Step 7 — Route fit (the waypointIndex→distance bridge)
- Prefix-sum haversine over `route.path` → cumulative km per vertex (new small util).
- Map each facilityStop.waypointIndex → km-along-route.
- Choose the S stops whose gaps best match legKm targets (tolerance ±25%).
- No fit → S−1 and retry; S==0 → ONE `fieldReady` bodyweight station at the route
  midpoint (no equipment needed — existing exercise flag).

### Step 8 — Calories
- Aerobic: existing `km × kg × 1.036`.
- Strength (decision 6): duty-cycle MET —
  `kcal/min = MET × 3.5 × kg / 200`, effective MET = workShare × workMET + restShare × 1.5,
  with workMET by tier: flow/easy 3.8 · match 5.0 · hard/elite 8.0 (ACSM calisthenics
  moderate/vigorous anchors).
  ⚠️ ECONOMY GUARD: `earnedCoins = floor(calories)` when the coin flag is on — the MET
  values therefore touch the coin economy. Wire strength-calories to DISPLAY first;
  wiring to coins waits for David's sign-off together with the XP line.

### Step 9 — Output
`HybridPlan.segments[*].planned` is byte-compatible with `SessionSegmentRecord.planned`
(Phase 0) → the orchestrator writes actuals into the same shape; the closed loop
(planned-vs-actual → level updates → next composition) needs no new schema.

XP: NOT computed here. `awardWorkoutXP` line for hybrid is David-owned — pending.

---

## 4. Sanity example — 40 min, balanced, runner P2 (basePace 6:30)
- Strength 18 min → 2 stations × 9 min (2-3 exercises, ~3 sets, rests 60-75 s).
- Aerobic 22 min → 3 legs ≈ 7 min: warmup jogging ~0.8 km · easy ~0.9 km · recovery ~0.8 km.
- Route target ≈ 2.6-2.8 km with 2 stations at ~0.9 km spacing (±25%).
- Walking variant ("טיול כושר"): same skeleton, walk zone → ~1.8 km, flow-tier stations.

---

## 5. Build order (implementation phase — separate approvals)
1. `weekly-load.service.ts` — WeeklyLoadSnapshot from the workouts collection
   (segments[] gives per-unit data; per-day activity type comes from workout docs).
2. Generator **block mode** flag: skip warmup/cooldown append + no session-ownership
   assumptions (StrengthRunner already accepts a block via onComplete — Phase-0 audit).
   ⚠️ SHARED building block: this same mode powers the hybrid stations AND the
   "צור אימון" block-builder — design its API for both consumers from day one.
3. Route prefix-distance util (waypointIndex → km).
4. `compose-hybrid-session.service.ts` (pure, unit-testable with fixtures).
5. FreeRunDrawer entry: "המשולב של היום" card (whoGapNote line + preset override) +
   "טיול כושר" entry point. Geofence suggestion = later phase (decision 3).
6. Orchestrator (route ↔ station state machine — already designed in the Phase-1 plan).

## 6. Approvals status (updated 08.07.2026)
- [x] MET → coins: APPROVED.
- [x] Running 1:2 toward the WHO moderate target: APPROVED (matches WHO vigorous equivalence).
- [x] Station-fit tolerance ±25%: APPROVED.
- [x] ~~Station cap~~ — RESOLVED (decision 7): flexible 1-4, derived + user-editable.
- [ ] **Hybrid XP line — BLOCKING GATE for build start.** Approved shape:
  `hybridXP = aerobicXP + strengthXP + completionBonus%`. Proposed final number:
  **completionBonus = 5%** (anchored to the existing economy: persistence bonus
  caps at 3%, RPE/first-session bonuses are single-digit — "small bonus" scale).
  David writes the line in XP_Progression_Truth; until it exists, NO XP code.
- [ ] "טיול כושר" naming/branding final (not build-blocking).

## 7. Repo note
This design doc rides on `feat/climb-layer-moderation` (David's call, 08.07.2026)
and merges to main with the climbs work. Code review of that branch: focus on
the moderation code — this doc is design-only, out of review scope.
