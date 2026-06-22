# /checkpoint

Synthesize the current session's work and rewrite `project-state.md`.

## Step 1 — Gather git context (run these, use output in synthesis)

```bash
git rev-parse --abbrev-ref HEAD
git log --oneline -6
git status --short
```

## Step 2 — Synthesize this session

Answer these questions from the conversation:
- What blocks / features / fixes were completed? (cite commit hashes from step 1)
- Which decisions were made that should not be relitigated? (add to 🔑 if new)
- What is the single most important next step right now?
- Which threads advanced? Which are still open?

## Step 3 — Rewrite `project-state.md` in full

**Do not append — replace the entire file.**
Keep it under 300 lines. Trim ✅ נעשה to last 3 sessions only (ruthless).

### Header format (mandatory — always include branch + last commit)
```
# Project State — OUT / Calisthenics LTD
> Checkpoint: DD.MM.YYYY | Branch: <branch> | Last commit: <hash> <subject>
> Max size: ~300 lines. /checkpoint rewrites this file — never append manually.
```

### Sections (keep these headers exactly — hooks depend on them)
```
## 🔴 מיקוד עכשווי
<2–3 sentences: what is in-flight right now, which block/feature>

## ✅ נעשה (sessions אחרונים)
<bullet per session, most recent first. Include commit hash for code changes.>
**session DD.MM:** Block X — <what changed> (commit: <hash>)

## 🔑 החלטות נעולות (אל תחזור ותדון)
<decisions that are locked. Do not remove without explicit instruction.>

## ➡️ הצעד הבא
<one concrete action — specific file, block, or command>

## 🧵 Threads פתוחים
<per domain: what's pending, what's waiting on external input>
```

## Step 4 — Confirm
Reply: `✅ Checkpoint saved — project-state.md עודכן. Branch: <branch> | Commit: <hash>`

## When to run
- After completing a block (A / B / C / D / E)
- Before a long pause or end of day
- When context is getting long (before compaction)
- After any architectural decision that should not be re-litigated
