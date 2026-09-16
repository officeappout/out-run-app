---
name: execution-method-identity-plan
description: Planning doc — the engine's chosen ExecutionMethod has no identity that survives persistence, so every display consumer re-resolves independently; verified-index design + staged rollout (Stage 1 = log-only, approved; Stages 2-5 = separate reviews)
metadata:
  type: project
---

# Execution-Method Identity — תכנון (מסמך, לא קוד)

**סטטוס: התכנון אושר ע"י דוד (15-16.09.2026) עם שני שינויים, המשולבים כאן. שלב 1 בלבד מאושר-לביצוע (לוג בלבד, ענף נפרד, לא ממוזג). שלבים 2-5 לא מאושרים — כל אחד קומיט נפרד עם ביקורת נפרדת.**

**קונטקסט:** המעקב הקודם (שכבת-התצוגה) מצא את השורש — המנוע בוחר `ExecutionMethod` בזמן-יצירה (`selectMethodForContext`), אבל שום דבר על *איזו* שיטה נבחרה לא שורד לתוך מה שנשמר. כל צרכן-תצוגה מחשב-מחדש עצמאית, בלוגיקה חלשה יותר מהמנוע.

**מתודולוגיה:** נבדק ישירות בקוד — אימות-חוזר של `ExecutionMethod` (`exercise.types.ts:424-538`, אין שדה `id` בשום מקום), אימות-חוזר של רשימת-הצרכנים דרך Plan agent שקרא את הקבצים בפועל ומצא כמה תיקונים/הרחבות לממצא המקורי (מסומנים למטה), ואימות-נוסף (בקשת-דוד, סבב-סקירה) על `workout-conversion.utils.ts`'s חומרה.

---

## ⚠️ תיקונים לממצא המקורי, שנמצאו תוך-כדי התכנון

1. **`workout-plan.mapper.ts` הוא קוד מת היום, לא מסלול-שמירה חי.** grep מלא — אף קובץ לא מייבא ממנו חוץ מהטסט שלו עצמו. מסלול-השמירה האמיתי (drawer→runner) הוא `useWorkoutSession.ts:64-123`, שקורא לפונקציה **שלישית ונפרדת**: `buildRunnerWorkoutPlanFromGenerated.ts`. **כלומר יש לפחות 3 עותקים עצמאיים** של "לשטח GeneratedWorkout ל-WorkoutPlan" — `home/page.tsx` inline, `buildRunnerWorkoutPlanFromGenerated.ts` (חי), ו-`workout-plan.mapper.ts` (יתום).
2. **שלושת העותקים האלה כבר סוטים זה מזה — הוכחה חיה לבעיה.** `home/page.tsx:1935-1936,1976` ו-`buildRunnerWorkoutPlanFromGenerated.ts:102,141` שניהם אופים `bunnyVideoId` (בדיוק כדי למנוע re-derive שגוי, לפי ההערה ב-`home/page.tsx:1972-1975`) — אבל `workout-plan.mapper.ts:96-98` **אין לו את השדה הזה בכלל**, כי הוא לא עודכן כשהתיקון-ההוא נחת במקומות האחרים.
3. **יש לפחות 4 מימושי-בחירה נפרדים, לא "מנוע אחד + סקאנים אד-הוק":**
   - `selectMethodForContext` (`method-selection.utils.ts:57-222`) — מודע-ציוד-ומיקום, מקור-האמת בזמן-יצירה, גם `useSwapAll.ts` קורא לו.
   - `selectExecutionMethodWithBrand` (`execution-method-selector.service.ts`) — נפרד, מודע-מותג/מתקן, רק ל-`ExerciseReplacementModal.tsx`.
   - `findMethodForLocation` (`exercise.types.ts:853-877`) — helper משותף פשוט (מיקום-מדויק→locationMapping→כל-עם-מדיה→`methods[0]`), בשימוש כ-5 מהצרכנים ה"אד-הוק".
   - סקאנים inline מלאים, בלי שום helper — `useExerciseDerivedValues.ts` ו-`MasterExerciseView.computeSeedIdx`.
