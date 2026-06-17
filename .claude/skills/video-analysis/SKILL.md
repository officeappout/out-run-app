---
name: video-analysis
description: >-
  Trigger when the user shares a video URL and asks for analysis,
  or says: "נתח את הסרטון הזה", "מה ה-hook של", "פרק לי את הסרטון",
  "נתח לי את זה", or pastes an Instagram / TikTok / YouTube URL.
  Requires Sandcastles MCP to be connected (see .mcp.json).
  Analysis only — never publishes anything.
---

# video-analysis

## What this skill does
Calls Sandcastles `/analyze` on a given URL, then adds a strategic
"מה לשאוב לאאוט" layer — how to adapt the structure for an Israeli
calisthenics context. References `content-brief` skill for next steps.

## Prerequisites
- Sandcastles MCP must be connected in `.mcp.json`
- Tool available: `mcp__sandcastles__analyze` (or equivalent per server config)

---

## Steps

### 1 — Extract and validate URL
Accept URL from:
- Direct paste in user message
- `/analyze <url>` format
- "נתח את הסרטון הזה: <url>"

Supported platforms: Instagram Reels, TikTok, YouTube (Shorts or full).
If no URL provided, ask: "שתף את ה-URL של הסרטון שתרצה שאנתח."

### 2 — Call Sandcastles /analyze
```
tool: mcp__sandcastles__analyze
input: { "url": "<video_url>" }
```

If the tool returns an error or is unavailable:
```
⚠️ Sandcastles לא מחובר או ה-URL לא נתמך.
ודא ש-.mcp.json מוגדר ו-SANDCASTLES_API_KEY קיים ב-.env.local
```

### 3 — Parse the response
Extract from the Sandcastles result:
- `transcript` or `captions` — full text of what's said/shown
- `hook` — opening line or first 3 seconds
- `format` — content type (tutorial / story / reaction / POV / etc.)
- `duration` — total length
- `structure` — identified beats or sections
- `visual_layout` — b-roll, text overlays, talking-head ratio, pacing

If fields are missing, infer them from the transcript.

### 4 — Produce the breakdown

Output in Hebrew:

```
🎬 ניתוח סרטון

מקור: <platform> | <creator handle if available>
אורך: <duration>
פורמט: <format type>

---

🪝 Hook (0–3 שניות)
"<exact opening line or action>"
מה שעובד: <why this hook works — specific, not generic>

---

📐 מבנה סטוריטלינג
<beat 1 — timestamp: what happens>
<beat 2 — timestamp: what happens>
<beat 3 — timestamp: what happens>
...
סיום: <how it closes — CTA / cliffhanger / punchline>

---

🖼️ Visual Layout
• מצלמה: <talking head / b-roll / screen record / mixed>
• טקסט על מסך: <yes/no — how much, style>
• קצב עריכה: <cuts per 10 seconds, approximate>
• מוזיקה: <background / trending / original audio>

---

📊 מה עובד כאן
<3 specific elements that make this video effective — tied to real observations>

---

🇮🇱 מה לשאוב לאאוט

**מבנה לשכפול:**
<restate the storytelling structure in generic terms>

**Hook מותאם לישראל / כלי-גוף:**
"<suggested hook in Hebrew using the same structural pattern>"

**שינויים הכרחיים:**
- <what doesn't translate culturally and why>
- <what needs to be replaced for Israeli / B2G / calisthenics context>

**פורמט מומלץ:**
<platform + length + ratio recommendation for the OUT context>

---

➡️ צעד הבא
לייצר brief מלא מהניתוח הזה — הרץ:
`content-brief: נושא "<topic from video>", קהל <inferred>, זווית "<angle from analysis>"`
```

---

## Safety constraints
- Analysis only — never download, store, or redistribute video content.
- Never impersonate the original creator or claim the content as original.
- If the video belongs to a direct competitor in the Israeli market, add a note:
  "⚠️ זהו ערוץ מתחרה ישיר — שקול את הניתוח בהתאם."
- Never suggest copying content verbatim — structural inspiration only.
