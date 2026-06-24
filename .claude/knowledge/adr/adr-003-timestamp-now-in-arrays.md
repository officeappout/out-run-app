---
name: adr-003-timestamp-now-in-arrays
description: Why array elements use Timestamp.now() not serverTimestamp() — Firestore SDK limitation
metadata:
  type: project
---

# ADR-003 — `Timestamp.now()` Inside Array Elements (Not `serverTimestamp()`)

**Date:** ⚠️ exact date unverified — predates 17.06.2026 session  
**Status:** Decided and enforced (see `axioms.md §5`)

---

## Context

The OUT Firestore data model stores activity logs, notes, meeting records, and status history as **arrays of objects** inside authority documents. Each entry in these arrays needs a timestamp.

The instinctive Firestore pattern is `FieldValue.serverTimestamp()` — it's consistent, server-controlled, and timezone-safe. However:

**Firestore SDK limitation:** `FieldValue.serverTimestamp()` is a sentinel value that Firestore resolves **at the document root level only**. When used inside an array element object, the SDK either throws an error or silently stores it as `null`.

**Triggering event:** ⚠️ Not recorded with an exact date or commit. Based on `CLAUDE.md` lines 47–48 explicitly calling this out, a developer (or agent) used `serverTimestamp()` inside an array write and the timestamps were corrupted — stored as `null` — with no obvious error. The bug would have been silent: writes succeed, but timestamps disappear. Confirm exact incident with David.

**Presence bug (22.06.2026):** The group-scope presence model (Block 0–4, `chore/track-cursoragents` branch) involves writing timestamps into Firestore arrays. The fix applied on 22.06.2026 included ensuring `Timestamp.now()` was used inside array elements. This is the most recent known instance where this rule was load-bearing.

**Source:** `CLAUDE.md` lines 47–48

---

## Decision

| Location | Timestamp method |
|---|---|
| Array element object (e.g., `activityLog`, `notes`, `history`) | `Timestamp.now()` from `firebase-admin/firestore` |
| Document root field (e.g., `updatedAt`) | `FieldValue.serverTimestamp()` |

```typescript
// ✅ Correct — array element
import { Timestamp } from 'firebase-admin/firestore';

await db.doc(`authorities/${id}`).update({
  notes: FieldValue.arrayUnion({
    text: 'Meeting confirmed',
    createdAt: Timestamp.now(),   // ← Timestamp.now() inside array
  }),
  updatedAt: FieldValue.serverTimestamp(),  // ← serverTimestamp() at doc root
});

// ❌ Silent bug — serverTimestamp() inside array element stores as null
notes: FieldValue.arrayUnion({
  text: 'Meeting confirmed',
  createdAt: FieldValue.serverTimestamp(),  // ← DO NOT DO THIS
})
```

---

## Consequences

- `Timestamp.now()` is client-side — it uses the server process clock, not Firestore's atomic server timestamp
- Skew is acceptable for activity logs and notes (milliseconds off is fine)
- `Timestamp.now()` is NOT acceptable for billing events or legal records — those should not be stored as array elements at all
- `code-reviewer` checks for `serverTimestamp()` inside array writes as a blocking violation

---

## Why This File Exists

`serverTimestamp()` inside arrays is a well-known Firestore gotcha, but it fails silently — the write succeeds and no error is thrown. Every new engineer and every agent will write it the "obvious" way. This ADR records the bug, the fix, and the rule so it doesn't have to be rediscovered.
