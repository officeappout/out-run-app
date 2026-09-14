# Wiring "התחל אימון" on the Park Page — Staged Implementation Plan

**Date:** 14.09.2026
**Scope:** Planning only. No code written, no Firestore writes, no deploys. All findings below are grounded against the current `origin/main` tip at the time of writing (commit `9ded6b34`) — investigated from a fresh worktree, not the shared main checkout, which is known to run stale between sessions.

**Design being planned against** (as specified by David):
- Model C: tapping "התחל אימון" opens the workout drawer directly, pre-filled with a computed recommendation, editable or start-immediately. No intermediate screen.
- Two blocks, not interleaved: Block A = machines (2–3 sets per machine, clustered, then move on), then Block B = bodyweight.
- Block A = Tabata-engine timed intervals. Difficulty ladder → work/rest: easy 20/40, medium 30/30, hard 40/20, all rounds=8. Difficulty is the only user input.
- Machines carry `movementPattern` (reusing `Exercise.movementGroup`) and flow through the generator like exercises. `isCardio=true` machines excluded from Block A in v1 (optional warmup/finisher only), their `movementPattern` ignored.
- Block B = existing `generateHomeWorkoutTrio`, `location: 'park'`, filling the patterns Block A didn't cover, real reps not intervals.
- Defaults: ~20 min, medium, level-derived, editable in the drawer.
- Progression (Phase 2, but planned now): volume = 1 work-interval = 1 hard set credited to the machine's domain; level/skill = ~50% of a bodyweight exercise's contribution, only below user-level 5 in that domain, level 5+ = volume only; effort = assumed "hard" + one 1–5 question at session end, calibrates next session, not per-machine.

---

## Part 0 — The 5 investigation answers

### 1. What does `isFunctional` actually control today?

**Confirmed, and the assumption ("bodyweight apparatus vs resistance machine") is directionally right, but the real semantic is about level-safety, not exercise style — and it has exactly ONE real behavioral consumer in the whole live app.**

