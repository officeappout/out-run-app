# Hybrid (Aerobic + Strength) — Scoping / Readiness Map (Audit, read-only)

> **Status:** RESEARCH MAP — read-only audit, **zero code changed, zero merge**.
> **Date:** 2026-07-12 · **Method:** direct read of the 6 core hybrid files + 4 parallel
> deep-dive passes (aerobic engine, segment seam, data model, UI/wiring). **Every claim cites `file:line`.**
> **Scope:** the **hybrid / combined (aerobic + strength) domain**. The strength generator itself
> is already mapped in [`workout-generator-map.md`](workout-generator-map.md) — read that for the strength side.
> **Honesty caveat:** rigorous *static* trace, not a runtime log (Axiom §11 forbids running dev/build).
> The dry-run harness `scripts/dryrun-hybrid-compose.ts` *can* be run by David to confirm the plan
> shape empirically. Items unresolved statically are marked **OPEN QUESTION**.

---

## ⚠️ 0. Where the code actually lives — read this first (cross-branch reality)

The hybrid work is **NOT one branch**. It is scattered across three worktrees, and the branch
you are currently on (`feat/approval-center-detail-view`) has only a fragment:

| Location | Branch | What it holds |
|---|---|---|
| `appout-1-hybrid` (worktree) | `feat/hybrid-engine` | **The complete engine core** — all 6 files below, committed. This is the canonical hybrid state. |
| `appout-1` (this repo) | `feat/approval-center-detail-view` | Only `HYBRID_ENGINE_DESIGN.md` + `weekly-load.service.ts` are **committed** (9e8a12c, 875cc70). `compose-hybrid-session.service.ts` sits on disk **untracked** here — not on this branch. |
| main | `main` | Design doc + LAW 10 merged (rode the climbs merge). Engine items **not** in main. |
| `appout-1-protocols` (worktree) | `feat/protocol-blocks` | The `aerobic_leg` segment vocabulary (`protocol.types.ts`) — **a different, unmerged branch**. |

**The 6 core hybrid files (all on `feat/hybrid-engine`, verified committed):**
| File | Lines | Commit | Role |
|---|---|---|---|
| `src/features/workout-engine/hybrid/HYBRID_ENGINE_DESIGN.md` | 272 | 875cc70 | Full approved design v1.0 |
| `src/features/workout-engine/hybrid/compose-hybrid-session.service.ts` | 484 | f105ba5 | The composition layer (the seam) |
| `src/features/workout-engine/hybrid/weekly-load.service.ts` | 161 | 81c095e | WHO weekly snapshot |
| `src/features/workout-engine/core/pipeline/strength-block.service.ts` | 176 | 225869f | Shared time-budgeted strength block |
| `src/features/parks/core/services/route-distance.utils.ts` | 107 | 8e1b3bb | waypointIndex ↔ km bridge |
| `scripts/dryrun-hybrid-compose.ts` | 176 | 3debb9f | Read-only dry-run harness |

> **Consequence:** anyone reviewing hybrid on the current branch sees ~⅓ of it. The engine is real
> and complete — but it lives on a side branch and is invisible to the main working tree.

---

## 🔴 TL;DR — the landmines (Hebrew)

1. **המשולב הוא כבר לא רעיון ולא "מחכה לעיצוב" — הוא מנוע בנוי שלא חובר.** יש מסמך עיצוב מלא ומאושר (272 שורות, v1.0, דוד 08.07) + חוק XP כתוב ומאושר (LAW 10) + **ליבת מנוע שלמה שעברה dry-run**. מה שחסר זה **runtime**: אין UI, אין אורקסטרייטור, ואין דאטה אמיתי. זה לא greenfield.
2. **`composeHybridSession` לא נקרא משום מקום חי.** קורא יחיד = סקריפט ה-dry-run (`scripts/dryrun-hybrid-compose.ts:109`). אפס קריאות מקומפוננטה/hook/route. אותו דבר ל-`getWeeklyLoadSnapshot`. המנוע דומם ב-100%.
3. **אין אורקסטרייטור / נגן רב-מקטעי.** נגן הריצה (`useRunningPlayer`) ונגן הכוח (`StrengthRunner`) רצים בבידוד. אין שום קוד שמחליף ריצה→כוח→ריצה באמצע סשן. זה **הפער המרכזי** (build item 6, לא נבנה).
4. **בפרודקשן יש אפס מסלולי `isHybrid`.** (`dryrun-hybrid-compose.ts:39` — ממצא המחבר.) הדבר היחיד שכותב `isHybrid=true` הוא `route-stitching.service.ts:1041,1088` — בזמן ריצה, ולא נשמר ל-Firestore. אין למנוע תחנות אמיתיות לעבוד מולן → ה-field-fallback (תחנת משקל-גוף אחת) הוא מה שיירה בפועל.
5. **הבאג 15→45 של הכוח *לא* מדביק את המשולב.** `generateStrengthBlock` קורא ל-`PipelineOrchestrator` ישירות עם `availableTime=blockMinutes` (`strength-block.service.ts:112,130-131`) — עוקף את לולאת ה-trio ואת `BOLT_DURATION_CAPS`. זה המסלול ה"כן" היחיד (כמו `admin/simulator`). עדיין יורש את דלי ה-`DURATION_SCALING` ואת האקראיות.
6. **מטא-דאטה חסר לערבוב עדין:** לתרגיל **אין** MET-per-exercise, **אין** אזור-דופק, **אין** תג `isCardio` (רק `primaryMuscle:'cardio'`). קלוריות כוח נגזרות מ-MET-per-tier גלובלי (`compose:164`).

