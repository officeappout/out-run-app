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
