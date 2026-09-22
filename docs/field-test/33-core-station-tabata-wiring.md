# 33 — חיבור תחנת core/דשא למנוע טבטה-בטן הקיים

**תאריך:** 22.09.2026
**ענף:** `feat/hybrid-core-tabata-station` (worktree `hybrid-core-tabata-station`, מבוסס על `origin/main@e52780aa`)
**סטטוס:** ממתין לאישור דוד (diff) — **טרם merge**
**מקושר:** [[32-existing-engines-map-and-connection-plan]] (המיפוי שהוביל לאישור העבודה הזו)

---

## מה בוצע

חיבור ענף ה-`'core'` ב-`dispatchStopContent` (תחנת core/דשא בתוך סשן היברידי) למנוע טבטה-הבטן
הקיים (`buildCoreTabataBlock`/`buildTabataFromPool`), **ללא שינוי אחד** בחוקי הטבטה עצמם
(`tabata.constants.ts`, `core-block.ts`, `tabata.block.ts`).

3 קבצים חדשים/משונים בליבה:

| קובץ | שינוי |
|---|---|
| `core/pipeline/strength-block.service.ts` | שדה חדש `tabataBlocks?: TabataBlockSpec[]` על `StrengthBlockResult` — נעדר = הצורה הישנה, ללא שינוי |
| `hybrid/station-core-tabata.ts` (חדש) | תזמור תחנתי בלבד: כמה בלוקים של 4 דק' נכנסים לתקציב הזמן + מנוחה ביניהם, קורא ל-`buildCoreTabataBlock` הקיים פעם אחת לכל בלוק |
| `hybrid/compose-hybrid-session.service.ts` | ענף `'core'` מנסה טבטה קודם, נופל בחזרה ל-field/bodyweight הישן ללא שינוי כשאין מספיק זמן/מאגר |
| `hybrid/strength-block-to-plan.ts` | ממפה `tabataBlocks` ל-`WorkoutSegment`ים עם `protocol:'tabata'`/`protocolConfig` — קדימות על פני `fullPark` |

---

## הוכחה לכל אחת מ-6 הדרישות

### 1. `dispatchStopContent` קורא ל-`buildCoreTabataBlock` הקיים
קריאה ישירה, ללא לוגיקת טבטה חדשה — `compose-hybrid-session.service.ts:534`
(`buildStationCoreTabataBlocks` → `buildCoreTabataBlock` ב-`core-block.ts`, קובץ שלא נגעתי בו).
`strength-block-to-plan.ts` מעביר כעת `protocol`/`protocolConfig` במקום להשמיט אותם.

### 2. תקציב זמן — 4 דק' לבלוק, עם מנוחה
`chooseStationTabataBlockCount(blockMinutes)` (`station-core-tabata.ts:35`): כמה בלוקים של
`TABATA_BLOCK_SECONDS=240` (קבוע קיים, לא שונה) נכנסים בתקציב, עם `REST_BETWEEN_STATION_TABATA_BLOCKS_SEC=60`
בין בלוקים עוקבים. 11 טסטים ב-`station-core-tabata.test.ts` מוכיחים את הנוסחה, כולל property-test
שהיא לעולם לא חורגת מהתקציב בפועל, ומקרה קצה שבו המאגר נגמר אחרי בלוק ראשון (עוצר נקי ב-1
בלוק במקום לחזור על אותם תרגילים — זה היה באג אמיתי שתפסתי ותיקנתי, ראו בהמשך).

### 3. מדיה — פארק/חוץ, לא בית (הוכחה בביצוע, לא רק בקריאה)
`dispatch-core-tabata.test.ts` — טסט אינטגרציה נגד השרשרת האמיתית והלא-מדומה
(`dispatchStopContent` → `buildStationCoreTabataBlocks` → `buildCoreTabataBlock` → `buildTabataFromPool`):
4 תרגילים authored home-first (מדיית בית **וגם** מדיית פארק, ב-URL שונה) עוברים דרך הצינור האמיתי,
והתוצאה נבדקת: `we.method.location === 'park'` ו-`we.method.media.mainVideoUrl` הוא ה-URL של הפארק —
**אף פעם לא** של הבית. זו בדיוק התוצאה שהתיקון הקיים ב-`buildTabataFromPool`
(`selectMethodForContext` לפני הרכבה) כבר פותר — הטסט מוכיח שהחיווט החדש שלי לא עוקף אותו.

### 4. הנגן — הטיימר רץ נכון + כפתור דילוג + מעבר חזרה להליכה
**טסט (בוצע):** `dispatch-core-tabata.test.ts`, טסט אחרון — לוקח פלט אמיתי של `dispatchStopContent`
(בלוק טבטה אחד, 4 תרגילים), ממפה אותו דרך `strengthBlockToWorkoutPlan` האמיתי לתוכנית אמיתית,
ואז מריץ אותו דרך מנוע ה-advance האמיתי של הנגן (`computeAdvanceDecision` → `resolveBlockStrategy`
→ `tabataAdvance`, **אותו קוד בדיוק** שכבר מוכח ב-`tabata-advance.test.ts` עבור טבטה-בטן הכללית) —
מוכיח שהרצף עובר בדיוק 8 אינטרוולים (= `rounds` מתוך `protocolConfig`) ומסתיים ב-`workoutComplete`,
לא לפני ולא אחרי.

