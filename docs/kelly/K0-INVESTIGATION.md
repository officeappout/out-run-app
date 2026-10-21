# K0: למה קלי לא מכיר את הלו״ז, למה "מה קלי זוכר" ריק, והאם קלי יכול להציע מסלולים

**סוג:** חקירה בלבד. קוד לא שונה. **בסיס:** `origin/main` @ `48a17f84` (21.10.2026).
**מקור הדיווח:** דוד שוחח עם קלי בחשבון שלו. קלי לא הכיר את "הלו״ז שלנו", והמסך "מה קלי זוכר" היה ריק.
**דגלים בפרודקשן (לפי הבריף, לא נבדק כאן):** `kelly_unified_v1`, `ai_coach_enabled`, `ai_coach_schedule_advisor`,
`ai_coach_memory`, `ai_coach_round4`, `ai_coach_proactive`(+`_llm`), `enable_graphhopper_routes`,
`enable_loops_prefer_official`, `enable_route_quality_v1` דולקים. `ai_coach_free_for_all` כבוי.

> מה לא נבדק: אין כאן גישה לפרודקשן. כל מה שתלוי בנתונים (אילו מסמכים קיימים אצל דוד, האם ה-scheduler פרוס)
> מסומן כהשערה, ונבדק בסקריפט `scripts/diagnostics/kelly-k0-owner-check.ts` (§4). דוד מריץ אותו.

---

## 0. בשורה התחתונה: שלוש סיבות שורש

1. **הלו״ז: קלי קורא רק ימים "ממומשים" (materialized) של `userSchedule`, והאפליקציה כמעט לא מממשת אותם.**
   מסך הבית (enable_home_v2) מחשב את השבוע בזמן אמת מתוך `lifestyle.recurringTemplate` ומתוך
   `running.activeProgram.schedule`, ולא כותב מסמך יום. מסמך יום נכתב רק כשמסך מסוים פותח את היום הזה
   (בדרך כלל היום עצמו, או ימים בלוח החודשי). לכן ב-prompt של קלי כתוב בפועל
   "This week: 0 planned workouts, nothing planned" (או רק היום), וה-prompt אומר לו שזו האמת היחידה.
   אותו פער בדיוק כבר נמצא ותוקן עבור תזכורת האימון ב-PR #606 ("gap 4"), אבל לא עבור קלי.
2. **הזיכרון: המסך מציג רק "עובדות עמידות" שחולצו בריצה לילית אחת ב-03:30, ולא את מה שקלי באמת יודע.**
   שום דבר לא נכתב לזיכרון בזמן השיחה. הריצה תלויה ב-Cloud Function שצריך לפרוס ידנית ובסוד `AI_REVIEW_CRON_SECRET`.
   היא קוראת רק שיחות שעודכנו ב-26 השעות האחרונות, ושומרת רק ארבעה סוגי עובדות שהמשתמש סיפר על עצמו.
   שאלות כמו "מה הלו״ז שלי" לא מייצרות עובדה. ויש גם באג: למשתמש עם היסטוריה ארוכה, הריצה מתחילה
   מההודעות **הישנות ביותר** ומתקדמת רק 120 הודעות בלילה, ורק בלילות שבהם היה צ'אט. כך הודעות חדשות כמעט לא נקראות.
3. **מסלולים: קלי לא מציע מסלול. הוא פותח את מגירת הריצה/ההליכה במפה, והמפה בוחרת את המחולל.**
   הכלי `plan_aerobic_session` קורא ל-GraphHopper (`generateLoops`) בצד השרת, אבל רק כבדיקת "יש לולאה של ~X ק״מ",
   ושומר רק את המרחק. הוא לא מעביר את המסלולים הממופים שלנו (`ourRoutes`), ולא מחשב שכבת OSM.
   אין A→B, אין "מסלול דרך פארק", אין מסלול רשמי. כשמבקשים "תחנות כוח", המפה עוברת ל-Mapbox הישן,
   כי GraphHopper משרת רק לולאות פשוטות.

---

## 1. לו״ז: מה קלי מקבל בכל תור

### 1.1 מה נכנס ל-prompt

