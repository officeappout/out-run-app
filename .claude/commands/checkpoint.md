# /checkpoint

Update `.claude/knowledge/project-state.md` with the current conversation's progress.

## Instructions

1. Read `.claude/knowledge/project-state.md` to get the current state.
2. Synthesize what happened in this conversation:
   - What was built or changed?
   - What decisions were made that shouldn't be relitigated?
   - What is the single most important next step?
   - Which threads advanced, which are still open?
3. Rewrite `project-state.md` in full — do not append, replace the whole file.
   Keep it under 300 lines. Ruthlessly trim stale bullets from "✅ נעשה" (keep last 3 sessions only).
4. Update the header: `> Checkpoint: <today's date> | Updated by: /checkpoint`
5. Confirm: "✅ Checkpoint saved — project-state.md עודכן."

## Format to preserve (do not change section headers or emoji)

```
# Project State — OUT / Calisthenics LTD
> Checkpoint: <date> | Updated by: /checkpoint
> Max size: ~300 lines. /checkpoint rewrites this file — never append manually.

---

## 🔴 מיקוד עכשווי
## ✅ נעשה (sessions אחרונים)
## 🔑 החלטות נעולות (אל תחזור ותדון)
## ➡️ הצעד הבא
## 🧵 Threads פתוחים
```

## When to run
- After completing a multi-step build session
- Before a long pause (end of day)
- When you sense the context is getting long and compaction may happen soon
- After any significant architectural decision
