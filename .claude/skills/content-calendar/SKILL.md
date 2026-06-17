---
name: content-calendar
description: >-
  Trigger when the user asks to plan a week or month of content,
  or says: "תכנן לי תוכן לשבוע/חודש", "לוח תוכן", "מה לפרסם השבוע",
  "תכנן את השבוע שיווקית", "לוח פרסומים".
  Planning only — never publishes. Each slot links to repurpose-to-short
  or content-brief for execution.
---

# content-calendar

## What this skill does
Produces a weekly (or monthly) content plan grounded in `social-state.md`
priorities and `marketing-strategy` goals. Each slot includes: day, channel,
format, angle, source material to repurpose, and status. Links each slot
to the execution skill that should run next.

---

## Steps

### 1 — Load knowledge
Read before producing any output:
- `.claude/knowledge/brand-foundation.md` — pillars, core message, anti-patterns
- `.claude/knowledge/social-state.md` — channel priority, cadence, principles
- `.claude/knowledge/product-context.md` — stage, audience segments

Each slot's angle must map to one of the four content pillars from `brand-foundation.md`.
Label each slot with its pillar (מסע אישי / נגישות / טכניקה / מיינדסט).

If `marketing-strategy` output exists in this session, use its OKRs
to align slot topics. If not, apply defaults from `social-state.md`.

### 2 — Confirm inputs
- **Period:** week (default) or month
- **Brand-voice profile:** `personal` (default) or `app`
- **Constraint:** any topic to include or avoid this period

If not provided, proceed with defaults: 4 Reels/week on `@david.move26`,
personal profile, no new production — repurpose only.

### 3 — Apply cadence rules (from social-state.md)

Hard constraints for weeks 1–4 (no-new-production phase):
- **4 slots/week** on `@david.move26` IG Reels
- **0 new production** — every slot must come from existing library
  (YouTube videos, past IG posts, raw footage)
- **1 LinkedIn post/week** — only if a B2G milestone happened that week
- **Source types to recycle:** YouTube long-form → Reels moments,
  past IG carousels → Reels with voiceover, raw training clips

Topic mix per week (balanced, not monotone):
- 2 × skill/technique (e.g. handstand, front lever, muscle-up progression)
- 1 × failure/process (authentic moment — fall, struggle, breakthrough)
- 1 × insight/opinion (something the audience does wrong, or a counterintuitive take)

### 4 — Produce the calendar

Output in Hebrew:

```
📅 לוח תוכן — <period: שבוע DD/MM – DD/MM / חודש MM/YYYY>

פרופיל: personal | ערוץ ראשי: @david.move26
עיקרון: אין ייצור חדש — מחזור בלבד

---

יום א׳ | <date>
📱 ערוץ: IG Reels — @david.move26
🎬 פורמט: Reel 20–35s
🎯 זווית: "<specific angle — not just topic, but the hook angle>"
📦 מקור: <which video / type of existing footage to pull from>
🪝 Hook כיוון: "<suggested opening line>"
⚙️ ביצוע: repurpose-to-short
🔲 סטטוס: לתכנון

---

יום ב׳ | <date>
📱 ערוץ: IG Reels — @david.move26
🎬 פורמט: Reel 15–30s
🎯 זווית: "<angle>"
📦 מקור: <source>
🪝 Hook כיוון: "<suggested opening line>"
⚙️ ביצוע: repurpose-to-short
🔲 סטטוס: לתכנון

---

[repeat for all slots — 4–5 per week]

---

📌 LinkedIn (רק אם יש אבן דרך B2G השבוע)
📱 ערוץ: LinkedIn — david-movshovich
🎬 פורמט: פוסט טקסט, 150–250 מילים
🎯 זווית: <milestone + outcome, not product pitch>
⚙️ ביצוע: draft-post (פרופיל app)
🔲 סטטוס: לבדיקה עם דוד

---

⚡ צעד ביצוע לכל סלוט:
לכל Reel שרוצים להפיק — הרץ:
repurpose-to-short: "<video source>", רגעים: [<describe key moments>]

לכל פוסט מקורי (ללא מקור וידאו) — הרץ:
content-brief: "<angle>", קהל personal, מטרה engagement
```

---

## Monthly view (if user requests a month)
Produce 4 weekly blocks in the same format, with a summary line at the top:
```
📊 סה"כ החודש: <N> Reels · <N> LinkedIn · <N> ניסיונות חדשים (שבוע 4+)
```
Mark week 4 slots as `🧪 אפשר לנסות ייצור חדש` if the repurpose phase is working.

---

## Safety constraints
- Planning only — no posting, scheduling, or uploading to any platform.
- Every slot must have a named source (existing video or footage type).
  Slots with "תוכן חדש" as source are only valid from week 5 onwards.
- Do not plan LinkedIn posts without a real B2G event to anchor them.
- End the calendar with: "לביצוע — הרץ repurpose-to-short לכל סלוט לפי הסדר."
