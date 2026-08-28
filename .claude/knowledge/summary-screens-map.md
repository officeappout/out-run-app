# Workout Summary Screens — Mapping & Status (Aerobic / Strength / Hybrid)

> Read-only audit. 18.07.2026. Summary LAYER only (post-workout recap), not the whole engine.
> Every claim cites file:line. Verified statically across main + worktrees; **hybrid-finish behavior on
> device is NOT yet verified** — see §7.
> ⚠️ This file is a snapshot. If a file/flag named here changed, re-verify before acting.

---

## 0. Headline findings

1. **Branch is not a variable.** The entire summary layer is identical across all branches/worktrees,
   last touched by `df87570` ("workout summary overhaul + aerobic shell") on **main**. No branch has a
   newer version. The `feat/hybrid-engine` worktree adds the hybrid *engine* but **zero summary UI**, and
   is actually *behind* main on some hybrid logic.
2. **No single super-component.** ~5 separate summary implementations across two module trees that don't
   meet. `SummaryOrchestrator` was *designed* as the type-switching super-component (`WorkoutType` union
   with `STRENGTH|HYBRID`) but is now dead code, and even when live only handled aerobic (STRENGTH/HYBRID
   were always stubs).
3. **Hybrid has no summary screen at all.** A hybrid session ends on the generic aerobic run summary
   (`AerobicSummaryShell`). **VERIFIED on device 18.07.2026:** all metrics show `--`/0 (snapshot is null),
   strength stations are invisible, no crash. The map *does* draw a route line — but that is the **dev-only
   Yarkon mock** (`AerobicSummaryShell:87-99`); in a production build `routeCoords` is empty and the map shows
   no line. The real workout **is saved correctly** to Firestore (hybrid doc: 111 cal, 12/12 sets) — the
   summary simply never reads it. A full HybridSummary **design spec already exists in Drive** (see §8).
4. **The "hero shows calories+streak" assumption is false.** `AerobicHeroBlock` shows only avatars + group
   name + date (group-only; solo → `null`). Calories live in `AerobicStatRingsBlock` (real), streak in
   `DopamineStreakBlock` (real).
5. **Strength is the only screen with real end-to-end data**, via a dedicated route — but it also has a
   mock-fed ghost instance on the map.

---

## 1. Which files each screen maps to + the live path

Branch: everything on **main** (df87570), already propagated to every worktree incl. current
`fix/swap-all-smoke-clean`. Hybrid worktree = engine only, no summary UI.

**Two separate mount trees** — the aerobic summary is a map overlay; the strength summary is its own route.

| Screen | Live path (mount → renderer) | Governing file |
|---|---|---|
| Aerobic (post-run, map) | `MapShell` (mode='summary') → `SummaryLayer` → `WorkoutSummaryPage` → **`AerobicSummaryShell`** (solo/group) | `summary/components/aerobic/AerobicSummaryShell.tsx` |
| Aerobic (history) | `profile/page` (read-only) + `FreeRun`/`PlannedRun` players → **`FreeRunSummary`** | `players/running/components/FreeRun/FreeRunSummary.tsx` |
| Strength (live) | route `/workouts/[id]/active` (flowState active→dopamine→summary) → **`StrengthDopamineScreen`** then **`StrengthSummaryPage`** | `components/strength/StrengthSummaryPage.tsx`; render at `app/workouts/[id]/active/page.tsx:1418-1437` |
| Hybrid | *none* — falls through to `SummaryLayer` → `WorkoutSummaryPage` (aerobic) | — |

Key flag: `AEROBIC_SOLO_ENABLED = true` (`src/config/feature-flags.ts:13`, despite its comment claiming
default-false). This flips the live aerobic renderer to `AerobicSummaryShell` and makes `SummaryOrchestrator`
unreachable (`WorkoutSummaryPage.tsx:189` returns before line 230).

---

## 2. Division — super-component vs separate

Three (really five) separate implementations. `SummaryOrchestrator.tsx` is the *intended* super-component
(`switch(workoutType)`, `WorkoutType='FREE_RUN|PLAN_RUN|GUIDED_RUN|STRENGTH|HYBRID'`) but:
- STRENGTH + HYBRID cases are degenerate stubs (header + stats grid + streak; no exercises/map/laps) —
  `SummaryOrchestrator.tsx:121-137`.
