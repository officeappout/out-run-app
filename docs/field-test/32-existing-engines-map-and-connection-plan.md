# מיפוי מנועים קיימים + אפשרות חיבור לתחנות — קריאה בלבד — 22.09.2026

## 1. שלושת המנועים, ממופים

### (א) מנוע מתקנים בפארק — `compose-park-strength-workout.service.ts` (817 שורות, בנוי ומלא)
- **Block A** — המתקנים התיוגים-בפועל של הפארק בלבד (לא ציוד פונקציונלי/קרדיו), כבלוק-טבטה משותף אחד, סבב-רובין בין המתקנים.
- **סולם-קושי אמיתי, כבר קיים** (`TABATA_DIFFICULTY_LADDER`, שורות 89-93): `easy` 20ע'/40מ', `medium` 30ע'/30מ', `hard` 40ע'/20מ' — כולם ×8 סבבים, כל שורה מסתכמת ב-60 שניות/סבב (קבוע, בלי תלות בקושי).
- **Block B** — `generateHomeWorkoutTrio(location:'park')`, תמיד רץ, ממלא זמן-נותר ברמת-המשתמש האמיתית. כל בלוק-טבטה שBlock B מייצר בעצמו (finisher) מתמזג ל-Block A.
- **מספר-מתקנים תלוי-רמה**: `machineShareForLevel` (חלק מהזמן הכולל שהמתקנים מקבלים, יורד לאפס עד רמה 8), `resolveMachineAllocation` (מוגבל בפועל למספר-המתקנים-הפיזי בפארק).
- **תזמון**: עוקף במכוון את מנגנון-הבחירה של `buildTabataBlock`/`buildTabataFromPool` — רשימת-המתקנים היא דטרמיניסטית (המתקנים שבאמת בפארק), לא נבחרת מ-pool מדורג. **רק** צורת-הזמן (TabataProtocolConfig) נשאבת מהתשתית הקיימת.
- **חלק 1 מתוך "תוכנית חיווט 'התחל אימון' בפארק"** — כבר קיים, כבר עובר טסטים (`__tests__/compose-park-workout.service.test.ts`).

### (ב) טבטה בטן כללי — `core-block.ts` (Form B) + `tabata.block.ts`'s `buildTabataFromPool`
- **מבנה קבוע**: `TABATA_CLASSIC` = 20ש' עבודה / 10ש' מנוחה × 8 סבבים = **4 דקות בדיוק, קבוע, לא-תלוי-במספר-תרגילים** (רק כמה תרגילים מתחלקים ב-8 הסבבים: 2/4/8).
- **בחירת תרגילים**: `pool` מתויג `hiit_friendly` + `poolLevelOf(ex) ≤ userLevel` (הטיה לקל; **תרגיל-בלי-רמה נכנס תמיד**, לא נזרק). **בלי TIER_TABLE, בלי reps/repsRange בכלל** — כל חבר מקבל `sets:1, reps:TABATA_CLASSIC.workSec (=20), isTimeBased:true` קשיח — **חסין לגמרי לבאג ה-1-3 חזרות**, כי הוא פשוט לא משתמש במנגנון הזה.
- **⚠️ ממצא-בונוס קריטי**: התיעוד בקובץ עצמו (`tabata.block.ts:228-236`) מתאר **בדיוק את באג #1**: "Without this the member carried an empty method `{}` and the media resolver fell through to `executionMethods[0]` — authored home-first, which is why a park workout rendered home images." **זה כבר תוקן שם** — על ידי פתרון-מפורש של ה-method הנכון (`selectMethodForContext`) **בזמן-הבנייה** ונשיאתו קדימה, לא הסתמכות על הרזולוציה-האוטומטית של שכבת-התצוגה. **זה בדיוק כיוון-התיקון שאישרת ל-#1.**

### (ג) מה תחנה היברידית עושה היום — מאומת
`dispatchStopContent` (`compose-hybrid-session.service.ts:382+`):
- ענף **'strength'**: `generateStrengthBlock({blockMinutes, scoredPool, domainFocus, context, rest})` — **בלי `tabataPool` בכלל**. עובר דרך `PipelineOrchestrator`→`createWorkoutGenerator` (`WorkoutGenerator.ts`) — **אותו `assignVolume`/`TIER_TABLE` מהדוח הקודם**. חשוף לבאג 1-3.
- ענף **'core'**: אותו מנגנון (`generateStrengthBlock`, `domainFocus:'legs_core'`) — **גם חשוף**.
- ענף **'stretch'/'mobility'/'yoga'**: `appendCooldownExercises` — **כבר מבוסס-שניות, לא reps** — לא חשוף לבאג.

**המרת התוצאה לנגן: `strength-block-to-plan.ts` — אימות מדויק: אפס אזכור ל-`protocolBlock`/`protocolConfig`/tabata בקובץ הזה.** גם אם `dispatchStopContent` היה מבקש בלוק-טבטה, הממפר הזה **משמיט** את מידע-התזמון שלו כרגע.

## 2. אפשר לחבר? כן — שני חלקים נפרדים, שניהם קטנים

