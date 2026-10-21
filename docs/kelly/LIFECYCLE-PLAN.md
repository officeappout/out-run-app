# קלי כקול של פושי מחזור החיים — תוכנית (K1)

> נכתב 21.10.2026 מ-`origin/main` @ `fa33520d`. מסמך תכנון בלבד: אף שורת קוד לא שונתה.
> בקשה: הצ'אט של לוח הזמנים וההתראות. אישור תכנון: דוד, 21.10.2026.
> החלטת בעלים: קלי הוא הקול וה"מוח" של תמיכת המשתמש. כל התראה יזומה יוצאת מקלי, לפי המצב הפסיכולוגי של המשתמש.
> מקורות: הקוד ב-`origin/main` (נתיבים מדויקים בכל סעיף), ספריית הנוסחים `agent-briefs/push-copy-v2.md`,
> `docs/copy/GENDER-INVENTORY.md` וההחלטות של דוד על מגדר. מפת התרחישים (artifact) לא נקראה, כי אין לי גישה לקישורי claude.ai.
> העבודה של הצ'אט השני (`firstWeekSequence`, `streakRescueScheduler`) עוד לא נמצאת ב-`origin/main`. כאן מופיעים רק שמות
> הקבצים שהיא נוגעת בהם, כדי שהגלים לא יתנגשו (§6). התוכן שלה לא שימש בסיס לשום מסקנה.

---

## 0. בשורה התחתונה

- **חצי מהבקשה כבר קיים, בשני מנועים נפרדים.** מנוע ההודעות היזומות של קלי (`src/lib/ai/coach/proactive/**`) שולח עד הודעה
  אחת ביום בשיחה המאוחדת: בוקר, מזג אוויר, סיכום שבועי, בדיקת רמה, "איך היה?". במקביל, שמונה schedulers ב-Functions שולחים
  פושים בלי קלי: הרשמה שנתקעה, אימון ראשון, חזרה, תזכורת אימון, צעדים, תחילת שבוע. רק שלושה מהטריגרים שהתבקשו
  חדשים לגמרי: `first_week_dayN` בימים 3 עד 7, `second_workout` ו-`streak_rescue`. כל השאר הם הרחבה או החלפה של קול
  במשהו שכבר נשלח.
- **ההמלצה: נקודת החלטה אחת, שני ערוצי כניסה.** ההחלטה "האם קלי מדבר עכשיו, ומה הוא אומר" נשארת ב-`selectProactive` + `sharedGate`,
  עם נעילה ולדג'ר אחד. מה שקלי מזהה בזול בעצמו נכנס דרך הריצה של כל 15 דקות. מה שה-schedulers של הצ'אט השני מזהים
  (שבוע ראשון, הצלת רצף, חזרה רגועה) נכנס דרך route חדש של **handoff**. ה-scheduler מזהה ותוזמן, קלי מחליט וכותב,
  וה-scheduler שולח את הנוסח שלו רק כשקלי מסרב מסיבה שמשאירה את המשתמש אצלו (קטין, בלי AI, קלי כבוי).
- **ספירת המכסה במקום אחד:** `push_rate/{uid}.dailyEngagementCount` ב-`push.service`. הפוש של קלי כבר נספר שם
  (`countTowardDailyCap`). מפתח ה-dedupe החדש וחותמת "קלי דיבר בחלון הזה" נכתבים ל-`push_rate/{uid}`. כל scheduler כבר
  קורא את המסמך הזה, אז הבדיקה לא עולה קריאה נוספת.
- **עלות ה-LLM זניחה.** משפט flex אחד ב-Haiku עולה בערך $0.00005. גם בתקרה של שתי הודעות ביום לכל אחד מ-802 המשתמשים
  זה פחות מדולר בשבוע. הסיכון האמיתי בפתיחה איננו הפושים, אלא **`ai_coach_free_for_all`**: הוא פותח גם את הצ'אט של קלי
  לכל המבוגרים (§4.4).
- **שני פערים שחוסמים מדידה ובדיקה, ולא מופיעים בבקשה:** (1) `onKellyThreadMessage` לא מעביר `measurement`, ולכן אין היום
  open rate ואין "חזר תוך 48 שעות" לפושים של קלי. (2) `sendPush` מסנן משתמשי דמו (`withoutDemoUids`), ולכן בעולם הדמו אפשר
  לבדוק החלטות, טקסטים ועלות, אבל לא מסירת פוש.

---

## 1. מה קיים היום: מי שולח מה

### 1.1 המנוע של קלי (Next.js, Kelly phase 3)