---

## 1. Inventory — what exists for "hybrid / combined / cardio" (Q1)

### Real, live (but dormant) hybrid modules
| Symbol | file:line | Live? |
|---|---|---|
| `composeHybridSession()` | `compose-hybrid-session.service.ts:336` | Built · **0 live callers** (dry-run only) |
| `getWeeklyLoadSnapshot()` | `weekly-load.service.ts:101` | Built · **0 live callers** |
| `generateStrengthBlock()` | `strength-block.service.ts:105` | Built · called **only** by the composer |
| route-distance utils | `route-distance.utils.ts:25-106` | Built · called only by the composer |

### The `isHybrid` route concept (declared, runtime-only, never persisted)
| Field | file:line |
|---|---|
| `Route.isHybrid?` / `hybridType?` / `hybridActivities?` / `facilityStops?` | `route.types.ts:351 / 353 / 355 / 357` |
| `FacilityStop` (`waypointIndex`, `lat`, `lng`, `priority`, `type`, `stopType`) | `route.types.ts:424-434` |
| **Only** writer of `isHybrid=true` (runtime synthesis, `facilityStops.length>0`) | `route-stitching.service.ts:1041, 1088` |

### `'hybrid'` enum value — defined everywhere, written nowhere
| Where | file:line | Live use |
|---|---|---|
| `SessionMode` union incl `'hybrid'` | `useSessionStore.ts:8` | type only |
| `WorkoutHistoryEntry.activityType/workoutType/category` incl `'hybrid'` | `storage.service.ts:64-67` | **no live writer** |
| `getWorkoutMetadata('hybrid')` case | `storage.service.ts:157-158` | defensive; never reached |

### There is NO hybrid `intentMode`
`IntentMode = 'normal' | 'blast' | 'on_the_way' | 'field'` (`contextual-engine.types.ts:57-61`).
A hybrid session is **not** an intent — it is a separate composition layer. Correct by design.

---

## 2. The two engines today, and where they meet (Q2)

### Strength side (already mapped — see `workout-generator-map.md`)
`home-workout.service` → trio loop → `PipelineOrchestrator.run` → `WorkoutGenerator.generateWorkout`.
Output = `GeneratedWorkout { exercises: WorkoutExercise[], estimatedDuration, … }`.

### Aerobic / route side
| Hop | file:line |
|---|---|
| Entry: FreeRunDrawer — "התחל חופשי" (free) / "עם מסלול" (route), activity chips run/walk/cycle | `FreeRunDrawer.tsx` (CTAs ~265-299; `setActivityType` :752) |
| Route generation — **fully functional, NOT a stub** | `route-generator.service.ts:102` (`generateDynamicRoutes`) |
| Route selection → start | `DiscoverLayer.tsx:801` (`startActiveWorkout`) |
| Live player store | `players/running/store/useRunningPlayer.ts` |
| **Structured** runs materialize into blocks/zones | `running-engine.service.ts:614` (`materializeWorkout`) → `RunBlock` (`run-block.type.ts:5-37`) |
| Run-workout structure vocabulary (warmup / mainSet `interval|rest|strength` / cooldown) | `running.types.ts:117-136` |

