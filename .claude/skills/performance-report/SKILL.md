---
name: performance-report
description: >-
  Trigger when the user reports metrics or asks about marketing performance,
  or says: "דוח ביצועים שיווק", "איך הולך מול היעד", "עדכן מדדים",
  "כמה עוקבים יש לי", "מה הסטטוס של ה-KRs", "תעדכן את המדדים".
  Logs new data, compares to OKRs, and returns a grounded status report.
  Read and report only — never posts or publishes anything.
---

# performance-report

## What this skill does
1. Accepts user-provided metrics (followers, Saves, Reels published, B2G calls)
2. Appends them to `marketing-metrics.md` (the rolling log)
3. Compares current state to `marketing-goals.md` (the locked OKRs)
4. Returns a Hebrew status report: % to goal · on-track / behind · trend · recommendation

---

## Steps

### 1 — Load OKRs and current log
Read both files before doing anything:
- `.claude/knowledge/marketing-goals.md` — locked targets and baselines
- `.claude/knowledge/marketing-metrics.md` — rolling log of past data points

### 2 — Collect new data from user
Accept any subset of:
- **Followers** (`@david.move26` current count)
- **Saves** (per Reel, ideally 48h after publish — include topic/title)
- **Reels published this week** (count)
- **B2G calls booked** (count + source if known)

If the user provides partial data, log what's available and flag what's missing:
"לא קיבלתי נתון על <מדד> — אוסיף בדוח הבא."

### 3 — Append to marketing-metrics.md

Update the relevant table(s) in `.claude/knowledge/marketing-metrics.md`.
Use today's date (from context or ask user to confirm).
Never overwrite existing rows — append only.

Format for each table — follow the existing column structure exactly.

### 4 — Calculate progress

For each KR:

**KR1 (עוקבים):**
```
progress = (current - baseline) / (target - baseline) × 100
days_elapsed / days_total → pace needed vs. pace actual
```

**KR2 (Saves/Reel):**
```
last_reel_saves vs. 15 target
rolling_average (last 3 reels) if available
```

**KR3 (B2G שיחות):**
```
count vs. 3 target
deadline: 16.09.2026
```

**KR4 (Reels/week):**
```
this_week_count vs. 4 target
```

### 5 — Produce the report

Output in Hebrew:

```
📊 דוח ביצועים שיווקי — <date>

---

🎯 סטטוס KRs

KR1 — עוקבים @david.move26
  נוכחי: <N> | יעד: 4,000 | Baseline: 2,176
  התקדמות: <X>% מהדרך | <on-track ✅ / מאחור ⚠️ / בסכנה 🔴>
  קצב נדרש: +<N> עוקבים/שבוע עד 01.09 | קצב בפועל: +<N>/שבוע
  <מגמה אם יש נתונים קודמים>

KR2 — Saves/Reel
  ריל אחרון: <title> → <N> Saves | יעד: 15+
  ממוצע (3 רילים אחרונים): <N> | <on-track ✅ / מאחור ⚠️>

KR3 — שיחות B2G
  בוצעו: <N>/3 | נותרו: <X> שיחות | ימים לדדליין: <N>
  <on-track ✅ / מאחור ⚠️ / לא התחיל 🔴>

KR4 — Reels שפורסמו
  שבוע זה: <N>/4 | <on-track ✅ / מאחור ⚠️>

---

📈 מגמה
<2–3 משפטים: מה עובד, מה לא, מה השתנה מהדוח הקודם>

---

💡 המלצת התאמה
<אחת עד שתיים המלצות ספציפיות — לא גנריות>
<מבוסס על הפער הגדול ביותר מהיעד>

---

⚠️ מדדים חסרים לדוח הבא
<list of what wasn't reported this time>
```

### 6 — Optional: pull UTM install data
If the user asks for install data, query the panel:
```bash
curl -s http://localhost:3000/api/admin/analytics/utm \
  -H "X-Agent-Key: $AGENT_API_KEY"
```
Only if this endpoint exists — do not fabricate data if it 404s.
Report installs by source (organic / IG / TikTok) if available.

---

## Safety constraints
- Append only to `marketing-metrics.md` — never delete or overwrite rows.
- Never invent metrics. If a number wasn't provided, mark it as `—` in the log.
- Report and recommend only — never post, schedule, or act on social platforms.
- If goals in `marketing-goals.md` seem outdated, flag it but do not edit them:
  "⚠️ היעדים נעולים — לעדכון יש לאשר עם דוד ולערוך את marketing-goals.md ידנית."