4. **קיים כבר מסלול-תשתית שמעביר אינדקס עד הנקודה המדויקת שצריך לשמור אותו — ונוטש אותו שם בדיוק.** `MasterExerciseView.tsx:118` — `onMethodChange?: (method, methodIdx: number) => void`, וה-switcher (`:700-708`) קורא לו עם שניהם. זה זורם עד `ExerciseDetailDrawer.tsx:35,120` בלי שינוי. אבל ה-handler האמיתי, `WorkoutPreviewDrawer.tsx:264-279` (`handleSingleMethodChange`), מוגדר כ-`(method: ExecutionMethod) => {...}` — **לא מקבל את הפרמטר השני בכלל**. האינדקס נזרק בדיוק בגבול הזה. אותו דבר במסלול-הקבוצתי (`useSwapAll.ts`→`derive-swapped-entry.util.ts:78-92`).
5. **שני צרכנים נוספים, לא היו ברשימה המקורית:** `src/app/workouts/[id]/overview/page.tsx:36,58-68,89,110,130,150` (`execution_methods?.[0]` חזור-ונשנה) — קור-פתיחה מ-Firestore, אין בחירה-שמורה לקרוא. `workout-conversion.utils.ts` — **ר' סעיף חדש למטה, חומרה עודכנה אחרי בדיקה.**
6. **אושר-מחדש בקריאה ישירה:** אין שדה `id`/`methodId` על `ExecutionMethod` (`exercise.types.ts:424-538`, נקרא שוב במלואו). עורך-האדמין מוכיח שאינדקסים לא-יציבים באמת: `MethodsSection.tsx:260-276` (`duplicateMethod`, `splice`) ו-`:304` (`removeMethod`) שניהם מזיזים כל אינדקס שאחריהם, בלי אזהרה.

---

## 🔍 בדיקה נוספת (בקשת דוד) — `workout-conversion.utils.ts`, האם זה מסביר את התסמין

**נבדק ישירות: מי קורא ל-`convertExercisesToWorkoutPlan`, ובאיזה הקשר.** grep מלא (לא הסקה) — **קורא-אמיתי אחד בלבד**: `useExercisePool.ts:86`. `useExerciseDerivedValues.ts:395` הוא **הערת-קוד בלבד** (מזכיר את השם, לא קורא לפונקציה).

**ההקשר המדויק, מתועד בקוד עצמו (`useExercisePool.ts:24-37`):** ההוק הזה מנהל שני קאשים נפרדים. הענף שקורא ל-`convertExercisesToWorkoutPlan` (שורה 86) הוא ה-`workoutPlan` הישן/"legacy" — **מופעל אך ורק כש-`!generatedWorkout`** (שורה 76: `if (isOpen && !generatedWorkout && !workoutPlan && ...)`), עם ההערה המפורשת: *"only populated on the legacy path where the drawer receives no `generatedWorkout` (e.g. the favorites flow)... Skipped entirely when `generatedWorkout` is present — that payload is the source of truth"* (שורות 32-36).

**מסקנה עובדתית:** לאימון-פארק-אמיתי-שנוצר-ע"י-המנוע, `generatedWorkout` **תמיד** קיים — הענף הזה **תמיד נדלג**. `'home'` הקשיח (`workout-conversion.utils.ts:34,60,79,137,188`) לא רץ במסלול הזה בכלל. **הוא לא יכול להיות ההסבר לתסמין שדוד דיווח (אימון-פארק-אמיתי עם תוכן-בית).** מה שהוא כן — באג נפרד, אמיתי, מאומת: כל תרחיש שבו המגירה נפתחת *בלי* `generatedWorkout` (התרחיש שהתיעוד-בקוד עצמו קורא לו "favorites flow", ו/או מסך-שלד לפני-generation) יקבל תמיד הטיה-לבית, בלי קשר למיקום-האמיתי של המשתמש. **חומרה: אמיתי, אבל מוגבל למשטח-שימוש נמוך ומוגדר-במפורש — לא מוגדל לראש-הרשימה, כי הבדיקה-בפועל שוללת שהוא מסביר את התסמין העיקרי.** נשאר-כתועד כתיקון-נפרד-קטן, לא חלק מהעבודה הזו.

**⚠️ עדיין פתוח, לא נבדק:** מה בדיוק מסביר את התסמין המקורי אם לא זה. שני המועמדים החזקים ביותרים שכן פעילים במסלול-האמיתי (מתועד במעקב הקודם): (1) `selectMethodForContext`'s Priority 2.5/3 fallback (`method-selection.utils.ts:193-218`, בוחר שיטה-של-מיקום-אחר לפי-ציוד-בלבד, פעיל בסינון-הראשי) — לא ספציפי-לקובץ-הזה; (2) `cooldown.service.ts`'s "nuke fallback" (`:98-127`) שמדביק `location:'home'` קשיח. אלה כבר תועדו במעקב הקודם — לא נבדקו-מחדש כאן.