**Output shapes differ by mode:**
- **Free run** = monolithic: one continuous `activeRoutePath` + GPS trace; actuals = laps (distance/time checkpoints), **not** per-zone. (`useRunningPlayer.ts`, Lap type.)
- **Structured run** = `RunWorkout.blocks[]` with per-block `zoneType` + pace targets.
- **Hybrid** = a *third* shape, `HybridPlannedSegment[]` (`compose:104-123`), produced only by the uncalled composer.

### Where they meet
**Nowhere at runtime.** They only meet inside `composeHybridSession` (planning), which nothing calls.
Note the latent hook: `running.types.ts:127` already types a mainSet exercise as
`'interval' | 'rest' | 'strength'` — but no player renders the `'strength'` case (**OPEN QUESTION**:
declared-but-unused, like `aerobic_leg`).

---

## 3. The seam — can a single session interleave run legs + strength blocks? (Q3)

**Data structure: YES, already present and already live for solo sessions.**
- `SessionSegmentRecord` (`storage.service.ts:34-54`): `kind: 'aerobic' | 'strength'`, `aerobicType`,
  `planned` + `actual` (both `SegmentMetrics` with `durationSec/distanceKm/paceMinKm/calories/sets/exercises`).
- Solo runs **already write** `segments: [aerobicSegment]` — commented "Phase 0 of hybrid plumbing"
  (`useRunningPlayer.ts:1543-1554`). So the persistence shape for interleaved sessions exists and is exercised.
- The composer's `HybridPlannedSegment.planned` is deliberately byte-compatible with this record
  (`HYBRID_ENGINE_DESIGN.md:228-230`).

**Shared building block: YES.** `generateStrengthBlock` (`strength-block.service.ts`) is consumed by
**both** the hybrid station composer and the "צור אימון" block-builder — single source of truth
(header comment :5-8). It runs the *existing* pipeline via `protocolProbability:0` + `preferredProtocols:[]`
(`:115-116`) → provably straight sets, no warmup/cooldown append, no trio.

**Is the protocol-blocks `aerobic_leg` reused for this? NO.**
- `RoundItem { kind:'aerobic_leg' }` + `AerobicLegSpec` + `AerobicLegHandler` live **only** in the
  `feat/protocol-blocks` branch (`appout-1-protocols/.../protocol.types.ts:33-64`).
- It is **declared-but-unused** even there — heads "skip aerobic_leg items with a log note"
  (`protocol.types.ts:59-61`). Not imported on the hybrid branch. The two segment models are
  conceptually aligned but **physically disconnected** across two unmerged branches.

**The runner: MISSING — this is the core gap.**
- No player/orchestrator executes a `HybridPlan`. `useRunningPlayer` runs one aerobic session;
  `StrengthRunner` runs one strength session; nothing sequences run→strength→run mid-session or
  persists combined `segments[]`. (Confirmed by grep: zero multi-segment playback code.)

---

## 4. Stubs, half-built, and TODOs (Q4)

| Item | Status | Evidence |
|---|---|---|
| Design doc | ✅ complete, approved v1.0 | `HYBRID_ENGINE_DESIGN.md:3` |
| Item 1 — `weekly-load.service` | ✅ built | `weekly-load.service.ts` (161 ln) |
| Item 2 — strength **block mode** | ✅ built (drives existing pipeline; **no new engine flag needed**) | `strength-block.service.ts` (176 ln) |
| Item 3 — route prefix-distance util | ✅ built | `route-distance.utils.ts` (107 ln) |
| Item 4 — `composeHybridSession` | ✅ built (incl. field-fallback `:379-400`, degenerate-route guard `:361-363`) | `compose-hybrid-session.service.ts` (484 ln) |
| Item 5 — FreeRunDrawer hybrid entry ("המשולב של היום" / "טיול כושר") | ❌ **absent** | no hybrid card in `FreeRunDrawer.tsx` |
| Item 6 — Orchestrator (route↔station state machine) | ❌ **absent** | no orchestrator/state-machine file |
| LAW 10 hybrid XP | ✅ written + approved | `XP_Progression_Truth.md:195-221` |
| Server: `awardWorkoutXP` hybrid branch + MET→coins | ❌ **not wired** | LAW written, server code pending (per project memory) |
| `buildGeneratedLoop` (named in the task as a null stub) | ⚠️ **does not exist** in any worktree | grep = 0 hits; real generator is `generateDynamicRoutes` (functional) |

