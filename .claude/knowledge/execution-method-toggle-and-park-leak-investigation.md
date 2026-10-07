---
name: execution-method-toggle-and-park-leak-investigation
description: READ-ONLY investigation (07.10.2026) into execution-method (home/park) inconsistency — home-page toggle/video desync root cause (AnchorLocationChip vs HeroWorkoutCard), a confirmed-live crack in selectMethodForContext's park gate (its "home-tagged methods are NOT used" comment is false), and status of every prior related fix. Companion to media-resolution-map.md and execution-method-identity-plan.md — this doc goes one layer past both.
metadata:
  type: project
---

# Execution-Method Toggle Desync + Park-Branch Leak — Investigation (07.10.2026)

> Scope: report-only, no code written. Reproduces 2 symptoms David reported: (1) home-page
> execution-method toggle + video sometimes show the wrong method; (2) an individual exercise's
> method is sometimes wrong inside a uniform-location workout. Methodology: direct code reading +
> file:line citations (this session) + one Explore-agent pass (home-page toggle/video, cross-
> checked) + one live, reproduced vitest trace (deleted after capture, not committed).
>
> Builds on `media-resolution-map.md` (17.07.2026, video/image resolver layer + method
> index-vs-location map) and `execution-method-identity-plan.md` (16.09.2026, method-identity
> survival across persistence). Both already exist — read them first for background this doc
> doesn't repeat.

---

## 1. Data model (confirmed, no changes since the identity-plan doc)

