---
name: draft-reply
description: >-
  Trigger when the user asks to compose a reply or response to an authority,
  or says: "נסח טיוטת תשובה ל-<רשות>", "כתוב מייל ל-<רשות>",
  "תכין טיוטה", "נסח תגובה לרשות X".
  Creates a DRAFT only via backend — never sends under any circumstance.
---

# draft-reply

## ⚠️ Absolute safety rule

**Draft only. Never sends.**

This skill composes a draft for human review — David sends it manually via Gmail.
Any attempt to send (MCP / curl / any method) is strictly forbidden.

```
FORBIDDEN:  gmail.users.messages.send()
FORBIDDEN:  mcp__claude_ai_Gmail__create_draft  (direct — deny rule in settings)
ALLOWED:    PATCH /api/admin/authorities/[id]   (log the draft as an activity)
```

---

## What this skill does
1. Fetches the relevant thread context (via MCP read or user input).
2. Composes a Hebrew B2G reply.
3. Explains the reasoning.
4. Asks user to confirm before logging to activityLog.
5. **Prints the draft for human approval — does not send.**

---

## Steps

### 1 — Identify authority and thread
If authorityId is not provided:
```bash
curl -s http://localhost:3000/api/admin/authorities \
  -H "X-Agent-Key: $AGENT_API_KEY" \
  | python3 -c "
import json, sys
auths = json.load(sys.stdin)
for a in auths:
    if '<name>' in a['name']:
        print(a['id'], a['name'], a.get('pipelineStatus'))
"
```

If a threadId is available, read it with:
`mcp__claude_ai_Gmail__get_thread` — allowed (read-only).

### 2 — Compose the draft

**Hebrew B2G style guide:**
- Opening: `לכבוד [name/title],`
- Body: 2–3 short paragraphs, professional and direct
- No archaic phrasing: avoid "מקווה כי", "הנדון", "לידיעתכם הנכבדה"
- Do mention: proposal number / project name / last touchpoint if relevant
- Closing: `בברכה, [name] \ Calisthenics LTD`

### 3 — Present for approval

Always display before any action:

```
✉️ טיוטת תשובה — <authorityName>

נושא: Re: <subject>
אל: <contact email>

---
<draft body in Hebrew>
---

💡 נימוק: <why this reply fits the current <pipelineStatus> stage>

⚠️  הטיוטה לא נשלחה. לשליחה — פתח Gmail ואשר ידנית.

האם לרשום את הטיוטה ב-activityLog של הרשות? (כן/לא)
```

### 4 — Log to activityLog (only after explicit approval)

```bash
curl -s -X PATCH http://localhost:3000/api/admin/authorities/<authorityId> \
  -H "Content-Type: application/json" \
  -H "X-Agent-Key: $AGENT_API_KEY" \
  -d '{
    "addActivity": {
      "type": "note",
      "summary": "טיוטת תשובה נוסחה ידנית — ממתינה לשליחה אנושית",
      "createdBy": "draft-reply-skill"
    }
  }'
```

## Safety constraints
- `messages.send()` — forbidden, no exceptions.
- `mcp__claude_ai_Gmail__create_draft` directly — forbidden (deny rule enforced in settings).
- WhatsApp — forbidden.
- `closing → active` pipeline advance — forbidden without David's explicit approval.
- Replying to a personal thread (no identifiable government authority) — forbidden.
