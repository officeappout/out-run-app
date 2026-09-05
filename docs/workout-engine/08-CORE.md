# 08-CORE.md — Core/Abs: Live-Session Mapping, Rule Audit, Measurement, Decisions Needed

> Scope: read-only mapping and measurement. **No code changed in this pass.**
> Builds directly on `01-MAP.md` §9 (storage/placement rules) and §10 (live player architecture),
> and `00-PLAN.md` §12.3 (the core-slot gate decision). Read those first — this doc does not
> repeat their content, only extends it into the one area they didn't cover (the live-session
> suggestion path) and re-verifies/measures everything else against current code and
> `scripts/audit/snapshot.sqlite`.

---

## 1. The abs path in the live workout — David's "not stitched to the end"

`01-MAP.md` §10 traced the live strength player (`StrengthRunner.tsx`) in detail — state machine,
protocol-advance logic, completed-session writes — but never traced what actually surfaces a
core/abs *suggestion* to the user around a live session. That's a separate subsystem, `core/
engine/` (the "suggestion-engine"), and it's what this section maps.

### 1.1 It is not a simplified/parallel picker — verdict up front

The headline finding cuts against the most likely worry: the exercise-selection machinery behind
a core suggestion is **not** a separate, simpler system that skips filters. Both core-aware
generators call `generateHomeWorkoutTrio` — the literal same production pipeline
(`ContextualEngine`/`PoolFactory` → `PipelineOrchestrator` → `WorkoutGenerator.generateWorkout()`)
the daily home workout uses, including the §12.3 core-slot gate (`hasExplicitCoreLevel`) and
injury shielding. What's genuinely incomplete is narrower and more specific: **no live, mid-session
suggestion exists at all** (confirmed absence, not a tracing gap — see §1.7), the two post-workout
generators silently default to `location:'park'` instead of the user's real environment, one
suggestion type is a dead tap-target, and there is **no skip/dismiss/swap affordance anywhere** in
the flow.

### 1.2 End-to-end pipeline

```
runSuggestionEngine(context)                          core/engine/suggestion-engine.ts:26-53
  → filter GENERATOR_REGISTRY by surface + eligible()  generator-registry.ts:26-36
  → Promise.all(generator.generate(context))           (per-generator throws are caught, :29-38)
  → dedup: if 'route' present, drop 'complementary-short' entirely   :42-50
  → rankSuggestions(context, candidates)                rank-suggestions.ts:178-185
  → ranked Suggestion[] → React state → <SuggestionCarousel>
       post-workout: home/page.tsx:1071-1111 → postWorkoutSuggestions, rendered :3089-3103
       pre-workout:  home/page.tsx:1222 (streaming variant) → preWorkoutSuggestions, rendered :2915-2963
  → user taps "Start" → suggestionToGeneratedWorkout()  pick-post-workout-suggestion.ts:40-57
  → handlePostWorkoutSuggestionStart → useWorkoutSession().handleStartWorkout
       (the SAME hook 01-MAP.md §10.2 already traced for CustomBuilder "Start")
  → buildRunnerWorkoutPlanFromGenerated → sessionStorage → mounts StrengthRunner.tsx
