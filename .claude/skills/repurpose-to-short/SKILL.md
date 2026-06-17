---
name: repurpose-to-short
description: >-
  Trigger when the user wants to extract Reels from a long video,
  or says: "מחזר את הסרטון לרילים", "תחתוך ריל מהסרטון הזה",
  "תהפוך את הסרטון ל-short-form", "מה אפשר לחתוך מהסרטון הזה",
  or shares a YouTube / video URL with existing footage to repurpose.
  Produces concepts and captions only — never publishes.
---

# repurpose-to-short

## What this skill does
Takes a long-form video (URL + user-provided moments) and produces
3–5 ready-to-edit Reel concepts: clip instruction, hook, caption, CTA,
hashtags, and visual note. Grounded in `.claude/knowledge/social-state.md`
principles (hook on the impressive moment, optimize for Saves, 15–45s).

Default brand-voice profile: `personal`. Override if user specifies `app`.

---

## Steps

### 1 — Collect inputs
Required:
- **Video source** — URL or title of the long-form video
- **Moments** — user-provided timestamps or descriptions of key moments
  (e.g. "00:42 — מגיע ל-front lever", "01:15 — נופל ומסביר למה")

If no moments are provided, ask:
"שתף 3–5 רגעים מהסרטון — חותמות זמן או תיאור קצר של מה קורה בכל אחד."

Note: automatic moment detection will be added when a video transcription
tool is available. Until then, moments come from the user.

Optional:
- Platform target (default: IG Reels; also TikTok if mentioned)
- Brand-voice profile (default: `personal`)

### 2 — Load principles
Read `.claude/knowledge/brand-foundation.md` — specifically:
- Which pillar each moment belongs to (מסע אישי / נגישות / טכניקה / מיינדסט)
- Anti-patterns to avoid in hooks and captions
- Strategic rule: accessibility through the specific, not as the topic

Then read `.claude/knowledge/social-state.md` — specifically:
- "Hook on the impressive moment — not on the explanation"
- "15–45s drives discovery"
- "Saves and DM-shares are the strong signal"
- "No new production required — only reformat"

Apply these as hard constraints on every concept produced.

### 3 — Produce Reel concepts

For each moment (3–5 total), output one concept block:

```
🎬 ריל <N> — <one-line title for this concept>

✂️ קליפ לחתוך:
<timestamp or description — start → end, approx duration>
טיפ עריכה: <one specific edit note — jump cut / slow-mo / freeze frame / caption overlay>

🏛️ עמוד: <מסע אישי / נגישות / טכניקה / מיינדסט>

🪝 Hook (שנייה 0–3):
"<exact first line — the impressive moment itself, not setup>"
⚠️ לא להתחיל בהסבר — הרגע קודם

📝 Caption (פרופיל: personal):
<2–4 lines. Opens with the hook line. Body = one tight insight.
No "היי חברים", no filler. Ends with CTA.>

📢 CTA: <one specific, low-friction action>
(שמור / שתף למישהו שנתקע / ספר לי בתגובות / ...)

#<tag1> #<tag2> #<tag3> #<tag4>

📸 הערת ויזואל:
<one concrete instruction — angle, overlay text, pacing note>
```

After all concepts, add:

```
---
➡️ צעד הבא
לנסח caption מורחב לריל הכי חזק — הרץ:
draft-post: "<concept title>", פרופיל personal
```

---

## Hook writing rules (apply to every concept)

- Second 0–3 = the peak moment already happening, not the intro to it
- No "בסרטון הזה אני מראה" — start mid-action
- No question hooks ("האם ידעתם ש...") — statement or action only
- The viewer who stops at second 3 still experienced something real
- Test: could this hook exist as a standalone 3-second clip with no context? If yes — use it.

---

## Safety constraints
- Concepts and captions only — never upload, post, or schedule anything.
- Never suggest copying another creator's hook verbatim — structural inspiration only.
- If the source video belongs to someone else (not David's content), flag it:
  "⚠️ זה לא תוכן של דוד — ודא שיש הרשאה לפני שימוש."
- All output defaults to `personal` brand-voice unless explicitly overridden.
