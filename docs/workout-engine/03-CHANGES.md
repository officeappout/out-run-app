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
