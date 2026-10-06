# Workout-Engine Exercise-Programming Rules — Configuration Audit

**Date:** 2026-10-05
**Type:** REPORT-ONLY. Zero code / config / Firestore changes were made.
**Baseline:** `origin/main` @ `1c856629` — verified `git fetch` + `HEAD == origin/main` (0 ahead / 0 behind) before any file was read, per `CLAUDE.md`'s freshness rule.
**Worktree:** `.claude/worktrees/agent-a8cf0415084683225`, branch `worktree-agent-a8cf0415084683225`.

**Scope.** The *configuration* governing exercise programming — mechanical-type caps (SA/BA, LAW 8), exercise-type mix, volume/percentages, progression thresholds, level windows, tier tables, duration→count mapping. **Out of scope:** the exercise-swap SA-bypass bug being fixed separately, and the entire running-engine (`core/services/running-engine.service.ts`, `plan-generator.service.ts`) which has its own unrelated rule set.

---

## 0. Ground-truth status (audit-before-code)

| Source | Status |
|---|---|
| `.cursoragents/Workout_Engine_Truth.md` | Read in full (384 lines). Declares itself "CANONICAL LAW". LAW 8 is the SA/BA rule; LAW 9 rest; LAW 10 volume/deload. |
| `.claude/rules/axioms.md` | Searched for `LAW`, `straight`, `mechanical`, `volume`, `budget`, `tier`. **No axiom covers exercise-programming rules at all.** §1 constrains engine *purity*; §8 "Z-Index Budget" is UI, not training volume. |

**Finding 0.1 — the programming-rule family has no axiom-level protection.** Every numeric training rule in this audit rests on a single doc (`Workout_Engine_Truth.md`) that this audit found to be **materially out of date in at least four places** (see §3.C). `axioms.md` explicitly warns "One fabricated 'law' poisons the entire system" — the programming-rule family is precisely the area with no entry there.

**Honesty markers.** LAW 4 of the Truth doc carries its own self-correction ("the flat priority map this section used to describe was STALE"). The Truth doc contains no `⚠️ PLACEHOLDER` markers. Truth-doc LAW 3 row 29 ("SA/BA Balance — Max 2 straight_arm per session") and LAW 8 are treated in this report as *claims to be verified against code*, not as fact — which is how the contradictions in §3.C were found.

**Verified limitation — live Firestore values were NOT read.** Collections `programLevelSettings` and `config/globalTrainingConfig` hold admin-editable numbers. This audit covers the **schema, the writers, and the readers** only. Where a rule's live value matters, it is flagged as unverified rather than guessed.

---

## 1-2. The rule map

### 1.A Straight-arm / mechanical-type caps — **five separate rules, four different units**

The Truth doc (LAW 8) documents **only the first**. The other four are undocumented there.

| # | Rule | Unit | Defined at | Varies by | Enforced by | Live? |
|---|---|---|---|---|---|---|
| 1 | `MAX_STRAIGHT_ARM_PER_SESSION = 2` | absolute count | `logic/ContextualEngine.ts:68` | **flat global** — no level/stage/duration variation | `applyMechanicalBalancing` (`:641`), score penalty `(n−2)×5` | partly — see BUG-1 |
| 2 | `straightArmRatio` (default `lvl<=10 ? 0.4 : 0.5`) | ratio of SA:total | admin UI `app/admin/programs/page.tsx:1364`; schema `program.types.ts:128` | **by level** (one step at L10/L11) | `applySABASelectionBias` (`workout-selection.utils.ts:802`) | **NO** — BUG-3 |
| 3 | `weeklySACap` / `WEEKLY_SA_CAP = 6` | SA **sets** per week | `services/home-workout.service.ts:1825`; admin field `:1395` | flat (admin can override per level) | `WorkoutGenerator.ts:1815-1832` | **NO** — BUG-2 |
| 4 | SA deprioritisation penalty `−25` | score points | `logic/WorkoutGenerator.ts:1583-1589, 1730-1742` | **by level** (`userLevel > 12`) | inline scoring bonus pass | **NO** — BUG-2b |
| 5 | `DELOAD_SA_CAP = 0.15` | ratio | `services/periodization.service.ts:156` | **by periodization week** (week 5 / long gap only) | min'd into `straightArmRatio` at `home-workout.service.ts:2971-2980` | **YES — the only live one** |

Also mechanically-scoped: `ISOMETRIC_GUARDRAILS.straightArmMaxHold = 15`s (`workout-budgeting.utils.ts:109`, live at `:466`) — a hold-duration guard, flat across all levels.

**Net live behaviour:** on weeks 1–4 of the 5-week cycle, the only SA control is rule #1's pool-order score penalty. Ratio-based SA control exists **only on deload weeks**, at the hardcoded 0.15. Rules #2, #3 and #4 are all inert (§3.B).

A fourth re-implementation of the `≤ 2` check lives in `scripts/audit/generator-validation-harness.ts:358-373`, independent of all three runtime copies.

Three independent implementations of "is this balanced":

| Impl | Scope | Threshold source | `warning` field |
|---|---|---|---|
| `ContextualEngine.calculateMechanicalBalance:674` | **candidate pool** | reads `MAX_STRAIGHT_ARM_PER_SESSION` | yes |
| `WorkoutGenerator.calculateMechanicalBalance:1989` | selected session (all roles) | **hardcodes `2`** | no |
| `recomputeMechanicalBalance` (`workout-sorting.utils.ts:616`) | selected session (main-role only) | **hardcodes `2`** | no |

### 1.B Tier engine — level-delta → sets / reps / hold / rest

`TIER_TABLE`, `logic/workout-generator.types.ts:51-57`. `resolveTier(levelDelta)` at `:65-71`.

| Tier | Δ vs user level | reps | hold (s) | rest (s) | sets |
|---|---|---|---|---|---|
| `elite` | ≥ +2 | 1–3 | 3–6 | 180–240 | 4–5 |
| `hard` | = +1 | **1–3** | 5–10 | 150–180 | **4–5** |
| `match` | 0 | 3–6 | 10–15 | 120–150 | 3–4 |
| `easy` | −1, −2 | *10–15* | 15–25 | 90–120 | **3–3** |
| `flow` | ≤ −3 | *10–15* | 25–45 | 60–90 | **3–3** |

