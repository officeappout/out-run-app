# Exercise Catalog — Data Audit

> **Status:** read-only data audit. No Firestore writes, no migrations, no value fixes.
> Produced by `scripts/audit/exercise-catalog-audit.ts` — run again after any content
> change to get a fresh snapshot; this file is a point-in-time report, not live.
> Grounded in [`01-MAP.md`](01-MAP.md) §4 (schema), §7 (filter sites), §9 (core).

## Methodology & simplifications (read before the numbers)

- **Raw Firestore data, not `getAllExercises()`.** That function runs every doc through
  `normalizeExercise()`, which backfills several of the exact fields this audit measures
  as missing (e.g. `secondsPerRep` defaults to 3, `base_movement_id` defaults to
  `'unspecified_movement'`). Reading raw `doc.data()` shows what is actually stored.
- **"Missing" for array fields** (`targetPrograms`, `execution_methods`, `injuryShield`)
  means the field is absent, `null`, or an empty array — consistent with how the task
  framed `execution_methods` ("ריק לגמרי ⇒ לעולם לא ייבחר"), applied uniformly.
- **CLIFF/THIN/OK** use `count_within_tolerance_3` (exercises within ±3 levels of the row's
  level, for that programId, with a viable method at that location) — not the exact-level
  count — because that is what the two real production thresholds actually gate on:
  `CLIFF` mirrors `InputSanitizerMiddleware.ts:457` (`levelMatched.length >= 4` else the
  whole level filter is abandoned); `THIN` mirrors `PoolFactory.ts`'s `MIN_HEALTHY_POOL = 6`
  (below this, `PoolRescue` widens tolerance to ±5). **Simplification flagged explicitly:**
  in production, the `CLIFF` check (`InputSanitizerMiddleware`) runs *before* location
  filtering and is location-agnostic, while `THIN` (`PoolFactory`) runs *after*
  `ContextualEngine`, which does apply location. This report evaluates both thresholds
  per-location for uniform, actionable granularity — read a CLIFF cell as "would be a
  catastrophic pre-filter abandon if this were the only location-relevant slice," not as
  a literal reproduction of the location-agnostic pre-filter step.
- **Location viability** uses the real production selector `selectMethodForContext`
  (`shared/utils/method-selection.utils.ts`), called directly — not reimplemented — with a
  baseline gear set per location: `ESSENTIAL_PARK_GEAR` for park, `ASSUMED_HOME_GEAR` for
  home/office/school (matching the default-on `ASSUMED_HOME_GEAR_ENABLED` flag), and no
  baseline gear (bodyweight-only) for street/gym/airport/library/desk/service. A real
  user's actual gear/park inventory will do better than this baseline in many cases — these
  numbers are a conservative floor, not a promise of what any specific user sees.
- **Core detector (§5)** is a verbatim inline port of the canonical
  `exerciseMatchesProgram(ex, 'core')` (`shadow-level.utils.ts:213-227`). Its
  `resolveToSlug` calls are satisfied by this script's own id→slug map, built directly from
  live `programs` docs using the exact same formula as production's
  `buildIdToSlugMapFromPrograms` (`program-hierarchy.utils.ts:108-125`) — not an
  approximation.
- **`programId`s in the coverage matrix (§3)** are only those actually found in the catalog's
  `targetPrograms`/`programIds` fields (resolved through the id→slug map above) — nothing
  hardcoded from truth docs.
- Nothing below was fixed. This is a map of the problem, not a remediation.

---

## 1. Totals

**Total exercises: 373**

### By `lang`

| lang | count | % |
|---|---|---|
| (missing — defaults to he) | 373 | 100.0% |

### By `supportedLangs`

| supportedLangs | count | % |
|---|---|---|
| (empty — he-only) | 373 | 100.0% |

---

## 2. Missing critical fields

| Field | Missing count | % of catalog | Note |
|---|---|---|---|
| `targetPrograms` | 70 | 18.8% | ⚠️ empty ⇒ falls back to `recommendedLevel || 1` at read time (`workout-selection.utils.ts:95-97`), NOT a flat 1 — see the breakdown below |
| `movementGroup` | 72 | 19.3% | used for Smart Swap family + core/legs detection |
| `primaryMuscle` | 79 | 21.2% | used for core/legs detection, hold-time tier |
| `execution_methods` | 1 | 0.3% | 🔴 completely empty ⇒ this exercise can NEVER be selected (no viable method exists) |
| `mechanicalType` | 175 | 46.9% | used for SA/BA balance scoring |
| `injuryShield` | 166 | 44.5% | used for injury-shield hard exclusion — empty may be a legitimate "no risk" state, not necessarily a gap |
| `noiseLevel` | 102 | 27.3% | used for noise-limit hard exclusion |
| `sweatLevel` | 102 | 27.3% | used for sweat-limit hard exclusion |
| `symmetry` | 94 | 25.2% | unilateral doubles duration estimate — missing skews time budgeting |
| `secondsPerRep` | 96 | 25.7% | defaults to 3 at generation time via a DIFFERENT code path (`normalizeExercise`) — this row shows the raw-data gap, not the runtime behavior |

**Exercises with NEITHER `targetPrograms` NOR legacy `programIds`: 70 (18.8%)** — these are invisible to the entire
program-level system: they contribute to no cell in the §3 coverage matrix and can only
ever be selected via non-program-based paths (warmup/cooldown role, recovery pool, tag-only
pools like `hiit_friendly` for Tabata — see `01-MAP.md` §7.9).

---

## 3. Coverage Matrix — programId × level × location

Full matrix (1071 rows) is in [`02-coverage-matrix.csv`](02-coverage-matrix.csv).
Programs found in the catalog: core, front_lever, full_body, handstand, handstand_pushup, human_flag, legs, muscle_up, one_arm_pullup, planche, pull, push, upper_body.
Locations found in the catalog: airport, gym, home, office, park, service, street.

**146 CLIFF cells, 88 THIN cells, 837 OK cells** (of 1071 total).

Sorted ascending by level (low-to-mid levels affect the most users first).

### CLIFF cells (< 4 exercises within ±3 levels, at that location)

