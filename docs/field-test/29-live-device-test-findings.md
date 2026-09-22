# ממצאים מבדיקה חיה (super-admin, ת"א) — קריאה בלבד, בלי תיקון — 22.09.2026

## 1. שיטת ביצוע "home" בתחנה — root cause חלקי, לא סגור 100%

**מה מצאתי בוודאות גבוהה:** `method-selection.utils.ts` (הפונקציה הנכונה, `selectMethodForContext`) **אף פעם לא נופלת ל-home** במצב `location==='park'` — שורות 161-192 מפורשות: "Home-tagged methods are NOT used even if their gear happens to be available." זה מוכיח שהבאג **לא** בפונקציית-הבחירה עצמה.

**מה מצאתי כמועמד-חזק לרוט-קוז בפועל:** `useExerciseDerivedValues.ts:340-362` (ו-370-389 דומה) — הרכיב שמציג את המדיה בזמן-ריצה (StrengthRunner) **לא קורא ל-`selectMethodForContext` בכלל**. הוא סורק את המערך הגולמי `execution_methods` **בסדר-המקור** ומחזיר את **השיטה הראשונה עם מדיה** — בלי לבדוק מיקום כלל:
```js
const methods = raw?.execution_methods || raw?.executionMethods || raw?.methods || [];
for (const m of methods) {
  const url = m?.media?.mainVideoUrl || m?.media?.videoUrl;
  if (url) return url as string;
}
```
מכיוון שתרגילים **מתועדים "home-first"** (כותרת הקובץ `method-selection.utils.ts` עצמה: "a home method leaks into a park workout" — אזהרה שכבר תועדה!), אם שיטת-הבית מוקלטת/יש לה מדיה, היא זוכה תמיד — **בלי קשר לאיזו שיטה נבחרה בפועל ב-compose**.

**מה לא סגרתי (דורש עוד בדיקה):** האם אובייקט ה-Exercise שמגיע ל-hybrid station עדיין נושא את מערך `execution_methods` המלא (כך שהסריקה-הגולמית "תמצא" את הבית), או שהוא "מפושט" (flattened) לשיטה-הנבחרת-בלבד כמו שכנראה קורה באימון-בית/פארק רגיל (הערה בקובץ: "The flattened plan Exercise carries no execution_methods, so this is the ONLY source on the active-session path"). עקבתי את השרשרת (`dispatchStopContent`→`generateStrengthBlock`→`strength-block.service.ts`) ולא מצאתי שום שלב-פישוט מפורש בנתיב הזה — **זה מחזק את החשד, לא מוכיח אותו סופית**.

**כמה תרגילים במאגר אין להם שיטת park/outdoor:** לא ספרתי — דורש שאילתת Firestore נפרדת (יכול להריץ אם תרצה, לא עשיתי כי זה חורג מ"קריאה בלבד — בלי לתקן" לכיוון "משימה חדשה").

**הערכת תיקון:** בינוני — 2-4 שעות אם התיקון מסתכם בסידור-מחדש של סדר-העדיפויות ב-`useExerciseDerivedValues.ts` (לבדוק שדה-מדיה שכבר-נפתר-נכון *לפני* הסריקה הגולמית); יותר אם נדרש לשנות את שרשרת ה-hybrid כך שתפשט את המתודות כמו הנתיב הרגיל. **סיכון: בינוני** — ה-hook הזה משותף לכל StrengthRunner, לא ספציפי ל-hybrid.

## 2. Header/כותרת סותרים — root cause מלא, לא קשור לאיזה composer רץ

**`HybridOverviewScreen.tsx:413-414`:**
```js
{composed.bolts
  ? `אימון מלא בפארק · ${aerobicKind==='running'?'ריצה':'הליכה'} + תחנת כוח`
  : 'אימון משולב'}
```
הבדיקה היחידה היא **`composed.bolts`** — לא מצב/מקור. `composeRouteStopsWorkout` **גם הוא** מחזיר `bolts:{plans,selectedIndex,labels:[...]}` (אותו trio-pattern כמו full_park) — אז הכותרת "אימון מלא בפארק" **תמיד** תוצג לכל אימון-hybrid עם bolts, **בלי קשר לאיזה composer בנה אותו**. זה באג-תיוג-UI טהור.

**איזה composer רץ בפועל:** לחיצה על כרטיס "מסלול + עצירות" קוראת **אך ורק** ל-`composeRouteStopsWorkout` — `composeHybridPlan`'s שני הענפים (`intent.mode==='full_park_workout'` מול `'route_stops'`) הם if-בלעדיים (start-hybrid-session.ts:1019-1041), אין דרך ש-full_park ירוץ מכרטיס route_stops. **כלומר route_stops רץ בוודאות.**

