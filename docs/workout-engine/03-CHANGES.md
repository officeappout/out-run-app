# Level-Integrity Fix — What Changed, Why, and How to Roll Back

> Branch: `fix/exercise-level-integrity` (based on `main`). No push happened — everything
> below is local commits only, waiting for review.
> **No Firestore data was touched.** No migration was run. Everything with real database
> impact (Part 2) is dry-run only, verified, and waiting on your explicit `--apply`.

---

## Summary table

| # | Commit | What | Firestore impact | Reversible how |
|---|---|---|---|---|
| 1 | `e9276efc` | docs baseline: `01-MAP.md`, `02-CATALOG-AUDIT.md` + CSVs, the audit script, `00-PLAN.md` | None (docs only) | `git revert e9276efc` |
| 2 | `1a27763a` | `03-LEVEL-TRIAGE.md` (Part 1 report) | None (docs only) | `git revert 1a27763a` |
| 3 | `f276714e` | `apply-level-triage.ts` (Part 2 migration script) | **None yet** — not run with `--apply` | `git revert f276714e` |
| 4 | `70661a91` | Fix 3.1 — graduated CLIFF fallback | None (code only) | `git revert 70661a91` |
| 5 | `0c13685d` | Fix 3.2 — remove globalLevel substitution | None (code only) | `git revert 0c13685d` |

