# Admin Programming Controls → Engine Connection Map

**Date:** 2026-10-06
**Type:** REPORT-ONLY. Zero changes to code, config, Firestore data, or the admin UI.
**Baseline:** `origin/main` @ `cb01f3ef` — `git fetch` run and `HEAD` re-synced onto it before any file was read. My previous report's line numbers were stale: **PR #146** (`60d145d3`, SA/BA final-pass penalty guard) moved `ContextualEngine.ts`, `workout-sorting.utils.ts` and `home-workout.service.ts`. **Every citation below is re-verified against `cb01f3ef`.**
**Companion:** `.claude/knowledge/programming-rules-audit-2026-10-05.md` (same branch). Findings carried forward from it are marked **[carried]** and keep their re-verified citations.

**Method.** For each field: locate the admin writer, then trace the *actual read* — not a doc comment. A field read into a settings object and never destructured downstream counts as **NO**. Verified negatives are repo-wide greps excluding `app/admin/`, the type definitions, the settings service itself, tests and scripts.

---

## What changed in PR #146 (scope note)

#146 added `enforceFinalStraightArmPenalty` (`workout-sorting.utils.ts:689`) and extracted `shouldRelaxSABA` (`ContextualEngine.ts:87`), now shared by both passes. It closed the mid-pipeline swap bypass. It did **not** touch admin-panel wiring: `WEEKLY_SA_CAP = 6` is still hardcoded (`home-workout.service.ts:1839`), `saSkillFocusRequested` still reads it as a boolean (`WorkoutGenerator.ts:1587-1589`), and the two `isBalanced` copies still hardcode `2` (`WorkoutGenerator.ts:1997`, `workout-sorting.utils.ts:626`). All rows below stand post-#146.

---

## Table 1 — `programLevelSettings` (Firestore), written by `/admin/programs` and `/admin/progression-manager`