| programId | level | location | count_within_tolerance_3 | exact-level count |
|---|---|---|---|---|
| handstand | 1 | airport | 0 | 0 |
| handstand | 1 | gym | 0 | 0 |
| handstand | 1 | home | 0 | 0 |
| handstand | 1 | office | 0 | 0 |
| handstand | 1 | park | 0 | 0 |
| handstand | 1 | service | 0 | 0 |
| handstand | 1 | street | 0 | 0 |
| handstand_pushup | 1 | airport | 2 | 0 |
| handstand_pushup | 1 | gym | 2 | 0 |
| handstand_pushup | 1 | home | 2 | 0 |
| handstand_pushup | 1 | office | 2 | 0 |
| handstand_pushup | 1 | park | 1 | 0 |
| handstand_pushup | 1 | service | 2 | 0 |
| handstand_pushup | 1 | street | 2 | 0 |
| human_flag | 1 | airport | 2 | 0 |
| human_flag | 1 | gym | 3 | 1 |
| human_flag | 1 | home | 2 | 0 |
| human_flag | 1 | office | 2 | 0 |
| human_flag | 1 | park | 2 | 1 |
| human_flag | 1 | service | 2 | 0 |
| human_flag | 1 | street | 2 | 0 |
| handstand | 2 | airport | 2 | 0 |
| handstand | 2 | gym | 2 | 0 |
| handstand | 2 | home | 2 | 0 |
| handstand | 2 | office | 2 | 0 |
| handstand | 2 | park | 2 | 0 |
| handstand | 2 | service | 2 | 0 |
| handstand | 2 | street | 2 | 0 |
| handstand_pushup | 2 | airport | 3 | 0 |
| handstand_pushup | 2 | gym | 3 | 0 |
| handstand_pushup | 2 | home | 3 | 0 |
| handstand_pushup | 2 | office | 3 | 0 |
| handstand_pushup | 2 | park | 2 | 0 |
| handstand_pushup | 2 | service | 3 | 0 |
| handstand_pushup | 2 | street | 3 | 0 |
| human_flag | 2 | airport | 2 | 1 |
| human_flag | 2 | gym | 3 | 1 |
| human_flag | 2 | home | 2 | 1 |
| human_flag | 2 | office | 2 | 1 |
| human_flag | 2 | park | 2 | 0 |
| human_flag | 2 | service | 2 | 1 |
| human_flag | 2 | street | 2 | 1 |
| handstand | 3 | airport | 3 | 0 |
| handstand | 3 | gym | 3 | 0 |
| handstand | 3 | home | 3 | 0 |
| handstand | 3 | office | 3 | 0 |
| handstand | 3 | park | 3 | 0 |
| handstand | 3 | service | 3 | 0 |
| handstand | 3 | street | 3 | 0 |
| handstand_pushup | 3 | park | 3 | 1 |
| human_flag | 3 | airport | 2 | 1 |
| human_flag | 3 | gym | 3 | 1 |
| human_flag | 3 | home | 2 | 1 |
| human_flag | 3 | office | 2 | 1 |
| human_flag | 3 | park | 2 | 1 |
| human_flag | 3 | service | 2 | 1 |
| human_flag | 3 | street | 2 | 1 |
| handstand | 4 | airport | 3 | 0 |
| handstand | 4 | gym | 3 | 0 |
| handstand | 4 | home | 3 | 0 |
| handstand | 4 | office | 3 | 0 |
| handstand | 4 | park | 3 | 0 |
| handstand | 4 | service | 3 | 0 |
| handstand | 4 | street | 3 | 0 |
| handstand_pushup | 4 | park | 3 | 0 |
| human_flag | 4 | airport | 2 | 0 |
| human_flag | 4 | home | 2 | 0 |
| human_flag | 4 | office | 2 | 0 |
| human_flag | 4 | park | 3 | 0 |
| human_flag | 4 | service | 2 | 0 |
| human_flag | 4 | street | 2 | 0 |
| handstand | 5 | airport | 3 | 2 |
| handstand | 5 | gym | 3 | 2 |
| handstand | 5 | home | 3 | 2 |
| handstand | 5 | office | 3 | 2 |
| handstand | 5 | park | 3 | 2 |
| handstand | 5 | service | 3 | 2 |
| handstand | 5 | street | 3 | 2 |
| human_flag | 5 | airport | 2 | 0 |
| human_flag | 5 | gym | 3 | 0 |
| human_flag | 5 | home | 2 | 0 |
| human_flag | 5 | office | 2 | 0 |
| human_flag | 5 | park | 2 | 0 |
| human_flag | 5 | service | 2 | 0 |
| human_flag | 5 | street | 2 | 0 |
| handstand | 6 | airport | 3 | 1 |
| handstand | 6 | gym | 3 | 1 |
| handstand | 6 | home | 3 | 1 |
| handstand | 6 | office | 3 | 1 |
| handstand | 6 | park | 3 | 1 |
| handstand | 6 | service | 3 | 1 |
| handstand | 6 | street | 3 | 1 |
| human_flag | 6 | airport | 1 | 0 |
| human_flag | 6 | home | 1 | 0 |
| human_flag | 6 | office | 1 | 0 |
| human_flag | 6 | service | 1 | 0 |
| human_flag | 6 | street | 1 | 0 |
| human_flag | 7 | airport | 0 | 0 |
| human_flag | 7 | home | 0 | 0 |
| human_flag | 7 | office | 0 | 0 |
| human_flag | 7 | service | 0 | 0 |
| human_flag | 7 | street | 0 | 0 |
| human_flag | 8 | airport | 0 | 0 |
| human_flag | 8 | home | 0 | 0 |
| human_flag | 8 | office | 0 | 0 |
| human_flag | 8 | service | 0 | 0 |
| human_flag | 8 | street | 0 | 0 |
| handstand | 9 | airport | 2 | 0 |
| handstand | 9 | gym | 2 | 0 |
| handstand | 9 | home | 2 | 0 |
| handstand | 9 | office | 2 | 0 |
| handstand | 9 | park | 2 | 0 |
| handstand | 9 | service | 2 | 0 |
| handstand | 9 | street | 2 | 0 |
| human_flag | 9 | airport | 0 | 0 |
| human_flag | 9 | home | 0 | 0 |
| human_flag | 9 | office | 0 | 0 |
| human_flag | 9 | service | 0 | 0 |
| human_flag | 9 | street | 0 | 0 |
| handstand | 10 | airport | 1 | 1 |
| handstand | 10 | gym | 1 | 1 |
| handstand | 10 | home | 1 | 1 |
| handstand | 10 | office | 1 | 1 |
| handstand | 10 | park | 1 | 1 |
| handstand | 10 | service | 1 | 1 |
| handstand | 10 | street | 1 | 1 |
| handstand_pushup | 10 | park | 3 | 1 |
| human_flag | 10 | airport | 0 | 0 |
| human_flag | 10 | home | 0 | 0 |
| human_flag | 10 | office | 0 | 0 |
| human_flag | 10 | service | 0 | 0 |
| human_flag | 10 | street | 0 | 0 |
| handstand_pushup | 11 | airport | 3 | 1 |
| handstand_pushup | 11 | gym | 3 | 1 |
| handstand_pushup | 11 | home | 3 | 1 |
| handstand_pushup | 11 | office | 3 | 1 |
| handstand_pushup | 11 | park | 3 | 1 |
| handstand_pushup | 11 | service | 3 | 1 |
| handstand_pushup | 11 | street | 3 | 1 |
| core | 18 | airport | 2 | 1 |
| core | 18 | gym | 2 | 1 |
| core | 18 | home | 2 | 1 |
| core | 18 | office | 2 | 1 |
| core | 18 | park | 3 | 1 |
| core | 18 | service | 2 | 1 |
| core | 18 | street | 2 | 1 |

