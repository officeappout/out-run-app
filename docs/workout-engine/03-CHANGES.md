# Level-Integrity Fix — What Changed, Why, and How to Roll Back

> Branch: `fix/exercise-level-integrity` (based on `main`). No push happened — everything
> below is local commits only, waiting for review.
> **No Firestore data was touched.** No migration was run. Everything with real database
> impact (Part 2) is dry-run only, verified, and waiting on your explicit `--apply`.
> Covers two work sessions: the original triage + two engine fixes (commits `e9276efc`
> through `8cf2de60`), and the follow-up narrowing + core-slot gate + admin screen after
> your decisions in `00-PLAN.md` §12-13 (commits `8bbbeca2` through `0de63ae6`).

---

## Summary table

| # | Commit | What | Firestore impact | Reversible how |
|---|---|---|---|---|
| 1 | `e9276efc` | docs baseline: `01-MAP.md`, `02-CATALOG-AUDIT.md` + CSVs, the audit script, `00-PLAN.md` (v1) | None (docs only) | `git revert e9276efc` |
| 2 | `1a27763a` | `03-LEVEL-TRIAGE.md` (Part 1 report) | None (docs only) | `git revert 1a27763a` |
| 3 | `f276714e` | `apply-level-triage.ts` v1 — 20-item migration script | **None yet** — superseded by #7 before ever being run | `git revert f276714e` (no-op once #7 is also applied — see below) |
| 4 | `70661a91` | Fix 3.1 — graduated CLIFF fallback | None (code only) | `git revert 70661a91` |
| 5 | `0c13685d` | Fix 3.2 — remove globalLevel substitution | None (code only) | `git revert 0c13685d` |
| 6 | `8cf2de60` | `03-CHANGES.md` v1 | None (docs only) | superseded by this file |
| 7 | `8bbbeca2` | `00-PLAN.md` — your §12-14 decisions, checkpointed | None (docs only, your own edit) | `git revert 8bbbeca2` |
| 8 | `54cf8945` | `apply-level-triage.ts` narrowed to your approved 12 + 1 pending | **None yet** — not run with `--apply` | `git revert 54cf8945` (reverts to the 20-item v1 from #3 — not what you want; see note below) |
| 9 | `3fd9ac7c` | Core-slot gate — `workout-selection.utils.ts` + new test file | None (code only) | `git revert 3fd9ac7c` |
| 10 | `0de63ae6` | New admin screen — `/admin/unreachable-exercises` | None (code only, adds a page) | `git revert 0de63ae6` |

**Dependency, not independent:** #8 (the narrowed migration) and #9 (the core-slot gate)
must land together — see the dedicated section below. Every other row is independently
revertible.

**Rollback note on #8:** reverting `54cf8945` alone restores the OLD 20-item list
(including the 4 burpees and 9 band exercises you explicitly dropped in §12.1/§12.2) —
that is almost certainly not what you want. If you need to undo the narrowing, edit
`GROUP_B`/`PENDING_CANDIDATES` directly rather than reverting this commit.

---

## Part 1 — Level triage report

**What:** `docs/workout-engine/03-LEVEL-TRIAGE.md` — classifies the 70 exercises missing
both `targetPrograms` and `programIds`, the 55 core exercises' level gaps, and 6 junk
records. Zero writes.

**Why:** these 70 exercises silently resolve to `recommendedLevel || 1`
(`workout-selection.utils.ts:95-97`) — a real exercise like "פיסטול סקוואט שלילי" (negative
pistol squat) reads as Level 1 to the engine and can be handed to a complete beginner.

**A correction surfaced while writing it, not asked for but worth flagging:** the plan's
premise that most of the 70 are "warmups/stretches, legitimately selected by
`exerciseRole`" turned out to be only half right — only 6 of the 70 actually have
`exerciseRole` set (all `'recovery'`). The other 64, including unambiguous stretches by
name, have no role and no `mobility`/`flexibility` tag. This became the basis for the
new admin screen (Part 3 below).

**Nothing to roll back** — this commit only adds a markdown file.

---

## Part 2 — Migration script, narrowed to David's approved 12 (updated)

**What:** `scripts/audit/apply-level-triage.ts`. Originally encoded all 20 Group-B fixes
from `03-LEVEL-TRIAGE.md` (commit `f276714e`); narrowed in commit `54cf8945` per your
decisions in `00-PLAN.md` §12.1/§12.2/§12.4 — **never run with `--apply` at either
version**, so there is no data-migration history to reconcile, only a code history.

**Removed** (7 of the original 20):
- 4 "סמוך קום" (burpee) variants — heart-rate/conditioning content, not a push
  progression. A push L6 burpee would have stolen a slot from a real push-up progression.
- 9 resistance-band exercises — a dumbbell substitute; the generator has no
  load-tracking mechanism yet. Intentionally frozen, not tagged. Still visible via the
  new `/admin/unreachable-exercises` screen (Part 3) as unused content, not silently
  dropped from view — they'll show `NO_LEVEL`/`NO_ROLE_OR_TAG` there.

**Added** (5 new, from `03-LEVEL-TRIAGE.md` Part 1b1/1b2, not part of the original 20):
- 3 plank-family core-level fixes (פלאנק, פלאנק על הברכיים, פלאנק עליות ונגיעות
  בכתפיים) — these already carry OTHER program levels (push); the migration only
  appends a `core` entry via `arrayUnion`.
- 2 tagging + level fixes (אופניים, עליות נגיעה בבהונות בשכיבה) — currently invisible
  to the core detector entirely (no `movementGroup`/`primaryMuscle`). Writes
  `movementGroup: 'core'`, `primaryMuscle: 'abs'` in addition to the level.

**Safety-check redesign, not just a content change:** the original script's
drift-guard skipped a document if its `targetPrograms` array was non-empty AT ALL. That
was correct for the original 20 (genuinely empty). It's wrong for the 3 plank-family
items, which legitimately already have other program levels — skipping them would have
silently no-op'd 3 of the 12. The guard is now per-`programId` (skip only if a `core`
entry already exists — idempotent) and, separately, per-tagFix field (skip if
`movementGroup`/`primaryMuscle` are no longer null).

