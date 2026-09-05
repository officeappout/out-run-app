# 09-CORE-TABATA.md — Core Block as a 3-Form Repertoire: Mapping + Plan

> Scope: mapping and planning only. **No code changed in this pass.** Builds on
> `docs/workout-engine/08-CORE.md` (the live-session suggestion path + rule audit) and
> `01-MAP.md` §9. Read those first.

## David's decision (verbatim, for reference)

The core block is not locked to one shape. Three forms are allowed, and the variety between
them is the point:
- **(A)** One core exercise × 2-3 sets — the existing shape.
- **(B)** A tabata block with 2+ core exercises — no hard ceiling; exercise count follows
  remaining time.
- **(C)** A single follow-along tabata catalog item that replaces the block entirely. The ladder
  already exists: "טבטה" (core L4), "טבטה +" (L8), "טבטה מאתגר" (L12), "טבטה מאתגר +" (L16) —
  chosen by the user's core level.

The exact-2-sets lock (commits `e862ae9f` + `516a90df`) is **not removed** — it opens to 2-3
sets, because it only ever governed form A. Non-core paths are untouched.

---

## 1. How `buildTabataBlock` works today

### 1.1 Who calls it, and under what gate

`buildTabataBlock` has exactly one live call site in the generator, `WorkoutGenerator.ts:1130-1132`
(a second call site, `core/methods/tabata.method.ts:55`, exists but is a leftover from an earlier
protocol-dispatch shape — not reached from the live `generateWorkout()` flow, worth confirming
dead/verifying before this feature touches it).

It is **not** the main protocol (antagonist-pair, pyramid, superset). It is a wholly separate,
independently-rolled **finisher** (`WorkoutGenerator.ts:1117-1132`, "Step 6b"):

```ts
const tabataP = context.tabataProbability ?? 0;
const fireTabata =
  tabataP > 0 &&
  difficulty >= 2 &&                                    // never Bolt-1/regression
  (context.userLevel ?? 0) >= MIN_TABATA_USER_LEVEL &&   // = 4
  Math.random() <= tabataP;
const tabataBlock = fireTabata ? buildTabataBlock('tabata', workoutExercises, context) : undefined;
```

`context.tabataProbability` resolves from `programLevelSettings` via a level band
(`tabata-finisher.utils.ts`, mirrored in `scripts/tabata-kill-switch.ts`'s own copy): ≤6→12%,
≤10→15%, ≤14→18%, ≤18→20%, 19+→22%. It rides **alongside** whatever main protocol won that
session's separate lottery — a workout can have both a pyramid main block and a tabata finisher.

### 1.2 Where exercises come from — two paths, one is "the production path"

`buildTabataBlock` branches on whether `context.tabataPool` was provided
(`home-workout.service.ts:2382`: `allExercises.filter(ex => ex.tags?.includes('hiit_friendly'))`
— the full, ContextualEngine-**unfiltered** catalog, tag-matched only):

- **Pool-injection** (`buildTabataFromPool`, `tabata.block.ts:202-285`) — the generator's own
  comment calls this "the production path." Selects 2-4 members from the dedicated
  `hiit_friendly` pool (curated by `scripts/audit-tabata-conditioning.ts` to dynamic
  conditioning movements only — no holds, no slow strength), filtered to `poolLevelOf(ex) <=
  userLevel` (level-less defaults IN) and to whatever `selectMethodForContext` resolves for the
  session's real location/gear (drops candidates the location can't serve). **PUSHES** new
  `WorkoutExercise` entries onto the workout — additive, independent of which strength mains got
  picked.
- **Mains-subset fallback** (the inline logic in `buildTabataBlock` itself, `:96-140`) — used only
  when no pool is supplied (unit tests, or a missing pool). Filters the **already-selected**
  mains by eligibility (must carry `hiit_friendly`, not over-level, not elite-tier, isometric cap
  ≥ 20s, not a hard-tier hold) and finds the best-scoring subset among them — reuses existing
  slots, doesn't add exercises.