### THIN cells (4–5 exercises within ±3 levels, at that location)

| programId | level | location | count_within_tolerance_3 | exact-level count |
|---|---|---|---|---|
| muscle_up | 1 | airport | 4 | 2 |
| muscle_up | 1 | gym | 4 | 2 |
| muscle_up | 1 | home | 4 | 2 |
| muscle_up | 1 | office | 4 | 2 |
| muscle_up | 1 | park | 4 | 2 |
| muscle_up | 1 | service | 4 | 2 |
| muscle_up | 1 | street | 4 | 2 |
| muscle_up | 2 | airport | 4 | 2 |
| muscle_up | 2 | gym | 4 | 2 |
| muscle_up | 2 | home | 4 | 2 |
| muscle_up | 2 | office | 4 | 2 |
| muscle_up | 2 | park | 4 | 2 |
| muscle_up | 2 | service | 4 | 2 |
| muscle_up | 2 | street | 4 | 2 |
| handstand_pushup | 3 | airport | 4 | 1 |
| handstand_pushup | 3 | gym | 4 | 1 |
| handstand_pushup | 3 | home | 4 | 1 |
| handstand_pushup | 3 | office | 4 | 1 |
| handstand_pushup | 3 | service | 4 | 1 |
| handstand_pushup | 3 | street | 4 | 1 |
| muscle_up | 3 | airport | 5 | 0 |
| muscle_up | 3 | gym | 5 | 0 |
| muscle_up | 3 | home | 5 | 0 |
| muscle_up | 3 | office | 5 | 0 |
| muscle_up | 3 | park | 5 | 0 |
| muscle_up | 3 | service | 5 | 0 |
| muscle_up | 3 | street | 5 | 0 |
| handstand_pushup | 4 | airport | 5 | 1 |
| handstand_pushup | 4 | gym | 5 | 1 |
| handstand_pushup | 4 | home | 5 | 1 |
| handstand_pushup | 4 | office | 5 | 1 |
| handstand_pushup | 4 | service | 5 | 1 |
| handstand_pushup | 4 | street | 5 | 1 |
| human_flag | 4 | gym | 4 | 0 |
| handstand_pushup | 5 | park | 4 | 1 |
| handstand_pushup | 6 | park | 4 | 1 |
| human_flag | 6 | gym | 5 | 0 |
| human_flag | 6 | park | 4 | 0 |
| handstand | 7 | airport | 4 | 0 |
| handstand | 7 | gym | 4 | 0 |
| handstand | 7 | home | 4 | 0 |
| handstand | 7 | office | 4 | 0 |
| handstand | 7 | park | 4 | 0 |
| handstand | 7 | service | 4 | 0 |
| handstand | 7 | street | 4 | 0 |
| handstand_pushup | 7 | park | 4 | 0 |
| human_flag | 7 | gym | 5 | 1 |
| human_flag | 7 | park | 4 | 1 |
| handstand | 8 | airport | 4 | 0 |
| handstand | 8 | gym | 4 | 0 |
| handstand | 8 | home | 4 | 0 |
| handstand | 8 | office | 4 | 0 |
| handstand | 8 | park | 4 | 0 |
| handstand | 8 | service | 4 | 0 |
| handstand | 8 | street | 4 | 0 |
| handstand_pushup | 8 | park | 5 | 1 |
| human_flag | 8 | gym | 5 | 0 |
| human_flag | 8 | park | 4 | 0 |
| handstand_pushup | 9 | airport | 5 | 0 |
| handstand_pushup | 9 | gym | 5 | 0 |
| handstand_pushup | 9 | home | 5 | 0 |
| handstand_pushup | 9 | office | 5 | 0 |
| handstand_pushup | 9 | park | 4 | 0 |
| handstand_pushup | 9 | service | 5 | 0 |
| handstand_pushup | 9 | street | 5 | 0 |
| human_flag | 9 | gym | 5 | 3 |
| human_flag | 9 | park | 4 | 2 |
| handstand_pushup | 10 | airport | 4 | 1 |
| handstand_pushup | 10 | gym | 4 | 1 |
| handstand_pushup | 10 | home | 4 | 1 |
| handstand_pushup | 10 | office | 4 | 1 |
| handstand_pushup | 10 | service | 4 | 1 |
| handstand_pushup | 10 | street | 4 | 1 |
| human_flag | 10 | gym | 5 | 1 |
| human_flag | 10 | park | 4 | 1 |
| planche | 11 | park | 4 | 1 |
| core | 16 | airport | 5 | 0 |
| core | 16 | gym | 5 | 0 |
| core | 16 | home | 5 | 0 |
| core | 16 | office | 5 | 0 |
| core | 16 | service | 5 | 0 |
| core | 16 | street | 5 | 0 |
| core | 17 | airport | 5 | 0 |
| core | 17 | gym | 5 | 0 |
| core | 17 | home | 5 | 0 |
| core | 17 | office | 5 | 0 |
| core | 17 | service | 5 | 0 |
| core | 17 | street | 5 | 0 |

---

## 4. Coverage Matrix — location × movementGroup

For each (location, movementGroup) pair: total exercises with that movementGroup, and how
many have a viable `execution_method` at that location (via the real `selectMethodForContext`
selector, baseline gear per the methodology note above).