- `Exercise.execution_methods?: ExecutionMethod[]` (aliased `executionMethods`) — each
  `ExecutionMethod` has `location: ExecutionLocation`, `locationMapping?: ExecutionLocation[]`,
  and its own `media` (`exercise.types.ts:443-534`). **No `id`/stable identity field** on
  `ExecutionMethod` — re-confirmed by reading the full interface (424-538 per the identity-plan
  doc's own citation, re-read in full here too).
- `WorkoutExercise.method` carries a **full snapshot** of the chosen `ExecutionMethod`, not an
  index/id (`workout-generator.types.ts:83`).
- `GeneratedWorkout.executionLocation?: ExecutionLocation` (`workout-generator.types.ts:329`) —
  the workout-level target method, stamped once via `stampResolvedLocation()` from
  `trio.meta.location` at 5 return points in `home-workout.service.ts` (commit `ec608335`,
  16.09.2026 — Stage 1 of the identity plan). Read by `home/page.tsx:1331,3134`,
  `StatsOverview.tsx:620`, `WorkoutPreviewDrawer.tsx:126,259` — but **not** by `HeroWorkoutCard`'s
  video prop (see §3).

---

## 2. Where a wrong-method exercise enters a workout — confirmed with a trace

`selectMethodForContext` (`src/features/workout-engine/shared/utils/method-selection.utils.ts:57`)
is the documented single source of truth for method selection — used by main pool filtering
(`ContextualEngine.findMatchingMethod`, `ContextualEngine.ts:550-555`, a thin pass-through with no
extra gate), warmup, cooldown, domain-rescue, recovery. Its own header states the contract
explicitly: `null` = exclude, **never** fall back to method 0 — written specifically to replace
the old `executionMethods[0]` leak.

### 2a. A live crack inside the function's own PARK branch

`method-selection.utils.ts:184-191`:
```ts
// No park-tagged methods at all → only pure bodyweight/surface methods survive.
// Home-tagged methods are NOT used even if their gear happens to be available.
const BODYWEIGHT_PASS = new Set(['bodyweight', 'none', ...Array.from(SURFACE_GEAR_AT_PARK)]);
const bwCandidates = methods.filter(m => {
  const ids = collectMethodGear(m);
  return ids.length === 0 || ids.every(id => BODYWEIGHT_PASS.has(id));
});
return bwCandidates.length > 0 ? preferMedia(bwCandidates) : null;
```
The comment claims location is checked. **The code never reads `m.location` at all** — only
gear. A method tagged `location:'home'` with no `gearIds`/`equipmentIds` passes this filter for a
`'park'` request.

**Reproduced live** (scratch vitest test, run once to capture the trace below, then deleted —
not committed): a cooldown exercise with a single method `{location:'home',
requiredGearType:'none'}`, requested at `location:'park'` via `appendCooldownExercises`:
```
ADDED COOLDOWNS: [{"id":"cd-1","methodLocation":"home"},{"id":"cd-2","methodLocation":"home"}]
```
Both added slots carry `method.location:"home"` in a park request. Since
`ContextualEngine.findMatchingMethod` delegates straight to the same function with no additional
gate, **this is reachable from the main exercise pool, not only cooldown/warmup** — this is the
direct, confirmed mechanism for "a home exercise inside an all-park workout."

**The symmetric tier for non-park locations has the identical shape** (`method-selection.utils.ts:225-234`,
Priority 3 "Bodyweight-only") — gear-only check, no location check, same pattern.

**Why this matters more than it first looks:** `.claude/knowledge/parking-lot.md:981-991`
("הדליפה של Priority-3 היא נושאת-משקל") already found and explicitly decided **not to fix** the
Priority-2.5/3 general leak — because 9 of 10 `ExecutionLocation` values have ~zero real tagged
content today, and closing that leak before real content exists would make those 9 locations'
pools collapse near-empty. That entry's framing explicitly treats `park` as the ONE clean,
strictly-gated location ("יש לו שער-מיקום נוקשה... park הוא היחיד שבאמת מראה פער-תוכן ממשי").
**§2a disproves that premise** — park's own gate has the same kind of hole. This is why FIX 3
(below) needs its own coverage measurement before any code change: closing park's hole carries
the exact same "pool collapses" risk the parking-lot entry already warned about for the other 9
locations, and park is the highest-traffic, most content-complete location in the catalog — if
coverage is thin anywhere, the blast radius of a naive fix is largest here, not smallest.

**Secondary gap:** line 191's `return` is the **only** fallback path in the whole function not
wrapped in `logMismatch(...)` (compare line 206's `home-fallback` tier, which is). The Stage-1
`[SMFC-MISMATCH]` production monitoring (§5) has a built-in blind spot for exactly this leak —
it was built to catch silent method substitution, and does not see this instance of it.

### 2b. Cooldown's "nuke" fallback — a second, distinct, already-self-documented instance

`cooldown.service.ts:98-130`: when the location-filtered candidate pool is empty, it grabs *any*
cooldown/flexibility exercise ignoring location/equipment entirely (`:98-110`, comment says so
explicitly), then if that exercise has no real method for the request, **stamps a hardcoded
placeholder `{location:'home', requiredGearType:'none', media:{}}`** regardless of the actual
target location (`:122-130`). Already has its own permanent tripwire, `[COOLDOWN-NUKE]`
(`parking-lot.md:938-952` — David ruled this log must never be removed, "זה ההתרעה על בדיוק
התקלה"). Confirmed still live, unchanged.

---

## 3. Home-page toggle + video desync — confirmed structural mechanism

Toggle = `AnchorLocationChip` (`src/features/home/components/AnchorLocationChip.tsx`), rendered
in `StatsOverview.tsx` beside `HeroWorkoutCard` (the video), gated by `HOME_ANCHOR_V2_ENABLED=true`
(`feature-flags.ts:356`).

- **Toggle reads:** `pinnedLocation ?? currentWorkoutLocation` (`StatsOverview.tsx:1088-1093`).
- **Video reads:** `currentWorkoutLocation` directly — **never `pinnedLocation`**
  (`StatsOverview.tsx:1136`, passed as `HeroWorkoutCard`'s `workoutLocation` prop →
  `resolveHeroMedia(heroExercise, workoutLocation)`, `HeroWorkoutCard.tsx:474-478`).

Both state variables are declared in the same component (`pinnedLocation` at `:640`,
`currentWorkoutLocation` at `:535`) — not two unrelated stores. They only diverge when
`pinnedLocation` is set (user tapped the chip) and something else later overwrites
`currentWorkoutLocation` without touching the pin.

**Confirmed reachable divergence path:**
1. User taps the chip → `handleAnchorLocationChange` (`StatsOverview.tsx:649-656`) sets both
   `pinnedLocation` and `currentWorkoutLocation` to e.g. `'park'` in the same callback — in sync.
2. `pinnedLocation` is cleared **only** by a `targetDate` change (`:646`) — nothing else resets it.
3. A same-day schedule edit elsewhere on the page bumps `scheduleVersion`
   (`home/page.tsx:3526`, `TrainingPlannerOverlay.onSaved`) — **not** `targetDate`.
4. The main generation effect's dependency array is `[profile?.id, isGuest, targetDate,
   scheduleVersion]` (`StatsOverview.tsx:912`) → re-fires without touching `pinnedLocation`.
5. It calls `resolveWorkoutContext(profile, resolvedLocation, {...})`
   (`workout-context-resolver.ts:78-125`), which can **silently downgrade `'park'`→`'home'`**
   on GPS timeout (2.5s, `:104-109`) or no equipped park found nearby (`:117-124`) —
   `allowHomeOverride` defaults `true` and is not overridden at this call site. The module's own
   header comment (`:14-18`) explicitly scopes this override to "the INFERRED entry point
   (StatsOverview)" — i.e. the file itself documents that this exact caller is where an
   explicit-looking location can get quietly overridden.
6. `StatsOverview.tsx:896-897`: `setCurrentWorkoutLocation(loc)` — **unconditional**, no check
   against `pinnedLocationRef.current`.
7. Three lines later, `:898-904`, the sessionStorage mirror write to the **same**
   `currentWorkoutLocation` key **is** pin-guarded (`if (... && !pinnedLocationRef.current)`) —
   an internal inconsistency in its own right: the React state write and its own sessionStorage
   mirror disagree on whether the pin should block them.

**Net result:** `currentWorkoutLocation` (state) → `'home'`; `pinnedLocation` (state) stays
`'park'`. Chip still shows "בחוץ" (park) — read path is pinned-first. `HeroWorkoutCard`'s
`workoutLocation` prop is now `'home'` — read path never consults the pin. Exact structural match
for the reported symptom, reproducible deterministically whenever a same-day schedule edit
coincides with a pinned location that `resolveWorkoutContext` downgrades.

**Lower-confidence, flagged not confirmed:** `anchorSwapAll` (`useSwapAll.ts:89-95`) no-ops if the
newly tapped location already equals `anchorShownLocation` (`StatsOverview.tsx:619-622` — a
*third* location-derived value, feeding only this no-op guard). When it no-ops, the workout's
other exercises/equipment never swap, but the hero video still re-resolves correctly for the new
`currentWorkoutLocation` — a different inconsistency (badges/metadata vs. video), not the
toggle-vs-video disagreement above. Not fully chased down.

**Confirmed new gap:** neither `media-resolution-map.md` nor `execution-method-identity-plan.md`
mentions `AnchorLocationChip`, `StatsOverview.tsx`, `pinnedLocation`, or `currentWorkoutLocation`
anywhere (grepped both files for every relevant symbol — zero matches). Both stayed one layer
below this — the video/image resolver and the method-selection layer — and never examined the
toggle's own display-state wiring.

---

## 4. "No variation for target method" — confirmed behavior today

Documented contract: exclude (`null`). Actual behavior, per §2: **silent substitution** via the
park bodyweight-tier gap (§2a) and the cooldown nuke-placeholder (§2b). Both live, reproduced,
not hypothetical.

---

## 5. Status of every related prior fix (so nothing here gets re-discovered or re-broken)

**Fixed, merged, live on main today:**
- `warmup.service.ts` routes through `selectMethodForContext` behind
  `CONTEXT_AWARE_SELECTION_ENABLED` — a hardcoded `true` constant (`feature-flags.ts:133`), not a
  Firestore flag. The old home-first single-predicate `.find()` is dead code in the `else`
  branch, confirmed by reading it (still has the order-bug, but unreachable today).
- `cooldown.service.ts`'s eligibility filter (`:50-63`) and scoring (`:117-121`) also route
  through the same selector when the flag is true — only the nuke-placeholder (§2b) is still a
  real gap in this file.
- `GeneratedWorkout.executionLocation` + `[LOC-OVERRIDE]` tripwire — commit `ec608335`,
  16.09.2026, Stage 1 of `execution-method-identity-plan.md`.
- `[MEV-MISMATCH]` / `[SMFC-MISMATCH]` / `[COOLDOWN-NUKE]` — three permanent production log
  points, David ruled they must never be removed (`parking-lot.md:938-952`).
- `media-resolution.utils.ts`'s cross-method fallback made explicit park-first (`c528ee61`,
  16.09.2026) — makes the leak's *order* deterministic; does **not** stop the cross-method leak
  itself (a different, complementary fix — see next item).
- Carousel per-card hero location ("Decision A", `home/page.tsx:3123-3134`) already resolves
  correctly via `executionLocation` — not where the toggle bug (§3) lives; that surface is
  currently not the live one anyway while `HOME_ANCHOR_V2_ENABLED=true`.

**Found but never merged — orphan branch since 03.08.2026, no PR ever opened:** commit
`1263b9f7` on `fix/strength-engine-2-3-4` (also present as `46a6bee7` on a second branch) fixes
the `HeroWorkoutCard` + preview-drawer media leak directly at the two narrowest call sites
(`heroMedia.utils.ts`'s `resolveHeroMedia`, `exercise-display.utils.ts`'s
`resolveExerciseImage`) — skips the cross-method deep-search when the assigned method has no
media of its own, falls through to the existing generic fallback instead of trusting a
cross-location leak. Includes 2 passing tests reproducing the leak before the fix. Dry-run merge
against current main (`git merge-tree <merge-base> origin/main 1263b9f7`): clean, zero
conflicts, not stale.

**Explicitly open / deliberately deferred — David's own prior binding calls, left untouched here:**
- General Priority-2.5/3 location-blind leak (`method-selection.utils.ts:209-234`) — load-bearing
  for 9/10 locations' content coverage today (`parking-lot.md:981-991`). Do not fix before real
  tagged content exists for `home`/`office`/`school`/`library`/`desk`/`airport`/`service`/
  `street`/`gym`.
- `applyHomeGating` (home has no gear gate, unlike park's `applyParkGating`) —
  `parking-lot.md:79-97`, separate flagged project, not started.
- `handleSingleMethodChange` (`WorkoutPreviewDrawer.tsx:286-301`) still takes only
  `(method: ExecutionMethod)`, discarding the `methodIdx` that `MasterExerciseView`'s switcher
  already passes it — re-confirmed live, unchanged since the 16.09.2026 identity-plan doc.
  Stages 2-5 of that plan were never approved.
- Two independent, type-invisible location-default mechanisms
  (`resolveEffectivePipelineLocation` vs. `DEFAULT_LOCATION` in two other call sites) — same
  value today ('park' both ways), risk flagged (`parking-lot.md:956-967`), not unified.

**Genuinely new findings from this investigation (07.10.2026):** §2a (park-branch bodyweight-tier
leak) and §3 (`AnchorLocationChip`/`HeroWorkoutCard` state-split + `resolveWorkoutContext`
downgrade path).

---

## 6. Next steps (David's decisions, 07.10.2026)

- **FIX 1** (§3, UI-only): make `HeroWorkoutCard`'s video read the same source as the toggle, or
  pin-guard the `currentWorkoutLocation` write; reconcile the `:896-897` vs `:898-904` pin-guard
  mismatch. Own branch/PR, HOLD for merge.
- **FIX 2** (§5, ready-made): rebase/reopen `1263b9f7` as a PR against current main. Own
  branch/PR, HOLD for merge.
- **FIX 3** (§2a, core leak): measure park's real location-tagged content coverage FIRST — do
  not add the location check blind. If coverage is sufficient, add the `m.location`/
  `locationMapping` check to the `bwCandidates` filter (line 187-189) AND wrap the return in
  `logMismatch(...)` so `[SMFC-MISMATCH]` stops being blind to this tier. Report-only until the
  coverage number is in.
- **Left deferred, not touched:** general Priority-2.5/3 leak, `applyHomeGating`,
  `handleSingleMethodChange`/identity-plan stages 2-5, the two location-default mechanisms.
  Cooldown nuke-placeholder (§2b): keep its tripwire, flagged as lower-priority, not fixed here.