- It is unreachable (flag above).

The `summary/components/shared/` folder is a **misnomer**: consumed only by aerobic (mostly dead). There is
essentially no shared UI component between the aerobic tree and the strength tree.

---

## 3. Shared-components table (component → which of the 3 use it)

The finding *is* the near-total lack of sharing:

| Component / hook | Aerobic | Strength | Hybrid |
|---|---|---|---|
| `AerobicSummaryShell` | ✅ live | — | ⚠️ by fallthrough (degraded) |
| `RunMapBlock` (route map) | ✅ | — | ⚠️ via shell |
| `DopamineStreakBlock` (streak) | ✅ | ✗ (own inline streak) | via shell |
| `useProgressionStore.currentStreak` (data) | ✅ | ✅ | (via aerobic) |
| `calculateCalories` — **FORKED into two** | ✅ `lib/calories.utils` | ✅ `strength/utils/summary.utils` (diff MET) | ✅ lib |
| `StrengthSummaryPage` / `StrengthDopamineScreen` | — | ✅ | — |
| `SummaryOrchestrator` (intended super-cmp) | ✝ dead | ✝ stub | ✝ stub |

Hybrid is the only type that "shares" anything — via an unintended fall-through to aerobic, not by design.

---

## 4. Per-screen status (logic + design)

### Aerobic — live = `AerobicSummaryShell`
- Logic: **DONE** — real metrics from `savedWorkoutSnapshot` + `useGroupSummaryCtx` (distance/pace/calories/
  laps, Firestore route-rating write).
- Design: **DONE** — tabs (סקירה/סטטיסטיקה/מקטעים/מפה), expand-map, safe-area.
- Partial/mock: `MomentSentence` + `PersonalRecordTag` = `return null` (Phase-1.5 stubs, rendered at
  AerobicSummaryShell:198-199) · XP pill fed **hardcoded 0** (`WorkoutSummaryPage.tsx:180`) → never shows ·
  ring-fill % are cosmetic heuristics (`AerobicStatRingsBlock:85-87`) · `coLocationMode` hidden ·
  dev-only mock route coords (`AerobicSummaryShell:87-99`, tree-shaken from prod).
- Legacy `FreeRunSummary`: DONE, still live in profile history; coin badge dead (`IS_COIN_SYSTEM_ENABLED=false`).
- `SummaryOrchestrator` (+ `SummaryStatsGrid`/`SummaryHeader`/`LapTableBlock`): DONE but **dead/unreachable**.

### Strength — live = `StrengthSummaryPage` (via route)
- Logic: **DONE** — real `workoutStats.totalReps/completedExercises`, `precomputedProgression`, `domainSets`,
  real streak/level (`active/page.tsx:1420-1436`; stats built in `handleComplete` ~`:744-809`).
- Design: **DONE** — RTL, dark-mode, XP shimmer (`XpStatusRow`, real XP), achievements grid.
- Partial/mock: `PersonalRecords` card **never renders** — `isPersonalRecord` hardcoded `false` upstream
  (`active/page.tsx:424,439`) · `SummaryLayer` instance fed **mock** (`totalReps=0, completedExercises=[],
  streak=3`, `SummaryLayer.tsx:46-58`) — vestigial map path · `DetailedPerformanceTable.tsx` (unified module)
  = "coming soon" stub, **0 importers, dead**.

### Hybrid — no dedicated summary (VERIFIED on device 18.07.2026)
- Logic: **MISSING**. `finishHybrid` → `finishWorkout` early-returns in hybrid mode
  (`useRunningPlayer.ts:1409-1416`, `runnerShouldSelfSave = !hybridMode`) → `endSession` sets
  `status='finished'` → `MapShell.tsx:250` raises the generic run summary. User sees **run-only** chrome;
  stations invisible.
- `savedWorkoutSnapshot` is written only at `useRunningPlayer.ts:1623` (inside the skipped self-save block),
  so on hybrid finish `snap` is **null** → `WorkoutSummaryPage.tsx:189-207` hands `AerobicSummaryShell` an
  empty `workout={{ ...null, date }}`. Shell is guarded (`?? 0`, `workout.laps &&`).
