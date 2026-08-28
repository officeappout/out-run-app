# אודיט: 3 ממצאים מבדיקת מכשיר אחרי אימון hybrid (דף הבית)

> נוצר: 22.08.2026 | READ-ONLY — כל השלושה audit בלבד, אין קוד. ממצאים מבדיקת מכשיר אחרי השלמת אימון hybrid. קשור ל-[[hybrid-history-summary-mapping]] אך נושא נפרד (post-completion home state, לא history routing).

---

## Finding 1 — מחיקת אימון לא מרעננת completion state ב-home

### Root cause: **לא בעיית refresh/cache** — הנתונים עצמם לא הופחתו

`reverseStreakForToday` (`useActivityStore.ts:693-714`) נוגע **אך ורק** ב-`currentStreak`+`lastStreakDate`. **לא** נוגע ב-`today.categories[cat].minutes/.sessions`, ואין בסטור שום מתודת-נגד ל-categories (grep ל-remove/reverse/decrement חזר ריק).

`dayStatus`/`getDayStatus` (הזנת ה-card + SmartWeeklySchedule) נבנה מ:
- `categories` ← `activity.categories[cat].minutes` (`useDayStatus.ts:104-110`)
- `sessions` ← `categories[cat] >= STREAK_MINIMUM_MINUTES` (`:140-145`)
- `workoutDone` ← `dailyProgress.workoutCompleted` (`:119-126`, נכתב ע"י `markTodayAsCompleted`, לעולם לא מבוטל במחיקה)

אף אחד מהם לא קורא את השדות ש-`reverseStreakForToday` כן מטפל בהם — לכן ה-flame מתעדכן וכל השאר לא. **שום refresh/invalidate לא היה פותר את זה** — הנתון עצמו (בזיכרון וגם ב-Firestore) עדיין אומר שהאימון קרה.

### ⚠️ קונפליקט עם ההנחיה "אל תיגע ב-reversal logic"
תיקון אמיתי מחייב לוגיקת-reversal **חדשה**: (א) הפחתת `today.categories[cat]` לקטגוריות של האימון שנמחק, (ב) ביטול `dailyProgress.workoutCompleted` אם לא נותר אימון אחר היום. שני אלה מתנגשים ישירות עם ההנחיה המקורית של דוד. **לא הוכרע — דורש חזרה לדוד.**

### Scope: גנרי, לא hybrid-ספציפי
אותו פער קיים ל-cardio (`logWorkout` מגדיל `categories.cardio` בסיום, `useActivityStore.ts:516-517`, לעולם לא מופחת במחיקה). בדיקת ה-hybrid רק חשפה באג ישן/כללי ב-`deleteWorkoutWithReversal`.

### הכיוון הכי פחות-פולשני (אם ההנחיה תוסר בעתיד)
`deleteWorkoutWithReversal` step 3 (`workoutDeletion.ts:139-147`) כבר שואל את הדוקים שנותרו היום — אפשר לחשב-מחדש per-category minutes/sessions מהנותרים ולכתוב חזרה + `syncToServer`, ובמקביל לבטל `workoutCompleted` אם `remainingToday===0`. עדיין "reversal logic חדשה" — לא refresh-only.

---

## Finding 2 — אין "בוצע" ל-hybrid ב-RollingAgenda (הלוז הגדול)

> ⚠️ 22.08.2026 — דוד: הנושא הזה (הסימון בלוח הגדול, לכל סוגי האימון — לא רק hybrid) **עובר לצ'אט/thread נפרד**. האבחון למטה נשאר תקף כרפרנס, אבל אין להמשיך לתכנן/לתקן אותו בשרשור הזה.

### מנגנון נפרד לגמרי מ-Finding 1 — ולא נבנה מעולם לתמוך בזה (לא רק hybrid — גם strength רגיל)

`AgendaDayCard.tsx:794`: `isCompleted = runCompleted || primaryEntry?.completed`. `runCompleted` = סטטוס schedule-entry של **תוכנית ריצה** בלבד (`:711`). `primaryEntry.completed` = דגל על **userSchedule entry**.

היחיד שכותב completion לשם: `markSessionComplete` (`workout-completion.service.ts:90-130`), נקרא **רק** מ-`PlannedRun/index.tsx:86` (ריצת-תוכנית מתוכננת). `useHybridRun.finishHybrid` לא קורא לזה בכלל, ואין שום כתיבת `.completed=true` ל-userSchedule entries בקוד (grep ריק).

**מסקנה:** לא stale-state — פונקציונליות שמעולם לא נבנתה. גם strength "רגיל" (לא דרך תוכנית-ריצה) לא מסומן "בוצע" ב-planner היום; לא רק hybrid.

---

## Finding 3 — כרטיסי "מה הלאה" (post_workout suggestions) נעדרים אחרי hybrid

### זוהה: `SuggestionCarousel` דרך `postWorkoutSuggestions` (`home/page.tsx:1972-2006`)
generators: `partial-completion` ("השלם כוח"), `complementary-short` ("ריצה/הליכה"), `recovery-follow-up` ("התאוששות"), `safety-net` (fallback).

### ה-gate שהונח (richCategory/workoutType) **לא קיים** — negative confirmation מלאה
נבדק כל שלב: trigger (`home/page.tsx:868-885`, לא קורא workoutType), generators' `eligible()` (לא hybrid-מוחרגים, `safety-net`/`recovery-follow-up` כמעט תמיד `true`), render gate (`postWorkoutCarouselReady`, לא תלוי בסוג אימון). **אין נקודה אחת שמחריגה hybrid.** ה-`richCategory===null` שגורם ל-Bug 1 (TodayActivityStrip) שייך לבאג אחר לגמרי — לא בשימוש כאן.

### החשוד האמיתי — data-delivery, לא gate (דורש אימות ב-device log, לא ניתן להכרעה סטטית)
`saveHybridWorkout` ו-`syncWorkoutCompletion` יושבים **באותו try block** ב-`finishHybrid` (`useHybridRun.ts:185-248`). אם `saveHybridWorkout` (`:190`) זורק — `syncWorkoutCompletion` (`:210`) מדולג לגמרי → לא נכתב `post_workout_completed` sessionStorage ולא רץ `markTodayAsCompleted` → שני מקורות ה-trigger (`postWorkoutData`, `todayWorkoutDone`) נשארים ריקים/false → carousel אף פעם לא יורה. זו שבירות **ספציפית ל-hybrid** (strength עובר דרך מסלול נפרד, `runActivitySync`).

**צעד הבא המומלץ:** לאמת ב-device log האם `postWorkoutData`/`todayWorkoutDone` נקבעים בפועל אחרי hybrid completion אמיתי. אם שניהם false — התיקון הוא ב-`finishHybrid`'s error handling (למשל להפריד את ה-try blocks / not let a save failure swallow the sync), לא בקוד ה-carousel עצמו.

### ✅ 22.08.2026 — ההשערה הראשונה נשללה בבדיקה חיה; ליד חדש נמצא ובבדיקה
בדיקת מכשיר עם 6 לוגי `TEMP-DEBUG-hybrid-finish` (עדיין uncommitted ב-`useHybridRun.ts`) אישרה: `saveHybridWorkout` ו-`syncWorkoutCompletion` **שניהם הצליחו** — אין throw, אין catch שהופעל. ה-try-block המשותף **אינו** שורש הבעיה.

**ליד חדש (נמצא בקריאת קוד, טרם אומת חי):** ב-`home/page.tsx` (סביב שורה 877, effect ה-suggestions), `runSuggestionEngine(context).then(...)` **חסר `.catch()`**. אם ה-promise נדחה — `postWorkoutSuggestions` נשאר `null` לצמיתות, בלי שגיאה גלויה, ובלי ליפול ל-fallback (ה-timeout הקיים הוא `setTimeout` נפרד, לא קשור לדחיית ה-promise עצמו). תואם בדיוק את הסימפטום. הערה תומכת: `safety-net.generator.ts` הוא `eligible:()=>true`, מתועד כ-"cannot throw, cannot return null" — כלומר בתנאים רגילים `runSuggestionEngine` **תמיד** אמור להתפתר עם ≥1 הצעה, לכל סוג אימון כולל hybrid. היעדרות מוחלטת מצביעה על כשל *לפני/תוך* ה-resolution, לא על generators שמחזירים ריק באופן לגיטימי.

**בוצע (uncommitted, `home/page.tsx`):** נוסף `.catch()` עם `console.error` + לוגים זמניים נוספים (`[TEMP-DEBUG-post-workout-suggestions]`) — בתחילת ה-effect (postWorkoutData/todayWorkoutDone/profile/carouselEnabled), לפני קריאת `runSuggestionEngine`, ב-resolve (כמות+תוכן), וב-reject. TSC נקי. ממתין לבדיקת מכשיר אמיתית.

**לאחר שהסיבה תאומת/תתוקן:** לדגול `POST_WORKOUT_SUGGESTION_CAROUSEL_ENABLED` (`src/config/feature-flags.ts`, כרגע `false`) ל-`true` — החלטת דוד לגלגל לכולם, לא רק admin. **לא לדגול לפני שצעד הבדיקה החי מאשר שהמקרה ההיברידי עובד** — כדי לא לשגר את אותו כשל שקט לכולם.

### ✅ Finding 3 — סגור, commit `adbdf485`
השורש האמיתי: `POST_WORKOUT_SUGGESTION_CAROUSEL_ENABLED` היה `false`, וה-fallback היחיד שהפעיל את ה-carousel היה admin-email allowlist — לא רץ לחשבון לא-admin. `runSuggestionEngine`/`saveHybridWorkout` מעולם לא היו הבעיה (אושר חי — שני ה-TEMP-DEBUG traces רצו נקי). דוד ראה כרטיסים חיים אחרי אימון hybrid אמיתי לאחר שהדגל הודלק. תוקן: הדגל `true`, ה-admin-email fallback הוסר (מת מעכשיו), נוסף `.catch()` קבוע ל-`runSuggestionEngine(...).then()` (פער אמיתי נפרד שנמצא — לא השורש הזה, אבל שווה תיקון). כל 6+7 לוגי TEMP-DEBUG (משני הקבצים) הוסרו, `useHybridRun.ts` byte-identical ל-HEAD. Independent review — PASS.
