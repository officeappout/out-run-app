---
name: daily-authority-scan
description: >-
  Trigger when the user requests a daily email scan, morning CRM summary,
  or says: "סריקת מיילים יומית", "סיכום בוקר", "הרץ את ה-CRM",
  "מה קרה היום עם הרשויות", "/daily-run".
  Calls the existing backend — do not re-implement logic.
---

# daily-authority-scan

## What this skill does
Calls `POST /api/admin/crm-agent/run`, receives the scan result, and formats
a Hebrew morning summary.

## Steps

### 1 — Load required rules
Before running, confirm you have read:
- `.claude/rules/pipeline-statuses.md` — to interpret status changes correctly
- `.claude/rules/panel-api.md` — endpoint details

### 2 — Resolve API key
```bash
echo $AGENT_API_KEY
```
If empty, read `.env.local` (line `AGENT_API_KEY=...`). Never print the value.

### 3 — Call the API
Standard run:
```bash
curl -s -X POST http://localhost:3000/api/admin/crm-agent/run \
  -H "Content-Type: application/json" \
  -H "X-Agent-Key: $AGENT_API_KEY" \
  -d '{}'
```

Dry run (when user passes `--dry` or `dryRun`):
```bash
curl -s -X POST http://localhost:3000/api/admin/crm-agent/run \
  -H "Content-Type: application/json" \
  -H "X-Agent-Key: $AGENT_API_KEY" \
  -d '{"dryRun": true}'
```

### 4 — Format output

**On failure** (`success: false` or network error):
```
❌ הסריקה נכשלה — <error>
בדוק שהשרת רץ (npm run dev) ו-AGENT_API_KEY מוגדר.
```

**On success** (`success: true`):
```
📬 CRM Daily — <DD/MM/YYYY>

🆕 ליידים חדשים: <N>
<per lead: • <authorityName>>

📈 שינויי סטטוס: <N>
<per change: • <authorityName>: <from> → <to>>

📎 מסמכים חדשים: <N>
✉️  טיוטות ממתינות לאישורך: <N>
<per draft: • <authorityName> — <subject>>

⏭️  Threads שדולגו: <skippedThreads>

⭐ עדיפות גבוהה:
<per priority: • <authorityName>: <reason>>

⚠️  שגיאות: <if errors[] non-empty — list them>
```

**Suspicious result** (`success: true` but everything zero): likely a 401 — AGENT_API_KEY mismatch.

## Safety constraints
- Never create drafts directly via MCP Gmail — backend only.
- Never modify `isActiveClient`.
- Never decide `closing → active` alone — surface it and ask David.
- Never send emails or WhatsApp under any circumstance.
