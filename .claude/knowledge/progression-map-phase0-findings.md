# Progression Map — Phase 0 Findings

**Status:** checks #3+#4 done (code-only, verified against `origin/main` @ `3ed6696e`).
Checks #1+#2 need live Firestore data — this session has no `.env.local`/Admin SDK
credentials in its worktree, so they could not be run here. A ready-to-run script is
included (`scripts/audit-progression-map-phase0.ts`) — run with
`npx tsx scripts/audit-progression-map-phase0.ts` from an environment that has
`.env.local` (e.g. the main checkout), then paste the output back for review.

See `.claude/plans/happy-mixing-sky.md` for the full work plan these checks feed into.

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

**Conclusion: there is no existing concept of "map destination" to reuse. Hub's "היעדים
שלך" has no data source today other than deriving it.** The original (pre-correction)
idea — every distinct `base_movement_id` among exercises whose `targetPrograms` includes
the Hub's programId becomes one goal-card — is therefore the only viable option that
doesn't require new admin-curated content, which is consistent with David's "no new
content to author" constraint. This is now the plan's actual direction for Phase 2, not
a fallback.

**One more thing check #4 turned up, worth flagging even though it doesn't block
anything:** the spec's own headline example — "חתירה → מתח שלילי → … → מתח" — spans
`row` and `pull_up`, which are two *separate* `base_movement_id` values (verified against
the real `BASE_MOVEMENT_LABELS` list, see the audit script). A single-family ladder (the
architecture David chose) can't reproduce that exact chain — it can only ladder within
`pull_up` itself. This was already implied by David's decision to scope the Tree down to
one family, so it's not a new problem, just made concrete here for the record.

---

## Checks #1+#2 — still need live data (script ready, not run)

`scripts/audit-progression-map-phase0.ts` (committed alongside this doc) computes,
read-only, against the real `exercises` and `users` collections:

- **#1**: per (base_movement_id, programId) — how many distinct levels (ladder rungs)?
  How many families collapse to a single rung (degenerate/no-ladder case)? How many
  `base_movement_id` values fall outside the curated 20-value list? How many exercises
  have a family but zero `targetPrograms` (level unresolvable)? How many
  (family, programId, level) buckets have more than one candidate exercise, and how many
  of those are still ambiguous after the role+execution_methods tie-break from the plan
  (§4, Phase 1 risks)?
- **#2**: sampling real `users/{uid}` docs, does `progression.tracks[domain]` carry
  `.level`, `.currentLevel`, or both? (`useProgressionStore.ts` assumes `.level`;
  `useGoalsForProgram.ts`'s `TracksMap` type assumes `.currentLevel` — this has to be
  resolved before any "current level in program X" logic is written for Hub/Tree, or
  "פתוח עכשיו" and the Level Drawer's lock state will silently break.)

Run with `npx tsx scripts/audit-progression-map-phase0.ts` from an environment with
`.env.local` present (this worktree doesn't have one — a fresh git worktree doesn't
inherit gitignored files from the main checkout).