- **Observed:** lands on `AerobicSummaryShell`; **all metrics `--`/0** (distance/pace/duration/calories),
  no laps, **no strength representation, no crash**. The run's own distance is 0 too — the accumulated store
  route/distance is NOT read (the raw-store fallback lives only in the unreachable `SummaryOrchestrator` path,
  `WorkoutSummaryPage.tsx:209-217`).
- **Map nuance:** the map DID draw a route line in the tested (dev) build. That is the **dev-only Yarkon
  mock** at `AerobicSummaryShell:87-99` — `routeCoords` derives only from `workout.routePath` (`:79-83`),
  which is empty when `snap` is null, so in `NODE_ENV==='development'` the mock loop is injected. In a
  **production build the mock is tree-shaken and the map is empty**. So the drawn route is a dev artifact,
  consistent with `snap===null`, not a real routeCoords source. (Residual caveat: not re-checked on a prod
  device build — if a real matching route ever appears there, `workout.routePath` has a source not found here.)
- **Data integrity is fine:** the hybrid workout **is saved** to Firestore via `hybrid-save.service`
  (observed: `activityType:'hybrid'`, 111 cal, 12/12 sets). The bug is purely the *summary read*, not the save.
- Design: none. `case 'HYBRID'` in Orchestrator = dead stub.
- Real hybrid data object exists — `HybridRunSummary` (`hybrid/hybrid-orchestrator.ts:274`,
  `totalStrengthSets`/`bothHalvesCompleted`) — but no screen renders it.
- **A full HybridSummary design spec exists** — see §8.

---

## 5. Duplication list (with files)

1. **Stats display — 6 renderers of the same numbers:**
   - `summary/components/shared/SummaryStatsGrid.tsx` *(dead)* ≈ near-dup of `shared/MainStatsGrid.tsx`
     *(fully dead, 0 refs)*
   - `aerobic/AerobicStatRingsBlock.tsx` *(live, rings)* ≈ dup of `FreeRunSummary` inline rings (`:441-508`,
     2nd independent ring impl)
   - `AerobicSummaryShell` inline `StatRow` list (4th presentation) · `components/strength/components/SummaryStatsRow.tsx` *(strength)*
   - `formatTime/formatPace/formatDuration` re-implemented locally in nearly every one.
2. **Streak / dopamine:** `shared/DopamineStreakBlock.tsx` *(aerobic shared)* vs inline streak in
   `SummaryStatsRow` *(strength, separate)* · 3 full-screen dopamine screens: `StrengthDopamineScreen` *(live)*,
   running `DopamineScreen.tsx` *(dead)*, `StreakScreen.tsx` *(dead)*.
3. **Calories math forked:** two same-named `calculateCalories` — `lib/calories.utils` (aerobic) vs
   `components/strength/utils/summary.utils` (strength, different MET model).
4. **XP display:** `XpStatusRow` *(real XP, strength)* vs `AerobicSummaryShell` XP pill *(fed hardcoded 0 → never shows)*.
5. **Two strength summaries:** `StrengthSummaryPage` *(real)* vs `summary/components/strength/DetailedPerformanceTable.tsx` *(dead stub)*.
6. **Two strength entry points:** `active/page.tsx` *(real)* vs `SummaryLayer.tsx:44-58` *(mock; reachable only
   when `workoutMode='discover'`, where it renders a STRENGTH summary on a RUN finish — buggy leftover)*.
7. **Map expand overlay** duplicated between `AerobicSummaryShell` (`:481-505`) and `FreeRunSummary` (`:315-339`).

**Dead-code cleanup candidates (0 live importers):** `DetailedPerformanceTable.tsx`, `MainStatsGrid.tsx`,
running `DopamineScreen.tsx`, `StreakScreen.tsx`; dead-transitive: `SummaryOrchestrator.tsx` +
`SummaryStatsGrid.tsx` + `SummaryHeader.tsx` + `LapTableBlock.tsx`; `SummaryLayer` strength/dopamine branches.

---

## 6. Structure recommendation (prevent future duplication)

Root cause: no single source of truth; the "unified `summary/`" was built partway then abandoned
(`AerobicSummaryShell` was written from scratch instead of through the Orchestrator). Proposed 3 moves:

1. **`summary/blocks/` — one shared block kit** (single source of truth): `StatsBlock`, `StreakBlock`,
   `MapBlock`, `XpBlock`, `ExercisesBlock`, `HeroBlock` + one `summary/format.ts` (time/pace/calories).
