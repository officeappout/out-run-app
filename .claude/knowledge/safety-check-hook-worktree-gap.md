# safety-check.sh PreToolUse hook — hardcoded main-checkout path (worktree gap)

**Found:** 16.08.2026, during Stage 2 (route-enrichment-pipeline plan) verification, while confirming `scripts/safety-check.sh` check 3 (the Stage 1B chokepoint regression tripwire) would actually catch a violation.

## The gap

`.claude/settings.json`'s `PreToolUse` hook for `Bash(git commit*)` is:

```json
"command": "bash /Users/calisthenicsltd/Development/appout-1/scripts/safety-check.sh"
```

This is an **absolute path to the main checkout**, not relative to the session's working directory. A session running in a git worktree (e.g. `.claude/worktrees/route-enrichment-stage-0`) has its own copy of `scripts/safety-check.sh` — possibly with local edits not yet merged to `main` — but the hook always executes **main's version of the script**, regardless of which worktree the commit is actually happening in.

**Consequence:** any new check added to `safety-check.sh` on a feature branch (e.g. Stage 1B's check 3, added in commit `f4cd5872` on `feat/route-enrichment-stage-0`) is **not actually live** for that branch's own commits until the branch merges to `main`. Confirmed empirically: Stage 2.1-2.3's commits (which legitimately don't call `buildValidatedDoc()`, by design — fixed-shape payloads) went through cleanly with no hook output at all, because the hook ran main's pre-Stage-1B script, which has no check 3.

## Fix needed (not done — out of scope for the route-enrichment-pipeline plan itself; this is session/repo hook infrastructure, not route code)

Make the hook path worktree-relative, e.g. resolve the script path from `$CLAUDE_PROJECT_DIR` or the invoking session's cwd rather than a hardcoded absolute path — so a worktree session's own (possibly newer) `safety-check.sh` is what actually runs against its own commits.

## Where this matters for future work

- Any new `scripts/safety-check.sh` check added on a branch should be **manually run** (`bash scripts/safety-check.sh` after staging) rather than trusted to fire automatically, until this is fixed.
- When `feat/route-enrichment-stage-2` (or its parent `feat/route-enrichment-stage-0`) merges to `main`, check 3 becomes live repo-wide for the first time — worth a deliberate smoke test at that point (stage a known-bad diff, confirm it's blocked) since it's never actually been exercised for real.
- This gap likely affects **every** worktree-isolated session in this repo, not just this one — any hook-based check added while working in a worktree is similarly inert until merge.

See also: `.claude/plans/route-enrichment-pipeline-kickoff-vast-pelican.md`'s Stage 2 approval-log entry (16.08.2026), which records this same finding in the route-enrichment context.