| שכבה | מקור | איפה |
|---|---|---|
| גיליון המשתמש (sheet), נטען בכל בקשה | `loadUserContextSheet` | `src/app/api/ai-coach/chat/route.ts:278-285` |
| השבוע (`thisWeek`/`today`) | `readSchedule` → מסמכי `userSchedule/{uid}_{YYYY-MM-DD}` בלבד | `src/lib/ai/coach/server-tools.server.ts:89-113`, `:176-181` |
| כלי `get_schedule` | אותו `readSchedule` בדיוק | `server-tools.server.ts:236-240` |
| סעיף `plan` (advisor) | `runAdvisor` → פרופיל + 14 ימי אימונים + אותם מסמכי `userSchedule` | `server-tools.server.ts:186-191`, `src/lib/ai/coach/schedule-advisor.server.ts:74-116` |
| דגל ה-advisor | `getServerFeatureFlags(db).aiCoachScheduleAdvisor` (גלובלי, לא לפי משתמש) | `chat/route.ts:255` |

ה-sheet מוצג למודל כך (`src/lib/ai/coach/persona.ts:243-259`):

```
- This week (Sunday to Saturday): ${training.length} planned workouts${training.length ? ':' : ', nothing planned'}
```

וה-prompt מורה (`persona.ts:46-47`, `:53`, `:59`): ה-sheet הוא "the truth", כל עובדה על הלו״ז חייבת לבוא ממנו
או מכלי, ול"מה מתוכנן השבוע" עונים "from the thisWeek lines". כלומר כשאין מסמכי יום, קלי אומר בביטחון
שאין כלום, או שולח את המשתמש לפתוח את הלו״ז בעצמו.

### 1.2 למה מסמכי היום חסרים

מסמך `userSchedule` נוצר בשלוש דרכים בלבד:
- `hydrateFromTemplate` בצד הלקוח, **עבור תאריך אחד**, כשמסך פותח אותו:
  `src/features/home/components/StatsOverview.tsx:820-823` (היום בלבד, כשמחשבים את אימון היום),
  `src/features/home/components/calendar/MonthlyCalendarGrid.tsx:322-325` (ימים בלוח החודשי, כשפותחים אותו).
- שמירות מפורשות: עריכת לו״ז, שמירת הליכה (`src/features/schedule/walking/walkSave.service.ts:30`), session קהילתי.
- אין שום מימוש בצד השרת.

הפס השבועי בבית **לא** כותב מסמכים. הוא קורא (`getWeekEntries`, `SmartWeeklySchedule.tsx:1009`), ומשלים את הימים
מהתבנית ומתוכנית הריצה שבפרופיל. הריצות מגיעות מ-`running.activeProgram.schedule` וממוקמות לפי סוג (`runsByType`):
`SmartWeeklySchedule.tsx:888-930`. לכן המשתמש רואה שבוע מלא, וקלי רואה שבוע ריק או חלקי.

התיעוד בקוד עצמו אומר זאת במפורש: `src/features/user/scheduling/utils/recurring-day.core.ts:1-13`:
התזכורת "must not depend on the user having opened that day in the app (push-lifecycle audit, gap 4)".
התיקון שם הוא `recurringDayPlan`/`templateSessionsToMaterialize`, חישוב וירטואלי בלי לכתוב
(`functions/src/trainingReminderScheduler.ts:349-373`). קלי וה-proactive של קלי לא עברו לזה:
- `src/lib/ai/coach/proactive/loaders.server.ts:83-95` (`usersTrainingToday`): הודעת הבוקר של קלי בוחרת רק משתמשים
  שיש להם מסמך יום להיום. אותו פער.

### 1.3 מקור ישן או חדש?

- **הגיליון וה-`get_schedule`:** המקור הישן (UTS Phase 1, מסמכי יום), בלי השלמה מהתבנית.
- **ה-advisor (`plan`):** המקור החדש. הוא קורא את התבנית ואת `running.activeProgram`, ועם `runsByType` ממקם ריצות
  כמו הבית (`chat/route.ts:259-261`, `schedule-advisor.server.ts:102-103`). אבל ל-sheet הוא מוסיף רק
  `strengthDays` (שמות ימים), מספר שבוע הריצה, מצב היום ויעדי WHO (`src/lib/ai/coach/schedule-tools.ts:127-158`).
  **ימי הריצה וההליכה של השבוע לא נכנסים לשם**, וזה גם לא מוצג כשורות. זה רק בתוך ה-JSON בסוף ה-sheet.