| location | movementGroup | total exercises | viable at location | % viable |
|---|---|---|---|---|
| airport | (none) | 72 | 71 | 98.6% |
| airport | core | 54 | 45 | 83.3% |
| airport | flexibility | 2 | 2 | 100.0% |
| airport | hinge | 19 | 19 | 100.0% |
| airport | horizontal_pull | 43 | 40 | 93.0% |
| airport | horizontal_push | 38 | 38 | 100.0% |
| airport | isolation | 6 | 6 | 100.0% |
| airport | squat | 52 | 52 | 100.0% |
| airport | vertical_pull | 51 | 49 | 96.1% |
| airport | vertical_push | 36 | 36 | 100.0% |
| gym | (none) | 72 | 71 | 98.6% |
| gym | core | 54 | 51 | 94.4% |
| gym | flexibility | 2 | 2 | 100.0% |
| gym | hinge | 19 | 19 | 100.0% |
| gym | horizontal_pull | 43 | 40 | 93.0% |
| gym | horizontal_push | 38 | 38 | 100.0% |
| gym | isolation | 6 | 6 | 100.0% |
| gym | squat | 52 | 52 | 100.0% |
| gym | vertical_pull | 51 | 49 | 96.1% |
| gym | vertical_push | 36 | 36 | 100.0% |
| home | (none) | 72 | 71 | 98.6% |
| home | core | 54 | 45 | 83.3% |
| home | flexibility | 2 | 2 | 100.0% |
| home | hinge | 19 | 19 | 100.0% |
| home | horizontal_pull | 43 | 40 | 93.0% |
| home | horizontal_push | 38 | 38 | 100.0% |
| home | isolation | 6 | 6 | 100.0% |
| home | squat | 52 | 52 | 100.0% |
| home | vertical_pull | 51 | 49 | 96.1% |
| home | vertical_push | 36 | 36 | 100.0% |
| office | (none) | 72 | 71 | 98.6% |
| office | core | 54 | 45 | 83.3% |
| office | flexibility | 2 | 2 | 100.0% |
| office | hinge | 19 | 19 | 100.0% |
| office | horizontal_pull | 43 | 40 | 93.0% |
| office | horizontal_push | 38 | 38 | 100.0% |
| office | isolation | 6 | 6 | 100.0% |
| office | squat | 52 | 52 | 100.0% |
| office | vertical_pull | 51 | 49 | 96.1% |
| office | vertical_push | 36 | 36 | 100.0% |
| park | (none) | 72 | 70 | 97.2% |
| park | core | 54 | 46 | 85.2% |
| park | flexibility | 2 | 2 | 100.0% |
| park | hinge | 19 | 12 | 63.2% |
| park | horizontal_pull | 43 | 38 | 88.4% |
| park | horizontal_push | 38 | 30 | 78.9% |
| park | isolation | 6 | 5 | 83.3% |
| park | squat | 52 | 41 | 78.8% |
| park | vertical_pull | 51 | 44 | 86.3% |
| park | vertical_push | 36 | 26 | 72.2% |
| service | (none) | 72 | 71 | 98.6% |
| service | core | 54 | 45 | 83.3% |
| service | flexibility | 2 | 2 | 100.0% |
| service | hinge | 19 | 19 | 100.0% |
| service | horizontal_pull | 43 | 40 | 93.0% |
| service | horizontal_push | 38 | 38 | 100.0% |
| service | isolation | 6 | 6 | 100.0% |
| service | squat | 52 | 52 | 100.0% |
| service | vertical_pull | 51 | 49 | 96.1% |
| service | vertical_push | 36 | 36 | 100.0% |
| street | (none) | 72 | 71 | 98.6% |
| street | core | 54 | 45 | 83.3% |
| street | flexibility | 2 | 2 | 100.0% |
| street | hinge | 19 | 19 | 100.0% |
| street | horizontal_pull | 43 | 40 | 93.0% |
| street | horizontal_push | 38 | 38 | 100.0% |
| street | isolation | 6 | 6 | 100.0% |
| street | squat | 52 | 52 | 100.0% |
| street | vertical_pull | 51 | 49 | 96.1% |
| street | vertical_push | 36 | 36 | 100.0% |

### Park-specific hard rejections (method-selection.utils.ts:154-166)

**57 exercise(s)** are tagged `location='park'` (or `locationMapping`
includes `park`) but their park-tagged method(s) all fail equipment gating against
`ESSENTIAL_PARK_GEAR`, AND no bodyweight/surface method exists either — these are hard-
rejected (`selectMethodForContext` returns `null`) and dropped from the pool entirely at a
baseline park, regardless of the exercise's content otherwise being ready.

| exercise_id | name |
|---|---|
| 01HnnltgrzYyUMECUELx | דדליפט רגל אחת כנגד גומייה |
| 2HozkIAOCD401ia4dSrH | שרימפ סקוואט עמוק בלי ידיים |
| 3sR44gVtDlzdot9Yq7MQ | גליל בטן אקצנטרי |
| 3zffAO0k2ZaHs0WkkQuT | פרונט לבר רגל אחת בעזרת גומייה |
| 4YCuuEsNVwUcxNxp3m9H | החזקת מקבילים ב-120° עם גומייה |
| 4rDvdGHq9KAxewpBe4Mg | דרגון סקוואט מוגבה |
| 7ocGV3FbYbue9nXC8aXh | החזקת מקבילים ב-90° עם גומייה |
| 862hyZowOu16yxls8MWf | שכיבות סמיכה פייק עמוקות גובה אגן |
| 8vGnuoSH3MMkYKnxjg1P | סקוואט כנגד גומייה |
| CFhoMTpjSMjXAlUG4xFw | מתח עם גומייה עבה |
| CYEuO2uRt1QBCr5e2khC | כפיפת ברך כנגד גומייה |
| DWiXoX8UHKQiAS1ye40c | דגל ב-45° |
| DsKs15sWsVm33GaQI9Ty | דדליפט רומני בהתנגדות גומייה |
| DyNJgiO3Y70xKMf48HER | פרונט לבר בפישוק עם גומייה |
| FU3FAudvpYTZqYU0m8GV | דגל בעזרת גומייה |
| GWXRsgNHry3dgqpTwCWS | פלאנץ׳ בטאק בעזרת גומייה דקה |
| HFdBVEtBQfpx4EYeLe7j | מתח יד אחת עם גומייה |
| HQdH6XZltGsDSkUBBdGH | סקוואט בעזרת רצועות |
| HSYxn9dL4d9nUImW3Y7G | לחיצה מישיבת L לפלנאץ׳ בטאק |
| J7wQr1CCzBM3HGqZH2co | חתירות פרונט לבר בטאק מתקדם בעזרת גומייה |
| KXt9e7KXCi6teocBmhHR | מקבילים עם גומייה דקה |
| LKNAvIpuj9EtO3wUzFeV | נורדיק אחורי בעזרת גומייה |
| LO3I1YoeYOUtt4AuzWy6 | סיסי סקוואט טווח חלקי |
| Nr5P0Q3N7A0DffKjMVRn | שרימפ סקוואט בלי ידיים טווח חלקי |
| Ox23f2tVbvGoly8Syr3o | פיסטול סקוואט מוגבה |
| SI8PrjIAPoALx97w2aI1 | מקבילים עם גומייה עבה |
| SVWvr2YKMtQN3SJiqWmY | החזקת מקבילים ב-15° עם גומייה |
| SZqzS51lNqHDjgG0guxA | הרמות תאומים טווח מלא רגל אחת |
| TXeGlGA7ECHGKQIhlcs7 | היפ טראסט מוגבה |
| UsdsWvP2QPERD0S0lJVI | מתח עם גומייה בינונית |
| W69akLqaO2HD6y9ydzKe | פלאנץ׳ יהלום בעזרת גומייה דקה |
| WQBYjQxJEc9Y6FWHigTH | עמידת פייק גובה ברך |
| WfIRO7kYSBP26ZgoByDX | פלאנץ׳ בטאק מתקדם בעזרת גומייה דקה |
| YU8AOc8KWfRH9eJZaEJs | קראנץ כל הגוף |
| ZJKCzG7wOjMdJUyI9Jhz | שכיבות סמיכה קשתים עם רצועות |
| ZyLOv94JNxsC3urlqMMw | מתח עם גומייה דקה |
| awTUBO1WaFwllqE2XSwX | פרונט לבר יהלום עם גומייה |
| dfhTg6POZm0fp2L5zo6Z | מקבילים עם גומייה בינונית |
| ggzAxOz0vT3SOObT3Y7q | קופנהגן פלאנק |
| gzj8eefE4V0Ec4BlvTP2 | מתח מתפרץ עם גומייה בינונית |
| iuwmGaZnuvhZ1mZFXJyt | גליל בטן עם תמיכת הברכיים |
| kb1MB9It40iDOrR1aacW | לחיצה מישיבת L לפייק |
| kdBsatNKmG0HIgxsJg9R | שרימפ סקוואט טווח חלקי |
| nbEECAsr8OciKBVbKkET | טבטה מאתגר  |
| oIOh1yoQtRmVb3zr3Kf9 | עליית כוח בעזרת גומייה |
| oLzPZ7rQMdOUgGuVr1os | פשיטת ירך אחורית |
| pgF5rdC4szYH0xGDoZWj | פרונט לבר בטאק מתקדם עם גומייה |
| rrqnDaeeVW1j1sdva2Wj | פרפר רצועות ב-45° |
| s3kFyaLCqNnyvbAs8QdA | דדליפט רומני על הגבהה |
| sgmx86BRQqbUm0RpXBQM | היפ טראסט מוגבה רגל אחת |
| t3J7gdxcnsVPVi3QGDmH | כפיפת נורדיק בעזרת גומייה |
| tdwkQuP5IeaId31mengH | פיסטול סקוואט מוגבה טווח חלקי |
| tk7WiobxvhIGxqcpU2ab | מקבילים על טבעות בעזרת גומיה דקה |
| tnblRsRC1YpVT2n4lLXd | שכיבות סמיכה רצועות ב-45° |
| wL1vJsWuey9JFRnJMcBC | עליית כוח על טבעות בעזרת גומייה |
| wQ6ocm6HRKtQ7CFpZI6A | שכיבות סמיכה פייק גובה שוק |
| xAkMGXWV55BfE3oVS2K0 | עליית מדרגה גובה קרסול |