**Neither path checks injury shield.** The pool itself
(`home-workout.service.ts:2382`) is drawn from `allExercises` directly, bypassing
`ContextualEngine`'s injury-exclusion filter entirely — a real, confirmed gap (same shape as the
`GuaranteePassRunner.globalExercisePool` gap `01-MAP.md`'s Gaps section already flagged for a
different subsystem). Worth fixing alongside this feature, not folding into a form-selection
change without calling it out separately.

### 1.3 `TABATA_CLASSIC` and the composition rule

```ts
// tabata.constants.ts
export const TABATA_CLASSIC = { workSec: 20, restSec: 10, rounds: 8 }; // 12.07.2026, NOT admin-editable
export const TABATA_BLOCK_SECONDS = (20 + 10) * 8; // 240s, fixed regardless of member count
export const TABATA_MIN_EXERCISES = 2;
export const TABATA_MAX_EXERCISES = 4;              // ← the hard ceiling form B removes
```

**The block's total wall-clock cost (240s) does not change with member count.** What changes is
how many times each member gets visited: `tabataIntervalCost(symmetry)` costs 1 interval
(bilateral) or 2 (unilateral, right+left as consecutive intervals), and the composition search
(`tabata.block.ts:109-126`, `pickTilingSubset` for the pool path) requires the **sum** of member
costs to exactly divide `rounds` (8) — valid bilateral-only member counts today are 2 or 4 (since
`TABATA_MAX_EXERCISES=4` blocks 8), giving 4 or 2 visits per member respectively.

**⚠️ Flag for §2: "no hard ceiling, count follows remaining time" needs one clarification before
implementation.** Under the current architecture, "remaining time" cannot make the *block itself*
longer — `TABATA_CLASSIC` is David's own prior decision, explicitly "not admin-editable in v1."
Two different things could satisfy the stated intent, and they're not the same change:
- **(i)** Relax `TABATA_MAX_EXERCISES` toward 8 (still tiling `rounds=8`, i.e. bilateral members
  each visited once instead of 2-4 times) — more variety, same 240s, no new time-scaling logic.
- **(ii)** Actually scale `rounds` (and therefore total block duration) with remaining time — a
  real architectural change reopening the "fixed classic shape" decision from 12.07.2026.
Presented as an open question in §2/§5, not assumed.

### 1.4 Marking, through to the player

Return value is `TabataBlockSpec = {config: TabataProtocolConfig, exerciseIds: string[]}`,
attached to `GeneratedWorkout.tabataBlock` (`WorkoutGenerator.ts:1256`). Two independently
duplicated mapper files (`buildRunnerWorkoutPlanFromGenerated.ts:202-249` and
`workout-plan.mapper.ts:159-191` — the same pre-existing duplication `01-MAP.md` §10.2 already
documents for the base plan-mapping, now confirmed to extend to the tabata step too) both:
1. `partitionByTabataBlock(allMainExercises, gw.tabataBlock)` (`tabata.block.ts:294-313`) — splits
   mapped mains into `{tabata, rest}` by ID lookup. If fewer than `TABATA_MIN_EXERCISES` survive
   (e.g. a swap removed a member), the block **dissolves back into straight sets** — a real,
   already-existing degradation path worth keeping for forms B/C too.
2. Build a dedicated `seg-tabata` station segment (title "טבטה — פיניש", icon 🔥,
   `target:{type:'time', value: (workSec+restSec)*rounds}`, `restBetweenExercises:0` since the
   in-block rest is the state machine's clock's job) with `protocol:'tabata'` and
   `protocolConfig: tabataCfg` — this `segment.protocol` field is what
   `resolveBlockProtocol()`/`compute-advance.ts` (`01-MAP.md` §10.4) reads to dispatch
   `tabata.advance.ts`'s round-robin logic. **Architecturally a separate station from `seg-main`**,
   not interleaved.

