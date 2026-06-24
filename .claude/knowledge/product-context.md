---
name: product-context
description: Mutable business facts about OUT/OUTRUN — clients, stage, pipeline. Not laws.
metadata:
  type: project
---

# Product Context — OUT / OUTRUN

> This file contains mutable business data.
> Law-level constraints live in `.claude/rules/axioms.md` — not here.
> Values below can change as the business evolves; update with date stamp when they do.

---

## Product Identity

**Source:** `CLAUDE.md` lines 4–6

- **Product:** OUT / OUTRUN — fitness app for calisthenics parks, targeting Israeli municipalities
- **Model:** B2G (Business-to-Government) — sold to municipal authorities
- **Users:** Municipal residents, outdoor fitness coaches, park managers
- **Owner:** David, Calisthenics Ltd — `office@appout.co.il`

---

## Clients — Business Relationship

**מאומת ע"י דוד נכון ל-22.06.2026**

> This table records the **business relationship** (signed / paying / demo), not the app flag.
> The live `isActiveClient` field in Firestore is the truth — this document only annotates it.
> If this table and Firestore ever conflict, **Firestore wins**. Update this table + date stamp when the relationship changes.

### פעילים משלמים (ערים חתומות)

| Authority | Type | Notes |
|---|---|---|
| אשקלון | עירייה משלמת | active |
| קריית ים | עירייה משלמת | active |
| שדרות | עירייה משלמת | active |

### דמו — פעיל אבל לא הכנסה

| Authority | Type | Notes |
|---|---|---|
| בית ספר רבין | לקוח דמו | פעיל במערכת; אינו עירייה משלמת — לא לספור כהכנסה |

### בתהליך סגירה (לא פעילים עדיין)

| Authority | Stage | Notes |
|---|---|---|
| הרצליה | `closing` | בתהליך — לא פעיל |
| חיפה | `closing` | בתהליך — לא פעיל |

### הוצאו מהפעילים

| Authority | Notes |
|---|---|
| תל אביב | הוסרה מהפעילים — במצב ניסיון, לא לקוח פעיל |

> Axiom for `isActiveClient` writes: `axioms.md §6` — never modify without David's written approval.

---

## Pipeline State

**מאומת ע"י דוד נכון ל-17.06.2026** (from `project-state.md` checkpoint)

- ~15 authorities in various CRM pipeline stages
- Pipeline stages: `draft → lead → meeting → quote → follow_up → closing → active → upsell`

---

## Platform Stage

**Source:** `PRODUCT_TECHNICAL_REPORT.md` line 722 + `project-state.md`

- B2G integration: partially live — access codes + admin UI working; export incomplete
- Mobile: iOS + Android via Capacitor 6
- Admin panel: Next.js 14.2, used by David + Matan Danan

---

## Team Mailboxes

**Source:** `CLAUDE.md` line 37

| Mailbox | Role |
|---|---|
| `david@appout.co.il` | Primary — David |
| `office@appout.co.il` | Office / secondary |
| `matan.danan@appout.co.il` | Matan Danan |

---

## Marketing OKR

**מאומת ע"י דוד נכון ל-17.06.2026**

- OKR locked until 16.09.2026
- KR2 (15+ saves): 18 saves on first reel ✅
- KR3 (B2G LinkedIn): 0/3 — not started
- KR4 (reels): Week 1, 0 reels published
- First 30 days strategy: library recycling — no new production

---

## Notes

- Update this file (with new date stamp) when: clients change, pipeline count changes significantly, or OKR targets are revised
- Do NOT put law-level constraints here — they belong in `axioms.md`