**טיימר-טבטה בתוך היברידי — לא קיים היום, אבל התשתית מוכנה משני הצדדים:**
- `WorkoutSegment` (`route.types.ts:155-157`) **כבר מכיל** `protocol?`/`protocolConfig?` — השדות קיימים בטיפוס!
- ההערה בטיפוס עצמו: "the player derives it per exercise... For block-scoped protocols this IS the dispatch key" — **הנגן (StrengthRunner) כבר קורא את זה גנרית**, לא ספציפי-להיברידי.
- **מה חסר בפועל, שני דברים בלבד:**
  1. **`dispatchStopContent`** — להוסיף ענף/קריאה שמבקשת בלוק-טבטה במפורש (`buildCoreTabataBlock`/`buildTabataBlock`, **תשתית קיימת, אפס לוגיקת-טבטה חדשה** — בדיוק הפילוסופיה של `core-block.ts` עצמו: "השתמש בתשתית הקיימת... אל תבנה חדשה").
  2. **`strength-block-to-plan.ts`** — להעביר את ה-`protocolBlock`/config שחוזר קדימה אל `WorkoutSegment.protocol`/`protocolConfig` (במקום להשמיט אותם).

**חיבור לפי סוג-תחנה:**
- **תחנת core/דשא → (ב)** — ישיר, `buildCoreTabataBlock` עם pool ליבה מתויג נכון + תקציב-הזמן של התחנה.
- **תחנת מתקנים → (א)** — **דורש עוד עבודה**: `compose-park-strength-workout.service.ts` בנוי כמרכיב **כל-הסשן** (Block A+B ביחד), לא כ"נתחל-תחנה-בודדת". יידרש לחלץ רק את לוגיקת-Block-A (בניית טבטה מהמתקנים-בפועל) לפונקציה קטנה-יותר, קריאה עם תקציב-זמן של תחנה בודדת (10-14 דק') במקום זמן-הסשן-כולו.
- **מתיחות → כמו היום** — כבר עובד, כבר מבוסס-שניות, אין צורך לגעת.

**תקציב-זמן לתחנה (~10-14 דק'):** בלוק-טבטה בודד = 4 דק' קבועות תמיד. לתקציב גדול-יותר — אותו דפוס בדיוק שכבר קיים ב-(א) ברמת-הסשן (טבטה + מילוי-bodyweight לשארית הזמן), רק בהיקף-תחנה-בודדת במקום היקף-סשן.

## 3. הערכת-רמה למשתמש חדש

**כן, יש מנגנון הערכה אמיתי ב-onboarding** — 3 כרטיסים (Health קבוע push/pull/legs/**core**, Body Focus, Skills), עם סליידרים ויזואליים. **core הוא קטגוריה-נבדקת ישירה** דרך כרטיס Health, ומתווסף אוטומטית (D2) גם לבחירת Skills.

**⚠️ לא אימתתי סופית "מה קורה למי שמדלג לגמרי"** — ראיתי רמז (`git log`: "quick-register runs the explore-map flow directly") שמרמז על נתיב-רישום-מהיר שעוקף assessment, אבל לא עקבתי אותו עד הסוף. **מה שכן מאומת בוודאות**: הקוד עצמו סופר ומתעד `unassessedFallbackCount` (`workout-selection.utils.ts:685`) — כלומר משתמשים-לא-מוערכים הם תרחיש **אמיתי, צפוי ומנוטר בקוד עצמו**, לא edge-case תיאורטי.

**מה מנועים (א)/(ב) עושים עם משתמש-לא-מוערך:**
- **(ב) — חסין**: "level-less pool entries default IN" — משתמש-לא-מוערך פשוט מקבל את כל ה-pool, בלי סינון-שגוי, בלי reps-בעייתיים (תמיד time-based).
- **(א) Block A (מתקנים)** — לא רמה-תלוי באותו אופן (המתקנים דטרמיניסטיים לפי הפארק, לא לפי pool מדורג) — **סביר שגם חסין**, לא אימתתי סופית.
- **(א) Block B (bodyweight מילוי)** — קורא ל-`generateHomeWorkoutTrio`, **אותו מנגנון `assignVolume`/TIER_TABLE** — **כנראה חשוף לאותו באג 1-3** כמו כל תוכן-bodyweight רגיל, לא אימתתי ישירות.

## 4. המלצה

**לפני השקה — היקף מצומצם ומספיק:**
חיבור core/דשא ל-(ב) בלבד: קריאה ל-`buildCoreTabataBlock` מ-`dispatchStopContent`'s core-branch + השחלת `protocolConfig` דרך `strength-block-to-plan.ts`. **פותר גם את #1 לחלוטין לענף הזה** (אותו תיקון-method שכבר קיים ב-(ב) נכנס בחינם), **וגם את #3 לחלוטין לענף הזה** (אין reps בכלל). **הערכה: 4-6 שעות, קובץ-שני-קבצים, סיכון בינוני-נמוך** (משתמש בתשתית מוכחת-בפרודקשן, לא בונה חדש; הסיכון העיקרי הוא ה-mapper החדש ל-`protocolConfig`, שטרם נבדק בנתיב היברידי).

**דורש יותר זמן, אחרי השקה כנראה:**
- חיבור תחנת-מתקנים ל-(א) — חילוץ Block-A מהשירות-כל-הסשן. הערכה: לא ברור בלי מיפוי נוסף (סדר-גודל ימים, לא שעות) — הקובץ 817 שורות, מחולק ל-Block A+B ביחד, לא מתוכנן כ"תחנה-בודדת" מלכתחילה.
- ענפי 'strength'/'core' הרגילים של hybrid (שלא הופכים לטבטה) — עדיין חשופים ל-#3, פתרון אמיתי דורש את שינוי-ה-TIER_TABLE הרחב שכבר סוכם כ-backlog.
- אימות סופי של "מה קורה למי שמדלג assessment" ושל Block B ב-(א).

**לא מומש שום דבר — קריאה בלבד, כמבוקש.**
