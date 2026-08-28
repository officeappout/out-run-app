# hybrid-history-summary-mapping — see also linked topics below

> קובץ זה גדל מעבר לנושא אחד. הכניסה המקורית (mapping WorkoutHistoryEntry↔HybridFinalizeResult, ✅ FIXED commit 441b6490) נשארה למטה ללא שינוי. שני נושאי-המשך (21.08.2026): Bug 1 (home-card matchCategory) ו-Bug 2 (אין מפה מאחורי drawer בהיסטוריה) — **שניהם ✅ FIXED, commits 52a88186 (Bug1) ו-6399ca6d (Bug2), מקומיים/לא-pushed, reviewed PASS**.

---

## ✅ Bug 1 — תוקן, commit 52a88186
Query-based (הכיוון שדוד בחר): `home/page.tsx` — `useEffect` חדש קורא `getWorkoutsForDate` בזמן בניית הכרטיסים (אותה שאילתה שכבר רצה ב-tap handler), בונה `Set` של קטגוריות אמיתיות של היום. ה-`useMemo` הבונה כרטיסים משתמש בזה: כרטיס `cardio`/`strength` (לא `maintenance`) מתוקן ל-`matchCategory:'hybrid'` **רק אם** אין דוק ישיר של אותה קטגוריה גולמית היום **וגם** יש דוק hybrid היום. Fallback לקטגוריה הגולמית (התנהגות טרום-תיקון) כשה-query עוד לא נפתר, או כשיש גם דוק סולו וגם hybrid אותו יום (אי-ודאות מהותית שנשארת — הוסכם מראש כלא-פתירה בגישה הזו). לא נגע ב-routing/tap-handler עצמם, כמבוקש. Independent review — PASS, ללא findings.

## ✅ Bug 2 — תוקן, commit 6399ca6d
רק (א) `peekHeight={0}` — היחידה הריאלית. `HybridSummary` קיבל `peekHeight?: number` (default 150, משמר את זרימת ה-live), מועבר ל-`SummaryDrawerShell`. `history/page.tsx` מעביר `peekHeight={0}`. (ב)/(ג) נשארים חסומים על חוסר `routePath` בדוק ה-hybrid — פרויקט נפרד עתידי, לא כאן. Independent review — PASS, ללא findings.

---

## 🔍 (הקשר — האבחון המקורי) Bug 1 — כרטיס "פעילות היום" פותח אימון hybrid שגוי

