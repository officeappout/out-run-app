# Workout Generator — Complete Rule Map (Audit / Research)

> **Status:** RESEARCH MAP — read-only audit, no code changed. Produced to become the
> input for a single "source-of-truth" for the strength generator + test lock.
> **Date:** 2026-07-12 · **Method:** static end-to-end trace of the live code paths
> (backbone read directly + 5 parallel deep-dive passes over protocols, eligibility,
> volume/rest/caps, guarantees, entry points). **Every claim cites `file:line`.**
> **Scope:** the **strength** generator only. The running engine (`core/services/running-*`,
> `players/running/*`) and `warmup-cooldown-config.ts` (running-only) are out of scope.
> **Honesty caveat:** this is a rigorous *static* trace, NOT a captured runtime log
> (Axiom §11 forbids running dev/build). Every workout carries a `pipelineLog[]`
> (`PipelineOrchestrator.ts:324`) — a real run through `admin/workout-simulator`
> would confirm the ordering below empirically. Items I could not resolve statically
> are marked **OPEN QUESTION**.

---

> **🔴 STATUS UPDATE (13.07.2026 — verified empirically; David-approved annotation):**
> This map was traced on PRE-MERGE code. The following claims are **OUTDATED**:
> - **TL;DR #1 / §2 builder row / §4 (the 15→45 override):** FIXED on main since `0acd234`.
>   `home-workout.service.ts:677` is now `resolveEffectiveBoltTime(options.availableTime,
>   boltDurationCap)` = min(requested, cap), with the `honouring requested Xmin` log;
>   `enforceVolumeCap` receives `durationCap: effectiveTime`. Verified live: builder-shape
>   15/30/45/60 → est **14/28/45/45**. LOCKED on main since `de7dd90`: gate cells
>   `builder/15|30|45|60min` + B1/E1 promoted to HARD (`tests/invariants/runner.ts`).
> - **TL;DR #2 (Tabata does not exist):** true for main; `feat/protocol-blocks` adds tabata
>   end-to-end (generator block + player clock + admin toggle) — pending David's approval.
> - The dashboard's `condensedTime=60` + bolt-cap trim (`estimated=Nm > cap=45m`) is BY DESIGN;
>   seeing that line for a "15-min request" indicates a stale runtime or the builder hand-off
>   executing the dashboard's plan — fixed on `feat/protocol-blocks` (`f45d01f`: the drawer now
>   serializes ITS generated plan), pending merge.
> **STILL VALID and worth acting on:** UserWorkoutAdjuster drops chosen difficulty (§2, Q4);
> `admin/simulator` bypasses the service (§2); dead `ProtocolInjector`/`RestCalculator` (§5C);
> EMOM has no eligibility gate (§3F — tabata on protocol-blocks HAS one: `getIsometricTimeCap≥20`);
> level-tolerance/skill-map/rest-table divergences (§5B); empty-pool full_body gap (§5D).

---

## ⚠️ 0. The Truth file is stale — read this first

`.cursoragents/Workout_Engine_Truth.md` (LAW 14) says the generator lives at
`generator/services/workout-generator.service.ts`. **That file does not exist.** The live
architecture is completely different and has two coexisting layers:

| Layer | Path | Role in the LIVE path |
|---|---|---|
| Service / orchestration | `services/home-workout.service.ts` (2030 ln) | Entry service; builds context, runs the 3-bolt trio loop, warmup/cooldown, final volume cap |
| Modular pipeline | `core/pipeline/*`, `core/middleware/*`, `core/presentation/*` | `PipelineOrchestrator`, `StructureDirector`, `PoolFactory`, `BudgetDistributor`, `InputSanitizerMiddleware`, `PresentationFormatter` — **partly live, partly dead** (see §5C) |
| Legacy "brain" | `logic/WorkoutGenerator.ts` (1673 ln), `logic/ContextualEngine.ts` (886 ln) | Still the **actual** exercise selection + protocol + guarantee engine. The orchestrator is a thin shim that delegates to it (`PipelineOrchestrator.ts:280-292`). |

The Truth file's LAW 2 pipeline description ("home-workout.service → WorkoutGenerator.generateWorkout")
is directionally right but omits the entire `core/pipeline` layer and the 3-bolt trio loop.

---

## 🔴 TL;DR — the landmines (Hebrew)

