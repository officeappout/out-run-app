# 41 — Domain-Assessment Gate (hybrid path)

**Date:** 23-24.09.2026
**Branch:** `feat/domain-assessment-gate`
**Scope:** hybrid composition path only (`composeHybridSession`/`dispatchStopContent`, `composeRouteStopsWorkout`, `composeHybridPlan`'s existing hydraulic gate). `ContextualEngine.ts` and `workout-selection.utils.ts` untouched, per explicit instruction.
**Status:** engine + UI implemented, verified via real execution against real production data (read-only). Not yet merged — awaiting approval.

## Background

`enable_route_stops` is live nationally. The prior "unassessed domain level" convention (`UNASSESSED_DOMAIN_LEVEL = -Infinity` in `ContextualEngine`, plus a hardcoded `level=1` fallback in two other places) either silently emptied a station's exercise pool or fabricated a level the user never validated. David's correction, verbatim intent: level must come from the real per-domain assessment (`userProgramLevels`) — never invented, never XP level. A domain the user hasn't assessed gets **zero content** in that domain, not level-filtered content. A station whose domain(s) aren't assessed must not disappear from the plan; it becomes a locked card. Everyone always gets the real walk — the only thing that varies is what happens at a station.

## Decision table (implemented)

| Station | Not assessed | Assessed |
|---|---|---|
| Gym park (has equipment) | Real machine tabata + nudge to complete the questionnaire | Existing straight-sets ladder, unchanged |
| No-equipment stop | Locked card → mini-assessment | Bodyweight per level, unchanged |
| No station at all | Pure walk + "fill the questionnaire" banner, not labeled a stations workout | Walk/run, existing field-fallback synthesis unchanged |

## What changed

### 1. The boolean gate
`userProgramLevels.has(domain)` (already the real per-domain assessment signal, dual-keyed by program-doc-id/slug) is now checked **per exercise**, via the canonical `MG_TO_DOMAIN` movementGroup→domain table — not the file's own primaryMuscle-based `domainOf()` (a different, pre-existing concern: iron-preference scoring). An exercise whose domain isn't assessed simply never enters the pool. Applied in `dispatchStopContent`'s `'strength'` branch (`compose-hybrid-session.service.ts`) before iron-preference scoring, and in the `'core'` branch's tabata-gate + field-pool fallback.

**Two gap points closed** (both previously found in the hybrid path): the pool-emptying `-Infinity` convention and the hardcoded `level=1` fallback are superseded here by the real gate — engine plumbing itself (`ContextualEngine.ts`/`workout-selection.utils.ts`) is untouched; the fix is entirely in how the hybrid dispatcher builds the pool it hands to `generateStrengthBlock`.

**Important refinement found via execution** (not in the original spec, discovered during verification): checking `block.isEmpty` *after* building the pool is not enough — a movementGroup-less "skill" exercise (locomotion/crawl-type movements with no push/pull/legs/core classification) can survive the per-exercise filter even when every real domain is unassessed, producing 1-2 stray unrelated exercises instead of the intended machine-tabata/lock-card experience. Fixed by checking "are ALL of this station's relevant domains unassessed" **before** the pool is even built, short-circuiting straight to the gate fallback in that case. The partial-assessment case (some but not all relevant domains assessed) still runs the per-exercise filter as designed.

### 2. Gate A removed
`composeRouteStopsWorkout`'s session-level gate (`start-hybrid-session.ts`, the `if (!hasAssessment) {...}` block that returned an empty-session stub when no assessment existed and no hydraulic park was nearby) is **removed entirely**, per David's explicit approval. Replaced with unconditional equipment-matching for every equipped stop (`findHydraulicEquipment`, unchanged function) — the per-domain gate downstream decides what to do with it, not this coarse "assessed anything at all" boolean. A separate, provably-dead `open_field` park filter two lines below it was left untouched (not part of this change, harmless).

### 3. The hydraulic-content shortcut removed
`resolveStationContent`'s unconditional call at the top of `dispatchStopContent` (`station-content-resolver.ts`, straight `sets:2/reps:20-or-8` content for any hydraulic-matched stop) is removed — superseded by real machine-tabata content (station-equipment-tabata.ts). Confirmed via grep: `compose-hybrid-session.service.ts` was its only call site in the whole codebase — the file itself is **not deleted**, just no longer called.

**Cross-path coupling found and preserved:** `composeHybridPlan`'s own, separate, narrower gate (~line 1199, the "מומלץ לך" carousel's gate — a DIFFERENT function, not touched) also populated the same field to reach `resolveStationContent`. Since `dispatchStopContent` is shared by every hybrid caller, removing the shortcut there would have silently regressed that caller too. Fixed by renaming the field it populates (`hydraulicEquipment` → `parkEquipment`, same matched docs, same gate logic) so it flows into the new equipment-tabata module instead — zero change to when/why that gate fires, only what happens with real content once it lets someone through.