**New: `PENDING_CANDIDATES`.** "עמידת כלב רגל ויד נגדית" (bird dog) — a 3rd core-detector
miss found while triaging, not part of your original approved list. Always shown in the
dry-run diff (so you can review it), but requires the separate `--include-pending` flag
to ever be written — never bundled silently into the approved 12.

**"needsReview" flag.** "שכיבות סמיכה לשכמות" keeps your §12.4-row-7 caution
("ייתכן שזה תרגיל אקטיבציה/חימום") as a printed warning banner in the diff — still part
of the approved 12, but flagged so you don't wave it through on autopilot.

**Status:** dry-run re-verified against live data after narrowing — 12/12 approved
candidates resolve correctly (3 idempotency-guarded on their real existing state, 2
tagging diffs shown correctly), 1/1 pending candidate shown separately. Zero writes.

```
npx tsx scripts/audit/apply-level-triage.ts                          # dry run (default)
npx tsx scripts/audit/apply-level-triage.ts --apply                  # writes the 12 approved
npx tsx scripts/audit/apply-level-triage.ts --apply --limit 3        # staged rollout
npx tsx scripts/audit/apply-level-triage.ts --apply --include-pending # also writes bird dog
```

Backups are written to `scripts/_backups/level-triage/<runId>/` (one JSON file per
touched document, plus a `_manifest.json`) **before** each write.

**Rollback after an `--apply` run:** for each document you want reverted, restore its
`data` object from the backup JSON:
```ts
const backup = JSON.parse(fs.readFileSync('scripts/_backups/level-triage/<runId>/<id>.json', 'utf-8'));
await db.collection('exercises').doc(backup.id).set(backup.data);
```
Diff the backup against the doc's current state first if it's been edited again since.

