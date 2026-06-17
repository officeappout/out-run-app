# Project State — OUT / Calisthenics LTD
> Checkpoint: 17.06.2026 | Updated by: /checkpoint
> Max size: ~300 lines. /checkpoint rewrites this file — never append manually.

---

## 🔴 מיקוד עכשווי

ארגון-מחדש של הנאב ל-5 מרכזים הושלם (פרומט #17).
TSC רץ לאימות — ממתין לתוצאה.
הדשבורד הראשי: PeakHours הוחלף בכרטיס משפך + "בקרוב" strip.
weeklyGrowth bug תוקן (sample size guard, fallback נכון).

---

## ✅ נעשה (sessions אחרונים)

**פרומט #16 — שכבת State:**
- `project-state.md` — קובץ זה, מאותחל
- `.claude/settings.json` — hooks: SessionStart + PostCompact + PreCompact
- `/checkpoint` command
- SessionStart הוכח שעובד (headless test ✅)

**פרומט #17 — ארגון מחדש:**
- `layout.tsx` — SectionId type → 8 ערכים (strategy|crm|marketing|product|dev + 3 verticals)
- `sectionContainsPath` paths מעודכן
- `hasSec()` עם legacyMap לאחורה (platform→crm, brandComm+production→marketing, etc.)
- `platform_member sectionPathsMap` — חדש + legacy keys
- Sidebar HTML — 5 סקשנים חדשים + 3 verticals ללא שינוי
- `cpo-analytics.service.ts` — weeklyGrowth: totalSample < 3 → 0 (מונע -33% מזויף)
- `admin/page.tsx` — מחיקת PeakHours, הוספת "משפך המרות" card + "בקרוב" strip

**פרומטים 1–15 (מחלקת CRM + שיווק):**
- 8 סקילים: daily-authority-scan, tag-documents, draft-reply, content-brief,
  draft-post, video-analysis, marketing-strategy, repurpose-to-short, content-calendar,
  performance-report
- 3 agents: amit-cto, crm-agent, marketing-agent
- knowledge files: brand-foundation, marketing-goals (OKR 16.9.2026), marketing-metrics

---

## 🔑 החלטות נעולות (אל תחזור ותדון)

**Architecture:**
- `googleapis`: dynamic `await import()` בלבד — לא top-level (webpack hang)
- API routes: תמיד `requireAdminApi(request)`
- Timestamps בתוך arrays: `Timestamp.now()` — לא `serverTimestamp()`

**CRM Safety:**
- טיוטות בלבד — שליחת מייל FORBIDDEN ללא אישור דוד
- `isActiveClient`: לעולם לא לשנות (אשקלון + קריית ים = paying)
- Pipeline: forward-only; closing→active דורש אישור

**Nav restructure (פרומט #17):**
- 5 מרכזים: strategy, crm, marketing, product, dev
- audit-logs + access-codes נשארים ב-dev (לא ב-product)
- analytics → product; shortcut link מ-marketing
- legacy Firestore keys שמורים ב-hasSec() + sectionPathsMap

**Marketing:**
- 30 יום ראשונים: מיחזור ספריה — ללא ייצור חדש
- brand-foundation.md = master source לכל תוכן
- KR2 (15+ saves) — 18 saves על ריל ראשון ✅ (בדיקת 17.06)

---

## ➡️ הצעד הבא

לאמת TSC clean על layout.tsx + admin/page.tsx + cpo-analytics.service.ts.
אם clean — הענף מוכן ל-PR.

---

## 🧵 Threads פתוחים

**CRM:** עובד. אין שינויים pending.

**שיווק:**
- OKR נעול עד 16.9.2026
- KR3 (B2G LinkedIn) = 0/3 — לא התחיל
- KR4 (reels) — שבוע 1, 0 רילים פורסמו

**Sandcastles MCP:**
- `video-analysis/SKILL.md` מוכן — ממתין לחיבור
- ממתין: server URL / npm package + env var מדוד

**Code / Technical:**
- branch: `chore/track-cursoragents`
- Modified: AndroidManifest, capacitor index.html, ios pbxproj, roadmap/page.tsx,
  product-roadmap.service.ts, transcript.service.ts
- TSC status: ממתין לאימות על שינויי פרומט #17

**Phase B (עתידי):**
- הוספת vertical "שיווק" לסוגי product roadmap
- Sandcastles MCP + competitor-research skill
