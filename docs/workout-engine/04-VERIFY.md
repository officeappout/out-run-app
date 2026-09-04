# Verification — David's Manual Tagging vs. the Live Catalog

> **Status:** read-only verification. Zero writes to Firestore. Re-ran
> `scripts/audit/exercise-catalog-audit.ts` against the live catalog on 2026-09-04
> and compared to the snapshot from `02-CATALOG-AUDIT.md`'s first run (2026-09-03).
> `scripts/audit/apply-level-triage.ts` was never run — David tagged the 12 approved
> exercises by hand, directly in Firestore, with values that in several cases differ
> from what that script proposed. This document is the ground-truth check of what he
> actually entered.

---

## Summary

| Question | Before (03-Sep audit) | Now (04-Sep, live) |
|---|---|---|
| Total exercises | 373 | **372** (−1, see §5) |
| Orphaned (no `targetPrograms` + no `programIds`) | 70 | **61** |
| CLIFF cells | 146 | **146 (unchanged)** |
| THIN cells | 88 | **88 (unchanged)** |
| Core-classified exercises missing a valid core level | 13 | **10 — see §2, this is the list David needs to see** |
| `targetPrograms` structural errors (bad `level`, unknown `programId`) | not checked | **0** |

**Bottom line:** David's manual tagging matches the intended shape closely — 8 of the 9
targeted orphaned exercises now have real levels (§1), the core ladder gained 2 new
entries with correct tagging (§2), and the catalog is structurally clean (§4). One
exercise was deleted rather than fixed, leaving a confusingly-named duplicate as the
only surviving copy with no level (§5) — worth a look. One level entry deviates
meaningfully from its exercise family (§4). Neither is a code bug; both are data items
for David's attention.

---

## §1 — Orphaned exercises: 70 → 61

9 of the original 70 left the orphaned set: 8 got real levels, 1 was deleted (not
fixed — see §5). The **61 remaining** break down exactly as follows:

| Category | Count | Status |
|---|---|---|
| **A — warmup/stretch/mobility/recovery**, legitimate, no level needed | **41** | Unchanged from `03-LEVEL-TRIAGE.md`. Still carries the separately-flagged reachability caveat (most have no `exerciseRole`/tag either — see `/admin/unreachable-exercises`, not this document's concern). |
| **B — real exercises, deliberately left unleveled** (4 "סמוך קום" burpees + 9 resistance-band exercises) | **13** | **Correctly still orphaned** — this is §12.1/§12.2's intended outcome, not a bug. David explicitly decided these should NOT get levels (burpees ≠ push progression; bands frozen, no load-tracking mechanism yet). |
| **C — unclear, needs a human call** | **7** | Unchanged: שחיין חזה, עמידת כלב רגל ויד נגדית (bird dog — see §2), (EMPTY NAME), סקוואט וכפיפת ברך לחזה, עותק של פיסטול סקוואט שלילי שמאל (see §5), פולי עליון על הריצפה עם מגבת, שכיבות סמיכה על טבעות 75. |

**41 + 13 + 7 = 61.** Every exercise in the current orphaned set is accounted for by a
known, already-documented reason — nothing new or unexplained appeared.

The **9 exercises that left the orphaned-70 set**, confirmed individually:

| Exercise | Outcome |
|---|---|
| פיסטול סקוואט שלילי שמאל | ⚠️ **Deleted from Firestore**, not leveled — see §5 |
| פיסטול סקוואט שלילי ימין | ✅ `legs=L8` |
| סקוואט בולגרי עם קפיצה על ספה | ✅ `legs=L8` |
| עליות תאומים על מדרגה | ✅ `legs=L2` |
| סקוואט כנגד קיר | ✅ `legs=L5` — see §4, deviates from family |
| סקוואט סטטי כנגד קיר | ✅ `legs=L2` |
| שכיבות סמיכה לשכמות | ✅ `push=L3` |
| אופניים | ✅ `core=L3` + tagged `movementGroup:'core'`, `primaryMuscle:'abs'` |
| עליות נגיעה בבהונות בשכיבה | ✅ `core=L5` + same tagging |

---

## §2 — ⚠️ Core-slot gate dependency: 10 exercises will still fall out

**This is the check that matters most.** For every exercise `exerciseMatchesProgram`
classifies as core, here is whether it now has a real `targetPrograms` entry resolving
to `'core'` with a valid level.

### ✅ Confirmed fixed — will pass the gate

| Exercise | Core level | Note |
|---|---|---|
| פלאנק | `core=L2` | Matches the original proposal exactly. Also has `push=L2`, `full_body=L2`, `upper_body=L2` — untouched. |
| פלאנק על הברכיים | `core=L1` | Matches proposal. Also has `push=L1` — untouched. |
| פלאנק עליות ונגיעות בכתפיים | `core=L3` | Proposal was L4 — David chose L3, a deliberate 1-level adjustment, not a data error. Also has `push=L3` — untouched. |
| אופניים | `core=L3` | Matches proposal exactly. Newly tagged `movementGroup:'core'`, `primaryMuscle:'abs'` — now correctly classified by the canonical detector, which it was NOT before. |
| עליות נגיעה בבהונות בשכיבה | `core=L5` | Matches proposal exactly. Same tagging fix as אופניים. |

### 🔴 Still missing a valid core level — WILL fall out of the core slot the moment the gate is live

| Exercise | Its real levels elsewhere | Why it's still here |
|---|---|---|
| דגל אנושי | pull=L21, push=L21, human_flag=L10 | §12.3 decision — gate the slot, not the tag. Not part of the 12-item migration; unaffected by David's manual tagging pass. |
| דגל אקצנטרי בטאק | pull=L18, push=L18, human_flag=L9 | Same |
| דגל ב-45° | pull=L13, push=L13, human_flag=L2 | Same |
| דגל בטאק | pull=L16, push=L16, human_flag=L7 | Same |
| דגל בעזרת גומייה | pull=L19, push=L19, human_flag=L9 | Same |
| דגל בפישוק | pull=L20, push=L20, human_flag=L9 | Same |
| דגל נמוך | pull=L14, push=L14, human_flag=L3 | Same |
| דגל פלאנק צידי | pull=L12, push=L12, human_flag=L1 | Same |
| שולחן הפוך | push=L1, full_body=L1, upper_body=L1, legs=L1 | Same |
| כפיפת ירך על הגבהה | legs=L4 | **This is the intended, correct outcome** — 03-LEVEL-TRIAGE.md Part 1b1 already concluded this reads as a legs/hip-flexor exercise mistagged `movementGroup:'core'`, not genuine core content. Falling out of the core slot is the fix working as designed, not a gap. |

**9 of these 10 are the flag exercises** — exactly the set the gate was built for
(`00-PLAN.md` §12.3). This is expected, not a regression: the gate (code, already
committed) and a decision on the flags' core classification (data, still open) are two
separate things. The gate doesn't fail here — it's correctly waiting on a decision
that hasn't been made yet. The 10th (כפיפת ירך) falling out is the fix doing exactly
what it was designed to do.

**עמידת כלב רגל ויד נגדית (bird dog) was not touched at all** — still has no
`movementGroup`, no `primaryMuscle`, no `targetPrograms`, no `programIds`. It doesn't
even reach this table via the canonical core detector today (it's not classified as
core at all, for the same reason it was flagged as a 3rd core-detector miss in
`03-LEVEL-TRIAGE.md`). One more thing worth flagging: its raw document has `draft:
true` (a literal boolean) — see §5's note on the `draft` field; most exercises instead
carry `draft` as an object (an editor autosave snapshot). This might mean bird dog is
intentionally still unpublished content, separate from the level question. Worth
confirming with David rather than assuming either way.

---

## §3 — Coverage matrix: 146 CLIFF / 88 THIN, unchanged, and why that's expected

Re-ran the full `programId × level × location` matrix. Totals are **identical** to the
03-Sep snapshot, and — checked, not assumed — the *composition* is identical too:

| Program | CLIFF cells | THIN cells |
|---|---|---|
| `human_flag` | 59 | 11 |
| `handstand` | 56 | 14 |
| `handstand_pushup` | 24 | 29 |
| `core` | 7 | 12 |
| `muscle_up` | 0 | 21 |
| `planche` | 0 | 1 |

**Byte-for-byte the same as the original audit.** This is expected: David's edits were
all in `legs` (5), `push` (1), and `core` at levels 1-5 — domains/ranges that were
already healthy (0 CLIFF cells in `legs`/`push` at any level; `core`'s only CLIFF cells
are at L18, the far edge of that ladder, untouched by additions at L1-L5). Checked
directly: `core` domain, levels 1-6, all locations — every cell is `OK` with 15-30
exercises within tolerance, both before and after. The new entries landed in an
already-robust part of the ladder; they didn't need to rescue anything, and nothing
elsewhere regressed.

**handstand L1 remains the single largest hole in the matrix** (0 exercises, all 7
locations) — unchanged, still open, still not this task's scope.

---

## §4 — Data-entry check: structural errors and family-deviation outliers

**Structural errors: zero.** Checked every `targetPrograms` entry in the catalog
(not just the 12 David touched) for: missing `level` field, non-numeric `level`,
`level <= 0`, and `programId` values that resolve to neither a real `programs`
collection document nor a known slug. **None found.** David's manual edits are
clean at the schema level.

**Family-deviation check** (the task's own threshold: >4 levels from comparable
exercises) — compared each of the 8 leveled exercises against the same real
comparables cited in the original proposal:

| Exercise | David's level | Family baseline | Deviation |
|---|---|---|---|
| סקוואט כנגד קיר | **L5** | L1 (matches "סקוואט בעזרת רצועות" L1, "לאנג׳ קדמי" L1 — the catalog's beginner-support-variant tier) | **4 levels** — at the flag threshold, worth a second look |
| סקוואט סטטי כנגד קיר | L2 | L1 (same family) | 1 level — unremarkable on its own |
| All 6 others | within 0-1 level of their cited comparable | — | none |

**Flagging, not asserting an error:** a wall-supported squat at L5 is a real jump from
the L1 tier every other supported/assisted-variant exercise in the `legs` catalog sits
at (per the pistol-squat family data in `03-LEVEL-TRIAGE.md`). It's possible David has
a specific reason (e.g. a stricter movement standard than the proposal assumed) — this
is exactly the kind of judgment call a human review is for. Also worth noting: **the
two wall-squat variants (כנגד קיר / סטטי כנגד קיר) are now 3 levels apart** (L5 vs L2)
despite being near-identical positions (one dynamic, one held) — the original proposal
expected them to match. Neither is presented as wrong here — both are surfaced for
David's own judgment, per the read-only scope of this check.

---

## §5 — Two things found that weren't asked for, surfaced anyway

**1. "פיסטול סקוואט שלילי שמאל" was deleted, not fixed — and its confusingly-named
duplicate survives, still unleveled.**

The original, cleanly-named document (`5LhNqpOowBF268tFTDz7`) no longer exists in the
`exercises` collection — confirmed via direct lookup and a full-catalog name search,
not just a missing ID. The known duplicate flagged in `03-LEVEL-TRIAGE.md` Part 1c —
`"עותק של פיסטול סקוואט שלילי שמאל"` (`sgrEdIolfxaRCgz8Oqyp`) — **still exists, still
has empty `targetPrograms`**. Net effect: the left-side negative-pistol-squat exercise
is now *worse off* than before this pass started — if it's ever the only surviving
copy that gets a level in the future, it'll carry the "עותק של" (copy of) prefix in
its user-facing name. This reads like the wrong half of a duplicate pair got deleted.
Not fixed here (read-only scope) — flagged for David's own cleanup decision, exactly
like the other Part 1c junk records.

**2. The `draft` field is not what it might look like, and is worth knowing about.**

Investigated because bird dog's raw document had `draft: true`, which stood out. Across
the full catalog: 307 exercises have `draft` as an **object** (`{data: {...a full
snapshot of the exercise...}, savedAt: <timestamp>}` — reads like an editor autosave
buffer, not a publish-state flag), 51 have `draft` as a **literal `true`**, and 14 have
no `draft` field at all. This wasn't part of any prior audit and its exact semantics
weren't investigated further (out of scope for this check) — but it means "is this
exercise live" may have a dimension beyond everything audited so far (level, role/tag,
execution methods, location coverage). Surfaced here rather than silently noticed and
dropped; not chased further since it's outside what this verification pass was asked
to check.

---

## Methodology

- `scripts/audit/exercise-catalog-audit.ts` re-run against live Firestore on 2026-09-04
  (regenerates `02-CATALOG-AUDIT.md` + the two CSVs in place — this document is the
  before/after comparison layered on top, not a replacement for those files).
- §1/§2/§4/§5 used three small, read-only, throwaway investigative scripts (not
  committed — matches the pattern used for `03-LEVEL-TRIAGE.md`'s own research) that
  import nothing from this repo's source beyond the `programs`/`exercises` Firestore
  reads themselves; the core-classification check is a verbatim port of
  `exerciseMatchesProgram`'s `'core'` branch (`shadow-level.utils.ts:213-227`), matching
  what `exercise-catalog-audit.ts` and the live `hasExplicitCoreLevel` gate both use.
- Zero writes anywhere in this pass. Zero use of `scripts/audit/apply-level-triage.ts`
  (now marked unused, see its file header).