---

## Part 3.1 — Graduated CLIFF fallback

**Commit:** `70661a91`. Unchanged since the first session — see the original writeup
below.

**Files:** `InputSanitizerMiddleware.ts` (main fix), `home-workout.service.ts` (call
site + context threading), `workout-generator.types.ts` (2 new optional context
fields), `WorkoutGenerator.ts` (1 line — seeds `pipelineLog` from
`context.earlyPipelineNotes`).

**Before:** `resolveExercisePool` returned `levelMatched.length >= 4 ? levelMatched :
allExercises` — below 4 survivors, the ±3 level filter was abandoned entirely and every
exercise in the whole catalog became a candidate.

**After — three graduated steps, logged at every tier, never silent:**
1. Widen tolerance ±3→±5, retry.
2. Still thin, and the domain is a skill track (`human_flag`, `handstand`,
   `handstand_pushup`, `planche`, `front_lever`, `muscle_up`, `one_arm_pullup`)? Fall
   back to its healthy baseline parent domain(s) (`push`/`pull`/`legs`).
3. Still thin — return what exists as-is (never the full catalog), with
   `relaxedConstraints` on the generation context and a `pipelineLog` entry.

**Rollback:** `git revert 70661a91`. Self-contained.

---

## Part 3.2 — Remove the globalLevel substitution

**Commit:** `0c13685d`. Unchanged since the first session.

**Before:** two spots inside `applyDifficultyFilter` fell back to `context.userLevel`
(`globalLevel` — a closed 1-10 scale derived purely from lifetime XP) whenever a
domain-specific or exercise-specific level couldn't be resolved. No mapping exists
anywhere between that scale and the open-ended per-domain program-level scale.

**After:** an explicit L1 floor (matching `resolveExerciseLevelForDomains`' own
convention), tracked via a `domainLevelAssumed` flag and a `pipelineLog` entry.

**Rollback:** `git revert 0c13685d`. Independent of everything else.

---

## Part 2 (of this session's "Part 4" prompt) — Core-slot gate

**Commit:** `3fd9ac7c`.

**Files:** `workout-selection.utils.ts` (`matchesDomainForSlot`/`hasExplicitCoreLevel`
helpers + 5 call-site updates inside `selectExercisesWithDomainQuotas`),
`core-slot-gate.test.ts` (new, 10 tests).

**The problem (00-PLAN.md §12.3):** 9 `human_flag` exercises + "כפיפת ירך על הגבהה"
carry `movementGroup: 'core'`, so `exerciseMatchesProgram(ex, 'core')` returns `true`
and they're legitimate candidates for the core slot of every regular full-body workout.
None has a `targetPrograms[core]` entry, so level resolution falls through to whichever
OTHER entry exists (pull/push/human_flag/legs) and compares that number against the
user's core level — the cross-scale bug from `01-MAP.md` §8.

**David's chosen fix:** gate SLOT ENTRY, not classification. `movementGroup` is
untouched (it also drives Smart Swap family-matching and `applyPhysiologicalSort`'s
ordering tier — changing it to fix classification would have broken both).
`exerciseMatchesProgram` itself is unchanged too — still used as-is for
classification/sorting everywhere else in the codebase. The new rule lives exactly
where an exercise is chosen to fill a domain's slot: `selectExercisesWithDomainQuotas`
(the multi-domain quota-filling function — confirmed as the right location; matches
"every regular workout" in the bug report, since it's what full-body sessions use).

**What was actually gated, precisely:** of 5 domain-matching call sites inside that
function, only 3 were genuinely open (the main pool filter, its ±3-relaxed retry, and
the Step-3 broad-fallback). The other 2 (Step 1/2 rescue tiers) were already
incidentally safe — they're paired with a separate `belongsToDomain` check that (since
`DOMAIN_PARENT_MAP` has no `'core'` entry) already required a real `targetPrograms`
match. All 5 were updated to the new helper anyway, for consistency and so the
correctness doesn't depend on an unrelated function's side effect.