*Italic = dead value, overridden by the staircase below.* `resolveTier` matches its doc comment exactly — no bug there.

**`getStaircaseRange`** (`logic/workout-budgeting.utils.ts:177-196`) overrides TIER_TABLE reps for match/easy/flow, keyed on `levelProgressPercent`:

| Tier | `levelProgressPercent` | reps | horizontal-match variant |
|---|---|---|---|
| `match` | < 50% | 2–4 | 4–6 |
| `match` | ≥ 50% | 4–6 | 6–12 (`MATCH_HORIZONTAL_REPS`) |
| `easy` | — | 6–8 | — |
| `flow` | — | 10–12 | — |
| `hard` / `elite` | — | *(falls through to TIER_TABLE 1–3)* | — |

### 1.C Difficulty bolts (D1 flow / D2 normal / D3 intense)

`DIFFICULTY_VOLUME`, `logic/workout-budgeting.utils.ts:98-106` — **no level variation**:

| Bolt | sets | reps | hold (s) |
|---|---|---|---|
| D1 (flow) | 3–3 | 10–12 | 20–30 |
| D2 (normal) | 3–4 | 6–8 | 15–25 |
| D3 (intense) | 4–5 | 1–6 | 5–15 |

Per-bolt structural modifiers (`services/trio-modifiers.service.ts`):
- D3 intense: `INTENSE_REST_FLOOR = 90`s (`:220`), `MAX_MAIN = 5` (`:221`), `MAX_CORE = 1` (`:222`), required domains `['push','pull','legs']` (`:274`)
- D1 flow: `regressionFloor(domainLevel)` (`:468-473`) — **L≥18→12, L≥12→7, L≥6→3, else 1**
- Cluster caps (`core/pipeline/BudgetDistributor.ts`): D3 → `SKILL_CLUSTER_MAX_MAIN=4`, `SKILL_CLUSTER_MAX_SETS=5` (`:59-60`); D2 → `BALANCED_CLUSTER_MAX_MAIN_BASELINE=3` / `_DIVERSE=4` (unlocked at `BALANCED_DIVERSITY_THRESHOLD=3` distinct domains) / `_MAX_SETS=4` (`:73-76`)
- Core set lock: `CORE_MIN_SETS=2`, `CORE_MAX_SETS=3` (`BudgetDistributor.ts:116-117`) — with a **documented 9.3% residual** (59/631) of core exercises bypassing the lock via two post-`distribute()` injection paths (`:87-108`)

### 1.D Duration → exercise count

`DURATION_SCALING` + `getExerciseCountForDuration`, `logic/workout-budgeting.utils.ts:48-54, 134-154`. Does not vary by level or program. **One engine definition, but a second, disagreeing copy is shown to admins** (`app/admin/workout-simulator/page.tsx:459-463`, rendered as a badge at `:498`):

| Request | Engine bucket | Engine count | Admin simulator badge | Agree? |
|---|---|---|---|---|
| ≤ 10 min | `'5'` | 2–3 | `2-3` | yes |
| ≤ 20 min | `'15'` | 5–6 | `4-5` | **no** |
| ≤ 30 min | `'30'` | 6–8 | `4-5` | **no** |
| ≤ 45 min | `'45'` | 8–10 | `6-8` | **no** |
| > 45 min | `'60'` | 9–12 | `7-10` | **no** |

The simulator also collapses the engine's `'15'` and `'30'` buckets into one `≤30` branch — reproducing exactly the structural mistake the engine comment at `:137-143` records as already fixed once (the old `<=30 → '15'` branch that made the `'30'` tier unreachable).

Bolt duration caps are duplicated too: `BOLT_DURATION_CAPS = {1:30, 2:45, 3:60}` (`services/home-workout.service.ts:713-717`) vs the same literals hardcoded at `app/home/page.tsx:1955-1958` (whose own comment at `:1947` admits it mirrors them).

### 1.E Weekly / daily volume budget — **four definitions**

| Source | Formula / values | Bands | Live? |
|---|---|---|---|
| `programLevelSettings.weeklyVolumeTarget` (Firestore, admin) | admin-set per program+level | — | YES (preferred) |
| `getDefaultVolumeTarget` (`services/lead-program.service.ts:61-66`) | 8 / 12 / 16 | L≤5, L≤12, L13+ | YES (fallback when a lead program resolves) |
| `calculateWeeklyBudget` (`core/store/useWeeklyVolumeStore.ts:206-208`) | `max(4, level × 2)` | continuous | YES (fallback when **no** lead program resolves) |
| `getDefaultGlobalLevelConfig` (`services/global-training-config.service.ts:62-73`) | push/pull 8/12/16, legs 6/10/14, core 4/6/8 | L≤5, L≤12, L13+ | **NO — file has zero importers** |

Also: `getDefaultMaxSets` 20/24/28 (`lead-program.service.ts:76-80`); `dailySetBudget` = weekly ÷ scheduleDays (Truth-doc LAW 3 row 28); `getBaseSets` 2/3/4/5 at L1-5/6-12/13-20/21-25 (`workout-budgeting.utils.ts:56-68`, live via `:265`).

### 1.F Intensity gating (max intense sessions/week) — **triplicated**

| Site | L≤5 | L≤12 | L13+ |
|---|---|---|---|
| `services/intensity-gating.service.ts:62-65` | 0 | 2 | **99** |
| `services/lead-program.service.ts:68-72` | 0 | 2 | **99** |
| `services/global-training-config.service.ts:68` | 0 | 2 | **99** (dead file) |

Values agree. The duplication is the finding, not a value conflict.

### 1.G Periodization / deload

`services/periodization.service.ts`. Cycle = `(ceil((daysSinceStart+1)/7) % 5) || 5`.

| Week | Label | volumeMultiplier | deltaOverride | protocolMultiplier | SA cap |
|---|---|---|---|---|---|
| 1–3 | Build | 1.0 | — | 1.0 | — |
| 4 | **Peak** | **1.2** | +1 | 1.5 | — |
| 5 | Deload | 0.5 | −2 | 0 | **0.15** |

Inactivity bridge: `GAP_DETRAINING_THRESHOLD=3` → −40% (`VOLUME_DETRAINING=0.40`, `:153`); `GAP_FORCE_DELOAD_THRESHOLD=7` → force week 5, −50% (`VOLUME_LONG_GAP=0.50`, `:154`); `GAP_REBUILD_THRESHOLD=21` → cycle restart. Matches `INACTIVITY_THRESHOLD_DAYS=3` / `INACTIVITY_VOLUME_REDUCTION=0.40` in `workout-budgeting.utils.ts:95-96`.