---

## 5. Core Exercises

**55 exercises** identified as core by the canonical detector
(`exerciseMatchesProgram(ex, 'core')`, `shadow-level.utils.ts:213-227`).

| exercise_id | name | has targetPrograms[core] level? | movementGroup | primaryMuscle | matched via |
|---|---|---|---|---|---|
| 0vBLmiJuZnq6djGSa5LD | דגל פלאנק צידי | **missing** | core | shoulders | movementGroup=core, name/tags string match ("פלאנק") |
| 1OEFeykCym2378rgD4QK | כפיפות בטן | 2 | core | abs | movementGroup=core, primaryMuscle=abs, targetPrograms resolves to "core", name/tags string match ("בטן") |
| 3sR44gVtDlzdot9Yq7MQ | גליל בטן אקצנטרי | 12 | core | abs | movementGroup=core, primaryMuscle=abs, targetPrograms resolves to "core", name/tags string match ("בטן") |
| 5LGfy2EB72CeLhQDcnY6 | דרגון פלאג בטאק | 14 | core | abs | movementGroup=core, primaryMuscle=abs, targetPrograms resolves to "core" |
| 5cdQOV3Kl5EpnyUt1JuG | כפיפות בטן חצי טווח | 1 | core | abs | movementGroup=core, primaryMuscle=abs, targetPrograms resolves to "core", name/tags string match ("בטן") |
| 6OPvBxXMTy0mHYNra4Wc | סיבובי רגליים בשכיבה | 6 | core | abs | movementGroup=core, primaryMuscle=abs, targetPrograms resolves to "core" |
| 8YpK2KnydcB6Oz1zTMSh | פלאנק רגל ויד נגדית | 5 | core | abs | movementGroup=core, primaryMuscle=abs, targetPrograms resolves to "core", name/tags string match ("פלאנק") |
| Ao3amXO9YEBEOSE48RRi | ישיבת L ברכיים כפופות | 7 | core | abs | movementGroup=core, primaryMuscle=abs, targetPrograms resolves to "core" |
| BLbgAyNJSZCc4YsoOxtP | החזקת הולו באדי | 6 | core | abs | movementGroup=core, primaryMuscle=abs, targetPrograms resolves to "core" |
| BWbscvj0m3hvxghEMtKV | פלאנק עליות ונגיעות בכתפיים | **missing** | core | shoulders | movementGroup=core, name/tags string match ("פלאנק") |
| CVMlbYHJTiJKSPYkZ9Lk | רגליים למתח | 14 | core | abs | movementGroup=core, primaryMuscle=abs, targetPrograms resolves to "core" |
| DWiXoX8UHKQiAS1ye40c | דגל ב-45° | **missing** | core | shoulders | movementGroup=core |
| FHh3m3suMMtoLk1PrxYv | פלאנק | **missing** | core | abs | movementGroup=core, primaryMuscle=abs, name/tags string match ("פלאנק") |
| FSbQ2OfFSDzWxGOSRljt | דגל אקצנטרי בטאק | **missing** | core | shoulders | movementGroup=core |
| FU3FAudvpYTZqYU0m8GV | דגל בעזרת גומייה | **missing** | core | shoulders | movementGroup=core |
| IEoGYRVKRxjaA0fQZNDw | ישיבת L רגל אחת | 10 | core | abs | movementGroup=core, primaryMuscle=abs, targetPrograms resolves to "core" |
| LxyBLJUs5ryW7fgrDPba | דרגון פלאג בפישוק | 18 | core | abs | movementGroup=core, primaryMuscle=abs, targetPrograms resolves to "core" |
| Ma6QH3kwbEZoIiME7r0K | ישיבת L | 12 | core | abs | movementGroup=core, primaryMuscle=abs, targetPrograms resolves to "core" |
| OSXBFYoP1sWt4P05isJw | כפיפות בטן אלכוסונים | 3 | core | obliques | movementGroup=core, primaryMuscle=obliques, targetPrograms resolves to "core", name/tags string match ("בטן") |
| PBpgwYAqyAPwGd276lny | ישיבת L על הרצפה | 14 | core | abs | movementGroup=core, primaryMuscle=abs, targetPrograms resolves to "core" |
| PMZewv23o1W4ZP01jo95 | הרמות רגל אחת בישיבת L | 4 | core | abs | movementGroup=core, primaryMuscle=abs, targetPrograms resolves to "core" |
| RxpMhnXQBW80jq1no41f | שולחן הפוך | **missing** | core | shoulders | movementGroup=core |
| Tr4sEMGrkRtv85IuvE2q | ישיבת L דינמית | 10 | core | abs | movementGroup=core, primaryMuscle=abs, targetPrograms resolves to "core" |
| USsalIBvXkxyITk7bRR1 | פלאנק רחוק | 8 | core | back | movementGroup=core, targetPrograms resolves to "core", name/tags string match ("פלאנק") |
| WJIrY4OW1QgfhTeNLvNS | דגל בפישוק | **missing** | core | shoulders | movementGroup=core |
| WLP7RzGley7svZbbIzAW | טבטה + | 8 | core | abs | movementGroup=core, primaryMuscle=abs, targetPrograms resolves to "core" |
| XWL3TUAVmN0Dmp2btFgN | ישיבת L בתמיכת הרגליים | 3 | core | abs | movementGroup=core, primaryMuscle=abs, targetPrograms resolves to "core" |
| YU8AOc8KWfRH9eJZaEJs | קראנץ כל הגוף | 8 | core | abs | movementGroup=core, primaryMuscle=abs, targetPrograms resolves to "core" |
| Z3DNlwJAulyI28a8Kji7 | עליות ספר רגליים ישרות | 8 | core | abs | movementGroup=core, primaryMuscle=abs, targetPrograms resolves to "core" |
| ZHf9ELBPf9NpASCygL1n | טבטה | 4 | core | abs | movementGroup=core, primaryMuscle=abs, targetPrograms resolves to "core" |
| bRUKaSg9p9Tl1rCzEiV4 | עליות ברכיים כפופות בתלייה | 8 | core | abs | movementGroup=core, primaryMuscle=abs, targetPrograms resolves to "core" |
| fg0NDJmRtK2RPXU7gHqr | דגל נמוך | **missing** | core | shoulders | movementGroup=core |
| ggzAxOz0vT3SOObT3Y7q | קופנהגן פלאנק | 7 | core | abs | movementGroup=core, primaryMuscle=abs, targetPrograms resolves to "core", name/tags string match ("פלאנק") |
| iEZGhtBNV7Tv5iNuT70E | פלאנק על הברכיים | **missing** | core | abs | movementGroup=core, primaryMuscle=abs, name/tags string match ("פלאנק") |
| iuwmGaZnuvhZ1mZFXJyt | גליל בטן עם תמיכת הברכיים | 7 | core | abs | movementGroup=core, primaryMuscle=abs, targetPrograms resolves to "core", name/tags string match ("בטן") |
| jbwq5lw6oIF0G6vDJ1D9 | טבטה מאתגר + | 16 | core | abs | movementGroup=core, primaryMuscle=abs, targetPrograms resolves to "core" |
| kbxV76kyWw1nL3i8Mewi | דגל אנושי | **missing** | core | shoulders | movementGroup=core |
| lGZxrjALhrrGWxnwNOTW | ספר ברכיים כפופת | 5 | core | abs | movementGroup=core, primaryMuscle=abs, targetPrograms resolves to "core" |
| mIEhyPgMAxSryv46CZ2f | פלאנק גבוה טבעות | 7 | core | abs | movementGroup=core, primaryMuscle=abs, targetPrograms resolves to "core", name/tags string match ("פלאנק") |
| mMW69g4YfMnlNGuLQgne | הרמות רגליים בישיבת פייק/L | 8 | core | abs | movementGroup=core, primaryMuscle=abs, targetPrograms resolves to "core" |
| nNc7TeLC8LtaVQJeK4Tf | כפיפות ברכים בפלאנק על trx | 6 | core | abs | movementGroup=core, primaryMuscle=abs, targetPrograms resolves to "core", name/tags string match ("פלאנק") |
| nbEECAsr8OciKBVbKkET | טבטה מאתגר  | 12 | core | abs | movementGroup=core, primaryMuscle=abs, targetPrograms resolves to "core" |
| ovwmeDEgpucFfaVQGpR7 | מספרים בשכיבה | 4 | — | abs | primaryMuscle=abs, targetPrograms resolves to "core" |
| qRoLtKTPXF3CJsQ9hMTg | פינגווינים | 3 | core | obliques | movementGroup=core, primaryMuscle=obliques, targetPrograms resolves to "core" |
| qhIpGmdbCe3uv5bKRPQK | מספריים אופקיים בשכיבה | 4 | core | abs | movementGroup=core, primaryMuscle=abs, targetPrograms resolves to "core" |
| qnSex7AN2TXhTiytUXX8 | דרגון פלאג בטאק מתקדם | 15 | core | abs | movementGroup=core, primaryMuscle=abs, targetPrograms resolves to "core" |
| tWZ1PnXwUFZKOZFqvyp9 | מטפס הרים | 4 | core | abs | movementGroup=core, primaryMuscle=abs, targetPrograms resolves to "core" |
| tXXikNYiAIcK3yPgybF1 | עליות רגליים בשכיבה | 5 | core | abs | movementGroup=core, primaryMuscle=abs, targetPrograms resolves to "core" |
| uRelXXhk4iDsccOxuTsj | קראנץ | 2 | core | abs | movementGroup=core, primaryMuscle=abs, targetPrograms resolves to "core" |
| vVTTFbDP1LffViDAQfHn | כפיפת ירך על הגבהה | **missing** | core | quads | movementGroup=core |
| wBv3BWfJD0S9sSUnI1Ay | עליות l בתלייה | 11 | core | abs | movementGroup=core, primaryMuscle=abs, targetPrograms resolves to "core" |
| wDUc5pDs5ufm3B5a0MqY | כפיפות ברכיים בתלייה אלכסונים | 9 | core | abs | movementGroup=core, primaryMuscle=abs, targetPrograms resolves to "core" |
| wv8E2f5tcgx3A5nHaUbg | תלייה מספרים | 10 | core | abs | movementGroup=core, primaryMuscle=abs, targetPrograms resolves to "core" |
| ycvdr08dAy8xr1p5COyy | דגל בטאק | **missing** | core | shoulders | movementGroup=core |
| zOl1jxCkmI36QwSzMDKF | עליות מספרים בשכיבה | 5 | core | abs | movementGroup=core, primaryMuscle=abs, targetPrograms resolves to "core" |

