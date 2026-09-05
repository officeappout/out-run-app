# Parking Lot — deferred follow-ups

> Items intentionally deferred, with enough context to pick up later.
> Not committed to git (`.claude/knowledge/` is local state).

---

## insights composite indexes missing in firestore.indexes.json
**Opened:** 2026-07-10 · **Source:** pre-commit review of transcript-pipeline PR (commit `fe51a64`)

`queryInsights` ([src/features/admin/services/insights.service.ts](../../src/features/admin/services/insights.service.ts)) filters by equality on a field **and** `orderBy('date', 'desc')` — Firestore requires a **composite index** per such combination. `firestore.indexes.json` currently has **zero** `insights` indexes.

Affected filters (all share `orderBy('date','desc')`): `entityType`, `source`, `authorityId`, `category`.
- `entityType` / `source` / `authorityId` are **wired** to `/api/admin/insights` and will fail at runtime on first filtered call (Firestore "index required" error, silent server-side).
- `category` filter is currently **dormant** (not exposed by the route) — added in `fe51a64` for future use, no runtime risk yet.

**Pre-existing** — predates the transcript PR; that PR does not trigger it. Fix separately:
1. Add composite indexes to `firestore.indexes.json`: `(entityType, date)`, `(source, date)`, `(authorityId, date)`, `(category, date)` — each with `date` DESC.
2. Deploy: `firebase deploy --only firestore:indexes` — **requires David's approval** (build/deploy gate).
3. Backfill is automatic (small collection, ~1–5 min).

---

## `generatedExerciseRanges` sessionStorage key is orphaned (read + deleted, never written)
**Opened:** 2026-07-18 · **Source:** Builder→Runner investigation (post `6708848`)