| רכיב | קובץ | מה הוא עושה |
|---|---|---|
| Cron | `functions/src/kellyProactiveScheduler.ts` | כל 15 דקות, 07:00–22:00. קורא ל-`POST /api/ai-coach/proactive/run` בפרוסות (`lib/cursorRunLoop.ts`). לא כותב כלום בעצמו. |
| ריצה | `src/lib/ai/coach/proactive/run.server.ts` | מאסף מועמדים בשאילתות זולות, בונה state לכל אחד, בוחר הודעה אחת, מרנדר, ואופציונלית מוסיף משפט LLM. דגלים: `ai_coach_proactive` **וגם** `kelly_unified_v1`. |
| זמנים | `slots.ts` | `post_workout` בכל ריצה. טריגרים לפי שעה רק בריצה הראשונה של השעה (`minute < 15`): בוקר ומזג אוויר 07–11, `weekly` שישי 10:00, `assessment` 12:00 בימים א'–ה'. |
| טריגרים | `triggers/{post-workout,weather,morning,weekly,assessment}.ts` | פונקציות טהורות מעל `ProactiveUserState`. העדיפות ב-`TRIGGER_PRIORITY`. |
| שער משותף | `policy.ts` `sharedGate` | `no_ai`, `opted_out` (`notificationPrefs.coach_proactive`/`coach`), `push_disabled`, `already_today`, שעות שקט 22–07, שבת (שומרי שבת בלבד), `retention_today`, `daily_cap`, `calm_return` (נעדר 4 ימים ומעלה: שום הודעה חוץ מ-`post_workout`). |
| State | `context.server.ts` | תמיד: `users/{uid}`, `push_rate/{uid}`, `ai_coach_proactive/{uid}` (לדג'ר), מסמך ההודעה של היום. לפי הצורך: entitlement, ה-sheet (בוקר, מזג אוויר, בדיקת רמה), השבוע (`weekly`), מזג אוויר מה-cache. |
| כתיבה | `send.server.ts` | טרנזקציה אחת: `ai_coach_threads/{uid}/messages/proactive_{date}` (**ה-id של המסמך הוא הנעילה של "אחת ביום"**), מסמך ה-thread, הלדג'ר. אחר כך מונה ב-`ai_coach_proactive_stats/{date}`. |
| פוש | `functions/src/onKellyThreadMessage.ts` | `onCreate` על הודעה: `sendPush` בערוץ `coach`, כותרת "קלי", גוף = 100 התווים הראשונים של ההודעה, deep link ‏`/ai-coach`, `countTowardDailyCap: true`. **בלי `measurement`**. |
| LLM | `llm.server.ts`, `flex-prompt.ts`, `flex-guard.ts` | משפט "flex" אחד במודל `fast` (`claude-haiku-5-5`), `max_tokens` 80, `assertAiBudget` לפני כל קריאה, ולידציה של מגדר, אורך ותווים אסורים. כל כשל מחזיר את המשפט של התבנית. תקרה: `PROACTIVE_LLM_MAX_PER_RUN = 150` **לכל פרוסה**, לא לכל ריצת cron. |
| תצוגה מקדימה | `preview.server.ts`, `/admin/ai-coach/proactive`, `ProactivePreviewPanel.tsx` | "מה קלי היה שולח היום ולמה" לכל משתמש, ושליחת בדיקה לחשבון של האדמין עצמו. |
| דמו | `src/lib/ai/demo-kelly.server.ts` | `demo_kelly` כבוי: משתמשי דמו נזרקים לפני כל קריאה. דולק: הם נבדקים כמו כולם, וכל קריאת LLM נספרת ב-`demo_registry/usage/days/{date}.bySource.kelly`. |
| ברוכים הבאים | `src/app/api/social/kelly-welcome-bot/route.ts` | ב-`COMPLETED` של ה-onboarding: הודעת `system` עם id ‏`welcome` בשיחה המאוחדת. הפוש יוצא דרך `onKellyThreadMessage` (ערוץ `coach`, לא נספר במכסה). זה בפועל `signup_welcome` של היום. |

### 1.2 ה-schedulers ב-Functions (בלי קלי)

| Scheduler | זמן | למי | ערוץ, מכסות | חפיפה עם הבקשה |
|---|---|---|---|---|
| `onboardingDropoffDispatcher` | `17,47 * * * *` | `onboardingStatus` הוא `IN_PROGRESS`/`ONBOARDING`, נרשם לפני 24 שעות ומעלה | `onboarding_dropoff` (או `training_reminder` ב-legacy, לפי `pushRouting_onboardingDropoff`). המתנה של 48 שעות בין שליחות, **2 לכל החיים**. נוסח לפי `stage` (`dropoffStageOf`) ו-`track`. | **`onboarding_dropoff` כבר קיים ומבחין בשלב.** |
| `firstWorkoutScheduler` | 17:00 | `COMPLETED`, נרשם לפני 24 עד 72 שעות, בלי אף אימון | `retention`, rate cap של 20 שעות. דגל `firstWorkoutPushEnabled` (ברירת מחדל כבוי). | **חופף ל-`first_week_day1`/`day2`.** |
| `retentionScheduler` | 10:00 | `COMPLETED`, נעדר 7 ימים ומעלה (4 עם milestones) לפי פעילות אמיתית (`lib/user-activity.ts`) | `retention`. דגל `retentionMilestoneCadence` (כבוי): פעם אחת בכל אחד מ-d4/d7/d14/d30, ושקט אחרי יום 35. מי שמעולם לא התאמן מקבל את הנוסח של `first_workout`. | **חופף ל-`calm_return`.** הסולם שהתבקש (4, 7, כל שבוע עד 27, פעם אחת ב-28) שונה מ-d4/d7/d14/d30. |
| `trainingReminderScheduler` | כל שעה | `userSchedule` של היום עם אימון פתוח, בשעה המועדפת | `training_reminder`. חותמת `trainingReminderSentDate`. | מתנגש עם `morning` של קלי. היום זה נפתר כך שהודעת הבוקר נכתבת **שקטה** אם התזכורת כבר יצאה. |
| `reminderSweepScheduler` | כל 5 דקות | slots מההגדרות + רשומות עם `startTime` (דגל) | `training_reminder` | זו "תזכורת שהמשתמש ביקש". רק היא מורשית ב-06:00, לפי הבקשה. |
| `stepGoalNudgeScheduler` | 18:00 | מתחת ליעד הצעדים | `health_milestone`. דגל `stepGoalNudgeEnabled`. | נוגע ב"יום 4, צעדים" של השבוע הראשון. |
| `weekStartScheduler` | מוצ"ש 21:15 | שומרי שבת | `week_start` | בלי חפיפה. |
| `kellyMemoryScheduler`, `aiCoachReviewScheduler` | לילה, בוקר | משתמשי AI | בלי פוש | עלות LLM בלבד. |

תשתית משותפת:

- **`push.service.ts` `sendPush`** הוא האוכף הסופי. הוא בודק: kill switch גלובלי, העדפות משתמש לכל ערוץ, שעות שקט 22–07
  (חוץ מ-`skipQuietHours`), שבת לשומרים בלבד (`shabbat.service.ts`), rate cap לכל ערוץ, **מכסה יומית** (`notificationFrequency`
  ‏min/balanced/high שהם 1/3/6, ברירת מחדל 3; רק ב-`ENGAGEMENT_CHANNELS` או עם `countTowardDailyCap`), `suppressIfLapsed`,
  ומשתמשי דמו שאינם נמענים לעולם.
- **ספריית הפושים** (`src/features/notifications/push-library/push-library.core.ts`, ומראה שלה ב-`functions/src/shared/`) קובעת
  את הנוסח. שורות ממוגדרות (`gender`, `subjectGender`), `conditions` (track, stage, milestone), ו-`lever` לכל pushType
  (`routine | streak | social | competition | progress`). **המנוף הוא תכונה של סוג הפוש, לא של המשתמש.** מודל "איזה מנוף עובד
  על המשתמש הזה" לא קיים היום.
- **`lib/push-lifecycle.ts`**: `pushTrackFromUserData`, `dropoffStageOf`, `firstWorkoutWindow`, ותקרת ה-legacy של retention.
- **`lib/age-guard.ts` `isConfirmedAdult`**: מבוגר רק כשזה ידוע בוודאות. גיל לא ידוע נחשב קטין.
- **מדידה:** `push_events` (`push_sent` רק כשמעבירים `measurement`), ‏`onPushOpened` (פתיחה), ‏`pushOutcomeSweeper` (האם היה
  אימון בחלון שאחרי הפתיחה).

### 1.3 טבלת החפיפות (כדי לא לבנות פעמיים)

| טריגר מבוקש | קיים היום | המלצה |
|---|---|---|
| `signup_welcome` (יום 0) | הודעת `welcome` של קלי ב-COMPLETED, עם פוש `coach` | **להרחיב** את ההודעה הקיימת: הצעת אימון ראשון ב-12 דקות ("הכול מוכן"). לא לבנות טריגר חדש. |
| `first_week_dayN` (ימים 1–7) | `firstWorkoutScheduler` יום 1–2 (כבוי), ו-`firstWeekSequence` בבנייה בצ'אט השני | הזיהוי נשאר אצלם, ההחלטה והקול עוברים לקלי ב-handoff. |
| `second_workout` (24–48 שעות אחרי הראשון) | אין | קלי מזהה בעצמו (יש לו כבר loader של `workouts` לפי טווח תאריך). |
| `onboarding_dropoff` | `onboardingDropoffDispatcher` לפי שלב, 2 לכל החיים | נשאר אצל ה-dispatcher. קלי נותן **נוסח בלבד** (§2.6): למשתמש בשלב הזה אין עדיין AI ואין גיל מאומת. |
| `streak_rescue` (19:30) | אין ב-main. `streakRescueScheduler` בבנייה בצ'אט השני | הזיהוי (מצב הרצף של היום) אצלם, הקול אצל קלי ב-handoff. |
| `calm_return` (4, 7, שבועי עד 27, 28) | `retentionScheduler` (milestones כבויים), ו-`retentionLadderV2` בבנייה אצלם | הסולם אצלם, הקול אצל קלי ב-handoff. השער `calm_return` של קלי מקבל חריג לטריגר הזה בלבד. |
| `weekly_summary` | `weekly` של קלי, שישי 10:00, רק לשבוע עם אימון | **להרחיב** ל"מה עשית, מה נשאר, מה הלאה". שבוע ריק נשאר בלי סיכום (זה "פספסת"). |

---

## 2. ארכיטקטורה: נקודת החלטה אחת

### 2.1 העיקרון

```
         ┌──────────── זיהוי (מי מועמד, באיזה חלון) ────────────┐
         │                                                       │
  kellyProactiveScheduler (15 דק')            schedulers של הצ'אט השני
  run.server.ts: מועמדים זולים                firstWeekSequence / streakRescueScheduler /
  (post_workout, second_workout, weekly,       retentionScheduler (סולם חזרה)
   morning, weather, assessment)                     │  POST /api/ai-coach/proactive/handoff
         │                                           │  { trigger, windowKey, items[{uid, vars}] }
         └──────────────┬────────────────────────────┘
                        ▼
        buildProactiveState → selectProactive → sharedGate      ← נקודת ההחלטה היחידה
                        ▼
        writeProactiveMessage (טרנזקציה: הודעה + לדג'ר + claim ב-push_rate)
                        ▼
        onKellyThreadMessage → sendPush('coach', countTowardDailyCap)   ← האוכף הסופי
```

- **קלי מחליט, ה-scheduler מזהה.** אף scheduler לא מחליט "מה קלי אומר". אף ריצה של קלי לא משכפלת לוגיקה של מצב רצף או
  סולם חזרה שהצ'אט השני כבר כותב. קלי מקבל אותם כ-`vars` ב-handoff.
- **בעלים אחד לכל משפחת טריגרים, לכל משתמש, בכל רגע.** הבעלות נקבעת לפי `kellyVoiceEligible(user, flags, family)`: דגל המשפחה
  דולק, המשתמש מבוגר מאומת, `hasAi`, ולא כיבה את `coach`. כשהתנאי מתקיים קלי מדבר. כשלא, ה-scheduler שולח את הנוסח שלו
  מהספרייה, כמו היום.

### 2.2 מודל ה-state

הכלל: **אין fan-out לכל משתמש.** המועמדים באים משאילתה ממוינת עם אינדקס. לכל מועמד קוראים מספר קבוע של מסמכים, בדיוק כמו
היום (`users`, `push_rate`, `ai_coach_proactive`, ההודעה של היום), ועוד לכל היותר שאילתה אחת עם `limit` קטן, ורק כשהמסמך לבד
לא מספיק.

| שדה ב-state | מקור | נקרא איפה | הערה |
|---|---|---|---|
| `signupAt`, `daysSinceSignup` | `users.createdAt` | כבר במסמך | |
| `onboardingStatus`, `onboardingStep`, `stage` | `users.onboardingStatus/onboardingStep` + `dropoffStageOf` | כבר במסמך | |
| `filled`: מסלול ושאלונים | `lifestyle.primaryTrack`, `running.isUnlocked`, `progression.domains/tracks` (`pushTrackFromUserData`), `assessmentGaps` מה-sheet | כבר במסמך, וה-sheet רק כשטריגר צריך אותו | |
| `trainedEver`, `workoutCount` | `progression.workoutCount` (נכתב בצד הלקוח, best-effort) | במסמך. **אימות** ב-`workouts where userId== orderBy date desc limit 2` רק כשהמסמך אומר 0 או 1 | אותו אינדקס שקיים (`userId ASC + date DESC`) |
| `firstWorkoutAt` | הקריאה ב-`limit 2` מעל, או `recentWorkout` מהריצה | לפי הצורך | |
| `streak`, `longestStreak` | `progression.currentStreak/longestStreak` | במסמך | מצב "הרצף של היום בסכנה" מגיע ב-`vars` מה-handoff, לא מחושב אצל קלי |
| `daysAway` | `getDaysAway(profile)` (`src/lib/calm-return/days-away.ts`) | במסמך | **פער:** ב-Functions `user-activity.ts` סופר גם פתיחת אפליקציה, וב-Next לא. ב-handoff קלי מקבל את ה-milestone מה-scheduler ולא מחשב מחדש. |
| `gender`, `firstName`, `ageBand`, `persona`, `mainGoal` | `core.*` | במסמך | |
| `hasAi`, `adult` | `core.ageGroup` + entitlement (קריאה רק כש-`free_for_all` כבוי) | קיים | |
| `optedOut`, `familyChannelOff` | `settings.notificationPrefs.coach(_proactive)` **וגם** הערוץ הישן של המשפחה (`retention`, `training_reminder`, `onboarding_dropoff`, `health_milestone`) | במסמך | מי שכיבה "חזרה" לא יקבל חזרה גם מקלי |
| `dailyCountToday`, `dailyCap` | `push_rate` + `notificationFrequency` | קיים | הצ'אט השני מוריד את התקרה ל-2. קלי קורא את אותו מקור. |
| `kellyWindowKey`, `claims` | `push_rate/{uid}.kelly_lastWindowKey`, `push_rate/{uid}.lifecycleClaims` | **חדש**, באותו מסמך | §2.4 |
| `lever`, `tone` | `ai_coach_proactive/{uid}.levers`, `.tones` | **חדש**, באותו מסמך לדג'ר | §2.3, §3 |

מועמדים לפי טריגר. כולם עם אינדקסים שכבר קיימים, או אינדקס אוטומטי על שדה יחיד:

| טריגר | שאילתת מועמדים | גבול |
|---|---|---|
| `second_workout` | `workouts where date in [now−48h, now−24h)` (כמו `workoutsSavedBetween`), ואז `workoutCount ≤ 1` במסמך + `limit 2` לאימות | מספר האימונים של יום אחד |
| `weekly_summary` | `usersActiveSince(6 ימים)` (קיים) | קיים |
| `first_week`, `streak_rescue`, `calm_return` | **ב-scheduler של הצ'אט השני** (הוא כבר קורא את המועמדים האלה) → handoff | המקסימום של ה-handoff: 200 uid לבקשה, בפרוסות |
| `signup_welcome` | אירוע (סיום ה-onboarding), לא שאילתה | אחד |

### 2.3 קטלוג הטריגרים וחלונות הזמן

החלונות (שעון ישראל): **בוקר** 07:00–11:59 · **צהריים** 12:00–16:59 · **ערב** 17:00–21:59.
`windowKey = {date}:{am|mid|pm}`. קלי שולח **לכל היותר הודעה אחת בכל חלון, ועד 2 ביום**. היום הנעילה היא אחת ביום,
וזה חוסם הצלת רצף ב-19:30 אחרי הודעת בוקר. לכן ה-id של ההודעה הופך ל-`proactive_{date}_{window}`.

| טריגר | מתי | חלון | תנאי | dedupe key | בעלים של הזיהוי |
|---|---|---|---|---|---|
| `signup_welcome` | ב-COMPLETED | כל שעה, לא בשעות שקט (שאז ההודעה נכתבת בלי פוש) | פעם אחת | `welcome` (id קיים) | route הקיים |
| `first_week_d1` | 24–48 שעות אחרי ההרשמה, בשעה המועדפת (`{time}`), אחרת 18:00 | ערב | לא התאמן | `first_week:d1` | firstWeekSequence |
| `first_week_d2` | 48–72 שעות, "רף נמוך" | ערב | לא התאמן | `first_week:d2` | כנ"ל |
| `first_week_d3` | יום 3, מנוף חברתי | צהריים | לא התאמן | `first_week:d3` | כנ"ל |
| `first_week_d4` | יום 4, צעדים (רק אם יש צעדים וחסר מעט ליעד) | ערב | לא התאמן, יש צעדים | `first_week:d4` | כנ"ל (בתיאום עם stepGoal) |
| `first_week_d5` | יום 5, ערב אישי, 19:00–20:30 | ערב | לא התאמן | `first_week:d5` | כנ"ל |
| `first_week_d7` | יום 7, "שבוע חדש, דף חדש" | בוקר | לא התאמן | `first_week:d7` | כנ"ל |
| `second_workout` | 24–48 שעות אחרי האימון הראשון, בשעה המועדפת | ערב (או בוקר לפי השעה המועדפת) | בדיוק אימון אחד | `second_workout` (פעם לכל החיים) | קלי |
| `onboarding_dropoff` | לפי ה-dispatcher | | 2 לכל החיים | קיים (`dropoffNotifyCount`) | dispatcher, נוסח בקול של קלי |
| `streak_rescue` | 19:30 (ו-21:15 הוא שליחה נפרדת אצלם, לא אצל קלי) | ערב | רצף ≥ 2, היום עוד לא סגור | `streak:{date}` | streakRescueScheduler |
| `calm_return` | יום 4, יום 7, כל 7 ימים עד 27, פעם אחת ביום 28 | בוקר (10:00, כמו retention) | נעדר, לפי הסולם | `return:{anchor}:{step}` | retentionScheduler / ladder V2 |
| `weekly_summary` | שישי 10:00 | בוקר | לפחות אימון אחד השבוע | `weekly:{date}` (קיים: `weeklySentFor`) | קלי |
| קיימים: `post_workout`, `morning`, `weather`, `assessment` | ללא שינוי | לפי השעה | | קיים | קלי |

**עדיפות בתוך חלון** (`TRIGGER_PRIORITY` החדש): `post_workout` › `streak_rescue` › `second_workout` › `first_week_*` ›
`calm_return` › `weather` › `morning` › `weekly_summary` › `assessment`. ההיגיון: מה שקשור לפעולה שהמשתמש עשה עכשיו
קודם לכול, אחריו מה שיאבד אם לא יישלח היום, ובסוף מה שאפשר לדחות.

### 2.4 בוררות מול ה-schedulers של הצ'אט השני

1. **מי מחליט:** קלי. ה-scheduler של הצ'אט השני שולח את רשימת המועמדים שלו לחלון (`trigger`, `windowKey`, ולכל uid את ה-`vars`
   שהוא כבר חישב: יום ברצף, צעדים שנשארו, milestone). הקריאה מאומתת עם ה-cron secret הקיים (`AI_REVIEW_CRON_SECRET`, כמו
   `kellyProactiveScheduler`).