**Correction to the task premise:** there is no `buildGeneratedLoop` returning null. Route generation
is live (`route-generator.service.ts:102`). The route *quality* issues are tracked separately
(see project memory "route-generator-quality"), not a hybrid blocker.

---

## 5. Data — is the metadata there to mix? (Q5)

### Exercise (`exercise.types.ts`)
| Present (supports mixing) | Absent (limits fine blending) |
|---|---|
| `isTimeBased`, `mechanicalType` (incl a `'hybrid'` value), `fieldReady`, `sweatLevel`, `noiseLevel`, `injuryShield`, `secondaryMuscles` | **per-exercise MET** (only global `TIER_MET` `compose:164` / `MET_BY_DIFFICULTY` `summary.utils.ts:47`) |
| `tier` / `priority` — resolved by the engine at generation (`WorkoutExercise`) | **heart-rate zone** (route-level `WorkoutSegment.heartRateTarget?` `route.types.ts:115-132` exists; **not** per-exercise) |
| cardio addressable via `MuscleGroup:'cardio'` (`exercise.types.ts:191`) | explicit `isCardio` / `aerobicTag` flag |

### Route / FacilityStop / Park
| Present | Absent / gap |
|---|---|
| `Route.isHybrid/facilityStops/distance/path/hybridType/hybridActivities` | **Zero persisted `isHybrid` routes in production** (`dryrun-hybrid-compose.ts:39`) — the single biggest data blocker |
| `FacilityStop.waypointIndex/lat/lng/priority/type/stopType` | **no `equipmentAvailable[]` on the stop** — equipment is late-bound from the park's `gymEquipment` at compose time |
| `Park.gymEquipment[] {equipmentId, brandName}`; `GymEquipment {primaryMuscle, recommendedLevel, …}` | no MET / no HR / no `isCardioStation` on equipment |

**The composer already works around the missing stop data:** the dry-run **synthesizes** stops at
25/50/75 % of a real route's vertices (`dryrun-hybrid-compose.ts:55-60`) and resolves equipment from a
real park — proving the geometry math, but underlining that **production carries no hybrid routes to feed it**.

---

## 6. Design status — is there a spec? (Q6)

**Fully designed. This is the opposite of greenfield.**
- `HYBRID_ENGINE_DESIGN.md` (272 ln, v1.0): 7 locked decisions (`:14-22`), 9-step algorithm (`:114-233`),
  generic-stop model (`:150-188`), build order (`:244-256`), approvals checklist (`:257-268`).
- WHO targets + SDT framing baked in (`:24-29`).
- LAW 10 XP formula written + approved (`XP_Progression_Truth.md:195-221`): `workoutType:'hybrid'`,
  `hybridXP = aerobicXP + strengthXP + round(0.05×(…))`, bonus **only** when ≥1 completed aerobic AND
  ≥1 completed strength segment; reuses existing component formulas; server-owned.
- The one approval the doc still lists open (`:262`, "Hybrid XP line — BLOCKING GATE") is now **CLOSED** —
  the line exists in the truth file. The doc's §6 is stale on that row.

---

## 7. Dependencies & risk (Q7)

- **Does the strength engine have to be stable first (Phase 0)?** Partially decoupled. The block path
  calls `PipelineOrchestrator` directly (`strength-block.service.ts:130-131`), so it **skips the trio /
  `BOLT_DURATION_CAPS` 15→45 landmine** — a real advantage. But it still shares `WorkoutGenerator`, so
  any *selection/volume/guarantee* bug in the strength brain propagates into hybrid stations. Net: hybrid
  does not *block on* fixing the trio time bug, but it does inherit engine-core correctness risk.
- **Does it lean on the route generator (the merged zig-zag work)?** Yes for producing the route, but the
  binding constraint is **stop data, not route smoothness** — with no `facilityStops` in prod, every real
  hybrid session degrades to the single mid-route bodyweight fallback (`compose:379-400`) regardless of
  route quality.
- **Non-determinism:** the underlying generator randomizes count/sets/reps/rest within tier ranges
  (`compose` header note :19-25) — tests must assert invariants, not equality.

---

## 8. The two concrete scenarios, traced

### (a) "Dad in the park with the kids, 40 min, wants aerobic" (light aerobic + a little strength)
- `composeHybridSession({ timeBudgetMin:40, emphasis:'aerobic', … })` → aerobic share 0.7
  (`EMPHASIS_AEROBIC_SHARE.aerobic` `compose:150`) → 28 min run / 12 min strength → `S≈1` station
  (`round(12/10)` clamped, `:347-353`). Walking variant = the "טיול כושר" path (walk zone fixed, flow-tier).