### 1.H Level windows / tolerance / isometric guards

- `EXPANDED_LEVEL_TOLERANCE = 5`, `MIN_HEALTHY_POOL = 6` (`core/pipeline/PoolFactory.ts:46-49`)
- `HARD_LEVEL_CAP = 3`; per-bolt overflow windows D1 `[−3,−1]`, D2 `≤+3`, D3 `[−1,+3]` (`workout-selection.utils.ts:777-786`)
- Zombie-rescue level gates: `userLevel > 5`, `userLevel > 15` (`WorkoutGenerator.ts:965-1044`)
- `levelFloor = userLevel >= 10 ? max(1, userLevel − 5) : 1` (`workout-selection.utils.ts:1134`)
- `ISOMETRIC_GUARDRAILS` (`workout-budgeting.utils.ts:108-112`): `straightArmMaxHold: 15`, `handstandMaxHold: 60`, `corePlanksFollowLevel: true` — live at `:462, :466`. **Flat, no level variation.**
- `STATIC_SKILL_HOLD_CAP_SECONDS = 15` (`core/presentation/PresentationFormatter.ts:91`) — duplicates `straightArmMaxHold`

### 1.I Volume cap convergence (duration contract)

`enforceVolumeCap`, `core/presentation/PresentationFormatter.ts:494+`. `VOLUME_CAP_TOLERANCE_MIN = 3`, `MIN_MAIN_EXERCISES = 2`, `minSets` default 2, `maxIterations` 30. Phase A/B trim overshoot, C hard-drops, D adds back undershoot. Trim order is **duration-aware** (`coreProtected = durationCap >= 20`): below 20 min core→isolation→legs; at/above 20 min isolation→legs→core.

### 1.J Consolidated view — what varies by level, what doesn't

| Rule family | Varies by level? | Varies by bolt/stage? |
|---|---|---|
| SA absolute cap (=2) | **NO — flat L1→L25** | no |
| SA ratio (0.4/0.5) | yes (1 step at L10) — **but not live** | deload only (0.15) |
| Weekly SA sets (=6) | admin-overridable — **not live** | no |
| SA deprioritisation (−25) | yes (`>L12`) — **but not live** | no |
| SA max hold (15s) | **NO — flat** | no |
| TIER_TABLE sets/reps/hold/rest | via Δ only, not absolute level | no |
| Staircase reps | via `levelProgressPercent` | no |
| `DIFFICULTY_VOLUME` | **NO** | yes (D1/D2/D3) |
| Duration→count | **NO** | no |
| Weekly volume target | yes (3 bands, or ×2) | no |
| Max intense/week | yes (3 bands) | — |
| `getBaseSets` | yes (4 bands) | no |
| Regression floor | yes (4 bands) | D1 only |
| Deload / peak | no (by cycle week) | no |
| Isometric hold guards | **NO — flat** | no |
| Cluster caps | **NO** | yes (D2/D3) |
| Core set lock [2,3] | **NO** | no |

**Level-band boundaries are mutually inconsistent across families** — five different schemes: `5/12` (volume, intensity), `5/12/20` (`getBaseSets`), `6/12/18` (regression floor), `5/13/19` (`workout-metadata.service.ts:185-187`), and `10` (SA ratio).

---

## 3. Findings

### 3.A The SA/BA cap does not do what LAW 8 says

`applyMechanicalBalancing` (`ContextualEngine.ts:641-669`) is called at **line 323 — on the full scored candidate pool, and before the score sort at line 326**:

```ts
// :313-326
const scoredExercises = passedHardFilters.map(...);          // every survivor, in catalog order
const relaxSABA = hasStrictProgramFilter && activeProgramFilters.length === 1;
const balancedExercises = this.applyMechanicalBalancing(scoredExercises, relaxSABA);
balancedExercises.sort((a, b) => b.score - a.score);          // sort happens AFTER
```

`straightArmCount` increments across **every** `straight_arm` exercise in the pool, in the order the hard-filter loop pushed them. With a pool of 30 SA candidates the 30th is penalised `(30−2)×5 = −140`, while the first two are penalised nothing — purely as a function of catalog iteration order, which has no relationship to session composition. For reference, the whole soft-scoring scale is small (LAW 7.2: +2/matching lifestyle tag, +3 exact level, +1 video), so even the first excess penalty (−5) dominates the score; by the fifth it is an effective exclusion.

This is the §26/§29 shape: a function that *reads* as a session cap, named for a session cap, cited by LAW 8 as a session cap, whose actual effect is a catalog-order-dependent score skew. It is not a weaker cap — it is a different mechanism.

Two further structural limits on the one live ratio mechanism, `applySABASelectionBias` (`workout-selection.utils.ts:802-842`):
- It `return`s after **one** swap. From 5 SA / 1 BA (0.83) against target 0.4 it reaches 0.67 and stops — it cannot converge.
- It only scans `selected.length/2 … end` (`:829-830`). Skill exercises sit at the **top** of the array (Truth doc LAW 5: Golden Slot skills first; LAW 4 pass 2 weights skills/compounds to domain-weight 1) and skill exercises in calisthenics are overwhelmingly the straight-arm ones (front lever, planche, back lever). **The bias cannot remove SA from the half of the array where SA actually concentrates.**

And `relaxSABA` (`:322`) disables SA handling entirely whenever exactly one program filter is active — i.e. for focused single-skill sessions, the population with the highest straight-arm joint load.

### 3.B Dead configuration that reads as live