1. **הבאג 15→45 מאושר.** ה-`availableTime` של המשתמש נדרס ב-[home-workout.service.ts:679](src/features/workout-engine/services/home-workout.service.ts#L679) על ידי `BOLT_DURATION_CAPS = {1:30, 2:45, 3:60}`. גם ה-cap הסופי (`enforceVolumeCap`, [:767](src/features/workout-engine/services/home-workout.service.ts#L767)) מקבל את אותו קבוע-בולט. משתמש שביקש 15 דק' בעצימות "מאוזן" (D2) → הכל מכוון ל-45. הזמן המבוקש לא משפיע על שום דבר במסלול ה-trio. הנפח (sets) נגזר מרמה+תקציב-שבועי ולא מהזמן בכלל.
2. **Tabata לא קיים בקוד.** `grep -rni tabata src/` = 0 תוצאות. הבאג "החזקת-מקס נכנסה לטבטה" לא ניתן לשחזור מהקוד הנוכחי. החשיפה האמיתית: **ל-EMOM אין שום gate של כשירות תרגיל** — החזקה איזומטרית *כן* יכולה להיכנס ל-EMOM חופשי.
3. **קוד מת מסוכן:** `ProtocolInjector` (כל המודול) ו-`RestCalculator` (כל המחלקה) בנויים במלואם אך **לא נקראים באף מקום** במסלול החי. הם משכפלים לוגיקה חיה ו**כבר סטו ממנה**.
4. **UserWorkoutAdjuster מתעלם מהעצימות שהמשתמש בחר** — מחזיר תמיד את slot [1] (D2).
5. **`admin/simulator/page.tsx` עוקף את כל השירות** — קורא ישירות ל-`generateWorkout`, בלי trio/caps/warmup. מסלול-יצירה שני מקביל.

---

## 1. Pipeline Flow Diagram (end-to-end, live path, ordered)

```
USER picks {time, difficulty, goal/domains, location, intent}
  │  (5 UI entry points — §2)
  ▼
generateHomeWorkout()  or  generateHomeWorkoutTrio()      home-workout.service.ts:199 / 529
  │  generateHomeWorkout → runs trio, returns options[0] if targetDifficulty set, else options[1] (D2)   :202-206
  ▼
_buildSharedPipeline(options)                             home-workout.service.ts:1026
  │  • availableTime = options.availableTime ?? 30        :1033   ← user's time enters here
  │  • resolve effective profile, program filters, domains, split-decision (dominance, dailySetBudget)
  │  • periodization: derivePeriodizationWeek + resolveSessionPolicy(cycleWeek, daysInactive)  :1454
  │  • ContextualEngine.filterAndScore(...)  → scored pool (ONCE, shared by all 3 options)
  │  • baseGeneratorContext.availableTime = availableTime :1824   ← last place user's time is intact
  ▼
TRIO LOOP  i=0..2  (D1 flow / D2 balanced / D3 intense)   home-workout.service.ts:626
  │  • skip non-matching i when targetDifficulty set (custom builder)  :630
  │  • boltDurationCap = BOLT_DURATION_CAPS[difficulty]   :673   {1:30, 2:45, 3:60}
  │  • optionContext.availableTime = boltDurationCap      :679   ★ USER TIME OVERWRITTEN ★
  │  • i===2 → force pyramid protocol p=1.0               :699
  ▼
  PipelineOrchestrator.run(pool, optionContext)           PipelineOrchestrator.ts:117
  │  1. empty-pool guard → buildRestDayFallback           :126
  │  2. StructureDirector.plan() → blueprint{strategy, blocks, protocolHints, budgetConstraints}  :141
  │       strategy = _detectStrategy(requiredDomains):  0/≥3→full_body · 1→single_domain · 2+push&pull→antagonist_split · 2-other→single_domain   StructureDirector.ts:87
  │  2b. domain-strict pool filter (single_domain, non-master) filterForDomain ±3   :198-253
  │  3. profileStale guard (all levels ≤1)                :267
  ▼
  WorkoutGenerator.generateWorkout(filteredPool, context) WorkoutGenerator.ts:417   ← the real brain
  │  a. resolveEffectiveDifficulty (first-session→D1, detrain 3→2, deload W5 3→1, peak W4 1→2)  :438 → InputSanitizer:478
  │  b. Active-recovery guard (cooldown/warmup/flex only) :450
  │  c. getExerciseCountForDuration(availableTime)  ← reads BOLT cap, not user time  :475
  │  d. variety jitter (0-51) + Master-Synergy scoring     :477-489
  │  e. applyDifficultyFilter + Bolt-2 / Bolt-1 level ceilings  :492-640
  │  f. selectExercises router: dominance | domain-quota+rescue | difficulty  :1451
  │  g. MG-Diversity pass (max 1 per strict MG, backfill)  :675-770
  │  h. BudgetDistributor.distribute() = assignVolume → maxSets → weekly → daily → rebalance(+) → skill/balanced cluster caps(+)  :786
  │  i. David Rule rescue (substitute under-level exercises) :796
  │  j. selectProtocol (straight/antagonist_pair/pyramid/emom by admin prob)  :929 → :1520
  │  k. runAllGuarantees: Horizontal → VerticalFoundation → FullBodyDomain  :1003 → GuaranteePassRunner
  │  l. Legs cap (full-body ≤2 legs)                       :1011
  │  m. Time-Volume Feedback loop: compress sets until ≤ availableTime+3  ← reads BOLT cap  :1088
  │  n. determineStructure/blast, mechanical balance, stats  :1128-1140
  ▼
  Orchestrator Step 4b: BudgetDistributor.reapplyCaps(main, budgetConstraints)  PipelineOrchestrator.ts:309  ← authoritative SET cap (not time)
  ▼
back in TRIO LOOP:
  • prependWarmupExercises (David Scale ladder, ≤6 min)   :723 → warmup.service.ts
  • appendCooldownExercises (2-3 static stretches)        :735 → cooldown.service.ts
  • post-process: applyIntenseOption(D3) / applyFlowRegression(D1) / tag prefs  :742
  • enforceVolumeCap({durationCap: boltDurationCap})      :767 → PresentationFormatter.ts:418  ★ final TIME cap = BOLT cap ★
  • resolve metadata (title/desc/cue) from Firestore      :772
  ▼
HomeWorkoutTrioResult → UI (generateHomeWorkout returns one option)
```

**Two ordering facts worth internalizing:**
- The user's requested **time** is discarded at the top of the trio loop (`:679`); every downstream
  time guard (feedback loop `WorkoutGenerator.ts:1088`, final cap `:767`) sees the **bolt constant**.
- **Set** budget and **time** budget are enforced by *different* passes: sets by
  `BudgetDistributor`/`reapplyCaps` (level + weekly budget driven), minutes by
  `enforceVolumeCap` (bolt-constant driven). Neither is a function of the user's requested minutes.

---

## 2. Entry-Point Comparison (6 real entries)

| Entry point | Fn called | availableTime source | difficulty source | Divergence |
|---|---|---|---|---|
| **StatsOverview.tsx** (home trio) | `generateHomeWorkoutTrio` (:803) | Hardcoded `condensedTime = lateNight ? 15 : 60` (:653) | none — trio assigns all 3 bolts | Passes 60 *deliberately* to size pool for Bolt-3; per-bolt caps trim each. Correct by design. |
| **WorkoutBuilderSheet.tsx** (custom builder) | `generateHomeWorkout` (:589) | **User slider/buttons** `[15,30,45,60]` (:64, default 45 :242) | User bolt → passed as `difficulty` **and** `targetDifficulty` (:593-594), `isManualOverride:true` | **The 15→45 bug locus.** User time is real but discarded at service `:679`. |
| **UserWorkoutAdjuster.tsx** | `generateHomeWorkout` (:125) | User slider, default 30 (:68) | User bolt (:70) — **no `targetDifficulty`** | `generateHomeWorkout` returns `options[1]` (D2) when `targetDifficulty==null` (:206) → **user's chosen difficulty is silently ignored** unless it's 2. |
| **admin/workout-simulator/page.tsx** | `generateHomeWorkoutTrio` (:423) | User slider, default 30 (:255) | User selector, default 2 — no `targetDifficulty` | `testLocation` bypass, mock profile. Full trio. Best tool to capture a real `pipelineLog`. |
| **admin/simulator/page.tsx** | **`createWorkoutGenerator().generateWorkout()` directly** (:318) | User selector, default 45 (:175) — flows **unmodified** into generator | **not passed** → generator default | **Bypasses the entire service**: no trio, no `BOLT_DURATION_CAPS`, no warmup/cooldown, no `enforceVolumeCap`. Second parallel generation path. **This is the only path where `availableTime` is honored end-to-end.** |

---

## 3. Rule Inventory (by pipeline stage)

### 3A. Input normalization & difficulty resolution
| Rule | file:line | Trigger / effect |
|---|---|---|
| `normalizeEquipmentArray` / `buildActiveProgramFilters` / `resolveExercisePool` | `InputSanitizerMiddleware.ts:86 / 181 / 341` | Canonical gear IDs; skill-sibling program-filter expansion (forward + inverse); ±3 pre-pool level filter (abandons if <4 survive, :443) |
| `resolveEffectiveDifficulty` (final authority) | `InputSanitizerMiddleware.ts:478` | Order: firstSession→**1** (:485) · detrainingLock & D3→**2** (:489) · deload W5 & D3→**1** (:496) · peak W4 & D1→**2** (:501). No re-derivation downstream. |
| `InputSanitizerMiddleware` does **NOT** touch `availableTime` | — | Confirmed: no time clamping anywhere in the sanitizer. |

### 3B. Eligibility / level / tier filters — `ContextualEngine.filterAndScore` cascade (`ContextualEngine.ts:137-293`, in this order)
| # | Filter | file:line | Condition |
|---|---|---|---|
| 1 | Strict program filter | :140 | exercise matches none of `activeProgramFilters` |
| 2 | Level tolerance ±N (default 3) | :163 | `programLevel` outside `userLevel ± tol` |
| 3 | Exclusive skill-domain gate | :184 | all targetPrograms are gated skills (`GATED_SKILL_DOMAINS=['muscle_up']`) w/ no baseline overlap, skill not active |
| 4 | Balance-score gate | :216 | `balanceScore>10` unless handstand/hspu active |
| 5 | Skill gate (elite) | :234 | skill-tagged or `programLevel>15` while user effective `<15` |
| 6 | **Injury shield** (hard) | :248, 442 | any overlap `exercise.injuryShield ∩ user injuries` |
| 7 | 48h muscle shield | :254, 457 | primary/secondary muscle ∈ `excludedMuscleGroups` (habit-builder only) |
| 8 | Field mode | :260, 467 | `intentMode==='field'` → no-equipment/`fieldReady` only |
| 9 | Location / method match | :268, 509 | no viable `ExecutionMethod` for location → exclude |
| 10 | Park equipment gating | :552 | park: strict gear match, **no home fallback** |
| 11 | Sweat limit | :275 | `sweatLevel > limit` (skipped: `bypassLimits` park / `blast`; `on_the_way`→limit 1) |
| 12 | Noise limit | :285 | `noiseLevel > limit` (skipped: park `bypassLimits`) |

**Soft scoring** (`ContextualEngine.ts:664-733`): lifestyle **+2/tag** (:675) · level proximity **`max(0, 3−|Δ|)`** (:693, clamps to 0 — no directional distinction) · blast compound +3 / hybrid +2 / hiit tag +2 · video **+1** (:722) · SA excess **−5×(count−2)** (:783). These match the Truth doc.

**Tier resolution** (`resolveTier(Δ)`, `workout-generator.types.ts:64`): Δ≥+2 **elite** · +1 **hard** · 0 **match** · −1/−2 **easy** · ≤−3 **flow**. Each tier sets reps/hold/rest/sets (`workout-generator.types.ts:50-56`) — see §3D.

### 3C. Selection & diversity
| Rule | file:line | Trigger / effect |
|---|---|---|
| Selection router | `WorkoutGenerator.ts:1451` | dominance (if dominanceRatio+skillIds+dailySetBudget) → else domain-quota+rescue → else difficulty band |
| Bolt selection band | `workout-selection.utils.ts:401` | D3→[0,+1] · D2→[−1] · D1→[−2]; relax ±1 then overflow |
| Domain Rescue | `workout-selection.utils.ts:527` | per required domain empty after ±3 → inject (exact→±3 bolt→±5 muscle, vertical-preferred), score 0 |
| MG-Diversity | `WorkoutGenerator.ts:675` | multi-domain: max 1 per strict MG (`STRICT_MG_MAX=1`), foundation wins slot, backfill; single-domain: slug-dedup only |
| Session blacklist | `home-workout.service.ts:652` | options 2 & 3 penalize prior options' IDs (−50) |

### 3D. Volume, rest & caps
| Rule | file:line | Numbers |
|---|---|---|
| Base sets by level | `workout-budgeting.utils.ts:43` | L1-5→2, L6-12→3, L13-20→4, L21+→5 |
| Difficulty volume | `workout-budgeting.utils.ts:85` | D1 sets 3 reps 10-12 · D2 sets 3-4 reps 6-8 · D3 sets 4-5 reps 1-6 |
| David Staircase reps | `workout-budgeting.utils.ts:156` | progress-aware (match <50%→2-4, ≥50%→4-6; easy 6-8; flow 10-12) |
| SkillCeiling | `workout-budgeting.utils.ts:759` | `SKILL_REP_CEILING=5` for skill/hard/elite |
| HistoryFloor | `workout-budgeting.utils.ts:192` | never below last session reps (discard outliers ≥100 or >3×max) |
| **TIER rest table (LIVE)** | `workout-generator.types.ts:50` | elite **180-240** · hard **150-180** · match **120-150** · easy **90-120** · flow **60-90**; blast ×0.5; floor = min×0.7 |
| Isometric hold cap | `workout-budgeting.utils.ts:1045` | T1 handstand/hang **45s** · T2 planche/lever/pullup or L≥8 **15s** · T3 default **45s** |
| Inactivity / deload volume | `workout-budgeting.utils.ts:240` | inactivity ×0.60 (−40%, >3 days) · peak W4 ×1.2 · deload W5 ×0.5 · weekly-usage>75% up to −30% |
| maxSets hard cap | `BudgetDistributor.ts:171`, `lead-program.service.ts:74` | L≤5→20, L≤12→24, else 28 |
| weekly budget cap | `BudgetDistributor.ts:182`, `useWeeklyVolumeStore.ts:207` | `max(4, userLevel×2)` |
| dailySetBudget cap | `BudgetDistributor.ts:192`, `SplitDecisionService.ts:445` | weekly ÷ schedule days; manual-builder floor **14** |
| `_rebalanceSets` (**raises**) | `BudgetDistributor.ts:238` | fills to dailyBudget, stacks up to tier max (elite/hard 5, match 4) |
| Skill cluster cap (**raises**) | `BudgetDistributor.ts:388` | D3 skill: ≤4 main, up to 5 sets each |
| Balanced cluster cap (**raises**) | `BudgetDistributor.ts:503` | D2: 3 main (4 if ≥3 domains), up to 4 sets each |
| `enforceVolumeCap` (time) | `PresentationFormatter.ts:418` | if est. min > `durationCap`: Phase A remove core→isolation→extra legs, Phase B trim sets to floor 2 |
| Time-Volume Feedback | `WorkoutGenerator.ts:1088` | compress sets while `dur > availableTime+3` (max 20 iters) |
| `calculateEstimatedDuration` | `workout-budgeting.utils.ts:908` | main: `sets×reps×secPerRep(3)×side` work + `sets×restSeconds` (uncapped) rest; warmup ≤6 min; cooldown 90s/slot; 30s transitions |

### 3E. Guarantees & rescue (run AFTER budget)
| Rule | file:line | Trigger / effect |
|---|---|---|
| Horizontal Guarantee | `GuaranteePassRunner.ts:82` | full_body: ensure ≥1 horizontal_push & horizontal_pull (add or swap, ±2→±6 substitute) |
| Vertical Foundation Guarantee | `GuaranteePassRunner.ts:257` | non-single-domain: ≥1 foundation in vertical_pull & vertical_push |
| Full-Body Domain Guarantee | `GuaranteePassRunner.ts:404` | full_body: ≥1 exercise per push/pull/legs |
| Legs cap | `WorkoutGenerator.ts:1011` | full_body: `MAX_LEGS_FULL_BODY=2` |
| David Rule (over-level inject) | `trio-modifiers.service.ts:320` | D3 intense card: if nothing above level, inject +1..+3 (else +20% reps fallback) |
| Level clamp on all guarantees | `GuaranteePassRunner.ts:131,312,475` | injected `programLevel` clamped to `domainLevel+6` (can bypass the normal difficulty filter — see §5A) |

### 3F. Protocols & structure
| Protocol | selected at | condition | processor | eligibility gate |
|---|---|---|---|---|
| straight (default) | `WorkoutGenerator.ts:1532` | D1 always; or no preferred; or roll > prob | none | — |
| antagonist_pair | `:1567` | in admin `preferredProtocols` & roll ≤ prob | `antagonist-pair.processor.ts:14` | none |
| pyramid | `:1567` | in admin list & roll ≤ prob; **forced p=1.0 on D3 trio** (`home-workout.service.ts:699`) | `pyramid.processor.ts` | surgical: 1 target, upper compound/skill MG — **no isometric exclusion** |
| emom | `:1573` | in admin list & roll ≤ prob | **none** (registry commented out) | **NONE — isometric max-hold can enter freely** |
| amrap / circuit | `determineStructure :1633` | blast mode (amrap) / `≤3 ex & ≤15 min` (circuit) | none | — |
| **tabata** | — | **DOES NOT EXIST** | — | — |
| superset | type-only | never selected → degrades to straight | none | — |

Structure type = `standard|emom|amrap|circuit` (no tabata). Blast (`intentMode`) → emom/amrap 50/50 + interval seconds (`getBlastModeDetails :1638`, the only place work/rest intervals are stamped). Field mode → pool filter + cue text only, no structure change.

### 3G. Periodization / deload / detraining (`periodization.service.ts`)
Cycle week = `(ceil((daysSinceStart+1)/7) % 5) || 5`. Gap overrides cycle:
`gap≥21`→Rebuild (vol×0.5, restart cycle) · `7<gap<21`→Long-gap deload (vol×0.5) · `3<gap≤7`→Detraining (detrainingLock, vol×0.40) · cycle W5→Deload (vol×0.5, protocol×0) · cycle W4→Peak (**vol×1.2**, protocol×1.5) · W1-3→Build.

### 3H. Warmup / cooldown
Warmup: David-Scale weighted ladder, ≤6-min block, mandatory legs slot (`warmup.service.ts:451`). Cooldown: 2-3 static stretches, muscle-match scored, multi-tier fallback (`cooldown.service.ts:24`).

---

## 4. `availableTime` End-to-End Trace (the disconnect)

| Hop | file:line | What happens to the value |
|---|---|---|
| 1. User picks time | `WorkoutBuilderSheet.tsx:64,242,829` | 15/30/45/60 or slider → `availableTime` state |
| 2. → service | `WorkoutBuilderSheet.tsx:592` | `generateHomeWorkout({availableTime, targetDifficulty})` |
| 3. destructure | `home-workout.service.ts:1033` | `availableTime = options.availableTime ?? 30` — **user 15 survives** |
| 4. base context | `home-workout.service.ts:1824` | `baseGeneratorContext.availableTime = 15` — **last intact** |
| 5. **trio override** | `home-workout.service.ts:673,679` | `availableTime = BOLT_DURATION_CAPS[difficulty]` — **15 → 45 (D2)** |
| 6. pool sizing | `WorkoutGenerator.ts:475` | `getExerciseCountForDuration(45)` → 6-8 exercises (never sees 15) |
| 7. feedback loop | `WorkoutGenerator.ts:1088` | compress to `45+3`, not `15+3` |
| 8. warmup/cooldown | `home-workout.service.ts:723,735` | **adds** time (≤6 min warmup + 2-3 cooldowns) |
| 9. **final cap** | `home-workout.service.ts:767` → `PresentationFormatter.ts:427` | `durationCap=45`; est ≈45 ≤ 45 → **no trim**; `estimatedDuration=45` displayed |

**Root cause:** the requested minutes are honored **nowhere** in the trio path. `enforceVolumeCap`
is not buggy — it faithfully enforces whatever cap it is handed; the caller hands it the bolt
constant (`:769`) instead of `options.availableTime`. `getExerciseCountForDuration` also folds 15
and 30 into adjacent buckets (`DURATION_SCALING` 5/15/30/45/60 → 2-3/4-5/5-6/6-8/7-10,
`workout-budgeting.utils.ts:35`), so even without the override, 15 vs 30 barely differ.
**Fix locus:** `home-workout.service.ts:673-679` + `:767-770` — but the *product rule* ("does
Balanced always mean 45 min regardless of requested time?") is David's call.

---

## 5. Contradictions / Duplications / Dead Code / Gaps / Magic Numbers

### 5A. Contradictions / order conflicts
- **Guarantees add legs → Legs Cap removes them.** `FullBodyDomainGuarantee` may inject a 3rd legs exercise (`GuaranteePassRunner.ts:434`); the next pass caps legs at 2 (`WorkoutGenerator.ts:1027`) and can drop what was just added.
- **Guarantees run AFTER the budget cap** (`:1003` after `:786`) and clamp injected level to `domainLevel+6` (`GuaranteePassRunner.ts:131`) — a guarantee can inject an exercise the difficulty/level filter would have excluded, and only masks its displayed level. Intentional override, but a real filter-bypass.
- **Cluster caps raise volume after trims lower it.** `_rebalanceSets`/skill-cluster/balanced-cluster (`BudgetDistributor.ts:238/388/503`) stack sets back up to `dailySetBudget` after Steps 3-5 trimmed them. Net = dailyBudget regardless.
- **First-workout says D2 but outputs D1.** `first-workout.service.ts:216` sets `difficulty:2, isFirstSessionInProgram:true`; the sanitizer forces D1 (`InputSanitizerMiddleware.ts:485`). The comment is misleading.
- **Blast sweat: display "≤3" vs actual "uncapped".** `ContextualEngine.ts:372` (UI label) vs `:276` (skips the check entirely).

### 5B. Duplications
- **Level tolerance applied in 4 places** with independently-resolved user levels: pre-filter (`InputSanitizerMiddleware.ts:386`), ContextualEngine (`:167`), `filterForDomain` (`PoolFactory.ts:381`), substitute finder radii `[2,4,6]` (`PoolFactory.ts:221`). Can produce divergent verdicts on the same exercise.
- **Rest authored 4 ways:** TIER_TABLE (live, `workout-generator.types.ts:50`) · `RestCalculator.ts:88` (**dead**, diverges at endurance 45-60 & static 120-180) · `adaptive-rest.service.ts:50` (runtime nudges) · `RestCalculator.getRecommendedSetsForHold:306` (**dead**). Skill/strength agree; endurance/static diverge.
- **Skill-parent maps declared 3× and diverge:** `SKILL_SIBLINGS`/`SKILL_PARENT` (`InputSanitizerMiddleware.ts:250`), `DOMAIN_ALIAS/PARENT_MAP` (`workout-selection.utils.ts:26`), `PUSH/PULL_SKILL_SLUGS` (`PipelineOrchestrator.ts:177`). `one_arm_pullup`/`handstand_pushup` appear in only one.
- **selectProtocol & selectPyramidTargets duplicated** in live `WorkoutGenerator.ts:1520/144` and dead `ProtocolInjector.ts:233/74` — and already diverged (live pyramid = exactly 1 target; dead = 1-or-2; dead adds a single-domain D3 floor the live path lacks).
- **Static-skill 15s hold cap** authored twice (`workout-budgeting.utils.ts:1087` & `PresentationFormatter.ts:90`); `restSafetyFloor` 0.7 twice (`workout-generator.types.ts:73` & `adaptive-rest.service.ts:55`); warmup pattern-map twice (`warmup.service.ts:65` & `trio-modifiers.service.ts:88`).

### 5C. Dead / unreachable code
- **`ProtocolInjector` (entire module)** — never called; `PipelineOrchestrator` imports only `StructureDirector`. Its `forcePyramidOnSingleDomainIntense` hint (`StructureDirector.ts:372`) is consumed only by the dead injector, so that single-domain D3 pyramid floor **never fires**.
- **`RestCalculator` (entire class + `getSimpleRestByReps`, `getRecommendedSetsForHold`)** — no import in the generation path. **OPEN QUESTION:** confirm no live *player/runner* consumes it before trusting its numbers.
- **`useModularPipeline` flag** — declared (`workout-generator.types.ts:328`) but **never set true**; comments claim "modular path is the only path" yet `reapplyCaps` exists to fix the "legacy path". Vestigial.
- **`superset`/`dropset`/`rest_pause` set types** — configurable/typed but no processor emits them → silently become straight sets.
- **`ContextualEngine.getExerciseLevel` (private)** dead (`:754`); `LocationConstraints.requireFieldReady` declared, never set/read; `ON_THE_WAY_MAX_DURATION` used only for a UI label; `global-training-config.service.ts` `@deprecated`.
- **Warmup Part C** decommissioned (`warmup.service.ts:447`).

### 5D. Gaps (scenarios with no rule / no fallback)
- **ContextualEngine has NO empty-pool self-rescue.** If hard filters empty the pool it returns `[]`; PoolRescue only fires for `single_domain` (`PoolFactory.ts:95`), so an emptied **full_body/multi-domain** session gets no pool-level rescue. Park strict-rejection also has no fallback. The only backstops are the pre-filter `<4` abandon (`InputSanitizerMiddleware.ts:443`) and the orchestrator's rest-day fallback (`PipelineOrchestrator.ts:126`).
- **A user-requested duration below 30 min cannot be expressed** in the trio path (all three bolts are ≥30). No scope×time combo maps a genuine 15-min intent to a 15-min plan except via `admin/simulator`.
- **UserWorkoutAdjuster difficulty is dropped** (returns D2, §2). No rule honors it.
- **EMOM has no exercise-eligibility gate and no interval numbers** in the admin-selected path — the nearest thing to the reported "isometric-in-Tabata" bug.
- **48h muscle shield only applies to habit-builder sessions** (`SplitDecisionService.ts:511`) — advanced users get no 48h protection.

### 5E. Magic-number master table (highest-signal)
| Value | file:line | Meaning |
|---|---|---|
| `{1:30, 2:45, 3:60}` | `home-workout.service.ts:499` | BOLT_DURATION_CAPS — **overrides user availableTime** |
| `availableTime ?? 30` | `home-workout.service.ts:1033` | service default duration |
| `TIME_TOLERANCE_MINUTES=3`, maxIter 20 | `WorkoutGenerator.ts:1089` | feedback-loop slack |
| `minSets=2`, maxIter 30 | `PresentationFormatter.ts:422` | enforceVolumeCap floor |
| `DURATION_SCALING 5/15/30/45/60 → 2-3/4-5/5-6/6-8/7-10` | `workout-budgeting.utils.ts:35` | exercise count per duration bucket |
| `INACTIVITY_THRESHOLD_DAYS=3`, `_VOLUME_REDUCTION=0.40` | `workout-budgeting.utils.ts:82` | reactivation cut |
| peak `×1.2` / deload `×0.5`; gaps `3/7/21`; SA cap `0.15` | `periodization.service.ts:101-108,197,206` | periodization |
| maxSets `20/24/28` | `lead-program.service.ts:74` | level-tier hard set cap |
| weekly `max(4, level×2)` | `useWeeklyVolumeStore.ts:207` | weekly set budget |
| dominance `0.65/0.35`, `0.5/0.3/0.2`, `0.5/0.5` | `split-decision.types.ts:151`, `SplitDecisionService.ts:542,547` | P1/P2/P3 set split |
| `MAX_STRAIGHT_ARM_PER_SESSION=2`, penalty `−5` | `ContextualEngine.ts:68,783` | SA balance |
| `SKILL_GATE_MIN_LEVEL=15`, `BALANCE_GATE_THRESHOLD=10` | `ContextualEngine.ts:234,217` | skill/balance gates |
| default tolerance `3`, expanded `5`, `MIN_HEALTHY_POOL=6` | `ContextualEngine.ts:113`, `PoolFactory.ts:44,47` | level tolerance |
| isometric caps `15/45`, handstand `60`, trio clamp `20`, presentation `15` | `workout-budgeting.utils.ts:1087,1092`; `trio-modifiers.service.ts:373`; `PresentationFormatter.ts:90` | hold ceilings (3 divergent values) |
| `SKILL_REP_CEILING=5`, `MAX_LEGS_FULL_BODY=2`, `STRICT_MG_MAX=1`, `±6` guarantee clamp | `workout-budgeting.utils.ts:774`; `WorkoutGenerator.ts:1023,686`; `GuaranteePassRunner.ts:131` | selection caps |
| `MANUAL_BASELINE_SETS=14`, `DEFICIT_THRESHOLD=0.4` | `SplitDecisionService.ts:459,310` | custom builder |

> ❌ **Confirmed absent:** no `170s` constant, no `10s`/`30s` isometric hold cap anywhere. The prompt's
> "170s/10s/30s magic seconds" do not exist — real hold caps are **15s / 20s / 45s**; the `30` that
> exists is `BLAST_MODE_REST_SECONDS` (rest, not a hold).

---

## 6. Open Questions for David
1. **Should a user-requested duration ever mean what it says?** The whole trio architecture treats caller time as a pool-size hint and overrides it with the bolt constant. Fix is small (`home-workout.service.ts:673-679, 767-770`) but the product rule (Balanced = always 45?) is a decision.
2. **The "isometric-in-Tabata" bug** cannot be reproduced — Tabata does not exist. Is this a pre-removal artifact, or does "Tabata" mean EMOM/AMRAP loosely? EMOM currently has no eligibility gate.
3. **Is `RestCalculator` / `ProtocolInjector` intended to be live?** Both are fully built, documented as the pipeline's stage, and dead. Wiring them in would silently change behavior (diverged logic).
4. **UserWorkoutAdjuster** dropping the chosen difficulty — bug or intended (it's an "adjuster")?
5. **Which of the 4 level-tolerance passes / 3 skill-parent maps / 4 rest tables is authoritative?** They diverge; the test-lock needs one source.
6. **Empty-pool for full_body** has no rescue — acceptable, or add a PoolRescue branch?

---

## 7. Verification path (recommended next step, not yet done)
Run one workout each through `admin/workout-simulator` at {15 min, D2} and {60 min, D3},
capture `workout.pipelineLog[]`, and diff against §1. That converts this static map into a
runtime-confirmed one before any test lock is written.
