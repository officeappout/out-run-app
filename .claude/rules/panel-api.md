---
name: panel-api
description: Admin panel API routes — endpoints, auth, and usage notes
metadata:
  type: reference
---

# Panel API — Admin Routes

**Source:** `CLAUDE.md` lines 29–30 (auth pattern); routes verified by `find src/app/api/admin -name "route.ts"` on 22.06.2026

---

## Auth

Every request must include:
```
X-Agent-Key: $AGENT_API_KEY
```
Every route handler begins with `requireAdminApi(request)` — see `axioms.md §15`.

**Base URL:**
- Dev: `http://localhost:3000`
- Prod: ⚠️ unverified — confirm with David

---

## Verified Endpoints

Routes confirmed to exist on 22.06.2026:

### Authorities
| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/admin/authorities` | List all authorities |
| `PATCH` | `/api/admin/authorities/[id]` | Update authority record |

### CRM
| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/admin/crm-agent/run` | Trigger daily CRM scan |

### Drive
| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/admin/drive/backfill-attachments` | Tag/attach documents to authorities |
| `GET` | `/api/admin/drive/authority-folder` | Get Drive folder for an authority |

### Media / Bunny CDN
| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/admin/bunny/upload` | Upload video to Bunny CDN |
| `GET` | `/api/admin/bunny/status/[videoId]` | Check video processing status |

### Other Verified Routes
| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/admin/insights` | Analytics insights |
| `POST` | `/api/admin/transcripts/scan` | Scan for new transcripts |
| `POST` | `/api/admin/transcripts/process` | Process a transcript |
| `GET` | `/api/admin/exercises/export` | Export exercises |
| `POST` | `/api/admin/master-evolution-sync` | Sync master evolution data |

---

## Notes

- Routes under `seed-*` and `fix-*` are one-off data migration scripts — treat as write-once, not regular API
- `photo-release/[submissionId]` handles municipal photo consent forms
- All write operations use `getAdminDb()` from `src/lib/firebase-admin.ts`
- For social group membership writes specifically: only 2 authorized routes — see `scripts/safety-check.sh`