```

**Once started, a suggested core workout becomes an ordinary `StrengthRunner` session** — nothing
special happens live. So "the live workout abs path" is really two disjoint things: (a) the
pre/post-workout *suggestion surface* (mapped below), and (b) whatever ordinary core-slot
placement happens once any workout — suggested or not — is actually running (covered by §2's
rule table, unchanged by being suggestion-sourced).

**Timing:** surfaced on the home dashboard (a) before the day's workout
(`surface:'home'`, `HOME_PRE_WORKOUT_SUGGESTION_CAROUSEL_ENABLED=true`) and (b) immediately after
a workout completes (`surface:'post_workout'`, `POST_WORKOUT_SUGGESTION_CAROUSEL_ENABLED=true`).
Both flags are live in production (feature-flags.ts:1303, :1334). Neither generator declares
`'home'` in its own `surfaces` array, so **core suggestions only ever appear post-workout**, never
pre-workout.

### 1.3 Who decides "core" fires, and when

Two generators target core specifically, both unconditionally registered (no feature flag on the
generator itself — only the hosting carousel is flagged):

| Generator | Gate (`eligible()`) | What it builds |
|---|---|---|
| `complementary-short.generator.ts` | `context.stepsRemaining > 0` — **a step-count gate, unrelated to whether core was actually trained today** (own header comment: deliberate simplification) | `generateHomeWorkoutTrio({ availableTime: 12, requiredDomains: ['core'], strictDomains: true, generateSingleOption: true, targetOptionIndex: 1, skipCycleRestart: true })` — fixed 12-minute, core-only |
| `partial-completion.generator.ts` | `setsCompleted < setsPlanned` (real, from `summarizeTodayStrengthVolume`) | `resolveWorstDomainGap` compares real per-domain program levels/budgets/completed-today volume across `DOMAIN_ORDER = ['push','pull','legs','core']` (`:75`) and picks whichever domain has the largest gap. **Ties go to the earliest domain in that order — core loses every tie**, "per David's explicit instruction, not a data-driven priority" (`:30-31`). Only fires `requiredDomains:['core']` when core is *strictly* the worst-trained domain of the day. |

Both are `surfaces: ['post_workout']` only.

### 1.4 Same filters as a normal workout exercise?

| Filter | Applied to a core suggestion? | Evidence |
|---|---|---|
| Level / §12.3 core-slot gate (`hasExplicitCoreLevel`) | **Yes, identical** — `matchesDomainForSlot('core')` is reached via the same `selectExercisesWithDomainQuotas` router both generators funnel into (`requiredDomains` set → `WorkoutGenerator.selectExercises` → `selectExercisesWithDomainQuotas`, `workout-selection.utils.ts:610`) | No bespoke picker in either generator file |
| Injury shield | **Yes** — `filterContext.injuryShield` is derived from the real `userProfile` regardless of what the generator passes in; neither generator needs to (or does) pass an override | `home-workout.service.ts:1583,1904`; `excluded_injury_shield` count logged on every call (`:2090`) |
| Location / gear | **No — confirmed gap.** Neither generator passes `location`. `_buildSharedPipeline` then defaults to `'park'` (own doc comment: only defaults when *neither* `testLocation` nor `location` is provided) → `ESSENTIAL_PARK_GEAR` fallback, not the user's real home/gym inventory | `home-workout.service.ts:1279-1290,1429,1587-1597`; compare `StatsOverview.tsx:869` (`location: effectiveLocation`), which the main daily workout DOES pass and these two generators don't |

Practical impact of the location gap is muted (most core-domain exercises are bodyweight and
don't need gear) but it's real: a user at home with no bar/parallettes can get a core suggestion
whose candidate pool was filtered as if a park pull-up bar existed.

### 1.5 Skip / swap — none exists

Verified by reading every layer: `PostWorkoutCardRenderer.tsx`/`PreWorkoutCardRenderer.tsx` accept
only `suggestion`/`onStart`/`isStarting` (+ display props) — no `onSkip`/`onDismiss`/`onSwap`.
`SuggestionCard.tsx` renders exactly one button ("התחל"). `SuggestionCarousel.tsx` has zero
matches for `dismiss|skip|swap`. The only "skip" is scrolling past the card or ignoring it — not
tracked or persisted, so a similar suggestion can reappear next time the effect re-fires. The only
exercise-swap mechanism anywhere in the strength stack is `StrengthRunner`'s generic
`onSwapExercise` (the pre-existing Adjust/Quick-Swap sheet, `01-MAP.md` §1c) — only reachable
*after* tapping Start, with zero awareness of `core/generators`/`core/engine`.

### 1.6 Where the path breaks, truncates, or silently defaults

| # | File:Line | Ideal vs. actual | Kind |
|---|---|---|---|
| 1 | `suggestion-engine.ts:42-50` | If a `route` suggestion is also eligible, `complementary-short` is **dropped from the candidate list entirely**, not re-ranked. A real core-domain gap can go unshown purely because a walking route also qualified that day. | Silent drop, by design — but a real vanishing point |
| 2 | `pick-post-workout-suggestion.ts:54-56` + `home/page.tsx:1400-1401` | `safety-net` can win the post-workout ranking (`eligible: () => true`), but `suggestionToGeneratedWorkout`'s switch has no `'safety-net'` case → `default: return null` → tapping "Start" silently no-ops. The file's own comment claims a "degrades to ordinary free-walk flow" fallback that is **not implemented for this surface** (it exists only for the pre-workout `safety-net` branch, `PreWorkoutCardRenderer.tsx:250-284`). | Dead tap-target — comment claims a fallback that isn't there |
| 3 | `complementary-short.generator.ts:26-37`, `partial-completion.generator.ts:156-163` | Neither passes `location`/gear → silent `'park'` default. See §1.4. | Skipped filter input |
| 4 | `complementary-short.generator.ts:48` | Gate is step-count only, no "already did core today" check — only *soft*-downranked afterward by `rank-suggestions.ts`'s `alreadyTrained` factor (`:142-153`), never hard-blocked, and the carousel shows all ranked candidates (not just the top), so a downranked-but-redundant core card is still reachable. | Soft ranking penalty, not a hard filter — likely the actual source of David's "not stitched" feeling |
| 5 | `partial-completion.generator.ts:75` + `:30-31` | `DOMAIN_ORDER` ties broken toward push/pull/legs over core — working as designed, but means this generator is a comparatively rare source of a core suggestion in practice (only wins on a strict, undisputed worst-gap). | Design choice, not a bug — but explains "I rarely see this" |
| 6 | `recovery-follow-up.generator.ts:40`, `partial-completion.generator.ts:84` | Two independently hand-rolled `Map` caches (`recoveryWorkoutCache`, `partialCompletionCache`) re-implementing the identical cap-then-evict-oldest pattern separately. Not a functional bug, but exactly the kind of "not stitched into one system" drift. | Duplication |

### 1.7 Mid-session (during `StrengthRunner`) — confirmed absent, not un-traced

`grep -rln "suggestion-engine\|runSuggestionEngine\|SuggestionCarousel\|generator-registry" src/
features/workout-engine/players` → **zero files.** The entire core/abs suggestion feature is
pre-workout and post-workout only; nothing fires while a session is active. Stated explicitly
because it's a useful negative result, not a gap in this pass's tracing.

**Full generator registry** (`generator-registry.ts:26-36`, 9 total, registration order also
breaks score ties): `routeGenerator`, `routeStopsGenerator`, `fullParkWorkoutGenerator`,
`fullStrengthGenerator`, `anchorLoopGenerator`, `recoveryFollowUpGenerator`,
`safetyNetGenerator`, `complementaryShortGenerator`, `partialCompletionGenerator`. Only the last
two reference `'core'` in any exercise-selection sense; `full-strength.generator.ts` builds a
generic full-body workout with no `requiredDomains`, subject only to the ordinary (non-suggestion)
core rules in §2 below.

---

## 2. Existing core rules — one table, each verified against live code

| Rule (as stated) | File:Line | What actually happens (verified this pass) |
|---|---|---|
| Dedicated last block, `isAccessorySlot` | `StructureDirector.ts:138,188,192,197` | `activeCore = domains.includes('core')` — pushed as `{domain:'core', isAccessorySlot:true}` after pull/push/legs blocks in the full-body strategy. Confirmed unchanged. Gate is `domains.includes('core')` only — no time factor anywhere in this file (zero matches for `availableTime`/`duration`). |
| Always last in order, tier 4/5 (`applyPhysiologicalSort`) | `workout-sorting.utils.ts:64-120` (esp. `:70`, `return 4`) | **True of this function, but this function is NOT the operative final sort.** See the correction below — a real, previously-undocumented nuance. |
| Excluded from Full-Body Domain Guarantee (`GuaranteePassRunner`) | `GuaranteePassRunner.ts:59-65` | `PRIMARY_DOMAINS = new Set(['push','pull','legs'])` — confirmed unchanged, core still absent from this set after this session's unrelated edits to this same file. |
| Capped at 1 in the Intense option (`trio-modifiers`) | `trio-modifiers.service.ts:221,245,251,320` (`applyIntenseOption`) | `MAX_CORE = 1`; `corePool` built and capped separately from `nonCorePool`'s push/pull/legs quota, then appended. Confirmed unchanged — this session's edits to this file touched `applyFlowRegression`/`applyEssentialGearFilter` only, never `applyIntenseOption`. |
| Enters only with an assessed core level (`program-hierarchy.utils`) | `program-hierarchy.utils.ts:221,260,263` | `FULL_BODY_CHILD_DOMAINS = ['push','pull','legs','core']`, filtered by `isAssessed(dom)` — confirmed unchanged. This is the **domain-candidacy** gate (is `'core'` even in `requiredDomains`), separate from the exercise-level gate below. |
| Must have `targetPrograms[core]` to enter the slot (the gate this branch added) | `workout-selection.utils.ts:575-608` (`hasExplicitCoreLevel`, `matchesDomainForSlot`) | Confirmed live and unchanged: `ex.targetPrograms?.some(tp => (tp.programId==='core' || slug==='core') && typeof tp.level==='number' && tp.level>0)`. **Caveat found this pass, documented in the function's own comment but not previously surfaced**: this gate only covers the *dedicated* per-domain pick and its rescue tiers — the function's own doc comment (`:591-599`) states the later general backfill pass ("takeFromPool"/final "any" fallback) was never domain-restricted for *any* domain by design, so a core-tagged-but-unleveled exercise could in principle still slip in as a backfill "bonus" pick in a very thin pool. Not a contradiction, just a documented scope boundary worth knowing. |
| Exactly 2 sets (this session's fix) | `BudgetDistributor.ts:108,205-208,296-302` (`CORE_FIXED_SETS`); `trio-modifiers.service.ts:714,731,782-783,792` (naked-backfill + violation-replacement) | Both locks confirmed intact after this session's exercise-swap-fix edits to `trio-modifiers.service.ts` (which touched reps/isTimeBased/tier/restSeconds only, never the `sets:` computation). |
| No duration-dependent rule — verify still true | *(absence confirmed)* | Re-verified fresh this pass (not just trusting `01-MAP.md`): zero `availableTime`/`duration` references anywhere in `StructureDirector.ts`. **However — see §3 Q1/Q2: the DATA shows a real duration correlation (33%→57% of workouts contain core, 15min→45min) despite no explicit rule.** This is an emergent effect (longer sessions get more exercise slots overall and more `enforceVolumeCap` headroom, so a probabilistically-scored core slot survives more often), not a designed gate — worth stating precisely rather than "no relationship at all." |
| `enforceVolumeCap` docstring vs. code contradiction — still exists? | `PresentationFormatter.ts:411-429` (docstring) vs. `:452-467,470-473` (code) | **Still exists, unchanged.** Docstring: "1. Core... (most expendable)". Code: `isExpendable()` pools core+isolation/accessory+extra-legs into one boolean set; the actual removal picks `.sort((a,b)=>a.score-b.score)[0]` — **lowest score across the pooled set, regardless of category.** A high-scoring core exercise can outlive a low-scoring isolation exercise, contradicting the stated "core first" ordering. |

### Correction to `01-MAP.md` §B.5 — the "always last" rule is weaker than documented

This is a genuine finding from this pass, not previously known: **`applyPhysiologicalSort` is a
real, live, *intermediate* sort — not the final one.** The actual last-mutation sort is
`applyDomainPrioritySort` (`workout-sorting.utils.ts:200-280`, called from `sortAndPair`,
`PresentationFormatter.ts:364`, itself called unconditionally as the documented "ABSOLUTE last
mutation" from `home-workout.service.ts:1135`, right before `annotateRepRanges`). It uses a
**3-weight** table, not `applyPhysiologicalSort`'s 5-tier one:

```ts
// workout-sorting.utils.ts:137-149
const DOMAIN_PRIORITY_WEIGHTS: Record<string, number> = {
  vertical_push: 1, horizontal_push: 1, vertical_pull: 1, horizontal_pull: 1,
  muscle_up: 1, handstand_pushup: 1, planche: 1,
  squat: 2, hinge: 2, lunge: 2,
  core: 3, anti_extension: 3, anti_rotation: 3,
  isolation: 3, accessory: 3,
};
```

**Core is tied with `isolation`/`accessory` at weight 3 — not its own exclusive last tier.** Their
relative order within that shared bucket falls to a secondary sort key, `resolveTierSubOrder`
(`:179-186`, elite→hard→skill/compound→foundation→match→flow/accessory), which does **not**
special-case core either. Measured, confirmed consequence in §3 Q4 below: this is real, not
theoretical — it produces actual out-of-order sessions in the current pipeline.

A second, independent override exists in the same function: the "Supreme Protocol Gate"
(`:229-244`) pins any exercise carrying a `pyramidSequence`/`repsSequence` to the front of the main
block, **before the domain-weight check runs at all** — and does not exempt core. A core exercise
that happens to land in a pyramid protocol gets pinned first, not last.

---

## 3. Measurement — `scripts/audit/snapshot.sqlite`

Actual size: **3,780 workouts**, 23,827 `workout_exercises` rows (5 levels × 4 durations × 3
locations × 7 push/pull/legs domain-subsets × 3 `daysInactive` × 3 bolts). Note: `req_domains`
never explicitly includes `'core'` in this matrix — every core exercise present got there via the
assessment-gated full-body domain expansion (§2's `program-hierarchy.utils` row), since the mock
profile sets `domainLevels = {pull, push, legs, core: level}` for every run (`build-snapshot.ts:
215`), i.e. core is always "assessed."

> ⚠️ **Correction (05.09.2026)** — every number in Q1–Q3 below was originally measured with
> `domain='core'` alone, with no `exercise_role='main'` filter. That silently counted rows where a
> core-tagged exercise had been selected into the WARMUP slot (a real, then-undiscovered bug in
> `warmup.service.ts` — see `09-CORE-TABATA.md`'s follow-up investigation, fixed 05.09.2026) as
> "this workout has core." The corrected numbers below re-run the exact same queries against the
> exact same snapshot (commit `40bb8b80`) with `exercise_role='main'` added — same data, same
> matrix, just not double-counting warmup-slot leakage as real core presence. Q4 was already
> correctly role-filtered in the original pass (its own phrasing already said "core `main`-role
> exercise") and needed no correction. **`scripts/audit/check-core-query-safety.ts` now fails any
> future committed query with this same gap — see 03-CHANGES.md.**

### Q1 — % of workouts containing ≥1 core exercise, by duration

| Duration | Total workouts | With core (corrected) | % (corrected) | % (originally reported, contaminated) |
|---|---|---|---|---|
| 15 min | 945 | 48 | **5.1%** | ~~32.9%~~ |
| 20 min | 945 | 96 | **10.2%** | ~~36.9%~~ |
| 30 min | 945 | 200 | **21.2%** | ~~45.7%~~ |
| 45 min | 945 | 323 | **34.2%** | ~~56.8%~~ |

### Q2 — avg core exercises per workout

By duration:

| Duration | Avg core / workout (corrected) | Originally reported |
|---|---|---|
| 15 min | **0.07** | ~~0.35~~ |
| 20 min | **0.12** | ~~0.41~~ |
| 30 min | **0.26** | ~~0.56~~ |
| 45 min | **0.40** | ~~0.81~~ |

By bolt:

| Bolt | Avg core / workout (corrected) | Originally reported |
|---|---|---|
| 1 (Flow/Easy) | **0.32** | ~~0.61~~ |
| 2 (Balanced) | **0.19** | ~~0.55~~ |
| 3 (Intense) | **0.12** | ~~0.43~~ |

Bolt 3's lower core rate is still consistent with §2's "Intense caps core at 1 and excludes it from
the push/pull/legs quota" rule — core competes for a smaller, capped share of that bolt's slots.

### Q3 — full-body workouts (`req_domains='push,pull,legs'`) ending with zero core

| | Corrected | Originally reported |
|---|---|---|
| Full-body workouts | 540 | 540 |
| With ≥1 core `main`-role exercise | 92 | 225 |
| **Without any core exercise** | **448 (83.0%)** | ~~315 (58.3%)~~ |

By duration — the same duration correlation as Q1, sharper at the low end:

| Duration | Full-body workouts | Without core (corrected) | % (corrected) | % (originally reported) |
|---|---|---|---|---|
| 15 min | 135 | 125 | **92.6%** | ~~66.7%~~ |
| 20 min | 135 | 122 | **90.4%** | ~~66.7%~~ |
| 30 min | 135 | 104 | **77.0%** | ~~52.6%~~ |
| 45 min | 135 | 97 | **71.9%** | ~~47.4%~~ |

Since core is "assessed" in every single run (mock profile always sets a core domain level), this
448/540 gap is **not** the assessment gate (§2 row 5) filtering core out — it is core's own status
as an accessory, non-guaranteed slot (§2 rows 1, 3) losing out during selection/trimming, and this
correction shows it losing out **far more severely** than originally measured, across every
duration — not just at the short end. **This is the single clearest piece of evidence that "core is
optional, not guaranteed" is a real, everyday user-facing outcome, not a theoretical edge case** —
even a session that explicitly targets all three primary domains together ships with zero core work
more often than not, at every duration measured here.

### Q4 — is core really always last, in practice?

| | |
|---|---|
| Workouts with ≥1 core `main`-role exercise | 667 |
| Core genuinely last (by array position) | 646 (96.9%) |
| **Core NOT last** | **21 (3.1%)** |

All 21 are fully explained by the two mechanisms found in §2's correction — no unexplained
residue:

| Cause | Count | Mechanism |
|---|---|---|
| Pyramid Supreme Gate | 11 | The core exercise itself carries a `pyramidSequence` → pinned to the FRONT of the main block, ahead of push/pull/legs, by `applyDomainPrioritySort`'s pyramid check (`:229-244`), which runs before the domain-weight check and doesn't exempt core. |
| Isolation weight-3 tie | 10 | The exercise that ends up last has `movementGroup==='isolation'` (e.g. "עליות תאומים," calf raises) — tied with core at weight 3 in `DOMAIN_PRIORITY_WEIGHTS`, and its `resolveTierSubOrder` places it after a `compound`/`foundation`-priority core exercise within that shared bucket. |

Concretely verified example (pyramid case), `r1004_b3`: position 5 = core (pyramid-flagged),
positions 6-8 = push/push/legs — the pyramid gate placed core *first* among mains, not last.
Isolation-tie example, `r374_b1`: position 1 = legs, position 2 = core, position 3 = "עליות
תאומים" (isolation) — core sorted correctly relative to legs, but the isolation accessory landed
after it in the same weight bucket.

---

## 4. Open questions for David — no invented answers

Each with 2-3 real options and the concrete implication of each, grounded in §1-3 above.

### Q1 — Duration rule: from what workout length should core appear? At 15 minutes at all?

Currently: no explicit rule; 32.9% of 15-min workouts get core anyway, purely by chance (slot
survives scoring + `enforceVolumeCap`). Options:
- **(a) Leave it emergent** — no code change; core's presence at short durations stays a coin-flip
  outcome of slot-count and trim-survival, not a decision.
- **(b) Explicit minimum duration** — e.g. core never enters `StructureDirector`'s block list below
  N minutes (a genuinely new gate; none exists today, per §2). Trades away the 32.9%/36.9%
  "lucky" inclusions at 15/20min for a deterministic, explainable rule.
- **(c) Explicit minimum duration, but only for full-body sessions** — narrower than (b); leaves
  single-domain "core day" sessions (`StructureDirector`'s generic fallback, §B.1 of `01-MAP.md`)
  unaffected since those already imply the user chose core deliberately.

### Q2 — Full-body workout: is core guaranteed, or optional?

Currently: optional. §3 Q3 measured 58.3% of full-body sessions (targeting all of push/pull/legs
together) ship with **zero** core exercises, rising to 66.7% at 15-20 minutes. §2 confirms core is
explicitly excluded from `GuaranteePassRunner`'s Full-Body Domain Guarantee. Options:
- **(a) Keep it optional** — matches the current, deliberate design (core = accessory slot,
  `PRIMARY_DOMAINS` intentionally excludes it). No code change.
- **(b) Add core to the guarantee, unconditionally** — every full-body workout gets ≥1 core
  exercise regardless of duration. Directly reverses the 58.3% figure; interacts with Q1 (would
  need a duration floor to avoid crowding out push/pull/legs at 15 minutes).
- **(c) Guarantee core only above a duration floor** — combine with Q1(c): full-body + long enough
  → guaranteed; full-body + short → stays optional as today.

### Q3 — How many core exercises per workout: always 1, or duration/goal-dependent?

Currently: `applyIntenseOption` hard-caps bolt 3 at exactly 1 (§2); bolts 1/2 have no explicit cap
— §3 Q2 shows avg 0.81 at 45 minutes (bolt-blended), meaning most 45-min sessions that get core at
all get exactly one, occasionally two. Options:
- **(a) Formalize "always at most 1"** across all bolts, matching what bolt 3 already does
  explicitly and what the data shows happens in practice almost everywhere else too.
- **(b) Scale with duration** — e.g. 1 core exercise up to 30 min, 2 above that — a real, new,
  duration-aware volume rule (none exists today for core specifically, per §2's DIFFICULTY_VOLUME
  discussion in earlier addenda, which is bolt-indexed, not domain-indexed).
- **(c) Leave unbounded, scored like everything else** — no new cap; whatever the shared budget
  distributor naturally allocates.

### Q4 — A user who selected "core goal" in onboarding: should they get more core? How?

Currently: no mechanism found anywhere in `StructureDirector`/`GuaranteePassRunner`/
`selectExercisesWithDomainQuotas`/the suggestion-engine that reads a "core goal" preference and
biases core's chances. Options:
- **(a) Bias the domain-quota selection score** — a goal-aware score bonus for core-domain
  candidates when `mainGoal`/a persona tag signals core focus, mirroring how other score bonuses
  already work in `assignVolume`/`ContextualEngine`.
- **(b) Bias slot presence, not just scoring** — treat a core-goal user's full-body sessions like
  Q2(b) (guaranteed core) regardless of the general population's default.
- **(c) Route to the suggestion-engine instead** — leave the main generator untouched; make
  `partial-completion.generator.ts`'s `DOMAIN_ORDER` tie-break (currently core-last, §1.3)
  goal-aware so a core-goal user's post-workout suggestions favor core more often.

### Q5 — Live suggestions: when and why are they offered — at the end, or when time remains?

Currently: post-workout only (never mid-session, confirmed absent per §1.7), gated by a step-count
proxy (`complementary-short`) or a domain-gap comparison that structurally disfavors core
(`partial-completion`, §1.3) — neither is "because you have time left" or "because your workout
just ended and core needs more work" in a direct sense. Options:
- **(a) Keep the step-count proxy** — `complementary-short`'s current gate (`stepsRemaining > 0`)
  stays as the practical trigger; accept it's a fitness-goal proxy, not a core-specific signal.
- **(b) Add a real "core-neglected" gate** — a dedicated eligibility check (e.g. "no core exercise
  in today's completed workout AND no core exercise in the last N days") independent of steps or
  the domain-gap tie-break, addressing §1.6 row 4 directly (today: only a soft rank penalty, never
  a hard block or a positive trigger).
- **(c) Formalize "time remaining" as the real, named trigger** — today nothing in either
  generator reads elapsed/remaining time from the completed session; this would be new logic tying
  the suggestion to how much of the user's typical session budget the just-finished workout used.

---

## Sources

- `docs/workout-engine/01-MAP.md` §9 (storage/placement), §10 (live player) — read in full before
  this pass; not duplicated here except where corrected (§2's `applyDomainPrioritySort` finding).
- `docs/workout-engine/00-PLAN.md` §12.3 — the core-slot gate decision this doc's §2 re-verifies.
- Live code: `StructureDirector.ts`, `GuaranteePassRunner.ts`, `trio-modifiers.service.ts`,
  `BudgetDistributor.ts`, `PresentationFormatter.ts`, `workout-sorting.utils.ts`,
  `workout-selection.utils.ts`, `program-hierarchy.utils.ts`, `home-workout.service.ts`,
  `core/engine/*`, `core/generators/complementary-short.generator.ts`,
  `core/generators/partial-completion.generator.ts`, `home/page.tsx`,
  `PostWorkoutCardRenderer.tsx`, `PreWorkoutCardRenderer.tsx`, `SuggestionCard.tsx`,
  `SuggestionCarousel.tsx`.
- `scripts/audit/snapshot.sqlite` — 3,780 workouts / 23,827 exercises, queried directly for §3.
