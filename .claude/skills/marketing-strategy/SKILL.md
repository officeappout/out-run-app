---
name: marketing-strategy
description: >-
  Trigger when the user asks about marketing goals, priorities, or direction,
  or says: "מה היעדים שלי בשיווק", "המלצת יעדים", "אסטרטגיית שיווק",
  "במה להתמקד", "איפה אני עומד שיווקית", "מה לעשות קודם בשיווק".
  Reads product-context + social-state, does not invent — grounds all
  recommendations in the files and current market signals.
---

# marketing-strategy

## What this skill does
Reads the two knowledge files, applies current short-form market principles,
and produces stage-appropriate OKRs with a clear first channel to build.
No generic advice — every recommendation traces back to a file or a named principle.

---

## Steps

### 1 — Load knowledge base
Read all three files before producing any output:
- `.claude/knowledge/brand-foundation.md` — positioning, pillars, core message, promise
- `.claude/knowledge/product-context.md` — product stage, numbers, audience
- `.claude/knowledge/social-state.md` — current accounts, diagnosis, channel priority

Strategy must align with the four content pillars in `brand-foundation.md`.
OKRs should serve the brand promise, not contradict it.
If any file is missing or outdated, flag it before continuing.

### 2 — Research current market signals (optional but recommended)
If web search is available, do a quick pulse on:
- What content formats are performing in calisthenics / outdoor fitness right now
- Any recent platform algorithm shifts (IG Reels, TikTok) affecting small accounts

Ground the research — do not fabricate trends. If no search available, proceed
from `social-state.md` principles which are already embedded.

### 3 — Produce the strategy output

Output in Hebrew:

```
🎯 אסטרטגיית שיווק — OUT / <current quarter / period>

מקור: product-context.md · social-state.md · שוק נוכחי

---

📍 מיקום נוכחי
<2–3 משפטים: מה יש עכשיו, מה עובד, מה לא — מבוסס על המספרים בקבצים>

---

🏁 Objective (המטרה הרבעונית)
<one sentence: where we want to be in 90 days, specific and measurable>

---

📊 Key Results (KRs מדידים)

KR1: <metric> → מ-<baseline> ל-<target> עד <date>
KR2: <metric> → מ-<baseline> ל-<target> עד <date>
KR3: <metric> → מ-<baseline> ל-<target> עד <date>

בסיס ה-KRs: <explain why these specific metrics — tied to social-state diagnosis>

---

📱 ערוץ ראשון לבנות
**<platform + account>**

למה זה קודם:
<3 bullet points grounded in product-context + social-state, not generic>

מה עושים שם:
<format / frequency / content type — specific>

---

⏭️ ערוצים הבאים (בסדר)
1. <channel> — <when to add it and why>
2. <channel> — <when to add it and why>
3. <channel> — <when to add it and why>

---

🚫 מה לא לעשות עכשיו
<2–3 specific things to avoid — grounded in the diagnosis, not generic warnings>

---

💡 הצעד הראשון הקונקרטי
<one action, this week, that costs under 2 hours — not a plan, an action>
```

---

## Safety constraints
- Never invent follower counts, engagement rates, or market statistics.
- All numbers in the output must trace back to `product-context.md`,
  `social-state.md`, or a named web source from step 2.
- If numbers in the knowledge files seem outdated, flag it:
  "⚠️ המספרים ב-social-state.md עשויים להיות לא עדכניים — אמת לפני שמסתמכים."
- This skill produces strategy and recommendations only — no posting, scheduling,
  or publishing of any content.