The sessionStorage key `generatedExerciseRanges` is **read** in two places and **deleted** in one, but **never written** anywhere in the codebase (grep for `setItem('generatedExerciseRanges')` = 0 hits):
- Read: [active/page.tsx:156](../../src/app/workouts/[id]/active/page.tsx#L156) (inside `enrichExercise` / the Firestore-fallback path) and [WorkoutPreviewClient.tsx:276](../../src/app/workouts/[id]/WorkoutPreviewClient.tsx#L276).
- Deleted: [active/page.tsx:1176](../../src/app/workouts/[id]/active/page.tsx#L1176).

Effect: the range/sets/goal enrichment that this map was meant to supply **never activates** — the read always returns `null`. Not currently harmful because the live paths (builder Priority-2 `currentWorkoutPlan`, home Priority-1 `active_workout_data`) already carry `repsRange`/`sets`/`isGoalExercise` on each exercise. It only matters on the **Priority-3 Firestore fallback**.

**Related, higher-impact:** the Priority-3 fallback ([`fetchWorkoutFromFirestore`](../../src/app/workouts/[id]/active/page.tsx#L267)) builds a **generic** workout from a Firestore template — NOT the generator's output. So if BOTH `active_workout_data` AND `currentWorkoutPlan` are ever absent at start (e.g. sessionStorage evicted between preview and start — see axiom §19 WKWebView eviction), the runner silently runs a generic workout instead of the one the user previewed. The Builder→Runner fix removed the *stale-plan* path, but this *missing-plan* fallback is still a latent silent-swap.

**Task (not blocking):**
1. Decide whether `generatedExerciseRanges` is dead code to delete, or a feature to wire (write it at generation time alongside `active_workout_data`).
2. Consider hardening the Priority-3 fallback: if the id is a `workout-builder-*` / generated id with no Firestore template, surface an error/regenerate rather than silently serving a generic template.

---

## swap-all Follow-up B — per-step pyramid re-resolution on location swap
**Opened:** 2026-07-18 · **Source:** swap-all smoke Fix 4 (branch `fix/swap-all-smoke-clean`, commit `0c80058`)

Phase-1 (Option A, shipped) treats a pyramid as **atomic**: a location swap never partial-swaps it — it keeps the whole block + marks it (`dimensionUnavailable`), performable or not, to guarantee zero inconsistent state. Guard is at the top of the per-exercise loop in [useSwapAll.ts](../../src/features/workouts/components/workout-preview-drawer/hooks/useSwapAll.ts) (`if (we.pyramidSequence?.length) → keep+mark + continue`).

**Two gaps left for B:**
1. **The mark is non-visual on pyramids.** `dimensionUnavailable` renders the "דורש מתקן" badge **only** in [ExerciseCard.tsx:95](../../src/features/workouts/components/workout-preview-drawer/components/exercise-list/ExerciseCard.tsx#L95); pyramids render via [PyramidStepCard.tsx](../../src/features/workouts/components/workout-preview-drawer/components/exercise-list/PyramidStepCard.tsx) which has no such badge, and the section header/grouping don't read the flag either. So a swapped-to pyramid just stays **unchanged with no indicator**. B should add a section-level "לא הועבר / דורש מתקן" indicator (SectionHeader or pyramid block) driven off the parent's `dimensionUnavailable`.
2. **True relocation.** Re-resolve **each** `pyramidSequence` step for the new location: per-step `selectMethodForContext(stepExercise, newLocation, gear)` + update `step.videoSrc`/`imageUrl`/`level`/`name` (and `isSwapped`), keeping the mechanical-progression invariant (every step mutates the lever). If **any** step is not performable at the new location → keep+mark the whole pyramid (atomic). Leverage the existing single per-step path [`handleOpenPyramidStepSwap`](../../src/features/workouts/components/workout-preview-drawer/hooks/useExerciseSwap.ts#L104) + `pyramid.processor.ts` media resolution. Watch twin-sync semantics (per-step `isSwapped` must localise, not flip the whole pyramid).

**Note:** `repsSequence`-only "סט שיא" (peak-set) exercises are NOT affected — they render via the standard `ExerciseCard` and already swap correctly through `deriveSwappedEntry` (verified). B is pyramid-only.

---

## applyHomeGating — home gear gate symmetric to ParkGating (separate flagged project)
**Opened:** 2026-07-18 · **Source:** READ-ONLY investigation "swap to home doesn't filter by real home gear" · **Decision:** Approach 1, separate project behind a flag — NOT now. Do NOT build the swap-all-only stopgap (Approach 2); do NOT duplicate gating in `useSwapAll`.

**Root cause (verified):** `selectMethodForContext` gates PARK by real inventory ([`applyParkGating`](../../src/features/workout-engine/shared/utils/method-selection.utils.ts#L111-L122); hard-reject `null` at [L145-166](../../src/features/workout-engine/shared/utils/method-selection.utils.ts#L145-L166)) but HOME has **no gear gate** — Priority 1 ([L178-183](../../src/features/workout-engine/shared/utils/method-selection.utils.ts#L178-L183)) returns any method tagged `location==='home'` / `locationMapping.includes('home')` with **zero** gear filtering. So a home-tagged `user_gear` method (e.g. `pullup_bar`) passes unconditionally even when the user owns no bar. Example from log: "עליית כוח בעזרת תנופה" (needs `pullup_bar`) survived the swap to home. `requiresOnlyAvailableGear` (Priority 2.5, [L193-195](../../src/features/workout-engine/shared/utils/method-selection.utils.ts#L193-L195)) only runs when Priority 1 finds nothing, so it never gates home-tagged methods.

**Data layer is already correct** (the gap is purely the selector):
- Profile exists + user-editable: `equipment.home: string[]` ([user.types.ts:204-206](../../src/features/user/core/types/user.types.ts#L204-L206)), set via onboarding [EquipmentSelector](../../src/features/user/onboarding/components/EquipmentSelector.tsx) + [EquipmentEditorSheet](../../src/features/home/components/EquipmentEditorSheet.tsx).
- Empty default = bodyweight + improvised (NOT "has everything"): `resolveEquipment` → `['bodyweight']` ([user-profile.utils.ts:161-166](../../src/features/workout-engine/services/user-profile.utils.ts#L161-L166)); `ASSUMED_HOME_GEAR` = {door, chair, wall, mat, towel} ([gear-mapping.utils.ts:701-707](../../src/features/workout-engine/shared/utils/gear-mapping.utils.ts#L701-L707)). The "assume bar" is IMPLICIT in the un-gated selector, not in the gear list.

**The project (Approach 1):** add `applyHomeGating` symmetric to `applyParkGating`, **inside `selectMethodForContext`** (single source of truth → fixes BOTH generation and swap-all; swap-all inherits it — the muscle-up returns `null` → swap-all rule 2 replaces / rule 3 keep+marks).
- Classify each candidate by `m.requiredGearType` ([exercise.types.ts:443](../../src/features/content/exercises/core/exercise.types.ts#L443), `'fixed_equipment' | 'user_gear' | 'improvised'`):
  - `improvised` → **always allowed** (its whole concept — door/chair/towel), same as bodyweight/surface. Never filtered.
  - `user_gear` + `fixed_equipment` → gate against the user's real `equipment.home`; exclude if absent.
- **Behind a feature-flag** (like `ASSUMED_HOME_GEAR_ENABLED`), because blast radius = ALL home generation. Reuse `satisfiesGearRequirement` + gear-family rules for consistency with park.
- **Verification gate:** confirm home pools do NOT collapse for real users (most home methods are bodyweight/improvised, so the correction should only remove bar/ring-dependent moves for bar-less users) before enabling the flag.

**Q3 (empty home profile) — decided:** default to **bodyweight + improvised only** (matches the existing data default; never assume a bar). Optional later UX: a "declare home gear" nudge for advanced home users so they aren't downgraded — enhancement, not required for correctness.

**Explicitly out of scope:** Approach 2 (post-filter in `useSwapAll` only) is rejected — it would leave the same bug in generation and duplicate gear logic outside the single source of truth.

---

## Hybrid drawer UX — Point 2: drag-vs-scroll — DIAGNOSED, FROZEN (21.07)

**Status:** FROZEN by David after diagnosis. Revisit AFTER point 3 (sticky header) — a fixed top drag-zone may make point 2 unnecessary. Branch `feat/hybrid-drawer-ux`. The broken first attempt (commit `05f4bc8`) is still on the branch (pointer-based handoff); decide keep/revert when un-frozen.

**Symptom (on-device):** at `scrollTop=0`, finger on an exercise card, pull down → sheet does not move. Drag works ONLY from the top grabber — exactly as before `05f4bc8`.

**Diagnosis (hypotheses C+D, A partial):**
- **B false:** ref IS on the correct scroll body (`HybridOverviewScreen.tsx` `flex-1 overflow-y-auto`). scrollTop read is correct.
- **E false:** the exercise cards have no pointer handler / `stopPropagation` (only `onClick`/`onKeyDown`); events bubble fine.
- **A partial:** the `onPointerMove` handler DOES fire on the first sub-6px moves, but the browser claims the touch as scroll/overscroll and fires `pointercancel` before delta crosses the 6px threshold → `start()` never effectively reached.
- **C+D root cause:** the grabber works because it calls `dragControls.start()` on `onPointerDown` (the FIRST event, before the browser commits) AND has `touch-action: none`. The scroll body calls `start()` on `onPointerMove` (after the gesture began) and has NO `touch-action: none` (it must stay pannable to scroll). React's `onPointerMove` is passive → cannot `preventDefault()` the native scroll. So the browser owns the gesture and `dragControls.start()` from a pointermove cannot hijack it. This is exactly why `useSheetScrollChain` uses a **non-passive `touchmove` + `preventDefault`**.

**Accepted fix (technically approved, deferred):** replicate the hook's TECHNIQUE locally (do NOT touch the shared hook or the 4 drawers, do NOT rewrite `useSheetDrag`):
1. `useEffect` attaching a **non-passive** `touchmove` listener (`addEventListener(..., { passive:false })`) on the scroll body.
2. When `scrollTop<=0 && deltaY>0` → `e.preventDefault()` to kill native scroll, then drive the sheet via `controls.set({ y })` (controls already exposed by `useSheetDrag`).
3. On release: nearest detent (position + velocity threshold) → existing `setAnchor(id)`; if same detent, spring back via `controls.start({ y: currentY, spring })`.

**Why frozen:** ~30-40 lines duplicating `useSheetScrollChain`'s technique = a second system. Too many duplicates already. Point 3 (sticky header) gives a fixed top drag-zone that may solve the user's actual pain without this. Reassess necessity after 3.

---

## Hybrid drawer UX — Point 15: map route colors should match the axis (parked 21.07)

**Status:** PARKED (documentation only). Branch `feat/hybrid-drawer-ux`.

**Ask:** the generated route line on the map should be colored by activity to match the journey axis spine — walking/aerobic = green (#10B981), strength = cyan (#00C9F2). Today the map draws the whole route in a single uniform cyan/blue.

**Likely area (verify when un-parked):** the route line is a Mapbox/react-map-gl GeoJSON `Source`/`Layer` — `AppMap.tsx` (route line ~#00ADEF/#00E5FF per color-system.md). A per-activity colored route needs the composed hybrid plan's segment kinds mapped onto the route geometry (split the line into aerobic vs strength-approach sub-segments, or a data-driven line-color expression keyed on a segment property). Coordinate with the color-system doc (§4) and axis colors (AER/STR in HybridJourneyAxis). Not started.

---

## Hybrid drawer UX — Point 9: peek detent too short for the sticky header (parked 21.07)

**Status:** PARKED — next after point-3's live-height fix (variant A) is confirmed on device. Branch `feat/hybrid-drawer-ux`.

**Problem:** point 3 added the summary row (~40px) to the fixed (flex-shrink-0) zone. At peek the fixed content now is grabber(17)+summary(40)+CTA(62)+card paddingBottom(safe-area+12) — the strip is collapsed at peek. That total can EXCEED the peek box height (`0.20 × viewportH`), so peek is cramped **at rest**, not only during drag; smaller screens make it worse.

**When un-parked, show the calc on THREE screen sizes (David's ask), incl. a small iPhone:**
- iPhone SE-class (~667px, sab≈0): peek = 0.20×667 ≈ 133px vs fixed ≈ 17+40+62+12 = 131px → basically no scroll room.
- ~800px (sab≈34): peek = 160px vs fixed ≈ 17+40+62+46 = 165px → ~5px OVER.
- ~900px (sab≈34): peek = 180px vs fixed ≈ 165px → ~15px sliver.
(Verify the real component heights on device before deciding — these are CSS estimates.)

**Candidate fixes (decide later):** compact summary at peek (one tight line, smaller type) · raise peek slightly · or make peek height content-driven (min px like MetricsDrawer's `PEEK_CARD_H = 280` fixed-px approach) instead of a viewport fraction. Do NOT just raise `full`. Don't touch `useSheetDrag` without explicit approval.

---

## Hybrid drawer UX — Point 8: pyramid set display is unclear (parked 21.07)

**Status:** PARKED by David — do NOT touch until hybrid-drawer points 1–5 are done (branch `feat/hybrid-drawer-ux`).

**Symptom (on-device):** In the hybrid map drawer, a pyramid station header reads e.g. "פירמידה עולה-יורדת · 5 שלבים", but underneath it renders only a SINGLE exercise card — no per-step breakdown. The "5 שלבים" claim is not reflected in the body.

**Likely area:** `HybridJourneyAxis.tsx` renders stations via the canonical `ExerciseCard` (one card per exercise). The standalone strength preview has a dedicated `PyramidStepCard` (`workout-preview-drawer/.../exercise-list/PyramidStepCard.tsx`) that renders one row per step; the hybrid axis does not use it / has no pyramid branch. To verify when un-parked: confirm whether the composed hybrid plan even carries per-step data at the station, or only a single exercise + a pyramid label.

**Not started. Diagnose before fixing.**

---

## Consolidate the 11 copies of `stripUndefined` into one shared util
**Opened:** 2026-07-21 · **Source:** gym_equipment editor save-bug fix (commit `8e28892`)

Firestore rejects `undefined` field values, so many write paths strip them first — but the helper is copy-pasted with **no shared home**. There are now **11** private copies (all `function`, none `export`ed, so none importable without coupling):
- [park-import.service.ts:164](../../src/features/admin/services/park-import.service.ts#L164) (deep; guards Date + Timestamp `.toDate`)
- [gym-equipment.service.ts:152](../../src/features/content/equipment/gym/core/gym-equipment.service.ts#L152) (added in `8e28892` — this task's trigger)
- [inventory.service.ts:39](../../src/features/parks/core/services/inventory.service.ts#L39) · [program.service.ts:51](../../src/features/content/programs/core/program.service.ts#L51) · [programLevelSettings.service.ts:93](../../src/features/content/programs/core/programLevelSettings.service.ts#L93) · [userSchedule.service.ts:491](../../src/features/user/scheduling/services/userSchedule.service.ts#L491) · [program-threshold-mapper.service.ts:30](../../src/features/user/onboarding/services/program-threshold-mapper.service.ts#L30) · [group.service.ts:131](../../src/features/arena/services/group.service.ts#L131) · [assessment-rule-engine.service.ts:30](../../src/features/user/onboarding/services/assessment-rule-engine.service.ts#L30) · [booking.service.ts:42](../../src/features/arena/services/booking.service.ts#L42)
- plus a deep variant `stripUndefinedDeep` in [osm-segment-importer.ts:566](../../src/features/admin/services/osm-segment-importer.ts#L566)

The implementations **diverge** (shallow vs deep; some guard Date/Timestamp, some don't) — same "clean before write" intent, different behavior per service. This is exactly the duplication pattern we're trying to stop.

**Task (not blocking):**
1. Add one shared `stripUndefined` (and maybe `stripUndefinedDeep`) in `src/lib/` (e.g. `firestore-utils.ts`), carrying the Date + Firestore-Timestamp guards from the park-import version.
2. Replace all 11 locals with the import; delete the locals.
3. Check each call site's depth expectation (most need only top-level; a few write nested objects) so the shared default matches — or expose both shallow + deep.

---

## `exerciseRole` overwrite at `warmup.service.ts:512` (inner-role flatten)
**Opened:** 2026-07-21 · **Source:** warmup fix Step 2 survey · **Decision:** DEFER — real tech debt, no live pain. Do NOT open the home runner path at end of day for cleanliness. Revisit when touching that path anyway.

**Diagnosis:** `addToBlock` emits `const warmupExercise = { ...ex, exerciseRole: 'warmup' as const }` ([warmup.service.ts:512](../../src/features/workout-engine/services/warmup.service.ts#L512)) — overwriting the **inner** exercise's role. The **outer** `WorkoutExercise` entry separately carries `exerciseRole: 'warmup'` (:525), so inner==outer today. For Part-B preparation warmups (built from *main*-pool exercises on the fly — there is only 1 real `role==='warmup'` doc in 366, a follow-along guide), the overwrite flattens the source exercise's true `'main'` identity.

**Why the overwrite is load-bearing — 3 inner-readers (`ex.exercise.exerciseRole`) break on naive removal:**
1. 🔴 [home/page.tsx:741](../../src/app/home/page.tsx#L741) → :790 — rebuilds the runner plan copying the INNER role into the flattened outer, then groups warmup/main/cooldown by it. Remove overwrite → prep warmup's inner=`'main'` → grouped as MAIN in the home runner plan, not the warmup block. Flagship path.
2. 🔴 [HeroWorkoutCard.tsx:47-48](../../src/features/home/components/HeroWorkoutCard.tsx#L47) `pickHeroExercise` — excludes warmups by inner role; `dynamicWorkout.exercises` includes warmups. Remove → a prep warmup can be picked as the Hero image/video.
3. 🟡 [equipment-collection.utils.ts:48](../../src/features/workouts/components/workout-preview-drawer/utils/equipment-collection.utils.ts#L48) `collectMuscles` — excludes warmup/cooldown by inner role. Remove → warmup muscles pollute the "main muscles" summary.

**Safe:** [section-grouping.utils.ts:52](../../src/features/workouts/components/workout-preview-drawer/utils/section-grouping.utils.ts#L52) reads outer-first (`ex.exerciseRole || ex.exercise.exerciseRole`). Outer-readers all unaffected (outer stays `'warmup'`): whole engine pipeline (BudgetDistributor / PresentationFormatter / GuaranteePass / PipelineOrchestrator), active/overview screens, workout-conversion, StatsOverview, WorkoutSelectionCarousel:302, **useSwapAll:126 — swap already uses the outer role, which is why removing the overwrite buys ~nothing for the swap behaviour we cared about**, derive-swapped-entry:84.

**Ready plan (Option A — single source of truth = the outer role):**
1. `warmup.service.ts:512` — stop overwriting: `const warmupExercise = { ...ex }`; the outer entry keeps `exerciseRole: 'warmup'` (:525).
2. Migrate the 3 inner-readers to the outer role — available + authoritative at all three (each `ex` is a `WorkoutExercise`/`EngineWorkoutExercise`):
   - `home/page.tsx:741` → `ex.exerciseRole` (not `ex.exercise.exerciseRole`)
   - `HeroWorkoutCard.tsx:47-48` → `ex.exerciseRole`
   - `equipment-collection.utils.ts:48` → `ex.exerciseRole`
3. Multi-file commit (NOT warmup-only). Verify: home→runner grouping still populates the warmup block; Hero is never a warmup; muscle summary excludes warmups. tsc.

**Benefit vs risk:** real debt (dual role source + flattened identity) but no live pain — swap already uses the outer role and warmup Steps 1+3 (levels + location routing) deliver the behaviour. Not worth opening the flagship home runner path for cleanliness alone.

---

## Schedule — source-of-truth consolidation (3 tasks, ranked by risk)
**Opened:** 2026-07-22 · **Source:** schedule investigation (3 agents + verification) · **Decided with David:** **S7 `userSchedule/{uid}_{date}.entries[]` = content truth, S4 `lifestyle.scheduleDays` = config truth — both WORKING, do NOT touch.** Full source map is in the investigation report; the 13 "sources" are really 3 facets (config / content / done-state) + fallback layers + dead code, not 13 competitors. Content already converges through S7 + the `scheduleVersion` bus (home:296/1390 → all calendars refetch S7). The real problems are below.

### P1 (highest risk) — the "is it done" axis: 6 sources, no truth
Sources: S7 `entries[].completed` · S8 `dailyProgress/{uid}_{date}.workoutCompleted` ([useProgressionStore.ts:867](../../src/features/user/progression/store/useProgressionStore.ts#L867)) · S9 `useWeeklyVolumeStore.sessionLogs` (localStorage) · S10 activity-minutes≥10 (activity store, via `useDayStatus`) · S11 `goalHistory` (dead) · S12 `useSmartSchedule` hardcode past=completed ([useSmartSchedule.ts:61](../../src/features/home/hooks/useSmartSchedule.ts#L61)).

**Proposed truth: S8 `dailyProgress/{uid}_{date}.workoutCompleted`.** Why: only source that is server-side (cross-device), per-date & self-resetting, AND already written on every completion path (strength summary-mount, running session-end, hybrid finalize — all via `markTodayAsCompleted`, confirmed). S7/S9/S12 are localStorage/derived/broken-writer; not durable-cross-device.

What each other becomes:
- **S7 `entries[].completed`** → NOT the day-done indicator (derive day-done from S8). Keep only if per-*entry* completion is ever needed (multi-workout days) — and then its writer must be rebuilt (today's `markCompleted` is dead + writes the wrong shape, see P3). For now: day-done = S8; drop S7.completed as a competing source.
- **S9 `sessionLogs`** → stays, but as the **weekly-VOLUME** truth (sets/domain volume — a different fact: *how much*, not *whether*). The done-derivation stops reading it.
- **S10 activity-minutes** → stays for **rings/streak** only. Schedule "done" stops OR-ing it in (`useDayStatus` currently does "≥10min OR flag" — change to S8 only). ⚠️ **Product decision for David:** does "done" mean *completed an OUT workout* (S8) or *was active at all* (S10, incl. HealthKit-only)? Recommend S8; rings keep S10 separately.
- **S11 `goalHistory`** → delete with its dead component (P3).
- **S12 hardcode** → **remove.** ⚠️ **Consequence + coupling:** today `useSmartSchedule` marks every *past training day* as `'completed'` unconditionally (a lie — a skipped day shows done). Removing it means past days have NO status until derived from S8 → so S12 removal is **coupled to the S8 wiring**: replace the hardcode with "read S8 for past days" in the same change, else past days render wrong. First VERIFY whether the day's done indicator comes from the `schedule` prop (S12) or from `getDayStatus` (S10/S8) at render — if `getDayStatus` already wins, S12's hardcode is merely misleading; if the prop wins, S8 wiring is mandatory before removal.

### P2 (medium) — the editor (S3): wire to read Firestore, not the in-memory store
Fix bug #3: on entry, hydrate the editor from the authoritative config+content (S4 `lifestyle.scheduleDays` / S5 `recurringTemplate` / S7 `entries[]`) instead of the never-hydrated `useOnboardingStore` (S3). **INDEPENDENT of P1** — the editor edits *content/config*, not done-state, so it does not need the done-truth resolved. Can be done standalone. ⚠️ Two parts: (a) READ = the bug-3 fix (hydrate on entry); (b) WRITE = ensure editor save reconciles with S7 (today it writes S3→S4/S5 only and ignores per-date `entries[]` + tombstones → re-save can silently disagree with the planner). (a) is the standalone fix; (b) is a follow-up.

### P3 (safe, do-immediately) — dead code
- `ScheduleCalendar.tsx` (0 importers, reads dead S11 `goalHistory`) — delete the file.
- `userSchedule.service.markCompleted` (0 callers, writes top-level `completed` via merge that `readDay` never reads) — delete the method.
Both **independent, no dependency on P1/P2.** Safe as a morning task, **separate commit**. ⚠️ Re-verify 0 importers/0 callers at deletion time (concurrent branches / dynamic imports) per git-hygiene before removing.

### Question — is `scheduleVersion` (manual within-session bus) worth making reactive?
**Recommendation: keep the manual bus now — full reactive `onSnapshot` is over-engineering.** BUT it has a real, existing gap, not just theoretical: `scheduleVersion` only bumps when a write routes through the planner's `onScheduleChanged` (home:1390). **S13 community-schedule writes to S7 ([communitySchedule.service.ts:83](../../src/features/user/scheduling/services/communitySchedule.service.ts#L83)) do NOT bump it** → a community/background S7 write won't refresh the strip until remount. Calibrated fix ladder: (1) **now** — audit every S7 writer and ensure it triggers a refresh (cheapest, convention); (2) **later, only if** cross-device or multi-path (community/notification/background) writes become prominent — a single bounded `onSnapshot` on the current-week doc (not all dates). Not full reactive everywhere.

---

## לו"ז — שני הצגים (flame = S8 workout / ring = S10 activity)
**Opened:** 2026-07-22 · **Source:** schedule "two displays" survey · **Direction approved by David:** the day cell shows TWO independent indicators — a **flame** ("you did the OUT workout", from S8) and a **ring** ("you were active", from S10/HealthKit). Survey found ~half already built: colored-by-type flames ([day-display.utils.tsx](../../src/features/home/utils/day-display.utils.tsx)) + activity rings ([ConcentricRingsProgress](../../src/features/home/components/rings/ConcentricRingsProgress.tsx)/ActivityRingsWidget) exist, and both `DayIconCell` + `CompactRingsProgress` already live in the strip file — but as mutually-exclusive views (rings-view dormant, `viewMode` locked to `'icons'` at [SmartWeeklySchedule.tsx:796](../../src/features/home/components/SmartWeeklySchedule.tsx#L796)). **Stage 1 blocks 2 & 3** — without a clean source both fill and placement render the blended datum. This IS the concrete UI of P1 above.

**Product decision (2026-07-22) — softening, not punishing:** a missed-workout day looks IDENTICAL to a planned rest day (neutral icon) — **no "missed" banner, no broken/X icon, no warning**. Rationale: a day without a workout is a day you rested, not a failure. The flame therefore has **3 states → 2 visuals**: (a) OUT workout done (S8) → colored flame by type; (b) planned rest → neutral rest icon; (c) missed workout → the SAME neutral rest icon. No separate "failure" state. The ring is always independent and full per activity (S10). **Contract David approved: two fixed displays — strength (flames) + aerobic/activity-goals (rings). No toggle.**

### Stage 1 (essence) — split the source [BLOCKS 2 & 3]
Today `useDayStatus` ([activity/hooks/useDayStatus.ts:90-93](../../src/features/activity/hooks/useDayStatus.ts#L90)) blends everything into one `isCompleted = totalMinutes>=10 (S10) OR workoutCompleted (S8 today / scheduleCompleted S7 past)`. Split it into two clean axes:
- **`workoutDone` = S8** (`dailyProgress.workoutCompleted`, today AND past) → feeds the **flame**.
- **activity signals** (`hasActivity`/`totalMinutes`/`categories`/`sessions`/`dominantCategory`, all already from S10) → feed the **ring**. Drop/deprecate the blended `isCompleted`.

**Blast radius — getDayStatus consumers (verified). Consumer 1 is DELETED per the product decision, leaving 2:**
1. [home/page.tsx:367](../../src/app/home/page.tsx#L367) — missed-workout banner (`getDayStatus(yesterday).isCompleted`). → **DELETE this usage entirely (not move to S8).** The softening decision removes the "missed" nudge, so Condition C (`bannerType='missed_workout'` at [:370](../../src/app/home/page.tsx#L370), the ONLY branch reading `getDayStatus`) goes away — and with it the `MISSED_BANNER_KEY` dismiss + the `getDayStatus(yesterday)` call. **Already dead-behind-flag** (`SHOW_MISSED_DAYS_PROMPTS = false`, [feature-flags.ts:53](../../src/config/feature-flags.ts#L53)) → removal is pure cleanup, **zero live change**. ⚠️ The SAME banner also carries **Condition B (`re_engagement`, 4+ days inactive)** via `calculateDaysInactive` ([:350](../../src/app/home/page.tsx#L350)) — that does NOT read `getDayStatus` and is a *different* concern (gentle "welcome back", not a failure message). It survives the split untouched; whether to keep it is a separate David call. **Net: removing this drops one getDayStatus consumer → Stage 1 rewires only 2 (strip + month).**
2. [SmartWeeklySchedule.tsx:935](../../src/features/home/components/SmartWeeklySchedule.tsx#L935) — the strip cell. → flame = `workoutDone` (S8); ring = activity (S10). ⚠️ **non-obvious consequence — flame COLOR source shifts:** today the flame's category/color comes from S10 activity-minutes (`getDayStatus.categories/dominantCategory`); post-split the flame is "did the OUT workout", so its color must come from the **workout's own type** (S7 entry `programIds`/`scheduledCategories` → the existing `FLAME_BY_PROGRAM_ICON_KEY`), decoupled from activity minutes. This rewiring is part of Stage 1, not cosmetic.
   **+ collapse missed→rest (product decision):** the flame engine must render `isMissed && !debtCleared` **identically to `rest`** (neutral icon). Remove the distinct `'missed'` category (gray Zz `#9CA3AF`, [day-display.utils.tsx:191/376](../../src/features/home/utils/day-display.utils.tsx#L191)), the `GhostRing` ([SmartWeeklySchedule.tsx:409](../../src/features/home/components/SmartWeeklySchedule.tsx#L409)), and the `isMissed` render branches ([:665-667](../../src/features/home/utils/day-display.utils.tsx#L665)) — they become dead once missed==rest. `debtCleared` (a missed day made up later) still renders the flame = state (a) "done". **Net: the flame has exactly 2 visuals — colored-flame if S8-done, else neutral-rest — and `isMissed` no longer affects the icon.** (Today's missed is already a "soft Zz, not punitive" — this just makes it byte-identical to rest.)
3. [MonthlyCalendarGrid.tsx:464](../../src/features/home/components/calendar/MonthlyCalendarGrid.tsx#L464) — month cell (today). Same split; it already fetches `pastProgressMap` (S8) separately — reuse that as the past-day flame source.

**S7 (`scheduleCompleted`) fate:** removed from the flame's done-signal. The flame reads S8 for BOTH today and past (past-S8 = `dailyProgress/{uid}_{date}` — MonthlyCalendarGrid already fetches it; wire the same into `useDayStatus` so the strip's past cells use S8 instead of the S7 param). `S7.completed` → not a flame source (per P1: derive/drop; its dead `markCompleted` writer is removed in P3's dead-code task).

### Stage 2 (placement) — flame + ring together per-day
The dormant rings code already exists in the strip ([SmartWeeklySchedule.tsx:1218-1258](../../src/features/home/components/SmartWeeklySchedule.tsx#L1218)) — it renders `CompactRingsProgress` *instead of* `DayIconCell`. Don't revive the toggle — **compose**: render the flame (`DayIconCell`, S8) AND a ring (`CompactRingsProgress` via the existing `buildMiniRingData(categories)`, S10) together in one cell (ring around/behind the flame, or adjacent). All pieces exist; the ring's S10 data already flows from `getDayStatus`. Then delete the `ScheduleViewMode` toggle machinery + dead rings-view branches. Mirror the composition in MonthlyCalendarGrid. **Depends on Stage 1** (flame must be S8, ring S10, else both mix). Size: medium (UI composition, no new primitives).

### Stage 3 (FUTURE, separate) — flame sizes + gold flame [replaces the half-flame idea]
**Reframed per David (2026-07-22):** instead of a partial-fill flame (which reads as *shortfall* — rejected, it contradicts "resting isn't failing"), the flame's **SIZE encodes amount** — light / normal / strong — a **reward that grows**, never a lack. **The smallest tier is still a FULL flame.** Plus a **gold flame** for a day that hit BOTH strength AND aerobic — big, prestigious, rare. This resolves the softening tension (bigger = positive). But it is **NOT free**: sizing needs the exact quantity metric the binary Stage 1 dropped, so it is its own future stage (metric + S8 field + Lottie animation bundled). **Does NOT block Stage 1** — Stage 1 ships a binary flame; sizes/gold layer on top later.

- **Quantity metric — cleanest = sets, not time.** Strength "amount" = `setsCompleted` (already in `SessionLog` S9, [useWeeklyVolumeStore.ts:77](../../src/features/workout-engine/core/store/useWeeklyVolumeStore.ts#L77)) measured against the day's `targetSets` (already computed by [dailyStrengthTarget.ts:83](../../src/features/home/utils/dailyStrengthTarget.ts#L83)). Ratio `setsCompleted / targetSets` → 3 size tiers: **light** (completed but below target — still a full flame), **normal** (met target), **strong** (exceeded). Time/duration rejected — noisy (rest inflates it; doesn't reflect work).
- **Required S8 field.** S9 is localStorage / weekly / single-device, so for sized flames on past & cross-device days, persist per-day on `dailyProgress` (S8): `setsCompleted` + `setsPlanned` (store the RAW pair, not a frozen tier, so tiers can be re-tuned later), alongside `workoutCompleted`.
- **"Hit goal" — defined SEPARATELY per axis:**
  - **Strength goal met** = `setsCompleted >= targetSets` (S8). "strong" tier = exceeded.
  - **Aerobic goal met** = the activity ring closed for the day — the S10 activity/steps target reached (existing `stepGoalMet` / activity-minutes target; past days from activity-history). Independent of strength.
  - **GOLD flame** = **both** met on the SAME day (`strengthGoalMet && aerobicGoalMet`). Largest, prestigious, rare. Past-day gold = S8 strength-goal + S10 activity-goal for that date (no extra field beyond the S8 sets pair, since aerobic comes from activity history).
- **Animation:** sized + gold flames warrant **Lottie** (per David) — bundle the animation with this stage, not with Stage 1's static flame.
- **Depends on:** Stage 1 (clean S8 flame source) + the S8 sets field. Size: large (metric persistence + tiered/gold render + Lottie). Kept OUT of the Stage-1 critical path by design.

### Ordering
**1 → 2 → 3.** Stage 1 is the gate. Stage 3's data sub-task (add the ratio to S8) can start in parallel once Stage 1 fixes S8 as the flame truth. Note the natural sequencing with P1/P2/P3 above: this "two displays" work IS the delivery vehicle for P1 (done-state split); P3 dead-code (delete `markCompleted`/`ScheduleCalendar`) can go first & independently.

---

## route_stops overview drawer — generic "אימון מלא בפארק" header regardless of actual route type
**Opened:** 2026-08-04 · **Source:** Playwright QA of PR #26 (`fix/route-stops-map-markers-04-08`, merged `8c887c4`)

[HybridOverviewScreen.tsx:399](../../src/features/parks/core/components/hybrid/HybridOverviewScreen.tsx#L399) hardcodes the drawer's top-line title:
```tsx
{MAP_OVERVIEW_CHROME_V1 ? `אימון מלא בפארק · ${aerobicKind === 'running' ? 'ריצה' : 'הליכה'} + תחנת כוח` : 'אימון משולב'}
```
This string is unconditional on the actual composed route kind — it renders even when the route is `route_stops` (verified live: overview showed "אימון מלא בפארק · הליכה + תחנת כוח" for a 4-stop route_stops session, while the smaller breadcrumb chip elsewhere in the same drawer correctly read "מסלול + עצירות"). Looks like `full_park` phrasing that was never branched when `route_stops` was added. Not a marker/data bug — purely a mislabeled header string. Needs a route-kind-aware title (or at minimum swap in the `route_stops` preset's own title/subtitle from [hybrid-slots.ts](../../src/features/workout-engine/hybrid/hybrid-slots.ts) instead of the hardcoded literal).

---

## route_stops map markers may render overlapping/touching when two stops are close together
**Opened:** 2026-08-04 · **Source:** Playwright QA of PR #26 (`fix/route-stops-map-markers-04-08`, merged `8c887c4`)

Observed live: on a 4-stop Tel Aviv `route_stops` route, two icon-fallback stop markers (no park photo — e.g. a "גרם מדרגות" stairs icon and a mascot-style icon) rendered directly adjacent/overlapping on the map, visually harder to distinguish as two separate stops than the photo markers were.

[AppMap.tsx:1806](../../src/features/parks/core/components/AppMap.tsx#L1806) (the `hybridStations.map(...)` marker loop, this PR's own change) has no collision/decluttering logic between stop markers — each renders at its literal lat/lng with no offset when stops are close. [route-stops.service.ts:35](../../src/features/workout-engine/hybrid/route-stops.service.ts#L35) (`MIN_STOP_GAP_M = 150`) dedupes stops that are *too* close on the same path segment, so the overlap may be real ~150m-scale proximity between stops on different path legs (not a dedupe bug) — or it may need a small per-marker visual offset when two stops land within a few screen-pixels at typical zoom. Root cause (real-world distance vs. missing visual decluttering) not diagnosed — flagged for a separate investigation, not fixed here.

---

## Future idea — "stairs workout" as a route_stops station type
**Opened:** 2026-08-04 · **Source:** David, during station-expansion scoping round 2 — explicitly documentation-only, NOT investigated or feasibility-checked this round.

Idea for a future station type: a stairway (public outdoor steps) as a dedicated `route_stops` stop kind, offering a stairs-specific workout (step-ups, sprints, etc.) — distinct from the existing generic "גרם מדרגות" (stairs) icon-fallback marker already seen in route_stops output (see the overlap-observation entry above, which shows a stairs marker rendering today as a plain icon with no dedicated content). No scoping, no complexity estimate, no code investigation done on this — pure idea capture for a later round. See [Station-Expansion Scoping](station-expansion-scoping.md) for the actual scoped parts (A/B/C) of the current route_stops expansion work.

---

## Future — dedicated workout-content for hydraulic park machines
**Opened:** 2026-08-04 · **Source:** David, during unassessed-domain-gate work (branch `feat/station-home-grass-04-08`)

`gym_equipment` collection (55 docs, live-audited 04.08.2026) has `isFunctional: boolean` **100% populated** (0 undefined, sample-verified accurate: hydraulic machines correctly `false`, real pull-up/dip/monkey-bar gear correctly `true`) — see [Station-Expansion Scoping](station-expansion-scoping.md) round 3 for the audit. Each doc also carries REAL, filled content: `description` (Hebrew usage instructions) + `brands[].videoUrl`/`imageUrl` (real CDN video/images, usually 2+ brands per machine) — already rendered to end-users today via [EquipmentDetailDrawer.tsx:793,813](../../src/features/parks/client/components/equipment-detail/EquipmentDetailDrawer.tsx#L793) (opened from `EquipmentCard.tsx` / `ParkDetailSheet.tsx`, i.e. the park detail page, not admin).

**The gap:** none of this ever reaches the workout-GENERATION engine. `GymEquipment.targetPrograms` is explicitly commented "metadata-only; not used by workout engine yet" ([gym-equipment.types.ts:41-42](../../src/features/content/equipment/gym/core/gym-equipment.types.ts#L41)) and confirmed by a full-codebase grep: **zero reads** of that field anywhere. Every workout-engine consumer of `gym_equipment` (`gear-mapping.utils.ts`, `execution-method-selector.service.ts`, `InputSanitizerMiddleware.ts`, `home-workout.service.ts`, `useSwapAll.ts`) uses it ONLY to resolve a Hebrew name/id to a canonical gear-id — never as exercise content. This is WHY [gear-mapping.utils.ts:465-473](../../src/features/workout-engine/shared/utils/gear-mapping.utils.ts#L465) has to collapse hydraulic machine names onto the same canonical id as real calisthenics gear (`pullup_bar`, `bench`) — splitting them today would just make hydraulic-only parks match zero exercises.

**Future task (not scoped, not estimated):** build a real content/selection path from `gym_equipment` (description + video, already exists) into the workout engine — e.g. a new `activityType` or dispatch branch keyed off `isFunctional:false`, sourcing instructions from the equipment doc itself rather than the `Exercise` catalog. Only once that exists does it make sense to actually split the canonical-gear-id collapse above.

---

## Free Run route-carousel — 3 cards shown but all display the same route
**Opened:** 2026-08-07 · **Source:** David's device confirmation of the 22.5km large-target fix chain (6 rounds, see [Free Run Multi-Leg Feasibility Scoping](free-run-multileg-feasibility-scoping.md)) · **Not blocking** — noted alongside the fix confirmation, explicitly deferred.

**Symptom (on-device, David's exact address, 22.5km target):** `RouteCarousel` rendered 3 route cards as usual, but all 3 displayed the *same* route geometry — not 3 distinct waypoint-combination variants the way shorter/more-central-location requests normally show.

**Not diagnosed — likely area, not confirmed:** `generateDynamicRoutes` ([route-generator.service.ts](../../src/features/parks/core/services/route-generator.service.ts)) builds up to 5 candidate combinations (rotating `baseOffset`/`i*2` through the bearing-sorted `topCandidates` array) and returns the first `MIN_REQUIRED_ROUTES` (default 3) that pass the distance window as separate cards. Two live hypotheses, neither checked yet:
1. **Real-data sparsity collapsing distinct combos to the same route.** This exact address has a very lopsided sector population (`[211,6,2,0,0,1,14,66]`, see the scoping doc) — after the 08.08 fixes (round-robin + synthetic sector-fill), several of the 12 selected candidates may sit close enough together (or the synthetic ones close enough to real neighbors) that different `(wp1,wp2,wp3)` triples produce geometrically near-identical Mapbox routes once snapped to real streets, especially with `continue_straight:true` forcing similar paths.
2. **A dedup/variety step upstream of the carousel** (not investigated) might be collapsing near-duplicate routes down to one and re-displaying it, rather than genuinely offering 3 diverse options.

**Task (not blocking, not scoped):** diagnose whether this is specific to sparse-data/large-target combinations introduced by the 08.08 fix chain (i.e. a side effect of `selectAngularlyDiverseCandidates`' synthetic fill making candidates too similar to each other in some cases) or a pre-existing variety gap unrelated to this session's work. Verify with real coordinates/logs, same discipline as the rest of this investigation — do not guess.

---

## Runna-style 3-choice return flow for missed running-program days (A1c) — fully frozen, not even planned further
**Opened:** 2026-08-10/11 · **Source:** David, during the schedule/rest-day build-plan round (see plan history in git log around this date / the build-plan conversation) — explicitly frozen: not to be built, and not to be planned further, until re-opened.

**The idea:** replace the current `PlanRealignPopup`/`RebuildPopup` flow (`src/features/workout-engine/players/running/components/PlanAlignmentPopup.tsx`) with an explicit 3-choice bottom sheet when a user returns to a running program after a gap:
(a) continue the program from exactly where they left off (as if the gap never happened)
(b) restart the program from the beginning
(c) proceed normally from today (ignore the gap, just continue the schedule)

Inspiration cited: Runna app's handling of this (not verified against Runna itself — worth a quick look if this is picked back up).

**What was already found, so it doesn't need re-discovering:**
- `PlanRealignPopup` (`PlanAlignmentPopup.tsx:17-92`) is **already** a 3-button bottom sheet structurally (`onContinue`/`onBackOneWeek`/`onReset`) — good visual/structural template to reuse. But **none of the 3 existing buttons match the 3 new semantics**: "Continue" today is a pure no-op (no Firestore write — `dismissAlignment`, `StatsOverview.tsx:399-403` — so the popup just reappears later); "Back one week" (`rollBackOneWeek`, `workout-completion.service.ts:202-251`) *substitutes* the previous week's workout content into the current week, it does not resume the actual missed content; "Reset" routes to the **full onboarding wizard** (`onboarding-sync.service.ts:1605-1652`), which is heavy (re-asks the whole questionnaire), not a lightweight in-place restart.
- **Real pre-existing data-model inconsistency, unrelated to this feature but load-bearing for it:** `ActiveRunningProgram.currentWeek` (stored) and calendar-derived week are already out of sync during a gap — `NextRunWorkoutCard.tsx:130` reads the stored, write-time-frozen `currentWeek`; `AgendaDayCard.tsx:191-199`'s `resolveRunningEntry` always recomputes week purely from `(today − startDate)/7`, ignoring the stored value. The two screens can show different "current week" during a gap, today, with no feature involved.
- **What each of the 3 new choices would technically require:**
  - (a) "continue exactly where left off": no existing primitive. Cleanest approach found: shift `activeProgram.startDate` forward by the gap length so all calendar-derived math (`calculateCurrentWeek`, `resolveRunningEntry`) lands back on the same week/day — plus prevent `markSessionComplete`'s `autoSkipMissedEntries` (`workout-completion.service.ts:64-74,107`) from immediately re-shifting things forward on the next completion.
  - (b) "restart from the beginning": two paths — reuse the full onboarding flow as-is (heavy, forces re-onboarding, but zero new code — it's what "Reset" already does today), or build a lighter in-place restart modeled on the strength engine's `_persistCycleRestart` (`home-workout.service.ts:1097-1125` — resets `startDate`+`currentWeek` via one `updateDoc`, no re-onboarding), ported to running's `schedule[]` shape (would need to regenerate `schedule` via `generatePlan` using the user's already-stored program template/pace profile instead of re-running the wizard).
  - (c) "proceed normally, ignore the gap": closest to the implicit default (calendar-driven auto-skip already happens on the next `markSessionComplete`), but nothing today durably marks the gap as "resolved," so the realign popup would keep reappearing — needs an explicit persisted acknowledgment (e.g. touching `lastWorkoutDate` or a new flag).
- No generic shared bottom-sheet/action-sheet component exists anywhere in the codebase (every sheet, including `PlanAlignmentPopup`, reimplements its own `motion.div` overlay markup) — `PlanAlignmentPopup.tsx`'s existing markup is still the best template to copy, not extract.

**Not scoped, not estimated, not to be picked up without re-confirming with David first** — this is bigger than it looks (touches the running-program data model, not just a popup's button labels).

---

## `onboarding-sync.service.test.ts`'s `existingOnboardedUser()` fixture is internally contradictory — not fixed, logged only
**Opened:** 02.09.2026 · **Source:** David, reviewing the primaryTrack-overwrite-on-re-entry fix (`onboarding-sync.service.ts:1849` area, idempotent-booping-sunrise.md's post-2b work).

`existingOnboardedUser()` (`onboarding-sync.service.test.ts:388-411`) sets `lifestyle: { primaryTrack: 'run', dashboardMode: 'RUNNING' }` on a profile whose `progression` is entirely strength (planche domain/tracks/activePrograms) and whose `running: { isUnlocked: false, ... }` — a real user can never actually be in this exact combination (primaryTrack='run' implies running is the active identity, but isUnlocked=false means running was never actually completed/unlocked). The fixture works for what it's used for (proving a value is *preserved* untouched, regardless of what that value is) but the specific value chosen doesn't describe a real user. David: don't fix it as part of this round — just log it so a future pass doesn't accidentally treat the fixture's shape as a real reference case. Whoever touches this fixture next should pick an internally-consistent value (e.g. `primaryTrack: 'strength'` + `running.isUnlocked: false`, or `primaryTrack: 'run'` + `running.isUnlocked: true`) and re-verify every test that depends on the current exact value doesn't silently break.

---

## `lifestyle.scheduleDays` — two bugs, one field, fix together before the drawer is built
**Opened:** 02.09.2026 · **Source:** David, reviewing commit 5 (2a, idempotent-booping-sunrise.md) — one item, not two, both hit the same field.

(a) **Not written at all for a pure runner.** `onboarding-sync.service.ts:570`'s block — the only place in the file that assigns `lifestyle.scheduleDays` — is gated behind `if (data.trainingDays !== undefined)`. `trainingDays` is written by exactly one place, `ScheduleStep.tsx:444` (the strength picker). A user who never renders `ScheduleStep` never sets `trainingDays`, so this block never runs — `RunningScheduleStep.tsx`'s own `scheduleDays: mergedDays` write (merging running days into the global field) reaches the onboarding store's `data` but never Firestore. Confirmed live in production today, independent of commit 5 (which inherits it via `resolveDefaultRunningSchedule`'s write, same field, same gate, same silent no-op).

(b) **Accumulates without subtracting on a running-day change.** Already tracked (commit 3/2d's own review, running-schedule-write.service.ts) — a plain union merge, no per-item ownership, so changing running days from one set to another leaves the old days sitting in `lifestyle.scheduleDays` forever, only ever growing.

**Why (a) isn't visible today, and why that just changed:** `home/page.tsx:2371`'s `isRunningMode` check makes the home screen prefer `running.scheduleDays` (which IS written correctly, ungated) over the broken `lifestyle.scheduleDays`, whenever `isRunningMode` is true (`resolvedDashboardMode==='RUNNING'||'HYBRID'`) — masking (a) from view for exactly the population most likely to hit it. The bug only becomes visible when `isRunningMode` is false while the user still has real running days — e.g. a strength user who added running and stayed on `dashboardMode:'PERFORMANCE'`. The primaryTrack-preservation fix just merged (`onboarding-sync.service.ts:1849` area, same round) makes this population larger, not smaller: before that fix, a strength user completing the running branch got silently flipped to `dashboardMode:'RUNNING'` (masking this bug as a side effect); now their dashboardMode correctly stays put, so more real users will sit in the `isRunningMode===false`-with-real-running-days state where (a) is actually visible. Not a regression from that fix — increased exposure of a pre-existing bug, opened eyes-open.

**Fix order, when picked up:** (b) before (a) — resolving the merge-strategy (per-item ownership, matching the `mergeDayItems`-style fix already applied to `recurringTemplate`, gap-map finding #9) before widening who writes to the field, so the accumulation bug doesn't get a second, wider door into it. Both before the schedule-builder drawer (Block 3) is built — it will read this exact field.

Not touched as part of commit 5 (David, 02.09.2026: stay in scope, don't open the `:570` gate) — three reasons on record: not caused or worsened by commit 5; fixing (a) before (b) is the wrong order; and `onboarding-sync.service.ts:825` already feeds `onboardingAnswers.trainingDays` from `data.scheduleDays` independent of the `:570` gate, so opening it would shift the relationship between two representations nobody has audited the readers of yet.

**⚠️ Coupling to check before opening `:570` — found during commit 5's own review, easy to miss in a month:** `RunningScheduleStep.tsx`'s signup-pass-through effect (`resolveSignupDefaultWrite`, `src/lib/running-schedule-signup-default.ts`) computes `scheduleDays` from `profile?.lifestyle?.scheduleDays` (`strengthDays`) merged with the new running defaults — gated on `useUserStore`'s `_hasHydrated` specifically because `profile` can still be `null` at mount. Today that gate is redundant-but-harmless: `:570`'s own gate already drops the whole `scheduleDays` write regardless of what this effect computes. The moment `:570` is fixed, this effect's own `hasHydrated` gate becomes load-bearing for real — whoever fixes `:570` must re-verify this effect still can't fire before `strengthDays` reflects the real, hydrated profile, or a real user's strength days get silently dropped from `lifestyle.scheduleDays` on their running signup. Not a hypothetical: this exact bug was caught and fixed in commit 5's own review before `:570` was even in scope — same failure mode, one gate earlier.

**⚠️ RunningScheduleStep's signup render is a spinner with no exit; protected today only by call order, not by design.** David verified (02.09.2026, own check, not requested): `useUserStore`'s `onRehydrateStorage` (`useUserStore.ts:321-327`) calls `setHasHydrated(true)` on every real rehydration, but returns early on `if (error)` (`:322-324`) without ever setting it — if rehydration ever errors, `_hasHydrated` stays `false` forever and `resolveSignupDefaultWrite`'s gate never opens, leaving the pass-through screen (`src/lib/running-schedule-signup-default.ts`) spinning with no way out. What actually closes this today isn't the gate itself — it's that `dynamic/page.tsx`'s `initializeProfile` (`:434`) always runs before either of its two navigations into this screen (`:544`, `:570`), in the same session, so `_hasHydrated` is already `true` by the time `RunningScheduleStep` mounts. No realistic stuck scenario exists today; no code change needed. But if `dynamic/page.tsx`'s `handleComplete` call order ever changes — `initializeProfile` moved after the navigation, or dropped — this becomes a real stuck-spinner bug, silently, because nothing enforces the ordering that currently protects it.

---

## "Which workout is today" is implemented three times, independently — same bug class in all three

**Opened:** 02.09.2026 · **Source:** David, during the A2 fix (finding [A2] below) — traced the same class of defect to two more components while identifying the real one.

Three separate, independent implementations of "resolve today's running workout from this week's schedule entries," none aware of the other two:

1. **`RunningWorkoutCards`** (`SmartWeeklySchedule.tsx`) — the one actually shown in David's screenshot. Fixed this same day: extracted to `resolveTodayRunningWorkout` (`src/lib/running-today-workout.ts`), a real fallback bug removed (see [A2] below).
2. **`NextRunWorkoutCard.tsx:175-187`** — a *different* component with the *same* bug shape (`todayEntry ?? weekEntries.find(pending) ?? weekEntries[0]`), investigated earlier the same day, not yet fixed (David: hold until Firestore data would confirm which component was actually seen — turned out to be #1 instead, so this one is still open on its own).
3. **`resolveRunningEntry`** (`AgendaDayCard.tsx`) — the per-calendar-day resolver used by the agenda/calendar view. Not yet audited for this specific fallback-shape bug, only for the separate `calculateCurrentWeek` clamp issue (fixed the same day, `isDateWithinRunningPlan`).

**The extracted pure function (`resolveTodayRunningWorkout`, #1's fix) is the natural candidate to unify all three around** — it already answers exactly the question `NextRunWorkoutCard` and `resolveRunningEntry` each re-derive their own way. The schedule-builder drawer (Block 3) will also need this same "what's today's entry" question and should reuse it rather than writing a fourth version.

**Not unified in this round** — #1 was fixed alone, scoped narrowly (David: don't touch design, don't build anything new). #2 and #3 are open, separate follow-ups.

---

## Running-track device verification (02.09.2026, gate rollout) — seven findings, none fixed yet

**Opened:** 02.09.2026 · **Source:** David, on-device verification of `RUNNING_ONBOARDING_GATE_ENABLED` after the full rollout — the gate itself works (blurred card → tap → LifestyleWizard → confirms → opens correctly, all four points verified). These seven are separate findings surfaced during that same pass, none of them about the gate itself. Grouped by root, not by the order they were reported.

### [A] Program anchor date — one root, two symptoms — ✅ A1 fixed, A2 turned out to be a different bug entirely

Registration happened 02.09; the running plan's own week-1 anchors to 30.08 (`Sunday` of that week) — week 1 starts before the account existed.

- **A1 — phantom past workouts.** Sun 30.08 and Tue 01.09 render as *missed* workouts, on days that precede the account's own existence. **✅ Fixed the same day** — root cause was `calculateCurrentWeek`'s `Math.max(1,...)` clamp (also [B]'s root); fixed via `isDateWithinRunningPlan` (`src/lib/running-plan-date-range.ts`) guarding the 3 display sites that can ask about a date other than "today" (`AgendaDayCard.tsx`, `TrainingPlannerOverlay.tsx`, `RollingAgenda.tsx`).
- **A2 — "today's workout" card shows the wrong day's session.** Originally assumed to be `NextRunWorkoutCard.tsx` and the same root as A1 — **both wrong**, caught by David identifying the actual component from the screenshot's own strings (`grep`, not Firestore access). The real component is `RunningWorkoutCards` inside `SmartWeeklySchedule.tsx` — a completely independent implementation (see the "implemented three times" entry above) with its own, unrelated fallback bug, nothing to do with `calculateCurrentWeek`. **✅ Fixed the same day** — see that entry for the fix.

**David's product decision (still open, not yet acted on):** the plan should start from the moment of registration — no days should precede it. A1's fix (hiding pre-start dates from the calendar/week-label views) satisfies the *symptom*; whether the underlying `activeProgram.startDate`/week-1 anchoring itself should also change is a separate, unaddressed product question.

### [B] Week label frozen — three different calendar ranges, all labeled "week 1" — ✅ fixed, confirmed same root as A1

In the planner UI, three actually-different date ranges (23-29 Aug, 30 Aug-5 Sep, 6-12 Sep) all display as "שבוע 1". Confirmed (not assumed) same root as A1, by hand-computing `calculateCurrentWeek`'s formula against the three real Sundays — all three clamp to week 1. Fixed by the same commit as A1 (`TrainingPlannerOverlay.tsx`'s `weekNumber` now checks `isDateWithinRunningPlan` first).

### [C] Wrong icon in the planner for a running day
A day with a running workout shows a strength/muscle icon in the large planner view, but correctly shows an orange running icon on the home-page card for the same day. Two separate icon-resolvers; one of them doesn't know about running at all.

### [D] Missing widgets in the "Weekly Progress" scroll for a runner
`RunForecastWidget` and `StrengthVolumeWidget` don't appear under "התקדמות שבועית" for a runner — only "מדדי בריאות" shows. (Note: `RunForecastWidget` is independently confirmed, in the running-progress-card scoping seed written the same day, to be built but rendered nowhere at all today — consistent with this finding, not necessarily the same fix.)

### [E] First-workout card position
The first-workout card renders above the carousel; it should render inside it.

### [F] Card tap opens the map instead of the workout drawer
Tapping the workout card (on the home page, or in the planner) navigates to the map. It should open the workout drawer instead. Explicit clarification from David: this is the *workout* drawer — a different thing entirely from the schedule-builder drawer currently being scoped (Block 3).

None of the seven investigated for root cause or fixed as part of this entry — pure on-device findings capture, per David's explicit request to document all seven including the ones not getting fixed soon.

---

## Future idea — smart-coach chat reinforcement instead of a screen element
**Opened:** 2026-08-19 · **Source:** David, while confirming the Stage D/E completion-card decision (`adaptive-snacking-valiant.md` plan) — explicitly documentation-only, not connected to that plan, not investigated or scoped.

Idea for a future direction: post-workout encouragement/congratulations could come from the in-chat smart coach as a text message, instead of (or alongside) a dedicated screen element (e.g. the home completion card / multi-activity strip this plan builds). No scoping, no feasibility check, no code investigation — pure idea capture for a later round.

---

## `getUpperBodyDominance` + `buildUpperCalisthenicsSession` — written, spec-matching, zero callers
**Opened:** 04.09.2026 · **Source:** David, read-only mapping of the strength schedule's rule engine before scoping the schedule-builder drawer's rules module.

`src/features/schedule/engine/scheduleRules.ts`'s `getUpperBodyDominance()` (`:575-582`, §5.3/5.4's "an UPPER_BODY day next to a push/pull skill shifts to 70/30 dominance") and `buildUpperCalisthenicsSession()` (`:607-644`, §5.5's dynamic push/pull-aware session builder) both exist, match `out-run-schedule-logic-v1.3.md`'s spec exactly, and have **zero live callers anywhere** (confirmed by grep — nothing outside their own definitions and tests). `buildDefaultTemplate` — the function that actually builds what a user sees — never calls either.

**The fourth instance today of "code exists and doesn't run."** Not investigated further, not fixed — logged so a future reader doesn't assume §5.3-5.5 of the spec is live just because the functions implementing it are fully written and tested.

---

## Lower-body onboarding pick never reaches the schedule questionnaire — structural, not a fix-in-place bug
**Opened:** 04.09.2026 · **Source:** David, on-device — picked "פלג גוף תחתון" during onboarding, the schedule questionnaire (`ScheduleStep.tsx`) still showed upper body.

Traced and confirmed structural, three independent layers all missing the same concept:
1. `ProgramId = 'FULL_BODY' | 'UPPER_BODY' | 'UPPER_CALISTHENICS'` (`smartSchedule.types.ts:23`) — **no lower-body value exists in the type at all.**
2. `program-path/page.tsx` writes a "legs" pick to `sessionStorage['onboarding_muscle_focus']` (`:84`) — a real, separately-consumed key (read by the assessment-domain-selection code, `assessment-path-config.service.ts:57`). `resolveScheduleSeed()` (`scheduleSeed.service.ts`, the schedule questionnaire's seed resolver) **never reads this key at all** — only `onboarding_skill_focus`/`onboarding_program_path`.
3. Even the coarse `programPath==='body_focus'` fallback (`resolveScheduleSeed:157-158`) maps every body-focus pick to a flat `UPPER_BODY`, with no branch reading which muscle was actually chosen — and `resolveScheduleId`'s substring matcher (`:82-90`) has no legs/lower-body case even for an existing user's stored program name.

Net effect: picking lower-body silently and permanently resolves to `UPPER_BODY`, every time, at every layer.

**Resolved by the ownership principle (`hybrid-display-decisions.md`'s "הכרעה סופית," 04.09.2026), not a point-fix.** The schedule/drawer only offers programs the user has actually opened (filled in, assessed, unlocked) — a program that doesn't exist yet is simply never offered, no `UPPER_BODY` substitution needed. If/when a lower-body program is built, it appears to its owner on its own. Not fixed here as a standalone patch to `ProgramId`/`resolveScheduleSeed` — logged as the concrete bug the ownership principle exists to close.

---

## `RollingAgenda`'s `isTrainingDay` and `MonthlyCalendarGrid`'s `isTraining` answer "any training day," not "running day" — not wired to the shared resolver
**Opened:** 05.09.2026 · **Source:** David, checked before wiring `resolveRunningDayState` (`src/lib/running-day-resolution.ts`) into the two remaining agenda consumers found the previous round.

`RollingAgenda.tsx:95-101`'s `isTrainingDay(iso, template, runScheduleDays)` returns `true` if **either** `runScheduleDays?.includes(letter)` (running) **or** `template[hLetter]?.length > 0` (the strength `recurringTemplate`) — an OR across both domains, feeding `dragListener` eligibility (`:636`). `MonthlyCalendarGrid.tsx:163`'s `isTraining = scheduleDays?.includes(dayLetter)` is fed by `home/page.tsx:2488-2490`'s `userScheduleDays` — itself a mode-dependent merge (`running.scheduleDays` only when in running mode and non-empty, else `lifestyle.scheduleDays`) — same broader shape, different mechanism.

**Not the same question `resolveRunningDayState` answers**, and not wired to it — connecting a broader concept to a narrower function would be worse than the existing duplication (per the standing instruction this session: "חיבור של מושג לא מתאים לפונקציה גרוע יותר מהשארת הכפילות").

**Live consequence for the exact profile shape this whole fix chain is about** (empty `running.scheduleDays`, real `activeProgram.schedule`): running days are **not draggable** in `RollingAgenda` and **not marked** in `MonthlyCalendarGrid`'s month view — even after the drawer/agenda fixes already shipped (`AgendaDayCard`'s day-cards now correctly show the workout; these two checks are separate call sites that don't consume `AgendaDayCard`'s resolution).

**Fix direction, not built:** compose, don't connect directly — `hasStrengthTemplateForDay(...) || resolveRunningDayState(...).isRunDay`, once the shared resolver is mature (post-`AgendaDayCard` device verification). A union check at the call site, not a new capability inside `resolveRunningDayState` itself — that function should stay answering exactly "is this a running day," not grow a strength-awareness branch of its own.

---

## Finished running plan — no upper bound, generic "workout" for a plan that's over
**Opened:** 05.09.2026 · **Source:** David, read-only verification after the date-scoping fix (`resolveRunningDayState`) — checking whether `isDateWithinRunningPlan` could also catch a *finished* plan, not just a not-yet-started one.

`isDateWithinRunningPlan` checks only "on or after start" — **no upper bound at all.** `calculateCurrentWeek`'s own `Math.max(1, ...)` also has no cap — an 8-week plan reports "week 20" after 20 real weeks have passed, forever, with nothing to stop it.

**Consequence, traced end to end, for a user who finished their plan and still has `scheduleDays` populated:** `isRunDay` in `resolveRunningDayState`'s `scheduleDays` branch is pure weekday-membership (`scheduleDays.includes(todayHe)`) — it has never depended on whether a real schedule entry exists for the resolved week. So `isRunDay` stays `true` on any scheduleDays-matching weekday, `weekEntries` for the (real, but far-past-the-plan) resolved week is empty, and `NextRunWorkoutCard`'s own `useMemo` (untouched by this session's fixes) falls through to its existing generic default: `workout:'easy'`, `workoutLabel: undefined`, `pendingWorkoutId: undefined`. The user sees "האימון שלך היום" and a generic **"ריצה קלה — [distance]"** card with a **"התחל ריצה"** button that opens the briefing drawer without ever loading a real workout (`pendingWorkoutId` is `undefined`, so the load effect's own guard never fires). No copy anywhere indicates the plan has ended.

**Pre-existing, not created by this session's fix chain.** Both the `isRunDay` weekday-check and the `useMemo`'s generic fallback are lines carried over unchanged from before Commits 1-4 — confirmed identical before/after by direct trace, not assumed. Touches every user who ever finishes a running plan while `scheduleDays` stays populated — not an edge case.

**Fix direction, not built:** give the plan a real upper bound (total weeks, already known via `canonicalWeeks`/the schedule's own max week) and a dedicated "plan finished" state with its own copy (e.g. offering a follow-up plan) — not a silent fall-through to the generic-easy-run default.

**Not investigated:** `RunBriefingDrawer`'s own empty/loading state when opened with `workout: null` and `pendingWorkoutId: undefined` — unread, not asserted.

---

## `HILL_CATEGORIES` missing `hill_long` — 2/3, scoring only, not a safety filter
**Opened:** 04.09.2026 · **Source:** David, read-only investigation into `HILL_CATEGORIES` vs `INJURY_EXCLUDED_CATEGORIES` before the running rule family doc.

`running-engine.service.ts:1632` defines `HILL_CATEGORIES` as 2 values (`hill_sprints`, `hill_short`), while the `WorkoutCategory` type contains 3 `hill_*` members. Used for a scoring penalty on weekly hill-volume (`:1577`) and to update `lastHillWorkUnits` (`:1852`) — scoring only, not safety. Result: `hill_long` workouts are never counted toward the volume penalty.

`INJURY_EXCLUDED_CATEGORIES` (`plan-generator.service.ts:475`) and the separate `HILL_CATEGORIES` in the admin tool (`rank-hills/page.tsx:27`) both contain all 3 — so the omission here looks like drift, not intent. Not fixed.

---

## Injury-exclusion filter is dormant — correct code, unreachable input
**Opened:** 04.09.2026 · **Source:** David, same investigation as above.

The `excludeCategories` mechanism is complete and correct, but `hasInjuries` stays `false` forever: the `q_run_injuries` question has been marked REMOVED since the commit that created it (`87a2099d`), and the admin sync tool deletes it from Firestore on every run. There is no way for a user to report an injury in the running flow today.

הוכרע (דוד): לא נשאלת שאלת פציעות ולא נבנה מענה לפציעות.
המוצר אינו לוקח אחריות בתחום הזה. הסינון נשאר רדום בכוונה.
אין לפתוח אותו בלי החלטה מפורשת חדשה.
נובע מכך: RUN-08 ומגבלות הימים הרצופים ב-RUN-04 הם המנגנונים
היחידים שמגבילים עומס, ולכן אין להחליש אותם.

---

## שלושה יעדי נפח שאינם מחוברים
**Opened:** 05.09.2026 · **Source:** דוד, חקירת READ-ONLY לפני בניית ruleFamily.ts.

(א) `weeklyVolumeTarget` — Firestore, ניתן לעריכה באדמין, מזין את `useWeeklyVolumeStore` ואת בניית ההצעות ב-`home-workout.service.ts` ו-`start-hybrid-session.ts`.
(ב) `StrengthVolumeWidget` — target קשיח בתוך הרכיב (3 כוח, 2 קרדיו), אינו מגיע מ-(א) ואינו מגיע מהלוז. המשתמש רואה "2/3" מול מספר שהוקלד, לא מול תוכניתו.
(ג) `src/features/schedule/**` — אין יעד נפח כלל. `SessionItem.volumePercent` קבוע ל-100 בכל מקום חי.

שלושתם אינם מדברים זה עם זה.

---

## הנפח אינו נשמר בצמצום ימים
**Opened:** 05.09.2026 · **Source:** דוד, אותה חקירה.

`buildDefaultTemplate` קורא `makeSession(item, 100, 'FULL')` — הליטרל 100 קבוע ואינו תלוי ב-`daysPerWeek`. המקרה המיוחד PULL+PULL משתמש בליטרלים 100/100/50.

מכאן: ירידה מ-4 ימים ל-3 מפחיתה נפח שבועי, ואינה מאריכה את האימונים שנותרו.

החלטת מוצר פתוחה: האם צמצום ימים אמור לפצות בנפח. היום — לא. `reduceTo` של הכוח מדווח על כך במפורש.

א-סימטריה מול ריצה: בריצה פיצוי אסור מלכתחילה, כי הארכת ריצה שנשארה מפעילה את RUN-08.