- [`start-hybrid-session.ts:104-126`](src/features/workout-engine/hybrid/start-hybrid-session.ts#L104-L126) — `findHydraulicEquipment()`/`parkHasHydraulicEquipment()`, the "unassessed-domain-gate." Its own doc comment states the real distinction precisely: *"Hydraulic machines are self-limiting (adjustable resistance) — safe to compose a workout from one even at the silent level=1 default; real calisthenics gear is NOT (a wrong-level bodyweight movement can be genuinely inappropriate), so it requires a completed assessment."* `isFunctional: false` = hydraulic/self-limiting machine. `isFunctional: true` (the field's true-case, by omission) = real calisthenics gear, level-sensitive.
- Grepped the entire `workout-engine` — this is the **only** real consumer. It's narrowly scoped to one hybrid-session unassessed-user gate, not wired into the general strength generator's exercise-selection or level-safety logic anywhere else. **Implication for the plan:** `isFunctional` is not already "level-gating-aware" inside the generator — if Block A wants to lean on the same self-limiting/safety reasoning (e.g. relaxing level checks for hydraulic machines), that logic needs to be newly written for Block A, not inherited.
- **Naming collision to be aware of, not to conflate:** `Park.isFunctional` ([`park.types.ts:308`](src/features/parks/core/types/park.types.ts#L308)) is a *different, park-level* boolean — a rollup computed at CSV-import time (`park-import.service.ts:1370`: `park.equipment.some(eq => eq.isFunctional)`) used only for map pin icon selection ([`mapLayersConfig.ts:234`](src/features/parks/core/components/mapLayersConfig.ts#L234)). Same field name, different doc, unrelated purpose — don't let this confuse anyone skimming the codebase for `isFunctional`.

### 2. `generateHomeWorkoutTrio`'s real entry points for park

**Confirmed callable standalone, and there's a near-exact existing precedent for Block B's generation call.**

- Signature unchanged: [`home-workout.service.ts:694`](src/features/workout-engine/services/home-workout.service.ts#L694), `generateHomeWorkoutTrio(options: HomeWorkoutOptions): Promise<HomeWorkoutTrioResult>`.
- `HomeWorkoutOptions` ([`home-workout.types.ts:26-218`](src/features/workout-engine/services/home-workout.types.ts#L26-L218)) has everything needed: `location`, `availableTime`, `difficulty`, **and a park-specific `parkEquipmentIds?: string[]`** ([`:157`](src/features/workout-engine/services/home-workout.types.ts#L157)) — "Equipment IDs from the selected park's gymEquipment inventory."
- `resolveParkEquipmentIds`'s `selectedParkId` branch ([`park-equipment-resolver.ts:60,75`](src/features/workout-engine/services/park-equipment-resolver.ts#L75)) is still real code but **still has zero real callers** — confirmed unchanged from the earlier feasibility check. `resolveWorkoutContext`'s options type has no `selectedParkId` field at all; nobody threads a park id through it.
- **We don't need to fix that dead path.** Since the park page already has the specific `Park` object in hand (the user tapped it), the plan should **bypass `resolveWorkoutContext` entirely** and pass `parkEquipmentIds` directly — exactly mirroring the one place in the codebase that already does this for a specific park: `start-hybrid-session.ts`'s `composeFullParkWorkout()` ([`:263-450`](src/features/workout-engine/hybrid/start-hybrid-session.ts#L263-L450)):
  ```ts
  // start-hybrid-session.ts:371-376
  const trio = await generateHomeWorkoutTrio({
    userProfile: profile as any,
    location: 'park',
    parkEquipmentIds: oab.station.availableEquipment,
    skipCycleRestart: true,
  });
  ```
  This is a **different feature** (hybrid walk-there/walk-back + full workout), not what we're building — but it's the strongest available reference implementation for "generate a real strength workout scoped to one specific park's equipment," and it already uses `skipCycleRestart: true`, which exists specifically for *"READ-ONLY callers that generate a recommendation for preview/planning without committing the user to it"* ([`home-workout.types.ts:206-217`](src/features/workout-engine/services/home-workout.types.ts#L206-L217)) — exactly Model C's "editable before starting" semantics. **Reuse this flag.**
- **Domain exclusion (needed so Block B only fills what Block A didn't cover) is not a native "exclude" primitive, but a real, twice-used "include only" mechanism inverts trivially:** `requiredDomains?: string[]` + `strictDomains?: boolean` ([`home-workout.types.ts:134,142`](src/features/workout-engine/services/home-workout.types.ts#L134)) restricts generation to a domain set, wired all the way through `PoolFactory`/`ContextualEngine`. Two real production callers already do exactly this shape of thing:
  - [`partial-completion.generator.ts:156-166`](src/features/workout-engine/core/generators/partial-completion.generator.ts#L156-L166) — `generateHomeWorkoutTrio({ requiredDomains: [domain], strictDomains: true, generateSingleOption: true, ... })`.
  - [`complementary-short.generator.ts:29-37`](src/features/workout-engine/core/generators/complementary-short.generator.ts#L29-L37) — same, hardcoded `['core']`.
  Since the domain vocabulary is the closed 4-set `push|pull|legs|core` ([`program.types.ts:17`](src/features/workout-engine/core/generators/program.types.ts#L17) — actually defined as `MovementPattern`), Block B's caller computes the complement client-side (all 4 minus whatever Block A covered) and passes it as `requiredDomains` + `strictDomains: true`.
- **Open question flagged by the investigation, not yet answered — needs confirming before Phase 1 coding starts:** does `strictDomains` interact safely with an *empty* `requiredDomains` array (all 4 domains already covered by Block A — Block B should generate nothing, or a minimal/rest-style fallback)? And does passing `parkEquipmentIds` explicitly empty (Block B should be bodyweight-only, no machines) actually suppress equipment-based exercise selection, or does the generator fall back to some other equipment-resolution path when the array is empty? **This needs a quick read of `PoolFactory`'s equipment-gating branch before Phase 1 implementation — not confirmed in this investigation pass.**

### 3. The dead CTA, and a real architectural gap underneath it

**Confirmed still dead, same shape as before. Wiring it needs more than flipping a prop — the workout drawer has no global reach today.**

- [`ParkDetailSheet.tsx:90,94,1047`](src/features/parks/client/components/park-detail/ParkDetailSheet.tsx#L1047) — `onClick={() => { onClose(); onStartWorkout?.(); }}`, `onStartWorkout` still optional with no default.
- Both real mount points still don't pass it: [`GlobalDetailOverlay.tsx:46-52`](src/features/parks/core/components/GlobalDetailOverlay.tsx#L46-L52) (the global overlay reachable from every page) and [`park-preview/index.tsx:167`](src/features/parks/client/components/park-preview/index.tsx#L167) (the map-pin popup's own local mount).
- **The exact reference pattern already exists and was already shipped for routes** — `GlobalDetailOverlay.tsx:55-84`'s `route` branch:
  ```ts
  onStartWorkout={(r) => {
    setPendingRouteStart(r);
    closeGlobalSheet();
    if (typeof window !== 'undefined' && window.location.pathname !== '/map') {
      router.push('/map');
    }
  }}
  ```
  backed by a plain Zustand slot in `useMapStore.ts:292-293,471-475`: `pendingRouteStart: Route | null` + setter + a consume-once getter. `DiscoverLayer.tsx:630-640` (mounted on `/map`) has the matching consumer effect: reads the pending slot, consumes it, and calls `logic.setFocusedRoute(route); logic.startActiveWorkout();` — going straight into the live player (no drawer), which is correct for the *route* flow but is **not** what Model C wants for parks (parks need the editable drawer, not a direct-start).
- **The real gap: nothing plays the role of `DiscoverLayer` for the park+drawer case.** `WorkoutPreviewDrawer` (the component that actually renders "pre-filled, editable, generatedWorkout") is only ever mounted in 3 places, none of them global: `home/page.tsx` (directly), inside `WorkoutBuilderSheet.tsx` (its own internal generate-then-preview flow), and `FavoritesSheet.tsx`. **It is entirely page-local state today — there is no equivalent of `GlobalDetailOverlay` for it.** This is exactly the kind of thing the task asked to flag as fighting the existing architecture: Model C's "no intermediate screen" implicitly assumes the drawer is reachable from wherever the park sheet was opened (which can be `/map` via a pin tap, or `/home` via the "גינות כושר קרובות" carousel, or elsewhere via `GlobalDetailOverlay`) — but today only `/home` hosts a drawer instance.
- **Recommended approach (lowest blast radius): mirror `pendingRouteStart` exactly, but target `/home` instead of `/map`.** Add `pendingParkWorkoutStart: Park | null` (+ setter + consume-once) to `useMapStore`; `ParkDetailSheet`'s `onStartWorkout` writes it, closes the sheet, and `router.push('/home')` if not already there; a new effect in `home/page.tsx` (mirroring `DiscoverLayer.tsx:630-640`'s pattern) consumes it, runs the composition (see Part 1 below), and opens `WorkoutPreviewDrawer` directly — bypassing `WorkoutBuilderSheet`'s own defaults-picker step entirely, since we already have a computed recommendation (matches "no intermediate screen" literally: one hop to `/home` if needed, then straight to the pre-filled drawer, no picker in between).
- **`WorkoutPreviewDrawer`'s prop shape is exactly Model C's mechanism, confirmed by reading its type** ([`workout-preview-drawer/types.ts:59-95`](src/features/workouts/components/workout-preview-drawer/types.ts#L59-L95)): `generatedWorkout?: GeneratedWorkout | null` — *"displays the engine-generated workout exercises... bypasses the old Firestore fetch path"* — is precisely "pre-filled with a computed recommendation." `intensityOptions`/`selectedIntensityIndex`/`onSelectIntensity` is precisely the difficulty-ladder toggle ("difficulty is the only user input"). `workoutLocation` persists `'park'` for the player. `onStartWorkout` is the actual start trigger. No new drawer component needs to be built — only a composed `GeneratedWorkout` needs to be produced and handed to it.

### 4. Representing a machine as a Tabata station — the minimal pseudo-exercise shape

Traced every field the Tabata code path (`tabata.block.ts`, `tabata.step.ts`, `tabata.advance.ts`) and its two helper functions actually dereference on an `Exercise`:

| Field | Read by | GymEquipment source | Notes |
|---|---|---|---|
| `id` | everywhere (keying) | `id` | direct |
| `name` (`LocalizedText`) | display, `getIsometricTimeCap` | `name` (plain string) | needs wrapping: `{ he: machine.name, en: '', es: '' }` |
| `movementGroup` | `getIsometricTimeCap` (partially dead-code path, see below), sort/domain logic | `movementPattern` | direct — same enum |
| `targetPrograms` | `poolLevelOf` (`Math.min` of levels), `getIsometricTimeCap` fallback | none directly | synthesize `[{ programId: <MG_TO_DOMAIN collapse of movementPattern>, level: recommendedLevel }]` |
| `symmetry` | `tabataIntervalCost()` (`unilateral` → cost 2, else 1) | none | **optional on `Exercise`** — omit; machines default to cost 1 (bilateral), which is correct (no unilateral machine-use concept exists or is needed for v1) |
| `injuryShield` | eligibility filter | none | **optional on `Exercise`** — omit, or pass `[]` |
| `tags` | eligibility filter (`isHandstand`-style checks) | none | `[]` is safe — none of these checks apply to machines |

- A synthetic `ExecutionMethod` (for video/media in the live player) maps cleanly from a machine's brand: `ExecutionMethod.media.mainVideoUrl` ← `machine.brands[0].videoUrl`, `location: 'park'`, `requiredGearType: 'fixed_equipment'`, `equipmentIds: [machine.id]` — all confirmed-optional/simple fields on [`ExecutionMethod`](src/features/content/exercises/core/exercise.types.ts#L424-L500).
- **Bug found in passing, not caused by us, worth a one-line flag but out of scope to fix here:** `getIsometricTimeCap` ([`workout-budgeting.utils.ts:1247-1270`](src/features/workout-engine/logic/workout-budgeting.utils.ts#L1247-L1270)) compares `exercise.movementGroup` against values like `'planche'`, `'handstand'`, `'front_lever'` — those aren't valid `MovementGroup` enum values (they belong to the separate `base_movement_id` taxonomy), so that branch is silently unreachable. The function still works via its Hebrew-name-heuristic and level-based fallback branches, so it's not broken for real exercises, just partially dead. Irrelevant to machines either way (machines won't hit the elite-skill branch), noted only because Q4's field-tracing surfaced it.
- **Crucially: Block A should NOT call `buildTabataBlock`/`buildTabataFromPool` at all.** Those functions *select* which exercises go in the block from a pool, with eligibility/level/tiling logic built for real bodyweight exercises drawn probabilistically. Block A's exercise list is not selected — it's the deterministic list of machines physically at this park. The plan should **construct the tabata segment/config directly** (reusing only the *timing* machinery — `TabataProtocolConfig`, `computeTabataStep`, `tabata.advance.ts`, all confirmed fully parameterized in the earlier feasibility check) rather than routing through the pool-selection functions.
- **Tiling recommendation:** the design says "2–3 sets on one machine, then move on," rounds is fixed at 8. The existing `TABATA_CORE_MEMBER_COUNTS = [2, 4, 8]` ([`tabata.constants.ts:34-38`](src/features/workout-engine/logic/protocols/tabata.constants.ts#L34-L38)) already encodes "which member counts tile 8 rounds exactly" — **4 machines × 2 rounds each** fits "2–3 sets" on the low end and reuses the exact same tiling reasoning the codebase already trusts, rather than inventing new tiling math. Flagging as a recommendation for David to confirm, not a hard requirement — 2 machines × 4 rounds or another split are equally valid mathematically if "2-3 sets" was meant more loosely.

### 5. The `movementGroup`→domain collapse — already exists, zero new code needed

**This is the single most consequential finding in this investigation and changes the shape of Phase 2 significantly.**

- `useWeeklyVolumeStore` ([`useWeeklyVolumeStore.ts:36-37`](src/features/workout-engine/core/store/useWeeklyVolumeStore.ts#L36-L37)) still buckets `strength.domainSetsCompleted: Record<string, number>` by plain string keys (`push`/`pull`/`legs`/`core` by convention, not schema-enforced) — unchanged.
- **The domain-resolution subsystem was renamed by the recent `feat/unified-domain-resolver` merge** (39 commits landed on main between this branch's original base and now — see the note at the top of this doc). `resolveExerciseDomain` now lives at [`workout-selection.utils.ts:180-223`](src/features/workout-engine/logic/workout-selection.utils.ts#L180-L223); the volume-specific descendant is now `resolveVolumeExerciseDomain` ([`workout-budgeting.utils.ts:499-526`](src/features/workout-engine/logic/workout-budgeting.utils.ts#L499-L526)), used by `assignVolume` — a **generation-time** set-budget assignment pass, not completion-time crediting.
- **Completion-time crediting — the thing that actually writes to `useWeeklyVolumeStore` — is not a shared function at all.** It's inlined in [`src/app/workouts/[id]/active/page.tsx`'s `handleComplete`, lines 983-1026](src/app/workouts/[id]/active/page.tsx#L983-L1026), using a **third, independently-duplicated** local `MUSCLE_TO_DOMAIN` map (line 72) and two passes: Pass A (`ex.muscleGroups?.[0]` → domain), Pass B (`ex.programIds` → skill-slug credit). **Neither pass touches `movementGroup`, `resolveExerciseDomain`, or `resolveVolumeExerciseDomain` at all.** There is no single chokepoint to "add a case to" — Phase 2 will need genuinely new code here, not a one-line extension.
- **The collapse map itself already exists, and it's exactly what was asked for:**
  ```ts
  // src/features/workout-engine/shared/constants/domain-mapping.constants.ts:44-58
  export const MG_TO_DOMAIN: Record<string, string> = {
    vertical_pull: 'pull', horizontal_pull: 'pull',
    vertical_push: 'push', horizontal_push: 'push',
    squat: 'legs', hinge: 'legs', lunge: 'legs',
    core: 'core', anti_extension: 'core', anti_rotation: 'core',
    planche: 'planche', muscle_up: 'muscle_up', /* ...skill slugs... */
  };
  ```
  Covers all 6 requested keys exactly (`horizontal_push`/`vertical_push`→`push`, `horizontal_pull`/`vertical_pull`→`pull`, `squat`/`hinge`→`legs`, `core`→`core`); `isolation`/`flexibility` correctly fall through to `undefined` (not counted) with zero changes. It's currently used for generation/scoring contexts (`WorkoutGenerator`, `pyramid.processor`, `trio-modifiers.service`), never yet at the completion-crediting call site.
- **Correct plug-in point: do not route machines through `resolveExerciseDomain`/`resolveVolumeExerciseDomain`.** Confirmed both only read `exercise.targetPrograms` (the volume one also falls back to `primaryMuscle`) — **neither reads `movementGroup` at all**, so they're the wrong tool regardless of whether a duck-typed pseudo-`Exercise` would satisfy the type checker. The correct move: `MG_TO_DOMAIN[machine.movementPattern]` — a direct, already-built, already-correctly-typed-for-this-exact-enum lookup, used in a **new "Pass C"** parallel to `active/page.tsx`'s existing Pass A/Pass B (or wherever Phase 2's combined-session completion handler ends up living — see Phase 2 below), not inside the existing resolver functions.

---

## What fights the existing architecture — consolidated

1. **No global drawer mount.** `WorkoutPreviewDrawer`/`WorkoutBuilderSheet` are page-local to `/home`. Model C's "opens directly" needs a navigate-if-elsewhere hop, not a true "opens from anywhere in place" — mitigated by mirroring the already-shipped `pendingRouteStart` pattern, but it is a real architectural gap, not a non-issue.
2. **Domain-crediting is duplicated and ad-hoc — 3 independent copies of essentially the same muscle→domain map exist** (`workout-budgeting.utils.ts:468`, `active/page.tsx:72`, and now conceptually a 4th angle via `MG_TO_DOMAIN`). Phase 2 adds genuinely new code at the completion-handler layer; there's no clean single function to extend.
3. **`buildTabataBlock`'s pool-selection machinery doesn't apply to Block A** — Block A's exercise list is deterministic (the park's actual machines), not drawn from a scored pool. Only the *timing* layer (`TabataProtocolConfig` + the player) should be reused; the selection layer should be bypassed, not fought into accepting a fixed list it wasn't designed for.
4. **`selectedParkId` is dead code — don't build on it.** Bypass `resolveWorkoutContext` and use `parkEquipmentIds` directly (already-supported option, see Q2), mirroring `composeFullParkWorkout`.
5. **Level/skill crediting's "50% below level 5" rule touches a system this investigation did not audit.** `useWeeklyVolumeStore` handles *volume*; user *level* (`globalLevel`) is server-owned per `axioms.md §2` — written only by `awardWorkoutXP`/`reverseWorkoutXP`, never client-side. Before Phase 2 can be scoped precisely, someone needs to trace how a completed bodyweight exercise actually contributes to level today (separately from XP/coins) and confirm there's a legitimate, non-server-only hook point for a machine's reduced contribution — **this is flagged as an explicit unknown, not answered here.** Per this repo's own law ("Audit-before-code": load `.cursoragents/XP_Progression_Truth.md` before writing XP/level code), Phase 2 needs its own dedicated investigation pass against that truth file before implementation, not an assumption carried over from this plan.
6. **Two unconfirmed generator-behavior questions from Q2** (empty `requiredDomains` after full coverage; whether empty `parkEquipmentIds` truly forces bodyweight-only) need a quick, cheap confirmation read of `PoolFactory`'s equipment-gating branch before Phase 1 coding starts — flagged, not answered, in this pass.

---

## Staged Implementation Plan

### Phase 1 — Generate + play a real park workout end-to-end via the CTA

**Goal:** tapping "התחל אימון" produces a real, playable, two-block workout in the existing drawer and live player. No progression-counting changes yet (existing completion/XP paths run unmodified — sets from Block A just won't be domain-credited yet, which is acceptable for this phase).

**New code:**
- `composeParkWorkout(park: Park, userProfile: UserFullProfile, options: { difficulty: 'easy'|'medium'|'hard'; availableTime?: number }): Promise<GeneratedWorkout>` — new pure-ish orchestration function (isomorphic where possible; the `generateHomeWorkoutTrio` call inside it is already async/Firestore-reading, matching the existing precedent in `composeFullParkWorkout`). Proposed home: `src/features/workout-engine/services/` (sibling to `home-workout.service.ts`), or alongside the hybrid composer if David prefers grouping park-composition logic together — needs a naming/location decision, flagged.
  - Steps: filter `park.gymEquipment` to strength-eligible machines (exclude `isCardio: true`, per v1 scope) → select Block A's machines (recommend: 4 machines × 2 rounds, tiling `TABATA_CORE_MEMBER_COUNTS`, see Q4) → build each as a pseudo-`WorkoutExercise` (see Q4's table) → map difficulty to `{workSec, restSec, rounds: 8}` per the ladder → compute Block A's covered domains via `MG_TO_DOMAIN` → compute Block B's `requiredDomains` as the complement → call `generateHomeWorkoutTrio({ userProfile, location: 'park', availableTime: <remaining budget>, difficulty: <mapped 1-3>, requiredDomains, strictDomains: true, skipCycleRestart: true })` (parkEquipmentIds intentionally omitted/empty — bodyweight only, pending the Q2 confirmation above) → merge Block A's pseudo-exercises + Block B's `GeneratedWorkout.exercises` into one `GeneratedWorkout`, stamping Block A's `tabataBlock` field with the difficulty-derived config (not `TABATA_CLASSIC`) and each Block A exercise's `protocolBlock: 'tabata'` marker so `buildRunnerWorkoutPlanFromGenerated.ts` segments them correctly.
- `useMapStore.ts`: add `pendingParkWorkoutStart: Park | null` + `setPendingParkWorkoutStart` + `consumePendingParkWorkoutStart` — mirrors `pendingRouteStart` exactly (lines 292-293, 471-475).
- `ParkDetailSheet.tsx`: no structural change beyond what already exists (`onStartWorkout` prop already declared, line 90) — callers now pass a real handler.
- `GlobalDetailOverlay.tsx`: add an `onStartWorkout` handler to the `park` branch (line 46-52), mirroring the `route` branch (lines 61-70) — `setPendingParkWorkoutStart(park); closeGlobalSheet(); if (pathname !== '/home') router.push('/home')`.
- `park-preview/index.tsx`: same wiring for its own local `ParkDetailSheet` mount (line 167).
- `home/page.tsx`: new effect consuming `pendingParkWorkoutStart` (mirrors `DiscoverLayer.tsx:630-640`'s `pendingRouteStart` consumer) — calls `composeParkWorkout`, then opens `WorkoutPreviewDrawer` directly with `generatedWorkout`, `intensityOptions` (3 difficulty entries), `workoutLocation: 'park'` — bypassing `WorkoutBuilderSheet`'s own defaults-picker.

**Files touched (Phase 1):**
| File | Change |
|---|---|
| NEW `composeParkWorkout` service file | Block A+B composition logic |
| `useMapStore.ts` | new pending-slot |
| `GlobalDetailOverlay.tsx` | wire `onStartWorkout` for `park` |
| `park-preview/index.tsx` | wire `onStartWorkout` for its local mount |
| `home/page.tsx` | new consumer effect, drawer open |
| (read-only, verify not edit) `buildRunnerWorkoutPlanFromGenerated.ts` | confirm segment-splitting honors our custom `tabataBlock` config, not just `TABATA_CLASSIC` |

**Risks / unknowns:**
- The two unconfirmed generator-behavior questions from Q2 (empty-domain/empty-equipment edge cases) — resolve first, cheap to check.
- Whether `buildRunnerWorkoutPlanFromGenerated.ts` reads `tabataBlock`'s config values dynamically or has any place that still assumes `TABATA_CLASSIC` — the earlier feasibility check found the *player* (`tabata.step.ts`/`tabata.advance.ts`) fully parameterized, but the *segment-building* step that turns `GeneratedWorkout.tabataBlock` into a live segment wasn't traced in this pass — needs a read before coding.
- Machine selection heuristic for Block A (which 4 of the park's machines, in what order/domain-priority) isn't specified by the design beyond "clustered by station" — needs a simple, explicit rule (e.g. prioritize covering the user's weakest/least-recently-trained domain first) before implementation, otherwise it'll be improvised ad hoc.
- No park in the current 55-machine tagged set may have exactly 4 strength-eligible (non-cardio) machines — need a fallback for parks with fewer (2 machines × 4 rounds, or drop to fewer domains covered) and parks with `0` strength machines (skip Block A entirely, pure bodyweight — should already degrade gracefully if the composition function handles an empty machine list).

**Test approach:**
- `composeParkWorkout`'s domain-complement math (push/pull/legs/core set arithmetic) is pure and unit-testable per the repo's node-only vitest convention — a real test target.
- The Tabata timing/config-threading piece can reuse the same verification style as the earlier Tabata feasibility check (a standalone script asserting `computeTabataStep`'s behavior against the ladder's 3 configs).
- End-to-end (real park, real device, both blocks playing correctly) requires manual on-device testing — cannot be done from this session per the repo's dev-server convention.

### Phase 2 — Progression counting

**Goal:** Block A's completed intervals credit the weekly volume store correctly; level/skill crediting applies David's 50%-below-level-5 rule; an end-of-session effort question calibrates next session's default difficulty.

**Volume crediting (grounded, ready to scope precisely):**
- New "Pass C" in whatever function ends up processing the combined session's completion (likely a new/extended variant of `active/page.tsx`'s `handleComplete`, or a shared helper factored out of it if the combined park session needs its own completion path — needs a decision on whether the combined Block A+B plan runs through the *same* `StrengthRunner`/`active/page.tsx` flow as any other strength workout, which the Phase 1 design implies it should since it's just a `GeneratedWorkout` like any other).
- Per completed Block A interval: `MG_TO_DOMAIN[machine.movementPattern]` → credit 1 set to that domain in the `domainSets` object passed to `recordStrengthSession`, exactly parallel to existing Pass A/B, no new map needed (Q5).

**Level/skill crediting (explicitly NOT grounded yet — needs its own investigation before scoping):**
- Requires first establishing, separately: how does a completed bodyweight exercise contribute to `globalLevel`/per-domain level today (distinct from the weekly-volume-store's set counting)? This wasn't traced in this investigation. Per `axioms.md §2` (server-owned XP/level, `awardWorkoutXP` only), this likely means the "50% contribution below level 5" rule needs to be expressed as an input to that server-side award path, not a client-side computation — needs its own audit-before-code pass against `.cursoragents/XP_Progression_Truth.md` before any implementation estimate is credible.

**Effort question (grounded structurally, needs a UI-placement decision):**
- A 1-5 end-of-session question, stored per-user, read back as the default-difficulty input the next time `composeParkWorkout` (or the drawer's difficulty default) runs. Needs: (a) a small new field (likely `users/{uid}` or a session-summary doc — not investigated which), (b) a UI slot — probably the existing post-workout summary screen (`StrengthSummaryPage` per this repo's established summary-screens architecture) rather than a new screen, to avoid adding a new intermediate screen the design doesn't call for. Needs confirmation this doesn't conflict with the separate, already-in-flight "summary screens view-only" initiative noted elsewhere in this repo's history.

**Files likely touched (Phase 2, approximate — not fully grounded):**
| File | Change |
|---|---|
| `active/page.tsx` (or a new shared completion helper) | Pass C: machine volume crediting |
| TBD (needs its own audit) | level/skill crediting hook point |
| `StrengthSummaryPage` (or equivalent) | effort question UI |
| TBD | persisted last-effort-rating field |

**Risks / unknowns:** the level/skill piece is the single biggest unknown in this whole plan — flagged clearly above, not estimated.

**Test approach:** volume crediting is testable the same way as any `domainSets` computation (pure function, unit-testable). Level/skill crediting's test approach depends entirely on the unresolved investigation above.

### Phase 3 — Polish

- Cardio machines as an optional warmup/finisher (explicitly deferred by the design beyond v1's core scope).
- Smarter Block A machine-selection (domain-priority-aware rather than a simple fixed rule from Phase 1).
- Difficulty-ladder tuning based on real device testing (the 20/40, 30/30, 40/20 seconds are a v1 starting point, not necessarily final).
- Visual differentiation in the drawer/player between machine-based and bodyweight exercises (the design doesn't call for new UI beyond the existing drawer/player, but a v1 build will likely surface small UX gaps once on-device).
- Cleanup of the 3-way `MUSCLE_TO_DOMAIN` duplication surfaced by this investigation (out of scope for this feature specifically, but worth flagging to David separately since Phase 2 adds a 4th angle on the same underlying concept).

---

## Open questions for David before Phase 1 starts

1. Where should `composeParkWorkout` live (new file location/naming)?
2. Confirm the Block A machine-count/tiling recommendation (4×2 rounds) vs. a looser interpretation of "2-3 sets."
3. Machine-selection priority rule when a park has more strength-eligible machines than Block A needs.
4. Does the combined Block A+B plan run through the exact same `StrengthRunner`/`active/page.tsx` completion flow as any other workout, or does it need its own path? (Assumed yes in this plan; not confirmed.)
5. Green light to spend a separate, dedicated investigation pass on the level/skill crediting mechanism (Phase 2's biggest unknown) before that phase is scoped for real.