2. **3 thin composition pages** over the kit (`AerobicSummary`/`StrengthSummary`/`HybridSummary`) — better than
   one monolithic switch, because the three differ materially. "Update one, forget the other" is prevented at
   the block layer, not the screen layer.
3. **A real `HybridSummary`** composing `MapBlock` + run `StatsBlock` + strength `ExercisesBlock` + a
   "both halves" header, reading from the existing `HybridRunSummary` data object. Plus: unify the two
   `calculateCalories`, and delete dead code in a step-0 before building.

Do NOT start consolidation without David's go-ahead. XP wiring gate still applies (no real `awardWorkoutXP`
for hybrid until single-save closes — CLAUDE.md).

---

## 7. Device-verification (hybrid finish) — DONE 18.07.2026

Result (device smoke): hybrid finish lands on **`AerobicSummaryShell`** with **all metrics `--`/0**, **no
strength stations, no crash**; workout **saved** to Firestore (hybrid, 111 cal, 12/12 sets). Map drew a
route, but that is the **dev-only Yarkon mock** (`AerobicSummaryShell:87-99`) — prod map is empty. Net: the
static prediction held (snapshot null → empty metrics); the only correction is the map's dev-mock line.
Severity: medium-high UX (empty, valueless recap) but **data-safe** (no crash, save intact).

Residual open items (not blocking, not re-checked):
- Whether the map draws a real route on a **production** device build (would imply a `routePath` source not
  found in this audit). On dev it is definitively the mock.
- Whether a standalone `/run` route still renders `FreeRunSummary` as a full live path beyond profile history.

---

## 8. Reference — HybridSummary design spec (Google Drive)

A complete visual/UX spec for the missing hybrid summary already exists (do NOT redesign from scratch when
building):
- **Drive folder:** "ממשק משולב — מסך סיכום"
- **Doc:** v0.9
- **Key structure:** Moovit-style **segment rail** (run → strength station → run …) + tabs
  **סקירה / אירובי / כוח / סטטיסטיקה**.

When consolidation starts (§6), the `HybridSummary` composition page should implement this spec, reading from
the existing `HybridRunSummary` data object (`hybrid/hybrid-orchestrator.ts:274`) rather than the null runner
snapshot. Pull the full spec from Drive at build time.

---

## 9. Build progress (consolidation — feat/hybrid-summary)

Worktree: `/Users/calisthenicsltd/Development/appout-1-hybrid-summary` · branch `feat/hybrid-summary` (off main).
Flags stay default-false until David flips each per-screen after on-device parity. No push/merge until all 4
stages verified.
- **Stage 0 (done, b26f97f):** deleted 4 dead orphans (DetailedPerformanceTable, MainStatsGrid, running
  DopamineScreen, StreakScreen + 2 barrel lines). KEPT SummaryOrchestrator as the AEROBIC_SOLO_ENABLED=false
  rollback fallback (David's call). tsc: no new errors.
- **Stage 1 (done, 0e1344b):** `summary/blocks/` kit + `summary/format.ts` SSOT, ships INERT. SegmentRail(+pure
  util), SummarySheet, SummaryTabs, IdentityUnitsRow, StreakBlock; RunMapBlock/LapPaceChart/DopamineStreakBlock
  re-exported in place. format.ts = one metCalories primitive (unifies the 2 identical calorie fns) + formatDuration.
  Tests: format parity + segment-rail util (node-verified; vitest devDep not installed locally → runs in CI).
- **Stage 2 (next):** 3 parity composition pages + flags AEROBIC_SUMMARY_V2_ENABLED / STRENGTH_SUMMARY_V2_ENABLED
  / HYBRID_SUMMARY_ENABLED (default false). Injection points: WorkoutSummaryPage :167/:189, active/page :1418.
  DIFF REVIEW REQUIRED before commit.
- **Stage 3 (after):** HybridSummary (aggregates+rail MVP) + useHybridRun stash + SummaryLayer branch. Per-exercise
  strength tab = fast-follow. DIFF REVIEW REQUIRED before commit.

NOTE: local tsc baseline is a noisy 468 errors (no `target` set + functions/scripts included; repo typechecks via
`next build`). The bar per stage is **no NEW errors**, not absolute-clean.