**`PoolFactory.filterForDomain` needs no change.** Investigated and confirmed: the
single-domain "core only" session path already excludes these exact exercises today —
its own `targetPrograms`-based domain check (not `exerciseMatchesProgram`) already
returns `false` for an exercise with program entries that don't include the requested
domain. Its own code comment (`PoolFactory.ts` ~line 404-407) states this exact purpose.
No change was made there.

**A real edge case found and documented, not hidden:** the function's separate,
later backfill pass (`takeFromPool`) was never domain-restricted for ANY domain, by
design — it fills remaining session slots by score/priority regardless of domain match.
In a pathologically thin candidate pool (nothing else available at all), a core-tagged-
but-unleveled exercise could still appear via that pass. This does **not** reintroduce
the cross-scale bug — a backfilled exercise's own level still resolves correctly via
its real `push`/`pull`/`human_flag` entry downstream in `applyDifficultyFilter` (which
tries the exercise's own `targetPrograms` matches before ever falling back to a
`movementGroup` guess). Documented in the code comment on `matchesDomainForSlot` and in
a dedicated, explicitly-labeled test (`core-slot-gate.test.ts`, "known residual" describe
block) rather than silently asserted away.

**⚠️ DEPENDENCY — must land with Part 2's migration (commit `54cf8945`):** this gate
only admits exercises that already have a real `targetPrograms[core]` entry. Before the
migration runs, `פלאנק`/`פלאנק על הברכיים`/`פלאנק עליות ונגיעות בכתפיים`/`אופניים`/
`עליות נגיעה בבהונות בשכיבה` have NO core entry either — the gate would exclude them
from the core slot too, along with the 9 flags it's meant to catch. **Do not run this
code without also running the migration** (or, if you must ship the gate first for some
reason, expect the core slot to be temporarily thinner than intended until the migration
lands).

**Verified:** `tsc --noEmit` unchanged (489/489, zero new). 10/10 new tests, stable
across 8 repeated runs (ruled out flakiness from the shuffle logic's `Date.now()`-based
seed). Full `workout-engine` suite: 439/439 passing (up from 429 — the +10 is this
commit's own tests; same 2 pre-existing, unrelated `process.exit()`-based suite
failures as every prior verification pass in this branch).

**Rollback:** `git revert 3fd9ac7c`. Independent of Fix 3.1/3.2. If reverted, also revert
or hold back the migration's core-related writes (Part 2), since without the gate a
migrated plank/אופניים would work fine on its own, but there'd be no reason to have
rushed the gate in the first place.

---

## Part 3 (of this session's "Part 4" prompt) — Admin screen

**Commit:** `0de63ae6`.

