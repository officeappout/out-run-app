# אודיט: מנגנון "בוצע" — 5 מקורות-אימון × 2 מסכים (Planner + Home Strip)

> נוצר: 22.08.2026 | READ-ONLY — audit בלבד, אין קוד. מענה לבקשת דוד: לפני בניית "כל אימון שבוצע מופיע בלוח תכנון-אימונים ככרטיס נעול+מסונכרן עם דף-הבית", למפות איך זה עובד היום לכל אחד מ-5 המקורות (כוח מהבית, קבוצתי, מתוך תוכנית-ריצה, ריצה חופשית עם/בלי מסלול, היברידי), בכל אחד מ-2 המסכים.
> קרא לפני כל עבודה על: TrainingPlannerOverlay / RollingAgenda / AgendaDayCard / SmartWeeklySchedule / completion-sync.service.ts.
> PLACEHOLDER: אין — כל שורה מטה מאומתת קוד-חי (5 חקירות מקבילות, 22.08.2026), כולל תיקון-הנחה-שגויה מאודיט קודם (ראה §0).

---

## §0 — התיקון הכי-חשוב: ההנחה הקודמת הייתה שגויה

אודיט קודם ([[hybrid-completion-state-gaps]]) טען: *"היחיד שכותב completion ל-userSchedule: `markSessionComplete`"*. **זה לא מדויק.** מאומת עכשיו: **אף קוד בכל הריפו לא כותב אי-פעם `completed: true` לשדה `userSchedule.entries[].completed`.** גם `markSessionComplete` לא — הוא כותב למקום אחר לגמרי:

- `markSessionComplete` (`workout-completion.service.ts:90-130`) כותב ל-`users/{uid}.running.activeProgram.schedule[]` (מערך על מסמך הפרופיל) — **לא** לקולקציית `userSchedule`.
- אימוני-ריצה-מתוכנית **לא חיים ב-`userSchedule` בכלל** — הם מחושבים חי מ-`profile.running.activeProgram.schedule` דרך `resolveRunningEntry` (`AgendaDayCard.tsx:178-223`).
- `userSchedule/{uid}_{date}.entries[].completed` — שדה אמיתי, קיים בסכימה (`schedule.types.ts:65`), אבל **כל כותב שנמצא (7 מקומות שונים) כותב אליו רק `false`**, אף פעם לא `true`. גם `entries[].completedWorkoutId` (אמור לקשר ל-doc של האימון עצמו) — נקרא רק, לעולם לא נכתב.

**המשמעות: השדה `userSchedule.completed` מת מבנית לכל סוגי-האימון — לא רק ל-hybrid/strength כמו שחשבנו, אלא גם ל-community/group.** רק ריצה-מתוכנית יש לה איתות-completion אמיתי בכלל, וגם הוא **לא** דרך `userSchedule`.

---

## §1 — שני מקורות-אמת קיימים היום (לא מסונכרנים)

| ציר | Collection | נכתב-ע"י | נקרא-ע"י |
|---|---|---|---|
| **Home Strip (B)** | `dailyProgress/{uid}_{date}.workoutCompleted` | `markTodayAsCompleted` (`useProgressionStore.ts:846-973`), נקרא **רק** מתוך `syncWorkoutCompletion` (`completion-sync.service.ts:71-172`) | `useDayStatus.ts:119-126` (`workoutDone`) → `SmartWeeklySchedule.tsx:1356` (`resolveDayDisplayProps({isCompleted: dayData.workoutDone})`) |
| **Planner (A) — non-running** | `userSchedule/{uid}_{date}.entries[].completed` | **אף אחד** (§0) | `AgendaDayCard.tsx:794` (`primaryEntry?.completed`), `:990` (`e.completed` לכל כרטיס) |
| **Planner (A) — running** | `users/{uid}.running.activeProgram.schedule[].status==='completed'` | `markSessionComplete` (`workout-completion.service.ts:116-122`), נקרא **רק** מ-`PlannedRun/index.tsx:86`, אחרי שהמשתמש לוחץ "שמור" על מסך-הסיכום + תלוי ב-sessionStorage keys ששרדו | `AgendaDayCard.tsx:711` (`runCompleted`), מוזן ל-`isCompleted` ב-`:794` |