**13 of 55 canonical-core exercises have no
`targetPrograms` entry with `programId='core'`** — i.e. they are recognized as core by
`movementGroup`/`primaryMuscle`/name-string only, with no explicit core level, so they fall
back to `recommendedLevel || 1` wherever a core level is needed (see §2).

### Drift: canonical-core but NOT trio-detector-core (0 exercises)

These are exercises `exerciseMatchesProgram` classifies as core, but the partial detector in
`trio-modifiers.service.ts:243-246` (`mg==='core' || pm==='core' || pm==='abs'`, which omits
`'obliques'` and never checks `programIds`/`targetPrograms`/name-strings) does not catch —
meaning the "Intense" trio option's core cap (`MAX_CORE=1`, `01-MAP.md` §9.B8) silently
undercounts these as non-core.

_None found._

---

## 6. Invalid Values, Typos, Duplicates

### Invalid enum values (0 exercises affected)

Any raw value in an enum-constrained field (`execution_methods[].location`, `movementGroup`,
`primaryMuscle`, `mechanicalType`) not in the real TypeScript union — this also catches typos
automatically, since a typo will not match a valid enum value.

_None found._

### Duplicate `base_movement_id` (18 groups shared by >1 exercise)

**Not inherently a defect** — `base_movement_id` is designed to group exercise variants (e.g.
all pull-up variations) and HE/EN document pairs, per its own field comment
(`exercise.types.ts`: "grouping exercise variations"). Shown for visibility, sorted by group
size descending — an unusually large group is worth a manual look, a group of 2 (one HE + one
EN doc for the same movement) is expected.