---

## 1. מצב נוכחי — שלוש שורות

- **נשמר:** תוכניות-sessionStorage (המסלול היומיומי) שומרות רק שדות-נגזרים אפויים (`videoUrl`/`imageUrl`/`fullTutorial`/לפעמים-`bunnyVideoId`, `equipment` משוטח, `highlights`) מהשיטה-שנבחרה — **וגם**, בנפרד, את מערך `execution_methods` הגולמי-המלא בשלמותו. מסמכי `sharedWorkouts` ב-Firestore (המסלול היחיד עם כתיבה אמיתית) שומרים רק שדות-טקסט-נגזרים, בלי המערך הגולמי בכלל.
- **לא נשמר:** שום מצביע ל*איזו* מהרשומות נבחרה — לא אינדקס, לא מזהה (אין כזה בכלל על `ExecutionMethod` היום).
- **מי מחשב-מחדש:** לפחות 4 מימושי-בחירה עצמאיים שכל אחד עלול לנחות על שיטה שונה מזו שהמנוע בפועל בחר.

## 2. שתי חלופות למימוש

### א. אינדקס מאומת (לא עיוור) — **הכיוון המאושר**

**התיקון על ההצעה המקורית (דוד):** לזהות שאינדקס לא-שורד-סידור-מחדש הוא לא סיבה לוותר על החלופה — אלא לאמת אותה. **לשמור `methodIndex` יחד עם מחרוזת-המיקום של השיטה-שנבחרה (המחרוזת כבר נשמרת היום, כחלק מהשדות-האפויים).**

**מנגנון-קורא:** `const m = methods[we.methodIndex]; if (m && locationMatches(m, we.savedMethodLocation)) { use m; } else { /* אינדקס-מיושן — לוג + נפילה לשרשרת-הקיימת */ }`.

**התוצאה: אינדקס-מיושן הופך מ"נחיתה שקטה על תשובה שגויה" ל"החמצה מזוהה".** אם אדמין שכפל/הסיר שיטה ושינה סדר — ה-`location` שנמצא ב-`methods[methodIndex]` לא יתאים למחרוזת-השמורה → הבדיקה נכשלת בבירור → הקוד יודע לנפול-בחזרה ולתעד את זה, במקום להציג-בביטחון תוכן-של-מיקום-אחר. **אפס שינוי-סכימה, אפס backfill** — המחרוזת כבר קיימת, רק צמד-אימות נוסף.

**יתרונות שנשמרים מההצעה המקורית:** אפס שינוי ל-`ExecutionMethod`/לעורך-האדמין. `MasterExerciseView`'s switcher **כבר** מבוסס-אינדקס ו**כבר** מעביר אותו (`onMethodChange(method, methodIdx)`) — התיקון-הכי-קטן-ומוכן ברשימה הוא לגרום ל-`handleSingleMethodChange` (`WorkoutPreviewDrawer.tsx:264-279`) לקבל את הפרמטר-השני שהוא זורק היום.

**מה שנותר לא-פתור, במפורש:** האימות-לפי-מחרוזת-מיקום תופס את המקרה השכיח (שיטה זזה/נמחקה, מיקום-אחר נמצא באותו index) אבל **לא** מבטיח-לחלוטין (למשל: שתי שיטות שונות עם אותו `location` יכולות להתחלף-במקום זו-לזו בלי שהבדיקה תזהה) — זה שיפור-משמעותי-במדידה, לא הוכחת-נכונות-מלאה. חלופה ב' (מזהה-יציב) היא הדרך היחידה לנכונות-מלאה, אבל דורשת עבודה נפרדת (ר' למטה).

### ב. מזהה יציב (דורש הוספת שדה — **לא קיים היום, אומת**)

**מנגנון:** להוסיף `id: string` ל-`ExecutionMethod` (`exercise.types.ts:424`), נוצר פעם-אחת בעורך (`MethodsSection.tsx`) + סקריפט-backfill חד-פעמי (יש תקדים: `scripts/audit/exercise-catalog-audit.ts`/`scripts/seed-recovery-videos.ts`). לשמור `methodId: string` לצד `method`.

**יתרונות:** שורד סידור-מחדש/שכפול/מחיקה-של-אחרים — לחלוטין, לא רק-סטטיסטית. "לא נמצא" הוא מצב-מאומת-עצמאי, לא תלוי-בהתאמת-מחרוזת.