Each of 3, 4, 5 is independently revertible — reverting one does not require reverting
the others. 4 and 5 both touch `WorkoutGenerator.ts`, but on non-adjacent, non-overlapping
lines (verified before committing), so a revert of either cleanly leaves the other intact.

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
name, have no role and no `mobility`/`flexibility` tag, so they don't satisfy
`warmup.service.ts`'s or `cooldown.service.ts`'s actual selection conditions. They don't
need a level (they're not domain content), but most of them are currently **unreachable
by any live selection path** — a real, separate finding, logged as an open item below,
not fixed here.

**Nothing to roll back** — this commit only adds a markdown file.

---

## Part 2 — Migration script (not run)

**What:** `scripts/audit/apply-level-triage.ts`. Encodes the 20 Group-B fixes from
`03-LEVEL-TRIAGE.md` as a statically-typed array (not parsed from the markdown at
runtime — see the script's own header comment for why that coupling was deliberately
avoided on a live-writes script).

**Status:** dry-run verified against live data — all 20 candidates resolve correctly,
zero drift since the audit, zero writes performed. **Not run with `--apply`.**

**To actually apply it**, once you've reviewed and approved Group B in
`03-LEVEL-TRIAGE.md`:
```
npx tsx scripts/audit/apply-level-triage.ts --apply
```
Add `--limit N` to stage a partial rollout (e.g. `--limit 3` to test on the first 3
before doing the rest). Backups are written to `scripts/_backups/level-triage/<runId>/`
(one JSON file per touched document, plus a `_manifest.json`) **before** each write —
if a backup write fails for a document, that document is skipped, never written blind.

**Rollback after an `--apply` run:** for each document you want reverted, restore its
`data` object from the backup JSON:
```ts
const backup = JSON.parse(fs.readFileSync('scripts/_backups/level-triage/<runId>/<id>.json', 'utf-8'));
await db.collection('exercises').doc(backup.id).set(backup.data);
```
**Diff the backup against the doc's current state first** if you suspect it's been
edited again since the apply run — a blind restore would also undo any later, unrelated
edit to that same document.

---

## Part 3.1 — Graduated CLIFF fallback

**Commit:** `70661a91`.

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
   back to its healthy baseline parent domain(s) (`push`/`pull`/`legs`) — reusing the
   pre-existing `SKILL_SIBLINGS` map (hoisted to module scope, not duplicated) rather
   than adding a 4th divergent skill-parent map to a codebase that already had 3.
3. Still thin — return what exists as-is (never the full catalog), with
   `relaxedConstraints` on the generation context and a `pipelineLog` entry.

**Why this scope, not a bigger content fix:** `02-CATALOG-AUDIT.md` found this fallback
fires in **146 cells, every single one inside a skill-track program** — zero in
push/pull/legs/full_body/upper_body. Filling those skill catalogs is real filming work
(weeks), not a code fix; `00-PLAN.md` §6 explicitly deprioritized that. This change
fixes the *mechanism* (never silently open the whole catalog) without touching content.

**Verification:** `tsc --noEmit` error count unchanged (489 before/after — including 3
new Set-spread errors this introduced and then fixed via `Array.from()`, matching the
codebase's existing convention for the same pre-existing error class). Full
`workout-engine` test suite: 429/429 passing.

**Rollback:** `git revert 70661a91`. Self-contained — reverting restores the exact prior
one-line fallback with no cleanup needed elsewhere.

---

## Part 3.2 — Remove the globalLevel substitution

**Commit:** `0c13685d`.

**Files:** `workout-selection.utils.ts` (main fix, `applyDifficultyFilter`),
`WorkoutGenerator.ts` (1 line — threads `pipelineLog` into the call), the existing test
file for this function (updated, +2 new tests).

**Before:** two spots inside `applyDifficultyFilter` fell back to `context.userLevel`
(`globalLevel` — a closed 1-10 scale derived purely from lifetime XP,
`progression.globalLevel`) whenever a domain-specific or exercise-specific level
couldn't be resolved. Per `01-MAP.md` §8, there is **no mapping anywhere in the
codebase** between that scale and the open-ended per-domain program-level scale
(real seed data to L22) the engine actually filters on — comparing them is comparing
two unrelated number spaces.

**Why this exact line, and why now:** `a0a2ab6f` (01.08.2026) already fixed the same bug
class in this file's sibling function (`selectExercisesWithDomainQuotas`) under the
principle "absent domain = absent, never fabricate a level." `a1acb366` (09.08.2026), a
follow-up to that same commit, removed a related fallback in *this* function but its own
comment explicitly named the `rawDomainLevel = globalLevel` line as the one thing it
didn't touch. This commit closes that gap, using the same approach: **never invent a
value from an unrelated source; use the codebase's own established "unassessed → 1"
convention** (matching `resolveExerciseLevelForDomains`' own `recommendedLevel || 1`)
instead.

**Not implemented:** re-routing to the existing "needs assessment" flow
(`home-workout.service.ts:709-728`), the other option the task offered. That gate runs
once, at the start of the whole trio generation, before the session's overall domain set
is known to be assessed at all. `applyDifficultyFilter` runs far deeper, per-exercise,
after that gate has already passed for the session as a whole — an individual exercise
whose specific domain doesn't resolve is a narrower, per-exercise case that an explicit
floor + flag handles correctly without derailing the whole session.

**Verification:** `tsc --noEmit` unchanged (489/489, zero new). The pre-existing test
that had locked in the *old* behavior by name (`"...still falls back to globalLevel
(line 377, unchanged)"`) was updated — its premise was exactly the bug this commit
fixes. 2 new tests added (`domainLevelAssumed` flag, `pipelineLog` entry). Full
`workout-engine` suite: 429/429 passing.

**Rollback:** `git revert 0c13685d`. Independent of 3.1.

---

## Test/type verification methodology (applies to both 3.1 and 3.2)

- `npx tsc --noEmit -p tsconfig.json` run before any change (`git stash`) and after,
  diffed line-for-line — total error count identical (489/489) both times, confirming
  zero new type errors anywhere in the codebase, not just the touched files.
- `npx vitest run src/features/workout-engine` — 429/429 actual test assertions pass.
  2 "failed suites" (`hybrid-orchestrator.test.ts`, `hybrid-runtime.test.ts`) are
  **pre-existing**, confirmed via the same `git stash` before/after comparison: they call
  `process.exit()` directly, which vitest flags as an error regardless of exit code, and
  one has a genuine pre-existing internal assertion failure unrelated to level
  resolution. Neither file imports anything this task touched.

---

## Open items — found during this work, explicitly not fixed here

1. **Most of the Group-A (warmup/stretch) content is currently unreachable** — no
   `exerciseRole`, no `mobility`/`flexibility` tag. See Part 1 above. A tagging fix, not
   a level fix; out of this task's scope.
2. **A third core-detector miss** — "עמידת כלב רגל ויד נגדית" (bird dog), found while
   triaging the 70, is a genuine core-stability exercise the canonical
   `exerciseMatchesProgram` detector completely misses (same root cause as the 2 named
   in Part 1b2 — no `movementGroup`/`primaryMuscle`/tag/name-keyword match). Flagged in
   `03-LEVEL-TRIAGE.md`'s Group C rather than silently folded into Part 1b2's scope.
3. **The flag-exercise core-classification decision (Part 1b3)** — whether to remove the
   9 `human_flag` exercises from core classification or give them a
   `targetPrograms[core]` entry. Laid out with implications, not decided. Needs your
   call before any code or data change there.
4. **`שכיבות סמיכה על טבעות 75` (ring push-up) and 6 other Group-C items** — no
   confident comparable found in the catalog to propose a level against. Listed in
   `03-LEVEL-TRIAGE.md` with exactly what's missing to decide each one.
5. **Junk records (Part 1c)** — identified, not deleted. Recommendations given, your
   call on execution.

None of these require code changes to resolve — they're data/content decisions, laid
out for you to make.