| Item | Evidence |
|---|---|
| Weekly SA cap chain | `weeklySASets` is only ever *destructured* (`home-workout.service.ts:1810`) and *read* (`WorkoutGenerator.ts:1816`). **No caller anywhere passes it** — not `StatsOverview.tsx:867`, not `admin/workout-simulator/page.tsx:339`, not `user-workout-adjuster-options.utils.ts:36-45`. The data exists — `useWeeklyVolumeStore` tracks `saSetsCompleted` (`:324`) and exposes `getSASetsCompleted()` (`:392`) — and **`getSASetsCompleted` has zero callers**. So `context.weeklySASets` is always `undefined`, the guard `weeklySASets != null && weeklySASets >= weeklySACap` is always false, and `WEEKLY_SA_CAP = 6` can never fire. |
| **The level-aware SA penalty, disabled by the unwired cap** | See §3.B.1 below — the single highest-leverage finding in this audit. |
| Periodization volume + delta overrides | `SessionPolicy.volumeMultiplier` (Peak ×1.2 / Deload ×0.5) and `SessionPolicy.deltaOverride` (Peak +1 / Deload −2) are **computed, logged, and discarded**. Repo-wide, every non-test reference is inside `periodization.service.ts` itself, a `console.log` (`:300-301`), or the *running* engine's unrelated same-named field. The Peak/Deload volume effect is actually produced by an independent hardcoded duplicate at `workout-budgeting.utils.ts:311-337` (`pw===4 → ×1.2`, `pw===5 → ×0.5`); **`deltaOverride` has no duplicate at all, so "force Δ−2 on deload / Δ+1 on peak" is entirely unimplemented.** The only deload→intensity coupling that exists is a coarser, different rule: `InputSanitizerMiddleware.ts:850-862` downgrades D3→D1 on week 5. |
| Admin per-level SA controls | `/admin/programs` renders a `straightArmRatio` slider (`:1364-1377`) and a `weeklySACap` input (`:1395-1402`), persisted to `programLevelSettings`. The generator calls `getProgramLevelSetting` (`home-workout.service.ts:2775`) but extracts **only** `preferredProtocols`, `protocolProbability`, `tabataProbability`, `targetGoals`; `lead-program.service.ts` extracts only `weeklyVolumeTarget`, `maxSets`. **Neither SA field is ever read.** An admin tightening SA for L15 changes nothing, with confident UI feedback that it did. |
| `global-training-config.service.ts` | Zero importers repo-wide; all five exported symbols have zero usages. An entire file of per-level per-domain weekly volume targets + a Firestore load/save pair, fully dead. |
| `getBaseReps` / `BASE_REPS_BY_LEVEL` | A complete L1–L25 standard/timeBased rep table (`workout-budgeting.utils.ts:70-93`) with **zero callers repo-wide** (`getBaseSets`, by contrast, is live at `:265`). |
| TIER_TABLE `easy`/`flow` reps | `{10,15}` for both; `getStaircaseRange` overrides them to 6–8 and 10–12. The stored values are never prescribed. |
| PLS fields with no reader | Beyond the two SA fields: `minSets` (`program.types.ts:151`, schema marks it "legacy/ref only"), `defaultRestSeconds` (`:189`, `@deprecated`), and `intensityModifier` / `restMultiplier` / `volumeAdjustment` (`:97-99`) — the last three are *written* by `admin/programs/page.tsx:996-998` with no engine reader. |

#### 3.B.1 — One unwired constant silently disables a *different* SA rule two layers away

This is the sharpest finding in the audit, and it is the §28 shape precisely: a value set for one purpose being read as a flag for another.

`WorkoutGenerator.ts:1583-1589` computes:

```ts
const userHighLevel = (context.userLevel ?? 0) > 12;
const saSkillFocusRequested =
  (context.priority1SkillIds?.length ?? 0) > 0 ||
  (context.weeklySACap != null && context.weeklySACap > 0);   // ← always true
```

and `:1730-1742` then applies a **−25** score penalty to every non-skill straight-arm exercise:

```ts
if (userHighLevel && !saSkillFocusRequested && ex.exercise.mechanicalType === 'straight_arm') {
  if (classifyPriority(ex.exercise) !== 'skill') { bonus -= 25; /* sa_deprioritised */ }
}
```

`context.weeklySACap` is set unconditionally to the hardcoded `WEEKLY_SA_CAP = 6` at `home-workout.service.ts:2983`. It is therefore **never null and always > 0**, so `saSkillFocusRequested` is **always true**, `!saSkillFocusRequested` is **always false**, and the **−25 penalty can never fire for any user.**

Three things make this worse than an ordinary dead branch:

1. **−25 is by far the largest SA-related score term in the engine** — roughly 5× the `(n−2)×5` excess penalty and an order of magnitude above the soft-scoring scale (LAW 7.2: +2/+3/+1). It was the one SA mechanism with real selection power.
2. **It is the only *level-aware* SA rule that is wired into the scoring path at all** (`userLevel > 12`), i.e. exactly the "does this tighten for advanced levels?" behaviour this audit was asked to look for. It exists, it is correctly written, and it has never run.
3. **The cause is not in this file.** The field `weeklySACap` was meant to carry an admin-configured per-level *cap value* (which is itself never read — BUG-3); here it is being interpreted as a boolean "did the scheduler plan SA work?" signal. Because a placeholder constant fills it in unconditionally, it permanently answers "yes." Nothing logs, warns, or differs — `saDeprioritised` simply counts 0 forever. Per axioms §28: a silent mechanism that swallows a semantically-necessary case looks identical to success.

### 3.C Documented rule vs actual enforcement

| Truth-doc claim | Actual code |
|---|---|
| LAW 8: "`MAX_STRAIGHT_ARM_PER_SESSION = 2`… 3rd+ penalised" — presented as the SA rule | Three further SA rules exist (ratio, weekly sets, deload cap) and are undocumented. The documented one is pool-scoped (§3.A). |
| LAW 10: "**Deload:** every 4th/5th week → Volume −50%" | Week **4 is Peak, ×1.2 (+20% volume)**; only week 5 deloads. The doc prescribes a cut where the code adds volume. |
| LAW 10: "Set types: `< Level 10` → straight sets only; `> Level 10` → antagonist supersets" | **No level gate exists.** Antagonist pairing is gated on domain composition (`StructureDirector.ts:94`: `hasPush && hasPull`) and admin `preferredProtocols`. A repo-wide search for a level-10 superset threshold found none. |
| LAW 9 rest table: "Hypertrophy 6–12 reps → 90s"; "Endurance 12+ → 45s" | **No tier produces 45s rest** — the floor is `flow` at 60s. A 6-rep `match` set gets **120–150s**, not 90s. TIER_TABLE's own comment (`:48-50`) states it is now authoritative for rest, so LAW 9's rep-keyed rows are stale. The *hold*-keyed rows remain approximately correct. |
| `getStaircaseRange` doc comment (`:168-176`): "Easy (delta = −1)… Flow (delta = −2)" | `resolveTier`: `easy` = −1 **and** −2; `flow` = **≤ −3**. The comment mislabels its own tier mapping. |
| `enforceVolumeCap` summary comment (`:462-466`): "Phase A… 1. Core… (most expendable)" | Correct only below 20 min. The implementation (`:538-585`) is duration-aware and trims core **last** at ≥20 min. The accurate description is in the *inline* comment 25 lines lower; the summary at the top of the function is stale. |
| `ContextualEngine.ts:690` comment: "SA should not exceed BA by more than 1" | Code is `Math.abs(sa − ba) <= 2`. |

