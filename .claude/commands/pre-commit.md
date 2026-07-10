# /pre-commit

AI review gate before merge. Runs the `code-reviewer` agent on the full branch diff.

## When to run
Before `git push` or creating a PR. Not needed before every local commit
(the static PreToolUse hook handles that).

## Steps

### 1 — Confirm there is something to review
```bash
git log main..HEAD --oneline
git diff main..HEAD --stat
```
If the branch is empty or already merged → stop and report.

### 2 — Workout invariants gate (conditional)
Run ONLY when the branch diff touches the workout engine:
```bash
if git diff main..HEAD --name-only | grep -q '^src/features/workout-engine/'; then
  npm run test:invariants
fi
```
- Hermetic gate over generated workouts (`tests/invariants/runner.ts`) — see
  `tests/invariants/README.md`. Known engine bugs are marked `xfail` and do NOT
  fail it; only a NEW regression (a HARD FAILURE) makes it fail.
- **Exit codes:** `0` = green (proceed) · `1` = invariant regression → **BLOCK**:
  list the `HARD FAILURES` lines, do NOT push/PR; fix the regression, or — if the
  change intentionally alters that behavior — update/relax the specific invariant
  in `runner.ts` with justification and surface it to David, then re-run · `2` =
  **config error** (missing/empty `.env.local`) → NOT a regression: report the
  preflight message, restore `.env.local`, re-run. Do not touch invariants for this.
- If the workout engine wasn't touched, skip this step.

### 3 — Run the code-reviewer agent
Invoke the `code-reviewer` agent with this context:
- Diff scope: `git diff main..HEAD`
- It loads axioms.md and runs its 3 checks
- Wait for its VERDICT

### 4 — Gate on verdict

**If VERDICT: ✅ PASS:**
Report the clean result. Proceed with push/PR when ready.

**If VERDICT: ❌ BLOCKING:**
- List the blocking findings clearly
- Do NOT run `git push`
- Do NOT create a PR
- Say: "Fix the blocking issues above, then re-run /pre-commit."

## Notes
- This reviews the FULL branch diff (main..HEAD), not just staged files.
- Static checks (safety-check.sh) run automatically on each agent commit.
  This command adds the AI reasoning layer for axiom violations and edge cases.
- The workout invariants gate (step 2) needs `.env.local` (firebase init) and,
  in a worktree, `node_modules` symlinked from the main checkout.
- If the reviewer returns ambiguous findings, surface them to David — do not
  auto-resolve blocking status.
