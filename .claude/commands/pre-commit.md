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

### 2 — Run the code-reviewer agent
Invoke the `code-reviewer` agent with this context:
- Diff scope: `git diff main..HEAD`
- It loads axioms.md and runs its 3 checks
- Wait for its VERDICT

### 3 — Gate on verdict

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
- If the reviewer returns ambiguous findings, surface them to David — do not
  auto-resolve blocking status.