### 3.D Internal inconsistencies

- **Weekly volume fallbacks disagree by up to 3× — CORRECTED, see BUG-6 below.** Originally filed here as two competing formulas; root-caused further and fixed (PR #154, 2026-10-06) as one `resolveActiveProgramBudget` null-resolution bug that inflated this number AND disabled the `maxSets` hard cap in the same request — not an independent "which fallback is right" question. Full writeup under BUG-6.
- **The absolute SA cap and the SA ratio contradict each other at scale.** At L>10 the ratio default is 0.5; a 60-min session is 9–12 exercises, so 50% permits ~5–6 SA — against an absolute cap of 2 and an `isBalanced` rule that flags anything above 2. The two rules cannot both be satisfied in a long advanced session. (Currently masked only because the ratio is not live — BUG-3.)
- **`isBalanced` is computed three times and consumed by nothing.** Repo-wide, every non-test reference is a definition, a type, or a literal initialiser. Nothing branches on it. Its `Math.abs` is also symmetric, so a 0-SA / 5-BA session — a perfectly normal, low-joint-stress beginner workout — reports `isBalanced: false` while *also* producing **no `warning`** (the warning branches are `sa > 2` and `sa > ba + 2`, both false). A false imbalance signal with no accompanying explanation, on the most ordinary workout shape there is.
- **`MAX_STRAIGHT_ARM_PER_SESSION` is not a single source of truth.** Two of the three balance implementations hardcode `2`. Changing the named constant would silently fail to change either session-scoped computation.
- **Role-scope divergence rests on an accident.** `recomputeMechanicalBalance` filters to `exerciseRole === 'main'`; `WorkoutGenerator.calculateMechanicalBalance` does not. The former's comment justifies equivalence by noting warmup/cooldown "didn't exist yet at that point in the pipeline" — a pipeline-ordering accident, not a scope match (§26 exactly). If warmup prepending ever moves earlier, the mid-pipeline count silently starts including mobility drills.
- **`BASE_SETS_BY_LEVEL`'s fallback contradicts its own table.** `Math.min(5, 2 + floor(level/6))` gives 4 at L12 (table: 3) and 5 at L18 (table: 4). Unreachable today since the table covers 1–25, but it is a wrong-by-construction spare.
- **`elite` and `hard` are identical in reps (1–3) and sets (4–5)**; `easy` and `flow` are identical in reps (10–15, both dead) and sets (3–3). Of five tiers, only three distinct set ranges and (post-staircase) four distinct rep ranges exist. The five-tier granularity is real only for `rest` and `hold`.
- **Core set lock has a known, measured 9.3% bypass** (59/631), documented honestly in `BudgetDistributor.ts:87-108` but still open.
- **Five mutually inconsistent level-band schemes** (listed in §1.J).
- **`maxSets` disagrees above L12.** `getDefaultMaxSets` (`lead-program.service.ts:76-80`) → 20 / 24 / **28**; `getProfessionalMaxSets` (`admin/progression-manager/page.tsx:98-103`) → 20 / 24 / **30** (L≤19) / **35** (L20+). The admin panel shows and saves a ceiling the engine fallback will not honour, and `:118-120` aliases a legacy `getDefaultMaxSets` name to the *professional* values — so the same function name means two different things in two files.
- **`getDefaultVolumeTarget` is duplicated verbatim rather than imported** — `lead-program.service.ts:61-65` and `admin/progression-manager/page.tsx:69-73` hold identical copies (8/12/16). Values agree today; nothing keeps them aligned.
- **A sixth `dailySetBudget` default exists only at one call site:** `workout-selection.utils.ts:1318` uses `context.dailySetBudget ?? 6`. The number 6 appears nowhere else in the budget system, and every other consumer falls back differently (`BudgetDistributor` uses `Math.max(1, …)` safe denominators; `SplitDecisionService.ts:430` uses `MANUAL_BASELINE_SETS = 14`).
- **Five different level-tolerance windows.** `±3` is the nominal default (`ContextualEngine.ts:113`, `:371`; re-hardcoded as `STRICT_TOLERANCE = 3` at `PipelineOrchestrator.ts:234`; set explicitly at `home-workout.service.ts:2545` and `admin/simulator/page.tsx:302`), widened to `±5` by `EXPANDED_LEVEL_TOLERANCE` (`PoolFactory.ts:49`), while the hybrid engine uses `±6` (`hybrid/start-hybrid-session.ts:551`) and `±2` (`hybrid/compose-hybrid-session.service.ts:330`).
- **Three disagreeing regression floors.** `BOLT1_WINDOW_LOWER_OFFSET = -3` (`shared/constants/domain-mapping.constants.ts:106`), `userLevel - 5` (`workout-selection.utils.ts:1134`), and `synergyReferenceLevel - 2` (`WorkoutGenerator.ts:1574`) — plus `regressionFloor`'s absolute bands (§1.C) and `resolveTier`'s delta boundaries, five encodings of "how far below level may we go."
- **`baseGain` disagrees between the progression defaults and the admin panel.** `progression.types.ts:43-64` `DEFAULT_PROGRESSION_BY_LEVEL` gives 15/12/10/9/8/7/6/5/5/4 for L1–10; `admin/progression-manager/page.tsx:83-88` `getProfessionalBaseGain` gives 8/6/4/2 by band. `requiredSets` likewise: 4/6 per level vs `getDefaultRequiredSets`'s 4/6/8 bands (`progression.types.ts:43`). *(Progression thresholds are adjacent to this audit's scope; flagged for completeness, not analysed in depth — XP/level math is governed by `XP_Progression_Truth.md`.)*