| base_movement_id | count | exercise names |
|---|---|---|
| pistol_squat | 44 | הליכות היפ טראסט; סקוואט; עליית מדרגה גובה ברך; סקוואט טווח חלקי (להגבהה); קפיצה על רגל אחת גובה ברך; גוד מורנינג בישיבה; סקוואט כנגד גומייה; לאנג׳ בולגרי; עליות תאומים; לאנג׳ בהצלבה; סקוואט כנגד קיר רגל אחת; סקוואט בעזרת רצועות; היפ טראסט; סקוואט עמוק; פיסטול סקוואט; פיסטול סקוואט מוגבה; קפיצה גובה ברך; הרמות תאומים טווח מלא רגל אחת; היפ טראסט מוגבה; עליית מדרגה גובה אגן; פיסטול סקוואט טווח חלקי (להגבהה); לאנג׳ אחורי; קפיצה גובה שוק; קפיצה גובה אגן; סקוואט קשתים טווח חלקי; היפ טראסט ארוך; לאנג׳ בולגרי טווח חלקי; גמישות קרסול לעמוד; היפ טראסט רגל אחת; לחיצת רגליים כנגד עמוד; סקוואט בהונות; לאנג׳ עמוק; סקוואט קשתים; לאנג׳ קדמי; היפ טראסט מוגבה רגל אחת; פיסטול סקוואט מוגבה טווח חלקי; סקוואט קפיצה; החזקת פיסטול סקוואט; כפיפת ירך על הגבהה; סומו סקוואט; סקוואט טווח חלקי; סקוואט קשתים מוגבה; עליית מדרגה גובה קרסול; הרמות תאומים טווח מלא |
| unspecified_movement | 35 | דרגון פלאג בטאק; סיבובי רגליים בשכיבה; כפיפת נורדיק בירך; סיסי סקוואט אקצנטרי; דדליפט רומני; החזקת הולו באדי; כפיפת נורדיק טווח חלקי; רגליים למתח; מתיחות פלג גוף עליון לבדיקה; דרגון פלאג בפישוק; סיסי סקוואט בעזרת קיר; כפיפת נורדיק אקצנטרי; כפיפת מרפקים במשקל גוף 45°; עליות ספר רגליים ישרות; עליות ברכיים כפופות בתלייה; כפיפת מרפקים במשקל גוף 30°; פשיטת מרפקים על ספסל; ספר ברכיים כפופת; כפיפות ברכים בפלאנק על trx; פשיטת ירך אחורית; מספרים בשכיבה; פינגווינים; מספריים אופקיים בשכיבה; דרגון פלאג בטאק מתקדם; סשן התאוששות #1; כפיפת נורדיק; כפיפת נורדיק בעזרת גומייה; מטפס הרים; עליות רגליים בשכיבה; קראנץ; עליות l בתלייה; כפיפות ברכיים בתלייה אלכסונים; תלייה מספרים; פשיטת מרפקים על הרצפה; עליות מספרים בשכיבה |
| pull_up | 32 | תלייה באחיזה עמוקה; החזקת מתח ב-15°; מתח אקצנטרי; מתח צר; מתח טווח תחתון; מתח עם גומייה עבה; מתח קומנדו; תלייה פסיבית בתמיכת הרגליים; מתח לא שוויוני עם טבעות; החזקת מתח ב-15° עם תמיכה; מתח סופינציה; מתח שכמות (תלייה אקטיבית פסיבית); בננה סופרמן על המתח; החזקת מתח ב-90°; מתח עם גומייה בינונית; תלייה פסיבית; מתח עם גומייה דקה; החזקת מתח ב-90° עם תמיכה; מתח שכמות קשתים; מתח שכמות יד אחת; מתח סופינציה מתפרץ; מתח אקצנטרי עם החזקות; מתח טווח עליון; מתח באחיזה מעורבת; מתח קשתים; מתח עם החזקות; מתח שכמות יד אחת עם תמיכה; מתח אקצנטרי עם תמיכה; מתח; החזקת מתח ב-120° עם תמיכה; מתח רחב; החזקת מתח ב-120° |
| push_up | 25 | שכיבות סמיכה ברכיים; שכיבות סמיכה סופינציה; שכיבות סמיכה טווח תחתון; שכיבות סמיכה שיפוע שלילי; שכיבות סמיכה יהלום; שכיבות סמיכה ב-30°; שכיבות סמיכה מתפרץ; שכיבות סמיכה טווח עליון; שכיבות סמיכה ב-15°; פשיטת מרפקים למתקדמים; שכיבות סמיכה בפישוק; שכיבות סמיכה קשתים בפישוק; החזקת שכיבת סמיכה ב-90° במרפק; שכיבות סמיכה קשתים עם רצועות; שכיבות סמיכה ב-45°; שכיבות סמיכה; שכיבות סמיכה מרפקים צמודים; שכיבות סמיכה ספינקס; שכיבות סמיכה אקצנרטי; שכיבות סמיכה קשתים; פרפר רצועות ב-45°; שכיבות סמיכה ב-75°; שכיבות סמיכה רצועות ב-45°; שכיבות סמיכה ב-60°; שכיבות סמיכה רחבות |
| dip | 21 | מקבילים אקצנטרי; החזקת מקבילים ב-120° עם גומייה; החזקת מקבילים ב-90° עם גומייה; החזקת מקבילים ב-15°; מקבילים עם גומייה דקה; מקבילים טווח עליון; החזקת תמיכה על טבעות עם עזרה; מקבילים עם גומייה עבה; החזקת מקבילים ב-15° עם גומייה; החזקת מקבילים ב-90°; מקבילים עם גומייה בינונית; מקבילים; החזקות מקבילים אקצנטרי; החזקת מקבילים ב-120°; מקבילים טווח תחתון; מקבילים בולגריים; מקבילים על מוט; מקבילים על טבעות; החזקת תמיכה על טבעות; מקבילים על טבעות בעזרת גומיה דקה; החזקת מקבילים |
| front_lever | 18 | פרונט לבר רגל אחת בעזרת גומייה; פרונט לבר בפישוק עם גומייה; הרמות פרונט לבר רגל אחת; הרמות פרונט לבר בטאק מתקדם; חתירות פרונט לבר בטאק מתקדם בעזרת גומייה; פרונט לבר יהלום; דדליפט הפוך; חתירות פרונט לבר בטאק; פרונט לבר בפישוק; פרונט לבר מלא; פרונט לבר יהלום עם גומייה; פרונט לבר חצי גוף; הרמות פרונט לבר חצי גוף; פרונט לבר בטאק מתקדם עם גומייה; הרמות פרונט לבר בטאק; הרמות פרונט לבר בפישוק; פרונט לבר בטאק מתקדם; פרונט לבר בטאק |
| row | 17 | חתירות ב-60°; מתח אוסטרלי ב-30° מעלות; משיכות Y; משיכות פנים; חתירות באחיזה עמוקה; חתירות ב-30°; חתירות ב-15°; פרפר הפוך; מתח אוסטרלי ב-15° מעלות; חתירות יד אחת ב-45°; חתירות קשתים ב-45°; חתירות ב-75°; חתירות ב-45°; חתירות ב-15° עם ברכיים כפופות; החזקת חתירה ב-90° מעלות במרפק; חתירות קשתים ב-30°; מתח אוסטרלי ב-60° מעלות |
| handstand | 15 | שכיבות סמיכה שלילי בעמידת ידיים חזה לקיר ; שכיבות סמיכה פייק גובה ברך; שכיבות סמיכה פייק עמוקות גובה אגן; עמידת פייק; הליכות קיר; שכיבות סמיכה פייק; עמידת פייק גובה שוק; עמידת ידיים חזה לקיר; עמידת ידיים חזה לקיר ב-45°; שכיבות סמיכה פייק גובה אגן; עמידת ידיים; שכיבות סמיכה בעמידת ידיים חזה לקיר; עמידת פייק גובה ברך; שכיבות סמיכה פייק גובה שוק; עמידת פייק גובה אגן |
| muscle_up | 12 | עליית כוח בעזרת תנופה; עליית כוח בקפיצה עם טבעות; מתח מתפרץ עם טבעות; מתח מתפרץ גבוה; נדנוד הכנה לעליית כוח; עליית כוח אקצנטרי עם טבעות; עליית כוח עם טבעות; עליית כוח אקצנטרי על מוט; עליית כוח בקפיצה; מתח מתפרץ עם גומייה בינונית; עליית כוח בעזרת גומייה; עליית כוח על טבעות בעזרת גומייה |
| planche | 11 | הישענות פסודו פלאנץ׳; פלאנץ׳ בטאק בעזרת גומייה דקה; לחיצה מישיבת L לפלנאץ׳ בטאק; פלאנץ׳ בטאק; שכיבות סמיכה פלאנץ׳ בטאק מתקדם; פלאנץ׳ בטאק מתקדם ; פלאנץ׳ יהלום בעזרת גומייה דקה; פלאנץ׳ בטאק מתקדם בעזרת גומייה דקה; לחיצה מישיבת L לפייק; שכיבות סמיכה פלאנץ׳ טאק; שכיבות סמיכה פסודו פלאנץ׳ |
| human_flag | 8 | דגל פלאנק צידי; דגל ב-45°; דגל אקצנטרי בטאק; דגל בעזרת גומייה; דגל בפישוק; דגל נמוך; דגל אנושי; דגל בטאק |
| ring_work | 8 | בק לבר; סקין דה קאט אקצנטרי (סיבוב על הטבעות שלילי); סקין דה קאט בטאק (סיבוב על הטבעות בטאק); בק לבר בפישוק; סקין דה קאט חצי גוף (סיבוב על הטבעות חצי גוף); בק לבר בטאק; בק לבר בטאק מתקדם; סקין דה קאט טאק מתקדם |
| shrimp_squat | 7 | שרימפ סקוואט עמוק בלי ידיים; שרימפ סקוואט בעזרת עמוד; שרימפ סקוואט בתמיכת רגל; שרימפ סקוואט בלי ידיים טווח חלקי; שרימפ סקוואט בלי ידיים; שרימפ סקוואט טווח חלקי; שרימפ סקוואט |
| one_arm_pull | 7 | החזקת מתח יד אחת ב-15°; מתח מכונת כתיבה (Typewriter); מתח יד אחת עם גומייה; מתח יד אחת עם חולצה; מתח יד אחת בעזרת אצבעות; החזקת מתח יד אחת ב-90°; החזקת מתח יד אחת ב-120° |
| plank | 7 | פלאנק רגל ויד נגדית; פלאנק עליות ונגיעות בכתפיים; פלאנק; פלאנק רחוק; קופנהגן פלאנק; פלאנק על הברכיים; פלאנק גבוה טבעות |
| l_sit | 6 | ישיבת L ברכיים כפופות; ישיבת L רגל אחת; ישיבת L; ישיבת L על הרצפה; ישיבת L דינמית; הרמות רגליים בישיבת פייק/L |
| crunch | 3 | כפיפות בטן; כפיפות בטן חצי טווח; כפיפות בטן אלכוסונים |
| ab_wheel | 2 | גליל בטן אקצנטרי; גליל בטן עם תמיכת הברכיים |

### Same name + lang (2 groups) — potential accidental duplicates

| name | lang | count | exercise_ids |
|---|---|---|---|
| הליכות דוב | he | 2 | 4GVlUbVr5r9gNdUCKagI; v6DZcJA4vW0tjZTA0bUU |
| הליכות זחל | he | 2 | AdIAFteC2tmYWTPaaDtl; T1XghOTmtU74SeRRg9vb |

---

## Outputs

- [`02-catalog-gaps.csv`](02-catalog-gaps.csv) — one row per exercise with any missing field
  or suspicious value.
- [`02-coverage-matrix.csv`](02-coverage-matrix.csv) — full `programId × level × location`
  matrix.

No values were changed. No migration was run.
