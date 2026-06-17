---
name: content-brief
description: >-
  Trigger when the user asks to plan content, prepare a campaign brief,
  or says: "תכנן תוכן", "brief לקמפיין", "מה לפרסם על X",
  "תכין brief", "תכנן פוסט / סרטון / קמפיין על Y".
  No external MCP required — runs immediately.
  Reads brand-voice.md before producing output.
---

# content-brief

## What this skill does
Produces a structured Hebrew content brief from three inputs:
1. **Audience** — who it's for (coaches / municipal / general public)
2. **Topic** — what the content is about
3. **Goal** — what it should achieve (awareness / lead / engagement / retention)

Reads `.claude/knowledge/brand-foundation.md` for pillar + core message alignment,
then `.claude/rules/brand-voice.md` for tone and style.

---

## Steps

### 1 — Load brand foundation
Read `.claude/knowledge/brand-foundation.md` before collecting inputs:
- Identify which pillar the requested topic belongs to
- Check anti-patterns — reject any angle that triggers one
- Note the strategic rule: accessibility enters through the specific, never as the topic

### 2 — Confirm inputs
If any of the three inputs is missing, ask before continuing:
- "לאיזה קהל? (מאמנים / רשות / ציבור כללי)"
- "על איזה נושא?"
- "מה המטרה? (מודעות / ליד / engagement / שימור)"

Also confirm brand-voice profile (from `.claude/rules/brand-voice.md`):
- `personal` — David's IG, coach audience
- `app` — OUT official, B2G / municipal audience
- If unclear, infer from audience: coaches → `personal`, municipalities → `app`

### 2 — Read brand-voice profile
Load `.claude/rules/brand-voice.md` and identify the correct profile.
Apply its tone, language rules, and format preferences to everything below.

### 3 — Produce the brief

Output in Hebrew, structured as follows:

---

```
📋 CONTENT BRIEF

נושא: <topic>
פרופיל: personal / app
קהל יעד: <specific description — not just "מאמנים" but "מאמנים עצמאיים שמלמדים calisthenics ומחפשים תוכן להדגים מיומנות">

🏛️ עמוד תוכן: <which of the 4 pillars — מסע אישי / נגישות / טכניקה / מיינדסט>
🧵 חוט מקשר: <how the core message ("נגיש לכל אחד") appears implicitly, not explicitly>

---

🎯 מטרה
<one sentence: what should the viewer/reader DO or FEEL after consuming this>

---

🪝 Hook (3 אפשרויות)
בחר אחת או שלב:
1. <hook based on a challenge or mistake the audience makes>
2. <hook based on a surprising outcome or counterintuitive insight>
3. <hook based on a specific result + timeframe>

---

📐 זווית (Angle)
<the specific lens through which this topic is approached — not "עמידת ידיים" but "למה רוב האנשים תקועים ב-wall handstand ואיך יוצאים משם">

---

📦 פורמט מומלץ
<format from brand-voice profile + rationale>
אורך: <duration/length>
פלטפורמה: <IG Reels / Carousel / LinkedIn / YouTube Shorts>

---

📢 CTA
<specific, low-friction call to action matching the goal>

---

📝 מבנה תוכן (skeleton)
<if video: opening line · 2–3 body beats · closing + CTA>
<if carousel: slide 1 hook · slide 2–5 content · last slide CTA>
<if post: opening hook · body · CTA>

---

⚠️ מה להימנע
<2–3 specific pitfalls for this topic + profile>

---

💡 זווית חלופית (אם הזווית הראשית לא מתאימה)
<one alternative angle on the same topic>
```

---

## Safety constraints
- Never publish or schedule content — brief output only.
- Never invent performance data or statistics without a source.
- If the topic touches an active municipality deal (e.g. a city in the CRM pipeline), flag it: "שים לב — <עיר> ב-pipeline פעיל. תאם עם דוד לפני פרסום."
- Brand-voice profile must always be explicitly stated in the output header.