### 3.E Methodology observations (calisthenics programming)

- **A flat SA cap of 2 across L1–L25 and across 10→60-minute sessions.** Joint-stress tolerance for straight-arm isometrics is one of the most level-dependent variables in calisthenics: an L3 beginner should arguably see fewer than 2 SA exercises, while an L22 front-lever/planche athlete's *program* is straight-arm work. One number cannot serve both. **Note the rule family already contains two level-aware designs — the 0.4/0.5 ratio and the `userLevel > 12` −25 penalty — and neither is live** (BUG-3, BUG-2b). The intent was evidently there; the wiring is what is missing. This materially lowers the cost of METH-1: the question is mostly *which curve*, not *whether to build one*.
- **No deload for straight-arm specifically outside week 5, and `DELOAD_SA_CAP = 0.15` is the only live SA ratio control.** Tendon adaptation lags muscular adaptation; a single −50%/15%-SA week out of five (80% of the cycle at full SA exposure, with week 4 at +20% volume) is an aggressive build:deload ratio for connective-tissue-loaded work.
- **`maxIntenseWorkoutsPerWeek = 99` from L13.** `99` is "unlimited" in practice, permitting 7 intense (D3: 4–5 sets, Δ+1, 1–3 reps) sessions/week with no guard. L13 of 25 is mid-range, not elite. The comment reads "Advanced: unlimited" — the band boundary and the word don't match the scale.
- **`regressionFloor` inverts its own stated intent at the top.** Its comment: "advanced users should never regress into beginner territory." The table stops at `L≥18 → 12`, so an L18 user drops 6 levels on a flow day while an **L25 user drops 13** — proportionally the deepest regression in the table, and the only band with no ceiling above it. An L6 user drops 3. The curve should keep rising; the absent top band looks like an unfinished table rather than a decision.
- **No antagonist (push:pull) balance enforcement anywhere.** `isBalanced` measures *mechanical* type (SA vs BA), which is a joint-stress axis, not an agonist/antagonist axis. `StructureDirector` pairs push with pull when both happen to be present, and `GuaranteePassRunner` guarantees domain *representation*, but no rule constrains the push:pull **volume ratio** — the standard guard against the anterior-dominance pattern calisthenics programming is most prone to.
- **`ISOMETRIC_GUARDRAILS.straightArmMaxHold = 15s` is flat.** A 15s ceiling is well-judged for a near-limit tuck planche; it is restrictive for an L20+ athlete's straddle front-lever endurance work, where 20–30s holds are the training target. Also duplicated as `STATIC_SKILL_HOLD_CAP_SECONDS` in the presentation layer.
- **D3 = 4–5 sets at 1–3 reps, Δ≥+1.** Defensible as neural-strength work, but combined with `SKILL_CLUSTER_MAX_SETS = 5` and no live weekly SA cap, an advanced user can accumulate substantial above-level straight-arm set volume with nothing counting it.

---

## 4. Recommendations

### BUG — objectively broken; not judgment calls

**BUG-1 — Apply the session SA cap to the session, not the candidate pool.**
`ContextualEngine.ts:323` + `:641-669`. Move/duplicate the cap to operate on the **selected** exercise list (after selection settles in `WorkoutGenerator`, where `recomputeMechanicalBalance` already runs), or at minimum sort by score **before** applying the penalty so the exercises that survive are the best-scored SA exercises rather than the earliest-enumerated ones. *Confident:* the constant is named `..._PER_SESSION` and LAW 8 calls it per-session, but the array it iterates is the pre-sort candidate pool; the penalty a given exercise receives is a function of catalog iteration order. No reading of "max 2 per session" produces that behaviour.

**BUG-2 — Wire or delete the weekly SA cap.** `WEEKLY_SA_CAP = 6` (`home-workout.service.ts:1825`) is unreachable: `weeklySASets` has no writer and `useWeeklyVolumeStore.getSASetsCompleted()` (`:392`) has no callers. Either pass `getSASetsCompleted()` into `HomeWorkoutOptions.weeklySASets`, or delete the constant, the two context fields, and the `WorkoutGenerator.ts:1815-1832` branch. *Confident:* axioms §29's exact shape — a guard whose input nobody produces. Leaving it is worse than not having it, because it reads as an active tendon-protection cap.

**BUG-2b — Stop using `weeklySACap` as a boolean, and re-enable the −25 SA penalty.** (§3.B.1 — **highest leverage item in this report.**) Split the two concerns: `saSkillFocusRequested` should test an explicit scheduler intent signal (`priority1SkillIds`, or a new named flag), never the mere presence of a cap *value*. As written, the placeholder `WEEKLY_SA_CAP = 6` makes the condition unconditionally true and permanently disables the largest and only level-aware SA scoring term in the engine. *Confident:* `weeklySACap` is assigned a non-null positive literal on every single generation path (`home-workout.service.ts:2983`), so the guarded branch is unreachable by construction — not merely rare. Fixing BUG-2 and BUG-3 without this will not revive it, and fixing BUG-3 alone could revive it *accidentally and unpredictably* (an admin setting the field to 0 would suddenly switch a −25 penalty on for every L13+ user). Add a counter/log assertion on `saDeprioritised` so a future regression surfaces instead of silently counting zero.

**BUG-2c — Wire or delete `SessionPolicy.volumeMultiplier` and `deltaOverride`.** Both are computed and logged, neither is read by any strength consumer. Either have `calculateVolumeAdjustment` consume `volumeMultiplier` (deleting the hardcoded duplicate at `workout-budgeting.utils.ts:311-337`), or delete the two fields so the policy object stops advertising control it does not exercise. **`deltaOverride` is the more serious half** — unlike the volume multiplier it has *no* duplicate, so the documented "force Δ−2 on deload / Δ+1 on peak" rule simply does not exist. *Confident:* verified zero non-log, non-running-engine readers repo-wide.

**BUG-3 — Wire or remove the admin per-level SA controls.** `/admin/programs` writes `straightArmRatio` and `weeklySACap` to `programLevelSettings`; no generator code reads either. Add them to the field extraction at `home-workout.service.ts:2775-2845` (alongside `preferredProtocols`), or remove the controls from the UI. *Confident:* an admin surface that silently discards input is a correctness defect regardless of which SA policy is ultimately chosen. Also the §27 shape — configured-but-not-enforced reads as enforced.

