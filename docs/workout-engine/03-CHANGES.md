# Level-Integrity Fix — What Changed, Why, and How to Roll Back

> Branch: `fix/exercise-level-integrity` (rebased onto current `main` — see "Branch
> sync" below; commit SHAs in this document are post-rebase and will not match
> anything you may have seen quoted from an earlier version of this file).
> No push happened — everything below is local commits only, waiting for review.
> **No Firestore data was touched by anything in this branch.** The migration script
> was never run — David tagged the approved exercises by hand instead (see Part 2).

---

## Branch sync (this session)

The branch had fallen behind `main` by 11 commits, including `790d8b65` "fix(home):
real-steps pre-workout safety-net slot upgrade (Part 3/4)" — the task referenced this
commit as `9dec99e5`, a different SHA for the same content (evidently committed via a
different clone before landing on `main`; author, date, message, and diff are
identical). Ran `git fetch && git rebase main`. Clean rebase, no conflicts — 3 commits
that were already identical to ones now on `main` were automatically skipped.

**Verified:** `git diff main..fix/exercise-level-integrity` for `src/app/home/page.tsx`
and `src/features/home/components/PreWorkoutCardRenderer.tsx` is **empty** — zero
lines. The safety-net feature was never at risk; the branch was simply cut before that
commit existed upstream, which made a stale `git diff` look destructive when it wasn't.

Rebasing rewrote every commit SHA on this branch. All SHAs below are current.

---

## Summary table