**"מסלול יציאה-וחזרה" — לא הצלחתי לקבוע existing_route או generated_loop בלי הקואורדינטות/הזמן המדויק של הבדיקה שלך.** שני התרחישים אפשריים בתל אביב (ראיתי בעבר 2 מסלולים אמיתיים שם). אם תרצה, ואם יש לך את לוגי-הקונסולה מהבדיקה (`[route-stops] backbone="..."` או `[route-stops] backbone: real street loop...`) — זה יקבע במדויק איזה תת-מצב רץ.

**הערכת תיקון:** קטן — קובץ אחד, ~להעביר את המצב האמיתי (או שדה-מקור על `composed`) ל-`HybridOverviewScreen` ולבדוק אותו במקום `composed.bolts`. **סיכון: נמוך.**

## 3. טווח "1-3" חזרות — נמצא מקור אחד אפשרי, לא סגור מי מפעיל אותו

**`WorkoutGenerator.ts:436-444`** — "Skill-Rep Guard": תרגיל **unilateral** (`newEx.symmetry==='unilateral'`) בקבוצת-תנועה push/pull מקבל **בכוונה** 1-3 חזרות אקראיות (מיועד לתרגילי-מיומנות קשים כמו One-Arm Pull-up — הגיוני שם). זה חלק מ-`substituteExercise`, שנקרא מ-`GuaranteePassRunner.ts` (מנגנון ה"guarantee" שמחליף/מוסיף תרגיל כדי להבטיח כיסוי קבוצת-שרירים) — עקבתי: `dispatchStopContent`→`generateStrengthBlock`→`PipelineOrchestrator`→`createWorkoutGenerator` (מ-`WorkoutGenerator.ts`, **אותו קובץ** שמכיל את ה-guard) — **השרשרת עוברת דרך הקובץ הנכון, אבל לא אימתתי את הקריאה הפנימית המדויקת בזמן-ריצה**.

**מה חסר לי לקביעה סופית:** אם "כפיפות בטן"/"עליות תאומים" **מתויגות בטעות** `symmetry:'unilateral'` (באג-נתונים ב-Firestore, לא קוד) — או שזה נתיב-קוד אחר לגמרי שלא מצאתי. צריך את ה-id המדויק של התרגילים כדי לבדוק ישירות ב-Firestore.

**הערכת תיקון:** לא ניתן להעריך במדויק בלי אימות שורש-הבעיה. אם זה תיוג-נתונים שגוי — תיקון-נתונים, לא קוד, סיכון אפסי. אם זה לוגיקת-substitution שבוחרת "קורבן" לא-מתאים — סיכון/היקף לא ידוע עד שממפים.

## 4. "רגל ריצה 1" + קצב 10:00/ק"מ — כן, אותה משפחת-באג, אבל לא בדיוק אותו קובץ. אושר.

**`HybridJourneyAxis.tsx:180-183, 204`:**
```js
const action = (seg.aerobicType ?? 'walking') === 'running' ? 'ריצה' : 'הליכה';  // מחושב נכון!
const legTitle = stationName
  ? (...moovit-style, תלוי-פעילות...)
  : `רגל ריצה ${aerIdx} — ${legLabel}`;  // ← קשיח, מתעלם מ-action
```
שורה 204 (הענף כש-`stationName` ריק) **מדפיסה "רגל ריצה" קשיח**, למרות ש-`action` (השורה ממש מעליה!) כבר מחשב נכון "הליכה"/"ריצה". **הקצב עצמו (10:00/ק"מ) נכון להליכה** — רק הטקסט שגוי. `stationName` ריק = "bodyweight/A3 fallback, אין תחנה אמיתית" (לפי התיעוד בקובץ עצמו) — כנראה קשור לאותו fallback שגם גרם ל-#2.

**הערכת תיקון:** זעיר — שורה אחת, שימוש ב-`action` שכבר קיים במקום המחרוזת הקשיחה. **סיכון: כמעט אפס.**

---

## האם #1 חוסם השקה — דעתי, לא החלטה

**לא חוסם מבחינה פונקציונלית/בטיחותית** — התרגיל עצמו עדיין תקין ועובד (bodyweight, גדור-ציוד נכון); זו רק המדיה שמטעה. **כן מהווה סיכון-רושם-ראשוני רציני** להשקה ציבורית-עירונית ספציפית — תושב באמצע פארק שרואה סלון/ספה במסך יחשוב שמשהו שבור. **ההמלצה שלי: לא לעצור את ההשקה בגלל זה, אבל לתעדף אותו כתיקון-מהיר-אחרי-השקה גבוה** — לא דחוף-חוסם, אבל לא רחוק מזה. #2/#4 קלים וזעירים, שווה לשקול לפני השקה אם יש חלון-זמן.

**לא תוקן שום דבר — קריאה בלבד, כמבוקש.**