2. **התשובה לכל uid:**
   - `sent`: קלי כתב. ה-scheduler לא שולח.
   - `declined_owner`: לא בבעלות קלי (קטין, בלי AI, דגל המשפחה כבוי, `coach` כבוי). **ה-scheduler שולח את הנוסח שלו**, כמו היום.
   - `declined_hold`: אסור לשלוח בכלל (שעות שקט, שבת, מכסה יומית, קלי כבר דיבר בחלון, ה-claim כבר קיים). ה-scheduler **לא**
     שולח. זה "suppress, never defer", כמו בכל המערכת.
3. **ה-route נפל או לא ענה (timeout):** ה-scheduler קורא את `push_rate/{uid}.lifecycleClaims[key]`, מסמך שהוא כבר קורא בכל
   מקרה. אם יש claim, הוא לא שולח. אם אין, הוא שולח את הנוסח שלו. כך כשל של קלי לא משתיק את המשתמש, וגם אין כפילות כשקלי
   כתב אבל התשובה אבדה.
4. **מפתח ה-dedupe:** `lifecycleClaims.{trigger}:{windowKey-or-step}` ב-`push_rate/{uid}`, בצורה `{ by: 'kelly' | 'engine', at }`.
   קלי כותב אותו באותה טרנזקציה של ההודעה. ה-scheduler כותב אותו לפני שהוא שולח בעצמו. גיזום של מפתחות ישנים מ-35 יום בכל
   כתיבה, כך שהמפה נשארת קטנה.