| # | Commit | What | Firestore impact | Reversible how |
|---|---|---|---|---|
| 1 | `50536557` | docs baseline: `01-MAP.md`, `02-CATALOG-AUDIT.md` + CSVs, the audit script, `00-PLAN.md` (v1) | None (docs only) | `git revert 50536557` |
| 2 | `b1aa0850` | `03-LEVEL-TRIAGE.md` (Part 1 report) | None (docs only) | `git revert b1aa0850` |
| 3 | `66eaaacb` | `apply-level-triage.ts` v1 — 20-item migration script | None — superseded before ever running | `git revert 66eaaacb` (no-op given #6/#8 below) |
| 4 | `229a3ec0` | Fix 3.1 — graduated CLIFF fallback | None (code only) | `git revert 229a3ec0` |
| 5 | `60bf3581` | Fix 3.2 — remove globalLevel substitution | None (code only) | `git revert 60bf3581` |
| 6 | `9b615708` | `03-CHANGES.md` v1 | None (docs only) | superseded by this file |
| 7 | `c4534a8b` | `00-PLAN.md` — your §12-14 decisions, checkpointed | None (docs only, your own edit) | `git revert c4534a8b` |
| 8 | `07f83a17` | `apply-level-triage.ts` narrowed to your approved 12 + 1 pending | None — never run | `git revert 07f83a17` |
| 9 | `35f5626e` | Core-slot gate — `workout-selection.utils.ts` + new test file | None (code only) | `git revert 35f5626e` |
| 10 | `8dfa7f29` | New admin screen — `/admin/unreachable-exercises` | None (code only, adds a page) | `git revert 8dfa7f29` |
| 11 | `9eb593d1` | `03-CHANGES.md` v2 | None (docs only) | superseded by this file |
| 12 | *(this commit)* | Branch rebase note, script marked unused, `hasExplicitCoreLevel` level-validity fix + tests, `04-VERIFY.md`, this update | None (docs + code, no data) | `git revert <this SHA>` |

**Dependency, not independent:** #8 (the narrowed migration — now moot, see Part 2) and
#9 (the core-slot gate) needed to land together conceptually; in practice David tagged
the data by hand, so the dependency is satisfied by his manual edits rather than by
running #8. Every other row is independently revertible.

---

## Part 1 — Level triage report

Unchanged since the first session. `docs/workout-engine/03-LEVEL-TRIAGE.md` classified
the 70 orphaned exercises, the 55 core exercises' level gaps, and 6 junk records.
Zero writes. Nothing to roll back beyond the doc itself.

---

## Part 2 — Migration script: superseded by manual tagging, not executed

**Status: `scripts/audit/apply-level-triage.ts` was never run, at either the original
20-item version or the narrowed 12-item version.** David reviewed the catalog by hand
and entered levels himself, directly in Firestore, for the approved exercises — with
several values different from what the script proposes (see `04-VERIFY.md` §2 and §4
for the exact deltas). The script's header now says this explicitly and warns against
running it:

> ⚠️ NOT EXECUTED — kept as documentation only, do not run. [...] If you're tempted to
> run this: don't. Re-check 04-VERIFY.md first — the live data has already diverged
> from the GROUP_B array below by design.

**What actually happened to the data**, verified against live Firestore
(`docs/workout-engine/04-VERIFY.md`, full detail):
- 8 of the 9 targeted exercises now carry real levels, hand-entered by David (values
  mostly match the proposal; two notable exceptions documented in `04-VERIFY.md` §4).
- 1 (`פיסטול סקוואט שלילי שמאל`) was **deleted** rather than leveled — its confusingly-
  named duplicate survives, still unleveled (`04-VERIFY.md` §5).
- 3 plank-family exercises + `אופניים`/`עליות נגיעה בבהונות בשכיבה` (5 of the 12) now
  have real core levels, matching the proposal almost exactly.
- The bird-dog candidate (`PENDING_CANDIDATES` in the script) was **not** touched —
  still fully untagged.
- The 4 burpee variants and 9 band exercises remain correctly unleveled, per David's
  own §12.1/§12.2 decisions — this is the intended, not a failure state.

**No rollback needed for Part 2** — nothing was ever written by this script, so there's
nothing to undo. The script itself is retained purely as a historical record of the
comparables/reasoning that went into the original proposal; do not execute it.

---

## Part 3.1 — Graduated CLIFF fallback

**Commit:** `229a3ec0`. Unchanged since the first session.

`InputSanitizerMiddleware.resolveExercisePool` no longer silently returns the full
catalog when fewer than 4 exercises survive the ±3 level filter. Three graduated,
logged steps instead: widen to ±5, fall back to a skill's healthy baseline parent
domain, or return what exists with `relaxedConstraints` + a `pipelineLog` entry.
Re-verified in `04-VERIFY.md` §3: this fires exclusively inside skill-track programs
(146 CLIFF cells, all in `human_flag`/`handstand`/`handstand_pushup`/`core`@L18) — zero
in `push`/`pull`/`legs`, confirmed unchanged after David's manual edits.

**Rollback:** `git revert 229a3ec0`.

---

## Part 3.2 — Remove the globalLevel substitution

**Commit:** `60bf3581`. Unchanged since the first session.

`applyDifficultyFilter`'s two `context.userLevel` (globalLevel) fallbacks — used
whenever a domain-specific or exercise-specific level couldn't be resolved — are now
an explicit L1 floor, tracked via `domainLevelAssumed` + a `pipelineLog` entry, never a
cross-scale substitution.

**Rollback:** `git revert 60bf3581`.

---

## Part 2 (of the previous session's Prompt 4) — Core-slot gate

**Commit:** `35f5626e`, **now updated by this session's commit** (see below).

`selectExercisesWithDomainQuotas` requires an explicit `targetPrograms[core]` entry to
fill the core domain slot — `movementGroup`/`exerciseMatchesProgram` classification
stays untouched (also drives Smart Swap + `applyPhysiologicalSort`, changing it would
have broken both). Full original writeup in the prior version of this file; unchanged
except for the fix below.

### This session's fix to the gate itself (Step 4)

**Problem found:** `hasExplicitCoreLevel` checked only for the *presence* of a
`{programId: 'core', ...}` entry, not that it carried a valid `level`. A malformed
entry — `{programId: 'core'}` with no `level` at all, or `level: 0`/negative — would
have passed the gate exactly like a real one, silently readmitting exactly the kind of
broken data this whole effort exists to keep out.

**Fix:** `hasExplicitCoreLevel` now also requires `typeof tp.level === 'number' &&
tp.level > 0`. 4 new tests added (`core-slot-gate.test.ts`): missing `level`, `level:
0`, negative `level`, non-numeric `level` — all correctly rejected.

**Verified against live data:** zero such malformed entries exist in the catalog today
(`04-VERIFY.md` §4) — this fix is precautionary, guarding the *next* manual edit, not
correcting anything currently broken.

**Verified:** `tsc --noEmit` unchanged (489/489, zero new). Full `workout-engine`
suite: 443/443 passing (439 + 4 new). Full repo `npm test`: 1189/1191 passing — the 2
failures (`logMultiCategoryWorkout.smoke.test.ts`, `getWindowStart.test.ts`) are in
code this branch never touches (activity streak logic, arena date-window logic; `git
log main..HEAD` for both paths is empty) and both read as date/wall-clock-dependent —
see "Test verification" below for the full accounting.

**Rollback for just this session's fix:** revert the `hasExplicitCoreLevel` level-
validity check specifically, or `git revert <this commit>` for everything in this
session at once (see the numbered list at the end).

---

## Part 3 (of the previous session's Prompt 4) — Admin screen

**Commit:** `8dfa7f29`. Unchanged since the first session. `/admin/unreachable-exercises`
— live, permanent, reason-classified view of every exercise no real path can select.
Full writeup in the prior version of this file. Still not smoke-tested in a browser
(axioms.md §11) — still worth a click-through before relying on it.

**Rollback:** `git revert 8dfa7f29`.

---

## Part 3 (of this session) — Live-data verification

**What:** `docs/workout-engine/04-VERIFY.md` — re-ran the catalog audit against live
Firestore and compared before/after David's manual tagging pass. Covers exactly the 4
questions asked: remaining orphaned count + classification, the core-slot gate
dependency (the list of exercises that will still fall out — 9 flags + כפיפת ירך,
exactly as expected, nothing new), the coverage matrix re-check (146/88, unchanged,
confirmed same composition not just same totals), and a data-entry error/outlier scan
(0 structural errors, 1 notable family-deviation to flag).

Also surfaced two things not explicitly asked for: a deleted exercise whose duplicate
survived instead (§5.1), and the previously-unknown `draft` field's two different
shapes across the catalog (§5.2) — both flagged for David's attention, neither acted on.

**Nothing to roll back** — report only.

---

## Test verification (this session, full accounting)

- `npx tsc --noEmit -p tsconfig.json` — **489/489 baseline, zero new errors.** Diffed
  against the pre-session baseline; the only differences found were TypeScript's
  internal union-type member ordering in a handful of pre-existing error messages
  (cosmetic, not semantic — same errors, same count, same files).
- `npx vitest run src/features/workout-engine` — **443/443 passing** (up from 439 —
  the 4 new tests from this session's `hasExplicitCoreLevel` fix). Same 2 pre-existing,
  unrelated `process.exit()`-based suite failures as every previous check on this
  branch (`hybrid-orchestrator.test.ts`, `hybrid-runtime.test.ts`).
- `npm test` (full repo) — **1189/1191 passing.** Two additional failures outside the
  workout-engine scope, both confirmed unrelated to this branch:
  - `src/features/activity/store/__tests__/logMultiCategoryWorkout.smoke.test.ts` —
    a streak-threshold assertion.
  - `src/features/arena/services/__tests__/getWindowStart.test.ts` — a daily/weekly/
    monthly window-ordering assertion, using real wall-clock time, not a fixed mocked
    date — reads as calendar-boundary-dependent.
  
  **Confirmed pre-existing, not a regression** (2026-09-04 follow-up, see
  `04-VERIFY.md` §6): beyond the `git log main..HEAD` check (empty for both paths), ran
  both files directly against a separate worktree checked out at `main`'s exact current
  tip — both fail identically there too, same assertions, same lines. Not fixed — out
  of scope for a level-integrity task — but definitively unrelated to this branch, not
  merely assumed to be.

---

## Open items — unchanged from before, plus two new ones from this session

1. Most of the Group-A (warmup/stretch) content is unreachable — tracked live via
   `/admin/unreachable-exercises` now, not a frozen report.
2. The bird-dog candidate — still untagged, still requires a decision + your own
   `--include-pending`-equivalent manual entry (the script itself is retired).
3. `שכיבות סמיכה על טבעות 75` and the other remaining Group-C items — still no
   confident comparable, still listed in `03-LEVEL-TRIAGE.md`.
4. Junk records — `(EMPTY NAME)` / `עותק של פיסטול סקוואט שלילי שמאל` still exist,
   identified, not deleted.
5. Resistance-band exercises — intentionally frozen, still showing on the admin screen.
6. **New: the deleted/duplicate pistol-squat pair (`04-VERIFY.md` §5.1)** — worth a
   cleanup pass whenever convenient.
7. ~~The `draft` field's two shapes~~ — **resolved, 2026-09-04** (`04-VERIFY.md` §5.2):
   traced end-to-end, confirmed to be purely an exercise-editor autosave buffer, dropped
   during normalization, never read by workout selection. No effect on any exercise's
   reachability. No `DRAFT_UNPUBLISHED` reason was needed on `/admin/unreachable-exercises`.

None of these require code changes — they're data/content decisions for David.

---

## Addendum — Generator-vs-David benchmark work (separate deliverable, same branch)

> **This is a different body of work from everything above.** The level-integrity
> fix (Parts 1-4, rows 1-12 in the summary table) is about exercise-level data
> integrity. What follows — `docs/workout-engine/05-BENCHMARK.md` and its supporting
> scripts — is a macro/micro comparison of the generator's output against David's
> hand-built corpus, plus two real bugs found and fixed along the way. It landed on
> the same branch because that's where the session continued, not because the two
> are related. Consider it for a separate PR/merge decision if that's cleaner.

| # | Commit | What | Firestore impact | Reversible how |
|---|---|---|---|---|
| 13 | `de4f245a` | Extract `buildMockProfile` to a shared module (needed for a headless script to call `generateHomeWorkoutTrio` the way the admin simulator does) + add `better-sqlite3` devDependency | None (code + package.json) | `git revert de4f245a` |
| 14 | `51057066` | Add `legacy-workouts.sqlite` (David's 614-workout corpus) + `exercise-inventory.csv` as input data | None (data files, not Firestore) | `git revert 51057066` |
| 15 | `17c66800` | `build-exercise-bridge.ts` — maps 366 new-catalog exercises to the legacy catalog by normalized-name similarity (189/366 bridged) | None (read-only, writes only to `snapshot.sqlite`) | `git revert 17c66800` |
| 16 | `1e527b86` | `build-snapshot.ts` v1 — runs the real `generateHomeWorkoutTrio` across a level×duration×location×domain×daysInactive matrix (1,260 calls) | None (read-only Firestore, `skipCycleRestart:true` on every call) | `git revert 1e527b86` |
| 17 | `f60b6df6` | `05-BENCHMARK.md` v1 + `analyze-benchmark.ts` — first macro/micro comparison report | None (docs + read-only script) | `git revert f60b6df6` |
| 18 | `e862ae9f` | **Fix**: lock core main exercises to exactly 2 sets in `BudgetDistributor.ts` (David's corpus convention — was inheriting a generic 3-5 set range) | None (code only) | `git revert e862ae9f` |
| 19 | `516a90df` | **Fix**: same lock for a second, independent path — `trio-modifiers.service.ts`'s naked-backfill (bolt 1 / Flow-Regression), found by tracing a live "אופניים sets=3" case | None (code only) | `git revert 516a90df` |
| 20 | `66d9a9c2` | **Fix**: authenticate `build-snapshot.ts` via a Firebase Admin custom token — `programLevelSettings` requires `isAuthenticated()`, unlike the public-read catalog collections; the first benchmark run measured "0% paired work" as a methodology gap, not a real finding | None (still read-only + `skipCycleRestart:true`) | `git revert 66d9a9c2` |
| 21 | `67009080` | `build-session-volume.ts` — adds `session_volume`/`legacy_session_volume` tables (working sets per muscle group — the metric the cited research says actually matters, not exercise count) | None (read-only, writes only to `snapshot.sqlite`) | `git revert 67009080` |
| 22 | `fad33b60` | `05-BENCHMARK.md` v2 — refreshed with authenticated protocol data, post-fix core conformance (46.7%→90.7%), and the new session-volume section | None (docs + regenerated audit artifacts) | `git revert fad33b60` |
| 23 | *(this commit)* | This addendum | None (docs only) | `git revert <this SHA>` |

**Dependency note:** #18/#19 (the two core-lock fixes) needed to land *before* the
final `build-snapshot.ts` re-run in #22, so the refreshed report reflects fixed
behavior rather than a stale mid-fix snapshot — confirmed by re-running the full
matrix after each fix (three total re-runs this session, all 0 errors).

**Known residual, not chased further (documented, not hidden):** core-block
conformance is 90.7%, not 100%. Two small, distinct injection paths still bypass
both locks — full detail in `BudgetDistributor.ts` next to `CORE_FIXED_SETS` and in
`05-BENCHMARK.md` §3.3. Would need tracing `WorkoutGenerator.ts`'s post-`distribute()`
protocol-injection step (Step 5b onward) the same way this session traced the
naked-backfill path.

**Verification:** `npx tsc --noEmit` — 489/489 baseline maintained, zero new errors
in any file this addendum touches. `npx vitest run src/features/workout-engine` —
all individual tests pass (10 new: 7 in `core-set-lock.test.ts`, 3 in
`trio-modifiers-core-set-lock.test.ts`); the only failing test *files* are the same
2 pre-existing hybrid `process.exit()` artifacts present since before this branch
existed.

---

## Addendum 2 — reps-vs-time flag bug (docs/workout-engine/06-TIME-VS-REPS.md)

> Same relationship to the level-integrity fix as Addendum 1 above: a separate
> deliverable, same branch. Triggered by a task built directly on top of
> Addendum 1's `05-BENCHMARK.md` §5 methodology (same snapshot.sqlite pipeline).

**The bug:** `isTimeBasedExercise` (`workout-budgeting.utils.ts:348`) is a pure,
deterministic function of the exercise object alone — the same exercise MUST get
the same answer everywhere. Live snapshot data proved it didn't: the same
`exercise_id` ("שכיבות סמיכה ברכיים") showed `is_time_based=0` (55 occurrences) AND
`=1` (38 occurrences), both `exerciseRole='main'`. The function itself was never
wrong — six OTHER places reimplemented, hardcoded, or forgot to re-derive the flag.

| # | Commit | What | Firestore impact | Reversible how |
|---|---|---|---|---|
| 24 | `74de3ecd` | **Fix**: `warmup.service.ts` + `cooldown.service.ts` — both reimplemented a subset of `isTimeBasedExercise` inline (cooldown's was the narrowest — only `type==='time'`, no straight_arm, no name heuristic) | None (code only) | `git revert 74de3ecd` |
| 25 | `e0d9bde6` | **Fix**: `home-workout.service.ts`'s `generateRecoveryWorkout` — hardcoded `reps:15` for every exercise in the weekly-budget-exhausted "יום מנוחה" pool regardless of hold-vs-reps nature, plus the same reimplementation gap. This is the exact path that produced the task's own worked example. | None (code only) | `git revert e0d9bde6` |
| 26 | `12a1d264` | **Fix**: `trio-modifiers.service.ts`, two independent bugs — `applyEssentialGearFilter`'s naked-backfill (hardcoded `isTimeBased:false, reps:10` for every raw-pool candidate) and `applyFlowRegression`'s exercise-swap (reassigns `.exercise` on a level-regression but never recomputed `isTimeBased`/`mechanicalType` at all — the more severe of the two, and the ACTUAL root cause of the task's worked example, not #25 as first assumed) | None (code only) | `git revert 12a1d264` |
| 27 | `a7db6b72` | **Fix**: the canonical function itself — `getLocalizedText` defaults to `'he'` and this catalog is Hebrew-only in practice, so the `hold`/`plank`/`hang` (Latin) name-heuristic keywords could never fire on real data; added `'פלאנק'` as an explicit Hebrew keyword after a new test caught it returning `false` for an obvious plank fixture | None (code only) | `git revert a7db6b72` |
| 28 | `905d63c4` | **Fix**: `tabata.block.ts`'s pool-injection — hardcoded `isTimeBased:false` one line below `reps: TABATA_CLASSIC.workSec` (a SECONDS value), directly self-contradicting. Now `true` — the ONE declared, intentional exception (a tabata interval is always time-boxed). The OTHER tabata path (stamping an already-selected exercise, not rebuilding it) correctly does NOT touch `isTimeBased` — verified that's real, valid behavior (a rep-based exercise legitimately does "max reps in the interval"), left alone | None (code only) | `git revert 905d63c4` |
| 29 | `49929e7a` | `docs/workout-engine/06-TIME-VS-REPS.md` Parts 2+3 — CMS `type`-field cross-reference audit (372 exercises, raw Firestore reads) + severity-ranked 40-row manual review list (structural signals only: tier-vs-reps, level-vs-reps, level-vs-hold, >=2x corpus deviation on the 189 bridged exercises) | None (docs + read-only scripts) | `git revert 49929e7a` |
| 30 | `42110de6` | `snapshot.sqlite` refresh reflecting all 6 fixes | None (local data file) | `git revert 42110de6` |
| 31 | *(this commit)* | This addendum | None (docs only) | `git revert <this SHA>` |

**A real self-correction, kept in the record rather than quietly fixed:** this
session's own `build-time-vs-reps.ts` first shipped an explanation for the
"`type='time'` + dynamic `movementGroup`" pattern (55 exercises) claiming
`isTimeBasedExercise` overrides an explicit `type='time'` back to `false` — plausible
by analogy to how the function overrides a MISSING type, but never actually verified
against the function's real control flow (`type==='time'` is checked first and
returns immediately — the override never fires). Caught by testing the exact fixture
shape before publishing the report, not by a later reviewer. Corrected in place, both
in the script and the committed doc — see `06-TIME-VS-REPS.md` §3's own note.

**A wrong first hypothesis, also kept in the record:** the task's own worked example
("שכיבות סמיכה ברכיים" showing `reps=15`/`is_time_based=1`) was initially attributed
to `generateRecoveryWorkout` (#25) purely because both share `reps=15` and a
`method_location='park'` signature — a coincidence, not a match. A live trace (custom
Firebase Admin token + direct `generateHomeWorkoutTrio` calls, not guessing from
static reads) proved `generateRecoveryWorkout`'s fixed logic could not produce that
exact combination, and traced the real source to `applyFlowRegression` (#26) instead.

**Verification:** `npx tsc --noEmit` — 489/489 baseline maintained, zero new errors.
`npx vitest run src/features/workout-engine` — 465/465 individual tests pass (12 new:
7 in `isTimeBasedExercise-consistency.test.ts`, 3 in the tabata pool-injection test,
1 combined naked-backfill/flow-regression addition to
`trio-modifiers-core-set-lock.test.ts`, plus its pre-existing 3); same 2 pre-existing
hybrid `process.exit()` test-file failures, unrelated. Live re-verification: re-ran
the full snapshot matrix after all 6 fixes — the contradictory-flag count went from
20 exercise_ids to 0 real contradictions (5 remaining exercise_ids are 100% explained
by the declared tabata exception, confirmed by checking `protocol_block` on every
occurrence, not asserted).

## Addendum 3 — Above-level reps bug (hard/elite tier) + level-sanity report

David's task, 4 parts. Parts 1-3 are code fixes + verification; Part 4 is a
read-only report only (no code change, no migration).

| # | Commit | What | Firestore impact | Reversible how |
|---|---|---|---|---|
| 32 | `a356b27c` | **Fix**: `mock-profile.utils.ts` — `progression.tracks` entries used `{level, progressPercent}` instead of `DomainTrackProgress`'s real `{currentLevel, percent}` (`progression.types.ts:71-73`); `progression.domains` in the same file already used `currentLevel` correctly | None (code only) | `git revert a356b27c` |
| 33 | `b649043a` | **Fix**: `workout-budgeting.utils.ts` — hard/elite (delta>=1) reps now come from `TIER_TABLE` (1-3), not `DIFFICULTY_VOLUME[difficulty]` (bolt-indexed); +7 tests | None (code only) | `git revert b649043a` |
| 34 | `a7cfa22a` | `snapshot.sqlite` refresh reflecting both fixes | None (local data file) | `git revert a7cfa22a` |
| 35 | *(this commit)* | This addendum | None (docs only) | `git revert <this SHA>` |

### Part 1 — mock-profile.utils.ts field-name bug

Fixed as specified: 3 field-name corrections (`domainTracks` entry,
`programTracks` entry, primary `tracks` entry), all `{level, progressPercent}`
→ `{currentLevel, percent}`. Re-ran `build-snapshot.ts` (1260 calls, 0
errors). Effect confirmed real: `context.levelProgressPercent` is no longer
pinned at 0 — match-tier (delta=0) horizontal exercises now actually reach
the `>=50%`-progress staircase branch (`{6,12}`), which was structurally
unreachable before. Overall under-8-reps rate improved 82.6% → 75.9% from
this fix alone (measured before Part 2's fix was applied), confirming the
bias was real and the fix's effect matches its diagnosis.

### Part 2 — hard/elite reps sourced from TIER_TABLE, not the bolt

Fixed exactly as specified — see commit `b649043a` message for the full
diagnosis (comment-vs-code contradiction at `workout-budgeting.utils.ts`
:145/584-588/659). Changed only the fallback used when `getStaircaseRange`
returns `null`, which is structurally only ever true for hard/elite —
verified by reading `getStaircaseRange` itself: match/easy/flow all have
explicit `return` statements before the `null` fallthrough, so the changed
branch is unreachable for those three tiers regardless of any runtime
input. match/easy/flow are therefore untouched by construction, not just by
testing intent. Sets/hold/rest computation for hard/elite is also
untouched — only the reps *range* changed, at both its computation site and
its display-range mirror (`repsRange` shown in the UI now matches what was
actually used to pick `reps`, instead of showing the old bolt-based window).

Added `above-level-reps-tier-table.test.ts`: calls `assignVolume` directly
with delta=1/delta=2 across all 3 bolts, 20 trials each, asserts reps never
exceeds 3.

### Part 3 — Verification

**level_diff>=1 reps by bolt** (target: avg 1-3 in all three):

| Bolt | n | avg reps (before either fix) | avg reps (after both fixes) | max reps (after) | % ≥8 reps (after) |
|---|---|---|---|---|---|
| 1 | 126 | 9.9 (David's own measurement) | **7.9** | 15 | 45.2% |
| 2 | 128 | 4.3 | **2.66** | 12 | 3.1% |
| 3 | 984 | 3.3 | **2.16** | 12 | 0.1% |

Bolt 2 and 3 now meet the target. **Bolt 1 does not** — average dropped from
9.9 to 7.9 but is still well above the 1-3 target, and 45.2% of its
level_diff>=1 exercises still land at 8+ reps. Root cause: a **second,
independent bug**, out of Part 2's scope — see "Not fixed" below.

**match/easy/flow distribution:** verified unaffected by Part 2's code
change (proven above, by construction). Numerically:

| Tier | avg before | avg after | Explanation |
|---|---|---|---|
| easy (delta=-1) | 7.58 | 7.55 | Unchanged (flat range, doesn't depend on levelProgressPercent) |
| flow (delta<=-2) | 7.95 | 7.93 | Unchanged (flat range, doesn't depend on levelProgressPercent) |
| match (delta=0) | 3.82 | 5.99 | **Expected shift from Part 1**, not Part 2 — previously every match-tier exercise was forced into the `<50%`-progress branch (levelProgressPercent always 0); now the `>=50%` branch is reachable, as designed. Histogram shows the increase landing exactly on the staircase's own defined values (7-12, the horizontal `>=50%` range `{6,12}`), not scattered noise. |

One single outlier (1 of 3067 match-tier occurrences, reps=28) exceeds the
staircase's theoretical max of 12 — pre-existing (a smaller version of the
same anomaly, reps=12 at n=69/3124, was already present in the before-fix
data too) and traced to the same second bug noted below, not something
either fix introduced or worsened.

**% of rep-based exercises under 8 reps, before vs after both fixes**
(main-role, non-time-based, all tiers blended):

| | total | under 8 | % |
|---|---|---|---|
| Before (neither fix, git baseline) | 9055 | 7478 | **82.6%** |
| After Part 1 only | 8967 | 6807 | 75.9% |
| After both fixes | 8958 | 6825 | **76.2%** |

This blended metric mixes tiers that are *supposed* to have low reps
(match `<50%` = 2-4, hard/elite = 1-3) with the bug population, so it's a
weak signal on its own — the per-tier breakdown above is the real evidence.
Part 2 barely moves it (75.9% → 76.2%, i.e. bolt 2/3's improvement is
real but bolt 1's residual keeps the blended number roughly flat) —
consistent with bolt 1 remaining broken.

### Part 4 — Level-sanity report (read-only, no code change)

Method (matches the task's own worked example): for every exercise whose
assigned reps ever dropped below 4, extracted a "base name" by splitting on
the first difficulty-qualifier word found (בעזרת/כנגד/בתמיכת/עם/ללא/מול/
לכיוון/טווח/עמוק/קפיצה/קשתים/בהונות/מוגבה/שלילי/אקצנטרי), grouped by
`(movementGroup, base name)`, took each exercise's own modal `resolved_level`
across all runs, compared it to the family's median level, flagged |deviation|
>= 3 (families of size 1 excluded — no comparison signal). Deliberately does
NOT split on a *leading* modifier ("דרגון סקוואט", "פיסטול סקוואט") — those
name a structurally harder movement, not a difficulty qualifier on the same
movement, matching the task's own example (which only splits on a trailing
qualifier).

164 distinct exercises seen with reps<4 at least once → 119 after the
symmetry filter → **15 flagged** at |deviation|>=3:

| Exercise | movementGroup | current level | family median | deviation | suggested level | family size |
|---|---|---|---|---|---|---|
| מתח עם החזקות | vertical_pull | 14 | 8 | +6 | 8 | 10 |
| סקוואט קשתים מוגבה | squat | 10 | 4 | +6 | 4 | 12 |
| שכיבות סמיכה טווח עליון | horizontal_push | 4 | 9.5 | -5.5 | 10 | 6 |
| שכיבות סמיכה טווח תחתון | horizontal_push | 4 | 9.5 | -5.5 | 10 | 6 |
| שכיבות סמיכה קשתים עם רצועות | horizontal_push | 15 | 9.5 | +5.5 | 10 | 6 |
| היפ טראסט | hinge | 1 | 6 | -5 | 6 | 3 |
| שכיבות סמיכה קשתים | horizontal_push | 14 | 9.5 | +4.5 | 10 | 6 |
| דרגון סקוואט טווח חלקי | squat | 6 | 10 | -4 | 10 | 5 |
| סקוואט קשתים | squat | 8 | 4 | +4 | 4 | 12 |
| שכיבות סמיכה | horizontal_push | 6 | 9.5 | -3.5 | 10 | 6 |
| שרימפ סקוואט | squat | 10 | 6.5 | +3.5 | 7 | 4 |
| שכיבות סמיכה קשתים בפישוק | horizontal_push | 13 | 9.5 | +3.5 | 10 | 6 |
| סקוואט טווח חלקי (להגבהה) | squat | 1 | 4 | -3 | 4 | 12 |
| סקוואט בהונות | squat | 7 | 4 | +3 | 4 | 12 |
| סיסי סקוואט טווח חלקי | squat | 7 | 10 | -3 | 10 | 4 |

Reading this table: **positive deviation** (current level higher than the
family) is David's specific concern — an easy-seeming variant tagged too
high, causing exactly the artificially-low reps pattern this whole task is
about (e.g. `סקוואט קשתים` at L8 vs its own family's median L4). **Negative
deviation** (current level lower than the family) is a different signal —
worth a look for catalog consistency, but not directly tied to the reps bug
(e.g. plain `שכיבות סמיכה` at L6 sitting below a family whose median is
pulled up by harder arch/band variants — plausibly correct on its own
merits, not necessarily mistagged).

Two of David's 3 illustrative examples do **not** appear here: `"סקוואט"`
(plain, L3) and `"סקוואט כנגד קיר"` (L5) share a narrow 4-member family
(`{סקוואט, סקוואט כנגד קיר, סקוואט כנגד גומייה, סקוואט בעזרת רצועות}`,
median 3.5) — deviation is only +1.5, under the 3-level threshold.
`"פינגווינים"` (core, L3) has **zero** siblings under any grouping — it's a
structurally undetectable case for a same-family-median method, not a
method failure; it would need to be reviewed by unaided judgment instead.
Flagging this explicitly rather than tuning the method to force those 2
examples to appear.

### Not fixed — a second, independent bug found while verifying Part 3

While tracing why bolt 1 still averaged 7.9 reps (not 1-3) after Part 2's
fix, live-traced actual pipeline output (real `generateHomeWorkoutTrio`
calls, not guessing from static reads) and found: `applyFlowRegression`
(`trio-modifiers.service.ts:493-544`, runs unconditionally for bolt 1 —
`home-workout.service.ts:669` maps `difficulty:1` to
`postProcess:'flow_regression'`) swaps `ex.exercise` to a lower-level
replacement and correctly re-derives `isTimeBased`/`mechanicalType` for the
new exercise (a prior fix, #26 above) — but **never re-derives `ex.reps`**.
The comment at line 537-539 says "Reps are deliberately NOT multiplied,"
which is correct for a same-type swap, but doesn't account for a
time-based→rep-based type flip: a hold exercise's assigned hold *duration in
seconds* (e.g. 15s, the elite/hard tier's `calculateHoldTimeTier` cap)
survives numerically unchanged and gets displayed/stored as a *rep count*
for the new, unrelated rep-based exercise. Confirmed via live trace:
repeated `"...reps=15..."` output across many different swapped exercises,
each carrying a `flow_regression:` reasoning tag — 15 being exactly the
hold-cap value, not a coincidence.

A structurally similar gap exists in `substituteExercise`
(`WorkoutGenerator.ts:373-415`, used by `GuaranteePassRunner`'s
horizontal-guarantee substitutions): it resets `reps` to a generic default
only when `isTimeBased` flips, but never re-derives reps for the *tier* of
the newly-substituted exercise — so a substitute exercise that lands at a
different level_diff than the exercise it replaced can inherit reps
computed for a different tier entirely. This is the most likely explanation
for the residual bolt 2/3 outliers (max=12 despite averages of 2.66/2.16)
and the single match-tier reps=28 outlier noted in Part 3 — both are small
in prevalence (24-56 occurrences out of ~1000+ per bolt; 1 of 3067 for
match) and **pre-existing**, not introduced or worsened by either of
today's fixes (the before-fix match-tier histogram already shows a smaller
version of the same anomaly, reps=12 at n=69/3124).

**Not fixed in this task** — out of Part 2's explicit scope (different
file, different mechanism: reps-carryover on exercise substitution, not the
DIFFICULTY_VOLUME-vs-TIER_TABLE override Part 2 targeted), and touches a
live production swap path recently modified for a related-but-distinct
issue (#26). Needs David's decision on whether to open as a new, separate
fix.

**Verification:** `npx tsc --noEmit` — same pre-existing baseline errors
only (2, at `workout-budgeting.utils.ts` — confirmed identical before/after
via `git stash`, just shifted by added lines), zero new errors anywhere,
including the 2 touched files. `npx vitest run src/features/workout-engine`
— 472/472 individual tests pass (7 new, in
`above-level-reps-tier-table.test.ts`); same 2 pre-existing hybrid
`process.exit()` test-file failures, unrelated.

## Addendum 4 — Exercise-swap volume re-derivation (the "Not fixed" bug from Addendum 3)

David's follow-up task: fix the second bug found while verifying Addendum 3
(bolt 1 stuck at 7.9 avg reps / 45.2% at 8+ despite the TIER_TABLE fix), as
**one shared function**, not three separate patches — the same mistake had
already been fixed three times in three shapes (isTimeBased consistency
#26, naked-backfill hardcoded reps #26, and now reps-on-swap).

| # | Commit | What | Firestore impact | Reversible how |
|---|---|---|---|---|
| 36 | `8f15c09e` | **Fix**: `rederiveVolumeForSwappedExercise` (workout-budgeting.utils.ts) + wired into `applyFlowRegression`, `substituteExercise` (5 call sites), `applyEssentialGearFilter`'s naked-backfill + violation-replacement; also syncs `tier`/`levelDelta`/`programLevel`/`isOverLevel` on every swap | None (code only) | `git revert 8f15c09e` |
| 37 | `51f48cbf` | Regression tests: shared function directly, `substituteExercise` directly, extended existing `applyFlowRegression`/`applyEssentialGearFilter` tests | None (tests only) | `git revert 51f48cbf` |
| 38 | `ab3750dd` | `snapshot.sqlite` refresh reflecting the fix | None (local data file) | `git revert ab3750dd` |
| 39 | *(this commit)* | This addendum | None (docs only) | `git revert <this SHA>` |

### The shared function

`rederiveVolumeForSwappedExercise(newExercise, levelDelta, difficulty, levelProgressPercent?, intentMode?)`,
next to `assignVolume` in `workout-budgeting.utils.ts`. Mirrors exactly what
`assignVolume` computes for `isTimeBased`/`mechanicalType`/`tier`/`reps`/
`repsRange`/`restSeconds` — same `TIER_TABLE`/`getStaircaseRange`/
`calculateHoldTimeTier`/`DIFFICULTY_VOLUME` sources, same ABSOLUTE SKILL
CEILING guard, no new formulas. `levelDelta` is a caller-supplied input
(each call site already resolves the new exercise's level against the
correct domain/program using its own existing logic — this function must
not duplicate or risk diverging from that). Deliberately excludes:
- `sets` — every call site owns its own sets logic (e.g. the core
  set-count lock), which differs per site.
- domain-budget sets derivation, history floor, goal ramp — need full
  pipeline context unavailable at a swap site, and only refine volume
  *within* a tier — they don't correct the tier mismatch this fixes.
- the unilateral skill Rule A/B/C special case — callers with their own
  equivalent guard (`substituteExercise`'s Skill-Rep Guard) keep applying
  it as a deliberate override layered on top of this function's result.

### Every path that changes `.exercise` after assignVolume

Found by grepping the whole codebase for `.exercise =` and `exercise:`
reconstruction sites touching an already-scored `WorkoutExercise`:

1. **`applyFlowRegression`** (`trio-modifiers.service.ts`) — runs
   unconditionally for bolt 1 (`home-workout.service.ts:669` maps
   `difficulty:1` → `postProcess:'flow_regression'`). The dominant source
   of the bug: a hold exercise's assigned duration (e.g. 15s, the
   elite/hard `calculateHoldTimeTier` cap) survived as a REP COUNT once
   swapped to a rep-based replacement. Confirmed via repeated live-trace
   output — `reps=15` across many different swapped exercises, 15 being
   exactly the hold-cap value.
2. **`substituteExercise`** (`WorkoutGenerator.ts`) — used by 5 call sites:
   `GuaranteePassRunner`'s 4 guarantee/rescue passes (`runHorizontalGuarantee`
   ×2, `runVerticalFoundationGuarantee`, `runFullBodyDomainGuarantee`) +
   `WorkoutGenerator`'s own David Rule rescue swap. All 5 already had
   `context: WorkoutGenerationContext` and `difficulty: DifficultyLevel` in
   scope, so no new plumbing was needed beyond passing them through. Old
   logic only reset reps to a generic default when `isTimeBased` flipped
   and otherwise inherited `target`'s reps regardless of the new exercise's
   tier.
3. **`applyEssentialGearFilter`'s naked-backfill AND its "violation
   replacement" pass** (`trio-modifiers.service.ts`) — two independent gaps
   in the same function. The backfill hardcoded `reps: naked_isTimeBased ?
   20 : 10` regardless of how the candidate's own level compared to the
   user's. The violation-replacement pass — found while fixing the first,
   not named in the task — replaces a gear-violating exercise via a
   `...violator` spread that inherited ALL of reps/isTimeBased/restSeconds
   (and, before this fix, `levelDelta`/`tier`/`programLevel`/`isOverLevel`
   too) unchanged from the exercise it replaced.
4. **`applyIntenseOption`'s David Rule injection** (bolt 3) — inspected,
   deliberately **not** touched. It already actively re-derives
   reps/repsRange for the injected candidate via its own tuned isometric-
   safety-cap logic (a documented prior fix, "Phase 3d — Same-Type
   Isometric Leak"). It doesn't exhibit the stale-carryover pattern; routing
   it through the shared function would replace working, deliberately-tuned
   logic with none of this task's actual bug present — out of scope per the
   task's own "keep the change minimal, don't change the regression
   behavior itself" instruction.

### Second bug, found while verifying the first fix: stale tier/levelDelta

After wiring `reps`/`isTimeBased`/`restSeconds` re-derivation everywhere,
re-verification showed real improvement but not the full target: bolt 1
went from 9.9→7.9 (Addendum 3) to **avg 3.6, 11.0% at 8+** — close, but
short of the `<10%` target. Live-traced the residual offenders and found
`assignVolume`'s own reasoning tag correctly showed `reps:1(1-3)` at swap
time, yet the FINAL exported `reps` was 8-12. Root cause: `applyFlowRegression`
(and the other two swap sites) never updated `ex.tier`/`ex.levelDelta`/
`ex.programLevel`/`ex.isOverLevel` — only `isTimeBased`/`mechanicalType`/
`reps`/`repsRange`/`restSeconds`. These fields kept describing the
**pre-swap** exercise. Two real consequences, not just a display nit:

1. **The verification query itself undercounted the bug.** Filtering
   `level_diff>=1` (= `ex.levelDelta`) missed swapped exercises whose stale
   `levelDelta` still read as match/easy/flow even though their TRUE
   post-swap tier was hard/elite (or vice versa) — meaning some of the
   "still broken" population was actually **worse than measured**, not
   fixed exercises hiding as broken ones.
2. **`enforceVolumeCap`'s Phase B trim-priority sort is keyed on `ex.tier`.**
   A stale `tier:'elite'` on an actually-easy replacement made it
   trimmed LAST (elite/hard trim last, per the sort) instead of FIRST
   (flow/easy trim first) — an unrelated bug in its own right, now also
   fixed as a side effect.

Fixed by having `rederiveVolumeForSwappedExercise` also return `tier`
(threaded through `substituteExercise`'s return type), and setting
`tier`/`levelDelta`/`programLevel`/`isOverLevel` directly at the other two
sites (`applyFlowRegression`, `applyEssentialGearFilter`'s two passes) —
`substituteExercise`'s 5 callers already set `programLevel`/`isOverLevel`/
`levelDelta` in their outer object-literal spread (pre-existing, correct),
so only `tier` needed to flow through there.

### Verification

**level_diff>=1 reps by bolt** (target: avg 1-3 in all three, bolt 1 <10% at 8+):

| Bolt | Addendum 3 (before this fix) | reps-only fix | **+ tier/levelDelta sync** |
|---|---|---|---|
| 1 avg (n) | 7.9 (126) | 3.6 (164) | **1.99 (314)** |
| 1 % ≥8 reps | 45.2% | 11.0% | **0.0%** |
| 2 avg / max / %≥8 | 2.66 / 12 / 3.1% | 2.12 / 5 / 0.0% | **2.13 / 5 / 0.0%** |
| 3 avg / max / %≥8 | 2.16 / 12 / 0.1% | 2.08 / 5 / 0.0% | **2.1 / 5 / 0.0%** |

Bolt 1's `n` grew 126→314 across the three measurements — not new bugs
appearing, but the levelDelta-sync fix correctly re-classifying exercises
that were previously mislabeled into the wrong tier bucket by a stale
field, so the query itself became more accurate at finding the true
population. All three bolts now meet the target.

**match/easy/flow — redistributed, not reformulated.** Their `getStaircaseRange`
computation logic is untouched (verified in Addendum 3 by construction —
unchanged again here, this fix touches none of it). But their *populations*
shifted, because the SAME `levelDelta`-staleness bug that hid hard/elite
exercises under a stale match/easy/flow label also, symmetrically, mislabeled
some TRUE match/easy/flow exercises as something else pre-swap:

| Tier | Addendum 3 avg (n) | This fix avg (n) | max reps |
|---|---|---|---|
| match | 5.99 (3067) | 6.1 (3074) | 12 (was 28 — the 1-outlier contamination from Addendum 3 is gone) |
| easy | 7.55 (1442) | 6.03 (1044) | 12 (was 30) |
| flow | 7.93 (2797) | 8.63 (3380) | 12 (was 30) |

The `n` shifts across match/easy/flow (and the outlier max values
disappearing) are the expected, correct consequence of exercises finally
landing in their TRUE tier bucket instead of whatever their pre-swap
`levelDelta` happened to say. This is reclassification, not a change to how
any tier computes its reps.

**Overall under-8-reps rate** (blended across all tiers — a weak signal on
its own since match `<50%`/hard/elite are *supposed* to be low; the
per-tier breakdown above is the real evidence): 68.7% → 68.8%, essentially
flat — expected, since the fix moves exercises *between* tiers whose own
under-8 rates are similar magnitude, rather than changing the overall mix's
central tendency. Addendum 3's before/after (82.6% → 76.2%) plus this
round's flat 68.7/68.8% together show the full arc: Part 1 (mock-profile
fix) and Part 2 (TIER_TABLE fix) drove the big blended-rate improvement;
this round's fix is concentrated entirely in making the hard/elite
population's *ceiling* (max reps, % ≥8) correct rather than moving the
blended average further.

**Verification:** `npx tsc --noEmit` — same pre-existing baseline errors
only (confirmed via `git stash` diff), zero new errors, including all 5
touched files. `npx vitest run src/features/workout-engine` — 483/483
individual tests pass (11 new: 5 in `rederive-volume-for-swapped-exercise
.test.ts`, 5 in `substitute-exercise-volume-rederive.test.ts`, 1 net new in
`trio-modifiers-core-set-lock.test.ts` plus 3 new assertions on 2 existing
tests); same 2 pre-existing hybrid `process.exit()` test-file failures,
unrelated. Live re-verification: full snapshot matrix rebuilt twice more
(once per fix layer), 1260 calls, 0 errors both times.

---

## Addendum 5 — Core block as a 3-form repertoire (docs/workout-engine/09-CORE-TABATA.md)

Implements David's 04.09.2026 decisions on top of the read-only mapping in
`08-CORE.md`/`09-CORE-TABATA.md`: the core slot now has three interchangeable
forms — (A) one exercise × 2-3 sets (opened from an exact 2), (B) a 4-minute
tabata block with 2/4/8 core exercises (`TABATA_CLASSIC` itself untouched —
only member count, never block length), (C) one of the 4 "טבטה" follow-along
ladder items (L4/L8/L12/L16) filling the slot alone. All three pass the same
pre-existing core gate (`hasExplicitCoreLevel`, `targetPrograms['core']` with
a level).

### Part 1 — Connected the follow-along ladder (independent fix)

The 4 follow-along items (`ZHf9ELBPf9NpASCygL1n`/"טבטה" L4,
`WLP7RzGley7svZbbIzAW`/"טבטה +" L8, `nbEECAsr8OciKBVbKkET`/"טבטה מאתגר" L12,
`jbwq5lw6oIF0G6vDJ1D9`/"טבטה מאתגר+" L16) are all `exerciseRole:'reinforcement'`
— the exact same unreachable pattern as the ~40 warmup videos in
`04-VERIFY.md`: real docs, valid levels, zero live consumers. Wired via
`resolveFollowAlongCoreExercise` (`core-block.ts`) — nearest-at-or-below the
user's core level, falls back to the closest available level if none qualify.
Also added `UNHANDLED_ROLE` detection to `/admin/unreachable-exercises`
(`HANDLED_ROLES` allowlist: main/warmup/cooldown/recovery/reinforcement) so a
future new `ExerciseRole` value with no consumer surfaces automatically
instead of silently repeating this pattern a third time.

### Part 2 — The three forms

- **Form A (single, 2-3 sets):** opened the exact-2 lock from Addendum 4/
  commits `e862ae9f`+`516a90df` in both `BudgetDistributor.ts` lock sites
  (`CORE_MIN_SETS=2`/`CORE_MAX_SETS=3`, clamp instead of overwrite) and both
  naked-gear-filter sites in `trio-modifiers.service.ts` (backfill +
  violation-replacement). Non-core paths in both files verified untouched —
  `BudgetDistributor.ts` has zero tabata/protocolBlock awareness (grep
  confirmed), so this change is provably scoped to core only.
- **Form B (tabata, 2/4/8 members):** `buildCoreTabataBlock` (`core-block.ts`)
  calls the existing `buildTabataBlock('tabata', ...)` pool-injection path
  unchanged, with a core-only pool and `minExercises=maxExercises=memberCount`
  to force the exact chosen count. `chooseCoreTabataMemberCount(headroom)`
  picks 2/4/8 by remaining time (`TABATA_CORE_MEMBER_COUNTS`, tiling-verified
  to divide the fixed 8 intervals evenly). `TABATA_MIN/MAX_EXERCISES` in
  `tabata.constants.ts` stayed the DEFAULT for the general finisher;
  `tabata.block.ts` now accepts `minExercises`/`maxExercises` overrides plus
  `injuryShield` on both the mains-subset and pool-injection paths (previously
  neither checked injuries at all — David flagged this explicitly).
- **Form C (follow-along):** `resolveFollowAlongCoreExercise` fills the slot
  alone, spliced in as `sets:1, reps:TABATA_BLOCK_SECONDS, isTimeBased:true`
  (matches the ~240s real clip length).

All three wired into `WorkoutGenerator.ts` as a new "Step 6c" immediately
before the existing tabata FINISHER step; the finisher is suppressed
(`coreForm !== 'tabata' &&`) when core itself became the tabata block, so the
session never gets two tabata blocks. Each form falls back to 'single' (or,
for tabata, to the pre-swap single core exercise) if its own build fails —
never a lost slot.

### Part 3 — Form selection: one constant, one place

`CORE_FORM_STRATEGY` (`core-block.ts`) — currently `'remaining_time'` (the
simplest of the 4 proposed mechanisms: pick among forms whose time cost fits
the session's remaining headroom). The other 3 (`by_bolt`, `weighted_random`,
`goal_history`) are documented in the same file, beside the constant, with
why each was deferred rather than chosen — every call site reads the
strategy through `chooseCoreForm()`, so swapping mechanisms later is a
one-line change with no scattered call-site edits.

Anti-repetition (hard requirement: never 3× the same form in a row) is
tracked via `coreFormsChosenThisTrio` — an array shared by reference across
all 3 bolts of one `generateHomeWorkoutTrio` call. **Scoped, not the full
guarantee**: this is *within one trio call* only, not true cross-session
history (3 actual consecutive days). The one real precedent for "avoid
repeating recent content" in this codebase (`recentExerciseIds`,
`useWeeklyVolumeStore.ts:396`) is a client-side store read outside the pure
generator — wiring real cross-session tracking needs a new Firestore read or
an extension to that store, neither verified this pass.
`WorkoutGenerationContext.recentCoreForms` is a real, typed extension point
(`chooseCoreForm` already folds it into the same anti-repetition check) —
wiring a real history source later requires zero changes to the selection
logic itself, only supplying the array.

### Part 4 — When the block enters

- **Full-body (push+pull+legs) → guaranteed.** Added `core` to
  `GuaranteePassRunner.ts`'s `DOMAIN_MG_CANDIDATES` and `PRIMARY_DOMAINS`.
  `strictDomainMatch=true` is passed for core only (push/pull/legs keep the
  pre-existing non-strict default) so a guarantee injection can't reopen the
  §12.3 cross-scale bug (a `movementGroup='core'` skill move getting injected
  via an unrelated program's level).
- **≥20 min → unchanged** (pre-existing duration/domain rules apply as
  before).
- **15 min + strength goal → excluded unless time remains.** New
  `StructureDirector._shouldExcludeCoreForShortStrengthSession` — only
  applies when core is one of the *explicitly requested* domains (not the
  full-body-guarantee path, which is domain-agnostic by design and unaffected
  by this exclusion). Approximates "time remains" via a fixed 5-min/domain
  reservation since `StructureDirector` doesn't have real per-exercise
  durations at that stage. `mainGoal==='performance_boost'` is this pass's
  interpretation of "strength goal" — **flagged as needing David's
  confirmation**, not verified against a written source.
- **Manual builder → new explicit gate.** `context.isManualOverride` is
  checked at the top of the exclusion helper (returns `false` immediately,
  i.e. never excludes) — previously `isManualOverride` had exactly one real
  consumer (`SplitDecisionService`'s deficit-clamping); core rules had no
  manual-mode awareness at all before this.

### Part 5 — Measurement: sets-equivalent normalization

Chosen normalization (of the two directions raised in `09-CORE-TABATA.md`):
**sets-equivalent**, `SECONDS_PER_SET_EQUIVALENT = 20`
(`build-session-volume.ts`) — a row's `working_sets` becomes
`round(time_under_tension / 20)` instead of the literal `sets` field whenever
`protocol_block='tabata'` OR `is_follow_along=1`. Chosen over the alternative
(leaving `working_sets` as the raw form-A-shaped `sets` field, which would
have shown follow-along as `working_sets:1` against form A's 2-3, despite 4
minutes of continuous work — a 5x+ undercount) because sets-equivalent keeps
the existing volume-budget math (which is set-count-based throughout
`BudgetDistributor`/`session_volume`) comparable across all three forms
without inventing a second volume unit. `is_follow_along` is a new column on
`workout_exercises` in `build-snapshot.ts`, sourced from
`ex.exercise?.isFollowAlong`.

### Verification

`npx tsc --noEmit` — no new errors (checked every touched file by name
against the full error list; all pre-existing baseline patterns: `TS2802`
Set/Map iteration target-level errors, unrelated `ExerciseTag`/
`DomainTrackProgress` type gaps). `npx vitest run src/features/workout-engine`
— **506/506 tests pass** (24 new: `core-block.test.ts` — form eligibility,
anti-repetition incl. the documented no-satisfying-form edge case,
follow-along resolution, tabata injury-shield; `structure-director-core-gate
.test.ts` — 6 tests via the public `plan()` API covering the 15-min/strength
exclusion, manual override, and the domain-absent case; plus updated
assertions in `core-set-lock.test.ts` and `trio-modifiers-core-set-lock
.test.ts` for the 2→2-3 set range). Same 2 pre-existing hybrid
`process.exit()`-style test-file failures (`hybrid-runtime.test.ts`,
`hybrid-orchestrator.test.ts`) — confirmed unrelated: neither imports any
file touched this pass.

**Two real bugs found and fixed during live verification, before trusting
any snapshot numbers:**

1. **`MG_TO_DOMAIN` mismatch in the guarantee's own candidate search.**
   `DOMAIN_MG_CANDIDATES.core` initially listed only `['core']`, but
   `MG_TO_DOMAIN` (the canonical mapping used everywhere else) also maps
   `anti_extension`/`anti_rotation` to the `core` domain — a large share of
   the real core catalog was invisible to `runFullBodyDomainGuarantee`'s
   search. Fixed by widening to `['core', 'anti_extension', 'anti_rotation']`.
   (The snapshot's `domain` column already applied `MG_TO_DOMAIN` correctly —
   confirmed by reading `build-snapshot.ts:263` — so this bug was scoped
   entirely to the guarantee's internal search, not to how "core presence"
   gets measured; the 08-CORE.md baseline numbers stand unaffected.)
2. **`enforceVolumeCap` was trimming the guarantee-injected exercise right
   back out.** Its Phase A treats `CORE_MGS` as "most expendable" by design
   (a normal, non-guaranteed core pick should trim first at short durations)
   — but that rule doesn't know the difference between an ordinary core pick
   and one the Full-Body Guarantee just fought to inject. Added
   `WorkoutExercise.isGuaranteedCore`, set by `GuaranteePassRunner` on
   injection, checked by `enforceVolumeCap`'s `isExpendable` (`if
   (ex.isGuaranteedCore) return false`) ahead of the `CORE_MGS` check.
   Live-traced with 4 temporary checkpoints (since removed) end to end —
   confirmed the flag survives from injection through `applyFlowRegression`'s
   gear-filter (same object reference when the exercise stays gear-free) to
   `enforceVolumeCap`, and correctly gates the trim.

**Live snapshot rebuild (3,780 workouts, 23,940 `workout_exercises`, 0
errors), before (`08-CORE.md` baseline) vs after both fixes:**

> ⚠️ **Correction (05.09.2026)** — every number in this table (and the form-distribution
> paragraph below it) was originally measured with `domain='core'` alone, no
> `exercise_role='main'` filter — the exact same contamination corrected in `08-CORE.md` §3 and
> `09-CORE-TABATA.md` §5 (see those files for the root cause: a real bug in `warmup.service.ts`
> that let core-tagged exercises get selected into the WARMUP slot, fixed 05.09.2026, plus a
> smaller distinct contamination of the form-distribution row specifically — see below). Corrected
> numbers below; strikethrough = originally reported. `check-core-query-safety.ts` (new this
> session) now fails any future committed query with this gap.

| Metric | Before (corrected) | After (corrected) |
|---|---|---|
| % workouts with core, 15/20/30/45 min | 5.1 / 10.2 / 21.2 / 34.2 (was ~~32.9/36.9/45.7/56.8~~) | 4.9 / 11.6 / 24.1 / 36.5 (was ~~31.0/38.9/46.3/57.1~~) |
| Avg core/workout, 15/20/30/45 min | 0.07 / 0.12 / 0.26 / 0.40 (was ~~0.35/0.41/0.56/0.81~~) | 0.07 / 0.14 / 0.33 / 0.48 (was ~~0.34/0.44/0.63/0.88~~) |
| **Full-body workouts without core** | **83.0% (was ~~58.3%~~)** | **68.5% (was ~~48.3%~~)** |
| …by duration 15/20/30/45 min | 92.6 / 90.4 / 77.0 / 71.9 (was ~~66.7/66.7/52.6/47.4~~) | 89.6 / 78.5 / 61.5 / 44.4 (was ~~65.9/52.6/43.7/31.1~~) |

**Form distribution — a second, separate contamination**, found and corrected the same day: the
original 2,159-row count also included every follow-along-ladder ID regardless of
`exercise_role`, so a "טבטה"/"טבטה +" item selected into the WARMUP slot (the same
`warmup.service.ts` bug) got counted as a genuine form-C core-slot selection just because its
`movement_group='core'` matched. Restricting to `exercise_role='main'` (the exercises that
actually occupy the core slot) gives the true distribution:

| Form | Rows (corrected, `exercise_role='main'`) | Distinct workouts | Originally reported (contaminated) |
|---|---|---|---|
| single | 594 | 534 | was folded into a since-corrected 720/618 |
| tabata | 291 | 140 | 291/140 — **unaffected**, tabata-block rows are never `is_follow_along` |
| follow_along | ~73–76 | ~69–72 | was ~~1,148 rows / 1,121 workouts~~ |

**follow_along was reported as the dominant form (1,121 workouts) — it is actually the smallest
of the three (~70 workouts).** `single` is the true majority form, consistent with it having the
lowest time cost (3 min vs. 4 for the other two) in `chooseCoreForm`'s eligibility check — it
qualifies most often, so it wins the random draw most often.

**The blended, all-workouts metrics (row 1-2) barely moved — expected, not a
sign the fix is inert.** The Full-Body Guarantee only fires for
`blueprint.strategy==='full_body'`, one of 7 domain-subsets in the matrix;
its effect is real but diluted across the blended population. The row that
actually measures the guarantee — full-body-without-core — moved 83.0% →
68.5%, a genuine ~14.5-point improvement, **not the 0% target.**

**Residual gap — root cause under active re-investigation, see the 05.09.2026 follow-up
report (David task ה).** The "catalog depth at high core levels" theory below was built on the
contaminated 58.3%/48.3% numbers and a monotonic-by-level trend that the correction weakens
(corrected by-level figures: L1 63.0%, L3 58.3%, L5 73.1%, L8 72.2%, L12 75.9% — directionally
similar but no longer clean). ~~This tracks catalog depth, not a code defect:
`PoolFactory.ts`'s `findLevelAppropriateSubstitute` (the guarantee's own candidate search) has no
`exerciseRole` filter, so the follow-along ladder is already a visible candidate to it — the
remaining failures are cases where `globalExercisePool` genuinely has no core-domain exercise (of
any role) within the search band of a high user level.~~ A live pipeline trace (60 sampled
full-body workouts across 5 levels × 4 durations) found the dominant failure mode is NOT a missing
candidate: in the large majority of failures, `runFullBodyDomainGuarantee` silently skips core
because `hasDomain` is already satisfied by an ordinary (non-guaranteed) core exercise from normal
selection — which `enforceVolumeCap`'s pre-existing "core trims first" rule then removes
downstream, after the guarantee has already finished and moved on. `isGuaranteedCore` protects
only exercises the guarantee itself injects, not this far more common case. See the ה report for
the full failure-mode breakdown; **left for David** to decide the fix, per this project's
"measure and report, don't invent" pattern.

**Commit:** local only, no push, per task instruction.

---

## Addendum 6 — Cleanup batch (dead code, temporary placeholder blocklist)

Three small, independently-approved fixes from the 05.09.2026 follow-up investigation, landed
ahead of the bigger Guarantee/tabata-sort fixes still pending David's review:

1. **Removed `isSpecificPotentiationCandidate`** (`warmup.service.ts`) — confirmed dead code, zero
   call sites anywhere in the codebase (only its own definition + 2 stale comments claiming Part B
   used it). Part B's actual Tier-2 fallback is `isPotentiationCandidate` — a same-named-but-
   different, live function a few lines above it, which is why the dead one was so easy to mistake
   for live code. Its doc comment (now on `isPotentiationCandidate` instead, where it's actually
   true) describes a real, narrow, **still-open** gap: `isPotentiationCandidate`'s early-return
   bypass for `exerciseRole==='warmup'`/`mobility`-tagged exercises skips the zone/intensity check,
   not just the equipment/location one — reached only as Part B's Tier-2 fallback (when Tier-1's
   strict zone match finds nothing). Not fixed this pass — flagged for David.

2. **TODO — `k10Af7WEV0qDqx8PY7xQ` temporary blocklist** (`warmup.service.ts`,
   `KNOWN_PLACEHOLDER_EXERCISE_IDS`), added 05.09.2026: this exercise doc ("חימום פלג גוף עליון
   לבדיקה") is real, uploaded video content but its description/goal copy is still placeholder
   text ("סרטון חימום בדיקה" with typos, empty description/instructions) — see this same
   addendum's parent investigation. After the exerciseRole gate fix (commit `71483317`), it became
   the ONLY exercise in the whole catalog passing Track A1's `isFollowAlong && exerciseRole==='warmup'`
   filter, so without this blocklist it would ship to every park general-mobility slot that falls
   through to the video-guide track. **Remove this blocklist once David finishes real
   description/goal copy for this doc — not before, and not left in "just in case" once it is.**

3. **`ETMVVSpt0lIpeF3mkEn6`** ("מתיחות פלג גוף עליון לבדיקה" — the copy that never finished
   uploading, `workflow.uploaded:false`) — David is deleting this one directly in the admin panel;
   no code change needed (it already fails `NO_EXECUTION_METHODS`-adjacent checks / was never
   reachable with a real video).

**Verification:** `npx tsc --noEmit` — no new errors in either touched file (same pre-existing
baseline). `npx vitest run src/features/workout-engine/services` — 86/86 pass, including the 4
warmup follow-along regression tests from the earlier fix (unaffected by the dead-code removal or
the blocklist addition, since neither touches the exerciseRole gate itself).

**Commit:** local only, no push.

---

## OPEN, NOT HANDLED — Desk Workout Constraint can replace an entire workout by title text

Found 05.09.2026 while mapping the post-generation exercise-mutation sequence for the Guarantee
post-cut-validation work (Addendum 7). **Not fixed. Not scoped for this pass. Documented so it
isn't silently rediscovered later.**

`home-workout.service.ts`'s "DESK WORKOUT CONSTRAINT" (`isDeskWorkout`/`DESK_TITLE_KEYWORDS`, runs
right after the title is resolved from Firestore, before the final sort) checks whether the
resolved `workout.title` string contains `'כיסא'` or `'שולחן'` — and if so, **replaces
`workout.exercises` entirely** with a `DESK_FRIENDLY_CATEGORIES`-tagged subset (falls back to the
original list only if fewer than 2 desk-friendly exercises exist).

**Q1 — how often does this fire?** 0/3,780 in the current snapshot — but that reflects the
snapshot's own mock-profile matrix never setting `persona`/context fields that would surface a
desk-context title, not that it's rare in real traffic. Not measured against real user data (out
of scope — would need a production query, not a snapshot one).

**Q2 — is the title AI-generated or from a closed list?** **Closed list.** `fetchWorkoutTitle` →
`scoredFetch('workoutTitles', 'titles', ...)` reads `workoutMetadata/workoutTitles/titles` (162
Firestore docs, confirmed live) and scores them against session context — no LLM call anywhere in
this path. Found exactly 2 real title docs containing these keywords, both legitimately
`persona`-tagged at the source: `LlINu0miB5JAvDO6fnAs` ("שחרור בכיסא לפני הישיבה",
`persona:'office_worker'`) and `enyt2XiryA7xAug5mtES` ("ריסטרט על הכיסא בספרייה",
`persona:'student'`).

**Q3 — is there a real "desk workout" flag, or is the title the only mechanism?** **The title
text is the only mechanism actually checked.** The 2 title docs above DO carry a legitimate
`persona` field that plausibly drives the SCORING that selects them in the common case — but
`isDeskWorkout`'s check never reads `ctx.persona`, `location`, or any dedicated flag; it only
re-derives intent by substring-matching whatever title text won the score. Two concrete risks
this creates, neither confirmed to have happened in production, both structurally possible: (1) a
scoring tie or thin-candidate-pool situation could hand this title to a NON-office_worker/student
user (nothing in `scoreContentRow`'s "David Clause" persona guard blocks a *mismatched* persona —
it only hard-excludes when the user has NO persona at all against a `DEMOGRAPHIC_PERSONA_TAGS`
row), silently swapping their whole workout to desk-only content; (2) any future title-template
author writing flavor text that happens to mention a chair/desk for an unrelated reason would
trigger the same full replacement.

**Left for David to decide the fix** — the two obvious directions (gate on `ctx.persona`/a real
context flag instead of title text; or accept the current behavior as good-enough given it's
tied to real persona-authored content) are a product call, not something to guess at here.

**Update 05.09.2026 — recommended fix, for the future 10-minute pass:** David's own read of the
Q2 finding is the fix — the 2 title docs already carry a legitimate `persona` field
(`office_worker` / `student`). `isDeskWorkout` should read `optionMetaCtx.persona` (or the
`titleResult`'s own row data, if threaded through) directly instead of substring-matching the
resolved title text. That single change closes both risks in Q3 (mismatched-persona edge case,
future flavor-text false positive) without touching the title content itself or its scoring.

**Update 05.09.2026 — Q1 real-data check, per David's request ("שאלה זולה"):** queried
`users` (Admin SDK, `.select('personas','lifestyle')` only, count-only intent — 617 total docs,
full population sampled, no extrapolation needed): **`office_worker`: 11, `student`: 23** — 34
real users (~5.5%) resolve to one of the two personas that can surface these titles via
`resolveCanonicalPersona`'s `personas[0].id` → `lifestyle.lifestyleTags[0]` precedence. **0/3,780
in the snapshot was "not measured," not "doesn't happen," exactly as David suspected** — this
moves up in priority accordingly, per his own framing.

---

## Addendum 7 — Post-cut promise validation + duration-aware core trim order

David's acceptance criteria for closing the Guarantee-silently-fails investigation
(docs/workout-engine/09-CORE-TABATA.md's 05.09.2026 follow-up), all 6 delivered this pass.

### 1-3. The post-cut promise validator (`GuaranteePassRunner.validatePromisesPostCut`)

New pass, called from `home-workout.service.ts` after the Desk Workout Constraint filter and
before `sortAndPair` — verified (not assumed) to be the true last point every per-bolt mutation
(warmup/cooldown, intense/flow-regression + its gear-filter, `enforceVolumeCap`, desk-workout) has
already run:
- `sortAndPair` re-checked directly (not trusted from its own comment): `applyAntagonistPairing`
  buckets every exercise into a bucket and concatenates all buckets back — count-preserving, no
  `.filter`/`.slice`; `applyDomainPrioritySort` is a pure `.map().sort()`. Neither drops or adds an
  exercise. Nothing runs on `workout.exercises` after `annotateRepRanges` either (checked the rest
  of the per-bolt loop body) — confirmed the ABSOLUTE-last-mutation claim holds.
- Continued the map one layer further, into `workout-plan.mapper.ts` /
  `buildRunnerWorkoutPlanFromGenerated.ts` (both call `partitionByTabataBlock`): it does NOT drop
  content — a degenerate tabata block (<2 members) "dissolves" back into the flat main list, so the
  exercises survive, only the block PRESENTATION is lost. Its own comment says the trigger is
  "<2 members after swaps" — i.e. **user-initiated swaps at workout-start/mid-workout time, a
  structurally later and separate stage than generation**. The validator (generation-time only)
  cannot reach or protect against this by design — see the new open item below.

**Injection by REPLACEMENT only (criterion 1):** `pickLowestPriorityVictim` selects the
lowest-priority exercise still present (isolation/accessory ranked first; foundation exercises and
the last remaining exercise of another `PRIMARY_DOMAINS` domain are never candidates — same victim
protection `runFullBodyDomainGuarantee` already used). No candidate to replace → gives up
immediately and logs why (`no_safe_victim`). No addition, no retry ceiling — a single deterministic
pass, "מאוזן בתקציב מהגדרתו" as David put it: nothing is ever added, so it structurally cannot
create a duration-budget loop.

**Every promise logs one outcome (criterion 2):** `satisfied` / `injected` / `replaced` / `failed`
+ reason, one `promise_validation:<domain>:outcome=...` line per check. `injected` vs `satisfied`
is distinguished via `isGuaranteedCore` (was this domain present because an earlier pass had to
fix it, or was it just always fine). Parsed into a new `workouts.core_promise_outcome` snapshot
column (`build-snapshot.ts`'s `extractCorePromiseOutcome`) — queryable, not trace-dependent, per
David's explicit ask.

**Core is the only ENFORCED promise (criterion 3):** `validateCorePromise` will replace a victim to
restore core; `logHorizontalAndVerticalPromises` only ever logs `satisfied`/`failed` for
horizontal_push/horizontal_pull/vertical_pull-foundation/vertical_push-foundation — zero mutation
capability. If the collected `core_promise_outcome`-style data later shows horizontal/vertical
genuinely failing in practice (nothing in this investigation's traces showed that), enforcement can
be turned on for them the same way, in a separate, reviewed pass.

### 4. Duration-aware core trim order (`enforceVolumeCap`)

Replaces the old unconditional "core trims first" rule with a duration split (David's decision):

| Duration | Trim order among expendables |
|---|---|
| <20min | core(0) → isolation/accessory(1) → extra-legs(2) — **unchanged from before**, core optional |
| ≥20min | isolation/accessory(0) → extra-legs(1) → core(2) — **core cut last**, not first |

`isGuaranteedCore`'s old unconditional-protection role in `isExpendable` is removed — it was a
narrow patch for one injection site and, per this same duration split, was actually WRONG below
20min (a guarantee-injected core exercise should still be allowed to trim away in a genuinely short
session, matching the "optional below 20min" policy). The field itself stays, now purely
informational (`promise_validation` provenance/tracing).

**3 real before/after examples, live-traced against the actual running pipeline (not simulated on
both sides — "BEFORE" replays the exact old `isExpendable`+plain-score-sort logic against the real
pre-cut exercise list this session's generator produced; "AFTER" is the real, current pipeline's
own output for the same generated workout):**

| # | Scenario | Pre-cut mains | Old logic would remove | Real pipeline (new logic) removed / kept |
|---|---|---|---|---|
| 1 | L1, 20min, bolt2 | חתירות ב-75°, פשיטת מרפקים על הרצפה, סקוואט טווח חלקי (accessory), פלאנק על הברכיים (core) | סקוואט **and** פלאנק (2 removals — core cut) | Only סקוואט removed — **פלאנק (core) survived** |
| 2 | L3, 30min, bolt2 | שכיבות סמיכה ב-30°, מתח אוסטרלי ב-30°, סקוואט (accessory), פלאנק עליות ונגיעות (core) | סקוואט then פלאנק (2 removals, order unverified under old code) | Real log confirms: סקוואט removed **first**, פלאנק removed **second** — core still cut here (2 removals were genuinely necessary to converge) but never before the accessory was tried |
| 3 | L3, 25min, bolt2 | שכיבות סמיכה ב-45°, מתח אוסטרלי ב-60°, סקוואט (accessory), שולחן הפוך (core) | סקוואט then שולחן הפוך | Real log confirms the same order: סקוואט first, שולחן הפוך second — again a genuine 2-removal case, correct order |

**Reading this honestly, per David's own bar ("שלא שברנו אימון כדי להציל תרגיל בטן"):** the new
order never removes MORE exercises than the old one did — only in a DIFFERENT, correct sequence.
Example 1 shows a real save (only 1 removal was actually necessary, and it's no longer core).
Examples 2-3 show the harder, equally important case: when 2 removals are genuinely required to
hit the duration cap, core is not exempt from ever being cut — it is exempt from being cut FIRST.
No workout was made worse to protect an ab exercise; the accessory is always tried before core, and
core still yields when that alone isn't enough.

### 5. (ו)1 fix — already committed separately (`48bb6964`)

Re-verified as part of this batch, not re-done: `isPotentiationCandidate`'s role bypass removed,
`findCandidates`' Tier 1/2 base pools gained an exerciseRole eligibility filter. The exact leak
trace (L12/D45, "טבטה +") re-run at 0/18 — see that commit's own message for the full verification.

### 6. Snapshot rebuild — true full-body-without-core, all fixes applied

Full rebuild (3,780 workouts, 22,629 `workout_exercises`, 0 errors), `exercise_role='main'`
throughout (per Addendum 5's correction and `check-core-query-safety.ts`'s guard against a repeat):

| | |
|---|---|
| Full-body workouts | 540 |
| With core | 151 |
| **Without core** | **389 (72.0%)** |

By duration:

| Duration | Without core | `core_promise_outcome` breakdown |
|---|---|---|
| 15min | 91.9% (124/135) | failed 124, satisfied 11 — **by design**, core is optional below 20min, no enforcement attempted |
| 20min | 77.8% (105/135) | failed 105, satisfied 17, replaced 8, injected 5 |
| 30min | 70.4% (95/135) | failed 95, satisfied 26, replaced 10, injected 4 |
| 45min | 48.1% (65/135) | failed 65, satisfied 54, replaced 9, injected 7 |

**This is NOT a clean win, and needs a direct, honest flag before anyone calls this closed.**
15min's 91.9% is expected and correct (David's own explicit "optional below 20min" rule). But at
the 3 ENFORCED durations (20/30/45min), `replaced`+`injected` together only account for 8-12% of
full-body sessions — the validator is barely firing successfully where it's supposed to matter
most. **Live-traced why** (45 sampled 20min workouts, since the snapshot only stores `outcome` not
`reason` — a `core_promise_reason` column would need a second rebuild to get exact
population-wide numbers; this is a smaller but methodologically consistent sample):

**84.4% of failures are `no_safe_victim`** — the validator finds a valid core candidate but has no
exercise it's willing to replace. Root cause: `pickLowestPriorityVictim` copied
`runFullBodyDomainGuarantee`'s victim-protection rule verbatim (never steal the last remaining
exercise of another `PRIMARY_DOMAINS` domain) — correct for THAT function, which runs early, before
duration trimming, when a session still typically carries 2+ exercises per domain. My validator
runs LATE, after `enforceVolumeCap` has already trimmed the session down to its duration-appropriate
minimum — at that point a lean 20-minute full-body session commonly has **exactly 1 exercise per
push/pull/legs domain and nothing else**, so every remaining exercise IS "the sole member of its
domain," and the same protection rule that made sense early now blocks almost every replacement
attempt late. This is a design mismatch introduced by reusing the early guarantee's logic in a
different pipeline position, not a copy-paste bug in the narrow sense — the logic is internally
correct, just applied to a context where its assumption (spare per-domain capacity) usually no
longer holds.

**Not fixed this pass — flagging for a decision, not guessing at one:**
- Option A: allow the validator to replace the sole push/pull/legs exercise when nothing else is
  available, trusting that `enforceVolumeCap`'s own trim order almost never removes push/pull/legs
  exercises anyway (they're rarely `isolation`/`accessory` classified) — but this trades away
  guaranteed push/pull/legs presence to guarantee core, which is exactly the kind of tradeoff
  David asked to see concrete evidence for before merging (his own "did we break a workout to save
  an ab exercise" bar, from the trim-order request) — this needs the same treatment, not a
  same-day quiet fix.
- Option B: accept that a lean, minimal-duration full-body session sometimes can't fit a
  replacement without sacrificing a primary domain, and leave `no_safe_victim` as a legitimate,
  logged failure mode — core stays best-effort in that case, same as it was before this whole
  investigation, just now with real visibility into exactly how often and why.
- Option C: loosen victim protection specifically for `isolation`/`accessory`-priority push/pull/
  legs exercises only (still protecting compound/foundation ones) — a middle ground, unverified
  how much it would actually help without live-tracing it first.

### New open item — swap-time core loss has no equivalent protection

Raised by David directly: if a user swaps out the only core exercise in an already-generated
full-body workout (via the standard exercise-swap flow, at workout-start or mid-workout — a
structurally later, separate stage than generation), **nothing currently notices.** The post-cut
validator built this pass is generation-time only, by design (verified above — it cannot reach a
later swap). Not investigated further this pass — David asked to record it, not chase it now.

### Tests

`src/features/workout-engine/core/pipeline/__tests__/promise-validator.test.ts` (10 new) —
satisfied/injected/replaced/failed for all 4 core reasons (`optional_below_20min`, `unassessed`,
`empty_pool`, `no_candidate_within_band`, `no_safe_victim`), the replace-not-add invariant (exercise
count preserved, victim priority respected), horizontal/vertical log-only (zero mutation), and the
non-full-body no-op.

`src/features/workout-engine/core/presentation/__tests__/enforce-volume-cap.test.ts` (4 new) —
the <20min/≥20min trim-order split, the 2-removals-both-directions case, and confirmation that
`isGuaranteedCore` no longer grants unconditional protection below 20min.

**Verification:** `npx tsc --noEmit` — no new errors (checked every touched file: `PresentationFormatter.ts`,
`GuaranteePassRunner.ts`, `PipelineOrchestrator.ts`, `home-workout.service.ts`,
`workout-generator.types.ts`, `build-snapshot.ts` — all pre-existing baseline patterns only).
`npx vitest run src/features/workout-engine` — 524/524 (same 2 pre-existing unrelated hybrid
`process.exit()` failures).

**Commit:** local only, no push.

---

## Addendum 8 — build-snapshot.ts realism fix + Time-Volume Feedback Loop is one-directional

David found a real gap: this script's call to `generateHomeWorkoutTrio` never matched either real
production call site (StatsOverview.tsx's home carousel, UserWorkoutAdjuster's slider — confirmed
both ultimately call this same function, no parallel engine exists). Full investigation and fix.

### The 3 fixes to `build-snapshot.ts`

1. **`strictDomains: true` removed entirely.** No real caller ever sets it. Per its own doc comment
   it disables VerticalFoundation + HorizontalGuarantee + the domain-overflow fill path. Paired
   15-sample trace (with vs without, same other params): full-body-without-core at 45min moved from
   66.7% to 46.7% — a real ~20-point effect, not dominant but not negligible. Every % reported
   before this fix should be treated as **needing re-verification**, not discarded — it was measured
   in a mode no real user ever exercises.
2. **`requiredDomains` now `undefined` by default** (was always `['push','pull','legs']`-shaped).
   Neither real call site sets this unless the user explicitly picks muscle-group chips — `undefined`
   (auto domain selection) is the common real case. The old 7-subset sweep survives as an opt-in
   (`SNAPSHOT_FORCE_DOMAINS=1`) for deliberately testing a specific chip-picked combination.
3. **`remainingWeeklyBudget` / `domainSetsCompletedThisWeek` / `remainingScheduleDays` added**
   (simulated: 20 / `{push:6,pull:6,legs:6,core:2}` / 3 — plausible mid-week values, not real
   per-combo data, deliberately giving core less completed volume than push/pull/legs so Deficit
   Redistribution has real signal). These were absent from **every** measurement this project has
   ever made — Budget Floor and Phase 4 Deficit Redistribution have never been exercised, in either
   direction, until this fix.

Full header comment in `build-snapshot.ts` documents all three with the reasoning inline.

### Rebuilt snapshot (540 workouts, 3,245 `workout_exercises`, 0 errors) — auto-selected domains

With `requiredDomains` no longer forced, most sessions no longer cover push+pull+legs together —
**only 75/540 are "full-body" by actual exercise composition** (>=1 push + >=1 pull + >=1 legs main
exercise; `req_domains` itself is now always `'auto'`, so this is inferred from output, not request).

| Duration | % workouts with core (all, n=135 each) | Full-body-without-core (of the full-body subset) |
|---|---|---|
| 15min | 3.0% | 100.0% (n=4) |
| 20min | 23.7% | 100.0% (n=18) |
| 30min | 37.8% | 87.0% (n=23) |
| 45min | 48.9% | 36.7% (n=30) |

Full-body total: 75/540 workouts; without core: 70.7% (53 failed / 16 satisfied / 4 replaced / 2
injected). By level: 1→68.1%, 3→100%(n=1), 5→70.0%, 8→80.0%, 12→75.0% — **noisy, small per-level
full-body samples (n=1 to 47) now that domain selection is auto rather than forced; this axis needs
a larger run before drawing a level-trend conclusion, unlike the duration axis above which has
consistent n=135.**

**These numbers are NOT directly comparable to any earlier addendum's percentages** — different
population (auto-selected domains, only a fraction of which are full-body, vs every combo forced
full-body before), different budget context (Deficit Redistribution now active). Both real,
production-representative changes, not a regression in the fix.

### Time-Volume Feedback Loop — confirmed one-directional, not assumed

David asked to verify, not assume, that nothing adds volume when a workout runs short.

**(a) Searched, did not find, any upward-correction mechanism.** `WorkoutGenerator.ts`'s
"Time-Volume Feedback Loop" (the only named feedback loop) triggers exclusively on
`currentDuration > context.availableTime + TIME_TOLERANCE_MINUTES` — no symmetric check exists for
the under-duration case anywhere in `workout-budgeting.utils.ts`, `BudgetDistributor.ts`, or
`WorkoutGenerator.ts` (grepped broadly for "pad/expand/add more" patterns — none found).
`availableTime` is structurally a ceiling the pipeline trims toward, never a target it grows toward.

**(b) The real gap, measured on the corrected snapshot** (avg `estimated_duration` vs requested, by
level × duration — full table in the rebuilt snapshot, `workouts` table):

| Duration | Avg gap (all levels) | Avg main exercises |
|---|---|---|
| 15min | -0.5 to +1.5 (on target) | 2.22 |
| 20min | -0.3 to -1.7 (small) | 2.88 |
| 30min | -2.3 to -4.4 (moderate) | 3.61 |
| **45min** | **-8.5 to -10.7 (severe, ~20-25% short)** | **3.87** |

**(c) Where the worst gap is — and David's own guess was wrong, stated plainly since he asked not to
be told what he wants to hear:** the 10 worst level×duration×location combinations are **all 45min**,
and span every level tested (1, 3, 5, 8, 12 all appear, with gaps clustering tightly between -9.2
and -11.7 regardless of level). **This is a duration-specific problem, not a low-level-specific
one.** Level 1 is marginally the worst (-11.7 at gym) but level 8 (-10.4) and level 5 (-10.2) are
barely different — there is no clean level trend, only a sharp cliff at 45 minutes across the board.

**A real, separate bug found while chasing this (not the root cause of the 45min cliff, but real
and worth its own fix):** `getExerciseCountForDuration` (`workout-budgeting.utils.ts:122-134`) has a
dead bucket — `DURATION_SCALING['30']` (5-6 exercises) is defined but its branch condition
(`availableTime <= 30`) is unreachable before the `<=10` and the same `<=30` check that actually
routes there returns `DURATION_SCALING['15']` (4-5 exercises) instead, because the branches are
`<=10 → '5'`, `<=30 → '15'`, `<=45 → '45'`, `else → '60'` — meaning **every request from 11 to 30
minutes is sized like a 15-minute session.** This does not explain the 45min cliff (45min correctly
routes to the `'45'` bucket, 6-8 exercises) — but the ACTUAL avg main-exercise count at 45min
(3.87) is far below even that correct bucket's floor, meaning something else downstream (domain-quota
limits, a guarantee/pruning step, or the initial candidate count itself) caps the real output well
below what `getExerciseCountForDuration` sizes for. **Root cause of the 45min-specific shortfall is
still open — not investigated further this pass, per David's "report, don't implement" instruction.**

**Nothing implemented beyond the 3 build-snapshot.ts fixes above** — the duration-gap and
exercise-count-bucket findings are reported, not fixed; this is a product decision ("עד 45 דקות" vs
"בערך 45 דקות") David is still weighing.

**Commit:** local only, no push.

---

## Addendum 9 — HorizontalGuarantee/VerticalFoundationGuarantee domain-cannibalization fix +
## the dead 30-min bucket fix + the real headline metric

David's own trace (full-body request → came out push+pull only, legs AND core both gone) proved
this was never a core-specific bug. Core was a symptom. **Order mattered: the guard was fixed
first, the bucket second** — fixing the bucket first would have handed the cannibalization path
more exercises to destroy.

### Fix 1 — guarantee passes may never sacrifice a domain's sole representative

**(a) Audit of all 3 guarantee passes, as requested before touching anything:**

| Pass | Had protection before this fix? |
|---|---|
| `runFullBodyDomainGuarantee` | Yes — already had equivalent inline logic (refactored onto the shared helper below for consistency, behavior unchanged) |
| `runHorizontalGuarantee` | **No** — 2 unprotected sites: the "rich-budget ADD" path (adds a redundant same-domain exercise by replacing the lowest-scored *other*-domain exercise) and the standard-path fallback |
| `runVerticalFoundationGuarantee` | **No** — the `lowestNonFoundation` fallback victim picker had no domain-count check |

Same bug class in 2 of 3 passes — confirms this was systemic, not a one-off. Fixed onto one shared
rule instead of two separate patches: `computeDomainCounts(mainExercises)` /
`isSafeDomainVictim(exercise, domainCounts)` / `pickVictimProtectingDomains(candidates, all)` in
`GuaranteePassRunner.ts`. A candidate is unsafe to sacrifice iff it's in `PRIMARY_DOMAINS`
(push/pull/legs/core) **and** it's the only main exercise left in that domain. No safe candidate →
the pass skips the add/replace entirely and logs why; it never force-adds instead. The post-cut
promise validator's own `pickLowestPriorityVictim` was refactored onto the same predicate (was a
separate inline duplicate before).

**(b) Real before/after** — see `guarantee-domain-protection.test.ts` (3 tests, all confirmed
failing on pre-fix code via `git stash`):
1. HorizontalGuarantee rich-budget ADD path: push domain has 2 exercises (rich budget) + a lone
   legs exercise elsewhere. Before: legs gets replaced by a 3rd push exercise. After: skipped,
   logged `SKIPPED add-path for horizontal_push — would empty another primary domain`, legs intact.
2. HorizontalGuarantee standard-path fallback: only candidate to replace is the sole legs exercise.
   Before: replaced anyway. After: `no safe victim to replace ... horizontal_pull`, legs intact.
3. VerticalFoundationGuarantee: only candidate to replace (to inject a foundation vertical_pull) is
   the sole legs exercise. Before: replaced anyway. After: `no safe victim to replace`, legs intact.

**(c) What happens to the ~22% that previously "worked" via this path:** they now either fall
through to a legal victim elsewhere, or skip the guarantee's add/replace entirely (logged, not
silent). No case was found where skipping caused a *worse* outcome than the sacrifice it replaced —
the domain that used to get cannibalized now simply keeps its one exercise instead of losing it.

### Fix 2 — the dead 30-minute bucket (implemented only after Fix 1 was verified)

`getExerciseCountForDuration` (`workout-budgeting.utils.ts`): `DURATION_SCALING['30']` (min:5,
max:6) was unreachable — `<=30 → '15'` (min:4, max:5) caught every value from 11 to 30 minutes
before the identical `<=30` check meant to route there was ever reached. Fixed the branch order so
`<=20 → '15'`, `<=21..30 → '30'`. 6 regression tests in `get-exercise-count-for-duration.test.ts`,
including one that specifically fails pre-fix by asserting the 30-tier's max (6) is actually
reachable at `availableTime=30` (it wasn't — every value capped at 5, the 15-tier's max).

**Honest caveat, exactly what David asked to check ("או שמשהו אחר בלע את התוספת"):** the fix moved
the *initial* exercise-count target up, but the realized average barely moved (`avg_main_exercises`
20min: 2.88→2.98, 30min: 3.61→3.90) — nowhere near the 5-6 the '30' bucket now allows. **Something
downstream (the time-budget trim, not this bucket) is still the dominant constraint** — this bucket
fix is real and correctly targeted, but the 45-min duration cliff documented in Addendum 8 is a
separate, still-open problem this fix does not touch or explain.

### Rebuilt snapshot (540 workouts, 3,317 `workout_exercises`, 0 errors) — full comparison vs Addendum 8's baseline

| Duration | avg main exercises (before → after) | avg duration gap (before → after) | % with core (before → after) |
|---|---|---|---|
| 15min | 2.22 → 2.33 | -0.5 to +1.5 → -0.19 to +1.26 | (not tracked before) → 6.7% |
| 20min | 2.88 → 2.98 | -0.3 to -1.7 → -0.56 to -0.96 | → 28.9% |
| 30min | 3.61 → 3.90 | -2.3 to -4.4 → -1.74 to -3.78 | → 36.3% |
| 45min | 3.87 → 3.98 | -8.5 to -10.7 → -8.11 to -10.37 | → 57.0% |

The 45min cliff is essentially unchanged (still -8 to -10 across every level, still no clean level
trend, still all 10 worst combos at 45min) — **confirms Addendum 8's finding that this is a separate
bug from everything fixed this pass.** The 30min gap improved somewhat (fewer levels below -3),
consistent with the dead-bucket fix's small real effect.

`core_promise_outcome` across all 540 (every workout is `blueprint.strategy==='full_body'` under
auto domain selection — see next section): 366 failed / 153 satisfied / 20 replaced / 1 injected.
Reason breakdown of the 366 failures: **240 `no_safe_victim`, 126 `optional_below_20min`, 0
`no_candidate_within_band`.**

**Open item, quantified per David's instruction — not fixed:** `no_candidate_within_band` (pool has
no matching candidate at all) occurred **0 times** in this 540-workout sample. The dominant failure
mode is now `no_safe_victim` (Fix 1 correctly refusing to sacrifice a domain to make room for core) —
this is a *side effect* of Fix 1 worth naming plainly: protecting domains from cannibalization also
makes it harder for the core-promise mechanism to find a legal victim to inject core into. Coverage
did not get worse (workouts that already had core keep it), but it did not dramatically improve
either — the ceiling on core coverage is now "is there a legal victim," not "is there a candidate."

### The new headline metric — % of full-body-intent workouts missing any of push/pull/legs/core

David asked to replace the old core-only metric with this one going forward. Discovered while
building it: **`core_promise_outcome` is non-null on all 540 rows** — `validatePromisesPostCut`
no-ops for non-full-body blueprints (see its own test, "no-op for non-full-body strategy"), so its
presence on every row means **every workout in this matrix is `blueprint.strategy==='full_body'`**
under auto domain selection. The true population for "full-body intent" is not an output-inferred
subset (Addendum 8's own `>=1 each of push/pull/legs` proxy, which undercounts by construction —
a workout that lost a domain entirely to cannibalization would fail that filter and be invisible to
it) — it is simply **all 540 workouts**.

| Duration | n | avg domains present (of 4) | % missing ≥1 domain |
|---|---|---|---|
| 15min | 135 | 1.88 | 100.0% |
| 20min | 135 | 2.66 | 99.3% |
| 30min | 135 | 2.82 | 93.3% |
| 45min | 135 | 3.05 | **76.3%** |
| **All** | **540** | **2.61** | **92.2%** |

Domain-count distribution overall: 0 domains=1 (0.2%), 1=28 (5.2%), 2=197 (36.5%), **3=272 (50.4%,
the modal case)**, all 4=42 (7.8%).

**Read this honestly, not as a single alarming number.** At 15-20min the exercise budget (2-3 main
exercises total) makes covering 4 domains structurally near-impossible — "missing a domain" there
is expected, not a bug. **45min is the meaningful number**: enough time budget that all 4 domains
plausibly fit, and still only 7.8%-of-540's-share reach it — most 45min sessions land at exactly 3
of 4 (missing one domain), consistent with the 3.05 average.

Of the 272 "missing exactly one domain" sessions, which domain is missing:

| Domain | Count | % of the 272 |
|---|---|---|
| core | 178 | 65.4% |
| pull | 70 | 25.7% |
| legs | 16 | 5.9% |
| push | 8 | 2.9% |

Core is still the dominant missing domain (expected — it's the only one with an explicit, if
imperfect, protection mechanism; the other three rely entirely on Fix 1's cannibalization guard).
**Pull is a distant second at 25.7%, worth a note for a future pass but out of scope for this one**
— not investigated further, per the closed scope of this task.

**This is the number David asked to track going forward: 92.2% of all full-body-intent workouts are
missing at least one of push/pull/legs/core; 76.3% at 45min specifically, where it's most
meaningful.** Not fixed this pass — Fix 1 stops guarantees from actively destroying a domain, but
does nothing to *add* a missing one back when none was ever selected in the first place. That gap
(no mechanism proactively fills a domain the initial exercise selection simply never picked) is a
distinct, larger problem than anything touched in this addendum.

**Commit:** local only, no push.

**Cross-session note:** mid-fix, the shared working directory (this repo's convention is
work-directly-on-main, no worktree-per-session) was switched away from `main` by a concurrent
session partway through this task, twice — once during Fix 1's implementation (see `fb310e87`'s
commit message) and again immediately after the final snapshot rebuild completed, which silently
reverted `scripts/audit/snapshot.sqlite` to a stale pre-fix commit before it could be queried. Caught
by checking `req_domains` (showed the old 7-subset sweep instead of `'auto'`) and by
`git merge-base --is-ancestor <commit> HEAD` returning false against the branch left checked out.
No work was lost in either case (`main` — verified via ancestry check — always had this session's
commits); the rebuild was simply re-run after switching back to `main`.

---

## Addendum 10 — Fix 1 was real and complete; the domain-cannibalization bug has a 4th,
## unprotected site; the "4-exercise ceiling" has a name and a file:line

David's follow-up after Addendum 9: "the fixes barely moved the numbers — they're correct and
staying, but they weren't the cause, and we need to keep going." Three investigations, report only,
nothing implemented this pass. Methodology: temporary `STAGE_TRACE:*` lines pushed into the real
`pipelineLog` at 10 pipeline checkpoints (Step 3 raw select → MG diversity → BudgetDistributor →
guarantees → Time-Volume loop → trio-modifier → enforceVolumeCap → Desk constraint → promise
validation), read back from real `generateHomeWorkoutTrio` calls, then fully reverted (`git diff`
against HEAD confirmed empty before any commit).

### 1. Fix 1 effectiveness — real measurement, not the same 22.2% baseline

Sample: 5 levels × 3 locations, duration=45 (15 calls × 3 bolts = 45 workouts) — the original
pre-compaction 22.2%-measurement script no longer exists (deleted per this repo's throwaway-
diagnostic convention) so this is a methodologically-equivalent re-measurement, not a byte-identical
replay; disclosed rather than presented as the same number.

Instrumented `pickVictimProtectingDomains` (the single shared chokepoint all 3 guarantees and the
promise validator call) to compute, on every invocation, what the **pre-fix, unprotected pick**
would have been alongside the actual protected pick:

| | Count |
|---|---|
| Calls (of 15) with ≥1 would-have-destroyed event | **13 (86.7%)** |
| Total victim-pick attempts across all 45 workouts | 95 |
| Of those, would have destroyed a domain pre-fix | **65 (68.4%)** |
| Of the 65: fully blocked (no injection at all) | 49 |
| Of the 65: redirected to a different, safe victim | 16 |
| Of the 65: actually destroyed a domain (post-fix) | **0** |

**Direct answer to "which of the two": neither.** Not "still high, fix isn't taking hold" — actual
destruction is 0/65, not "still high." Not "dropped to zero and therefore this mechanism was never
the primary cause" either — the mechanism is real and fires on the *dangerous situation* far more
than the original 22.2% suggested (86.7% of calls, not 22%). The correct third reading: **Fix 1 is
completely effective at what it targets (0% domain destruction, was ~100% before by construction —
there was no check), and it was never going to move `avg_main_exercises` or the duration gap**,
because a guarantee pass is a **swap-or-skip** operation (1-for-1 replacement, or nothing) — it can
change *which* domains survive, never the *total count*. Those two metrics are governed by an
entirely separate mechanism — see finding 3 below. Confusing "did the fix work" with "did the count/
gap numbers move" was the wrong test for this specific fix; domain-completeness (Addendum 9's 92.2%/
76.3% metric) is the right one, and indirect evidence there (75/540 → 220/540 workouts retaining
push+pull+legs together, pre-fix vs. post-fix-and-Fix-2 snapshots) is consistent with Fix 1 working,
though the two snapshots differ in more than just Fix 1 so this isn't presented as an isolated proof.

### 2. The new, more serious finding — pull disappears via a 4th, unprotected site: `trio-modifiers.service.ts`

Re-ran the 5 real combos from Addendum 9's `pull`-missing sample (same level/duration/location/
daysInactive; bolt index not perfectly reproducible — no fixed seed exists in this codebase, see
`build-snapshot.ts`'s own header comment — so this traces the mechanism, not a byte-identical replay
of the exact recorded workout).

**Answer to "was pull selected then removed, or never selected": selected, every single time.**
Pull was present at `step3_raw_select` (the very first selection) in **15/15** traced bolts. This
was never a pool-emptiness or initial-filtering problem.

**Answer to "if removed, by whom": two distinct mechanisms, not one — and the dominant one is a
site Fix 1 never touched.**

- **`applyFlowRegression` (`src/features/workout-engine/services/trio-modifiers.service.ts`,
  called from `home-workout.service.ts` for the `flow_regression`-tagged bolt only — the "easy"
  option, always bolt-difficulty 1) strips an entire domain outright.** Traced 4 separate instances
  (r100, r105, r136, r141's flow_regression bolt) where pull was confirmed present immediately
  before this call (`pre_trio_modifier`: pull:1 or pull:2) and **completely absent** immediately
  after (`post_trio_modifier`: no pull entries at all) — in every one of the 4, this is the exact
  and only point of loss; every earlier checkpoint (guarantees, Time-Volume loop) still shows pull.
  This is the **same class of bug** Fix 1 fixed in the 3 guarantee passes — "remove a domain's sole
  representative" — but `trio-modifiers.service.ts` is a completely different file, never audited
  or protected by Fix 1's `isSafeDomainVictim` rule. **This directly explains "זה בדיוק מה שתיקון
  ההגנה היה אמור למנוע, וזה עדיין קורה אחריו"** — the protection rule exists, but only in 3 of what
  are now known to be at least 4 places capable of this failure mode. (One traced flow_regression
  bolt, r103, did *not* lose pull — the behavior is conditional/non-deterministic on session content,
  not a guaranteed failure every time, but real and repeatable.)
- **`BudgetDistributor`'s Step 4 cluster caps** (see finding 3) can *also* reduce pull's count
  (observed 2→1) as part of their general hardcoded-ceiling behavior — but in every traced case this
  step left at least 1 pull exercise standing; it was never observed to be the sole cause of pull
  reaching zero. `applyFlowRegression` is the mechanism that actually zeroes it out.

Not fixed this pass, per instruction — `trio-modifiers.service.ts`'s victim/filter selection inside
`applyFlowRegression` needs the same `isSafeDomainVictim`-style audit finding 1's 3 sites already
got, but that is a code change for a future round.

### 3. Where exercises 5–8 actually go: a hardcoded ceiling in `BudgetDistributor`, blind to the duration bucket

Stage-by-stage trace, 3 bolts of one real 45min combo (own log lines captured, not inferred):

| Stage | Bolt1 (flow_regression) | Bolt2 (standard) | Bolt3 (intense) |
|---|---|---|---|
| Step3 raw select | 5 | 6 | 8 |
| Step3b MG diversity | 5 | 6 | 8 |
| **Step4 BudgetDistributor** | 5 (unaffected) | **6 → 4** | **8 → 4** |
| Step5 guarantees | 5 | 4 | 4 |
| Step7 post-Time-Volume | 5 | 4 | 8 (Step 6c/6b core-form added exercises here, this run) |
| post trio-modifier | **5 → 3** | 4 | 8 → 6 |
| enforceVolumeCap | 3 (no-op) | 4 (no-op) | 6 (no-op) |
| **FINAL** | **3** | **4** | **6** |

`BudgetDistributor.ts`'s own log lines name the exact mechanism:

```
bolt2: balanced_cluster_cap: culled 2 excess main exercises → 4
       (diverse=true, domains=4, longSession=true, availableTime=45)
bolt3: skill_cluster_cap: culled 4 excess main exercises → 4 clustered
```

`BudgetDistributor.ts:73-76`:
```
const BALANCED_CLUSTER_MAX_MAIN_BASELINE = 3;
const BALANCED_CLUSTER_MAX_MAIN_DIVERSE  = 4;   // ≥3 distinct domains OR availableTime≥45
const SKILL_CLUSTER_MAX_MAIN             = 4;
```

`_balancedClusterCap` (`:628-729`, gated `difficulty === 2` only — the standard bolt) and
`_skillClusterCap` (`:502-580`ish, gated `difficulty === 3` AND skill/single-domain session — the
intense bolt) each independently cap main exercises at a **hardcoded 3 or 4**, computed from domain
diversity / `availableTime >= 45`, with **zero awareness of `getExerciseCountForDuration`'s
duration-bucket target** (5-8 for 45min, correct since the Addendum-9 fix). Bolt1 (flow_regression,
difficulty 1) is gated out of *both* caps — its low count instead comes from a smaller Step-3 budget
for difficulty 1 plus `applyFlowRegression`'s own cuts (finding 2).

**Direct answer: not the guarantees (Fix 1), not `enforceVolumeCap`, not the Time-Volume Feedback
Loop (confirmed again here — it only ever changed `sets`, never removed an exercise, across all 3
bolts) removes exercises 5-8. `BudgetDistributor`'s cluster caps do, before guarantees even run.**
This is also why Fix 2 (the dead 30-min bucket) barely moved `avg_main_exercises`: it corrected
Step 3's target, but Step 4 was already independently overriding that target with its own
hardcoded ceiling — the fix landed on the wrong layer to move the average, even though the bucket
itself is still correctly fixed and worth keeping.

### Bonus, unrequested but load-bearing for reading any bolt-pooled average correctly

Bolt1 is not a shorter/failed attempt at the requested duration — it is *designed* to be shorter
(`flow_regression`/"easy" option; observed `estimatedDuration` 17-25min against a 45min request in
this trace, consistent every time). Every average in Addenda 8/9 pools all 3 bolts together. This
does not invalidate the domain-completeness finding — bolt2 and bolt3, which DO target the full
duration, independently confirmed missing domains in this same trace (bolt2 missing core in one
run, bolt3 missing legs+core in another) — but a per-bolt breakdown would be a more honest lens than
a pooled average for any future duration-gap or domain-completeness measurement.

### Open item carried forward, not addressed

`trio-modifiers.service.ts`'s `applyFlowRegression` needs the same victim-protection audit Fix 1
gave the 3 guarantee passes. Not in scope this pass — report only, per instruction.

**Commit:** local only, no push. No source files changed — all `STAGE_TRACE`/measurement
instrumentation was temporary, reverted (`git diff` against `HEAD` confirmed empty) before this
addendum was written.

---

## Addendum 11 — `applyEssentialGearFilter` fixed (4th site), by-bolt reporting replaces pooled
## averages, and a major correction to every earlier "45min cliff" framing

### 1. Fix — `applyEssentialGearFilter` never strips a domain's sole representative

Same rule as the 3 guarantee passes (Addendum 9's Fix 1), applied to a 4th site, **sharing** the
existing predicate rather than copying it. `GuaranteePassRunner.ts`'s `computeDomainCounts` /
`isSafeDomainVictim` are now exported and imported directly into `trio-modifiers.service.ts`.

The mechanism (Addendum 10 traced it to the call site; this pass read the actual filter code):
`applyEssentialGearFilter`'s naked/gear-free check has two removal points, neither domain-aware:
1. The main gear-pass loop — drops any exercise that isn't naked (bodyweight-or-essential-gear-free).
2. A "final validation" pass afterward that re-checks the *same* naked condition and would silently
   **undo** a fix applied only to point 1 — both needed the guard, not just the first one found.

Fix: compute domain counts once over `main` before either pass; an exercise that fails the naked
check but is the sole remaining representative of a `PRIMARY_DOMAINS` domain is now kept (tagged
`naked_filter:kept_sole_domain_representative_despite_gear`) instead of dropped, at **both** points.

4 regression tests (`naked-filter-domain-protection.test.ts`), 3 confirmed failing on pre-fix code
via `git stash` (the 4th is a deliberate control: a gear-requiring exercise with another
same-domain representative still gets removed exactly as before — the fix does not become "never
remove gear"). Commit `274a850d`.

### 2. New standing tool — `scripts/audit/report-by-bolt.ts`

Per David's instruction: every numeric report from now on splits by `bolt` (1/2/3), never pools
them into one average. `workouts.bolt` was already in the schema from the first version of
`build-snapshot.ts` — the gap was in every *query* since, including every prior addendum's, which
grouped across bolts. This script is the fix, committed as the standing tool rather than another
one-off `sqlite3` session: exercise count, duration gap, % with core, and domain-completeness, each
broken out by `bolt × req_duration`.

### 3. What splitting by bolt actually reveals — a correction, not a new bug

Rebuilt snapshot (540 workouts) before and after the Fix 1 (§1 above), bolt-1 vs bolt-2 vs bolt-3 at
45min:

| Metric (45min) | Bolt 1 (flow_regression) — before → after | Bolt 2 (standard) — before → after | Bolt 3 (intense) — before → after |
|---|---|---|---|
| avg main exercises | 4.00 → 4.56 | 4.18 → 4.60 | 3.76 → 3.69 |
| avg duration gap | **-21.27 → -19.20** | -2.78 → -2.69 | -3.22 → -3.69 |
| % with core | 86.7% → 73.3% | 42.2% → 48.9% | 42.2% → 40.0% |
| % missing ≥1 domain | 91.1% → **80.0%** | 68.9% → 53.3%\* | 68.9% → 68.9% |

\* Bolt 2 (`postProcess: 'none'`) never calls `applyEssentialGearFilter` or `applyFlowRegression` —
confirmed by reading the dispatch switch in `home-workout.service.ts`. Its improvement here is
re-sampling noise (no fixed seed exists in this codebase — `build-snapshot.ts`'s own header
comment), not an effect of this fix. **Only bolt 1's domain-completeness improvement (91.1% →
80.0%) is attributable to the fix** — it is the only bolt whose code path reaches the fixed filter.

**The load-bearing discovery is in the "before" column, and it was true before this fix too — every
earlier addendum's pooled "45min duration cliff" (Addenda 8/9/10: "-8.5 to -10.7min", "-9.09min",
uniform across levels) was overwhelmingly bolt 1 dragging the average down.** Bolt 1 delivers
roughly **half** the requested duration at 45min (-19 to -21min gap, i.e. ~24-26min actual) — bolt 2
and bolt 3, the two bolts that actually target the full duration, are only off by **-2.7 to
-3.7min**, a much smaller and arguably unremarkable gap. Pooling averaged a 20-point outlier
together with two 3-point ones and reported the blend as if it applied uniformly. **This is a
correction to the prior framing, not a new bug** — the domain-completeness problem (Addendum 9's
headline metric) is confirmed real independent of this, since bolt 2/bolt 3 alone still show 53-69%
missing a domain at 45min.

**Open question, not investigated further this pass:** is bolt 1 delivering ~half the requested
time by design (an intentionally short "easy" option, independent of the slider) or is this itself
an unrecognized bug (a user who asks for 45 minutes and gets a 24-26 minute "easy" option may not
expect that big a cut)? Flagging for David's judgment — this session did not chase it, since it
falls outside this round's 3 assigned items.

**Commit:** `report-by-bolt.ts` (new) + refreshed `snapshot.sqlite`, local only, no push.

---

## Addendum 12 — the cluster cap: what it was built to prevent, real values, a real simulation, and
## 3 full before/after workouts. Report only — nothing implemented, awaiting David's decision.

### (א) What the cap was built to do — found in the code's own comment, not guessed

`BudgetDistributor.ts:56-72` (unchanged since the file's creation — `git log -S"11 sets"` dead-ends
at the same opaque bulk-migration commit `7301dbbb` that created this file from
`WorkoutGenerator.ts`'s Step 5h/5g; no earlier, more detailed commit exists to cite):

```
// Skill / Strength Cluster — when difficulty=3 collapses a thin-spread plan
// onto a small set of high-quality exercises, we cap the unique main count
// and stack remaining sets onto each survivor up to this ceiling.
...
// Balanced Cluster — when difficulty=2 produces too many shallow exercises
// (the "11 sets ÷ 7 exercises = 2-set fragments" bug), cull the unique main
// count to a tight focused block and stack remaining sets onto the survivors
// up to a hypertrophy-appropriate ceiling.
```

**Not a bug, and not a per-movement-cluster limit despite the name** — "cluster" refers to a
*cluster of sets* concentrated onto fewer exercises, not a cap on any one movement-pattern group.
It is a deliberate, previously-diagnosed fix for the opposite failure mode: a session that spreads
its total set-budget across too many exercises, leaving each one with only 1-2 sets — not enough
sets to constitute a real working stimulus by ordinary strength/hypertrophy standards. The cap
trades exercise *count* for exercise *quality* (`BALANCED_CLUSTER_MAX_SETS = 4` /
`SKILL_CLUSTER_MAX_SETS = 5` redistributes the freed budget onto the survivors).

**This was also reviewed and approved by David before** — commit `44d6fd04` ("D2 balanced-cluster
cap unlocks 4th main exercise for long sessions (#25)", co-authored with David) added the
`availableTime >= 45` release condition on top of the pre-existing 3/4 ceiling, citing "Option 1
from the approved investigation." The ceiling itself predates that commit; only the duration-release
condition was new there.

**The real conflict, precisely stated:** this cap and the `getExerciseCountForDuration` dead-bucket
fix (Addendum 9) were never designed against each other. The bucket fix correctly raised Step 3's
*target* to 6-8 for 45min. This cap, several steps later in the same pipeline, independently caps
the *result* at 3-4 regardless of what Step 3 asked for — not because anyone intended Step 4 to
override Step 3, but because Step 4's ceiling was never revisited when Step 3's bucket was fixed.
Neither is wrong on its own; they now disagree.

### (ב) The exact values

| Constant | Value | Applies to |
|---|---|---|
| `BALANCED_CLUSTER_MAX_MAIN_BASELINE` | 3 | D2 (bolt 2), narrow-focus session |
| `BALANCED_CLUSTER_MAX_MAIN_DIVERSE` | 4 | D2, when ≥3 distinct domains present OR `availableTime >= 45` |
| `BALANCED_CLUSTER_MAX_SETS` | 4 | Max sets/exercise D2 redistributes onto a survivor |
| `SKILL_CLUSTER_MAX_MAIN` | 4 | D3 (bolt 3), fixed — no diversity/duration release exists for D3 |
| `SKILL_CLUSTER_MAX_SETS` | 5 | Max sets/exercise D3 redistributes onto a survivor |
| `BALANCED_DIVERSITY_THRESHOLD` | 3 | Distinct domains needed to unlock the diverse (4) cap |

D3's cap has no duration-release condition at all (`_skillClusterCap` only checks
`isSkillOrStrengthSession`) — if this were ever changed for D2, D3 would need its own equivalent
decision, not an automatic mirror.

### (ג) Simulation: cap derived from the duration bucket instead of fixed

Temporarily replaced `_balancedClusterCap`'s fixed 3/4 with `getExerciseCountForDuration
(context.availableTime).exerciseCount` (env-flag gated, reverted before this addendum was written —
`git diff` against `HEAD` confirmed empty), 5 real combos, bolt 2 only:

| Combo | Real (fixed cap) | Simulated (duration-derived cap) |
|---|---|---|
| L5 30min home | 4 ex, 9 sets, **2.3 sets/ex**, dur=29min | 4 ex, 8 sets, **2.0 sets/ex**, dur=28min |
| L5 45min home | 4 ex, 12 sets, **3.0 sets/ex**, dur=43min | 7 ex, 14 sets, **2.0 sets/ex**, dur=41min |
| L5 60min home | 4 ex, 15 sets, **3.8 sets/ex**, dur=44min | 6 ex, 12 sets, **2.0 sets/ex**, dur=41min |
| L8 45min gym | 3 ex, 12 sets, **4.0 sets/ex**, dur=41min | 5 ex, 13 sets, **2.6 sets/ex**, dur=45min |
| L1 45min home | 4 ex, 14 sets, **3.5 sets/ex**, dur=42min | 6 ex, 11 sets, **1.8 sets/ex**, dur=35min |

**The duration gap does not reliably improve** — it got closer in 1 of 5 (L8/gym: 41→45), got
*worse* in 2 of 5 (L5/45: 43→41 away from target; L1/45: 42→35, notably worse), and moved
negligibly in the rest. Raising the exercise-count ceiling alone, with no coordinated change to the
total set-budget or rest-time math, is not a reliable fix for the duration gap on its own.

### (ד) The physiological risk — confirmed, not theoretical

**Every single simulated combo dropped to ~2.0 sets per exercise** (vs. 2.3-4.0 in the real
version) — this is **exactly** the "11 sets ÷ 7 exercises = 2-set fragments" failure mode the cap
was built to prevent, reproduced live by loosening it. 2 sets on a compound calisthenics movement is
below what most strength/hypertrophy programming treats as a working set for that exercise — the
session would trade "too short" for "technically longer, but every exercise under-dosed." **Naively
swapping the fixed cap for a duration-derived one, with everything else unchanged, recreates the
original bug rather than fixing the new one.** Any real fix would need to also address total
set-budget scaling (`dailySetBudget`) alongside the exercise-count ceiling, not the ceiling alone —
out of scope for this report, flagged for the decision this raises.

### (ה) 3 full before/after examples — real generated workouts, not synthetic fixtures

**L5, 45min, home:**
- Real (4 ex, 12 sets): החזקת מתח ב-15° עם תמיכה (2 sets), שכיבות סמיכה (4 sets), החזקת מקבילים
  ב-90° עם גומייה (2 sets), שרימפ סקוואט בלי ידיים טווח חלקי (4 sets)
- Simulated (7 ex, 14 sets): החזקת מקבילים (2), החזקת מתח ב-120° עם תמיכה (2), שכיבות סמיכה טווח
  תחתון (2), החזקת שכיבת סמיכה ב-90° במרפק (2), שכיבות סמיכה ב-45° (2), חתירות ב-45° (2), שרימפ
  סקוואט בלי ידיים טווח חלקי (2)

**L8, 45min, gym:**
- Real (3 ex, 12 sets): מתח אקצנטרי (4), מקבילים אקצנטרי (4), שכיבות סמיכה יהלום (4)
- Simulated (5 ex, 13 sets): משיכות Y (3), מתח אקצנטרי (2), מקבילים עם גומייה עבה (2), שכיבות סמיכה
  בפישוק (3), פיסטול סקוואט מוגבה טווח חלקי (3)

**L1, 45min, home:**
- Real (4 ex, 14 sets): חתירות ב-75° (4), פשיטת מרפקים על הרצפה (3), היפ טראסט (4), פלאנק על
  הברכיים (3)
- Simulated (6 ex, 11 sets): תלייה פסיבית (2), פשיטת מרפקים על הרצפה (2), חתירות ב-75° (2), עליות
  תאומים על מדרגה (2), סקוואט בעזרת רצועות (2), טבטה (1)

### Not implemented, per instruction

No source file changed by this investigation — the `getExerciseCountForDuration`-derived cap and
the env-flag gate in `_balancedClusterCap` were temporary, reverted (`git diff` against `HEAD`
confirmed empty) before this addendum was written. Awaiting David's decision on whether/how to
reconcile the cap with the duration bucket — not a fix to apply unilaterally.

**Commit:** local only, no push. Docs only.

---

## Addendum 13 — core is missing from onboarding for ~half of real users. This may be the actual
## root cause of the core-absence problem — bigger than anything found in the engine itself.

David's item 3, investigated first per his explicit instruction ("זה עשוי לייתר עבודה אחרת").
Report only — no source file touched, no onboarding code changed.

### (א) Full map — every onboarding path and core's fate

Paths are `'health' | 'body_focus' | 'skills' | null`
(`assessment-path-config.service.ts:17`, read from `sessionStorage['onboarding_program_path']`).
Code comments call them Path A/B/C. The legacy `/onboarding` route is dead (redirects to
`/gateway`, `src/app/onboarding/page.tsx:16-21`) — the only live assessment is
`src/app/onboarding-new/assessment-visual/page.tsx`. David's cited line numbers (414-430, 686-713)
are accurate.

| Path | Core assessed? | Core zeroed? |
|---|---|---|
| **`health`** (A) — all 4 categories | YES — full slider | NO — default branch, `page.tsx:713` |
| **`body_focus`** (B) — chip-derived categories | Conditional — only if `core` chip/`full_body` picked | **YES when not picked** — `page.tsx:709-713` |
| **`skills`** (C) — skill IDs only | NEVER | **YES, unconditionally** — `page.tsx:425-430` + `:709-710` |
| `null` (legacy/no path) | YES — all 4 | NO |
| Mini top-up (existing user, 1 new domain) | Only the requested domain | YES for all others — `single-domain-assessment.service.ts:56-58` |

Zeroing code, Path C (`page.tsx:425-430`, comment at `:418`: *"'legs' and 'core' must remain 0 so
the purge can vaporise them"*):
```ts
const masterSubLevels = { push: 0, pull: 0, legs: 0, core: 0 };
```
Zeroing code, Paths B+C (`page.tsx:709-713`):
```ts
core: isSkillsPath ? 0
  : pathConfig?.path === 'body_focus'
    ? (pathConfig.categories?.includes('core') ? (result.levels.core ?? 0) : 0)
    : (result.levels.core ?? 0),
```
For Path B this line is actually *protective*, not destructive — `toFullAssessmentLevels`
(`:367-379`) fabricates `level = pathConfig.minLevel` (1) for every unassessed category before the
rule engine runs, so this line replaces a **fabricated** 1 with an honest 0.

### (ב) What "the purge" actually does — deletes, does not pin at 0

`onboarding-sync.service.ts:1471-1508`, gated on `isPathCSkills` (`:1490`) — **runs only for Path
C**:
```ts
if (isPathCSkills) {
  for (const ghostDomain of ['legs', 'core'] as const) {
    if (seeded && seeded.currentLevel === 0) delete seededDomains[ghostDomain];
    if (merged && (merged.currentLevel ?? 0) === 0) delete mergedTracks[ghostDomain];
  }
```
Persisted via `setDoc(users/{uid}, ..., {merge:true})` (`:1987`). **Path B's zero survives** — the
purge never runs for it, so `progression.domains.core = {currentLevel:0, maxLevel:N,
isUnlocked:true}` is written and stays. Result: Path C → `domains.core` deleted, `tracks.core`
absent. Path B → `domains.core` present at 0, `tracks.core` absent (the `childLevel > 0` filter at
`:1349-1354` never writes a 0 into tracks in the first place).

### (ג) Engine-side consequence — both states collapse to the same silent skip

`buildUserProgramLevels` (`level-resolution.utils.ts:106-121`) — `resolveDataLevel` returns 0 for
*both* a missing object and `{currentLevel:0}` — so **present-at-0 and missing-entirely are
identical** on the engine side: `userProgramLevels.has('core') === false` either way, never
`.get('core') === 0`. Every core-selection site is `has()`-guarded — `selectExercisesWithDomainQuotas`
(`workout-selection.utils.ts:624-629`), `GuaranteePassRunner.ts` (`:182,:388,:533`) — so **core is
silently skipped every time**, not "level-0 content gets selected." No level-0 core exercise is
ever a candidate.

**These users never see "needs assessment" either.** That short-circuit
(`home-workout.service.ts:719-738`) fires only when the user has *zero* assessed domains at all
(`activeProgramFilters.length === 0`). A Path B push+pull user has non-empty filters — a normal
full-body workout composes and simply never contains core, with the only trace being one
`pipelineLog` line.

### (ד) Production numbers — read-only Admin SDK query, no writes, no files created

**204 real profiles** (users with any `progression.domains`/`.tracks` entry, out of 617 total docs
— 413 are empty onboarding-incomplete shells, excluded):

| State | Count | % of 204 |
|---|---|---|
| MISSING (track deleted) | 34 | 16.7% |
| ZERO (`currentLevel:0` placeholder survives) | 67 | 32.8% |
| POSITIVE (core actually assessed) | 103 | 50.5% |

**101 of 204 real profiles (49.5%) have a functionally unusable core — 81 of them with
`onboardingStatus === 'COMPLETED'`.** Holds across every cohort cut checked (COMPLETED-only: 188
users, 92 unusable = 48.9%; ≥1 primary domain assessed: 173 users, 85 unusable = 49.1%).

The two failure states cleanly separate by mechanism: all 67 ZERO users have `domains.core`
present with **zero** having a `tracks.core` key (the exact signature of the Path-B placeholder
surviving); the 34 MISSING users' `activePrograms` skew heavily skill-track
(`calisthenics_upper`, `front_lever`, `planche`) — the Path-C purge firing as designed.

No onboarding-path field exists on the user doc — the path column above is inferred from
`skillFocusIds` + assessed-domain count, a strong but heuristic signal, not a recorded fact
(flagged, not asserted).

### Bottom line

**~half of real, onboarded users can never receive a core exercise, with zero user-facing
indication anything is missing.** This is very plausibly the dominant driver of the ~65%/92%
missing-core numbers measured in Addenda 9-11 — no guarantee-pass fix, cluster-cap change, or
trio-modifier fix can put core into a workout for a user whose core level is architecturally
invisible to the engine. Not fixed this pass, per instruction — this touches new-user onboarding
and needs David's decision on (a) what content gap remains (Path C/B skip core assessment
entirely — is there a visual-assessment flow for core at all, or does restoring it require new
questions/images first?) before any code changes.

**Commit:** local only, no push. Docs only — no onboarding code touched.

---

## Addendum 14 — cluster cap re-simulated correctly (set budget scaled with exercise count),
## compared against the real legacy workout library. Report only.

David's item 2 correction: the first simulation (Addendum 12 §ג/ד) raised exercise count without
raising the total set budget, so the same ~11-14 sets simply spread thinner — that only proves you
can't add exercises for free, not that the cap itself is right. Re-run as instructed.

### Structural finding: `dailySetBudget` has no duration-awareness at all

`SplitDecisionService.ts:432-501` computes `dailySetBudget` purely from **user level + weekly
schedule frequency + weekly deficit** (`domainSetsCompletedThisWeek` / `remainingWeeklyBudget`) —
`availableTime` (session duration) never enters this formula. A 20-min and a 60-min request for the
same user on the same day currently get the **same** `dailySetBudget`; duration only affects
downstream trimming (the exercise-count bucket, cluster caps, Time-Volume loop), never the total
volume target itself.

**This means "raise the set budget with duration" is not a BudgetDistributor-local change** — it
requires a new dependency in `SplitDecisionService.ts`, a file that has never had duration as an
input. And it **structurally conflicts with the weekly Deficit-Aware system**: today, a session's
sets are drawn from "your fair share of this week's total," not sized per-session. Inflating one
45-min session's budget beyond its computed daily share means that session consumes more than its
allotted portion of the week — the `domainSetsCompletedThisWeek` tracker would then show it as
having "used" more of the week's quota than the level-based math intended, front-loading later
sessions into deficit. Confirmed structurally by reading the formula; not chased into a full
simulation of multi-week effects — out of scope for this report.

### Real benchmark — David's own legacy workout library, not the code comment

`docs/workout-engine/legacy-workouts.sqlite` (`legacy_workout_sets.required=1` = main slots,
`repeats` = sets per slot; `required=0` = warmup/cooldown, verified by reading actual exercise
names in a sample workout).

**All 45-minute workouts, any target (n=11):**

| minutes | n | avg main slots | min–max | avg total sets |
|---|---|---|---|---|
| 45 | 11 | **3.0** | 3–3 | 9.27 |

Every single one of David's own real 45-minute workouts has **exactly 3 main exercises** — this
already closely matches (or is *below*) what the current engine produces (avg 3.7-4.6 per
Addendum 11's bolt-2/bolt-3 numbers).

**Full-body-tagged workouts only** (`targetid=15`, "כל הגוף" — the category most relevant to
"vertical+horizontal together"):

| minutes | n | avg main slots | range | avg total sets |
|---|---|---|---|---|
| 20 | 26 | 4.2 | 2–6 | 10.2 |
| 25 | 19 | 4.4 | 2–6 | 11.1 |
| 30 | 16 | 4.9 | 3–6 | 13.1 |
| 35 | 5 | 5.6 | 4–6 | 12.8 |
| **40** | **1** | **7** | — | **14** |
| **45** | **0** | — | — | — |

**There is no 45-minute full-body workout anywhere in the legacy library.** The one 7-exercise
example (id 611, "אימון ארוך בית לפני המקלחת") is at 40min, and even there sets-per-exercise = 2.0
— the exact "thin fragment" pattern the current cluster cap's own comment names as the bug it
prevents. The full-body category's real historical pattern at 30-40min is **5-6 exercises,
12-14 total sets (~2.2-2.8 sets/exercise)** — more exercises than the general 45min pattern, but
*thinner* per exercise than David's own stated "3-4 sets is right" preference, not richer.

### Duration math — does 6×3-4 physically fit in 45 minutes?

`calculateEstimatedDuration` (pure function, called directly with synthetic data, ~75s rest / 8
reps / 3s-per-rep — a middling real assumption, not a proven live-average):

| Config | Total sets | Main-block duration (before warmup/cooldown) |
|---|---|---|
| Current typical (4 ex) | 14 | 25 min |
| Target 6×3 | 18 | **33 min** |
| Target 6×3-4 | 22 | **39 min** |

Real observed full workouts (warmup+cooldown included) land near 42-45min off a ~25min main block
— implying warmup/cooldown adds roughly 17-20min in practice. Adding that back: 6×3 (33min main)
→ **~50-53min total**; 6×3-4 (39min main) → **~56-59min total**. **Both overshoot a true 45-minute
session** under realistic rest assumptions — this is a real physical/time constraint, not an
implementation gap. Fitting 6 exercises × 3-4 sets into an actual 45 minutes requires either
shorter rest periods (a legitimate but different training-style choice, not free), fewer total
sets (contradicting "3-4 sets is right"), or accepting the session runs longer than 45 minutes
(which the new meta-rule, Addendum 15, would then require honoring explicitly, not silently).

### Bottom line

The cluster cap is not simply "wrong" — David's own legacy library never produced a 45-minute,
6-exercise, 3-4-sets-each workout, and the duration math shows why: it doesn't fit without changing
rest periods or accepting a longer session. The closest real precedent (35-40min full-body,
5-6 exercises) already trades toward *fewer* sets per exercise than desired. Not implemented, per
instruction — this is a genuine design tradeoff for David to resolve, not a bug to patch.

**Commit:** local only, no push. Docs only — the temporary `BudgetDistributor.ts` simulation edit
was reverted (`git diff` against `HEAD` confirmed empty) before this addendum was written.

---

## Addendum 15 — new meta-rule (explicit choice beats engine heuristics), full override scan
## (F1-F20), and a correction: bolt 1's shortening IS reachable from an explicit user choice

David's item 1. The new standing rule itself is written into `00-PLAN.md` §16 (not here — that
doc is the one meant to be checked before future engine work, per David's instruction that this
be a checked-against law, not a changelog entry). This addendum carries the scan results and the
narrative.

### The 3 real entry points into the trio pipeline

| Path | Call site | Nature |
|---|---|---|
| A | `StatsOverview.tsx:867` → `generateHomeWorkoutTrio` | **Automatic** (home carousel) — hardcoded `availableTime`, no difficulty/domain/strict flags |
| B | `UserWorkoutAdjuster.tsx:127` → `generateHomeWorkout` | **Explicit** (slider) — duration, difficulty, domain chips |
| C | `WorkoutBuilderSheet.tsx:635` → `generateHomeWorkout` | **Explicit** (Custom Builder) — duration, difficulty + `targetDifficulty`, domains + `strictDomains: true`, `isManualOverride: true` |

**The single most consequential structural fact:** `generateHomeWorkout` (`home-workout.service.ts:
211-219`) returns `trio.options[1]` (the D2 "balanced" bolt) **unless** `targetDifficulty` is set —
and **Path B (the slider) never sets it.** Every slider request, regardless of the difficulty the
user tapped, is generated as if they'd picked "balanced."

### (ג) Bolt 1 verification — David's specific ask, answered definitively

**Bolt 1's `flow_regression` shortening IS reachable from an explicit user choice — a bug per the
new rule.** Traced end to end: Custom Builder → explicit bolt-1 tap sets `targetDifficulty: 1` →
`generateHomeWorkout` returns `options[0]` → the config gate selects `TRAINING_DAY_CONFIGS[0] =
{difficulty:1, postProcess:'flow_regression'}` — **byte-for-byte the same config object the
automatic carousel's bolt 1 uses** → `resolveEffectiveBoltTime` caps at 30min regardless of what
the user explicitly picked (45/60/90) → the same `applyFlowRegression`/`applyEssentialGearFilter`
chain fires. An explicit "45 min, easy" Custom Builder request is delivered as ~24min, from a
fully deliberate user action. **This corrects Addendum 10/11's framing, which treated bolt 1's
shortness as automatic-only** — it is not; the Custom Builder reaches the identical code path.
Separately, and on the *same* screen: the slider path (B) never reaches `flow_regression` at all,
because tapping "קל" there doesn't set `targetDifficulty` — it silently delivers the D2 balanced
bolt instead (see F1 below), a *different* violation of the same rule.

### (ב) Full override scan — list only, not fixes, per instruction

Every mechanism found capable of overriding, substituting, shortening, blocking, or ignoring an
explicit user choice. "Explicit-reachable" = confirmed reachable from path B and/or C, not just A.

| # | Mechanism | File:line | Explicit-reachable |
|---|---|---|---|
| F1 | **Slider difficulty pick 100% discarded** — always resolves to bolt-2/D2 regardless of tap | `home-workout.service.ts:881,219` | **YES (B)** |
| F2 | `resolveEffectiveDifficulty` forces D-level down for deload/detraining, "regardless of UI selection" per its own comment; `isManualOverride` does not bypass it | `InputSanitizerMiddleware.ts:608-655` | **YES (C)** |
| F3 | `targetDifficulty` slot-gating | `home-workout.service.ts:842,217` | Verified correct — no override |
| F4 | **`BOLT_DURATION_CAPS`** — `min(requested, cap)`, cap=30/45/60 by bolt; silent above the cap (log line only fires when it's NOT shortened) | `home-workout.service.ts:662-666,892`; `bolt-time.utils.ts:12-18` | **YES (B+C)** |
| F5 | `enforceVolumeCap` — materializes F4's shortened value into the delivered plan | `PresentationFormatter.ts:430` | Delivery arm of F4, not independent |
| F6 | Time-Volume Feedback Loop — ceiling with 3min tolerance | `WorkoutGenerator.ts:1137-1186` | Not a violation (ceiling only) |
| F7 | `getExerciseCountForDuration` duration buckets | `workout-budgeting.utils.ts:122-142` | Not a violation (sizing, not substitution) |
| F8 | **`_balancedClusterCap`/`_skillClusterCap`** — gated on difficulty only, no path/caller check | `BudgetDistributor.ts:493,619` | **YES (B+C)** — runs on every slider request too, not carousel-only |
| F9 | **Budget Floor → recovery-mode swap** — remaining budget 1-5 replaces ALL 3 bolts with a random stretch card; not gated on `isManualOverride` | `home-workout.service.ts:782-806` | **YES (B+C)** — flagged as the cleanest, highest-severity violation |
| F10 | 2-domain chip picks collapse to `domains[0]` — the 2nd picked domain is silently dropped for any pair other than push+pull | `StructureDirector.ts:87-98,217-218` | **YES (B+C)** |
| F11 | `runFullBodyDomainGuarantee` does not check `strictDomains` (its 2 siblings do) — can inject an unrequested domain | `GuaranteePassRunner.ts:419` | **YES (B+C)**, 3+ chips |
| F12 | Path B never sets `strictDomains` at all — all 3 guarantee passes unlocked for every slider chip-pick | `UserWorkoutAdjuster.tsx:127-139` | **YES (B)** |
| F13 | `absent=absent` on an explicitly-picked but unassessed domain — bare `continue`, zero log, zero user signal, never redirects to "needs assessment" | `workout-selection.utils.ts:624-629` | **YES (B+C)** |
| F14 | Domain fill-cap (`maxPerDomain`) | `workout-selection.utils.ts:826-842` | Not a violation — proportional allocation |
| F15 | Legs Cap for full-body (max 2 leg exercises) | `WorkoutGenerator.ts:1056-1099` | **YES (B+C)**, 3+ chips spanning legs |
| F16 | Dominance path bypasses `requiredDomains` entirely (zero references to it) | `WorkoutGenerator.ts:1523-1534` | **YES, user-state-dependent** — not verified how often it fires |
| F17 | 48h muscle shield hard-blocks an explicitly re-picked muscle group — not gated on `isManualOverride` | `SplitDecisionService.ts:508-525`; `ContextualEngine.ts:254` | **YES (B+C)** |
| F18 | Smart Merging / weekly deficit | `SplitDecisionService.ts:344-384`, gate `:415` | **NO** — automatic-only, confirmed |
| F19 | Desk Workout Constraint — triggered by a Firestore **title substring match**, not any user field; no guard at all | `home-workout.service.ts:1085-1116` | **YES (B+C)** — trigger is admin-authored title text |
| F20 | `applyEssentialGearFilter` naked-filter — reachable only via `applyFlowRegression` | `trio-modifiers.service.ts:614`, called `:587` | **YES (C only)**, bolt-1 exclusively |

**Highest-severity, in order:** F9 (recovery swap ignores duration+difficulty+domain simultaneously)
> F1 (difficulty pick discarded 100% of the time on the slider) > F12/F11 (slider has zero domain
protection at all) > F4 (silent duration cap above 30/45/60) > F19 (content-authored title can
override anything, no user field involved at all).

### Not implemented, per instruction

Nothing in F1-F20 was fixed — this is a scan, not a patch list. `00-PLAN.md` §16 carries the rule
itself for future work to be checked against.

**Commit:** local only, no push. Docs only.

---

## Addendum 16 — Addendum 13's numbers are stale (pre-fix profiles); a real post-fix profile
## checked directly — core IS present, matching, and correctly selected

David added core back to the questionnaire and registered once with it since Addendum 13 was
written. Addendum 13's 101/204 figure is from **before** that change and should not be relied on
going forward — this addendum checks the actual current behavior on a real post-fix profile
instead.

### The profile checked

Auth `uid=PF1537oDy3bIsjHrVdJADCaxAqo2`, anonymous auth, created **2026-09-03** — the most recent
real (non-diagnostic-script) signup with `onboardingStatus: COMPLETED` at the time of this check.
(Finding it required filtering out: (a) `createdAt` on the Firestore doc, which stores the literal
unresolved `FieldValue.serverTimestamp()` sentinel rather than a real value — unrelated pre-existing
oddity, not chased further; (b) ~600 diagnostic-script auth accounts created by this and other
sessions' throwaway `createCustomToken()` calls this week, filtered by uid shape.)

### (2) What's actually saved — core vs. push/pull/legs, same profile

```
progression.domains.core = { maxLevel: 20, isUnlocked: true, currentLevel: 11 }
progression.tracks.core  = { percent: 0, currentLevel: 11 }
```
**Both present, both = 11.** Compare push/pull on the *same* document:
```
progression.domains.push = { maxLevel: 25, isUnlocked: true, currentLevel: 0 }
progression.tracks.push  = { currentLevel: 9, percent: 0 }
progression.domains.pull = { maxLevel: 25, isUnlocked: true, currentLevel: 0 }
progression.tracks.pull  = { currentLevel: 6, percent: 0 }
```
push/pull show `domains=0` but `tracks=9`/`6` — a real mismatch, but on this profile it does **not**
look like a core-specific problem: `activePrograms` shows push added 2026-09-03 (onboarding),
pull added 2026-09-05 08:55 and core added 2026-09-05 17:16 — three separate add-a-domain actions
days apart, not one onboarding session. `progression.service.ts:210-226` already mirrors
`tracks.currentLevel` into `domains.currentLevel` on every progression update
(`domainMirror['progression.domains.${programId}.currentLevel'] = track.currentLevel`) — so
push/pull's mismatch, on paper, shouldn't exist either. **I did not fully trace why it does** —
flagging as a real, separate, unexplained oddity rather than guessing; core simply hasn't had time
to diverge (added same-day as this check), so it isn't evidence either way for core specifically.

### (3) What the questionnaire writes — no core-specific code path found

`onboarding-sync.service.ts:1296-1354` (`quizTracks` construction) treats core identically to
push/pull/legs — same generic loop (`if (childLevel > 0) quizTracks[childId] = {currentLevel,
percent:0}`), no core-specific branch. The domains/tracks mirror at `:1449-1461` ("Mirror quiz
currentLevels into the seeded `initialDomains` so the two paths agree from day 1") also applies
uniformly to whatever is in `quizTracks`, core included. **No code-level difference found between
how core and push/pull/legs get written** — Addendum 13's Path B/C zeroing (`assessment-visual/
page.tsx:709-713`) still exists in the code, but did not fire for this profile (core was assessed,
not skipped).

### (4) Real full-body generation, this exact profile's real data

Ran `generateHomeWorkoutTrio` with a profile scaffolded from `buildMockProfile` but with
`progression.domains`/`.tracks`/`.activePrograms` overwritten with this user's actual fetched
Firestore data (not synthetic) — `availableTime:45, requiredDomains: undefined`.

**Bolt 2 (the "balanced" option) selected 3 core exercises outright** — `hasCore: true`, main
`movementGroups = [vertical_push, ?, vertical_push, horizontal_push, vertical_push, core, core,
core]`. Bolts 1 and 3 showed `hasCore: false`, but their main blocks were 100% push movement groups
— consistent with a single-domain(push) blueprint for those two bolts, where core correctly isn't
expected, not a core-specific failure.

**Secondary, unrequested observation:** none of the 3 bolts showed a genuine push+pull+legs+core
full-body blueprint for this profile — 2 of 3 were push-only, 1 mixed push+core. Given this user
has 3 separate active single-domain programs (push/pull/core, no combined "full_body" program),
this smells like `StructureDirector`'s domain-resolution logic not merging multiple separate
single-domain `activePrograms` into a full-body blueprint the way one might expect — genuinely
interesting, but tangential to the core question asked here and **not investigated further this
pass**.

### Bottom line — direct answer to the question asked

**`progression.tracks` is where the engine reads from (`buildUserProgramLevels`), and core lands
there correctly for this profile, matching `domains`.** The engine sees `core` present at level 11
and selects real core exercises when the blueprint calls for it (confirmed live, bolt 2). Addendum
13's "101/204 broken profiles" describes the **pre-fix** state — David's own fix (adding core back
to the questionnaire) appears to be working on this one real post-fix data point. This is not a
re-measurement of the full user base (that would need a fresh Addendum-13-style query filtered to
post-fix signups only, not done here per "quick check" scope) — it is confirmation that the
mechanism works end-to-end on a real profile, not a claim about how many users are now fixed.

**Commit:** local only, no push. Docs only — read-only Firestore queries + one synthetic-profile
generation run, no writes, no temp scripts left behind.

---

## Addendum 17 — F1 fixed (slider difficulty pick reaches the workout); F2 rationale reported,
## not touched

David's part 2. Fix committed as `08e12ac4`; this addendum carries the required proof + F2 report.

### F1 fix

`generateHomeWorkout` (`home-workout.service.ts:212-220`) always returns the D2 balanced bolt
unless `targetDifficulty` is set — by its own doc comment. `UserWorkoutAdjuster.tsx` passed
`difficulty` but never `targetDifficulty`, so every slider request was silently delivered as D2
regardless of what the user tapped. Fixed by adding `targetDifficulty: difficulty`, mirroring what
`WorkoutBuilderSheet.tsx` (Custom Builder) already correctly does.

The options-building logic was extracted into `user-workout-adjuster-options.utils.ts` (a pure,
non-JSX file) so the fix has a real test — this repo has no `@testing-library/react`, and importing
anything from the `.tsx` component directly fails vitest's parser (confirmed: attempting it throws
mid-parse on the component's JSX). 4 tests in
`user-workout-adjuster-target-difficulty.test.ts`, all confirmed failing on pre-fix code (temporarily
re-commenting `targetDifficulty`, not via `git stash` since the file was new/untracked) and passing
after restore.

### Proof — same profile, same 45min/home request, 3 explicit difficulty picks

Called `generateHomeWorkout` with the exact `{difficulty, targetDifficulty}` shape the fixed
component now sends:

| Pick | Duration | Total sets | Main exercises |
|---|---|---|---|
| 1 — קל | **14 min** | 9 | שכיבות סמיכה בפישוק (2×10), שכיבות סמיכה ברכיים (2×11), החזקת הולו באדי (1×29s) |
| 2 — בינוני | **44 min** | 17 | משיכות Y (4×2), שכיבות סמיכה יהלום (2×11), מקבילים אקצנטרי (2×5), דרגון סקוואט בתמיכת יד (3×3) |
| 3 — עצים | **43-44 min** | 16 | שכיבות סמיכה יהלום (2×12), משיכות Y (5×2), סקוואט קשתים (5×6), + 1 more |

Genuinely different durations, exercise selections, and set/rep schemes — not the same workout
three times. (Difficulty 1's 14min against a 45min request matches this session's already-documented
`flow_regression`/D1 pattern — expected, not new, per Addendum 15's bolt-1 finding; not re-litigated
here.)

### F2 — reported, not touched. Your call.

`resolveEffectiveDifficulty` (`InputSanitizerMiddleware.ts:608-655`) applies 3 sequential overrides,
each with its own stated rationale in the code's own doc comment:

| Override | Condition | Rationale (verbatim from the code) |
|---|---|---|
| First-session guard | No baseline data at all | "the user has no baseline data yet, so we never start them on Intense" |
| Detraining lock | Returning after a 4-7 day gap, requested D3 | "protect them from CNS overshoot" (central-nervous-system overload risk of jumping straight into high intensity after a break) |
| Deload week (W5) | Requested D3 | "Recovery week is incompatible with Intense; **force it down regardless of UI selection**" (the code's own words) |
| Peak week (W4) | Requested D1, no detraining lock | "Peak week is the wrong moment for a low-stimulus workout, so floor it at Normal" |

**Worth separating two different kinds of claim here, since they may deserve different answers under
the new rule:**
- **Safety-motivated** (first-session, detraining-lock, deload): the stated reasoning is physiological
  protection — CNS overshoot, recovery-week incompatibility. These read like genuine "the system
  protects the user from themselves" cases, the kind of exception the meta-rule's own text already
  anticipates ("מותר להוסיף הערה או אזהרה").
- **Optimization-motivated** (peak-week floor): the reasoning is about not "wasting" a
  high-readiness week on a low-stimulus session — a coaching nudge, not a safety concern. Weaker
  case for silently overriding an explicit pick.

Not disabled, not touched — David's call per-case whether explicit choice should override any or
all of these, or whether they should become a warning instead of a silent downgrade.

### Not done this round

The other 12 items from F1-F20 remain untouched, awaiting instruction, as does the rest of Addendum
15's scope (Tasks 2/3 for core, item ז).

**Commit:** local only, no push. Docs only (the code fix itself already committed as `08e12ac4`).

---

## Addendum 18 — push/pull domains-vs-tracks mismatch investigated. The engine reads the correct
## value; the write-path root cause was not fully pinned despite tracing 3 candidate mechanisms.

David's item 2, investigated before any fix, per instruction.

### Which value the engine actually uses — confirmed, and this is the reassuring part

`buildUserProgramLevels` (`level-resolution.utils.ts:119`):
```ts
const effectiveLevel = (trackLevel > 1) ? trackLevel : (domainLevel > 0 ? domainLevel : trackLevel);
```
**Tracks wins whenever `trackLevel > 1`, unconditionally.** On David's own profile, push (`domains=0,
tracks=9`) and pull (`domains=0, tracks=6`) both resolve to their **tracks** value — 9 and 6
respectively, confirmed by the `[LevelSync] Domain 'push' resolved to L8 (Source: Tracks)`-style log
line seen live in Addendum 17's proof run. **The engine has been using the correct, real-assessed
level this whole time for these two profiles' push/pull selection — the stale `domains` value is
never what exercise selection reads.** This directly answers the original worry (wrong-level
exercises from a bad level read) — that specific failure mode is not what's happening here.

### The mismatch itself — real, quantified, one-directional

Queried all 617 user docs / 204 real profiles for `tracks.{domain} > 1` disagreeing with
`domains.{domain}`:

| Domain | Profiles mismatched | % of 204 |
|---|---|---|
| push | 13 | 6.4% |
| pull | 18 | 8.8% |
| legs | 14 | 6.9% |
| core | 10 | 4.9% |
| **Any of the 4** | **25** | **12.3%** |

Every single example checked (`domains.push=0, tracks.push=6/14/20/4...`) is the **same direction**:
`domains` low/zero, `tracks` the real higher value — never the reverse. Spans a wide range of
`activePrograms.startDate` (April through August 2026, not clustered around one date), including one
profile with a level-13 core track and a 0-level core domain from what looks like its very first
assessment (not gradual gameplay drift) — pointing at a systemic write-path gap present across
months, not a single dated incident.

### Root cause — traced 3 candidate mirror mechanisms, all individually look correct; not fully pinned

1. `onboarding-sync.service.ts:1449-1461` — mirrors every `quizTracks` entry into `seededDomains`
   at onboarding-sync time. Introduced in commit `a5490d3a` (**2026-04-23**) — predates every
   mismatched example found, so its absence-before-a-date is not the explanation.
2. `single-domain-assessment.service.ts` (the "add one more domain" top-up flow) — reuses the same
   `onboarding-sync.service.ts` writer, same mirror applies.
3. `progression.service.ts:213-234` (`updateProgressionTracks`, private, 4 call sites, all
   gameplay/goal-driven level-ups) — also mirrors unconditionally, every `programId` in its `tracks`
   argument gets `progression.domains.{id}.currentLevel` written via a dot-path `updateDoc`.

**All 3 read as correct in isolation.** I did not find the actual gap — either a 4th write path
exists that I didn't locate, or one of these 3 has a conditional branch that skips the mirror under
a specific state I didn't reproduce. Checked and ruled out: no Cloud Function (`functions/src/`)
writes to either field. **Not fixed, not further chased — reporting the boundary of what I could
confirm rather than guessing past it, per instruction.**

### Not done this round

No source touched. If this becomes a priority fix later, the next step would be adding temporary
instrumentation to all 3 write sites and reproducing a fresh mismatch live (the way Addendum 15/17's
investigations did for the engine side), rather than continuing to read code in isolation — the
static reads exhausted what's findable that way.

**Commit:** local only, no push. Docs only — read-only Firestore queries, no writes, no temp
scripts left behind.

---

## Addendum 19 — F4 fixed (BOLT_DURATION_CAPS bypassed for explicit choice); D1 still short,
## for a separate, already-documented reason

David's item 1. Fix committed as `b2727151`.

### The fix

`resolveEffectiveBoltTime` gained an `isExplicitChoice` parameter that bypasses
`BOLT_DURATION_CAPS` {30/45/60} entirely when true. The call site passes `options.targetDifficulty
!= null` — already the exact signal distinguishing an explicit single-bolt request (slider, Custom
Builder — both set it) from the automatic 3-option carousel (never sets it). 9 tests, the 2
behavior-changing ones confirmed failing pre-fix via `git stash`.

### Proof — same profile, 45min requested, 3 explicit difficulty picks

| Pick | Before (Addendum 17) | After |
|---|---|---|
| D2 — בינוני | 44 min | **44 min** — unaffected, already correct |
| D3 — עצים | 43-44 min | **44 min** — unaffected, already correct |
| D1 — קל | **14 min** | **23 min** — improved, but still short of 43-45 |

### D1 still doesn't reach 43-45min — not a gap in this fix, a separate known one

Confirmed the 30-min cap is genuinely gone (`resolveEffectiveBoltTime`'s own test suite proves it,
and `mainExerciseCount` for D1 in the live run was 5 — more than D2's 3 or D3's 4, meaning the pool
*was* sized for the full 45min). The shortfall traces to a mechanism this session already
documented and left open: **Addendum 8 — the Time-Volume Feedback Loop is confirmed
one-directional; nothing anywhere in the pipeline adds volume when a workout comes in *under* the
target duration**, only trims when over. D1's exercises are inherently lighter per set
(`regressionFloor`'s downgrade, fewer/shorter sets at the easier tier) — with 5 exercises correctly
selected but each one short, and no upward-correction mechanism to fill the remaining ~20 minutes,
the session lands at 23min regardless of the cap being gone.

**Reported honestly rather than declared fixed** — this fix does exactly what it was scoped to do
(remove the artificial ceiling) and D2/D3 now prove that works. D1 needs a second, different
mechanism (something that adds sets/rest/exercises when under-duration) that doesn't exist yet
anywhere in the pipeline — out of scope for F4 specifically, flagging for a future decision rather
than silently declaring the acceptance criterion ("all three ~43-45min") met when it measurably
isn't for D1.

**Commit:** local only, no push (code already committed as `b2727151`).

---

## Addendum 20 — F2 implemented: safety overrides kept with a note, peak-week override removed

David's decision on Addendum 17's F2 report, implemented as instructed. Code committed as
`5b5310f0`.

### What changed

`resolveEffectiveDifficulty` now returns `{difficulty, overrideNote}`:
- **Kept, now with a note**: first-session guard, detraining-lock (CNS-overshoot protection),
  deload-week incompatibility. Each sets `overrideNote` to a proposed Hebrew string (below) when it
  fires; `undefined` otherwise.
- **Removed entirely**: the peak-week floor (D1→D2). Not a safety concern — the engine
  second-guessing an explicit "easy" pick. An explicit D1 request in a peak week now stays D1,
  confirmed by a dedicated regression test.

`GeneratedWorkout.difficultyOverrideNote?: string` carries the note to the final workout object.

### Proposed copy (David's own wording used verbatim where he supplied it)

| Trigger | Note |
|---|---|
| First session | "זה האימון הראשון שלך — התחלנו בקלות כדי להכיר את הגוף." |
| Detraining lock | "חזרת אחרי הפסקה — התחלנו בעדינות." *(David's own wording, Addendum 17)* |
| Deload week | "השבוע שבוע התאוששות — הורדנו עצימות כדי לאפשר להתאושש כמו שצריך." |

Open for adjustment — proposed, not final.

### Tests

7 tests (`resolve-effective-difficulty.test.ts`), all confirmed failing on pre-fix code via
`git stash` (the return shape itself changed from a bare number to `{difficulty, overrideNote}`, so
every assertion fails pre-fix) and passing after restore. Full workout-engine suite: 548/548 real
assertions pass (same 2 pre-existing unrelated hybrid `process.exit()` failures as every commit this
session).

### Not done — UI wiring

`difficultyOverrideNote` is fully plumbed on the backend but **not yet displayed anywhere**. The
real `WorkoutPreviewDrawer` reachable from `UserWorkoutAdjuster`'s `onApplyAndStart` resolves (via a
re-export shim) to a multi-file component tree
(`src/features/workouts/components/workout-preview-drawer/`) I have not worked in before and cannot
visually verify in this environment. Per this repo's own pixel-by-pixel UI-safety rule, I stopped at
the data layer rather than guess-placing a banner in an unfamiliar drawer. Needs either a quick
pointer to the right spot, or a visual pass together once David can check it renders correctly.

**Commit:** local only, no push (code already committed as `5b5310f0`).

---

## Addendum 21 — Item 3: is `progression.domains` shown anywhere? Short answer, as requested.

Searched every `.tsx` file referencing `progression.domains` (`grep`, 8 files). Only two are
outside `admin/`:
- `DashboardTab.tsx:57` — `console.log` only, never rendered.
- `StrengthVolumeWidget.tsx:98` — existence check (`!profile?.progression?.domains`), a boolean,
  never displays a level number.

**No non-admin screen displays a `domains.{x}.currentLevel` value anywhere.**

Bonus finding relevant to your question: `admin/users/all/page.tsx` **already has** an
`autoSyncDomainsFromTracks` function (`:182-221`) that runs automatically every time an admin opens
a user's detail view — it detects exactly this mismatch (`domainLevel < trackLevel`) and writes the
corrected value to **both** `domains` and `tracks` on the spot. The admin list view's own level
column also already takes `Math.max(tracks, domains, globalLevel)` (`:3016-3027`), so it's correct
regardless. **Net effect: nobody — user or admin — ever actually sees the stale number.** Closed as
documented, not touched, per instruction.

---

## Addendum 22 — Item 2: mapping + options for where to display `difficultyOverrideNote`. No UI
## changed.

### (א) Existing user-facing explanation text — full list

| Field | Set at | Rendered at |
|---|---|---|
| `logicCue` | `home-workout.service.ts:1072-1076` (from Firestore metadata, or `computeLevelAwareLogicCue` as fallback) | `GeneratedWorkoutExerciseList.tsx:163,267-272` — `displayText = logicCue \|\| description`, shown as a paragraph right under the title/difficulty/duration pill row |
| `aiCue` | `home-workout.service.ts:943-944,1053` | Referenced in `WorkoutPreviewClient.tsx`, `RunBriefingDrawer.tsx`, `PlannedRun/WorkoutPreviewScreen.tsx` (running-player equivalents) — not the same screen as the strength preview drawer |
| `title` / `description` | Firestore-resolved metadata | Standard header fields, same drawer |

### (ב) 3 options for `difficultyOverrideNote`, with tradeoffs

**Option 1 — fold into `logicCue`** (e.g. `workout.logicCue = overrideNote + ' ' + computedLogicCue`
at `home-workout.service.ts:1072-1076`, right where `logicCue` is already assigned, since
`workout.difficultyOverrideNote` is set earlier in `WorkoutGenerator.ts` and available on the same
object by then).
- **Pro:** Zero new UI code — reuses the exact skeleton at `GeneratedWorkoutExerciseList.tsx:
  267-272` that's already proven to render safely. Tonally close to David's own proposed wording
  (conversational, coach-voice) — fits `logicCue`'s existing character.
- **Con:** Mixes two different kinds of message (routine coaching color vs. a specific "we changed
  something you picked" explanation) into one paragraph — less visually distinct as an important
  notice, and if a real `logicCue` also exists that day, one has to be dropped or awkwardly
  concatenated.

**Option 2 — a new small banner near the Difficulty/Duration pills**
(`GeneratedWorkoutExerciseList.tsx:170-204`, the header row where `DifficultyBolts` + the duration
pill already render).
- **Pro:** Most semantically correct placement — directly next to the difficulty indicator it
  explains, high visibility, a user looking at "⚡ קל" sees why right there.
- **Con:** New UI element — needs to fit responsively alongside the existing share/heart/download
  icon row on the other side of the same flex row; real layout risk on narrow screens without a
  visual check, which is exactly the axiom-flagged risk from Addendum 20.

**Option 3 — a one-time toast/snackbar when the drawer opens**
(would need new wiring, likely triggered from `UserWorkoutAdjuster.tsx`'s `onApplyAndStart` or its
parent).
- **Pro:** Doesn't touch the drawer's existing static layout at all — lowest layout risk.
- **Con:** Transient — easy to miss if the user isn't looking right when it fires; needs an
  entirely new toast-triggering mechanism (none of the 3 relevant components currently show one for
  anything workout-related), more net-new code than either option above.

### (ג) Is there an existing "skeleton" ready for this text?

**Yes — Option 1's skeleton.** `{displayText && (<p>...</p>)}` at `GeneratedWorkoutExerciseList.tsx:
267-272` already conditionally renders whatever text ends up in `logicCue` (or falls back to
`description`) with zero additional markup needed. It is a real, already-proven, general-purpose
"coach explanation" slot — not purpose-built for override notes specifically, which is Option 1's
one real drawback (mixing concerns) against its otherwise-lowest-risk profile.

No UI changed this pass, per instruction. Awaiting your choice of option (or a different one).

---

## Addendum 23 — Item 1: what "קל" actually does today, in real numbers. Nothing implemented.

Real trace, D1 vs D2, same profile (level 10, all 4 domains), same 45min request, home. (No fixed
seed exists in this codebase — see `build-snapshot.ts`'s own header comment — so these are one real
run each, not an average; the qualitative pattern is what matters, not the exact minute count.)

### (א) Breakdown, by category, with real per-exercise data

| | D1 (קל) | D2 (בינוני) |
|---|---|---|
| Exercise count | 7 | 7 |
| Avg `levelDelta` (resolved level − user's actual level) | **−4.14** | −0.33 |
| Avg sets/exercise | 2.00 | 2.29 (D2 sample includes some tabata-adjacent 1-set entries — noisy) |
| Avg `restSeconds` | 81s | 59s |
| `estimatedDuration` | 34min | 43min |

**Levels ARE the dominant, already-correctly-prioritized factor** — D1's exercises sit 2-6 levels
below the user's actual level (avg −4.14), confirmed real, not estimated: `applyFlowRegression`'s
regression search (`regressionFloor` + the level-delta swap loop, `trio-modifiers.service.ts:
499-580`) is doing exactly what you want as priority #1. **Exercise count is not being cut either**
— D1 selected the same 7 exercises as D2 in this run.

**What IS working against you: rest goes the WRONG direction, and sets get diluted by an
already-known, separate mechanism.**

- **Rest is tier-driven, and tier is a direct function of `levelDelta`** — `TIER_TABLE`
  (`workout-generator.types.ts:51-57`, the "Rest Staircase"): `flow` (Δ≤−3) gets **60-90s** rest,
  `easy` (Δ−1/−2) gets **90-120s**, `match` (Δ=0) gets **120-150s**. The design's own comment says
  it plainly: *"flow: active recovery pace, **minimal** rest."* **This is backwards from what you
  asked for** — the lower the difficulty, the LESS rest the current architecture assigns, not more.
  Rest is not an independent dial today; it's baked into the same shared tier system every
  difficulty and every exercise everywhere in the pipeline uses.
- **Sets: `TIER_TABLE`'s own baseline for flow/easy is 3** (`sets: {min:3,max:3}`) — not 2. The
  observed 2.00 average is **below the tier's own floor**, meaning something downstream trims
  further. The math lines up with **`dailySetBudget`** (Addendum 14's already-documented,
  duration-blind weekly ceiling): a fixed total-sets budget, divided across however many exercises
  got selected. D1 selecting exercises that are individually faster (flow tier = less per-exercise
  time) doesn't increase the budget, so the same total gets spread thinner. This is the *same*
  mechanism Addendum 14 already flagged for the cluster-cap question — not a new bug, a second
  symptom of the same one.

### (ב) What would need to change to shift the source of "easy" toward levels, away from quantity

Levels are *already* the dominant lever (see above) — the accurate framing isn't "shift toward
levels", it's **"stop volume from being cut on top of the level-based easing."** Two separate
changes, different risk profiles:
1. **Rest:** `TIER_TABLE`'s rest values are shared/global — used by every tier resolution anywhere
   in the pipeline, not just D1. Changing flow/easy's rest range directly would ripple to any
   exercise that resolves to those tiers regardless of difficulty (e.g. a D2/D3 session that happens
   to pick a low-relative-level exercise). A D1-*specific* rest boost (applied after tier
   resolution, only when `difficulty===1`) would be narrower and safer than editing the shared
   table, but is a new, not-yet-existing mechanism.
2. **Sets:** needs `dailySetBudget` to stop being duration-blind — the exact same open item Addendum
   14 already surfaced and explicitly did not chase further pending your call.

### (ג) Rest math — is the fix "4-5 minutes between sets"? No.

Closing the observed 11-minute gap (34→45min) via rest alone, spread across this run's 14 total
sets: **+47s per set** (81s→~128s, ~2.1min) — not close to the 4-5 minute danger zone you flagged.
If leaned on as the *only* lever (not fixing the sets-dilution too), the ask would be larger but
still nowhere near multi-minute rests — the math doesn't force an ugly answer either way.

### (ד) Content availability at levels 8-12 — not a bottleneck

Counted real Firestore content (372 total exercises) by `movementGroup`→domain, flow-tier
(`levelDelta≤−3`) candidates specifically:

| Domain | L8 user | L10 user | L12 user |
|---|---|---|---|
| push | 19 | 28 | 33 |
| pull | 17 | 23 | 27 |
| legs | 34 | 53 | 65 |
| core | 21 | 28 | 35 |

**17-65 real candidates per domain at every level checked — plenty of content.** Not a content gap;
whatever gets built doesn't need new exercises first.

### Not implemented — stopping here, per instruction

Nothing changed. Waiting for your decision on: whether to touch the shared `TIER_TABLE` rest values
vs. build a D1-specific rest adjustment, and whether/how to address `dailySetBudget`'s duration-
blindness now (tying back to Addendum 14's still-open question) or keep it parked.

**Commit:** local only, no push. Docs only — no source touched this entire turn (Items 1-3 were all
report-only).

---

## Addendum 24 — "אימון קל" redefined (00-PLAN.md §17), and where the 5 questions land in real code.
## Report only — awaiting approval before implementation.

David's research corrected this session's own earlier framing: `TIER_TABLE`'s 60-90s rest for
flow-tier work is **physiologically correct**, not a bug — 45-90s is right for volume/conditioning
work, and the earlier addenda's "rest goes backwards" framing is retracted. The real definition —
same volume, lower intensity via level + rep/time ratio + reps-in-reserve, never fewer sets, never
inflated rest — is now written as a standing rule at `00-PLAN.md` §17.

### Question 1 — sets drop to 2 despite a 3-set floor: found the exact line

Sets do **not** come from `TIER_TABLE` at all — `workout-budgeting.utils.ts:599-604` pulls sets
from a *separate* table, `DIFFICULTY_VOLUME[difficulty]` (`:86-94`), where `DIFFICULTY_VOLUME[1] =
{sets: {min:3, max:3}, ...}` — **3 is already the correct D1 baseline**, exactly matching the new
rule.

The cut happens after that, at `calculateVolumeAdjustment` (`:249-262`):
```ts
if (difficulty === 1) {
  adjustedSets = Math.max(2, baseSets - 1);
  reductionPercent = ((baseSets - adjustedSets) / baseSets) * 100;
}
```
This is a **dedicated, standalone "D1 = one fewer set" rule**, independent of and redundant with
`DIFFICULTY_VOLUME[1]`'s already-correct 3. For a typical level-8-12 user, `getBaseSets()` (`:52-56`)
returns 3, so `reductionPercent` computes to **33.3%**. That percentage then gets applied
*multiplicatively* back onto the already-correct 3, inside `assignVolume` (`:636-638`):
```ts
if (volumeAdjustment.reductionPercent > 0) {
  sets = Math.max(2, Math.round(sets * (1 - volumeAdjustment.reductionPercent / 100)));
}
```
`3 × (1 − 0.333) = 2.0 → round → 2`. **Two separate reductions stacking on the same idea** — one
computes "D1 should have fewer sets" as a percentage, the other applies that percentage to a value
that was already D1-appropriate.

**How much this alone closes:** 7 exercises × 2 sets = 14 sets → 7 × 3 = 21 sets, a 50% volume
increase. Duration scales with total sets roughly linearly for the main block (not perfectly — fixed
warmup/cooldown overhead doesn't scale) — applying that ratio to the two real D1 runs measured so
far: 23min → ~30-32min, or the cleaner 34min run → ~46-48min. **This single fix likely closes most
or all of the remaining gap on its own** — real verification only after implementation, per your
own instruction (the 5-6 sample workouts below).

### Question 2 — the −4.14 average is two mechanisms stacking, not one

**Two separate, uncoordinated mechanisms both push toward lower levels, applied one after another:**

1. **Step 3 pool filter** (`domain-mapping.constants.ts:106-129`) — `BOLT1_WINDOW_LOWER_OFFSET=-3`,
   `BOLT1_WINDOW_UPPER_OFFSET=-1`: for bolt 1, the *candidate pool itself* is restricted to
   `referenceLevel-3` .. `referenceLevel-1` before any exercise is even selected.
2. **`applyFlowRegression`'s own swap search** (`trio-modifiers.service.ts:508`,
   `for (let delta = 1; delta <= 3; delta++)`) — runs *afterward*, searching a **further** 1-3
   levels below whatever Step 3 already selected (`exLevel` is read from the *already-regressed*
   exercise, not the user's real level).

Both loops apply to **every exercise in `main` uniformly** — `for (const ex of main)` at
`:499`, no branch anywhere on exercise priority/role. There is currently **no way to tell a
"primary" exercise from a "supplementary" one** at this stage — that classification (`priority`:
compound/isolation/accessory, set by `classifyPriority` upstream) exists on the object but neither
mechanism reads it.

**What separating them requires:** thread `exercise.priority` (or an explicit main/supplementary
flag decided at Step 3) into both loops, and give each a *different* delta range —
e.g. window `[-2,-1]` + search `delta∈{1,2}` for primary, vs. window `[-4,-3]` + search
`delta∈{1,2,3,4}` for supplementary — instead of the single shared `[-3,-1]` window and `1..3`
search both use today. This is a real code change in 2 files, not a config tweak.

### Question 3 — reps today, and the existing (but D1-excluded) scaling rule

**Bilateral exercises** (the majority): reps come from `getStaircaseRange` (`workout-budgeting.
utils.ts:165-184`) — a **coarse 2-bucket lookup**, not continuous: `flow` (any delta ≤ −3) → 10-12
reps, `easy` (delta −1/−2) → 6-8 reps. A delta of −3 and a delta of −8 get the *identical* range —
no scaling within a bucket.

**Unilateral push/pull/legs exercises**: a real, already-built "more reps the further below level"
rule exists — Rule B, `:688-695` — **but it's explicitly excluded for D1**:
```ts
} else if (levelDiff >= 2 && difficulty !== 1) {
  // Rule B — Moderate Intensity: exercise is ≥2 levels below user.
  // Skipped for bolt 1 (Easy) — the lower exercise level is an intentional
  // difficulty selection, not a gap to compensate for with extra reps.
```
That comment is the *exact opposite* of the new rule. This is the closest existing building block —
extending it to bilateral exercises and removing its `difficulty !== 1` exclusion is the natural
path, but it needs to become a genuinely **continuous ratio of the actual delta**, not a bigger
fixed bucket, to satisfy "no hard upper cap" (AMRAP compatibility) — the current Rule B is itself
still a small fixed `{min,max}` range, just a different one than the default; a real fix computes
reps as a function of delta rather than picking from a lookup table indexed by tier name.

### Question 4 — exercise count: nothing structural is limiting it today

`getExerciseCountForDuration` (`workout-budgeting.utils.ts:36-42`, `DURATION_SCALING['45']`) targets
**6-8 exercises for a 45min request — the same range for every difficulty**, no D1-specific
narrowing found anywhere. The 7 observed in the real trace is already inside this range (random
pick: `min + Math.floor(Math.random()*(max-min+1))`). Content is not a constraint either (Addendum
23's count: 17-65 low-level candidates per domain at levels 8-12). **No code change is structurally
required to reach 7-8** — it's already the target; whether it's reliably *achieved* for a 1-2-domain
user specifically is exactly what the post-approval 5-6 sample workouts (including your requested
2-domain example) will show empirically rather than by further static reading.

### Question 5 — filler exercises are already domain-gated, confirmed at the exact lines

Whatever mechanism ends up adding exercises to fill time draws from the same domain-quota selection
system already audited extensively this session — gated by the `has()`-guarded absent=absent rule:
`selectExercisesWithDomainQuotas` (`workout-selection.utils.ts:624-629`,
`if (!userLevelsMap.has(domain)) continue`) and the equivalent guards in `GuaranteePassRunner.ts`
(`:182,388,533`). A domain the user has no level in is **structurally excluded from candidacy** —
confirmed real in Addendum 13's production trace (a Path-B push+pull-only user's workouts never
contained core, precisely because of this same guard). Any exercise-count increase that routes
through this existing selection path inherits this guarantee automatically — it does not need to be
re-implemented, only relied upon by whatever adds the 1-2 extra exercises.

### Not implemented — stopping here for approval, per instruction

Nothing changed in source this pass beyond the `00-PLAN.md` §17 rule itself (documentation, not
code). Waiting for your go-ahead on: (1) removing/adjusting `calculateVolumeAdjustment`'s D1 sets
rule, (2) separating primary vs. supplementary delta ranges across the 2 stacking level-selection
mechanisms, (3) extending Rule B–style delta-proportional reps to bilateral exercises and removing
its D1 exclusion, (4) whatever's needed to reliably land at 7-8 exercises.

**Commit:** local only, no push. Docs only (`00-PLAN.md` §17 + this addendum) — no engine code
touched.

---

## Addendum 25 — Stage 1 fixed (removed the redundant D1 sets reduction), measured on 6 real
## workouts. One new, real bug found by exactly the 2-domain test David asked for.

Fix committed as `c7c64842`. Removed `calculateVolumeAdjustment`'s standalone `difficulty===1 →
baseSets-1` block (`workout-budgeting.utils.ts`) — confirmed before touching it that this block
served *only* D1; inactivity/weekly-budget/periodization/`volumeReductionOverride` are separate,
independently-returning branches in the same function, confirmed unaffected by 4 dedicated
regression tests. `DIFFICULTY_VOLUME[1].sets` (`{min:3,max:3}`) is now the single source of truth
for D1's set count.

### 6 real workouts, full detail, as requested — read as a coach, not averages

**D1, L10, all 4 domains registered — estimatedDuration=45min, 24 sets, 8 exercises:**

| Exercise | Domain | Ex. level | User level | Sets | Reps/Hold | Rest |
|---|---|---|---|---|---|---|
| מתח אקצנטרי | pull | 8 | 10 | 2 | 8 | 90s |
| שכיבות סמיכה יהלום | push | 8 | 10 | 3 | 8 | 105s |
| עמידת פייק | push | 7 | 10 | 2 | 15s | 67s |
| שכיבות סמיכה מרפקים צמודים | push | 7 | 10 | 2 | 10 | 66s |
| שכיבות סמיכה | push | 5 | 10 | 3 | 11 | 80s |
| שכיבות סמיכה בפישוק | push | 5 | 10 | 3 | 11 | 82s |
| שכיבות סמיכה ברכיים | push | 4 | 10 | 3 | 10 | 87s |
| החזקת הולו באדי | core | 6 | 10 | 2 | 28s | 84s |

**Hit the 45min target exactly.** Sets are 2-3 (not the old uniform 2) — Stage 1 alone is doing
what it was supposed to. Separate, pre-existing observation (not a Stage-1 regression, not chased
this pass): 6 of 8 exercises are push, 0 legs, 1 pull, 1 core — a domain-balance issue that already
existed before this fix and is outside Stage 1's scope.

**D1, L12, all 4 domains — estimatedDuration=43min, 23 sets, 6 exercises:** all sets are 3. Within
the 43-46 target band.

**D2 (L10=40min/17sets/3ex, L12=45min/17sets/4ex) and D3 (L10=44min/18sets/4ex)** — controls,
unaffected by this change as expected, all close to target (already true before Stage 1, per
Addendum 19).

### D1, L8, PUSH+PULL ONLY (2 programs) — short AND a real bug, found by exactly this test

```
estimatedDuration=18min totalPlannedSets=10 exerciseCount=3
  - שכיבות סמיכה [push]: L5, user L8 | 2 sets x 11 | rest=77s
  - שכיבות סמיכה בפישוק [push]: L5, user L8 | 3 sets x 12 | rest=89s
  - ישיבת L בתמיכת הרגליים [core]: L3, user core=(NOT REGISTERED) | 1 sets x 15s | rest=223s
```

**Two problems, not one:**
1. **Short** — 18min against 45 requested, only 3 exercises (target 6-8).
2. **A core exercise was selected for a user with no core program at all** — exactly the leak
   Question 5 was supposed to rule out. Traced it: this did **not** come through the domain-quota
   selection system (still correctly gated, per Addendum 24's Question 5 answer) — it came through
   `applyEssentialGearFilter`'s `MIN_EXERCISES=3` backfill (`trio-modifiers.service.ts:704`,
   reachable only from D1 via `applyFlowRegression`), which is **domain-blind by construction**:
   `allExercises.filter(ex => !usedIds.has(ex.id) && isRawExNaked(ex) && ...)` — no domain check
   anywhere in that filter. When the thin, push+pull-only pool for this profile came up short of 3
   naked exercises, this backfill reached into the *entire* catalog, including core, to hit the
   floor.

**This is a real, newly-found bug, caught by exactly the 2-domain test you asked for — a full-4-
domain sample would never have surfaced it.** It's a correctness issue (Question 5's guarantee has
a real gap, just not where the earlier static-code audit looked), not something Stage 2's rest/reps
work would touch. Flagging for your decision — not fixed this pass, since it's outside the scope
you approved for Stage 1.

### Verdict against your 3 buckets

| Case | Result | Bucket |
|---|---|---|
| D1, 4 domains, L10/L12 | 45min / 43min | **43-46 — done, no further duration work needed for this case** |
| D1, 2 domains only | 18min + domain leak | **Short, but for a reason Stage 2 doesn't address** — a different, real bug |

**Recommendation, not a decision:** Stage 1 appears to have closed the duration gap for the common
(4-domain) case on its own, consistent with the estimate. Whether to proceed to Stage 2 (priority-
based level separation + reps scaling) is your call regardless — but the 2-domain leak is a
separate, likely higher-priority item than Stage 2's polish, since it's a real data-correctness bug
freshly found, not a UX refinement.

**Commit:** local only, no push. Verification only — no additional source changed beyond the
already-committed `c7c64842`.

## Addendum 26 — א1+א2 fixed: systemic domain gate (not another point patch) + rest rounded to 15s.
## The 223s number itself turned out to be a test-fixture artifact, not the bug it looked like —
## traced all the way down before writing a line of fix code, per the no-guessing rule.

### א1 — the domain-blind backfill, fixed systemically, plus the full "how many more are there" audit

Two immediate sites (`applyEssentialGearFilter`'s `MIN_EXERCISES` backfill and its "final
validation" violation-replacement, both in `trio-modifiers.service.ts`) now gate through a new
shared `isDomainRegistered(exercise, userProgramLevels)` (`GuaranteePassRunner.ts`, same file/
pattern as the earlier `computeDomainCounts`/`isSafeDomainVictim` fix) — fails **open** only when
no domain context at all is available (matches every existing test call site), fails **closed**
(real `.has(domain)` check) whenever real data is passed, which is every production call site.

That alone did not close the leak David's 2-domain test kept reproducing. Traced further and found
the actual dominant source: `workout-selection.utils.ts`'s `takeFromPool` (the generic backfill
that fills every remaining main-workout slot after the per-domain dedicated picks) ranked the
**whole catalog** by score with **no domain check at all** — documented in-line as intentional
("never domain-restricted for ANY domain by design") and covered by one test
(`core-slot-gate.test.ts` Tier 3) that only exercises the "pool has *nothing* else" edge case. In
practice a higher-scoring off-domain exercise could — and did — crowd out real, plentiful on-domain
candidates sitting lower in the same score-sorted pool, which is exactly David's report: "יש עשרות
תרגילי דחיפה ומשיכה בקטלוג" (dozens of push/pull exercises exist) yet an off-domain one got picked.

**Fix:** `takeFromPool` now additionally requires `matchesRequiredDomain` (exercise matches one of
`context.requiredDomains`). The narrower, genuinely-intentional last resort — nothing at all
matches any required domain — is **untouched**, still lives in the separate "final any fallback"
block right after `takeFromPool`, and is still exactly what Tier 3's test covers (still passes,
unmodified). Updated `matchesDomainForSlot`'s doc comment to record this — old note said the
residual was "by design" full stop; new note says which part of that is still true and which part
just got closed, so nobody reverts the gate in 6 months without reading why.

New regression test (`core-slot-gate.test.ts`, Tier 4): 5 real push candidates + 1 off-domain core
exercise scored 100× higher — asserts the off-domain one is **never** selected across 25 repeated
calls (the pool's shuffle is `Date.now()`-seeded, so a single call can pass "by luck" pre-fix; 25
reps closes that gap). Confirmed fails on pre-fix code, passes on fixed code, via `git stash`.

**The full "כמה עוד יש" audit** (a background agent traced every exercise-injection path in
`src/features/workout-engine/`, independent of the fix above): **13 sites** cataloged with
reachability + severity. Three more **High**-severity sites live in the same function family as the
one just fixed (`workout-selection.utils.ts`'s final "any" fallback when `strictDomains` isn't set,
and `selectExercisesWithDominance`'s accessory-pool + tail-fill, which pre-empts domain quotas
entirely for the skill/dominance-split user segment) — **not fixed this pass**, flagged for a
decision on priority. One **High-Medium** site (`tabata.block.ts`'s pool-injected finisher, sourced
from the raw catalog with zero domain check, and it uses the *global* scale-G level rather than a
domain level — the cross-scale sibling bug). Several **Medium** sites (`generateRecoveryWorkout` —
with an **in-repo documented real leak**, knee push-ups reaching a legs-only user; the hybrid
sandwich/budget-split bolt, which has no domain filtering at all; pyramid's coarse-MG fallback,
sharpest in the `human_flag → core` case). The rest are Low or ambiguous (role-scoped
cooldown/warmup pools where the fix depends on live catalog contents this pass couldn't verify from
code alone). Full file:line table with reachability/severity in the agent's report — ask if you
want the raw output rather than this summary. **Recommendation, not a decision:** the 3 remaining
High-severity `workout-selection.utils.ts`/`selectExercisesWithDominance` sites are the same
function family as the fix just shipped and are the next highest-value targets if you want to keep
closing this bug class; everything else is a narrower side-pool.

### א2 — rest rounded to 15s at the display stage (done); the 223s number itself (investigated, not a fix)

**Rounding:** new `roundRestSeconds`/`roundRestSecondsForDisplay`
(`core/presentation/PresentationFormatter.ts`, same file/pattern as the existing
`clampStaticSkillHold` presentation-layer mutation) snaps every exercise's displayed `restSeconds`
to the nearest 15s, called once at the very end of the per-bolt pipeline in `home-workout.service.ts`
right after `annotateRepRanges` — after every rest-affecting mutation has settled. The underlying
random draw across each tier's full `[min,max]` window is untouched (still gets its intended
spread); only the number actually rendered/used as the countdown target is snapped. Verified on 6
fresh real workouts (see below): every single rest value is now a clean multiple of 15 — 60, 75,
90, 105, 120, 135, 150, 180, 225. New regression test (`round-rest-seconds.test.ts`), fail-before/
pass-after verified via `git stash`.

**The 223s number specifically — traced to its exact origin, and it is not what it looked like.**
Root-caused with a live diagnostic trace (reasoning-array inspection), not by guessing from static
code: the exercise carrying the outlier rest is a **real, correctly-gated** core exercise —
`isDomainRegistered`/`takeFromPool`'s fix does not touch it, because by the time it's selected the
user genuinely **has** a `core` entry in `userProgramLevels`. The entry is `core → L1`. That L1
comes from `buildMockProfile` (`shared/utils/mock-profile.utils.ts:76,105`), the test/simulator
utility used to build this exact "push+pull-only" scenario — it unconditionally fabricates a `core`
(and `legs`) domain entry (`Math.max(1, effectiveLevel - 7)`) even when the caller's `domainLevels`
only specifies `push`/`pull`. So the "push+pull-only user" this whole investigation was testing was
never actually push+pull-only from the engine's point of view — it was (correctly!) treated as a
real, if extremely low (L1), core-registered user, offered a core exercise around L3-L7, and the
resulting `delta=+5..+6` → elite tier → 180-240s rest is **arithmetically correct** given that input
— the engine did not misbehave; the test fixture handed it a fact ("this user has assessed core at
L1") that wasn't the intended scenario.

**A related, real, separate finding surfaced by chasing this down** — NOT fixed, flagging for a
decision: `src/features/user/progression/services/progression.service.ts` lines ~1420/1423 and
~1460/1463 (the evolution/split-template transition — e.g. a user switching from a master/full_body
program to an upper_lower or push_pull_legs split) write `core: { currentLevel: snap.core ?? 1,
percent: 0 }` (and the same `?? 1` pattern for `legs`/`push`/`pull`) into `progression.tracks` when
the pre-transition snapshot has no value for that domain. This is the exact same "invent L1 instead
of leaving it absent" pattern the "absent=absent" (⑨) convention was written to close elsewhere in
this codebase (`buildUserProgramLevels`, `contextual-engine.types.ts`'s `UNASSESSED_DOMAIN_LEVEL`)
— worth checking whether it can leave a **real user** who never trained core with a phantom L1
core registration after a split-template switch. Not investigated further this pass (new scope,
found as a side-effect of chasing the 223s report, not part of the original ask) — your call on
whether to open this as its own item.

**Net effect on the workout that started this whole investigation** (D1, L8, push+pull only) —
re-run after both fixes: **37min / 6 exercises** (was 18min / 3 exercises in Addendum 25). More
real push/pull content is now surfacing precisely because `takeFromPool` no longer lets a
higher-scoring off-domain pick crowd it out — this is very likely also most of the answer to א3
("why did normal selection only bring 2"), though א3 is still owed a proper investigate-and-report
pass per your instructions, not claimed as closed here.

### 6 fresh real workouts, full detail, post-fix — same 6 scenarios as Addendum 25 for direct comparison

**D1, L10, all 4 domains — 42min, 21 sets, 6 exercises:**

| Exercise | Domain | Ex. level | Sets | Reps/Hold | Rest |
|---|---|---|---|---|---|
| מתח אקצנטרי | vertical_pull | 8 | 3 | 8 | 105s |
| שכיבות סמיכה | horizontal_push | 5 | 2 | 12 | 75s |
| שכיבות סמיכה בפישוק | horizontal_push | 5 | 3 | 10 | 90s |
| שכיבות סמיכה ברכיים | horizontal_push | 4 | 3 | 11 | 75s |
| שרימפ סקוואט בלי ידיים | squat | 8 | 3 | 8 | 105s |
| תלייה מספרים | core | 10 | 3 | 21s | 150s |

**D1, L8, PUSH+PULL ONLY (2 programs) — 37min, 19 sets, 6 exercises** (was 18min/3ex in Addendum 25):

| Exercise | Domain | Ex. level | Sets | Reps/Hold | Rest |
|---|---|---|---|---|---|
| שכיבות סמיכה מרפקים צמודים | horizontal_push | 7 | 3 | 8 | 105s |
| שכיבות סמיכה בפישוק | horizontal_push | 5 | 2 | 10 | 90s |
| חתירות ב-15° | horizontal_pull | 5 | 3 | 12 | 75s |
| שכיבות סמיכה ברכיים | horizontal_push | 4 | 3 | 10 | 75s |
| החזקת שכיבת סמיכה ב-90° במרפק | horizontal_push | 3 | 3 | 24s | 75s |
| ישיבת L בתמיכת הרגליים | core | 3 | 1 | 15s | 225s |

The core exercise here is the mock-profile artifact explained above (real `core=L1` registration in
this test's data, not a leak) — 225s is a correctly-rounded elite-tier value given that input, not
a new bug. Still short of 45min and still only 1 set on the core pick — both squarely א3 territory.

**D1, L12, all 4 domains — 44min, 25 sets, 7 exercises:** sets 2-3, one core pick came out as the
`follow_along`/tabata-ladder form ("טבטה +") instead of a single exercise — ד2 territory, not
chased here.

**D2, L10, all 4 domains — 45min, 20 sets, 4 exercises:** sets up to 4, rest 120-135s (match/hard
tier), no core (thin pool at this level/domain combo — not investigated further, out of scope).

**D2, L12, all 4 domains — 40min, 17 sets, 3 exercises:** sets 4-5, rest 60-180s, no core again.

**D3, L10, all 4 domains — 44min, 17 sets, 3 exercises:** pull/push/legs, sets 3-5, rest 120-150s,
no core this run — D2/D3 controls, consistent with pre-fix behavior (neither fix targets D2/D3).

**Commit:** local only, no push.

## Addendum 27 — the duplicate-exercise bug: found and fixed, live-traced start to finish, not guessed
## at any point. David's hunch (follow_along-related) was half right — it's downstream of Step 6c,
## not inside it.

David's report: the same exercise, same id, byte-identical reasoning, twice in one workout — 100%
reproducible on D1/L12 full-body from the Addendum 26 re-run. His hypothesis was that Step 6c's
`follow_along` core form ("form C replaces the slot, and something injects it again") was the cause.

**Traced it with a bisecting instrumentation pass** (temporary `console.error` checkpoints at 6
points along the per-bolt pipeline: after `runAllGuarantees`, entry/exit of
`applyEssentialGearFilter`, before/after `validatePromisesPostCut`, after `sortAndPair`), re-run
repeatedly until a reproduction landed, then read the array state at each checkpoint:

- The follow-along exercise IS involved (confirmed `[CoreBlock] form=follow_along` on one repro),
  but it enters the array as a single, correctly-swapped item and **stays single** through
  `applyEssentialGearFilter`, `validatePromisesPostCut`, and every other earlier stage — confirmed
  present exactly once at every checkpoint up to and including "after validatePromisesPostCut".
- The duplicate appears **only** between "after validatePromisesPostCut" and "after sortAndPair" —
  i.e. inside `sortAndPair` itself. `applyDomainPrioritySort` (a pure `.map().sort()`, structurally
  incapable of changing array length) was ruled out by reading it. That leaves
  `applyAntagonistPairing` (`workout-sorting.utils.ts`).
- Added one more checkpoint inside `applyAntagonistPairing` itself (bucket sizes + the
  `pushPullPairs`/`fallbackPairs` contents right before the final result assembly) and caught it:
  `push=2 pull=1 legs=1 other=1 pairCount=1 unparedPush=1` → `pushPullPairs` already contained the
  `other` item (`WLP7RzGley7svZbbIzAW`), and the final assembly line spread `...other` again on top
  of it.

**Root cause**, precisely: when at least one real push↔pull pair forms (`pairCount > 0`) but a
leftover unpaired exercise *and* a non-empty `other` (core/isolation) bucket both still exist, the
"route remaining exercises so they're never silently dropped" fallback (lines ~469-488, pre-fix)
merged `other` into the `remaining` array pushed into `pushPullPairs`. The function's own final
result assembly (`singleDomain ? [...fallbackPairs...] : [...pushPullPairs, ...other, ...]`) then
unconditionally re-spreads `...other` in the non-`singleDomain` branch — the exact branch this case
takes, since `singleDomain` is forced `null` whenever `pairCount > 0` regardless of leftovers. Every
item in `other` rendered twice. Not a selection bug (two independent picks landing on the same
exercise by coincidence) — literal double-inclusion of the same array reference, which is why the
two printed copies were byte-identical (same jitter roll, same everything).

Confirmed this is unrelated to the `takeFromPool`/`isDomainRegistered` fixes from Addendum 26 — this
bug lives entirely downstream, in the antagonist-pairing/sort stage, after selection is long done.

**Fix:** split the "route remaining, never drop" fallback into its two real cases instead of one
`if/else` that shared a `remaining` array across both. The `singleDomain` branch (real "nothing
paired at all" case) still includes `other` — that's its only inclusion point. The non-`singleDomain`
branch (this bug's case) now pushes only `unparedPull`/`unparedPush` into `pushPullPairs`, relying on
the unconditional `...other` spread in the final assembly as `other`'s single source of inclusion.

New regression test (`antagonist-pairing-no-dup.test.ts`) constructs the exact bucket shape that
reproduces it (1 pair + 1 leftover push + 1 core) directly against `applyAntagonistPairing`, no live
DB/network dependency — fails on pre-fix code (both copies present, confirmed via `git stash`),
passes on fixed code. A second test checks the fix doesn't silently drop anything across a larger
multi-domain mix (8 exercises in, 8 unique out).

**Verified against the original repro:** 15/15 clean runs of the exact D1/L12/all-4-domains scenario
via a live trace script, zero duplicates (was reproducing on roughly 1 in 3-5 runs pre-fix).

**Commit:** local only, no push.

## Addendum 28 — ה1 fixed in parallel (David's explicit "do this regardless of §1's outcome"):
## applyFlowRegression's swap search now matches by movementGroup, not primaryMuscle alone.

`applyFlowRegression`'s regression-swap search (`trio-modifiers.service.ts`) matched replacement
candidates by `raw.primaryMuscle !== ex.exercise.primaryMuscle` — no movementGroup/domain check at
all. Live-traced (§1's ה1 investigation, this same session): 5 of 6 D1/L10 repro runs showed
"משיכות Y" (horizontal_pull) silently regress into "עמידת פייק" (vertical_push) — the two share a
primaryMuscle tag (shoulders), which is all the old predicate checked.

**Fix:** `raw.movementGroup !== ex.exercise.movementGroup` replaces the primaryMuscle check entirely
— a pull exercise's regression search can now only ever find another pull exercise (same
movementGroup), regardless of shared primaryMuscle. New regression test reproduces the exact pair
(pull-Y / push-pike sharing primaryMuscle='shoulders', a same-movementGroup pull-easy candidate at
a different primaryMuscle) — asserts the fixed code picks pull-easy, never push-pike; a second test
asserts the fallback (`flow_no_swap`, original exercise kept) fires instead of crossing domains when
no same-movementGroup candidate exists at all. Fails on pre-fix code (git stash verified), passes
fixed. No regressions in the 2 existing test files that exercise `applyFlowRegression`
(`naked-filter-domain-protection.test.ts`, `trio-modifiers-core-set-lock.test.ts`).

**Explicitly NOT yet re-measured against the original pull-disappearance report** — David's
instruction: that measurement waits until the `activePrograms[0]` investigation (§1, this same
session) concludes, since it may turn out to dominate ה1/ה2 entirely and change what "fixed" even
means for the original symptom.

**Commit:** local only, no push.

## Addendum 29 — Task 1: buildMockProfile hardened, all 3 fabrications fixed. The test matrix now
## reproduces the activePrograms[0]-only bug directly — 0 pull, 0 legs, every single run.

David's exact framing: the mock profile utility "lied" 3 ways, and every measurement this whole
session used it, so none of the prior numbers describe a real affected user.

**(א) Field names** — already fixed in an earlier turn (`currentLevel`/`percent`, not `level`/
`progressPercent`) — confirmed still correct, verified by a passing test even on pre-fix code for
this specific check (the new test suite's other tests correctly failed pre-fix; this one didn't,
proving it wasn't reintroduced from scratch).

**(ב) Fabricated domain levels** — `pullLevel`/`pushLevel`/`legsLevel`/`coreLevel` used to default to
`Math.max(1, effectiveLevel - N)` whenever `domainLevels` omitted that key — core's version was the
exact artifact behind the 223s rest-outlier (Addendum 26). Fixed for **all four** domains uniformly,
not just core — leaving push/pull/legs with the same anti-pattern would have just relocated the same
bug class. A domain now only appears in `progression.domains`/`tracks` when `domainLevels` explicitly
names it. `domains.full_body` is the one deliberate exception — `level` is a required, always-explicit
parameter (not a derived guess), so passing it through is not a fabrication, same treatment as
`progression.globalLevel`.

**(ג) `activePrograms: []` → synthetic `full_body` fallback** — removed. A real user with no chosen
program has `activePrograms: []`; that's what the function now returns. This was the single biggest
finding: `resolveChildDomainsForParent('full_body', ...)` is the ONE case that happens to expand
correctly to all 4 assessed children — meaning every mock profile this entire session built (all of
which called with `activePrograms: []`) accidentally took the one code path that masks the
`activePrograms[0]`-only read bug (docs 10/11). Also removed the now-dead `tracks[primaryId]` entry
it depended on — redundant even when real `activePrograms` are supplied (`programTracks` already
covers each program's own track and was spread last, silently shadowing it).

Updated the two stale UI strings in `src/app/admin/workout-simulator/page.tsx` that documented the
old "empty → full_body" behavior as intentional ("ריק → full_body" badge, "הסימולטור ישתמש ב-full_body
כברירת מחדל" helper text) — both now describe the actual new behavior (falls through to the Domain
Matrix, no synthetic program).

**New test suite** (`mock-profile.utils.test.ts`, 8 tests) — covers all three fixes plus a cold-start
case. Fail-before/pass-after verified via `git stash`: 4 of 8 failed on pre-fix code exactly as
predicted (the (ב)/(ג) fixes); the other 4 (field-name checks) already passed pre-fix, confirming (א)
wasn't silently broken by this pass.

### Test matrix extended — `scripts/audit/build-snapshot.ts` now has a `push_pull_legs_split` mode

Added `activeProgramsMode: 'auto' | 'push_pull_legs_split'` to the combo model. The new mode builds a
REAL 3-entry `activePrograms` input (`push`/`pull`/`legs`, matching `progression.service.ts`'s actual
split-write shape) across 2 levels × 2 durations × home-only (4 combos × 3 bolts = 12 workouts) — small
and deliberate, a regression tripwire rather than a full sweep. Tagged `req_domains =
'split:push_pull_legs'` in the snapshot for easy filtering. **Does not touch any frozen
schedule↔engine boundary file** (InputSanitizerMiddleware, SplitDecisionService, scheduleRules.ts,
scheduledProgramIds) — it only feeds the unmodified pipeline a different, equally real input shape.

**Result — the bug reproduces, every single time:**

```
req_domains='split:push_pull_legs', all 12 workouts (4 combos × 3 bolts, levels 8/12, durations 30/45):
  domain distribution across all 12: push=70, other=12, (blank)=6, core=1
  pull=0, legs=0 — zero, not reduced, in every one of the 12 workouts.
```

Several workouts also came in well under their requested duration (e.g. L8/45min → 18min actual) —
consistent with a domain-starved pool, matching doc 11's C1 finding.

### Delta vs. the pre-existing snapshot baseline (`auto` mode, 540 workouts, unchanged combo count)

| Metric | Before (pre-fix) | After (post-fix) |
|---|---|---|
| core_promise_outcome: failed | 386 | 357 |
| core_promise_outcome: satisfied | 130 | 145 |
| core_promise_outcome: replaced | 23 | 25 |
| core_promise_outcome: injected | 1 | 13 |
| domain: push | 999 | 1128 |
| domain: pull | 864 | 822 |
| domain: legs | 656 | **403** |
| domain: core | 261 | 280 |
| domain: other | 550 | 568 |

**Honest caveat, not glossed over**: `getShuffleSeed` is hardcoded `Date.now()`-seeded (documented in
this script's own header) — "which specific exercise wins among near-tied candidates" is NOT
reproducible run-to-run even with zero code changes, so some of this delta is re-run noise, not
purely attributable to the fix. That said, the legs swing (656→403, -39%) is large enough to be
worth flagging rather than dismissing as noise alone. Investigated one candidate mechanism —
`derivePeriodizationWeek(activeProgramForCycle)` reading `userProfile.progression.activePrograms[0]`
directly (now genuinely `undefined` instead of a fake `full_body` entry) — and ruled it out: both the
old fake entry (`startDate: new Date()`, i.e. "now") and the new `undefined` input resolve to the
same Week 1/Build phase (`periodization.service.ts:78-81`), so this isn't the mechanism. Most likely
explanation not yet confirmed: `activeProgramId` changing from `'full_body'` to `undefined` shifts
which branch of `InputSanitizerMiddleware.buildActiveProgramFilters` computes the domain list (the
'full_body' special-case vs. the assessedDomainKeys fallback) — same domain SET, but possibly a
different array ORDER, which could cascade into different tie-breaks in `takeFromPool`'s per-domain
capping (Addendum 26). **Not fully root-caused this pass — flagging as an open item, not asserting a
cause.** If tighter confidence is wanted, a repeated same-code re-run (to establish a noise floor)
before drawing conclusions from this specific delta is the natural next step — not done here to keep
this task's scope bounded.

**Every "auto"-mode number from any prior addendum in this file is now describing a different code
path** (activeProgramId was always `'full_body'`; is now always `undefined` for these combos) — not
necessarily wrong, but no longer a byte-identical re-derivation. Addendum 25's 6-workout sample and
Addendum 26-28's traces should be treated as historically accurate for what they measured, not as a
frozen baseline to diff future runs against without accounting for this.

**Commit:** local only, no push. Branch `fix/mock-profile-and-domain-gates`, worktree
`.claude/worktrees/mock-profile-and-domain-gates` (set up per David's explicit operational
instruction — the shared main working directory hit a stuck `index.lock` twice this session).

## Addendum 30 — Task 2 investigation: progression.service.ts's `core: snap.core ?? 1`.
## Report only, per instruction — NO fix applied. Turns out to be inert in production today, for a
## reason worth knowing before deciding whether to fix it at all.

**מוקפא לפי §2 — שייך למסלול הלוז** (`.claude/knowledge/schedule-vs-smart-coach-contract.md`):
`evaluateProgramEvolution`/`pendingProgramEvolution` changes which program the user is switched into
by level — that changes what appears in the schedule, so it's frozen under the schedule↔smart-coach
contract, same as the other boundary files. This addendum stays as documentation only — do not
delete, fix, or complete this mechanism until that contract resolves it. Do not confuse with the
separate, live `assessment_rules`/`program_thresholds` mechanism in the admin panel (different
thresholds/program names, read only from the registration screen) — that one is real, out of scope
for this addendum, and will be handled separately.

David's flagged lines (`buildEvolvedPrograms`, ~1420-1423/1460-1463) belong to a "Program Evolution
Engine" with two halves:

**Half 1 — detection, real and live.** `evaluateProgramEvolution` (`:1328-1359`) runs inside the
normal XP-award/level-up flow — confirmed via its one real caller at `:1879`, which is itself inside
a function that also writes `progression.readyForSplit` (`:1872`) a few lines above, i.e. genuinely
executes on every level-up, not a dead branch. When a user's `full_body` hits L13 or `upper_body`
hits L18, it builds `subLevelsSnapshot` (`:1333-1336`):
```js
for (const childId of ['push', 'pull', 'legs', 'core']) {
  subLevels[childId] = tracks[childId]?.currentLevel ?? 0;
}
```
**This is the actual, currently-executing fabrication** — not the `?? 1` David pointed at. Any
domain the user never assessed gets `0` written directly into `progression.pendingProgramEvolution`
on the real user document (`:1882-1883`, a real `updateDoc` call, not a dry-run).

**Half 2 — execution, confirmed dead code.** `buildEvolvedPrograms` (containing the exact `snap.core
?? 1` / `snap.legs ?? 1` lines David flagged) **has zero callers anywhere in the codebase** —
verified by grepping the entire `src/` tree, not just this file. `pendingProgramEvolution` (the field
Half 1 writes) has exactly one other reference in the whole codebase: its own type declaration
(`user.types.ts`). No UI component reads it, nothing calls `buildEvolvedPrograms` to act on it. The
flag gets written to real user documents and then sits there, permanently inert.

**Direct answers to David's 4 questions:**

1. **מי קורא לפונקציות האלו** — `evaluateProgramEvolution`: one real caller, inside the live XP
   level-up path. `buildEvolvedPrograms`: no callers at all, anywhere.
2. **מה קורה בפועל אצל משתמש שאין לו רמת ליבה** — nothing. The flag is set on their Firestore
   document (with a fabricated `core: 0` inside `subLevelsSnapshot`, if core was never assessed), but
   since nothing ever calls `buildEvolvedPrograms` to act on that flag, **no user has ever actually
   been evolved into a new split through this path, correctly leveled or not.** No core workout at
   any level gets triggered by this specific mechanism, because the mechanism that would trigger it
   was never finished.
3. **A subtlety worth flagging even though it's currently moot**: because of JS nullish-coalescing
   semantics, `buildEvolvedPrograms`'s `?? 1` would almost never actually produce `1` for a domain
   that came from `evaluateProgramEvolution` — `0` is not nullish, so `0 ?? 1` evaluates to `0`, not
   `1`. If this code path is ever wired up as-is, the realistic failure mode is closer to "writes
   `currentLevel: 0`" than "writes `currentLevel: 1`" — different from how the bug was originally
   described, worth knowing before anyone reaches for the `?? 1` line specifically as "the" fix site.
   (`0` may or may not be handled correctly by other consumers — not audited this pass, since the
   path is dead; would need re-checking before ever wiring this up for real.)
4. **A separate, live mechanism exists and should not be confused with this one**: `readyForSplit`
   (`checkReadyForSplit`, `:1868-1876`) is a different flag, with real consumers
   (`src/app/admin/users/all/page.tsx`, `useProgressionSync.ts`). Whether `pendingProgramEvolution`/
   `buildEvolvedPrograms` is an abandoned, superseded-by-`readyForSplit` approach, or an unfinished
   newer one meant to replace it, isn't determinable from code alone — flagging as a genuine
   ambiguity, not guessing.

**Proposed fix, not applied** (per instruction — report first): David's suggested direction — leave
the value `undefined` and let the caller decide, rather than inventing `0` or `1` — applies most
directly to `evaluateProgramEvolution`'s `?? 0` (the line that actually executes). Whether
`buildEvolvedPrograms` is worth fixing at all depends on the answer to point 4 above: fixing dead
code costs nothing risky, but if this whole mechanism is meant to be retired in favor of
`readyForSplit`, the more valuable fix might be deleting `pendingProgramEvolution`'s write (Half 1)
and `buildEvolvedPrograms` (Half 2) entirely instead of patching either.

**Commit:** local only, no push. Documentation only — no source file changed this task, per
instruction ("דווח לפני שאתה מתקן").