**חסרונות:** שינוי-מודל-תוכן אמיתי (טיפוס + עורך-אדמין + backfill על כל הקטלוג) — workstream נפרד. עד שה-backfill נגמר, כל נקודת-קריאה עדיין צריכה "אין-מזהה → fallback" בכל מקרה.

### שאלת-המפתח: אימונים שכבר יושבים ב-sessionStorage בלי השדה החדש

sessionStorage הוא per-tab, per-device, אפמרי, ולעולם לא נוגע בו תהליך-שרת — **אין שטח-שאילתה למצוא ולשכתב blobs ישנים.** **המשמעות, לשתי החלופות בדיוק אותה עמדה:** השדה החדש חייב להיות אופציונלי בכל מקום, וכל צרכן חייב לשמר את לוגיקת-החישוב-מחדש הקיימת **ללא-שינוי, כענף-fallback-קבוע** — לא shim-מעברי, כי אין "אירוע-מיגרציה" ב-sessionStorage. `JSON.parse` על blob ישן מחזיר `undefined` — זה בדיוק הסיגנל.

**מסקנה מוצעת:** חלופה א' (אינדקס-מאומת) היא הניצחון-המהיר, בסיכון-נמוך, לחלוטין-תוספתי. חלופה ב' היא יזמה נפרדת. הן לא סותרות — `methodId` יכול לחפש דרך `methodIndex`-מאומת לפני נפילה לחישוב-מלא.

## 3. רשימת צרכנים מלאה — נתיב:שורה

**א. איפה הבחירה *נעשית* — צריכים להתחיל להעביר את השדה + מחרוזת-המיקום קדימה:**
- `method-selection.utils.ts:57-222` (`selectMethodForContext`) — מקור-האמת; `preferMedia` (76-83) צריך להחזיר גם את מיקום-ה-index במערך המקורי.
- `execution-method-selector.service.ts` (`selectExecutionMethodWithBrand`) — אותו שינוי, ל-`ExerciseReplacementModal.tsx`.
- `MasterExerciseView.tsx:700-708` — **כבר מחשב `idx` ומעביר אותו החוצה.** אין שינוי נדרש.
- `WorkoutPreviewDrawer.tsx:264-279` (`handleSingleMethodChange`) — **התיקון הקטן-והבטוח-ביותר:** לקבל את הפרמטר השני, לכתוב `methodIndex`+`savedMethodLocation` לצד `method` בשורה 271.
- `derive-swapped-entry.util.ts:36-93` (`deriveSwappedEntry`) — אותה תוספת, שורה 81.

**ב. יצרנים-לתוך-האחסון:**
- `home/page.tsx:1955-2015`, `buildRunnerWorkoutPlanFromGenerated.ts` (מסלול-חי), `workout-plan.mapper.ts:83-146` (**רק אם יוחזר-לחיים** — אחרת לדווח לדוד ולשקול מחיקה) — כולם לאפות `methodIndex`+מחרוזת-מיקום לצד `execution_methods:`.
- `share.service.ts:146-196` (`buildSharedExercises`) — להוסיף ל-`SharedExercise` (37-64), אחרת צופה-השיתוף נשאר תקוע-לצמיתות.