**כפתור דילוג + מעבר חזרה להליכה — הוכחה אדריכלית (בנייה, לא רק טסט):**
`HybridStationLayer.tsx:58-65` — כפתור "דלג על התחנה" מרונדר **מעל** `StrengthRunner` (z-[121] מול
z-[120] של הרכיב עצמו), תמיד גלוי כל עוד `phase==='station'`, ללא תלות במה שקורה בפנים.
לחיצה קוראת ל-`skipStation()` → `hybrid-orchestrator.ts`'s `STATION_SKIPPED` (שורה 243) — מעבר
מצב ברמת ה-orchestrator שקורא רק ל-`state.cursor`/`state.plan`, **לא בודק כלל** `protocol`/
`tabataBlocks` של התחנה. כלומר: הדילוג עובד זהה לחלוטין בין תחנת טבטה לתחנה רגילה, כי הוא בכלל
לא "יודע" שיש טבטה בפנים — זה מוכח מבניה, ומכוסה כבר בטסטים הקיימים
`_verify-skip-station.test.ts`/`_verify-skip-all-stations.test.ts` (מאותו mechanism, לא שיניתי
אותו). לא נדרש טסט חדש לחלק הזה.

**בדיקת דפדפן — טרם בוצעה.** לפי axioms.md §11 אסור לי להריץ `npm run dev` — נדרשת בדיקה שלך
בפועל: תחנת core עם ~10-14 דק' בכרטיס, לוודא ויזואלית שהטיימר עבודה/מנוחה מוצג נכון, כפתור
הדילוג עובד תוך כדי טבטה, והמעבר חזרה להליכה חלק.

### 5. אפס שינוי ל-full_park_workout / כוח רגיל / טבטה-בטן מחוץ להיברידי
**הוכחה מבניה:** `composeFullParkWorkout` (שורות 265-563) **לא יכול** לקרוא ל-`dispatchStopContent`
כלל — `dispatchStopContent` נקרא רק משני מקומות (שורה 937 בתוך `composeRouteStopsWorkout`, שורה
1253 בתוך composer נפרד), שניהם מחוץ לטווח השורות של `composeFullParkWorkout`. לכן זה בלתי-אפשרי
מבנית שהשינוי ידלוף לשם, לא רק לא-נבדק.

**הוכחה בביצוע:** הרצת הסוויטה המלאה (`npx vitest run`) — 2155 עברו, 26 דולגו, כשל 1 בלבד
(`logMultiCategoryWorkout.smoke.test.ts`, סטרייקים — לא קשור), וכשל suite אחד נוסף
(`firestore-rules.test.ts`, אמולטור לא רץ, ECONNREFUSED — סביבתי, לא קוד). אימתתי שזה בדיוק אותו
בייסליין הקיים על `origin/main` נקי (ספרתי שגיאות `tsc` — 806 שורות זהות לפני ואחרי השינויים,
כולל התיקון היחיד שהיה שלי). `compose-park-workout.test.ts`, `full-park-needs-assessment.test.ts`,
`core-block.test.ts` — 33/33 עברו, כל אחד בנפרד, ללא נגיעה.

### 6. ענף 'strength' בתחנות — ללא שינוי
לא נגעתי בו כלל — `case 'strength':` ב-`dispatchStopContent` זהה ביט-לביט לקוד המקורי.

---

## באג אמיתי שנמצא ותוקן (לא בקוד הקיים — בקוד החדש שלי)

`buildStationCoreTabataBlocks` קורא ל-`buildCoreTabataBlock` פעם לכל בלוק, ומסיר את התרגילים
שנבחרו מהמאגר לפני הקריאה הבאה. כשמאגר-הליבה נגמר בדיוק אחרי בלוק ראשון, קריאה שנייה עם מאגר
**ריק** גרמה ל-`buildTabataBlock` (קוד קיים, לא שונה) ליפול לנתיב הגיבוי הפנימי שלו (בדיקת
`context.tabataPool?.length` ב-`tabata.block.ts:91`) — נתיב שסורק את `exercises` (הצובר שלי!)
כמאגר מועמדים משלו, ובחר מחדש **את אותם תרגילים** כ"בלוק שני" מזויף. תוקן בגישה שלי בלבד —
`if (remainingPool.length === 0) break;` לפני כל קריאה — בלי לגעת ב-`tabata.block.ts`/`core-block.ts`
עצמם. תועד בקוד עם הפניה מדויקת לשורה שהגנתי מפניה. 11/11 טסטים עברו אחרי התיקון.

---

## החלטת עיצוב לא-מאושרת שדורשת את אישורך

"מנוחה בין בלוקים" (60 שניות) מיוצגת **רק** בחישוב תקציב הזמן — כמה בלוקים נכנסים לתחנה —
ולא כמסך-מנוחה ייעודי חדש. כל בלוק טבטה הוא `WorkoutSegment` נפרד (בדיוק כמו הפיצול
warmup/main הקיים), והמעבר ביניהם משתמש במנגנון המעברים הקיים בין segments (שכבר מוכח ועובד).
`WorkoutSegment.type` תומך רק ב-`'travel'|'station'` — אין סוג "rest" ייעודי במערכת כיום, ולא בניתי
אחד. המשמעות בפועל: כשמשתמש מסיים בלוק טבטה אחד ויש בלוק שני, המעבר לבלוק הבא הוא מיידי
מבחינת ה-UI (לא נראה טיימר מנוחה של 60 שניות על המסך) — ה-60 שניות תופסות רק "מקום" בחישוב
כמה בלוקים נכנסים לתחנה, לא זמן אמת שמוצג למשתמש. אם אתה רוצה מסך מנוחה אמיתי בין בלוקים — זו
תוספת נפרדת, לא כלולה כאן. דורש את אישורך/החלטתך במפורש.

---

## מה עוד פתוח לפני merge

1. בדיקת דפדפן שלך (סעיף 4 למעלה).
2. אישור/דחייה של החלטת העיצוב "מנוחה = חישוב זמן בלבד" (למעלה).
3. הצגת ה-diff המלא לאישורך.

לא בוצע merge/push. ממתין לתשובתך.