**האבחון של דוד אושר במדויק:**
- `home/page.tsx:647` — `matchCategory: s.category`, כאשר `s` מגיע מ-`dayStatus.sessions` (`useDayStatus.ts:140-145`) שמוגבל לחלוטין ל-`'strength'|'cardio'|'maintenance'` — **אין ואף פעם לא יהיה `'hybrid'`** בערך הזה בזרימה הרגילה.
- `handleTodayActivityCardTap` (`home/page.tsx:767-772`): `getWorkoutsForDate` → `find(w => w.category === card.matchCategory)`. הדוק האמיתי תמיד `category:'hybrid'` (`storage.service.ts:208-209,314`, נכתב דרך `hybrid-save.service.ts:58,84`). **מיסמאץ' מאושר** → no-op שקט, או (אם יש גם strength/cardio סולו אותו יום) פתיחת האימון הלא-נכון.
- Safety Net 2 (`home/page.tsx:700-722`) היחיד שמקצה `'hybrid'` — אבל רק כש-`cards.length===0` (שני חצאי ה-hybrid מתחת ל-10 דק', `STREAK_MINIMUM_MINUTES`). לא ניתן להכליל: הזיהוי שם הוא **`richCategory===null`** (היעדר קטגוריה), לא זיהוי חיובי של hybrid.

**הממצא הקריטי (חדש, לא היה בבקשה המקורית של דוד) — אין linkage-data בסטור:**
`useActivityStore` (`logMultiCategoryWorkout`, `:604-660`) מקבל את שני חלקי ה-hybrid **בקריאה אטומית אחת** (הוכחה בזמן-כתיבה שהם hybrid) אבל **זורק את ה-linkage** — שומר רק מונים מצטברים פר-קטגוריה (`DailyActivity.categories[cat].{minutes,sessions,...}`), בלי workoutType/hybrid-id/timestamp פר-session. **ה-linkage האמין היחיד הוא דוק ה-`category:'hybrid'` בקולקציית `workouts`** — לא בסטור הפעילות שממנו נבנים הכרטיסים.

**שתי כיווני-תיקון אפשריים (טרם הוכרע):**
- **(א) Query-based בזמן בניית הכרטיסים** — לקרוא ל-`getWorkoutsForDate` (כבר בשימוש ב-tap handler) גם ב-build-time של הכרטיסים, לזהות אם קיים דוק hybrid היום ולתייג בהתאם. מוסיף read שהיום לא קיים שם (היום ה-build טהור-מ-store).
- **(ב) שינוי סכימת סטור** — להשחיל hybrid-attribution לתוך `DailyActivity`/`logMultiCategoryWorkout` בזמן הכתיבה, כך שה-linkage לא נזרק מלכתחילה.
- **סיכון משותף לשני הכיוונים:** אם אותו יום יש גם strength/cardio סולו וגם hybrid — התאמה לפי category בלבד לא מבחינה ביניהם; צריך מזהה מפורש (workoutId, לא category).

---

## 🔍 Bug 2 (21.08.2026) — אין מפה מאחורי הדראוור ההיברידי בהיסטוריה

**האבחון של דוד אושר:** `SummaryDrawerShell.tsx:57-58` — ה-peek הוא `<div style={{flex:'0 0 ${peekHeight}px', background:'transparent'}} />`, שקוף לגמרי, מסתמך על Mapbox חי שרץ מתחת (עובד ב-`/map` בלבד; אין מפה מונטת ב-`/workouts/[id]/history`). `HybridSummary.tsx:209` מעביר `peekHeight={150}`.

**חסם מכריע חדש שנמצא (חוסם גם (b) וגם (c)):** לדוק ה-hybrid **אין קואורדינטות בכלל**. `finishHybrid` קורא ל-`saveHybridWorkout` בלי `routePath` (`useHybridRun.ts:190-193`); `buildHybridWorkoutEntry` תומך בשדה `routePath` (`hybrid-save.service.ts:68`) אבל הוא אף פעם לא מקבל ערך ב-hybrid flow. אין GPS trail שמור — אין מה לצייר, לא סטטי ולא חי.

| אפשרות | סטטוס |
|---|---|
| **(א) `peekHeight={0}` בהיסטוריה** | **היחידה הריאלית היום.** טריוויאלי, ללא תלות-נתונים. |
| **(ב) מפה סטטית** | **חסום** — אין `routePath` על הדוק. |
| **(ג) mini-map חי (`RunMapBlock`)** | **הרינדור עצמו קיים ומנותק** מ-state המפה (`summary/components/running/RunMapBlock.tsx`, כבר בשימוש ב-`FreeRunSummary`/`AerobicSummaryShell`, מקבל `routeCoords` בלבד) — **אבל חסום על אותו נתון חסר.** דו-שלבי: קודם data-capture (להעביר route trail ל-`saveHybridWorkout`), רק אז (ג) הופך לתוספת קטנה. |

**המלצה:** לממש (א) עכשיו כפתרון history-only; (ב)/(ג) דורשים קודם פרויקט נפרד של route-capture ל-hybrid (מעלה הזרם, ב-`useHybridRun.finishHybrid`) — לא "תיקון היסטוריה" נקודתי.

---

# (מקורי, ללא שינוי) אודיט: פער-נתונים בין WorkoutHistoryEntry ל-HybridFinalizeResult (ניתוב hybrid מהיסטוריה)

> נוצר: 21.08.2026 | READ-ONLY — אין mapping/קוד נכתב. מטרה: לתקן שאימון hybrid שנפתח מהיסטוריה יוביל ל-`HybridSummary` האמיתי במקום ל-`StrengthHistoryDetail`. שלב זה = דוח הבדלים בלבד, לפי בקשת דוד, לפני כתיבת ה-mapping בפועל.

## 0. אישור באג הניתוב (`src/app/workouts/[id]/history/page.tsx:108-113`)
```
const isStrengthLike =
  workout.category === 'strength' || workout.category === 'hybrid' || workout.category === 'recovery';
if (isStrengthLike) return <StrengthHistoryDetail workout={workout} onClose={handleClose} />;
```
`'hybrid'` מקובץ במפורש עם strength (`:109`) → כל אימון hybrid מהיסטוריה נופל ל-`StrengthHistoryDetail` (`:112`). מכוון בזמנו (F1.4 הוסיף hybrid-awareness ל-`StrengthHistoryDetail.tsx:66-72,139-144` — מציג מרחק/pace כשדה נוסף), אבל זו הצגה נחותה: אין segment-rail בסגנון Moovit, אין טאבי אירובי/כוח. לא crash — presentation ירוד בלבד.

## 1. מה HybridSummary צריך (`result: HybridFinalizeResult`)
מקור: `hybrid-orchestrator.ts:294-297` — `{ segments: SessionSegmentRecord[]; summary: HybridRunSummary }`.
`HybridRunSummary` (`:283-292`): `segmentCount`, `completedAerobicSegments`, `completedStrengthSegments`, `totalActualAerobicSec`, `totalActualDistanceKm`, `totalStrengthSets`, `bothHalvesCompleted`.

הקומפוננטה בפועל קוראת: כל 7 שדות ה-`summary`; מ-`segments[]` (`buildRailItems:32-51`) — `kind`, `actual.durationSec/sets/distanceKm`, `endedAtMs`, `index`, `aerobicType`; ועוד props: `calories`, `streakDays`, `xpEarned`, `onFinish`. **לא נקרא:** `seg.planned/parkId/startedAtMs/label`, `actual.exerciseLog/paceMinKm/calories/exercises` (הטאב "כוח" מציג "בקרוב").

## 2. מה זמין בהיסטוריה (`getWorkoutById` → `WorkoutHistoryEntry`)
`storage.service.ts:424` → `mapFullWorkoutDoc:447-490`. נכתב ע"י `hybrid-save.service.ts:56-71`:
- `segments?: SessionSegmentRecord[]` — **verbatim passthrough**, אותו טיפוס במדויק, ללא מיפוי פר-שדה בכתיבה ובקריאה (`storage.service.ts:153,479`).
- `distance`(root)=`summary.totalActualDistanceKm`; `duration`(root)=סך `actual.durationSec`; `calories`(root)=`meta.totalCalories`; `setsCompleted`(root)=`summary.totalStrengthSets`; `xpEarned` (רק אם `displayXp!=null` — §8 gate, בפועל 0/נעדר).

## 3. Diff פר-שדה

| שדה נדרש | סטטוס | מקור בהיסטוריה |
|---|---|---|
| `result.segments` | **(a) קיים ישירות, אותו טיפוס** | `workout.segments` — passthrough מלא |
| `segments[i].actual.*`, `.endedAtMs`, `.aerobicType`, `.kind`, `.index` | **(a) קיים** בתוך ה-passthrough | `toRecord` (`hybrid-orchestrator.ts:299-312`) כותב שדות מותנים (לא `undefined`) → שורד Firestore array rules |
| `result.summary` (7 שדות) | **(b) לא נשמר כאובייקט, אך נגזר-במלואו מ-`segments[]`** | אין שדה `summary` בדוק. גזירה זהה ל-`finalizeHybridRun:334-348,402`. השלמה נגזרת מ-`endedAtMs != null` (לא מ-boolean `completed`, עקבי עם `HybridSummary.buildRailItems:48`) |
| `calories` prop | **(a) קיים** | `workout.calories` (root) |
| `xpEarned` prop | **(a) קיים** (=0 מתוכנן, §8) | `workout.xpEarned` |
| `streakDays` prop | **(c) לא נשמר על הדוק** | בלייב מגיע מ-`useProgressionStore.currentStreak` — streak **נוכחי**, לא היסטורי. תואם למה שהאירובי כבר עושה (§4) |
| `onFinish` | לא נתון — מסופק ע"י ה-caller | `history/page.tsx handleClose` |

**מסקנה:** אין שדה חוסם בקטגוריה (c) מלבד `streakDays`, וגם הוא לא-היסטורי-מעצם-טבעו (זהה לתקדים האירובי). `segments` = 1:1 passthrough. `summary` נגזר במלואו. **שום נתון לא נופל בשקט.**

## 4. תקדים ה-cardio (הקונבנציה הקיימת לחיקוי)
`history/page.tsx:129-136` → `<FreeRunSummary workout={workout} isReadOnly onClose onDelete />` — מעביר `WorkoutHistoryEntry` גולמי + `isReadOnly`, בלי mapping בעמוד. ה-mapping חי **בתוך הקומפוננטה**:
- `FreeRunSummary.tsx:77-78`: `confirmedSource = !isReadOnly ? savedWorkoutSnapshot : null` · `historySource = isReadOnly && workout ? workout : null`
- כל מטריקה: `historySource?.X ?? confirmedSource?.X ?? sessionStore.X` (`:80-146`)
- `streakDays` תמיד מהסטור החי (`:71`), בלי תלות ב-`isReadOnly`

**הקונבנציה:** העמוד מעביר entry גולמי + `isReadOnly`; הקומפוננטה מכילה ענף read-only שממפה בעצמה (עדיפות history → live snapshot → session store).

## 5. שני מסלולי פתרון — **הוכרע: (ב) Adapter**, ✅ בוצע
`commit 441b6490` — ראה עדכון בראש הקובץ. `hybrid-history-adapter.ts` + `onDelete` prop ל-`HybridSummary` (תגלית-לוואי: היה חוסם delete). Independent review PASS.