**ג. צרכני-תצוגה שמחשבים-מחדש היום:**
- `useExerciseDerivedValues.ts:334-356,364-383,392-406,482-540` — בדיקה-מוקדמת-מאומתת לפני הלולאה-הקיימת (שנשארת כענף-נפילה).
- `MasterExerciseView.tsx:453-485` (`computeSeedIdx`) — לקבל `preferredMethodIdx`+מחרוזת-מיקום-מאומתת אופציונליים; אם תקפים, להחזיר לפני ש-Priority 1/2 רצים.
- `GeneratedWorkoutExerciseList.tsx:137-142` (`handlePyramidStepTap`) — **מקרה-קשה:** שלבי-פירמידה מסונתזים מתרגיל-אחר — דורש שינוי בבנאי-הפירמידה כדי להטביע index פר-שלב. מומלץ להוציא מהסבב-הראשון.
- `WorkoutPreviewClient.tsx:262-267`, `overview/page.tsx:36,58-68,89,110,130,150` — קור-פתיחה מ-Firestore, אין בחירה-שמורה לקרוא (ר' סעיף 4).

**ד. מחוץ-לסקופ, מפורש:** `ExerciseDetailSheet.tsx` (`/library`), שני ה-branches הקוריים למעלה, ו-`workout-conversion.utils.ts` (ר' הבדיקה למעלה — תיקון-נפרד, לא חלק מהעבודה הזו).

## 4. `/library` — האם החישוב-מחדש לגיטימי?

**כן, לגמרי — עיצוב נכון, לא פער.** `ExerciseDetailSheet.tsx` לעולם לא מקבל `WorkoutExercise` — `useExerciseLibraryStore.ts:14` מטפס `selectedExercise` כ-`Exercise` גולמי. **אין אירוע-generation מעל המסך הזה — אין בחירה שיכולה-היה-להישמר.** `filterLocation` ששם (`:30`) הוא פריסט-עיון מפורש, לא מחויבות-לאימון.

**המשמעות לעיצוב:** השער חייב להיות **מבני** (יש `preferredMethodIdx` אופציונלי מ-prop או אין) — לא `if (route==='/library')`. `ExerciseDetailDrawer.tsx` יעביר; `ExerciseDetailSheet.tsx` פשוט לא יעביר.

## 5. סיכון — מה יכול להישבר

**"ראשון עם וידאו" — תלות-דה-פקטו אמיתית, לא-מכוונת.** הדרגים 3/4 של `findMethodForLocation` הם ברירת-המחדל-האחרונה של ~5 צרכנים. **אם המימוש-החדש יהפוך "לא-נמצאה-התאמה" לכשל-קשה במקום נפילה לשרשרת-הקיימת — תרגילים שהיום נופלים-בחן לוידאו-סביר יראו כלום.** האינדקס-המאומת (סעיף 2) בדיוק פותר את זה: אימות-כושל = נפילה לשרשרת-הקיימת + לוג, לעולם לא כשל-קשה.

**אינדקס יכול להשתבש בין generation לפתיחת-המגירה — כן, תרחיש-אמיתי לא תיאורטי** (sessionStorage בלי TTL נראה, תיקוני-אדמין בקצב-עצמאי) — **בדיוק לכן האימות-לפי-מחרוזת-מיקום הוא לא-אופציונלי בעיצוב.**

**עוד סיכונים:** שלושת-עותקי-הבנאי כבר סוטים (`bunnyVideoId`) — כל שדה-חדש חייב להתווסף בכל אחד, כרשימת-תיוג מפורשת, או (מומלץ) למחוק את `workout-plan.mapper.ts` היתום. שינוי-חתימת `handleSingleMethodChange` — `useCallback` עם dependency-array (`:278`), לבדוק טסטים-שנשענים-על-הצורה. מקרה-הפירמידה — מפורש-מחוץ-לסקופ, ר' סעיף 3ג.

## 6. מדידת-אי-התאמה בזמן-ריצה — ✅ שלב 1, מאושר-לביצוע

**שתי הנקודות, לוג בלבד, אפס שינוי-התנהגות, בענף נפרד, לא ממוזג:**

1. `MasterExerciseView.tsx`'s `computeSeedIdx` (453-485) — נקודת-המפגש-המשותפת. יש כבר קונבנציית-`console.log` (שורות 463,476,480,498). שדות: `exerciseId`, `requestedLocation` (`normalizedLoc`), `resolvedLocation` (`methodLocations(methods[i]).join(',')`), `resolvedIdx` (`i`), `tier` (`'exact-match'`/`'multi-location-default'`/`'first-with-video-fallback'`).
2. `method-selection.utils.ts`'s `preferMedia` (76-83) / אחרי נקודות-ה-`return` (152,183,190,195,206,218) — הבחירה בזמן-יצירה. שדות: `exerciseId`, `requestedLocation`, `resolvedIdx` (`methods.indexOf(returnedMethod)` — קריאה בלבד), `tier`.

**מטרה:** למדוד כמה פעמים שכבת-התצוגה נוחתת על שיטה אחרת ממה שהמנוע בחר, ובאיזה tier — לפני שמחליטים על תיקון. מקושרים לפי `exerciseId` בכלי-אגרגציה, לא בתוך-התהליך.

**סטטוס-ביצוע:** ⏳ ממתין לביצוע בפועל (ענף נפרד, קומיט נפרד, ביקורת נפרדת). שלבים 2-5 (סעיפים 2-3 למעלה) **לא מאושרים** — כל אחד קומיט נפרד עם ביקורת נפרדת, כשמגיעים לזה.