**Files:** `src/app/admin/unreachable-exercises/page.tsx` (new), `src/app/admin/layout.tsx`
(nav registration — 3 edits: both `sectionPaths.marketing` arrays, the `production`
sub-filter array, and the sidebar link itself, placed immediately below `content-matrix`'s).

**What:** a live, permanent screen (not a one-off report, per David's own proposal in
`00-PLAN.md` §13) scanning the catalog client-side and flagging every exercise
unreachable by any real path, with independently-filterable reasons:

| Reason | Real logic reused (not reimplemented) |
|---|---|
| `NO_EXECUTION_METHODS` | `execution_methods.length === 0` |
| `NO_LOCATION_COVERAGE` | `selectMethodForContext` (the actual production selector) tested against all 10 `ExecutionLocation` values, with the same baseline gear (`ESSENTIAL_PARK_GEAR`/`ASSUMED_HOME_GEAR`) the generator itself injects |
| `CORE_NO_CORE_LEVEL` | `exerciseMatchesProgram(ex, 'core')` (classification, unchanged) AND `!hasExplicitCoreLevel(ex)` (the exact function the core-slot gate above uses — imported, not re-derived) |
| `NO_LEVEL` | No `targetPrograms` and no `programIds` |
| `NO_ROLE_OR_TAG` | No `exerciseRole` and no `mobility`/`flexibility`/`hiit_friendly` tag — the exact condition from `warmup.service.ts:394` and `cooldown.service.ts:47,101`, cited verbatim |

An exercise can carry more than one reason at once (most of the original 70 are both
`NO_LEVEL` and `NO_ROLE_OR_TAG`) — all applicable reasons are shown and independently
filterable, not collapsed to a single bucket.

**Style/placement:** modeled directly on `/admin/content-matrix` — the closest existing
page by architecture (client-side fetch of the whole catalog, in-browser analysis, stat
cards, search/filter, CSV export via `Blob`). Same nav section, sidebar link placed
immediately next to it.

**⚠️ Not smoke-tested live.** `axioms.md` §11 forbids running `next dev`/`next build` in
this environment, so this page has not been clicked through in an actual browser.
Verified via `tsc --noEmit` (zero new errors, confirming every import resolves and types
check) and close comparison against the working `content-matrix` reference page's exact
patterns for the parts that were copied (fetch/loading/error states, Blob export,
Tailwind classes). **Please click through it once before relying on it** — this is
exactly the kind of gap "TSC clean ≠ works" (CLAUDE.md's own verification-first
principle) exists to catch, and this is the one piece of this whole session that
principle couldn't be applied to end-to-end.

**Rollback:** `git revert 0de63ae6`. Fully independent — removes the page and the 3 nav
edits cleanly.

---

## Test/type verification methodology (this session)

- `npx tsc --noEmit -p tsconfig.json`, checked after every commit — total error count
  held at 489 throughout (the pre-existing baseline), confirming zero new type errors
  anywhere in the codebase at every step, not just in touched files.
- `npx vitest run src/features/workout-engine` — 439/439 actual test assertions pass
  (429 from the first session + 10 new from `core-slot-gate.test.ts`). The same 2
  pre-existing, unrelated `process.exit()`-based suite failures
  (`hybrid-orchestrator.test.ts`, `hybrid-runtime.test.ts`) persist, confirmed via the
  first session's `git stash` before/after comparison — neither imports anything this
  branch touches.
- `core-slot-gate.test.ts`'s Tier-2 integration tests were run 8 times total across two
  separate checks to rule out flakiness from `DEBUG_SHUFFLE_ON_REFRESH`'s
  `Date.now()`-based seed — stable every time once the tests were corrected to isolate
  the domain being tested (see the commit message for the debugging story: an earlier
  draft of these tests had a real fixture bug, not a code bug — caught and fixed before
  committing, not shipped and then discovered).

---

## Open items — found during this work, explicitly not fixed here

1. **Most of the Group-A (warmup/stretch) content was unreachable** — now has a
   permanent live screen to track it (`/admin/unreachable-exercises`, Part 3 above).
   Fixing the underlying content (adding `exerciseRole`/tags to ~40 exercises) is still
   your call, exercise by exercise — the screen makes it visible and CSV-exportable,
   it doesn't fix the data.
2. **The bird-dog candidate** — shown in the migration script's dry-run diff, requires
   your explicit `--include-pending` to write. Not auto-approved.
3. **`שכיבות סמיכה על טבעות 75` and the other remaining Group-C items** — no confident
   comparable found to propose a level. Still listed in `03-LEVEL-TRIAGE.md` with
   exactly what's missing to decide each one.
4. **Junk records (Part 1c)** — identified, not deleted. Recommendations given, your
   call on execution.
5. **The resistance-band exercises** — intentionally frozen per your decision, not
   tagged or leveled. Will keep showing on the new admin screen as unused content until
   the generator gets a load-tracking mechanism (out of scope, a separate feature).

None of these require code changes to resolve — they're data/content decisions or
your own review, laid out for you to make.