- תבנית ה-v2 (engine-v2 / recommendation-first) נשמרת עדיין ל-`lifestyle.recurringTemplate`
  (`src/features/user/onboarding/services/add-track-save.service.ts:78-80`), כך שהנתון קיים. קלי פשוט לא מחשב ממנו את השבוע.

### 1.4 בעיה נוספת שנמצאה בדרך

יום ריצה שכן מומש נכתב על ידי ה-bridge כ-`programIds: [running.activeProgram.programId]`, בלי `scheduledCategories`.
ב-`sheetScheduleEntry` (`src/lib/ai/coach/context-sheet.ts:250-283`) `kind` יוצא `null`, ולכן הוא נחשב
**buildable כאימון כוח**. קלי עלול להציע "לבנות את אימון הכוח של היום" ביום ריצה. הבית מסנן את זה עם
`excludeRunningShadowEntry`. קלי לא מסנן. `recurringDayPlan(..., runningProgramId)` כבר מסווג נכון (`'cardio'`).

### 1.5 מה עוד יכול לגרום לזה (לבדוק בסקריפט)

- אם ה-sheet נכשל בטעינה (שגיאת Firestore/אינדקס), הוא `null` והמודל אמור לקרוא לכלים (`persona.ts:169-170`),
  אבל הכלים קוראים את אותם מסמכים חסרים.
- `ai_coach_phase2` לא ברשימת הדגלים הדולקים. בלעדיו אין `propose_schedule_change` ואין `get_app_help`
  (`server-tools.server.ts:323-328`). זה לא חוסם קריאת לו״ז, אבל משפיע על "תזיז לי את האימון".

---

## 2. "מה קלי זוכר" ריק

### 2.1 מה המסך מציג

`src/features/ai-coach/components/KellyMemorySheet.tsx` → `GET /api/ai-coach/memory` (`src/app/api/ai-coach/memory/route.ts:39-51`)
→ `ai_coach_memory/{uid}.facts`. **רק** עובדות שחולצו, בארבע קטגוריות: פציעה, אילוצי לו״ז, יעד/אירוע, העדפה
(`src/lib/ai/coach/memory/rules.ts:5-6`, `extract-prompt.ts:8-18`). המסך לא מציג את הגיליון (תוכניות, רמות,
ימי אימון, ציוד), אף שקלי כן מקבל אותו בכל תור. כשאין עובדות כתוב "קלי עוד לא זוכר שום דבר" (`KellyMemorySheet.tsx:65`),
בלי הסבר שהזיכרון מתעדכן בלילה. משתמש שקרא "מה קלי יודע" מצפה לראות את מה שקלי יודע, ומקבל ריק.

### 2.2 מי כותב לשם

| שלב | קובץ | פרט |
|---|---|---|
| טריגר | `functions/src/kellyMemoryScheduler.ts:22-30` | cron `30 3 * * *` Asia/Jerusalem |
| פריסה | `kellyMemoryScheduler.ts:10-11` | `firebase deploy --only functions:kellyMemoryScheduler`, פריסה ידנית נפרדת |
| סוד | `kellyMemoryScheduler.ts:32-35` | בלי `AI_REVIEW_CRON_SECRET` הפונקציה מדלגת בשקט (רק `logger.warn`) |
| URL | `kellyMemoryScheduler.ts:19` | קבוע: `https://outrun.co.il/...`. לא עובר דרך `NEXT_PUBLIC_APP_DOMAIN` (`src/lib/config/domain.ts`). במעבר דומיין זה יישבר |
| פרוסה | `src/lib/ai/coach/memory/run.server.ts:48-55` | דגל כבוי → `flag_off`. רק threads עם `updatedAt` ב-26 השעות האחרונות (`MEMORY_LOOKBACK_MS`, שורה 22) |
| דמו | `run.server.ts:59-74` | משתמש `core.demo` מדולג כש-`demo_kelly` כבוי. כשל בבדיקת הדמו עוצר את כל הפרוסה |
| חילוץ | `src/lib/ai/coach/memory/extract.server.ts:44-70` | הודעות משתמש אחרי `extractedUntil`, קריאה אחת למודל, סינון, מיזוג |
| תקציב | `extract.server.ts:48` | kill switch או חריגת תקציב יומי עוצרים את כל הריצה (`run.server.ts:90`) |

### 2.3 למה זה יכול להיות ריק אצל דוד (מהסביר לפחות סביר)