`activity` axis שלישי, נפרד: `dailyActivity/{uid}_{date}` (via `useActivityStore`) — מזין `categories`/`sessions`/streak, **לא** את "בוצע" עצמו (ראה §4).

---

## §2 — טבלת 5 מקורות × 2 מסכים (המצב היום, בפועל)

| # | מקור | Home Strip (B) | Planner (A) | פער |
|---|---|---|---|---|
| 1 | **כוח מהבית** (home-built strength) | ✅ `useActivitySync` (`useActivitySync.ts:195`, בתוך `runActivitySync`) → `syncWorkoutCompletion(workoutType:'strength')` | ❌ אין קשר בכלל. גם אם המשתמש הקיש על כרטיס-פלאנר-קיים כדי להתחיל — `entryId` **נזרק** לפני יצירת האימון (`home/page.tsx:1563` `openWorkoutPreview` בונה מ-`generatedWorkoutRef`, בלי `entryId`; `grep entryId` בכל `workout-engine/` = 0 תוצאות). ואם לא הייתה entry מראש — לא נוצר כרטיס בכלל (§5). | **מלא** — אפס-חיבור ל-planner בשני התרחישים (עם/בלי entry קודם) |
| 2 | **קבוצתי** (group/community) | ✅ יורש את מנגנון-הריצה הרגיל — `useRunningPlayer.finishWorkout()` קורא `syncWorkoutCompletion` ללא-תנאי (`useRunningPlayer.ts:1846-1854`), בלי הבחנה group/solo | ⚠️ **entry כן קיים מראש** (12 שבועות קדימה, `addCommunitySessionsToPlanner`, `communitySchedule.service.ts:83-121`, נקרא מ-`joinGroup`, `group.service.ts:314-333`) — אבל `.completed` שלו לעולם לא נכתב (§0) | entry קיים, רק לא-מסומן — פער-כללי (יורש את §0), לא ספציפי-לקבוצה |
| 3 | **מתוך תוכנית-ריצה** (planned run) | ✅ אותו קריאה בלתי-מותנית כמו #2/#4 (`useRunningPlayer.ts:1846-1854`) — **תמיד יורה**, גם אם ה-flow ננטש | ⚠️ **חצי-עובד, שביר**: `markSessionComplete` יורה **רק** אם המשתמש הגיע ל-"שמור" על מסך-הסיכום + `sessionStorage['planned_run_week'/'day']` שרדו. ריצה-שננטשה/back-navigation = home strip כבר מסומן ✅, פלאנר נשאר "pending" — **סתירה קיימת גם למקור שכן "עובד"** | חלקי — עובד רק ב-happy-path, ולא דרך `userSchedule` (דרך מערך נפרד) |
| 4 | **ריצה חופשית** (עם/בלי מסלול) | ✅ אותה קריאה בלתי-מותנית ב-`finishWorkout` (זהה ל-#2/#3, `workoutType` תמיד `'running'`) | ❌ בד"כ אין entry מראש בכלל (מאושר: `handleStartFree`/`handleStartWithRoute` מוגבלים ל-`timing==='now'`) → אפס כרטיס בפלאנר, גם אחרי סיום | **מלא** — אין entry לסמן, ואין מנגנון ליצור כרטיס-לאחר-מעשה |
| 5 | **היברידי** | ✅ `useHybridRun.finishHybrid` (`:214-225`) → `syncWorkoutCompletion(workoutType:'hybrid', categorySplits:[...])` | ❌ אין קשר בכלל — `grep "markSessionComplete\|userSchedule" useHybridRun.ts` = 0. **גם אין slot בסכימה**: `WorkoutBuilderSheet.tsx:704` מקשיח `scheduledCategories:['strength']` אפילו ל-hybrid; `workout-type-mapping.ts` מתעד בפירוש "hybrid ייתווסף Phase 2" | **מלא** — גם התנהגותי וגם סכימתי (`'hybrid'` לא קיים כ-`entry.type`) |

**שורה תחתונה: Home Strip (B) כבר מאוחד ועובד לכל 5 המקורות** (קריאה יחידה, `syncWorkoutCompletion`, מ-3 call sites בלבד: strength/running/hybrid — group וfree-run יורשים running). **הפלאנר (A) שבור לכל 5 המקורות**, כולל #3 שאמור "לעבוד" בהצלחה-חלקית-בלבד.

---

## §3 — ממצא-בונוס קריטי: המסך הפנימי כבר סותר את עצמו היום, גם בלי לגעת ב-5 המקורות

`TrainingPlannerOverlay` מרנדר **שני** רכיבי-completion עצמאיים לאותו תאריך, שקוראים איתותים שונים:

- **`MonthlyCalendarGrid.tsx`** (גריד-הימים העליון, `TrainingPlannerOverlay.tsx:359-372`) — **כן** מגשר ל-`dailyProgress`: `todayCompletedOverride` (`:121-124`, doc comment מפורש) מזין `isCompleted = cell.isToday ? (todayCompletedOverride ?? primary?.completed ?? false) : (primary?.completed || pastProgressCompleted || false)` (`:158-160`).
- **`RollingAgenda`/`AgendaDayCard`** (רשימת-הכרטיסים, מתחת לגריד, `TrainingPlannerOverlay.tsx:415-429`) — **לא** — אפס grep-hits ל-`dailyProgress`/`useDayStatus`/`useActivityStore` בכל שני הקבצים. תלוי אך ורק ב-`userSchedule.completed` המת (§0).

**תוצאה: אותו תאריך, אותו מסך — נקודת-הגריד למעלה יכולה להראות ✅ (כי `dailyProgress` בפועל התעדכן), בעוד שורת-הכרטיס למטה מראה ❌ (כי `userSchedule.completed` אף פעם לא true).** זה באג חי היום, לא תרחיש-קצה — קורה לכל אימון שהושלם דרך strength/hybrid/free-run/group.

---

## §4 — חובות-טכניים גנריים שנחשפו (לא ספציפי למקור בודד — משפיעים על כל תוכנית-תיקון)

1. **מחיקה לא מבטלת completion, באף מסך** (מאשר-מחדש [[hybrid-completion-state-gaps]] Finding 1, ומרחיב: זה **גנרי לחלוטין**, לא hybrid-ספציפי). `reverseStreakForToday` (`useActivityStore.ts:693-714`) נוגע רק ב-`currentStreak`/`lastStreakDate` — לא ב-`dailyActivity.categories` ולא ב-`dailyProgress.workoutCompleted`. מחיקת האימון היחיד של היום משאירה גם flame וגם planner "בוצע" דלוקים.
2. **שני writes לא-אטומיים, כשלים בשקט.** `syncWorkoutCompletion` כותב קודם ל-`dailyActivity` (`:86-90`) ואז ל-`dailyProgress` (`:100-104`, `.catch(err => console.error(...))` — לא נזרק הלאה, לא נעשה retry). כישלון ב-write השני = הרצועה (הקוראת רק `dailyProgress.workoutCompleted`) לא תדלוק, למרות שהדקות נרשמו.
3. **חוסר-סנכרון timezone.** `useDailyProgress` מחשב "היום" ב-UTC (`new Date().toISOString().split('T')[0]`); `useActivityStore` מחשב local-day במפורש (תיעוד-קוד מפורש בקובץ). בשעות-ערב בישראל (UTC+2/3) שני ה-hooks עלולים לקרוא/לכתוב ל-doc-id של יום אחר.
4. **`completedWorkoutId` — שדה-קישור מת.** קיים בסכימה (`schedule.types.ts:66`, קומנט "set when the workout session is finished"), אבל בפועל **רק מנוקה ל-`undefined`** (`userSchedule.service.ts:440`), לעולם לא נכתב. אין דרך היום לדעת איזה `workouts`-doc השלים איזו `userSchedule`-entry.
5. **הקשה על כרטיס-פלאנר-קיים כדי להתחיל אימון-כוח לא שומרת את זהות-ה-entry.** גם אם ייבנה מנגנון-completion — הוא לא ידע לאיזה entry לשייך את ההשלמה בלי plumbing נוסף (ראה §5.3).

---

## §5 — החלטות פתוחות (עודכן 22.08.2026 אחה"צ — אושר ע"י דוד: זו ה"separate chat" שה-F2 park הצביע עליה; אין collision עם ה-uncommitted debug-log ב-`useHybridRun.ts`, זה שייך לשיחה נפרדת לגמרי, post-workout-suggestions)

**נפתר כבר, לא-פתוח יותר:** מקור-אמת יחיד לצד-הפלאנר — `parking-lot.md` "Schedule — source-of-truth consolidation" (22.07.2026) כבר קבע ש-`dailyProgress.workoutCompleted` (S8) הוא מקור-האמת ל"בוצע", עם bridge קיים ב-`MonthlyCalendarGrid`. הבנייה כאן פשוט מרחיבה את אותו bridge ל-`AgendaDayCard`.

**מחוץ-לסקופ במפורש (דוד, 22.08.2026):** אישור/דחיית `delete-reversal-fix-plan.md` (Bug1/reversal) — **לא כאן**, נעקב בשיחה נפרדת. אם #3 למטה (שביריות ריצה-מתוכנית) בסקופ, הוא **טכני בלבד**, לא כרוך באישור תוכנית-ה-reversal.

5 החלטות שנותרו פתוחות, לפי סדר-עדיפות (עוברים עליהן אחת-אחת בצ'אט):

1. **כרטיסים ל-workout שלא תוכנן מראש (מקורות #1/#4)** — הפריט הכי-גדול. שאלת-scope: הכל-בבת-אחת מול שני-שלבים.
2. **קישור workout↔entry** (`completedWorkoutId`) — matching רופף (יום+קטגוריה) מול plumbing מלא של `entryId`.
3. **שביריות ריצה-מתוכנית** (§2 שורה #3) — לתקן באותה עבודה (הפוך את ה-planner-write לבלתי-מותנה בתוך `finishWorkout`, כמו ה-home-strip write) או טיקט נפרד? **טכני בלבד — לא נוגע ב-delete-reversal.**
4. ~~סכימה ל-hybrid~~ — **הוחלט (22.08.2026), עודכן להיקף גדול-יותר ממה שהוצע:**
5. **UX-נעילה לסוגים שכבר לא-ניתנים-לגרירה מסיבות אחרות** (ריצה, קבוצתי) — קוסמטי, עדיפות נמוכה.

---

## §5.4 — הוחלט: סכימת-hybrid + גרדיאנט דינמי (לא צבע קבוע), 22.08.2026

**דוד דחה את שתי האופציות שהוצעו וקבע גרסה שלישית, מאומתת-קוד ומדויקת:**

1. **כן** להוסיף `'hybrid'` כערך אמיתי ל-`ScheduleEntryType`/`scheduledCategories`/`BuilderWorkoutType` — כבר מתוכנן-מראש בקומנט בקוד: `workout-type-mapping.ts` אומר במפורש "hybrid type will be ADDED here (Phase 2)".
2. **לא צבע כתום קבוע.** במקום זה — **גרדיאנט על הכרטיס** לפי היחס האמיתי כוח/אירובי של אותו אימון hybrid ספציפי, באותה שיטה שכבר בנויה למסלולי-hybrid במפה:
   - `HYBRID_AER = '#10B981'` (ירוק, אירובי) + `HYBRID_STR = '#06B6D4'` (ציאן עמוק, כוח) — **מאומת קוד**: `src/features/parks/core/components/hybrid/hybrid-colors.ts:14,18` — "SINGLE SOURCE OF TRUTH for hybrid MODALITY colors... Do NOT redefine #10B981 / #06B6D4 anywhere else."
   - `buildHybridRouteGradient(stationFracs, band)` (`hybrid-colors.ts:31-52`) — בונה Mapbox `line-gradient` expression; היום נצרך רק ע"י `AppMap.tsx:485`. הכרטיס בפלאנר צריך **אנלוגיה** של אותו רעיון (גרדיאנט CSS לפי יחס, לא expression של Mapbox) — לא קריאה ישירה לפונקציה הזו (שמייצרת מבנה-נתונים ל-Mapbox, לא CSS).
   - היחס עצמו **כבר קיים** ברמת ה-preset: `EMPHASIS_TO_SHARE` (`hybrid-slots.ts:50-54`) — `{ aerobic: 0.7, balanced: 0.55, strength: 0.35 }` — מאומת קוד, ערכים מדויקים. נצרך היום ע"י `presetToIntent` (`:167`) לבניית `aerobicShare` על ה-`HybridStartIntent` — **ברגע-ההתחלה בלבד**, לא נשמר לשום מקום קבוע.
3. **תוספת-סכימה נדרשת, מאומתת:** `UserScheduleEntry` (`schedule.types.ts:57-91`) **אין לו היום שום שדה ליחס** (יש `scheduledCategories`/`programIds` בלבד — אין `aerobicShare`/`emphasis`). צריך שדה חדש (`aerobicShare` או `emphasis`) שנשמר על ה-entry **ברגע התזמון** (כשנבחר preset ל-hybrid יום ספציפי), כדי ש-`AgendaDayCard` יוכל לקרוא את היחס האמיתי ולבנות גרדיאנט לפיו — לא ערך-דמה. **פולבק ל-entries ישנים/ללא preset ידוע** (למשל hydration מ-recurring template): `balanced` (0.55).
4. **גם `color-system.md` צריך עדכון** — המוסכמה החדשה (גרדיאנט דינמי, לא צבע-קבוע) צריכה להשתקף שם, לא רק בקוד.

**היקף מוגדל מהמוצע במקור:** זה כולל (א) שדה-סכימה חדש ב-`UserScheduleEntry`, (ב) העברת ה-preset/emphasis שנבחר בזמן-תזמון-hybrid אל ה-entry (מסלול-כתיבה חדש, לא רק קריאה), (ג) קומפוננטת-גרדיאנט CSS חדשה ב-`AgendaDayCard`/`day-display.utils.tsx` (אנלוגית ל-`buildHybridRouteGradient` אך ל-CSS לא ל-Mapbox), (ד) עדכון תיעוד.

---

## §6 — התוכנית הסופית, נעולה (כל 5 ההחלטות הוכרעו 22.08.2026)

**מחוץ-לסקופ (אושר במפורש):** אישור/דחיית `delete-reversal-fix-plan.md` — עוקבים בשיחה נפרדת.

### Stage A — חיבור entries קיימים (הראשון להיבנות)
מקורות: #2 קבוצתי, #3 ריצה-מתוכנית (כולל תיקון-שביריות), #5 היברידי (אחרי תוספת-סכימה).

1. **תשתית-סכימה ל-hybrid** (§5.4, נעול): `entry.type='hybrid'` + שדה חדש `aerobicShare`/`emphasis` על `UserScheduleEntry` (נכתב ברגע-התזמון של preset היברידי; פולבק `balanced`=0.55 לרשומות ישנות/לא-ידועות) + מסלול-כתיבה חדש שמעביר את ה-preset הנבחר אל ה-entry + קומפוננטת-גרדיאנט CSS חדשה ב-`AgendaDayCard`/`day-display.utils.tsx` (משתמשת ב-`HYBRID_AER`/`HYBRID_STR` מ-`hybrid-colors.ts`, **לא** קוראת ל-`buildHybridRouteGradient` עצמה — זו בונה Mapbox expression, כאן צריך CSS) + עדכון `color-system.md`.
2. **קישור מדויק, לא רופף** (§5.2, נעול): לחוט `entryId` דרך זרימת ה-start עבור community (`groupId`+`date` כבר זמינים ב-`joinGroup`/`addCommunitySessionsToPlanner`) ו-hybrid, ולכתוב אותו ל-`completedWorkoutId` ברגע ה-completion — לא matching של יום+קטגוריה.
3. **תיקון-שביריות ריצה-מתוכנית** (§5.3, נעול): להעביר את ה-planner-write (מקביל ל-`markSessionComplete`) לתוך `finishWorkout` הבלתי-מותנה — עקבי לאותו סגנון-כתיבה כמו #2/#5, במקום תלוי ב-"שמור"+sessionStorage.
4. **איחוד איתות-ה"בוצע" ב-`AgendaDayCard`:** לאמץ/להרחיב את ה-bridge שכבר קיים ב-`MonthlyCalendarGrid` (`todayCompletedOverride`) — סוגר את הסתירה הפנימית (§3) וקורא את הקישור-המדויק החדש מ-(2).
5. **נעילת-גרירה + עקביות-ויזואלית** (§5.5, נעול): `isDraggable = isDraggable && !isCompleted` (או ברמת-entry) — **וגם** לתת לכרטיסי ריצה-מתוכנית/קבוצתי (כבר לא-ניתנים-לגרירה מסיבות מבניות אחרות) את אותה תצוגה-ויזואלית "נעול", לא רק למנוע גרירה בלי אינדיקציה.
6. **QA חוצה-מסכים ל-Stage A:** לוודא ש-#2/#3/#5 מראים מצב זהה בשני המסכים, בלי כפילות, בלי סתירה — כולל on-device.

### Stage B — סינתזת-כרטיסים לאד-הוק (המשך נפרד, אחרי ש-Stage A נבנה ואומת)
מקורות: #1 כוח-מהבית (בלי entry קודם), #4 ריצה-חופשית.

7. הרחבת מודל-הרינדור של `RollingAgenda`: כשיש `dailyProgress.workoutCompleted=true` ליום מסוים בלי entry תואם ב-`userSchedule`, לסנתז כרטיס-אחרי-מעשה. דורש עיצוב נפרד (מקור-הנתונים לכרטיס הסינתטי, טיפול ב-entryId-קישור כשאין entry מלכתחילה) — לא סקופ בהחלטות 1-5, ייפתח כתוכנית-משנה נפרדת כשמגיעים אליו.

### מחוץ-לסקופ, נעקב בשיחה נפרדת
- `delete-reversal-fix-plan.md` (Bug1) — אישור/דחייה שם, לא כאן.

---

## מקורות (5 חקירות-קוד מקבילות, 22.08.2026, כל ממצא מאומת file:line טרי)
- Explore agent — ארכיטקטורת TrainingPlannerOverlay/RollingAgenda/AgendaDayCard
- Explore agent — ארכיטקטורת SmartWeeklySchedule/useDayStatus
- Explore agent — נתיב-כתיבה קבוצתי (group workout)
- Explore agent — נתיב-כתיבה ריצה-חופשית (עם/בלי מסלול)
- Explore agent — cross-check כוח-מהבית + ריצה-מתוכנית, כולל שאלת "התחלה-מכרטיס-קיים"