### 1.5 What's generic vs. finisher-specific

| Generic (reusable for B/C) | Finisher-specific (form-B-only today) |
|---|---|
| `TABATA_CLASSIC`, `TABATA_BLOCK_SECONDS`, `tabataIntervalCost` | The 2-4 exercise-count ceiling (`TABATA_MIN/MAX_EXERCISES`) |
| `segment.protocol='tabata'` + `protocolConfig` marking convention | `context.tabataProbability` roll being the ONLY trigger (form selection needs its own layer on top — §2) |
| `partitionByTabataBlock`'s degrade-to-straight-sets safety net | The `hiit_friendly` pool + its injury-shield gap (§1.2) — a single follow-along item (form C) doesn't need a *pool* at all, just one resolved exercise |
| Player-side `tabata.advance.ts` round-robin dispatch (reads `segment.protocol`, doesn't care how many members or where they came from) | `buildTabataFromPool`'s multi-candidate composition search — irrelevant to form C (one fixed catalog item, no search) |

### 1.6 The 4 follow-along items — special handling, or plain exercises?

Queried live (Firestore `exercises` collection, `office@appout.co.il` service account):

| Name | id | Level | `exerciseRole` | `isFollowAlong` | `movementGroup`/`primaryMuscle` | Clip duration | Location |
|---|---|---|---|---|---|---|---|
| טבטה | `ZHf9ELBPf9NpASCygL1n` | core L4 | `reinforcement` | `true` | core / abs | 240s | home, `locationMapping:[]` |
| טבטה + | `WLP7RzGley7svZbbIzAW` | core L8 | `reinforcement` | `true` | core / abs | 240s | park |
| טבטה מאתגר | `nbEECAsr8OciKBVbKkET` | core L12 | `reinforcement` | `true` | core / abs | 240s | park |
| טבטה מאתגר + | `jbwq5lw6oIF0G6vDJ1D9` | core L16 | `reinforcement` | `true` | core / abs | 240s | park |

(Note: the L16 item's real name has a space — "טבטה מאתגר +", not "טבטה מאתגר+".)

**They are not plain exercises today — and they're currently unreachable by the normal generator,
for a reason unrelated to level.** `targetPrograms[0].programId` resolves (`programs` doc
`kDMpobbKsuVTByTIKUpe`, `slug:'core'`) to a real, positive core level each — they'd **pass**
`hasExplicitCoreLevel`/the §12.3 gate cleanly if reached. But `exerciseRole:'reinforcement'` is
not `'main'`/`'warmup'`/`'cooldown'` — every selection site in the pipeline
(`ContextualEngine`/`PoolFactory`/`selectExercisesWithDomainQuotas`/the tabata paths above) filters
to `exerciseRole==='main'` (undefined treated as main; `'reinforcement'` is neither). **These 4
items sit structurally outside the generator entirely right now** — not filtered out by level or
tags, just never candidates in the first place. Their 240s clip length matches
`TABATA_BLOCK_SECONDS` almost exactly (they run 4-9s over, consistent with a real recorded video
vs. the idealized 240s target) — strongly suggesting they were authored *for* exactly this
feature, sitting ready but unwired.

Two data-quality items to verify before wiring form C, not blocking the plan but worth a checklist
line: (a) `mainVideoUrl` is `null` on all 4 — only `media.previewVideo.he` carries a real
Bunny `videoId`; confirm which field `ExerciseVideoPlayer`'s `hasValidDirectVideoUrl` actually
reads before assuming playback works out of the box. (b) "טבטה" (L4) has `location:'home'` with
an **empty** `locationMapping` array, while the other 3 have `locationMapping:['park']` — an
inconsistent location-coverage shape across the 4-item ladder that should be normalized (or at
minimum confirmed intentional) before launch.

---

## 2. How the form gets chosen — proposals only, not a decision

David has not made this call. Four real mechanisms, each with what it produces and its risk.

### (a) Remaining time in the session budget

After the main mains are selected and `estimatedDuration` is known, pick A/B/C by how much
headroom remains before `availableTime`/`durationCap`: little room → A (cheapest, 2-3 sets, tens
of seconds); moderate room → B (240s block, scales its *variety* not its cost); C is a **fixed
240s cost regardless of form**, so it competes on headroom exactly like B does, just with zero
selection variance.
- **Produces:** duration-correlated form distribution — short sessions skew A, sessions with
  slack skew B/C.
- **Risk:** directly compounds `08-CORE.md`'s Q1/Q3 finding that core itself is already
  duration-correlated by accident (33%→57%, 15→45min) — this would make that correlation
  *worse*, not fix it, unless combined with the Full-Body Guarantee change in §3.

### (b) By bolt (Easy / Balanced / Intense)

Bolt 1 already can't fire tabata at all (`difficulty>=2` gate, §1.1) — so this axis naturally
maps to: Bolt 1 → A only; Bolt 2 → A or B; Bolt 3 → B or C (the higher-intensity forms).
- **Produces:** a session-level signal already used elsewhere for intensity shaping (`08-CORE.md`
  §2's `MAX_CORE=1`-in-Intense rule) — consistent with existing bolt semantics rather than
  inventing a new axis.
- **Risk:** ties core FORM to overall session intensity rather than to the user's actual core
  level/goal — a user who wants core variety but picked the "Easy" bolt that day (e.g. recovering
  from a hard leg day) would never see B/C.

### (c) Controlled random draw with weights, anti-repetition

Weighted random pick among the forms eligible under §3's gates, tracking the last N sessions'
chosen form (similar in spirit to `applyFlowRegression`'s history-aware logic elsewhere in this
codebase) so the same user doesn't get form A five days running.
- **Produces:** the most literal reading of "variety is the point" — actual session-to-session
  rotation, independent of duration/bolt.
- **Risk:** needs a new small piece of state (last-N-forms per user) that doesn't exist today —
  either a Firestore read/write (cost, staleness) or a derivation from recent workout history
  (`exercise-history.service.ts`/session logs, already read elsewhere) — the biggest net-new
  surface of the three options.

### (d) By what the user got in recent sessions (anti-repetition, but goal/history-driven not random)

A relative of (c) but deterministic, not weighted-random: look at the user's actual recent core
exposure (which form, which specific exercises) and pick whichever form is most *under*-served,
similar in spirit to `partial-completion.generator.ts`'s domain-gap comparison
(`08-CORE.md` §1.3).
- **Produces:** a genuinely goal-aware rotation (ties naturally into `08-CORE.md`'s open Q4 —
  "core goal" bias) rather than a cosmetic shuffle.
- **Risk:** most complex to implement correctly and the hardest to reason about/debug when a user
  reports "I keep getting the same thing" — the anti-repetition guarantee is only as good as the
  history window and query, and a wrong history read silently degrades to "looks random."

None of these are mutually exclusive — e.g. (b) could gate *eligibility* (which forms are even
allowed this session) while (c) or (d) picks among the eligible set. Flagging that composability
rather than presenting them as four exclusive options.

---

## 3. When the block enters at all

David's four rules, each checked against current code:

| Rule | Current state | What implementing it touches |
|---|---|---|
| Full-body (push+pull+legs) → core guaranteed | **Not guaranteed today** — `GuaranteePassRunner.ts:65`, `PRIMARY_DOMAINS = new Set(['push','pull','legs'])`, core explicitly absent (`08-CORE.md` §2). Confirmed empirically: 58.3% of full-body sessions ship with zero core (`08-CORE.md` §3 Q3). | Add `core` to `DOMAIN_MG_CANDIDATES` (`GuaranteePassRunner.ts:59-63`) and to `PRIMARY_DOMAINS` — **but the injected candidate must still pass `hasExplicitCoreLevel`**, not just `movementGroup==='core'` matching. `runFullBodyDomainGuarantee`'s search (`findLevelAppropriateSubstitute`, :455) doesn't apply that gate today because it's never been asked to search domain='core' — adding it without also gating it would reopen exactly the cross-scale bug §12.3 was built to close (a flag/human_flag exercise getting guarantee-injected into a "core" slot without a real core level). |
| ≥20 min → as today | No explicit duration gate exists for core anywhere (`08-CORE.md` §2, re-verified) — "as today" for this rule literally means **no new code**, only the ≥20min *floor* below which rules 3-4 kick in needs to exist. |
| 15 min + strength goal → doesn't enter, unless time remains | **No exact match for "strength goal" in the schema.** `user.types.ts:262`: `mainGoal: 'healthy_lifestyle' \| 'performance_boost' \| 'weight_loss' \| 'skill_mastery'` — none literally says "strength." Needs David to confirm which of these (most likely `performance_boost`) — or a different signal (`intentMode`, persona tag, `trainingType`) — is meant before this rule can be written precisely. | Whatever the confirmed signal is, gate at the same point `activeCore` is computed today (`StructureDirector.ts:138`) or just after, reading `availableTime`/estimated headroom the way `enforceVolumeCap` already does. |
| User-built workout (manual) → rules don't apply | **Partially true today, not automatically.** `WorkoutBuilderSheet` (Custom Builder) still calls `generateHomeWorkout` — the SAME pipeline, not a bypass (`01-MAP.md` §1b). `isManualOverride:true` is only consumed by `SplitDecisionService`'s deficit-clamping (`SplitDecisionService.ts:450-466`) — it does **not** currently exempt anything core-related. What DOES already naturally exempt most manual builds: the Full-Body Domain Guarantee only fires when `blueprint.strategy==='full_body'` (`GuaranteePassRunner.ts:425`) — a manual builder session with explicit domain chips rarely resolves to that strategy. But rules 2-4 above (duration/goal-based) are **not** strategy-scoped and would need an explicit `isManualOverride` (or "user explicitly picked domains") check added if they're meant to skip manual builds — nothing provides that exemption automatically today. | New `isManualOverride`/explicit-domain check wherever rules 3-4 land; rule 1 (guarantee) likely needs no extra work beyond what `strategy==='full_body'` already provides, but should be spot-checked once implemented rather than assumed. |

---

## 4. The plan, before code — STOP HERE, no implementation yet

### Files that would change, and what in each

| File | What changes |
|---|---|
| `tabata.constants.ts` | Relax or replace `TABATA_MAX_EXERCISES` for form B (pending the §1.3 clarification: relax the ceiling within the fixed 240s block, vs. scale `rounds` itself — different scope) |
| `tabata.block.ts` | `buildTabataBlock` needs a form parameter/branch (today it only ever builds one shape); form C's builder is structurally simpler — no composition search, just resolve one of the 4 catalog items by the user's core level (nearest-at-or-below, mirroring `poolLevelOf`'s existing "level-less defaults in" bias) and inject it as a single time-based exercise |
| `WorkoutGenerator.ts:1117-1132` | The "Step 6b" trigger site — needs to call whichever form-selection mechanism §2 settles on, then dispatch to the right builder path; `tabataBlock`/`GeneratedWorkout.tabataBlock` shape may need a form-tag field so downstream (mapper, session_volume) knows which form produced it, not just that *a* tabata thing exists |
| `GuaranteePassRunner.ts` | §3 rule 1 — add core to `DOMAIN_MG_CANDIDATES`/`PRIMARY_DOMAINS`, gated through `hasExplicitCoreLevel` |
| `StructureDirector.ts` | §3 rules 2-4 — wherever the new duration/goal/manual-build gates land; `activeCore`'s computation (`:138`) is the natural anchor point |
| `BudgetDistributor.ts` | Form A's `CORE_FIXED_SETS = 2` (`:108`) → a 2-3 range. **Confirmed safe to touch in isolation**: this file has zero awareness of `protocolBlock`/tabata today (verified — grepped clean), because it runs *before* the tabata finisher decision in the pipeline (Step 6b happens after `BudgetDistributor.distribute()`). Forms B/C never reach this file at all under the current architecture, so this change is exactly as scoped as David's instruction implies. |
| `trio-modifiers.service.ts` | Same 2→2-3 relaxation for the naked-backfill (`:714,731`) and violation-replacement (`:782-783,792`) core-set locks — same reasoning: these only ever touch form-A-shaped exercises. |
| Two parallel mappers (`buildRunnerWorkoutPlanFromGenerated.ts`, `workout-plan.mapper.ts`) | `partitionByTabataBlock` + `seg-tabata` construction need to handle form C's single-item shape (today assumes ≥`TABATA_MIN_EXERCISES`=2 members or dissolves — a 1-item follow-along block is not a "degenerate tabata," it's a valid form C result and must not trigger the existing dissolve-to-straight-sets safety net) |
| `scripts/audit/build-snapshot.ts` | Needs a form-tag column (or derive one from `protocolBlock` + exercise count + `isFollowAlong`) so the re-run comparison in §5 can actually distinguish A/B/C, not just "core present: yes/no" |
| `scripts/audit/build-session-volume.ts` | See below — the real risk |

### The volume-accounting risk — traced in full, not just flagged

`session_volume` (`build-session-volume.ts:128-164`) is the **existing measurement
infrastructure** — its own docstring calls `working_sets` "the primary metric this task cares
about." It reads `workout_exercises` filtered to `exercise_role='main'` with no exclusion for
`protocolBlock`/tabata, and aggregates:
```
working_sets      += sets
total_reps        += sets × reps          (rep-based only)
est_time_under_tension += sets × reps      (time-based: reps IS the hold-seconds value)
                        or sets × reps × 3s (rep-based, 3s/rep default)
```

**Today's tabata pool-injected member** (`tabata.block.ts:254`): `sets:1, reps:20
(TABATA_CLASSIC.workSec), is_time_based:true`. Contribution: `working_sets += 1`,
`TUT += 1×20 = 20s`. This already **undercounts** relative to true effort — a bilateral member in
a 2-member block is actually visited 4 times across the 8 rounds (`tabataIntervalCost=1`,
`rounds/cycleCost = 8/2 = 4`), i.e. 4×20s=80s of real work, but the hardcoded `sets:1` only ever
credits it with 20s. This is a **pre-existing** undercounting gap in the current, single-form
system — not introduced by this feature, but directly relevant: whatever fix forms B/C get should
not just extend the same undercounting, and might be the right moment to correct it.

**Form C makes the mismatch structural, not just imprecise.** A single follow-along item replacing
the whole block has no natural "sets" at all — it's one continuous 240s video. Modeled the obvious
way (`sets:1, reps:240, is_time_based:true`, matching `RestCalculator`'s existing `follow_along`
category convention, `RestCalculator.ts:95,202-203`), it contributes `working_sets:1, TUT:240s` —
**compare to form A's `working_sets:2-3, TUT:~48-72s`.** Same domain, same session, wildly
different "working sets" (fewer) and "TUT" (5x higher) for what's meant to be a *comparable*
amount of core work. Anyone reading `session_volume` without knowing which form produced a given
row would draw the wrong conclusion — "core volume cratered" or "core volume spiked," depending
which metric they looked at, when neither happened.

**This is exactly why David's own warning singles this out.** Two directions to resolve it,
presented as a decision for the same pass that picks a form-selection mechanism, not resolved here:
1. **Keep `working_sets`/`total_reps`/`TUT` as literal, low-level counts** (what actually happened
   in `sets`/`reps` terms) and add a `session_volume` dimension for `form` (A/B/C) so any
   before/after comparison is done **within** a form, never blended across forms. Cheapest change,
   preserves the existing metric's literal meaning, but means "is core volume up or down"
   requires three separate answers instead of one.
2. **Normalize B/C into an equivalent-sets estimate** (e.g. derive a "sets-equivalent" from
   total time-under-tension using some agreed conversion) so a single blended `working_sets`
   number stays meaningful across forms. More useful for a single headline number, but invents a
   new, debatable conversion formula that the `05-BENCHMARK.md`/`session_volume` methodology
   didn't need before and would need to defend.

**Stopping here, as instructed — no code changes, no decision made on the two directions above or
on which §2 mechanism to use.**

---

## 5. Warning, restated precisely

This changes how workouts look for paying users. After implementation (next pass, on approval),
re-run `build-snapshot.ts` and compare against `08-CORE.md`'s baseline:

> ⚠️ **Correction (05.09.2026)** — the row below originally restated `08-CORE.md`'s baseline
> numbers verbatim; those numbers were contaminated (see `08-CORE.md` §3's own correction note —
> `domain='core'` counted without `exercise_role='main'`, silently including core exercises that
> had leaked into the warmup slot). Corrected values below; strikethrough = the original,
> contaminated figures this document shipped with.

| Metric | Today (baseline, `08-CORE.md` §3, corrected) |
|---|---|
| % workouts with ≥1 core exercise, by duration (15/20/30/45min) | **5.1% / 10.2% / 21.2% / 34.2%** (was ~~32.9/36.9/45.7/56.8%~~) |
| Avg core exercises per workout, by duration | **0.07 / 0.12 / 0.26 / 0.40** (was ~~0.35/0.41/0.56/0.81~~) |
| Avg core exercises per workout, by bolt (1/2/3) | **0.32 / 0.19 / 0.12** (was ~~0.61/0.55/0.43~~) |
| % full-body workouts with zero core | **83.0%** (92.6% at 15min) (was ~~58.3% (66.7% at 15-20min)~~) |
| Core "always last" in practice | 96.9% (21 exceptions, fully explained) — **already role-filtered correctly, unaffected** |

Expected directional change from §3 rule 1 alone (full-body guarantee): the 58.3%/66.7%
zero-core figures should drop sharply for full-body sessions specifically — worth measuring as
its own row, not just folded into the general "% with core" number, since that's the rule most
directly aimed at it.

---

## Sources

- `docs/workout-engine/08-CORE.md` — baseline measurements, rule audit, live-suggestion mapping.
- `docs/workout-engine/01-MAP.md` §9 (storage/placement), §1b (Custom Builder), §10.4 (protocol
  advance/`segment.protocol` dispatch).
- Live code: `tabata.block.ts`, `tabata.constants.ts`, `WorkoutGenerator.ts` (Step 6b, 1117-1132,
  1256), `home-workout.service.ts:2382` (pool population), `GuaranteePassRunner.ts` (Full-Body
  Domain Guarantee, 410-475), `BudgetDistributor.ts` (`CORE_FIXED_SETS`, confirmed no tabata
  awareness), `trio-modifiers.service.ts` (naked-backfill/violation-replacement core-set locks),
  `buildRunnerWorkoutPlanFromGenerated.ts` / `workout-plan.mapper.ts` (`seg-tabata` construction),
  `SplitDecisionService.ts` (`isManualOverride`'s only real consumer), `scripts/audit/
  build-session-volume.ts` (volume formula), `scripts/tabata-kill-switch.ts` /
  `scripts/audit-tabata-conditioning.ts` (probability bands, pool curation history).
- Live Firestore query (this pass): the 4 follow-along exercise docs and their linked `programs`
  doc (`kDMpobbKsuVTByTIKUpe` → slug `core`).
