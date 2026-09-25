# Progression Map — Phase 0 Findings

**Status:** checks #3+#4 done (code-only, verified against `origin/main` @ `3ed6696e`).
Checks #1+#2 need live Firestore data — this session has no `.env.local`/Admin SDK
credentials in its worktree, so they could not be run here. A ready-to-run script is
included (`scripts/audit-progression-map-phase0.ts`) — run with
`npx tsx scripts/audit-progression-map-phase0.ts` from an environment that has
`.env.local` (e.g. the main checkout), then paste the output back for review.

See `.claude/plans/happy-mixing-sky.md` for the full work plan these checks feed into.

## ⚠️ MODEL RESET (2026-09-25, supersedes check #1's original framing below)

David reset the ladder model after this doc's first version. The corrected model —
**already reflected in the current version of `scripts/audit-progression-map-phase0.ts`,
not in the "Checks #1+#2" section text further down, which still describes the old
approach and is kept only for history**:

- A Tree = one **LEAF program's** (`Program.isMaster === false`) exercises, ordered by
  level, using only `Exercise.targetPrograms: [{programId, level}]`. This crosses
  movement families on purpose (e.g. מתח program: חתירה → banded pull-up → full pull-up
  — `row` and `pull_up` are different `base_movement_id` values, same leaf program).
- A leaf program tops out at its own destination exercise; a harder skill (e.g. מאסל אפ)
  is a **separate** leaf program, not a continuation.
- A **composite/domain** program (`isMaster === true`, e.g. משיכה, פלג עליון) is a HUB
  listing its leaf programs via `Program.subPrograms` — not itself a ladder.
- **Confirmed** (grep against `origin/main`, this is the answer to "which field groups
  the ladder, and is base_movement_id swap-only"): the ladder groups by
  `Exercise.targetPrograms[].{programId,level}` + `Program.isMaster`/`subPrograms` —
  nothing else. `base_movement_id` appears in exactly one ladder-adjacent role in the
  whole codebase: `exercise-replacement.service.ts`'s `getExerciseVariations()` (±level
  radius) and `getAlternativeExercises()` (by `movementGroup`), both feeding the
  "החלפת תרגיל" swap drawer only — confirmed via `git grep -ln base_movement_id
  origin/main` across every `.ts`/`.tsx` file (17 files total; the rest are admin
  editing/storage, unrelated audit/seed scripts, or `useExerciseMasterData.ts`'s OLD
  3-node prev/current/next chain, which is the superseded model this script no longer
  follows). No per-exercise prerequisite field exists anywhere, and none is needed —
  program+level is the sequencing mechanism.

This directly resolves a gap the pre-reset plan flagged (see `.claude/plans/happy-mixing-sky.md`
§1, "the spec's own headline example spans two families"): it spans families **because
the ladder was never supposed to be family-scoped** — it's program-scoped. Checks #3
and #4 below (level-description ownership, goals-system alignment) are unaffected by
this reset — they're about admin-UI/data-ownership, not the ladder-grouping mechanism.

---

## Check #3 — Level description: does `ProgramLevelSettings` already have one?

**Yes — and this changes the plan.** `ProgramLevelSettings.levelDescription: string`
(`program.types.ts:94`) is exactly the per-(program+level) description David asked for
— it's a **required** field, already on the type, already wired through the save path
(`saveProgramLevelSettings`), already given a generic default seed on bootstrap
(`programLevelSettings.service.ts:461`, `createDefaultLevelSettings` — 5 templated
sentences like "שלב היכרות עם התוכנית..." reused verbatim across every program) and
already **displayed** (read-only) in the Level Goals Panel
(`admin/programs/page.tsx:1129-1130`).

**What's missing: an admin control to actually edit it with real per-program content.**
Checked both places that touch `levelDescription` on save
(`admin/programs/page.tsx:995,1012,1369,1401` and `admin/progression-manager/page.tsx:426,491`)
— every one of them is a **pass-through default** (`existing?.levelDescription ?? 'רמה N'`),
never a controlled `<textarea>`/`<input>` bound to it. So today a program either has the
generic bootstrap sentence, or (if `createDefaultLevelSettings` was never run for it) the
even-more-generic `'רמה N'` fallback — no program has bespoke, admin-authored level
copy, because there's nowhere to type it.

**Practical conclusion:** exactly the "small additive field" David anticipated as the
fallback — add one `<textarea>` bound to `levelDescription` in the existing Level Goals
Panel (`admin/programs/page.tsx`, near the read-only display at ~line 1129). No new
collection, no new type field (it already exists), no new page.

**One nuance on the null/undefined clearing convention** (`.claude/rules/exercise-editor-conventions.md`):
that convention is written for *optional* fields (`field?: string`) where `null` is the
"explicitly cleared" signal distinct from `undefined`'s "untouched." `levelDescription`
is **required** (`string`, not `string | undefined`), so the same null-vs-undefined
distinction doesn't directly apply — there's no valid "cleared" state to preserve
against, only "reset to empty string / back to the generic default." Simpler case; still
worth a look when the field is actually added, but it's not the same bug shape.