Writers: `app/admin/programs/page.tsx:992-1006` · `app/admin/progression-manager/page.tsx:423-441` and `:488-507`. Both go through `saveProgramLevelSettings` (`programLevelSettings.service.ts:350`), which `updateDoc`s with `stripUndefined` on an existing doc — so the two pages write **disjoint field sets without clobbering each other**. (I checked for a cross-page overwrite of the kind the deleted seed script caused; there isn't one. Partial update, not a whole-doc `setDoc`.)

| Control / config field (where the admin sets it) | Connected to engine? | Where the generator reads it (file:line) or "read nowhere" | What it's supposed to do | Impact if wired | Effort to wire |
|---|---|---|---|---|---|
| `targetGoals` — `/admin/programs` level editor | **YES** | `home-workout.service.ts:2791, 2829`; `progression.service.ts:2225, 2577`; `useProgressionSync.ts:229` | Per-level goal exercises + target values; drives `goalExerciseIds`/`goalTargets` and goal XP bonus | — | — |
| `protocolProbability` — `/admin/programs` protocol panel | **YES** | `home-workout.service.ts:2845` → `StructureDirector.ts:436` → `ProtocolInjector.ts:244` | Chance of injecting EMOM/pyramid/superset | — | — |
| `preferredProtocols` — `/admin/programs` (allowEMOM/Pyramid/Supersets/Tabata toggles → `protocolConfigToSettingsFields:845`) | **YES** | `home-workout.service.ts:2808` → `pipeline.types.ts:120` → `ProtocolInjector` | Which protocols are eligible at this level | — | — |
| `weeklyVolumeTarget` — `/admin/progression-manager` | **YES** | `lead-program.service.ts:168` → `home-workout.service.ts:2261` (+ `StatsOverview.tsx:385`, `useDailyStrengthTarget.ts:76`) | Weekly set budget for the movement pattern (Lead Program model) | — | — |
| `maxIntenseWorkoutsPerWeek` — `/admin/progression-manager` | **YES** | `lead-program.service.ts:170-171, 204` | Cap on 3-bolt sessions per week | — | — |
| `maxSets` — `/admin/progression-manager` | **YES** | `lead-program.service.ts:172` → `home-workout.service.ts:3000` → `BudgetDistributor.ts:244, 795` | Safety Brake: hard per-session set ceiling | — | — |
| `baseGain` — `/admin/progression-manager` | **YES** | `progression.service.ts:1220-1222` (reads `pls.baseGain`) | Base % level-gain per session | — | — |
| `parentLevelMapping` — `/admin/progression-manager` | **YES** | `app/onboarding-new/assessment-visual/page.tsx:566` | Grandchild→parent level inheritance (OAP L1 → Pull L10) | — | — |
| `levelDescription` — both pages | **YES (display only)** | `ProgramInfoPanel.tsx:185` — no generation reader | Instructional text shown in the progression map | — | — |
| **`straightArmRatio`** — `/admin/programs:1364-1377` slider (shows `?? (lvl<=10 ? 0.4 : 0.5)`); also `/admin/progression-manager:1616` | **NO** | **Never extracted from the PLS doc.** `home-workout.service.ts:2789` reads the doc but destructures only `preferredProtocols`/`protocolProbability`/`tabataProbability`/`targetGoals`. `context.straightArmRatio` (read at `WorkoutGenerator.ts:1850`) is populated **only** on deload weeks, from the hardcoded `DELOAD_SA_CAP = 0.15` (`home-workout.service.ts:2985-2994`) | Target SA:BA ratio — tendonitis guard. Schema says *"@see WorkoutGenerator – enforced during exercise selection"* | **High** — the only per-level SA control; would change SA composition every session for every user | **S** (~2-4h) |
| **`weeklySACap`** — `/admin/programs:1395-1402` number input | **NO** | **Never extracted from the PLS doc.** `context.weeklySACap` is overwritten unconditionally by the local constant `WEEKLY_SA_CAP = 6` (`home-workout.service.ts:1839` → `:2996`). The consuming guard at `WorkoutGenerator.ts:1815-1817` also needs `weeklySASets`, which **no caller ever passes** (`getSASetsCompleted()`, `useWeeklyVolumeStore.ts:392`, has zero callers) | Weekly SA set ceiling. Schema says *"The generator checks cumulative SA sets and throttles when cap is hit"* | **Highest** — see §Ranking #1: the hardcoded 6 also silently disables a *different* rule | **M** (~1-2d) |
| `restMultiplier` — both pages (persisted `?? 1.0`) | **NO** | Threaded all the way into context (`home-workout.service.ts:1826 → :2999`) and then **never read** — zero consumers of `context.restMultiplier`; `workout-generator.types.ts:493` marks it `@deprecated` | Rest-time multiplier for the level | **Low** — TIER_TABLE owns rest by design (its comment at `:48-50` says so explicitly) | — (hide) |
| `intensityModifier` — both pages (persisted `?? 1.0`) | **NO** | **read nowhere** | "Future-proofing" intensity multiplier | **Low** — overlaps the bolt/tier system; no defined semantics | — (hide) |
| `volumeAdjustment` — both pages (persisted `?? 0`) | **NO** | **read nowhere.** (Every grep hit is `GeneratedWorkout.volumeAdjustment` — the computed output badge, a **name collision**, not this field) | Per-level volume adjustment −50..+50% | **Medium** — a real per-level volume dial, but duplicates `weeklyVolumeTarget`/`maxSets` | — (hide) |
| `progressionWeight` — both pages (persisted `?? 1.0`) | **NO** | **read nowhere** | How much a completed workout contributes to level progress | **Medium** — would let David tune progression speed per level | **S** (~3h) |
| `firstSessionBonus` — `/admin/progression-manager` | **NO** | **read nowhere** | First-session-in-level bonus % | **Low-Med** — progression feel, not session content | **S** (~2h) |
| `persistenceBonusConfig` — `/admin/progression-manager` | **NO** | **read nowhere** | Session-in-month → bonus % map | **Low** — retention nudge | **S** (~3h) |
| `rpeBonusConfig` — `/admin/progression-manager` | **NO** | **read nowhere** | RPE → bonus % map | **Low** — no RPE capture in the session flow today | **M** (needs RPE input first) |
| `focusAreas` / `prerequisites` — schema fields, **no admin writer** | **NO** | **read nowhere** (progression-map's `prerequisites` is a different `DerivedPrerequisite` type — name collision) | Level focus areas / prereq gating | **Low** | — (delete) |
| `minSets` — schema field, **no admin writer** | **NO** | **read nowhere** (`PresentationFormatter.ts:498`'s `minSets` is an unrelated internal `VolumeCapConfig` param defaulting to 2) | Min sets/session | Low — schema self-documents as "legacy/ref only" | — (delete) |
| `defaultRestSeconds` (PLS) — schema field, **no admin writer** | **NO** | **read nowhere** | Per-level default rest | Low — schema self-documents as `@deprecated` | — (delete) |
| `assessmentVideoUrl` / `…Mov` / `…Webm` / `assessmentThumbnailUrl` / `assessmentBoldTitle` | **YES (assessment, not generation)** | `assessment-visual/page.tsx`, `assessment-path-config.service.ts` | Visual-assessment slider media | — | — |

---

## Table 2 — Engine reads with **no admin control to set them** (orphaned readers — the inverse failure)

| Control / config field | Connected to engine? | Where the generator reads it | What it's supposed to do | Impact if wired | Effort to wire |
|---|---|---|---|---|---|
| **`tabataProbability`** (PLS field) | **YES — but nothing writes it** | `WorkoutGenerator.ts:223-227`; `tabata-finisher.utils.ts:51` → falls back to `DEFAULT_TABATA_PROBABILITY = 0.15` (`:36`) | Dedicated tabata-finisher probability, separate from the main lottery. `/admin/programs` has an `allowTabata` toggle that only pushes `'tabata'` into `preferredProtocols` — **no page ever sets this number** | **Medium** — tabata frequency is permanently 0.15 for every level; schema explicitly presents it as per-level tunable | **S** (~2h — add one input beside the existing toggle) |
| **`shadowMatrix`** (QA Control Room override) | **Consumed, but zero writers anywhere** | `InputSanitizerMiddleware.ts:257-262`; `home-workout.service.ts:2446, 2554` | Truth doc LAW 3 row 20: global/movement/muscle level override for QA. `createDefaultShadowMatrix` has **zero callers**; no caller passes `shadowMatrix` | **Medium (QA leverage)** — would make per-level engine testing possible without editing user docs | **M** (~1-2d — needs a UI) |

---

## Table 3 — Exercise catalog (`/admin/exercises` editor) — per-exercise fields that gate generation

Included because they are admin-settable configuration that directly drives generation. See also `.claude/rules/exercise-editor-conventions.md`.

| Control / config field | Connected to engine? | Where the generator reads it | What it's supposed to do | Impact if wired | Effort to wire |
|---|---|---|---|---|---|
| `targetPrograms[].level` | **YES** | `resolveExerciseLevelForDomains` → `ContextualEngine.ts:651`; the whole level-aware filter | Per-program level of the exercise | — | — |
| `mechanicalType` | **YES** | `ContextualEngine.ts:76, 665-699`; `workout-sorting.utils.ts:620-622, 689+` | straight_arm / bent_arm / hybrid — the SA/BA family's input | — | — |
| `injuryShield` | **YES** | `ContextualEngine.ts:284, 438` | Hard-exclude on user injury overlap | — | — |
| `sweatLevel` | **YES** | `ContextualEngine.ts:314` | Location sweat limit (LAW 7.3) | — | — |
| `noiseLevel` | **YES** | `ContextualEngine.ts:321` | Location noise limit (LAW 7.3) | — | — |
| `fieldReady` | **YES** | `ContextualEngine.ts:505-506` | Field-mode eligibility | — | — |
| `secondsPerRep` | **YES** | `workout-budgeting.utils.ts:1140` (`?? 3`) | Duration estimation | — | — |
| `isFollowAlong` | **YES** | `buildRunnerWorkoutPlanFromGenerated.ts:120, 145` | Clip-duration-driven timing | — | — |
| `hiit_friendly` tag | **YES** | `home-workout.service.ts:2977` → `context.tabataPool` | Tabata finisher pool membership | — | — |
| **`defaultRestSeconds`** (Exercise) | **NO** | **Zero readers in `features/workout-engine/`.** Preserved by `exercise.service.ts:396` and copied on duplicate (`:737`), so it persists and looks live | Truth doc LAW 9 claims *"`defaultBaseRest` from exercise metadata seeds the baseline; rep-range logic overrides"* — it does not; rest comes wholly from TIER_TABLE | **Low** — TIER_TABLE is the intended single source (BUG-10, prior report: LAW 9 is stale here) | — (hide/delete) |

---

## Table 4 — Admin surfaces that display (rather than write) programming rules

| Item | Accurate? | Detail |
|---|---|---|
| `/admin/workout-simulator` duration→count badge (`page.tsx:459-463`, rendered `:498`) | **NO** | Shows a mapping disagreeing with the engine in **4 of 5 buckets** and collapses the engine's `'15'`/`'30'` buckets — reproducing the exact `<=30` bug the engine comment (`workout-budgeting.utils.ts:137-143`) records as already fixed. **[carried]** Writes nothing to Firestore. |
| `/admin/simulator`, `/admin/workout-simulator` | n/a | Verified: neither performs any Firestore write — read-only simulation tools, so no silent-lying *controls*, only the display defect above. |
| `global-training-config.service.ts` (per-level per-domain weekly targets + Firestore load/save) | **Dead** | **Zero importers repo-wide; all 5 exported symbols unused.** **[carried]** No admin page reaches it, so its Firestore doc is never read or written. |

---

## Counts

Grouped rows (`focusAreas`+`prerequisites`; the 5 assessment-media fields) each count once.

| Table | Rows | Connected | Disconnected / defective | n/a |
|---|---|---|---|---|
| 1 — `programLevelSettings` | 22 | 10 | 12 | — |
| 2 — orphaned readers (no admin writer) | 2 | — | 2 | — |
| 3 — exercise catalog | 10 | 9 | 1 | — |
| 4 — admin display surfaces | 3 | — | 2 | 1 |
| **Total** | **37** | **19** | **17** | **1** |

Two of the 19 "connected" rows (`levelDescription`, assessment media) connect to **display/assessment, not generation** — they are excluded from any claim about generation being wired. The single n/a is the verified-clean finding that neither simulator page writes to Firestore.

**Headline contrast.** Counting only the **17 `programLevelSettings` fields an admin can actually change that are meant to steer generation or progression** (i.e. excluding identity fields, `levelDescription` and assessment media):

- **8 work:** `targetGoals`, `protocolProbability`, `preferredProtocols`, `weeklyVolumeTarget`, `maxIntenseWorkoutsPerWeek`, `maxSets`, `baseGain`, `parentLevelMapping`
- **9 do not:** `straightArmRatio`, `weeklySACap`, `restMultiplier`, `intensityModifier`, `volumeAdjustment`, `progressionWeight`, `firstSessionBonus`, `persistenceBonusConfig`, `rpeBonusConfig`

Notably, **every field that controls volume or protocols is wired, and every field that controls straight-arm safety or progression pacing is not.** The working set is the half that shapes *what* a session contains; the dead set is the half that shapes *how hard and how fast* — which is the half with the injury-risk surface.

---

## Ranking of disconnected items by impact, with a wire-vs-hide call

Ranked by *how much a real user's weekly sessions would change if it worked*.

**1. `weeklySACap` — WIRE. Effort M (~1-2d).** Highest impact, and uniquely so: this is not merely a dead control, it is an *actively harmful* one. The placeholder `WEEKLY_SA_CAP = 6` that shadows it is read as a **boolean** at `WorkoutGenerator.ts:1587-1589` (`weeklySACap != null && > 0` — always true), which permanently disables the engine's largest and only level-aware SA term: the **−25** penalty on non-skill straight-arm exercises for `userLevel > 12` (`:1730-1742`). So one unwired admin field suppresses a second, separate rule two layers away, silently, with `saDeprioritised` counting 0 forever. Wiring requires three small pieces: pass `getSASetsCompleted()` into `HomeWorkoutOptions.weeklySASets`, read `weeklySACap` off the PLS doc instead of the local constant, and split the boolean intent out of the cap value. *Do not fix the PLS read alone* — doing so would flip the −25 penalty on unpredictably (an admin entering `0` would suddenly switch it on for every L13+ user). Straight-arm load is the primary connective-tissue risk in calisthenics; this is the one row where "hide it" is the wrong answer.

**2. `straightArmRatio` — WIRE. Effort S (~2-4h).** The only *per-level* SA control, and the cheapest high-impact fix in the table: the consumer already exists and works (`applySABASelectionBias`, reached at `WorkoutGenerator.ts:1850`), and it already runs on deload weeks with 0.15. The entire gap is that the PLS field is never extracted at `home-workout.service.ts:2789`; add it beside `preferredProtocols` and keep the existing `Math.min(…, DELOAD_SA_CAP)` so deload still wins. Would change SA composition in every session for every user, at an admin-tunable per-level curve (the UI already defaults 0.4 ≤L10 / 0.5 >L10). Caveat to raise with David first: the prior report's contradiction stands — a 0.5 ratio permits ~5 SA exercises in a 10-exercise session against the absolute cap of 2, so the two rules need reconciling as part of wiring, not after.

**3. `progressionWeight` — WIRE. Effort S (~3h).** Ranked third because it is the highest-impact *non-SA* dead field: it governs how fast users level, which changes every subsequent session's tier/Δ and therefore sets, reps and rest. It is written with a persisted `1.0` on every save from both pages, so it looks configured. The natural read site already exists — `progression.service.ts:1206-1222` reads `baseGain` from the same doc, so this is one more field on an extraction that already happens.

**Then, in order:**

4. **`tabataProbability` — WIRE, S (~2h).** Engine-ready and permanently stuck at the 0.15 default; the `allowTabata` toggle sits right where the input belongs. Cheapest real behaviour change in the table.
5. **`volumeAdjustment` — HIDE.** A genuine per-level volume dial, but it overlaps `weeklyVolumeTarget` and `maxSets`, which both already work. Adding a third volume authority to a system this audit already found has four competing weekly-budget definitions would make things worse. Hide it; if a per-level volume nudge is wanted, express it through `weeklyVolumeTarget`.
6. **`firstSessionBonus` — WIRE, S (~2h).** Low session impact but trivially cheap, and it sits on the same progression extraction as `baseGain`/`progressionWeight` — wire all three in one pass or none.
7. **`persistenceBonusConfig` — HIDE** for now. Retention nudge, no session-content effect; revisit with the XP/progression owner since `XP_Progression_Truth.md` + axioms §2 govern gain math and this would add a new bonus source.
8. **`shadowMatrix` — HIDE/document.** Zero writers, but the consumption code is live and correct. Worth building eventually for QA leverage; it is tooling, not user-facing behaviour, so it should not compete with rows 1-4. Until then, note in the Truth doc that LAW 3 row 20 describes a mechanism with no UI.
9. **`restMultiplier`, `intensityModifier`, PLS `defaultRestSeconds`, Exercise `defaultRestSeconds` — HIDE (and stop persisting).** All four are rest/intensity authorities that TIER_TABLE deliberately superseded; `restMultiplier` and PLS `defaultRestSeconds` already carry `@deprecated`. Wiring any of them would re-introduce a second rest authority against the tier staircase's explicit single-source design. Remove the two inputs from the UI and stop writing the `?? 1.0` defaults.
10. **`rpeBonusConfig` — HIDE.** Cannot work: nothing captures RPE in the session flow. Blocked on a product decision, not a wiring task.
11. **`focusAreas`, `prerequisites`, `minSets` — DELETE from schema.** No writer, no reader, and two of the three collide by name with live unrelated concepts (`DerivedPrerequisite`, `VolumeCapConfig.minSets`), which is actively misleading to the next reader.
12. **`/admin/workout-simulator` duration badge — FIX (S, ~1h).** Not a control, but it misinforms whoever is reasoning about engine behaviour. Import `DURATION_SCALING`/`getExerciseCountForDuration` instead of restating them.
13. **`global-training-config.service.ts` — DELETE.** Zero importers; per the `seed-scripts-must-not-outlive-their-bootstrap` precedent, delete rather than leave a plausible-looking trap.

**Cross-cutting recommendation.** Nine of the twelve dead PLS fields are *persisted with confident default values* on every admin save (`progressionWeight ?? 1.0`, `intensityModifier ?? 1.0`, `restMultiplier ?? 1.0`, `volumeAdjustment ?? 0`) — so Firestore fills with values that look authoritative and change nothing. Whichever way each row goes, the schema doc comments must be corrected in the same pass: `straightArmRatio` currently claims *"@see WorkoutGenerator – enforced during exercise selection"* and `weeklySACap` claims *"The generator checks cumulative SA sets and throttles when cap is hit"*. Both statements are false today, and both are exactly the kind of comment axioms §27 warns about — documentation that makes a false assumption of safety plausible to the next reader.

---

## Limitations

1. **Live Firestore values were not read.** Schema, writers and readers only — consistent with the prior report. A disconnected field's *stored* value is irrelevant to its connection status, so no finding here depends on this.
2. **Progression/XP fields** (`baseGain`, `firstSessionBonus`, `persistenceBonusConfig`, `rpeBonusConfig`, `progressionWeight`) are governed by `XP_Progression_Truth.md` + axioms §2. Their wiring status is reported; the *correct values* are out of scope and server-owned.
3. **Tables 1-4 cover the admin surfaces that write program/level-keyed generation config.** A parallel broad sweep for additional admin config collections (feature flags, readiness thresholds, running templates) was still running when this report was written; running-engine and readiness config are out of this task's strength-programming scope in any case. If that sweep surfaces another program/level-keyed collection, it belongs as a Table 5.
4. **No runtime reproduction** (axioms §11 — build/dev commands not run). All connection calls are static traces of the actual read sites.