5. **"אם קלי שלח, ההתראה שלהם באותו חלון לא יוצאת":** קלי כותב `push_rate/{uid}.kelly_lastWindowKey = {date}:{window}` באותה
   טרנזקציה. כל scheduler שלהם (גם תזכורת אימון, צעדים, וכל טריגר שאינו lifecycle) מדלג כשהערך שווה לחלון הנוכחי. יש
   חריג אחד: תזכורת שהמשתמש קבע בעצמו (`reminderSweepScheduler`, כולל 06:00). היא בקשה מפורשת, לא nudge. מנגד, הודעת `morning`
   של קלי ממשיכה לצאת שקטה אחרי תזכורת, כמו היום.
6. **ספירת המכסה במקום אחד:** רק `push.service` מגדיל את `dailyEngagementCount`. קלי לא סופר בעצמו, הוא רק **קורא** את המונה
   ב-state (`daily_cap` ב-`sharedGate`) כדי לא לכתוב הודעה שהפוש שלה ייחסם. נשאר מרוץ קטן: קלי קרא 1, ה-scheduler שלהם שלח
   לפני שהפוש של קלי נמסר. במקרה כזה `push.service` חוסם את הפוש של קלי וההודעה נשארת בשיחה בלי פוש. זה מקובל, ומופיע כמונה
   `skippedDailyCap` בלוג.

### 2.5 שעות שקט, שבת, קטינים, הסרה

- **שעות שקט:** קלי לעולם לא שולח לפני 07:00 או מ-22:00 (ב-`policy.ts`, וגם ה-cron לא רץ). 06:00 מותר רק לתזכורת
  שהמשתמש ביקש, אצלם.
- **שבת:** אותו חלון בדיוק (`rest-window.ts`, שיש לו בדיקת parity מול `shabbat.service.ts`), לשומרי שבת בלבד (ההחלטה מ-18.10).
  `first_week_d5` שנופל בשישי אחרי 14:00 לשומר שבת מקבל `declined_hold` ולא נדחה.
- **קטינים:** קלי לא מדבר אליהם בכלל (`hasAi` דורש `ageGroup === 'adult'`). ב-handoff הם תמיד `declined_owner`, וה-scheduler
  שלהם (עם `isConfirmedAdult` היכן שצריך) שולח נוסח מהספרייה. הטון הישראלי-חברי לא נשלח לקטינים בשום מקרה.
