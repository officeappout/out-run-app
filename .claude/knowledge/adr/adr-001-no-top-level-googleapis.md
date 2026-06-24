---
name: adr-001-no-top-level-googleapis
description: Why googleapis must use dynamic import — webpack startup hang
metadata:
  type: project
---

# ADR-001 — No Top-Level `googleapis` / `google-auth-library` Import

**Date:** ⚠️ exact date unverified — predates 17.06.2026 session  
**Status:** Decided and enforced (see `axioms.md §4`)

---

## Context

The admin panel is a Next.js 14 App Router project running on Vercel (serverless) and locally on the developer's machine. Google Workspace integrations (Gmail, Drive) require the `googleapis` and `google-auth-library` npm packages.

**Triggering event:** At some point before the earliest recorded session (17.06.2026), placing a top-level `import { google } from 'googleapis'` in an API route file caused the Next.js dev server to **hang on startup** — the process would not respond, with no error message. The exact date of the incident and the specific file that triggered it are **⚠️ unverified** — this detail is not recorded in any file; confirm with David.

**Source:** `CLAUDE.md` line 32 — "dynamic `await import('googleapis')` only — never top-level (hangs webpack on this machine)"

---

## Decision

Use **dynamic import only** for both packages:

```typescript
// ✅ Correct — inside the async function body
const { google } = await import('googleapis');
const { GoogleAuth } = await import('google-auth-library');

// ❌ Never — top-level import
import { google } from 'googleapis';
```

Applies to every file in the codebase — routes, services, scripts, agents.

---

## Consequences

- Every function that uses Google APIs must be `async`
- Cannot destructure Google types at module scope — types must be imported separately via `import type`
- Helper `getCombinedClient(email)` in `src/lib/google-service-account.ts` must also use dynamic import internally
- New engineers unfamiliar with this constraint will write top-level imports by instinct — the `code-reviewer` agent and `axioms.md §4` serve as the enforcement layer

---

## Why This File Exists

This constraint looks wrong to any developer who hasn't hit the bug. Without documented history, it will be "corrected" back to top-level import, causing the hang to reappear. This ADR exists so the next agent or engineer understands **why** — not just **what**.
