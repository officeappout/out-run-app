---
name: tag-documents
description: >-
  Trigger when the user asks to tag or pull documents for an authority,
  or says: "תייג מסמכים של <רשות>", "הורד צרופות מהמיילים לדרייב",
  "עדכן מסמכים", "backfill attachments", or when documents are missing
  from CRM after a scan.
  Requires authorityId (or authority name to resolve it).
---

# tag-documents

## What this skill does
Calls `POST /api/admin/drive/backfill-attachments` for a specific authority.
The backend finds Gmail threads → downloads contract/quote/invoice/presentation
attachments → uploads to Drive → updates `documents[]` in Firestore.

## Steps

### 1 — Resolve authorityId
If the user provided a name instead of an ID:
```bash
curl -s http://localhost:3000/api/admin/authorities \
  -H "X-Agent-Key: $AGENT_API_KEY" \
  | python3 -c "
import json, sys
auths = json.load(sys.stdin)
for a in auths:
    if '<name>' in a['name']:
        print(a['id'], a['name'])
"
```
If more than one result — ask the user to confirm before continuing.

### 2 — Resolve API key
```bash
echo $AGENT_API_KEY
```
If empty, read `.env.local`. Never print the value.

### 3 — Call the API

Dry run first (recommended):
```bash
curl -s -X POST http://localhost:3000/api/admin/drive/backfill-attachments \
  -H "Content-Type: application/json" \
  -H "X-Agent-Key: $AGENT_API_KEY" \
  -d '{"authorityId": "<ID>", "dryRun": true}'
```

Real run (after user confirms):
```bash
curl -s -X POST http://localhost:3000/api/admin/drive/backfill-attachments \
  -H "Content-Type: application/json" \
  -H "X-Agent-Key: $AGENT_API_KEY" \
  -d '{"authorityId": "<ID>", "dryRun": false}'
```

### 4 — Format output

**On failure:**
```
❌ Backfill נכשל — <error>
```

**On success:**
```
📎 מסמכים — <authorityName>

✅ עלו ל-Drive: <processed>
⏭️  דולגו (כפולים / רעש): <skipped>

📁 קבצים חדשים:
<per file: • <filename> (<type>) → Drive: <driveId>>

⚠️  שגיאות: <if errors[] non-empty>
```

## Safety constraints
- Never download files directly — only via the endpoint.
- Never write to `documents[]` in Firestore directly — API only.
- Never run against multiple authorities in parallel without explicit approval.