1. **שוחח היום ובדק היום.** אין כתיבה בזמן אמת. העובדות מהשיחה של היום יופיעו, אם בכלל, רק אחרי 03:30.
2. **ה-scheduler לא פרוס, או שהסוד חסר.** הקוד נכנס ב-#501. מהריפו אי אפשר לדעת אם `firebase deploy --only functions:kellyMemoryScheduler`
   רץ (axiom §27: "מוכן" אינו "פרוס"). הסקריפט בודק עדות עקיפה: `ai_usage/{uid}_{day}.byFeature.ai_coach_memory`.
   אם אין שם כלום באף יום, הריצה מעולם לא עיבדה את דוד.
3. **באג ה-backlog (ודאי בקוד, השפעה תלויה בנתונים).** `newUserMessages` (`extract.server.ts:25-41`):
   `where createdAt > extractedUntil` + `orderBy asc` + `limit(120)`. בריצה הראשונה (`extractedUntil = 0`) זה מחזיר את
   120 ההודעות **הישנות ביותר**, כולל תשובות של קלי. מהן נשארות 40 הודעות משתמש לכל היותר (`slice(-40)`, כלומר
   ה-40 המאוחרות מתוך הישנות), ו-`extractedUntil` מתקדם רק עד שם (שורה 61). כל לילה מתקדם עוד חלון של 120,
   ורק בלילה שאחרי יום עם צ'אט (חלון 26 השעות). אצל משתמש עם מאות הודעות (כמו דוד, שבודק את קלי הרבה),
   השיחות האחרונות לא נקראות שבועות.
4. **אין מה לחלץ.** שאלות ("מה הלו״ז שלי", "תבנה לי אימון") אינן עובדות. ה-prompt מורה להחזיר ריק, ולא לשמור
   "today-only plans". אימונים של היום, עייפות של היום וכו' לא נשמרים בכוונה.
5. **סינון קשיח.** `rules.ts:20-27`: כל עובדה שמכילה למשל "טלפון", "מייל", "תפילה" או "כתובת" נזרקת.
   לא סביר שזו הסיבה לריק מוחלט.
6. **"מחק הכל" בעבר** מאפס את העובדות ומקבע את `extractedUntil` לרגע המחיקה (`store.server.ts:43-45`).
   הסקריפט מדפיס `clearedAt`.