**Child vs. parent programs**: David's "child programs only, not composite parents like
כל הגוף" maps directly onto the already-existing `Program.isMaster` boolean
(`program.types.ts`) — `isMaster: true` = composite/parent, skip; `false` = child, valid
target for this field. This is an existing, reliable distinction — no new modeling
needed, just gate the new textarea's visibility on `!program.isMaster` (or simply only
show it for programs where `isMaster` isn't true).

---

## Check #4 — Goals-system alignment: what should feed Hub's "היעדים שלך"?

**Confirmed, exhaustively: `targetGoals`/`LevelGoal`/`isGoalExercise` is unambiguously a
rep-completion-criteria system, unrelated to map destinations — as David said.**

- `LevelGoal` (`src/types/workout.ts:10-21`): `{exerciseId, exerciseName, targetValue,
  unit: 'reps'|'seconds', progressBonus?, xpBonus?}` — literally "do N reps/seconds of
  exercise X to earn a progress/XP bonus at this level." No notion of "this exercise is
  where the program leads."
- `isGoalExercise` (found on generated workout exercises, e.g.
  `workout-generator.types.ts:97`, `route.types.ts:89`) is populated at
  **generation time** by checking membership in
  `goalExerciseIds = new Set(levelSettings.targetGoals.map(g => g.exerciseId))`
  (`home-workout.service.ts:2694`) — it's the *same* `targetGoals` system, just
  propagated onto one generated workout so the UI can show "(יעד: 20)" next to an
  exercise during that session. Confirmed via full-codebase search — every
  `isGoalExercise` site traces back to this one source, nothing independent.
- Searched explicitly for any OTHER field that might mark "this exercise/family is a
  target-skill destination for program X" (`isTargetExercise`, `skillTarget`,
  `targetSkill`, `mapDestination`, etc.) — **zero matches anywhere in the codebase.**
  `ExerciseTag` has a `'skill'` value (`exercise.types.ts:262`), but that's a
  classification tag (is this exercise skill-type vs. compound/isolation/etc.), not a
  per-program "leads here" marker.

**Conclusion: there is no existing concept of "map destination" to reuse — but per the
model reset above, none is needed.** Hub's "היעדים שלך" is simply the composite
program's `subPrograms` resolved to their `Program` docs — each child **leaf** program
*is* one goal-card, linking to that leaf program's own ladder/Tree. Zero derivation
logic, zero new admin content: `Program.subPrograms` already exists and is already the
parent→child link (see `.claude/plans/happy-mixing-sky.md` §1). The earlier
`base_movement_id`-derivation idea (kept below for history) is now moot — superseded by
the simpler, already-existing `subPrograms` relationship.

**One more thing check #4 turned up — RESOLVED by the model reset above, kept for
history:** the spec's own headline example — "חתירה → מתח שלילי → … → מתח" — spans `row`
and `pull_up`, two *separate* `base_movement_id` values. At the time this was written,
the plan grouped ladders by single `base_movement_id` family, which genuinely couldn't
reproduce that chain. That's no longer the model: ladders now group by leaf **program**
(e.g. the מתח program), which spans families by design — this is exactly how that chain
gets reproduced. Not a residual gap.

---

## Checks #1+#2 — still need live data (script ready, not run)

`scripts/audit-progression-map-phase0.ts` (committed alongside this doc; rewritten
2026-09-25 to match the model reset — see the box at the top of this doc) computes,
read-only, against the real `programs`, `exercises`, and `users` collections:

- **#1 (redesigned)**: for every LEAF program (`isMaster === false`), the ordered ladder
  built from `Exercise.targetPrograms` — exercise names per level, ascending. Reports,
  per program: gaps (levels with zero exercises within the program's observed range),
  multi-node levels (2+ exercises sharing a program+level), single-exercise programs (no
  real ladder), exercises with an unresolvable/invalid level, `targetPrograms` entries
  pointing at an unknown programId, and — a reset-driven sanity check — any exercise
  tagged directly to a *composite* program (shouldn't happen under this model). Totals:
  how many leaf programs exist, and how many form a clean ascending ladder (no gaps, no
  multi-node levels, 2+ rungs). Also prints every composite program's `subPrograms`
  (the Hub-listing data Phase 2 needs).
- **#2 (unchanged)**: sampling real `users/{uid}` docs, does `progression.tracks[domain]`
  carry `.level`, `.currentLevel`, or both? (`useProgressionStore.ts` assumes `.level`;
  `useGoalsForProgram.ts`'s `TracksMap` type assumes `.currentLevel` — this has to be
  resolved before any "current level in program X" logic is written for Hub/Tree, or
  "פתוח עכשיו" and the Level Drawer's lock state will silently break.)

Run with `npx tsx scripts/audit-progression-map-phase0.ts` from an environment with
`.env.local` present (this worktree doesn't have one — a fresh git worktree doesn't
inherit gitignored files from the main checkout).
