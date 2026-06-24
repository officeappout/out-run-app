---
name: draft-post
description: >-
  Trigger when the user asks to write or draft a social post,
  or says: "כתוב פוסט", "נסח לי פוסט/כיתוב על X",
  "תכין פוסט ל-IG/פייסבוק", "תכתוב caption", or when following
  up from a content-brief output.
  Draft only — never publishes. Human approval required for distribution.
---

# draft-post

## What this skill does
Produces a complete Hebrew social post draft from a topic or brief,
applying the correct brand-voice profile from `.claude/rules/brand-voice.md`.

---

## Steps

### 1 — Collect inputs
Required:
- **Topic or brief** — free text, a specific angle, or the output of `content-brief`
- **Brand-voice profile** — `personal` or `app`

If profile is not specified, infer from context:
- Coach / calisthenics / practitioner audience → `personal`
- Municipality / recreation department / B2G → `app`
- If still unclear, ask: "לאיזה קהל — מאמנים (personal) או רשויות (app)?"

Optional inputs that improve output:
- Platform (`IG Reels caption / carousel / feed post / Facebook / LinkedIn`)
- Tone variant (`inspiring / educational / direct / story`)
- Any specific constraint (`max 150 chars`, `no emojis`, `include a specific stat`)

### 2 — Load brand document + voice profile
Load the brand document matching the selected profile:
- **`personal` profile** → `.claude/knowledge/brand-personal.md` (§3, §3.5, §4)
- **`app` profile** → `.claude/knowledge/brand-company.md` (§2, §3, §5)

From the brand document:
- Identify which pillar this post serves
- Check the anti-patterns section — reject any angle that triggers one
- Apply the strategic rule: the core message enters implicitly, never as the headline
- For `personal` posts: apply §3.5 B2G guardrail check before finalizing

Then read `.claude/rules/brand-voice.md` and apply the selected profile's
rules for tone, language, what to avoid, and preferred formats.
Do not mix profiles in a single post.

### 3 — Draft the post

If the input came from `content-brief`, use its hook options, angle,
format recommendation, and CTA directly — don't reinvent them.
If the input is a raw topic, generate these from scratch using the profile rules.

**Drafting rules (both profiles):**
- First line = hook. It must stand alone — a reader who stops there still gets value or curiosity.
- No preamble ("אז רציתי לשתף...", "היי חברים!") — start with the hook.
- Body: 2–4 lines maximum for short-form (Reels caption / feed). More for carousel slide text.
- CTA: one, specific, low-friction. Not "שתפו לחברים" unless that genuinely fits.
- Hashtags: 3–6 targeted, not generic (#fitness is noise). Placed at the end, never mid-text.

### 4 — Produce the draft output

```
✍️ טיוטת פוסט

פלטפורמה: <IG Reels caption / Feed / Carousel / Facebook / LinkedIn>
פרופיל: personal / app
עמוד תוכן: <personal: מסע היזמות / טיפים ותוכן אימון / מאחורי הקלעים | app: כל המרחב = חדר כושר / קהילות / משחוק / ידע ומחקר>
---

<hook line>

<body — 2–4 lines>

<CTA>

#<tag1> #<tag2> #<tag3>

---
📸 הערת ויזואל:
<one line: what visual/video should accompany this post — specific, not "תמונה יפה">

💬 אלטרנטיבה ל-hook:
"<one alternate opening line>"

⚠️  טיוטה בלבד — לא פורסם. לפרסום — העתק ידנית לפלטפורמה ואשר.
```

---

## Safety constraints
- Draft only — never post, schedule, or upload to any platform.
- Never fabricate statistics or results ("X% of users...") without a verified source.
- If the post references a municipality currently in the CRM pipeline, flag it:
  "⚠️ <עיר> ב-pipeline פעיל — תאם עם דוד לפני פרסום."
- Never mix `personal` and `app` voice in the same draft.
- If the user asks to "send" or "post" — redirect: "אני מכין טיוטה בלבד. לפרסום — העתק לפלטפורמה ואשר ידנית."