- **הסרה:** `notificationPrefs.coach_proactive === false` או `coach === false`, **וגם** הערוץ הישן של אותה משפחה. בנוסף
  `settings.pushEnabled !== false`. בהגדרות כדאי מתג אחד מובן ("הודעות מקלי") שמסביר שגם תזכורות השבוע הראשון והחזרה
  מגיעות ממנו.

### 2.6 משתמשים בלי קלי בשיחה (נשירה מההרשמה)

למשתמש שנתקע ב-onboarding אין עדיין `ageGroup` ואין AI, ולכן אין לו שיחה מאוחדת ש"קלי" כותב בה. ההמלצה: הקול של קלי מגיע
**כנוסח בלבד**. שורות בספרייה (`onboarding_dropoff`) נכתבות בגוף ראשון של קלי ("אני קלי, שמרתי לך את המקום"), בלי LLM, בלי
הודעה בשיחה, עם deep link להמשך ההרשמה. אותו כלל חל על כל משתמש בלי AI: אותו מבנה, אותו קול, נוסח קבוע.

### 2.7 Idempotency

- ההודעה: `proactive_{date}_{window}` נוצרת רק אם איננה קיימת (טרנזקציה, כמו היום).
- הטריגר: ה-claim ב-`push_rate` נכתב באותה טרנזקציה.
- ה-handoff: אותה בקשה פעמיים מחזירה `declined_hold` (claim קיים) בלי לכתוב.
- הפוש: `onKellyThreadMessage` נשען על `onCreate` אחד להודעה, ו-`STALE_MS` מונע backfill.
- הלמידה (§3.3): המונים מתעדכנים מאירועי outcome לפי `eventId`, עם סימון `kellyLearned` על האירוע.

### 2.8 מצבי כשל

| כשל | התנהגות |
|---|---|
| LLM לא זמין, סירוב, משפט שנכשל ב-guard, תקציב נגמר | משפט התבנית (קיים). הפוש לא תלוי במודל. |
| קריאת דגלים נכשלת | כבוי (fail-closed, קיים). ב-handoff: `declined_owner`, והנוסח שלהם יוצא. |
| ה-route של קלי למטה או ב-timeout | ה-scheduler בודק claim ושולח את שלו אם אין (§2.4.3). |
| ה-sheet לא זמין | הטריגרים שצריכים אותו מדלגים (קיים). `weekly_summary` יוצא בלי "מה נשאר". |
| ההודעה נכתבה והפוש נחסם (מכסה, שבת) | ההודעה נשארת בשיחה עם badge. אין שליחה חוזרת. |
| פרוסה נגמרה באמצע | `cursor` (קיים). ב-handoff יש פרוסות של 200 uid. |
| Firestore איטי | `timeBudgetMs` (קיים). הריצה נעצרת, לא נדחית לשעה אחרת. |

---

## 3. נוסח

### 3.1 ארבעת הטונים מול טריגרים ומנופים

`push-copy-v2.md` מגדיר 3 טונים לכל תרחיש: **חמוד**, **אישי/רגשי**, **מסקרן**. הטון הרביעי, **ישראלי-חברי**, כתוב ביחיד
ובמגדר של המשתמש.

| טריגר | מנוף ראשי | טונים זמינים (שורות ב-v2) | הערות |
|---|---|---|---|
| `signup_welcome` | שגרה | אישי ("0 קלי") | הודעה אחת, בלי הגרלה |
| `first_week_d1` | שגרה | חמוד, אישי, מסקרן, ישראלי | `{time}` רק אם יש שעה מועדפת, אחרת שורה בלי `{time}` |
| `first_week_d2` | שגרה (רף נמוך) | חמוד, אישי, מסקרן, ישראלי | למי שבחר הליכה או ריצה: הנוסח של "הליכה" כבר מתאים |
| `first_week_d3` | חברתי | חמוד, מסקרן (`{park}`, `{count}`), אישי (קבוצה), ישראלי | **אין היום מקור זול ל-`{count}` לגינה.** השורות עם `{count}` מושבתות עד שיהיה (שאלה 5). |
| `first_week_d4` | התקדמות (צעדים) | חמוד, מסקרן | רק עם `{steps}` אמיתי |
| `first_week_d5` | שגרה (ערב) | אישי, חמוד, ישראלי | |
| `first_week_d7` | שגרה (התחלה) | אישי, מסקרן | |
| `second_workout` | רצף/הרגל | אישי, חמוד, ישראלי | |
| `streak_rescue` | רצף | חמוד, אישי (19:30), ישראלי | 21:15 "מסקרן" שייך לשליחה השנייה שלהם |
| `calm_return` | שגרה (בלי לחץ) | יום 4: אישי, חמוד. 7–27: אישי. 28: רגשי. ישראלי: 4 ו-28 | **בלי מספר ימים בכותרת, בלי "פספסת"** |
| `weekly_summary` | התקדמות | נוסח מובנה של קלי (תבנית + flex) | לא מהספרייה |
| `onboarding_dropoff` | שגרה | שורות חדשות בקול קלי, לפי `stage` | נוסח בלבד (§2.6) |

**בחירת טון:**

- בשלב הראשון, הגרלה דטרמיניסטית לכל משתמש לכל יום (כמו `selectPushCopy`, "ties rotate deterministically per user per day")
  בין הטונים שמותרים לו.
- כשיש מספיק מדידה: epsilon-greedy. 80% הולך לטון עם שיעור "חזר תוך 48 שעות" הגבוה ביותר אצל המשתמש (עם prior מהאוכלוסייה
  כשיש לו פחות מ-3 שליחות), ו-20% לחקירה.
- **הטון הישראלי** מותר רק כשהמגדר ידוע (זכר או נקבה), גיל לא 60+, לא קטין, ולא בשום שידור עירוני או של רשות. עם 802 משתמשים
  למידה אישית תהיה דלילה מאוד, ולכן ה-prior הקבוצתי (לפי `ageBand` × `gender` × מנוף) הוא שיעבוד בחודשים הראשונים.

### 3.2 מודל המנופים

המנופים הם `routine | streak | social | competition | progress`, אותה רשימה כמו `PUSH_LEVERS`.

- **Prior מה-onboarding** (בלי קריאות נוספות): `persona` ו-`mainGoal` (`performance_boost`/`skill_mastery` → התקדמות;
  `healthy_lifestyle` → שגרה), חברות בקבוצה (`social.groupIds` לא ריק → חברתי), ליגה פעילה או יחידה (תחרות), רצף ≥ 3 (רצף).
- **למידה:** `ai_coach_proactive/{uid}.levers.{lever} = { sent, won }`, ו-`tones` באותה צורה. "won" נחשב כשהיה פוש שנפתח
  ואחריו אימון תוך 48 שעות.
- **השימוש:** המנוף לא מחליף את הטריגר (הטריגר קובע *מתי*). הוא משפיע על (1) בחירת השורה כשיש כמה מנופים לאותו טריגר (יום 3
  חברתי לעומת אישי), (2) ה-`flexHint` של המשפט האישי, ו-(3) בעתיד על הטריגר הבא (למשל מי שמנוף התחרות שלו חזק מקבל את
  "עקפו אותך" לפני שגרה).
