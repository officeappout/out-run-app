# Adaptive Schedule + Rest/Return Experience — Existing-State Map

> ⚠️ **PARKED FEATURE — לחזור אליו בהמשך.** זהו קובץ מיפוי read-only (חקירה מ-22.07.2026), **לא** תוכנית ביצוע פעילה. אין לבנות כלום מכאן בלי אישור מפורש מדוד. **ההחלטה הפתוחה (§ החלטה פתוחה) הוכרעה ב-02.09.2026 — כבר לא חוסמת** — אבל שלב 2 עצמו עדיין לא אושר-לביצוע, רק כיוונו.
>
> **עיקרון-על:** התשתית ברובה כבר קיימת ומפוזרת. הפיצ'ר = **איחוד + חיווט**, לא בנייה מאפס. אסור לשכפל את 6 מערכות ההודעות הקיימות.
>
> **מקור:** ארבע חקירות Explore (מנוע לו"ז / SHOW_MISSED_DAYS_PROMPTS / כפתור "עוד אימון" + יום מנוחה / כפילויות). כל file:line אומת בחקירה. מספרי שורות = pre-build; לאמת מחדש לפני נגיעה.

---

## הבעיה (למה בכלל)
תוכנית אימון היא על **מרווחי-התאוששות, לא ימי-לוח קבועים**. משתמש שפספס → ה"מנוחה" חסרת משמעות. הכי קריטי לשימור: מי שחוזר אחרי היעדרות ורואה "היום מנוחה, בוא מחר" → **נוטש**. צריך שינחת על אימון.

---

## 1. מנוע הלו"ז — תבנית קבועה, לא מסתגל. אין shift.

**שלוש שכבות לו"ז נפרדות:**

| שכבה | קבצים | תפקיד | מודע ל-completion? |
|---|---|---|---|
| **A. מנוע spec (תבנית קבועה)** | `src/features/schedule/engine/scheduleRules.ts`, `src/features/schedule/types/smartSchedule.types.ts` | בונה שלד שבועי ב-onboarding | ❌ לא |
| **B. רצועת השבוע ב-home** | `src/features/home/components/SmartWeeklySchedule.tsx`, `src/features/home/hooks/useSmartSchedule.ts` | מרנדר את השבוע, צובע ימים לפי סטטוס | ⚠️ קורא completion **לצביעה בלבד** |
| **C. לו"ז UTS ב-Firestore** | `userSchedule.service.ts`, `RollingAgenda.tsx`, `AgendaDayCard.tsx`, `schedule.types.ts` (תחת `src/features/user/scheduling/`) | entries לפי תאריך + drag/drop ידני | ❌ לא (ידני בלבד) |

- **חישוב הפריסה:** `buildDefaultTemplate()` — `scheduleRules.ts:243`. בחירת ימים מלוקאפ **קשיח** `SCHEDULE_POLICY.PREFERRED_DAYS` — `smartSchedule.types.ts:172`: `2:[0,3] 3:[0,2,4] 4:[0,1,3,4] 5:[0,1,2,3,4] 6:[0,1,2,3,4,5]` (א'=0…שבת=6, שבת לא מוקצית). נשמר ב-`lifestyle.scheduleDays` + `lifestyle.recurringTemplate` ב-onboarding (`ScheduleStep.tsx`). הפריסה נגזרת תמיד מהשדות הסטטיים — לא מפעילות בפועל.
- **completion (S8/S10):** נקרא **רק לצביעת סטטוס**. S8 = `dailyProgress/{uid}_{iso}.workoutCompleted` (להבת עבר). S10 = טבעת פעילות (`activityView`). לא משנה layout, לא מזיז.
- **"Cross-Day Debt Clearing"** — `SmartWeeklySchedule.tsx:1001` — משלים ביום מנוחה מדליק `debtCleared` על יום שהוחמץ. **ויזואלי בלבד** (streak/להבה), לא מזיז/יוצר אימון.
- **Shift logic:**
  1. מנוע "Rolling Week Window" של ה-spec (§8) — **לא מומש**. types קיימים (`RollingWindowProposal { missedSession, proposedDay, shiftedSessions }` — `smartSchedule.types.ts:84`) אבל grep מאשר **dead types**, אף פונקציה לא מחשבת shift.
  2. drag-and-drop ידני — היחיד שקיים. `moveScheduleEntry()` / `updateScheduleDays()`. entry בודד, **בלי cascade**, לא מופעל ע"י פספוס.
- **שורה תחתונה:** יום שהוחמץ **מטופל בשקט כמנוחה** — `home/page.tsx:353` ("a missed day is treated as a rest day, not a failure"). אין slide/rollover/catch-up אוטומטי. (⇒ ה-catch-up-block של ה-spec כבר de-facto מיושם.)

---

## 2. `SHOW_MISSED_DAYS_PROMPTS` — מה מציג, ולמה הקופי לא התאים

- **הגדרה:** `feature-flags.ts:53` — `= false`, compile-time, **אין override בפרוד** → כבוי. הלוגיקה (`daysInactive`, periodization) רצה; רק התצוגה חסומה.
- **חוסם 2 באנרים:**
  - **A — אדום "חזרה לפעילות", ראש /home:** `home/page.tsx:1129`. קופי מ-`useSmartMessage('re_engagement')`. טריגר `calculateDaysInactive(profile) >= 4` (`home/page.tsx:347`). הטריגר הישן "פספסת אתמול" (Condition C) **הוסר**.
  - **B — סגול "coach cue", StatsOverview:** `StatsOverview.tsx:1154`. קופי מ-`periodization.service.ts` (deload/peak/gap).
- **⚠️ באנר שלישי לא-חסום וחי בפרוד:** `MissedWorkoutBanner` (מצב ריצה) — `StatsOverview.tsx:1335`, רכיב `MissedWorkoutBanner.tsx:34`: **"פספסת כמה אימונים? הכל בסדר. אימון האיכות שלך עדיין מחכה – רוצה לבצע אותו היום?"** ← המסגור המעניש שצריך לרכך.
- **למה הקופי לא התאים:** (1) הווריאנט בעדיפות עליונה = **"איפה נעלמת?" / "השרירים שואלים"** (`MessageService.ts:195`) — שאלה רטורית מאשימה, לא הזמנה. (2) אף באנר **לא נוחת על אימון קונקרטי**. (3) אין "בוא נמשיך מפה" / המשכיות. (4) הבאנר החי (ריצה) אומר במפורש "פספסת".

---

## 3. כפתור "עוד אימון" — reuse קל, קופי מקובע

- **מיקום:** `HeroWorkoutCard.tsx:674`, קופי literal בשורה `684`: **"אני על הגל, תציעו לי עוד אימון!"**. מותנה ב-prop `onRequestMore` (`:483`).
- **מנגנון:** `onRequestMore` → `handleRequestMore` (`home/page.tsx:482`) → מפרק חגיגה → `handleHeroPress` → `openWorkoutPreview(selectedDate)` → `WorkoutPreviewDrawer`. **לא** ייצור ייעודי — פותח מחדש את preview האימון היומי הקיים.
- **reuse ליום-מנוחה:** ✅ המנגנון מנותק מהקופי/מיקום (`onRequestMore` גנרי; `handleHeroPress`/`openWorkoutPreview` נתיב משותף). ⚠️ מקובע: קופי literal ב-JSX + הכפתור מרונדר רק בענף `isCompleted && completionData`. ל-reuse: `ctaLabel?` prop + הרמה מהענף, או שתילת אותו pattern בכרטיס מנוחה עם handler+קופי אחר ("רוצה בכל זאת להתאמן היום?").

---

## 4. ייצוג יום-מנוחה + נקודת חיווט ל-CTA

- **מודלים:** A(spec) `ScheduleDay { sessions:[], isRestDay:true }` (literal `'REST'` קיים אך לא בשימוש). C(Firestore) `ScheduleEntryType = 'training'|'rest'|'assessment'`; מנוחה = יום מושמט / `type:'rest'` / rest-override tombstone. B(home) `DayActivityData.isRest`; יום-אימון-עבר שהוחמץ מרונדר כמנוחה.
- **נקודת חיווט ל-CTA:**
  - ✅ **RUNNING** — כרטיסי מנוחה אמיתיים: `NextRunWorkoutCard.tsx:313` — "היום זה להתאושש 🧘" (`:344`) + subtitle "הבא: …" + **slot כפתור קיים** "ביטול — אני בכל זאת רוצה להתאמן" (`:356`, תקדים מדויק ל-CTA). גם `SmartWeeklySchedule.tsx:451` (בלי כפתור עדיין).
  - ❌ **STRENGTH** — **אין כרטיס מנוחה.** מחליף לאימוני-התאוששות (`WorkoutSelectionCarousel.tsx:81`, תג "🧘 התאוששות פעילה"). נקודת הסתעפות = `trioResult.isRestDay` ב-StatsOverview. צריך לבנות כרטיס.
  - כל המחרוזות = literals inline (בלי MessageService).

---

## 5. מפת כפילויות מלאה — כל מקום עם פספוס/עידוד

**(a) Home / Today**

| # | מה | קובץ | סטטוס | קופי |
|---|---|---|---|---|
| A1 | re-engagement אדום | `home/page.tsx:1125` | דגל-כבוי | "בוא נעשה אימון!" + re_engagement |
| A2 | coach-cue סגול | `StatsOverview.tsx:1151` | דגל-כבוי | "ברוך שובך! התעלמת X ימים…" |
| A3 | MissedWorkoutBanner (ריצה) | `StatsOverview.tsx:1335` | **חי** | **"פספסת כמה אימונים? הכל בסדר…"** |
| A4 | PlanRealignPopup (gap 7–20) | `PlanAlignmentPopup.tsx:17` | **חי** | "שמחים שחזרת!" |
| A5 | RebuildPopup (gap 21+) | `PlanAlignmentPopup.tsx:103` | **חי** | "ברוכים השבים!" |
| A6 | AlertModal missed/comeback | `AlertModal.tsx:11` | רדום (mock) | "התגעגענו!…" |

**(b) Post-workout** — אין משטח פספוס. רק `post_workout`/`partial_workout` (עידוד) — `MessageService.ts:129`.

**(c) Notifications / Push** (FCM בלבד, אין local-notifications)

| # | מה | קובץ | סף | ערוץ |
|---|---|---|---|---|
| C1 | retentionScheduler (יומי 10:00) | `functions/src/retentionScheduler.ts` | inactive **≥7** | `retention` |
| C2 | onboardingDropoffDispatcher | `functions/src/onboardingDropoffDispatcher.ts` | onboarding תקוע | `training_reminder` ⚠️ |
| C3 | trainingReminderScheduler (07:30) | `functions/src/trainingReminderScheduler.ts` | אימון היום לא הושלם | `training_reminder` |
| C4 | sendPushFromQueue (`inactive_users`) | `functions/src/sendPushFromQueue.ts` | **14** יום | — |

**(d) פאנל ניהול** — D1 compose+presets (`admin/notifications/page.tsx`), D2 Inactivity tab (`admin/workout-settings/page.tsx:1992`), D3 simulator, D4 workout-simulator, D5 Smart-Messages CRUD (`admin/messages/page.tsx` — types `missed_workout`+`re_engagement`), D6 users "פעיל לאחרונה" (`admin/users/all/page.tsx:884`), D7 reactivation analytics.

**(e) תשתית** — מאגר קופי `MessageService.ts` (`re_engagement` `:141`, `missed_workout` יתום `:169`); settings `SettingsModal.tsx:1541` (+ toggle inactivity legacy מוסתר `:1382`).

**⚠️ קונפליקטים (למה איחוד קריטי):**
1. מערכות חזרה **נערמות** — RUNNER חוזר יכול לראות A3+A4/A5 יחד, ואם יפעילו דגל גם A1+A2 = 3–4 הודעות במסך.
2. **5 מחרוזות "welcome back"** לאותו אירוע בלי מקור אחד ("התגעגענו!"/"שמחים שחזרת!"/"ברוכים השבים!"/"ברוך שובך!"/"כיף לראות אותך!").
3. **ספי inactive לא עקביים:** 4 / 2 / 7–20 / 21 / 7 / 14. אין SoT.
4. **2 impl "פספסת אתמול" יתומים** (AlertModal missed + MessageService.missed_workout).
5. **אי-התאמת ערוצי push:** C2 בערוץ `training_reminder`, C1 בערוץ `retention` — opt-out שונה לאותו סוג.
6. **3 עורכי קופי רטנשן** (D1/D2/+C1 hardcoded), בלי template משותף.

---

## 6. פער השלמה — engine + UI, שניהם

**🔴 Engine:** מנוע spacing/rolling — אין (רק תבנית קבועה). shift-on-miss — types dead. catch-up חסום — ✅ כבר de-facto. נחיתה-על-אימון אחרי היעדרות — אין. weaver עומס/התאוששות ריצה+כוח סוג-אגנוסטי (§7, עיקר הערך) — אין (יש `SplitDecisionService` לכוונון volume ו-`periodization.service` לריצה, אבל לא שוזר בין דומיינים).

**🟡 UI:** הודעה קוהרנטית אחת — אין (6 מתחרות). CTA "רוצה בכל זאת להתאמן?" — מנגנון קיים ומנותק, צריך prop-ify+חיווט. כרטיס מנוחה לכוח — חסר. קופי מעודד לחזרה — קיים מעורפל/מאשים. שקיפות shift — אין (כי אין shift).

---

## סדר שלבים מוצע (לחזור אליו — לא לבנות עדיין)

- **שלב 0 — איחוד ההודעות:** למזג את 6 מערכות הפספוס/חזרה ל**מקור-אמת אחד** + ריכוך הבאנר החי `MissedWorkoutBanner` ("פספסת כמה אימונים?"). SoT יחיד לסף inactive + לקופי חזרה. זה מנקה את הקונפליקטים לפני שמוסיפים משהו.
- **שלב 1 — כרטיס-מנוחה + CTA לכוח:** reuse מנגנון "עוד אימון" (§3) לכרטיס מנוחה עם קופי "רוצה בכל זאת להתאמן היום?". לבנות כרטיס מנוחה לכוח (חסר), לחקות את תקדים הריצה (`NextRunWorkoutCard`).
- **שלב 2 — מנוע rolling spacing/shift.** ✅ **לא-חסום עוד (ר' "החלטה פתוחה" למעלה, 02.09.2026)** — קלנדרי-מול-rolling הוכרע (rolling-engine פנימי + תצוגה קלנדרית, מחולל-אחד, טוגל per-user). עדיין ממתין לאישור-ביצוע נפרד, לא מתחילים לבד מההכרעה הזו. spacing ממה שקרה בפועל, "זז לא מתכווץ", + נחיתה-על-אימון אחרי היעדרות (גם אם קלנדרית זה יום מנוחה) + שקיפות shift ("העברתי את הכוח להיום והזזתי את השבוע").
- **שלב 3 — weaver ריצה+כוח:** מנוע עומס/התאוששות סוג-אגנוסטי (§7) — קשה/קל, לא רגליים כבד לפני ריצה קשה.

---

## החלטה פתוחה — הוכרעה (02.09.2026), ראו ✅ מתחת

**קלנדרי-שבועי ("2/3 השבוע") מול rolling ("3 ב-7 מתגלגל").** משפיע על **כל** לוגיקת ה-shift ⇒ להכריע לפני שלב 2.
- **המלצה:** **rolling-engine פנימי + תצוגה קלנדרית** — המנוע חושב במרווחים (תואם עיקרון-העל ופותר נטישה), שכבת תצוגה ממפה לרשת השבועית הקיימת (`SmartWeeklySchedule`). קלנדרי לבד = פחות עבודה מיידית אבל סותר את ה-spec ומשאיר את בעיית הנטישה.
- ~~⛔ לא לבנות את מנוע ה-shift עד אישור דוד על הכיוון הזה.~~ **✅ אושר — ר' ההכרעה מתחת. שלב 2 כבר לא חסום.**

### ✅ הכרעה (דוד, 02.09.2026)

אושרה, ולא באה לבד — סבב אימות נפרד על גישת "מאמן חכם" בוצע בינתיים (03.09), ורק חיזק את ההכרעה, לא שינה אותה.

1. **לא "תמיד rolling".** במקום המלצת-ברירת-המחדל של המסמך — טוגל "מאמן חכם", והמשתמש בוחר. דלוק = לו"ז דינמי, המנוע מזיז ימים לפי מרווחים. כבוי = לו"ז קשיח, הימים לא זזים לבד. ברירת-מחדל: **דלוק**.

2. **העיקרון הארכיטקטוני — הכי חשוב לא-לפספס: מחולל אחד, לא שניים.** צורת-התוכנית שנבנית זהה בשני המצבים — הטוגל לא קובע *מה* נבנה, הוא קובע *אילו חוקים מותר לפעול* על מה שכבר נבנה. קשיח = החוקים קיימים אך רדומים. דינמי = החוקים ערים ופעילים. אסור בשום מצב שיהיו שני מחוללים נפרדים לשני המצבים. **הנימוק, במפורש:** זו הדרך היחידה שהטוגל נשאר הפיך בכל רגע נתון — בלי מיגרציה, בלי לאבד היסטוריה — וזו גם ההגשמה הישירה של החלטת-המוצר של דוד: "שינוי הימים צריך לשנות את התוכנית, אבל לא להתחיל אותה מהתחלה."

3. **כיבוי הטוגל מקפיא במקום, לא מחזיר אחורה.** כל מה שהמאמן-החכם כבר הזיז נשאר בדיוק איפה שהוא; מרגע הכיבוי, שום דבר נוסף לא זז. **לעולם לא** חוזר לתוכנית-המקורית-כפי-שנבנתה. כיבוי = "תפסיק לזוז מעכשיו", לא "תבטל את מה שכבר זזת".

4. **הדלקה מתחילה לפעול מהמצב הנוכחי, כפי שהוא.** אין "לשחזר" למשהו — הרגע שהטוגל נדלק, המנוע ממשיך מנקודת-המוצא שכבר קיימת.

5. **הטוגל הוא הגדרה per-user, לא feature flag ברמת-קוד.** קריטי לא-לבלבל אותו עם `SHOW_MISSED_DAYS_PROMPTS` (`feature-flags.ts:53`, §2 למעלה) — זה compile-time, מכבה תצוגה בלבד, לא קשור. לפרויקט הזה יש כבר היסטוריה תיעודית של מושג-אחד-עם-שתי-הגדרות (למשל `hasStrengthTrack` בכמה גרסאות, `personaAnsweredAt`/`personas`) — **לא למצוא שם-שדה עדיין ולא ליצור אותו** — רק ההכרעה עצמה נרשמת כאן, המימוש (כולל השם) ממתין לשלב 2 בפועל.