- **Engine result:** a valid, printable plan (the dry-run proves the exact shape).
- **Reality blockers:** (1) no UI to ask for it; (2) no orchestrator to run it; (3) in prod the park route
  has no `facilityStops` → the single station is the field fallback, not a real gym stop.

### (b) "Runner who also wants a short strength block (mid/end)"
- `emphasis:'strength'` or manual + `stationOverride` → `S=1` block placed by route-fit (`selectStops`
  `:241-276`, ±25 %). This is literally "run → one block → run".
- **Engine result:** supported. **Blockers:** identical to (a) — no caller, no runner, no stop data.

Both scenarios are **computable today and runnable by nobody.**

---

## 9. Verdict

### (א) Ready for design, or still just an idea?
**Neither — it is well past both.** The design is **done and approved** (272-line v1.0 doc + written LAW 10),
and the **engine core is built and dry-run-verified** (items 1–4, ~1,100 lines on `feat/hybrid-engine`).
What is missing is **runtime**, in three parts, none of which is "design":
1. **Orchestrator / segment-aware player** (build item 6) — the largest lift; nothing sequences run↔strength.
2. **One UI entry** (build item 5) — a FreeRunDrawer "המשולב של היום" card wiring the composer.
3. **Real data + server** — persisted hybrid routes (or compose-time stop synthesis) **and** the
   `awardWorkoutXP` hybrid branch (LAW 10 is written but not coded server-side).

So the honest one-liner for David: *"the hybrid engine is built and sitting unwired on a side branch; it
needs a runner, an entry point, and stop data — not more design."* Design polish that *is* still worth doing
is only the **UI composition** of the existing drawer + strength components (design §1 "UI COROLLARY").

### (ב) Minimal viable hybrid (MVP) — shortest path to a first mixed session
The thinnest vertical slice that reuses everything already built:

**A single-station hybrid: `run leg → one strength block → run leg`, S=1.**

| Step | Reuse (exists) | New work (small) |
|---|---|---|
| Route | `generateDynamicRoutes` (`route-generator.service.ts:102`) | — |
| Stop data | park `gymEquipment` + **synthesize one mid-route stop** (dry-run already does this `:55-60`) | a compose-time stop-synth helper (bypass the empty `official_routes.facilityStops`) |
| Plan | `composeHybridSession` with `stationOverride:1` | one caller |
| Legs | existing running player | — |
| Station | `generateStrengthBlock` → mount `StrengthRunner` as a block via its `onComplete` | — |
| Persist | `SessionSegmentRecord` (already written by solo runs) | write **two** segments instead of one |
| Entry | FreeRunDrawer | one "המשולב" CTA + emphasis default `weekly_smart` |
| XP | — | `awardWorkoutXP` LAW-10 branch (or ship as display-XP first, coins later per design §8 economy guard) |

**The only genuinely new engine-adjacent piece is the mini-orchestrator** (run → hand off to StrengthRunner
→ resume run → save 2 segments). Everything else is composition of shipped parts. Start at **S=1**
(single block, no circuit sweep, no multi-station route-fit), on **generated routes with a synthesized
mid-route stop**, XP as **display-only** — that removes the three hardest dependencies (multi-station
route-fit, persisted hybrid routes, server XP) from the first slice.

---

## 10. Open questions for David
1. **Server XP:** LAW 10 is written; ship the `awardWorkoutXP` hybrid branch now, or run MVP with
   display-only XP first (design §8 already flags the coin-economy guard)?
2. **Stop data:** persist real `isHybrid` routes with `facilityStops`, or synthesize stops at compose
   time from nearby parks (MVP-friendlier)? Today prod has **zero** persisted hybrid routes.
3. **`aerobic_leg` convergence:** the protocol-blocks `aerobic_leg` RoundItem and the hybrid
   `SessionSegmentRecord` are two segment models on two branches — unify at merge, or keep hybrid on its
   own segment shape?
4. **Latent `'strength'` run-block hook** (`running.types.ts:127`) — intended for hybrid, or dead? If
   live-able, a run mainSet could carry a strength interval without a separate player mount.
5. **Orchestrator ownership:** should the hybrid runner extend `FreeRunLayer` (existing route state
   machine) or be a new component? (design item 6 says "already designed in the Phase-1 plan" — that plan
   was not found in the tree; **OPEN QUESTION** where it lives).