- **עדכון:** job לילי אחד (אפשר בתוך `kellyMemoryScheduler`, או scheduler חדש בבעלות קלי) קורא את אירועי `post_push_outcome`
  של אתמול, עם `category` שמתחיל ב-`kelly_` (שאילתה אחת לפי תאריך), ומגדיל מונים. אין קריאה לכל משתמש בזמן ההחלטה.

### 3.3 משפט LLM לעומת תבנית

| חלק | מקור | למה |
|---|---|---|
| כותרת הפוש (עד 40) וגוף הפוש (עד 90) | **תבנית** מ-v2 / הספרייה, דטרמיניסטית | זה מה שרואים על מסך הנעילה. מגדר, אורך, בלי אשמה, בלי לוכסן: אי אפשר לסמוך על מודל כאן. |
| הודעה בשיחה | גוף התבנית + **משפט flex אחד** (LLM, כשהתת-דגל דולק) + chip | אותו מנגנון שקיים, עם guard קיים |
| `weekly_summary` | מספרים מהתבנית, שבח במשפט flex | קיים |

כדי שהפוש יציג את כותרת התבנית ולא "קלי" + 100 תווים, ההודעה בשיחה נושאת `push: { title, body, rowId, tone, lever }`, ו-
`onKellyThreadMessage` משתמש בהם כשהם קיימים. כשהם חסרים ההתנהגות נשארת כמו היום.

### 3.4 מגדר

- המגדר של הנמען הוא `core.gender`: זכר או נקבה מקבלים שורות ממוגדרות. **`other` או לא ידוע מקבלים נוסח ניטרלי בלבד**
  ("יוצאים?", "מתחילים?", גוף סתמי), בלי טון ישראלי. זה כבר המימוש ב-`flex-guard.ts` (`other`: בלי פנייה ביחיד) ובספרייה
  (`both` בלבד).
- **שבחים ותגים ממוגדרים ואישיים** (החלטת דוד): "אלוף/אלופה", "זה כבר הרגל, אחי/אחותי" רק כשהמגדר ידוע. כשהוא לא ידוע:
  "כל הכבוד, ככה מתחילים".
- קלי מדבר על עצמו בלשון זכר תמיד (`findFeminineSelfReferences` קיים).
- ב-"עקפו אותך" (לא בתוכנית הזו, אבל באותו קטלוג) הפועל בכותרת לפי מגדר מי שעקף (`subjectGender`), והגוף לפי הנמען.
- כל שורה חדשה נכתבת כזוג (`pairId`) + ניטרלית. בלי ניטרלית אין שליחה למגדר לא ידוע. זה עדיף על נפילה לזכר.

---

## 4. עלות

### 4.1 עלות קריאה אחת

משפט flex: `claude-haiku-5-5`, ‏$0.10 למיליון טוקני קלט ו-$0.50 למיליון טוקני פלט (`src/lib/ai/ai-pricing.ts`). פרומפט
המערכת (`FLEX_SYSTEM`) הוא כ-170 טוקנים, הודעת המשתמש כ-100 עד 150, והפלט כ-30 עד 50 (עד 80).

```
cost_per_call ≈ 320 × 0.10/1e6 + 45 × 0.50/1e6 ≈ $0.000032 + $0.000023 ≈ $0.00006
```

Caching כנראה לא נכנס לפעולה: הפרומפט קצר מהמינימום שאפשר לשמור ב-cache. גם בלי cache העלות זניחה, אז לא כדאי לנפח את
הפרומפט כדי להגיע אליו.

### 4.2 נוסחה

```
LLM_calls/week = Σ_trigger  N_eligible(trigger) × sends_per_week(trigger) × P(flex slot) × [ai_coach_proactive_llm]
cost/week      = LLM_calls/week × $0.00006
```

| טריגר | לכל משתמש בשבוע | מי זכאי |
|---|---|---|
| `first_week_*` | עד 6 בשבוע הראשון בלבד (d1, d2, d3, d4, d5, d7) | הרשמות חדשות בשבוע × שיעור מי שלא התאמן |
| `second_workout` | 1 לכל החיים | מי שהתאמן פעם אחת |
| `streak_rescue` | עד 7 | בעלי רצף ≥ 2 שלא סגרו את היום ב-19:30 |
| `calm_return` | עד 1 | נעדרים 4–28 יום |
| `weekly_summary` | 1 | מי שהתאמן השבוע |
| קיימים (בוקר, מזג אוויר, בדיקה, אחרי אימון) | 2–5 | פעילים |
| **תקרה קשיחה** | **14** (2 ביום) | |

**מספרים מהקוד בלבד:** 802 מסמכי משתמש (`retentionScheduler.ts`, תיקון 19.10.2026: "452/802 users"). אין בקוד ספירה
של הרשמות לשבוע. טווחים:

| תרחיש | משתמשים עם AI | קריאות בשבוע | עלות בשבוע |
|---|---|---:|---:|
| היום (רק דוד, `free_for_all` כבוי) | 1 | ≤ 14 | < $0.001 |
| כל 802 בתקרה | 802 | ≤ 11,228 | ≤ $0.70 |
| ריאלי (3 בשבוע) ל-802 | 802 | ~2,400 | ~$0.15 |
| 10,000 משתמשים בתקרה | 10,000 | ≤ 140,000 | ≤ $8.40 |

### 4.3 שומרי תקציב

- קיים: `assertAiBudget` לפני כל קריאה (תקציב יומי משותף ב-`app_config/ai.dailyBudgetUsd`, ברירת מחדל $5), kill switch,
  `max_tokens` 80, תקרה לכל פרוסה.
- **פער 1:** `PROACTIVE_LLM_MAX_PER_RUN = 150` נספר לכל `runProactiveSlice`, ולולאת הפרוסות יכולה להריץ כמה פרוסות בכל
  tick. מומלץ להחליף במונה יומי ב-`ai_coach_proactive_stats/{date}.llm` מול תקרה ב-config.
- **פער 2:** התקציב משותף עם הצ'אט. מומלץ תת-תקציב `proactiveBudgetUsd` (למשל $1), באותו דפוס כמו `reviewBudgetUsd` שכבר קיים לסוקר, כדי שפושים לא יאכלו לעולם את
  התקציב של שיחות אמיתיות.
- **דמו:** כל קריאה עבור משתמש דמו כבר נספרת ב-`demo_registry/usage/days/{date}.bySource.kelly` (`recordDemoKellyUsage`),
  כולל טוקנים ו-cached tokens. ה-handoff צריך לעבור דרך אותה פונקציה.

### 4.4 מה עוד פותח `ai_coach_free_for_all`

`canUseAi = ai_coach_enabled && (ai_coach_free_for_all || entitlement פעיל)` (`src/lib/ai/ai-entitlement.ts`). היום
הדגל כבוי, ודוד הוא המשתמש היחיד עם entitlement, **בכוונה**. להדליק אותו כדי שפושי קלי יגיעו לכל המבוגרים פותח באותו רגע
**ארבעה דברים**, לא אחד:

1. **הצ'אט של קלי לכל מבוגר** (`/api/ai-coach/chat`, ‏Haiku עם כלים והקשר של ה-sheet). מגבלות קיימות: 20 הודעות בשעה ו-40 ביום
   למשתמש (`ai-config.ts`). זו הנחה שצריך לאמת מול ה-ledger: בערך 8–15K טוקני קלט לתור (רובם מה-cache), עד 3 קריאות מודל לתור
   עם כלים, ובסביבות $0.001–0.003 לתור. 802 משתמשים × 10% פעילים × 5 תורות ביום ≈ 400 תורות, כלומר $0.4–1.2 ביום. התקרה
   התיאורטית (40 × 802 × $0.003) היא כ-$96 ביום, ונעצרת על התקציב היומי של $5, **שאז חוסם גם את הפושים**. זו הסיבה לתת-תקציב בפער 2.
2. **זיכרון לילי** (`kellyMemoryScheduler`, Haiku) לכל משתמש AI שדיבר.
3. **הסוקר היומי** (`aiCoachReviewScheduler`, ‏`smart` = Sonnet) על שיחות. זה המודל היקר ביותר במערכת, ויש לו כבר תת-תקציב משלו
   (`reviewBudgetUsd` ב-`ai-config.ts`), שכדאי לבדוק לפני הפתיחה.
4. **ההודעות היזומות** הקיימות (בוקר, שבועי, בדיקה...) לכל המבוגרים, לא רק ה-lifecycle.

**המלצה:** לא להדליק `free_for_all` כדי לפתוח את ה-lifecycle. בשלב 3 (§5) לפתוח עם entitlement לקבוצה (`source: 'free_launch'`,
אחוז לפי hash של uid), כך שהצ'אט והפושים נפתחים יחד לקבוצה מבוקרת והעלות נמדדת לפני כולם.

---

## 5. Rollout

### 5.1 דגלים

אחד לכל משפחה, כולם `defaultValue: false` ו-`superAdminValue: false` (השרת הוא האוכף, כמו כל דגלי קלי), fail-closed, ב-
`system_config/feature_flags`:

| דגל | פותח |
|---|---|
| `kelly_lifecycle_welcome` | הודעת ברוכים הבאים החדשה (הצעת אימון ראשון) |
| `kelly_lifecycle_first_week` | `first_week_d1..d7` + `second_workout` דרך קלי |
| `kelly_lifecycle_streak` | `streak_rescue` דרך קלי |
| `kelly_lifecycle_return` | `calm_return` דרך קלי |
| `kelly_lifecycle_weekly_v2` | הסיכום השבועי החדש |
| `kelly_lifecycle_measure` | `measurement` + כותרת וגוף מהתבנית ב-`onKellyThreadMessage` (נדלק ראשון, בלי סיכון) |

כל הדגלים דורשים `ai_coach_proactive` + `kelly_unified_v1`. הנוסח בקול קלי ל-`onboarding_dropoff` הוא שורות בספרייה בלבד,
בלי דגל קוד.

**תצוגה מקדימה לסופר-אדמין:** להרחיב את `/admin/ai-coach/proactive` כך שיציג גם את הטריגרים החדשים (`explainAll` כבר מחזיר
סיבה לכל טריגר) ואת הטון והמנוף שנבחרו, ולאפשר "שליחת בדיקה" לכל טריגר לחשבון של האדמין עצמו (קיים: `test_send`).

### 5.2 שלבים, מהמצב של היום

1. **דוד בלבד (המצב היום).** `ai_coach_free_for_all` כבוי, דוד הוא המשתמש היחיד עם entitlement, ושם היזומות של קלי מגיעות
   היום. זה מכוון, לא באג. מדליקים את דגלי המשפחה אחד אחרי השני, ודוד מקבל את הפושים בעצמו. בדיקות לכל משפחה: preview,
   `test_send` לכל טריגר ולכל טון, ושבוע אמיתי על החשבון שלו. סיום: אפס טקסטים שגויים במגדר או באורך, ואפס כפילויות עם
   ה-scheduler שלהם באותו חלון.
2. **עולם הדמו (`demo_kelly`).** משתמשי דמו נבדקים כמו כולם, וה-LLM נספר בתקציב הדמו.
   - **מה נבדק:** החלטות (מי קיבל מה ולמה, דרך `ai_coach_proactive_stats` וה-preview על uid דמו), טקסטים בשיחה, עלות בפועל
     מול §4, העובדה ששום claim לא נכתב פעמיים, ו-handoff מה-scheduler שלהם על uid דמו.
   - **מה לא נבדק:** מסירת פוש. `sendPush` זורק uid דמו. זה תקין ומכוון, ולכן מסירה נבדקת רק בשלבים 1 ו-3.
   - **תרחישים מוכנים:** משתמש שנרשם ולא התאמן (ימים 0–7), אחד שהתאמן פעם אחת, אחד עם רצף 5 שלא סגר את היום, אחד נעדר 4/7/14/28,
     שומר שבת בשישי, משתמש עם מגדר לא ידוע, קטין (חייב לקבל `declined_owner`), ומשתמש שכיבה "חזרה".
3. **הדלקה הדרגתית למבוגרים**, עם entitlement ל-`free_launch` לפי hash של uid: 10% → 25% → 50% → 100%, בהפרש של שבוע לפחות
   בין שלבים. סדר: `first_week` + `welcome`, אחרי זה `return`, אחרי זה `streak`, ובסוף `weekly_v2`. רק אחרי 100% שוקלים
   את `free_for_all` (§4.4).

### 5.3 מה מודדים

תנאי מוקדם: `kelly_lifecycle_measure` דלוק, כלומר `measurement` עם `category: 'kelly_{trigger}'`, `variantId: rowId`,
`framing: tone`, `persona: lever`, `outcomeWindowHours: 48`.

| מדד | מקור | סף עצירה |
|---|---|---|
| Open rate לכל טריגר וטון | `push_events` (`push_sent` / `push_opened`) | ירידה של יותר מ-30% מול ה-scheduler הישן באותו טריגר |
| חזר והתאמן תוך 48 שעות מפתיחה | `pushOutcomeSweeper` (הבדיקה הגנרית של אימון בחלון) | לא נמוך מהנוסח הישן |
| הסרות | שינוי `notificationPrefs.coach_proactive`/`coach` ל-false, ספירה יומית (`count()`) | יותר מ-2% מהנמענים בשבוע |
| תלונות | הודעות בשיחה שמבקשות להפסיק (אין היום intent כזה, נבדק ידנית או נוסף ל-`intent.ts`), פניות לצוות | כל תלונה נקראת. 3 בשבוע עוצרות את השלב. |
| בריאות המערכת | `skippedDailyCap`, `declined_*`, כפילויות claim, `llm` fallback rate | כפילות אחת עוצרת |

---

## 6. גלי מימוש

הכלל: קבצים ש**לא** נוגעים בעבודה הפעילה של הצ'אט השני. לפי שמות הקבצים בענפים `feat/first-week-pushes` ו-
`feat/streak-pushes` (לא נקרא תוכן), הם נוגעים ב: `functions/src/{firstWeekSequence,streakRescueScheduler,firstWorkoutScheduler,
retentionScheduler,trainingReminderScheduler,reminderSweepScheduler,stepGoalNudgeScheduler}.ts`,
`functions/src/services/{push.service,push-events.service}.ts`, `functions/src/lib/user-activity.ts`, שני העותקים של
`push-library.core.ts`, `scripts/seed-push-library.ts`, `src/hooks/feature-flag-defs.ts`, `src/app/home/**`,
`src/features/activity/**`.