### 4. `station-equipment-tabata.ts` (new module)
Mirrors `station-core-tabata.ts`'s pattern exactly. Reuses `compose-park-strength-workout.service.ts`'s Block A machinery **completely unchanged** (`isBlockAEligible`, `selectBlockAMachines`, `buildMachinePseudoExercise`, `computeCoveredDomains` — all already level-agnostic by design, confirmed via that file's own doc comments) — 3 previously-private constants exported (`TABATA_DIFFICULTY_LADDER`, `MIN_ROUNDS_PER_MACHINE`, `MIN_BLOCK_A_MACHINES`), pure additive. Does **not** reuse `resolveMachineAllocation` (sizes a machine:bodyweight time split for a session that always has a bodyweight complement — this module's whole reason to exist is the opposite: no bodyweight complement, the station is 100% machine time).

### 5. Per-segment lock card
`StrengthBlockResult.needsAssessment?: {fallbackHint, assessmentDomains}` (new field) and the parallel `assessmentNudge?: {message, assessmentDomains}` (real content + an invite to also assess the bodyweight complement) — both flow through `strengthBlockToWorkoutPlan` into `WorkoutSegment`, and through `HybridPlannedSegment.content` for the overview screen. **Same shape** `ComposedHybridSession.fallbackHint`/`assessmentDomains` already carries at session level (`buildNeedsAssessmentResult`'s text template, duplicated locally in the pure engine file rather than imported, to preserve its "no Firebase" LAW-0 boundary — `home-workout.service.ts` has Firebase-touching siblings).

### 6. "No station at all"
`HybridComposeInput.skipFieldFallbackWhenNoCandidates` (new optional flag): when true and zero real stop candidates exist, the existing synthetic-midpoint-stop fallback (§10, standard-park-gear assumption) is skipped entirely — `selection.chosen` stays empty, which the existing leg-assembly code (`legGapsKm` with an empty stop-km array) already handles correctly as one full-route aerobic leg, with zero code changes needed there. `composeRouteStopsWorkout` sets this flag to `!hasAssessment`; the resulting `meta.skippedFieldFallback` signal drives a session-level `fallbackHint` banner (reusing `buildNeedsAssessmentFallback`) and a title-text fix in `HybridOverviewScreen.tsx` so this case shows a plain "הליכה"/"ריצה" title instead of "מסלול + עצירות". **Assessed-user behaviour on a zero-station route is completely unchanged** (verified — scenario G below).

### 7. UI wiring
- `HybridOverviewScreen.tsx`: title-text branch for the "no stations, unassessed" case; `onAssessmentLink` widened to accept an optional domains array (still called with none for the existing session-level banner, which now also gates on `assessmentDomains?.length` — needed because the prop is unconditionally defined now, for the per-segment case below).
- `DiscoverLayer.tsx`: `onAssessmentLink` is now always-defined (was `undefined` when the session had no assessmentDomains) — prefers the passed-in per-segment domains, falls back to the session-level ones exactly as before when called with none.
- `HybridJourneyAxis.tsx`: a locked station renders a lock card (🔒 + tappable banner → `startMiniDomainAssessment` for that segment's own domains) in place of exercise content, keeping the same Node/card wrapper — the station stays on the axis, doesn't disappear. A station with `assessmentNudge` renders a small additive banner above its real content.

**Not done, explicitly flagged:** the ACTIVE workout run (`StrengthRunner`) reaching a locked (zero-exercise) segment mid-run has not been investigated or changed. `StrengthRunner` is a protected boundary (`axioms.md` §3 — "do not modify without an explicit request naming StrengthRunner by name"); this PR does not touch it. Whether the run/segment-navigation layer already skips a zero-exercise segment gracefully, or needs its own follow-up, is unverified.

## Verification (real execution, read-only, `scripts/_verify-domain-assessment-gate.ts`)

Runs the real, pure `composeHybridSession` directly against real Firestore data: real route `L3q3SY0UaCeJHdtHUOV7` (Kalaniyot, Sderot), its real 2 stations (stretch @wp68, hydraulic gym @wp87 — 4 real matched hydraulic machines from park `W2BrOhXzngOSUOOsyNvx`), the real 371-exercise catalog. Simulated assessment states via in-memory `userProgramLevels` Maps — no writes, no test data created, no real user document touched. One synthetic (in-memory-only) no-equipment stop added to exercise the lock-card path, since the real route has no such stop today.

| Scenario | Result |
|---|---|
| **A** — unassessed, real 2-station route, 30min | Plan not empty (5 segments). Walk exists (2 real legs, 1.5km). Stretch station unchanged. Equipped station → **3 real machine-tabata exercises** (אגן והאלכסונים / דחיקת רגליים / חתירה במכונה בישיבה, covers pull+legs+core), `assessmentNudge` set, `stations:2`. |
| **B** — unassessed, real hydraulic station + synthetic no-equipment station | No-equipment station → **locked card** (`exercises:0`, `needsAssessment` set, `assessmentDomains:[push,pull,legs,core]`) — station stays in the segment list (`stations:2`, `stopId` present). Hydraulic station → same equipment-tabata result as A. |
| **C** — core-only-assessed, synthetic no-equipment CORE station | Real content (3 exercises). *Observation, not a bug*: the 3 exercises (bear walk / shoulder rotation / crab walk) are movementGroup-unclassified ("n/a" under `MG_TO_DOMAIN`), not core-labeled — a pre-existing characteristic of `generateStrengthBlock`'s `legs_core` mixed-focus pipeline with a narrowed pool, not something this gate introduces or violates (no domain got a fabricated level). Worth a UX look separately. |
| **D** — unassessed, synthetic no-equipment CORE station | **Locked card**, `assessmentDomains:[legs,core]`, station stays (`strengthMin:0`, `stations:1` — not 0). |
| **E** — fully-assessed, real 2-station route | **Zero regression**: real straight-set content (סמוך קום מתחילים + שכיבות סמיכה ברכיים) at the equipped station via the *existing* ladder — no tabata, no lock, no nudge. Byte-identical mechanism to pre-PR behaviour. |
| **F** — zero real stops, unassessed, `skipFieldFallbackWhenNoCandidates:true` | Pure walk (1 segment, full 1.495km), `stations:0`, `skippedFieldFallback:true`. No synthetic/locked station at all. |
| **G** — zero real stops, assessed, flag `false` | **Zero regression**: the pre-existing field-fallback fires exactly as before (`usedFieldFallback:true`, real 4-exercise content at a synthetic standard-park-gear stop). |
| **D2** — no-equipment station, fully-assessed | **0 pull-domain exercises** among 4 real exercises — confirms the existing equipment/gear filter already excludes bar-requiring movements from a no-equipment stop; no special pull filtering was written, per instruction. |

## Regression

`npx tsc --noEmit`: 447 errors before and after (matches baseline exactly — zero new). `npx vitest run`: 228/230 files pass before and after (the 2 failing files — `tests/firestore-rules.test.ts`, `logMultiCategoryWorkout.smoke.test.ts` — are pre-existing, unrelated to this branch, confirmed via the same baseline stash-compare). 2 source-text regression tests needed updating to match this PR's intentional structural changes (`hybrid-overview-screen-design-unification.test.ts`'s title-string assertion, `hybrid-overview-screen-assessment-link.test.ts`'s `onAssessmentLink` shape/gating assertions) — both updated to assert the new, still-correct invariants rather than loosened.

## Found, not fixed (out of scope for this PR)

- **`ContextualEngine.ts:500`** (`passesFieldMode`'s legacy fallback) throws on an exercise doc with both `execution_methods:[]` and `equipment:undefined` — one real doc, `qHy5Te1jSPSi5jA3W9d6` (empty/orphaned, no name). `ContextualEngine.ts` is explicitly out of scope for this PR; filtered out of the verification script's own exercise pool so verification could complete. Flagging for separate cleanup.
- Scenario C's observation above (movementGroup-less exercises surfacing at a 'core' station for a core-only-assessed user) — not a violation of the domain-assessment rule, but a UX nuance worth a look.