**BUG-4 — Make `MAX_STRAIGHT_ARM_PER_SESSION` the single source.** Replace the hardcoded `2` in `WorkoutGenerator.ts:1997` and `workout-sorting.utils.ts:625` with the imported constant. *Confident:* three sites, one concept, two of them unchangeable from the named constant.

**BUG-5 — Fix or retire `isBalanced`.** It has zero consumers; its `Math.abs` reports a 0-SA/5-BA session as unbalanced while emitting no warning; and `ContextualEngine.ts:690`'s comment says "more than 1" where the code says `<= 2`. Make the SA excess test one-directional (`sa - ba > 2`, matching the warning branch and the joint-stress intent), fix the comment, and either give the flag a consumer or drop it. *Confident:* a predicate that disagrees with its own comment and its own warning, and that nothing reads.

**BUG-6 — CORRECTED 2026-10-06 (verified live, then fixed — PR #154): this was always ONE bug, not two.** Originally filed as "two weekly-volume fallbacks disagree." Root-caused further: both symptoms share a single cause. `resolveActiveProgramBudget` (`lead-program.service.ts`) returned `null` whenever (a) the user has no active program, (b) the matched program is missing `movementPattern`, or (c) its own inner `resolveLeadProgramBudget` found no enrolled candidate for the pattern. Every real call site fed that `null` into its own `?? calculateWeeklyBudget(level)` — the unprotected `level×2` formula, up to 50 at L25 vs the intended tier default of 16 (confirmed live: 40 vs 16 at L20) — **and**, at the generator call site (`home-workout.service.ts:3000`, `maxSets: leadBudget?.maxSets`), the same `null` meant `maxSets` was `undefined`, which silently skipped `BudgetDistributor`'s hard per-session set cap entirely (its `constraints.maxSets != null` guard never fired, at either of its two call sites). One null resolution → inflated weekly target AND disabled safety brake, in the same request. **Fixed in PR #154**: `resolveActiveProgramBudget` now never returns `null` — it returns a safe-default `LeadProgramBudget` (same tier defaults, via `getBaseUserLevel`) on all three paths, with a new `isSafeDefault` flag so callers that need to distinguish real resolution from the fallback still can (`useDailyStrengthTarget.ts`/`useActivitySync.ts`'s `source` tracking). See that PR for full live verification. *This entry is left here, corrected rather than deleted, as the record of how the finding evolved — the original "reconcile the two fallbacks" framing undersold it: there aren't two competing formulas to pick between, there's one unprotected formula that was never supposed to be the only line of defense.*

**BUG-7 — Delete `global-training-config.service.ts`.** Zero importers, zero symbol usage; it defines a plausible full per-level per-domain volume config plus Firestore load/save. Per the `seed-scripts-must-not-outlive-their-bootstrap` precedent, delete rather than leave it as a trap. *Confident:* verified unreachable repo-wide.

**BUG-8 — Delete `getBaseReps` / `BASE_REPS_BY_LEVEL`** (`workout-budgeting.utils.ts:70-93`), zero callers. Its sibling `getBaseSets` is live, which makes the dead twin especially misleading — a future reader will reasonably assume both per-level tables are in play. *Confident:* verified unreachable.

**BUG-9 — Remove or correct TIER_TABLE's dead rep values.** `easy`/`flow` reps `{10,15}` are always overridden by `getStaircaseRange`. Either delete them or annotate them inline as staircase-overridden. *Confident:* `getStaircaseRange` returns non-null for both tiers unconditionally, so the stored values are never used.

**BUG-10 — Update the four stale Truth-doc claims** (§3.C): LAW 10's deload week (week 4 is Peak +20%, not −50%), LAW 10's unimplemented level-10 superset gate, LAW 9's unreachable 45s/90s rep-keyed rest rows, and LAW 8's omission of the other three SA rules. *Confident:* each verified against the implementing function, not a doc comment. LAW 4 already carries a precedent self-correction for exactly this failure — a doc paraphrase read as ground truth mis-flagged correct engine behaviour (PR #121).

**BUG-11 — Fix three stale code comments:** `getStaircaseRange`'s tier-delta labels (`:168-176`), `enforceVolumeCap`'s Phase A summary (`:462-466`, contradicted by its own implementation 25 lines below), and `ContextualEngine.ts:690`. *Confident:* each contradicts adjacent code.

**BUG-12 — Align `BASE_SETS_BY_LEVEL`'s fallback with its table** (4 vs 3 at L12; 5 vs 4 at L18), or drop the fallback and clamp. *Confident:* a spare path that returns a different answer than the table it backs is wrong by construction even while unreachable.

**BUG-13 — Correct the admin simulator's duration→count badge.** `app/admin/workout-simulator/page.tsx:459-463` displays a mapping that disagrees with the engine in 4 of 5 buckets and collapses two engine buckets into one — reproducing the exact `<=30` branch mistake the engine's own comment (`workout-budgeting.utils.ts:137-143`) records as previously fixed. Import `getExerciseCountForDuration`/`DURATION_SCALING` instead of restating them. *Confident:* this is the admin-facing reference for "what will the engine do," and it is wrong; the engine side is test-locked (`logic/__tests__/get-exercise-count-for-duration.test.ts:20-68`), so the simulator is the incorrect copy.

**BUG-14 — Reconcile the two `maxSets` ceilings** (28 vs 30/35 above L12) and stop aliasing the name `getDefaultMaxSets` to the professional values in the admin page (`admin/progression-manager/page.tsx:118-120`). *Confident:* one function name resolving to two different numeric tables in two files is a naming defect regardless of which ceiling is correct.

**BUG-15 — Import `getDefaultVolumeTarget` instead of duplicating it** (`admin/progression-manager/page.tsx:69-73` vs `lead-program.service.ts:61-65`). *Confident:* identical logic, copy-pasted; the `maxSets` pair above shows what happens to such copies over time.

**BUG-16 — Replace the orphan `?? 6` daily-budget default** at `workout-selection.utils.ts:1318` with the shared fallback the rest of the budget system uses. *Confident:* a magic default appearing at exactly one call site and nowhere else in the budget system is a copy-paste leftover, not a considered value.

**BUG-17 — Consolidate the level-tolerance and regression-floor constants.** Five tolerance windows (±2, ±3 ×4 sites, ±5, ±6) and five "how far below level" encodings. At minimum, have `PipelineOrchestrator.ts:234`'s `STRICT_TOLERANCE` and `PoolFactory.ts:113`'s `?? 3` import the single default rather than restate it. *Confident:* the same conceptual window restated as four independent literals is the documented duplication failure mode this repo has hit before.

**BUG-18 — Make the mechanical-balance role scope explicit.** Add the `exerciseRole === 'main'` filter to `WorkoutGenerator.calculateMechanicalBalance:1989` so both session-scoped implementations agree by construction rather than by pipeline-ordering accident (§26). *Confident:* the equivalence is currently guaranteed only by when warmup prepending happens, which is not an authorization-grade guarantee.

### METHODOLOGY — needs David's sign-off; reasonable experts could differ

**METH-1 — Make the SA cap level-aware.** Replace the flat `2` with a per-level (or per-level-band) value, and scale it by session duration rather than holding one absolute count across 10–60-minute sessions. The design already exists in `straightArmRatio`'s 0.4/0.5 — the question is what the curve should be and whether absolute-count or ratio should be primary. **Resolve the direct contradiction too:** a 0.5 ratio and an absolute cap of 2 cannot both hold in a 10-exercise advanced session (§3.D).

**METH-2 — Reconsider the 4:1 build:deload ratio for straight-arm work.** Week 4 at +20% immediately before the only deload, with `DELOAD_SA_CAP` the sole live SA ratio control, concentrates all connective-tissue relief into 20% of the cycle. Options: a mid-cycle SA-only backoff, extending the SA cap to Peak week, or a 3:1 build:deload cycle.

**METH-3 — Replace `maxIntenseWorkoutsPerWeek = 99` with a real ceiling** (e.g. 3–4/week), and reconsider whether L13 of 25 is the right boundary for "advanced". Currently nothing prevents 7 consecutive D3 sessions.

**METH-4 — Extend `regressionFloor` above L18.** As written an L25 user's flow day drops 13 levels — the deepest regression in the table, contradicting the function's own stated intent. Adding bands (e.g. `L≥22 → 16`, `L≥18 → 14`) would keep the curve monotonic in *proportional* terms. *Tagged METHODOLOGY because the right floor values are a coaching judgment — but note the missing top band itself looks like an unfinished table.*

**METH-5 — Consider an antagonist (push:pull) volume-ratio guard.** None exists; domain *representation* is guaranteed but the push:pull **set ratio** is unconstrained. A soft 1:1–1:1.5 pull-biased target is the common calisthenics convention.

**METH-6 — Revisit the flat `straightArmMaxHold = 15s`** for advanced skill-track levels where 20–30s straddle/full-lever holds are the training target. Also de-duplicate against `STATIC_SKILL_HOLD_CAP_SECONDS` (BUG-adjacent; the value choice is the methodology part).

**METH-7 — Decide whether 5 tiers are warranted** given `elite`/`hard` share reps+sets and `easy`/`flow` share both. Either differentiate the collapsed pairs or collapse the taxonomy to the three that genuinely differ in prescription.

**METH-8 — Reconsider `relaxSABA`.** Disabling SA handling for single-program sessions removes joint-stress management from exactly the focused single-skill sessions where straight-arm loading is highest. A reduced cap would serve the "user asked for focus" intent without removing the guard.

---

## 5. Limitations

1. **Live Firestore values not read.** `programLevelSettings` and `config/globalTrainingColumn` hold admin-set `weeklyVolumeTarget`, `maxSets`, `protocolProbability`, `preferredProtocols`, `targetGoals` (and the never-read `straightArmRatio`/`weeklySACap`). Audited: schema, writers, readers. **Not audited: actual stored numbers.** A Firestore read is needed to know what is live per program per level. BUG-3 is unaffected — it holds regardless of stored values, since nothing reads those two fields.
2. **No runtime reproduction.** Findings come from reading implementations (not doc comments) and tracing writers/readers repo-wide. Per axioms §11 build/dev commands were not run. BUG-1's catalog-order behaviour is read off the call-site ordering at `ContextualEngine.ts:313-326`; a seeded `generateHomeWorkoutTrio` run would quantify its real-world effect.
3. **Running engine excluded** by scope.
4. **Hybrid engine** (`hybrid/`) only spot-checked. It has its own TIER_TABLE interaction (`compose-hybrid-session.service.ts:687`) and its own level-tolerance constants (`±6` at `start-hybrid-session.ts:551`, `±2` at `compose-hybrid-session.service.ts:330`) folded into §3.D, but was not audited as a rule family in its own right. It contains no SA/mechanical caps of its own.
5. **Progression/XP thresholds** (`baseGain`, `requiredSets`, `firstSessionBonus`, RPE/persistence bonuses) are adjacent to this scope and governed by `XP_Progression_Truth.md` + axioms §2. The one disagreement spotted is recorded in §3.D; the family was not audited.
6. **Fallback objects are not rules.** `{straightArm:0, …, isBalanced:true}` at `PipelineOrchestrator.ts:68`, `home-workout.service.ts:322/344/388/634`, `compose-park-strength-workout.service.ts:575` and `recovery-video-content.service.ts:134` are empty-result stubs, deliberately excluded from the counts above.

---

## 6. Summary

**18 BUG items** (self-contradicting config, dead rules that read as live, doc-vs-code contradictions) and **8 METHODOLOGY items** (coaching judgment calls needing David's sign-off).

**The single biggest issue** is that **four of the five straight-arm rules are inert**, and the one documented as canonical law (LAW 8 / `MAX_STRAIGHT_ARM_PER_SESSION = 2`) is applied to the candidate pool in catalog order rather than to the session. The sharpest instance is §3.B.1: the hardcoded placeholder `WEEKLY_SA_CAP = 6` is read as a boolean elsewhere and permanently disables the engine's largest and only level-aware SA scoring term (−25 for `userLevel > 12`) — a rule that is correctly written and has never once executed.

Straight-arm loading is the primary connective-tissue risk in calisthenics programming, and it is the rule family with (a) no `axioms.md` entry, (b) the most duplication (five rules, four units, four balance implementations), and (c) the highest proportion of dead configuration. Taken together, the *effective* SA policy in production today is: a catalog-order score skew, plus a 15% ratio nudge on one week in five — not the "max 2 per session" the Truth doc asserts.