| גל | מה | קבצים (בעלות קלי) | תלות | הערכה |
|---|---|---|---|---|
| **K1** | המסמך הזה | `docs/kelly/LIFECYCLE-PLAN.md` | | בוצע |
| **K2** | מדידה: `measurement` + כותרת וגוף מההודעה ב-`onKellyThreadMessage` | `functions/src/onKellyThreadMessage.ts` + טסט | | 0.5 יום |
| **K3** | ליבה טהורה: חלונות (`windowKey`), נעילה לכל חלון, טיפוסי טריגר חדשים, עדיפות, חריג `calm_return` בשער, claims, `kellyVoiceEligible` | `src/lib/ai/coach/proactive/{types,policy,select,slots,windows}.ts`, `triggers/*` חדשים, טסטים | | 1.5 יום |
| **K3b** | דגלים | `feature-flag-defs.ts`, `system-settings/page.tsx` | commit קטן ונפרד, rebase מול הצ'אט השני | 0.25 יום |
| **K4** | נוסח קלי ל-lifecycle: מודול נפרד מ-v2 (זוגות + ניטרלי), טונים, בחירה דטרמיניסטית | `src/lib/ai/coach/proactive/lifecycle-copy.ts` | K3 | 1 יום |
| **K5** | `signup_welcome` v2 | `kelly-welcome-bot.service.ts`, `api/social/kelly-welcome-bot/route.ts` | K4 | 0.5 יום |
| **K6** | Handoff: route + שרת + חוזה טהור שמשוכפל ל-Functions | `src/app/api/ai-coach/proactive/handoff/route.ts`, `proactive/handoff.server.ts`, `functions/src/shared/kelly-handoff.core.ts` (קובץ חדש, עם mirror test) | K3, K4 | 1.5 יום |
| **K6-them** | הקריאה ל-handoff מ-`firstWeekSequence` / `streakRescueScheduler` / ladder | **בצ'אט השני**, אחרי K6 | K6 + המיזוג שלהם | אצלם |
| **K7** | `second_workout` (זיהוי אצל קלי) | `proactive/loaders.server.ts`, `run.server.ts`, `triggers/second-workout.ts` | K3 | 0.5 יום |
| **K8** | `weekly_summary` v2 (מה נשאר, מה הלאה, מה-sheet) | `triggers/weekly.ts`, `templates.ts`, `context.server.ts` | K3 | 1 יום |
| **K9** | מנופים וטונים: prior, לדג'ר, learner לילי | `proactive/levers.ts`, `functions/src/kellyLifecycleLearner.ts` (חדש) | K2 + שבועיים של נתונים | 1 יום |
| **K10** | Preview ותקציב: תצוגה של כל הטריגרים, תקרה יומית במקום לכל פרוסה, תת-תקציב | `preview.server.ts`, `ProactivePreviewPanel.tsx`, `llm.server.ts`, `ai-config.ts` | K3 | 0.75 יום |
| **K11** | בדיקת דמו + שלבי ההדלקה | בלי קוד, מסמך תוצאות ב-`docs/kelly/` | הכול | שבוע (קלנדרי) |

סדר מומלץ, לפי העדיפות (הרשמה ושבוע ראשון קודם): K2 → K3/K3b → K4 → K5 → K6 → (K6-them first week) → K10 → K7 →
(K6-them streak, return) → K8 → K9. כל גל הוא PR קטן משלו, עם review בסשן נפרד (חוק 2 ב-`CLAUDE.md`).

---

## 7. שאלות פתוחות לדוד

1. **מי מזהה את השבוע הראשון, הרצף והחזרה: קלי או ה-schedulers של הצ'אט השני?**
   *המלצה:* הם מזהים, קלי מחליט ומדבר (handoff, §2.4). לא משכפלים לוגיקת רצף וסולם בשני מקומות.
2. **קלי עד 2 הודעות ביום (אחת לכל חלון) במקום אחת?** בלי זה אין הצלת רצף ב-19:30 אחרי הודעת בוקר.
   *המלצה:* כן. ההגבלה הכוללת נשארת 2 ביום לכל המערכת, ונספרת ב-`push.service`.
3. **כותרת הפוש: "קלי" או הכותרת של הנוסח ("האימון שלך מחכה בכניסה")?**
   *המלצה:* הכותרת של הנוסח. היא מה שגורם לפתוח. הזהות של קלי עוברת בקול, ב-deep link לשיחה שלו ובאייקון. אפשרות ביניים:
   "קלי · {כותרת}" כשיש מקום בתוך 40 התווים.
4. **הנוסח של קלי: במודול קוד (מהר, בלי התנגשות) או בספריית הפושים בפאנל (ניתן לעריכה)?**
   *המלצה:* מודול קוד בגל K4, ומעבר לספרייה כ-pushTypes ‏`kelly_*` אחרי שעבודת הספרייה של הצ'אט השני תתמזג. כך אין
   התנגשות עכשיו, ויש עריכה בפאנל אחר כך.
5. **יום 3 חברתי: `{count}` אנשים ב-`{park}`.** אין היום מקור זול לספירה הזו, וחישוב לכל משתמש הוא fan-out.
   *המלצה:* להשתמש בשורות בלי מספרים ("לא חייבים לבד", קבוצה ליד הבית) עד שיהיה aggregate שבועי לכל גינה. בניית ה-aggregate
   היא משימה נפרדת.
6. **מי שכיבה ערוץ ישן ("חזרה", "תזכורות"): לחסום גם את קלי באותה משפחה?**
   *המלצה:* כן. אחרת ההגדרה שלו מפסיקה לעבוד בשקט ברגע שקלי מחליף את הקול.
7. **הטון הישראלי-חברי ("אחי", "כפרה עלייך"): לפתוח מההתחלה או רק אחרי מדידה?**
   *המלצה:* לפתוח רק בשלב 3, ל-25% מהמבוגרים מתחת ל-60 עם מגדר ידוע, ולהשוות מול שלושת הטונים האחרים לפני שהוא נכנס להגרלה הרגילה.
8. **פתיחה למבוגרים: entitlement לפי אחוזים, או `ai_coach_free_for_all`?**
   *המלצה:* entitlement לפי אחוזים. `free_for_all` פותח גם צ'אט, זיכרון וסוקר Sonnet לכולם (§4.4). פותחים אותו רק אחרי 100%
   ותת-תקציב לפושים.
9. **תת-תקציב לפושים בתוך התקציב היומי של $5?**
   *המלצה:* כן, $1 ליום ליזומות, כדי שעומס בצ'אט לא ישתיק את הפושים ולהפך.
10. **`onboarding_dropoff` בקול קלי בגוף ראשון ("אני קלי, שמרתי לך מקום") לפני שהמשתמש בכלל הכיר את קלי?**
    *המלצה:* כן, אבל רק בשלב `mid`/`near_end`. ב-`early` נשאר הנוסח הניטרלי של המותג, כי קלי עוד לא הוצג באפליקציה.
11. **הפער בחישוב "ימים מאז פעילות"** (ב-Functions סופרים פתיחת אפליקציה, ב-Next רק אימונים). מי קובע לחזרה הרגועה?
    *המלצה:* ה-milestone שה-scheduler שולח ב-handoff קובע (מקור אחד). איחוד שתי הפונקציות הוא משימה נפרדת.