אין כאן סף מינימלי של מספר הודעות, ואין שער entitlement בריצה הלילית (רק בצ'אט). נתיב המסמך תואם בין הקורא לכותב
(`MEMORY_COLLECTION = 'ai_coach_memory'`, `types.ts:36`).

---

## 3. מסלולים מקלי

### 3.1 מה הכלי עושה

`plan_aerobic_session` (`src/lib/ai/coach/round4/tool-specs.ts:11-18`, `:33-52`). קלט: `activity` (run/walk), `durationMin`,
`distanceKm`, `strengthStops`, `withRoute`, `intent`. **אין יעד, אין פארק, אין נקודת ביניים, אין מסלול רשמי.**

ביצוע (`src/lib/ai/coach/round4/aerobic.server.ts:34-70`):
- המחולל: **GraphHopper ישירות**, דרך `generateLoops` (`src/lib/routing/loop-service.ts`). לא `/api/routes/generate`
  ולא מחולל Mapbox הישן. קורה רק אם `enable_graphhopper_routes` דולק ויש קונפיג שרת.
- רק כש-`routeTargetKm` ידוע (`aerobic-plan.ts:88`). ריצה לפי דקות (ברירת המחדל) → `null` → אין חיפוש בכלל.
  ריצה מהתוכנית → אין חיפוש.
- רק כשהמוצא אינו `city` (`aerobic.server.ts:52`). צריך `userLocations/{uid}` מ-14 הימים האחרונים, או
  `core.anchorLat/Lng` (`location.server.ts:42-53`).
- `maxResults: 1`, ונשמר רק `distanceKm` (`aerobic.server.ts:61-62`). הגאומטריה נזרקת.
- בלי `ourRoutes`, כלומר `enable_loops_prefer_official` לא משפיע (`loop-service.ts:35-38`). בלי שכבת OSM לניקוד,
  בעוד ש-`/api/routes/generate` כן מעביר אותה (`src/app/api/routes/generate/route.ts:61-67`).

הכרטיס (`src/features/ai-coach/services/round4-actions.ts:27-36`, `:78`) שומר `PlannedRunSettings` ופותח
`/map?openRun=walking|running`. מגירת הריצה החופשית במפה מייצרת את המסלולים מחדש (`generateDynamicRoutes`,
`src/features/parks/core/services/route-generator.service.ts:1501-1509`). לכן "מצאתי מסלול של 4.2 ק״מ" של קלי
יכול להיות שונה ממה שמוצג.

### 3.2 מה נתמך ומה לא

| בקשה | היום | למה |
|---|---|---|
| לולאה של X ק״מ ריצה/הליכה | כן, בעקיפין | הכרטיס פותח את המפה, והמפה משתמשת ב-GraphHopper (`graphhopper-loops/eligible.ts:28-37`) |
| ריצה/הליכה + תחנות כוח (hybrid) | חלקי, **Mapbox** | `includeStrength` → `isGraphhopperLoopRequest` מחזיר false (`eligible.ts:31`) |
| A→B ("מהבית לעבודה") | **לא** | אין שדה יעד בכלי. במפה `destination` → Mapbox (`eligible.ts:29`), אף ש-`/api/routes/generate` תומך ב-`mode:'ab'` (שורות 5-6, 55-59) |
| מסלול דרך פארק מסוים | **לא** | `find_nearby_parks` רק מציג פארקים ופותח `openPark` (`round4-actions.ts:83`). אין חיבור לתכנון מסלול |
| הליכה + פארק (walk + park, hybrid) | **לא מהצ'אט** | זרימת ה-hybrid (`start-hybrid-session.ts`, `park-out-and-back.ts`) לא חשופה לקלי |
| "המסלולים הממופים שלנו" / מסלול רשמי | **לא** | אין כלי שקורא `official_routes`/`curated_routes`, ו-`ourRoutes` לא מועבר |

### 3.3 מה חסר כדי שקלי ישתמש ב-GraphHopper החדש ובמסלולים הממופים

1. מודול שרת משותף שה-route וקלי קוראים לו: `generateLoops` + `fetchOsmLayerForLoop` + `ourRoutes` שנטענים **בשרת**
   ממסלולים רשמיים ליד המוצא (היום ה-client שולח אותם). מוסיפים לו `friendlyRoute` ל-A→B.
2. להרחיב את הכלי (או להוסיף `plan_route`): `destination` (מקום שהמשתמש קרא לו, או פארק מ-`find_nearby_parks`),
   `viaParkId`, `preferOfficial`. מחזירים את הגאומטריה, לא רק ק״מ.
3. להעביר את המסלול שנבחר לכרטיס (id של מסלול מחושב או גאומטריה ב-stash), כדי שהמפה תציג **אותו**
   ולא תייצר מחדש.
4. Hybrid עם תחנות כוח ב-GraphHopper: viaLoop דרך פארק נבחר (יש `viaLoopCandidate` ב-`loops/candidates`).
   היום זה מוחרג מ-GraphHopper במפה עצמה. זו עבודה של מנוע המסלולים, לא של קלי.
5. מוצא: כשאין מיקום אחרון ואין anchor אין חיפוש. צריך להציע לפתוח את המפה (כבר קורה), או לבקש הרשאת מיקום.

---

## 4. סקריפט אבחון לדוד

`scripts/diagnostics/kelly-k0-owner-check.ts`: קריאה בלבד, מדפיס רק את הנתונים של ה-uid שדוד נותן.
בלי קואורדינטות, ובלי טקסט הודעות (רק ספירות ותאריכים). העובדות השמורות מודפסות כי הן של דוד עצמו.

```bash
FIREBASE_SERVICE_ACCOUNT_KEY="$(cat <path-to-key>.json)" npx tsx scripts/diagnostics/kelly-k0-owner-check.ts --email office@appout.co.il
# או --uid <uid>
```

הסקריפט מדפיס:
- הדגלים הרלוונטיים מ-`system_config/feature_flags`.
- לו״ז: לכל יום בשבוע (ראשון עד שבת): האם קיים מסמך `userSchedule`, מה יש בו, ומה התבנית מתכננת ליום
  (`recurringDayPlan`). השורה האחרונה היא מה שקלי רואה ב-prompt, מול מה שהבית מחשב.
- זיכרון: `ai_coach_memory/{uid}`: מספר עובדות, `extractedUntil`, `clearedAt`, העובדות עצמן.
- Thread: `updatedAt`, `messageCount`, כמה הודעות משתמש מחכות אחרי `extractedUntil`, האם ה-thread נכנס לחלון
  26 השעות של הריצה הבאה.
- עדות לריצה הלילית: `ai_usage/{uid}_{day}.byFeature.ai_coach_memory` ב-14 הימים האחרונים.
- מסלולים: גיל `userLocations/{uid}.updatedAt` (בלי מיקום), והאם יש `core.anchorLat/Lng`.

איך לקרוא את התוצאה:
- ימים עם "template plans: training" ו-"doc: MISSING" → סיבה 1 מאומתת.
- אין `ai_coach_memory` ב-`ai_usage` באף יום → ה-scheduler לא הגיע לדוד (לא פרוס, אין סוד, או ה-thread מחוץ לחלון).
  בודקים בלוג של Cloud Functions `[kellyMemoryScheduler] done` ואת `stoppedBy`.
- `pending user messages` גדול ו-`extractedUntil` ישן → באג ה-backlog (§2.3.3).

---

## 5. רשימת תיקונים

סקאלת סיכון: נמוך = חישוב/קריאה בלבד מאחורי דגל קיים. בינוני = משנה התנהגות שהמשתמש רואה. גבוה = כתיבות או מנוע.
**שיוך לגלים:** גלי K2–K11 ב-`docs/kelly/LIFECYCLE-PLAN.md` (PR #614) עוסקים בפושים של מחזור החיים.
רוב התיקונים כאן הם **בצ'אט עצמו** ולא שייכים לשם. הם מסומנים "מהיר" או "גל חדש מחוץ ל-K2–K11".
הנקודות שנוגעות לגלי K מסומנות במפורש.

| # | מה לשנות | היקף קבצים | סיכון | שיוך |
|---|---|---|---|---|
| F1 | **השבוע של קלי מהתבנית, וירטואלית.** ב-`readSchedule` משלימים כל יום בלי מסמך (או עם מסמך שלא חוסם) ב-`templateSessionsToMaterialize(template, date, entries, reminders, running.activeProgram.programId)`. לא כותבים כלום. מסמנים `source:'template'` | `src/lib/ai/coach/server-tools.server.ts`, `context-sheet.ts` (kind מ-`category`), טסט | נמוך (קריאה בלבד, אותו core שהתזכורת כבר משתמשת בו) | **מהיר** |
| F2 | **ימי ריצה/הליכה של השבוע ב-sheet.** את מיקום הריצות לפי סוג (`mapRunWeekFromLetters`/`runPlacementOf`, אותה פונקציה שהבית משתמש בה) מעבירים לשורות `thisWeek`, עם סוג אימון ריצה ודקות | `context-sheet.ts`, `schedule-advisor.server.ts` (כבר מחשב runsByType), טסט | נמוך-בינוני | **מהיר** (אחרי F1) |
| F3 | **יום ריצה מה-bridge לא נבנה ככוח.** מסננים/מסווגים `programIds` שהם `running.activeProgram.programId` כ-cardio (כמו `excludeRunningShadowEntry`) | `context-sheet.ts:250-283` | נמוך | **מהיר** |
| F4 | **ניסוח ה-prompt כשאין נתון.** במקום "nothing planned" כש-`thisWeek` ריק ויש תבנית או ריצה: "אין שורות. בדוק plan/recommend_week". לא לטעון "אין כלום" בביטחון | `src/lib/ai/coach/persona.ts:243-251` | נמוך | **מהיר** (ייתר אחרי F1) |
| F5 | **הודעת הבוקר של קלי בלי תלות במסמך יום.** `usersTrainingToday` מקבל גם מועמדים מהתבנית, כמו pass 1b בתזכורת | `src/lib/ai/coach/proactive/loaders.server.ts:83-95`, `triggers/morning.ts` | בינוני (יותר הודעות נשלחות, צריך בוררות מול התזכורת) | **K3/K8** (בוררות וחלונות). לא לבד |
| F6 | **באג ה-backlog בזיכרון.** קוראים את ההודעות **האחרונות**: `orderBy desc` + `limit`, ואז הופכים. או מגבילים את `extractedUntil` הראשוני ל-`now - 14d`. ומתקדמים עד סוף ה-batch שנקרא | `src/lib/ai/coach/memory/extract.server.ts:25-41`, `:61`, טסט | נמוך-בינוני (עלות LLM זהה, לכל היותר 40 הודעות) | **מהיר** |
| F7 | **אימות פריסה של `kellyMemoryScheduler` ו-`AI_REVIEW_CRON_SECRET`.** בלי קוד: דוד בודק בקונסולה/בלוג. לפי axiom §27 מתעדים שורת "פרוס בתאריך X" | אין (תפעול). אופציונלי: שורה ב-`docs/kelly/` | נמוך | **מהיר** (תפעולי) |
| F8 | **"מה קלי זוכר" מסביר את עצמו.** במצב ריק: "הזיכרון מתעדכן פעם בלילה, ממה שסיפרת על עצמך (פציעות, לו״ז, יעדים, העדפות)". אופציונלי: חלק "מה קלי רואה מהאפליקציה" (תוכניות, ימי אימון, ציוד מה-sheet), לקריאה בלבד | `KellyMemorySheet.tsx`, `memory/route.ts` (להחזיר גם תקציר sheet) | נמוך (UI) | **מהיר** (העתק). החלק של ה-sheet: גל חדש קטן |
| F9 | **חילוץ "מיד אחרי השיחה" (אופציונלי).** טריגר דחוי לחילוץ אחרי N הודעות משתמש או שעה של שקט, במקום לחכות לבוקר | `memory/*`, route חדש או Cloud Task | בינוני (עלות, כפילות מול הריצה הלילית) | **גל חדש** (Kelly memory v2) |
| F10 | **URL קבוע ב-schedulers.** `RUN_URL` עובר ל-param/env (`APP_ORIGIN`). חל גם על proactive, reviews, costs, generation-review | `functions/src/kellyMemoryScheduler.ts:19` ו-4 אחרים | נמוך, אבל דורש פריסת functions | **מהיר**, לפני מעבר הדומיין |
| F11 | **מודול שרת משותף ללולאות.** `generateLoops` + OSM + `ourRoutes` מהשרת (מסלולים רשמיים ליד המוצא) + `friendlyRoute`. ה-route וקלי קוראים לו | `src/lib/routing/*` חדש, `src/app/api/routes/generate/route.ts`, `round4/aerobic.server.ts` | בינוני | **גל חדש** (Kelly routes) |
| F12 | **הכלי מחזיר מסלול אמיתי, והכרטיס פותח אותו.** `maxResults` 1 עד 3, גאומטריה ב-stash, והמפה מציגה את המסלול שנבחר בלי לייצר מחדש. גם בחיפוש לפי דקות (המרה לק״מ לפי קצב/הליכה) | `round4/aerobic*.ts`, `round4-actions.ts`, `lib/planned-run.ts`, מגירת המפה | בינוני-גבוה (נוגע במפה, חוק One-Card) | **גל חדש** (Kelly routes) |
| F13 | **A→B ודרך פארק מהצ'אט.** שדות `destination`/`viaParkId` (פארק מ-`find_nearby_parks`). A→B דרך `friendlyRoute`, ודרך פארק כ-viaLoop | `round4/tool-specs.ts`, `aerobic.server.ts`, prompt | בינוני | **גל חדש** (Kelly routes), אחרי F11 |
| F14 | **מסלולים רשמיים מהצ'אט.** כלי `find_official_routes` (קריאה בלבד: `official_routes`/`curated_routes` ליד המוצא), כרטיס שפותח את המסלול במפה | `round4/*` חדש | נמוך-בינוני (קריאה בלבד) | **גל חדש** (Kelly routes) |
| F15 | **Hybrid + תחנות כוח ב-GraphHopper.** להסיר את ההחרגה `includeStrength` ב-`eligible.ts` אחרי שיש viaLoop דרך פארק | `graphhopper-loops/*`, `loops/candidates.ts` | גבוה (מנוע מסלולים, כל משתמשי המפה) | **מחוץ לקלי** (route engine) |
| F16 | **בדיקת `ai_coach_phase2`.** אם דוד רוצה ש"תזיז לי אימון" יעבוד בצ'אט, צריך את הדגל | פאנל | נמוך | **מהיר** (החלטה של דוד) |

**סדר מומלץ:** F1 + F3 + F4 (PR אחד קטן, פותר את התלונה המרכזית) → F6 + F8 (העתק) → F7/F10 (תפעול) → F2 →
גל "Kelly routes" (F11 → F12 → F13/F14) → F5 בתוך K3/K8 → F9, F15 לפי החלטה.
