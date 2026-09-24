# חקירה — איכות בניית האימון (שיטות + תוכן + נגן חי)

> **סוג:** מסמך findings · חקירה READ-ONLY בלבד. לא נכתב קוד, לא בוצע commit.
> **תאריך:** 29.07.2026 · **ענף:** `feat/home-daily-goal-v1`
> **שיטה:** 6 סוכני-חקירה מקבילים + אימות ידני על הקבצים הקריטיים. כל טענת "לא קיים" מגובה ב-grep (נספח בסוף).
> **מקור-ייחוס למיפוי שכבות:** `docs/architecture/workout-recommendation-engine.md` §5/§6/§6.2/§7 — ראה אזהרת-ענף למטה.

---

## 0. אזהרות-מסגרת (לקרוא לפני הכל)

**0.1 — מסמך הארכיטקטורה מתאר יַעַד, לא את הקוד החי.** §5–§12 ב-`workout-recommendation-engine.md` מציג ארכיטקטורה שאיפתית (הרבה `חסר`/`לבנות`). הצינור החי בפועל אינו תואם למפת-הקבצים של `Workout_Engine_Truth.md` (הנתיב `generator/services/workout-generator.service.ts` **לא קיים**). הנתיב החי:

```
home-workout.service.ts  (generateHomeWorkoutTrio — לולאת ה-3)
   └─→ core/pipeline/PipelineOrchestrator.ts  (shim דק)
         └─→ logic/WorkoutGenerator.ts  (המוח האמיתי) + logic/ContextualEngine.ts
   ├─ warmup.service.ts        (prependWarmupExercises — unshift לחזית)
   ├─ cooldown.service.ts      (appendCooldownExercises — append לסוף)
   └─ PresentationFormatter.ts (sortAndPair — סופר-סט + פורמט תצוגה)
פלט → buildRunnerWorkoutPlanFromGenerated.ts (flatten ל-WorkoutPlan) → StrengthRunner (נגן חי)
```

**0.2 — "טבטה" לא קיימת על הענף הזה.** מחרוזת `tabata` מחזירה **אפס** תוצאות ב-`src/` על `feat/home-daily-goal-v1`. מימוש הטבטה המלא (בלוק אינטרוולים + pool + מסמך ארכיטקטורה) חי על ענף **אחר** — `feat/route-stops-v1` (worktree תחת `.claude/worktrees/`), **לא ממוזג**. מסמך הארכיטקטורה שנקרא הוא עותק ה-worktree. פירוט מלא ב-Gap 3.

**0.3 — באג ה-15→45 ("הזמן לא מחובר") תוקן.** הממצא מ-12.07 (הלולאה דורסת `availableTime` בקבוע `BOLT_DURATION_CAPS`) **כבר לא תקף**. כיום הזמן מכובד כתקרה ±3 דק' דרך `resolveEffectiveBoltTime = min(requested, cap)`. הפערים שנשארו ב-Config→Generation דקים יותר (Gap 6).

---

## 1. תקציר-מנהלים — השורש המשותף

שלושה מ-ששת הפערים (#2 חזרות↔זמן, #3 טבטה, #5 נגן חי) הם **תסמינים של אותה פתולוגיה אחת**:

> **"סוג מדידה" ו"תפקיד תרגיל" אינם מאוחסנים כמקור-אמת יחיד על התרגיל — הם נגזרים/מנוחשים מחדש, אחרת, בכל שלב בצינור.**

- **סוג מדידה (reps/time):** קיים שדה מוצהר `Exercise.type` — אבל הוא **אופציונלי עם ברירת-מחדל שקטה `'reps'`**, ולכן תוכן לא-ממולא, וכל צרכן לא-סומך-עליו וגוזר מחדש. **7 קידודים מתחרים** לאותו מושג (טבלה §2), כולל 2 phantom (`metric==='hold'` דרך `as any`, ו-value `type==='hold'` שאינו באיחוד).
- **תפקיד תרגיל (warmup/main/cooldown/…):** קיים שדה מוצהר `Exercise.exerciseRole` — אבל שירות החימום מתעלם ממנו לסרטוני follow-along ובוחר לפי הבוליאני `isFollowAlong`, והשדה שנועד למקם בסוף (`isFinisherVideo`/`reinforcement`) **לא נקרא ע"י אף מחולל**. חלוקת-התפקידים מבוצעת מחדש ב-5+ מקומות עצמאיים.

**מסקנת-על:** תיקון בשכבת התוכן/השיטות (§5/§6 של מסמך הארכיטקטורה — הבסיס המשותף) — מיזוג כל הגזירות למקור-אמת יחיד — **מחלחל בבת-אחת ל-#2, #3, #5**. זו נקודת-ההשקעה בעלת ה-ROI הגבוה ביותר. #1 (חימום), #4 (שיטות), #6 (קונפיג) הם תיקונים מקומיים יחסית-עצמאיים.

**סדר-תיקון מומלץ (מפורט §9):** 1️⃣ הקשחת-נתונים של `Exercise.type` + מיזוג קוראי reps/time → 2️⃣ מיזוג חלוקת-תפקידים + חיווט slot-סוף → 3️⃣ per-step type בנגן החי → 4️⃣ שיטות (rest+hold) → 5️⃣ חימום → 6️⃣ קונפיג.

---

## 2. חוצה-חתך (§ז) — מקור-האמת ל"סוג מדידה" ול"תפקיד"  ← השורש המשותף ל-#2/#3/#5

### 2.1 סוג מדידה — reps מול time

**השדה המוצהר (ה-SoT התיאורטי):** `Exercise.type: 'reps' | 'time' | 'rest'`
`src/features/content/exercises/core/exercise.types.ts:94` (הטיפוס), `:623` (השדה).
נקבע ע"י admin toggle "סוג התרגיל" ב-`.../exercise-editor/BasicsSection.tsx:187-203`.
**ברירת-מחדל שקטה:** `ExerciseEditorForm.tsx:139` → `type: initialData?.type || 'reps'` — החזקה שה-admin לא סימן במפורש יורדת ל-`reps`.

**המפענח הקנוני (הפונקציה הנכונה היחידה):**
`logic/workout-budgeting.utils.ts:347-387` — `isTimeBasedExercise(exercise)`. סולם-נפילה:
`type==='time'` → `mechanicalType==='straight_arm'` → dynamic-movement-group=false → **name heuristic** (`hold`/`plank`/`hang`/`החזק`). כל נפילה ל-heuristic פולטת `console.warn` "Fix in CMS → set type to זמן". **כל warn = מסמך שבו ה-SoT לא-מוגדר, וקורא אחר שמסתמך על `type` לבד יראה יחידה שגויה.**

**7 הקידודים המתחרים לאותו מושג:**

| # | קידוד | היכן |
|---|---|---|
| 1 | `Exercise.type` (SoT מוצהר) | exercise.types.ts:94,623 |
| 2 | `Exercise.loggingMode: 'reps'\|'completion'` (ציר-לוג נפרד, אורתוגונלי) | exercise.types.ts:96,629 |
| 3 | `Exercise.mechanicalType === 'straight_arm'` (פרוקסי-זמן) | budgeting:362; home-workout:249; warmup:511 |
| 4 | `Exercise.metric === 'hold'` — **phantom/לא-מוצהר** (`as any`) | useExerciseSwap:161; pyramid.processor:680 |
| 5 | `type === 'hold'` — **phantom value** (לא באיחוד `ExerciseType`) | WorkoutPreviewClient:95; importExcelAction:35,692 |
| 6 | runtime `WorkoutExercise.isTimeBased: boolean` (הרשות בפועל) | workout-generator.types:87; budgeting:825 |
| 7 | flattened `exerciseType: 'time'\|'reps'` (על ה-WorkoutPlan) | home/page:815; buildRunner…:142 |

**טבלת אתרי-הכרעה (build מול display):**

| file:line | הסיגנל | build/display |
|---|---|---|
| workout-budgeting.utils.ts:347-387 | `isTimeBasedExercise` (type→straight_arm→dynamic→name) | build (קנוני) |
| workout-budgeting.utils.ts:566,825 | `isTimeBasedExercise()` → `isTimeBased` | build |
| home-workout.service.ts:249 | `type==='time' \|\| straight_arm` (**בלי name heuristic**) | build (תת-קבוצה) |
| home-workout.service.ts:417 | hardcoded `isTimeBased: true` | build |
| warmup.service.ts:511 | `type==='time' \|\| straight_arm` | build (תת-קבוצה) |
| cooldown.service.ts:152-153 | `type==='time'` בלבד | build (תת-קבוצה) |
| buildRunnerWorkoutPlanFromGenerated.ts:90,142,172 | `type==='time' \|\| isTimeBased` → `exerciseType`+`isTimeBased` | flatten (גשר) |
| home/page.tsx:770,815,846 | זהה לגשר לעיל (תאום inline) | flatten (גשר) |
| exercise-display.utils.ts:45-51 | `ex.isTimeBased` → שניות/חזרות | display (preview) |
| PresentationFormatter.ts:120,233,249 | `ex.isTimeBased` | display |
| useExerciseDerivedValues.ts:147-156 | `exerciseType` → `segment.target.type` → **string-presence** של reps/duration → default `reps` | display (נגן חי) |
| useInputPickerState.ts:138 | `exerciseType==='time'` | display (picker) |
| grouping.utils.ts:105 | `exerciseType==='time' \|\| isTimeBased===true` | display (playlist) |
| set-status.utils.ts:79 | `exerciseType==='time'` בלבד | display (playlist — **שונה מ-grouping!**) |
| active/page.tsx:144 | `ex.type==='time'` בלבד (replay של אימון-שמור) | display |
| overview/page.tsx:108-109 | `ex.type==='reps'/'time'` | display |

**איך הבאג מתרחש (רפרודוקציה קונקרטית):** פלאנק שנשאר ב-CMS על `type:'reps'` (admin לא הקליק) נתפס **רק** ע"י ה-name-heuristic → `isTimeBased=true` → המחולל שומר `30` (שניות) בשדה `reps`. הגשר ל-home/runner (שעושה `OR` עם `isTimeBased`) מתייג נכון — אבל **replay של אימון-שמור דרך `active/page.tsx:144`** קורא `ex.type` לבד (`'reps'`) ומרנדר "30 חזרות" ל-30 שניות החזקה. אותו מספר, יחידה שגויה. המקרה-המראה (תרגיל-חזרות שנתפס בטעות ע"י `החזק`/`hold` בשם, או ע"י `straight_arm`) מסומן ב-`console.warn` אבל עדיין מתהפך לשניות.

**שורש:** סוג-מדידה מפוזר/מנוחש. השדה `Exercise.type` (א) אופציונלי עם default שקט `'reps'` → תת-מילוי, (ב) ולכן לא-נאמן → כל צרכן גוזר מחדש מתערובת שונה של type/mechanicalType/movementGroup/שם/metric/loggingMode/string-presence.

### 2.2 תפקיד תרגיל — warmup / main / cooldown / end

**השדה המוצהר:** `Exercise.exerciseRole: 'warmup'|'cooldown'|'main'|'recovery'|'reinforcement'` — `exercise.types.ts:267,671` (**אופציונלי**).
**אין תפקיד `end`/`finisher`** — "סוף" מיוצג ע"י `isFinisherVideo?: boolean` (`:682-687`, "appended as a finisher block **at the end**… only when `exerciseRole==='reinforcement'`") + `isFollowAlong?: boolean` (`:692`, "**defaults to true for warmup/cooldown**").

**אתרי חלוקת-תפקידים (הפיזור — 5+ מקומות עצמאיים, אף אחד לא shared):**
`home/page.tsx:865-868` · `workouts/[id]/active/page.tsx:283-285` · `workouts/[id]/overview/page.tsx:31-33` · `StatsOverview.tsx:121-123` · `workout-preview-drawer/utils/workout-conversion.utils.ts:53-55`.
כולם מיישמים ידנית `warmup=role==='warmup'`, `main=role==='main' || !role`, `cooldown=role==='cooldown'`.
⚠️ `role==='main' || !role` **בולע בשקט את `'reinforcement'`** (הוא לא `'main'` ולא falsy) → פריט-reinforcement לא תואם לאף מקטע ו**נופל**.

**שורש:** התפקיד קיים כשדה יחיד אבל (א) שירות-החימום מתעלם ממנו לטובת `isFollowAlong` (Gap 3), (ב) `isFinisherVideo`/`reinforcement` לא נצרך ע"י אף מחולל, (ג) החלוקה נגזרת מחדש ב-5+ מקומות. אותה פתולוגיה כמו §2.1.

**reuse-or-build לשני הצירים:** **Reuse.** השדות (`type`, `exerciseRole`, `isFinisherVideo`) כבר קיימים. הפער הוא **התכנסות** (לחווט את כל הקוראים לשדה אחד + מפענח אחד), + הקשחת-נתונים (backfill `type`), + מחיקת ה-phantoms. אין צורך בשדה חדש.

---

## 3. Gap 1 — חימום לא תמיד מדויק

**מיפוי שכבתי:** §5 (בריכת תוכן — מיקום סרטוני mobility) + §7 (מחולל כוח-מלא).

**קבצים+שורות**
- בונה-החימום היחיד (חי): `services/warmup.service.ts:455` `prependWarmupExercises`. קורא יחיד: `home-workout.service.ts:747` (בתוך `generateHomeWorkoutTrio`).
- Cooldown מקביל: `cooldown.service.ts:27` `appendCooldownExercises` (נקרא `home-workout.service.ts:760`).
- תקציב-סלוטים לפי זמן: `logic/session-frame.utils.ts:27-36` `warmupSlotBudget` (רצפת `WARMUP_MIN_SLOTS=2`).
- `core/config/warmup-cooldown-config.ts` (`WARMUP_COOLDOWN_BY_CATEGORY`) — **RUNNING בלבד**, נצרך רק ב-`running-engine.service.ts:646`. **לא** בנתיב כוח/בית (grep [C]). קו-מיקום מטעה.
- `hybrid/hybrid-warmup.ts` — **לא בונה-חימום**; זהו cache-warmer (`warmHybridCaches`). שם מטעה.
- Hybrid full-park משתמש בפלט בונה-הבית verbatim (`compose-park-workout.service.ts:101,112`) — אין בונה-חימום-כוח שני.

**איך עובד היום** — בונה יחיד, **מודע-דומיין וקורא את הבלוק הראשי בפועל** (לא את הספֵּק המבוקש):
- Part A (סלוט mobility כללי יחיד, `:602-644`): בוחר כל `isFollowAlong===true` (gated location בלבד) או mobility-tagged, דרך `pickWithVariety` (jitter אקראי). **עיוור-דומיין ועיוור-שריר** — אין התייחסות לדומיינים/שרירים/רמה של האימון.
- Part B ("David Scale" ladder, `:657-865`): `analyzeMainExercises` מקבץ את התרגילים הראשיים בפועל ל"משפחות" לפי `targetPrograms[0].programId→slug` (fallback `movementGroup`), משקלל, `assignSlots` נותן 1–4 סלוטים, `getSlotZone` מחשב חלון-עצימות מ-`domainLevel`. **החלק הזה כן משקף את הנבחר.**
- Time-aware trim (`:910-933`): גוזם ל-`warmupSlotBudget` coverage-first (רצפה 2).

**שורש (מנגנוני אי-דיוק קונקרטיים):**
1. **הסלוט המוביל אקראי, לא מודע-דומיין** (`:602-621`) — התרגיל הראשון שהמשתמש רואה חסר קשר לְמה שהוא עומד לאמן. התסמין ה"לא-מדויק" הגלוי ביותר.
2. **רמה שגויה כשהדומיין המאומן לא במפת-הרמות** — `analyzeMainExercises:226-229` + `getExDomainLevel:691-700` נופלים ל-`maxUserLevel` = **מקס על כל הדומיינים** (`:647-649`). משתמש L10-pull שמאמן L2-legs מקבל אזורי-חימום-רגליים מחושבים מ-L10 → חימום קשה מדי.
3. **החלטת-דילוג לפי מקס-רמה, לא per-domain** (`:652-655`) — דומיין אחד ב-L3 כופה ladder-פוטנציאציה מלא על משתמש-מתחיל-ברובו.
4. **רק `targetPrograms[0]` מגדיר משפחה** (`:199,719`) — תרגילים רב-דומייניים משויכים לתוכנית הראשונה בלבד; דומיינים משניים תת-משוקללים.
5. **`MG_TO_BROAD_PATTERN` חלקי — 7 movementGroups בלבד** (`:69-77`). כל השאר (core/abs, carry, isometrics) → `broadPattern='other'` → נכפה 1 סלוט (`:259`), מוחרג מ-`activeBroadPatterns`, וב-trim ממופה ל-`'general'`. אימוני-בטן/core מקבלים חימום גנרי תת-מכוסה.
6. **Fallbacks מתעלמים ממיקום** (Tier-3 `:776-782`, emergency `:630-642`) → סשן-פארק עלול לקבל תנועה-ביתית/וידאו-מיקום-שגוי.
7. **ה-trim עלול להפיל דפוסים מאומנים בזמן קצר** — ב-15 דק' התקציב הוא רצפת 2, והסלוט הכללי (ללא `movementGroup`→`'general'`) צורך סלוט-כיסוי → רק דפוס-מאומן אחד שורד.

**reuse-or-build:** **Reuse (נוכח-אך-חלקי).** מכונת Part B תקינה ושמישה. תיקונים ממוקדים: (א) להפוך את Part A למודע-דומיין/שריר, (ב) לפתור רמה per-domain במקום `maxUserLevel`, (ג) להרחיב `MG_TO_BROAD_PATTERN` ל-core/abs/carry, (ד) להדק fallbacks מתעלמי-מיקום. **אין בונה שני לפייס.**

---

## 4. Gap 2 — חזרות מול זמן מתחלפים

**מיפוי שכבתי:** §5 (חוזה-הבריכה: מטא-דאטה על הפריט) + §6.2 (התצוגה הכפולה — יחידת-מדידה). **זהו התסמין הראשי של החוצה-חתך §2.1.**

הפירוט המלא — השדה המוצהר, המפענח הקנוני, 7 הקידודים, טבלת אתרי-ההכרעה, הרפרודוקציה — **ב-§2.1 לעיל**. תמצית:

**שורש:** יש SoT מוצהר (`Exercise.type`) + מפענח קנוני (`isTimeBasedExercise`), אבל ה-SoT אופציונלי-עם-default-שקט ולכן לא-נאמן, וה-מפענח **נעקף** ע"י (א) re-implementations חלשות שמשמיטות את ה-name-heuristic (`home-workout:249`, `warmup:511`, `cooldown:153`), ו-(ב) נתיבי-תצוגה שקוראים `type` גולמי או string-presence (`active/page:144`, `overview:108-109`, `useExerciseDerivedValues:147-156`). המספר נכתב ע"י גזירה A (seconds) והיחידה נבחרת ע"י גזירה B (מילה) → היפוך.

**reuse-or-build:** **Reuse.** (1) לחווט כל צרכן ל-`isTimeBasedExercise()` / `WorkoutExercise.isTimeBased` המחושב-מראש. (2) **הקשחת-נתונים:** backfill `type='time'` על התרגילים שנתפסים כיום רק ע"י ה-heuristic/straight_arm — רשימת-התיקון **מזהה-את-עצמה** דרך ה-`console.warn`. (3) למחוק את ה-phantoms (`metric`, `type==='hold'`). לא להתייחס ל-`loggingMode` כציר reps/time (אורתוגונלי).

---

## 5. Gap 3 — טבטה (פולואו-אלונג) בתפקיד/מיקום שגוי

**מיפוי שכבתי:** §5 (בריכת סרטוני-טבטה — "**איפה** נכנסים במקטעים") + §7 (מחולל טבטה מבודד — "מבחן הארכיטקטורה").

**⚠️ שני דברים מובלעים תחת "טבטה":**
1. **בלוק-הפרוטוקול טבטה** — קיים **רק על `feat/route-stops-v1`** (worktree, לא ממוזג). אינטרוול של תרגילי-כוח `hiit_friendly` (שכיבות/סקוואט), 20s/10s×8. **אינו** סרטון follow-along, ומיקומו **מפורש ונכון** (finisher, אחרי ה-main). ראה §0.2.
2. **סרטוני follow-along** — קיימים על **שני** הענפים (חי). זה מה שהבאג באמת מתאר: התפקיד שלהם **מוסק** מבוליאני `isFollowAlong`, ו**זה** מה שנוחת בחזית כחימום.

**קבצים+שורות (המנגנון החי על הענף הנוכחי):**
- `warmup.service.ts:602-614` — סלקטור Stage-1: `if (ex.isFollowAlong === true) return followAlongMatchesLocation(ex)`. בוחר לפי **הבוליאני `isFollowAlong` + מיקום**, עם הערה מפורשת (`:589-590,605`): *"The distinguisher is `isFollowAlong`, NOT `exerciseRole`."* אין סינון-תפקיד.
- `warmup.service.ts:630-642` — emergency fallback: תופס **כל** `isFollowAlong===true` עם method, **מתעלם ממיקום ומתפקיד**.
- `warmup.service.ts:514,527` — `addToBlock` **דורס** `exerciseRole:'warmup'` על הנבחר.
- **`isFinisherVideo` — אפס קוראים במנוע** (grep §10). מוגדר (`exercise.types.ts:687`), נערך ב-admin בלבד; אף מחולל לא מציב אותו בסוף. גם `exerciseRole==='reinforcement'` לא נצרך (מסנני-המקטעים תואמים רק warmup/main/cooldown/recovery — §2.2).
- **סדר-הבלוקים:** warmup `unshift` (חזית) → main → cooldown `append` (סוף). **אין בלוק-finisher.**

**איך עובד היום** — התפקיד מ-authored ב-`exerciseRole`, אבל שירות-החימום **מתעלם מהשדה** לסרטוני follow-along ובוחר לפי `isFollowAlong` (`:608`), וה-fallback בוחר כל follow-along ללא-קשר-לתפקיד (`:632`). ואז `addToBlock` **כותב מחדש** את התפקיד ל-`'warmup'`. סרטון follow-along שנועד לסוף (cooldown/recovery/reinforcement "finisher video") כשיר לסלוט-החימום-הקדמי אך ורק בגלל דגל `isFollowAlong`, וברגע שנבחר — **נהיה** החימום. במקביל, המנגנון שנועד למקם אותו בסוף (`isFinisherVideo`/`reinforcement`) **לא נקרא כלל** → לסרטוני-"סוף" אין בית מלבד החזית.

**שורש:** התפקיד/מיקום של follow-along הוא **הסקה שבירה מבוליאני (`isFollowAlong`), לא השדה המפורש `exerciseRole`**. אותה פתולוגיה כמו #2/#5. (א) הסלקטור מכוון על `isFollowAlong` ומתעלם מ-role, (ב) דורס role ל-warmup, (ג) `isFinisherVideo`/`reinforcement` לא-נצרך.

**reuse-or-build:** **Fix, לא build** — השדות קיימים:
1. **לשער את בחירת-החימום לפי role** — להחריג `cooldown`/`recovery`/`reinforcement` מסלקטור Stage-1 (`:602-614`) ומה-fallback (`:630-634`).
2. **לחווט את slot-הסוף שכבר יש לו שדה** — מקטע-reinforcement/finisher שצורך `isFinisherVideo`/`exerciseRole==='reinforcement'`.
3. **De-scatter** (משותף עם #2/#5) — להוציא את חלוקת ה-warmup/main/cooldown/**reinforcement** לפונקציה אחת ולקרוא לה מכל 5+ האתרים, כדי ש-`'reinforcement'` יפסיק ליפול ב-`role==='main' || !role`.
- **אם המטרה טבטה-כפרוטוקול:** העבודה היא **מיזוג `feat/route-stops-v1`** (שם המיקום מפורש, id-based, מכוסה-טסטים) — לא בניית לוגיקת-מיקום חדשה על הענף הזה.

---

## 6. Gap 4 — שיטות ביצוע (בניית פירמידה / סט-שיא / סופר-סט)

**מיפוי שכבתי:** §6 (שיטות — buildSets/params) + §7 (המחולל שולף שיטה ומיישם).

**⚠️ התנגשות-שמות:** "method" בקוד = שני דברים. (א) **ExecutionMethod** = וריאנט מיקום/ציוד (`method-selection.utils.ts`, `execution-method-selector.service.ts`) — נצרך ב-swap/generation-pool, **לא** קשור לסידור-סטים, **אינו** שורש Gap 4. (ב) **שיטות-סידור** (פירמידה/סט-שיא/סופר-סט) — חיות במעבדי-הפרוטוקול + `WorkoutGenerator`. Gap 4 עוסק ב-(ב).

### פירמידה
**קבצים:** צורות/סכמת-חזרות: `logic/protocols/pyramid.processor.ts:172-223` (`PYRAMID_SHAPES`), תבניות-סלוט `:168-170`, TUT `:236` (`TUT_REPS_TO_SECONDS=2.5`). בחירת-יעד: `WorkoutGenerator.ts:146-177` (`selectPyramidTargets`) + set-כשירות `:111-117`; dispatch `:991-1017`. וריאנט-per-step: `pyramid.processor.ts:449-560`, build-step `:574-595,679-685`.
**איך עובד:** סכמת-חזרות = טבלה קבועה per-difficulty (D1 `[10,8,6]`, D2 גל `[8,5,3,5,8]`, D3 peak `[8,3,1]`+slot peak). ה"עומס" per-step אינו %/משקל אלא **החלפת-וריאנט** בחלון-רמה אלסטי. חוזה מכני: <3 וריאנטים → מבטל פירמידה וחוזר לסטים-ישרים (`:688-721`). **רק תרגיל אחד/סשן** מפורמד (`:119-122`).
**שורש (3 ליקויים):**
1. **זמן-עבודה שגוי (time-based):** step time-based → `targetHold = round(reps × 2.5)` (`:583`). ה"reps" הם מספרי-הסולם `[8,3,1]` → step-פלאנק-שיא נהיה `1×2.5=3s`, חימום `8×2.5=20s`. **מתעלם מטבלת-ההחזקה האמיתית** (`volumeTier.hold`).
2. **מנוחה שגויה:** קובע `sets`+`pyramidSequence` אבל **לא נוגע ב-`restSeconds`** → מנוחה שטוחה per-tier, בלי הסלמה לקראת סט-השיא.
3. **בחירה שגויה:** `selectPyramidTargets` מסנן לפי `movementGroup`+priority בלבד, **לא מתייעץ עם `isTimeBasedExercise`** → `planche`/`hspu` (איזומטריים) כשירים → סולם-חזרות מוטבע על איזומטרי.

### סט-שיא (סט שיא)
**קבצים:** `pyramid.processor.ts:208-222` (D3), classifier `:294-333` (`classifyPyramidShape→'peak'|'wave'`), label `:340-346`, תג-UI `PresentationFormatter.ts:67,203,261`.
**איך עובד:** **אינו מעבד/פרוטוקול נפרד** — זו וריאנט ה-D3 של הפירמידה + **סיווג-צורה**. monotonic-up ⇒ `'peak'` ("סט שיא"); up-then-down ⇒ `'wave'`. אין נתיב-בנייה עצמאי.
**שורש:** יורש כל ליקוי-פירמידה (הוא *הוא* ה-D3). אין knob עצמאי — אי-אפשר להרשות סט-שיא בלי לעבור דרך מעבד-הפירמידה ו-cap-הבחירה של 1/סשן.

### סופר-סט (אנטגוניסט)
**קבצים:** מעבד `antagonist-pair.processor.ts:14-18` → `applyAntagonistPairing` (`workout-sorting.utils.ts:299-530`). הפעלה חיה: `PresentationFormatter.ts:348` ← `home-workout.service.ts:926` (`sortAndPair`).
**איך עובד:** מעבר **סידור-ותיוג בלבד** — משזר אנטגוניסטים וכותב `pairedWith`. **לא קובע reps/זמן/מנוחה** — כל תרגיל שומר את ה-base per-tier שלו.
**שורש:**
1. **מנוחה שגויה:** אין מודל-מנוחת-סופרסט חי → זוגות מקבלים מנוחה שטוחה per-tier, לא 30s-בין/90s-אחרי. הלוגיקה קיימת רק ב-**dead** `RestCalculator.ts:103` (`antagonist_pair: 0.5`).
2. **פרוטוקול `'superset'` = no-op שקט:** השם מוצהר (`workout-generator.types.ts:324`) אבל **אין לו מעבד** (הרישום מחזיק רק Antagonist+Pyramid; `CompoundSupersetProcessor` מוער-בהערה) → `findProcessor` מחזיר undefined → `protocol_not_found`, כלום לא מוטבע, אבל `appliedProtocol='superset'` עדיין מדווח (`WorkoutGenerator.ts:1227`).
3. **`supersetType` לעולם לא נכתב:** מוצהר (`:116`) עם **אפס writers**.

### בסיס משותף (למה "המנוחה שגויה" מבנית)
`sets`/`reps`/`restSeconds` מוטבעים פעם אחת ב-`assignVolume` (`workout-budgeting.utils.ts:685,705`) מטבלת-tier (`workout-generator.types.ts:51-55`). מנוחה = **tier-driven, method-agnostic**. פירמידה דורסת reps+sets בלבד; סופרסט לא דורס כלום.

### live-vs-dead processors
| מודול | חי? | קורא (או 'אין') |
|---|---|---|
| `WorkoutGenerator.generateWorkout` | ✅ | `PipelineOrchestrator.ts:308` |
| `PyramidProcessor` | ✅ | `WorkoutGenerator.ts:991→1009` |
| `applyAntagonistPairing` (הסופרסט האמיתי) | ✅ | `PresentationFormatter.ts:348` |
| `AntagonistPairProcessor` (רישום) | ⚠️ עודף | רק אם `'antagonist_pair'` זוכה בהגרלה; הפיירינג רץ ללא-תנאי דרך `PresentationFormatter` |
| `ProtocolInjector` (core/pipeline) | ❌ DEAD | אין `.inject(` callers; כפיל שהתפצל מ-WorkoutGenerator |
| `RestCalculator` (מודל-המנוחה מודע-השיטה היחיד) | ❌ DEAD | רק re-export ב-`index.ts` |
| `superset`/`emom` protocols | ❌ אין מעבד | מוערים-בהערה ברישום |
| `supersetType` field | ❌ dead | אפס writers |

**reuse-or-build:** **Reuse+Build ממוקד.** Reuse: טבלאות-הצורה, בחירת-היעד, `applyAntagonistPairing`. Build: (א) ענף time-based בפירמידה (להשתמש ב-`volumeTier.hold` במקום `reps×2.5`), (ב) מנוחה-מודעת-שיטה (להחיות את מודל-המנוחה של `RestCalculator` — אבל **לא לבנות עליו כמו-שהוא**, הוא dead ומתפצל), (ג) gate כשירות-איזומטרי ב-`selectPyramidTargets`, (ד) מעבד-סופרסט אמיתי או מחיקת `'superset'`/`supersetType`.

---

## 7. Gap 5 — נגן חי: סטים מיוחדים לא מסונכרנים

**מיפוי שכבתי:** §6.2 (חוזה התצוגה הכפולה — `renderActive` מול `renderPreview`).

**קומפוננטה חיה (מאומת):** `StrengthRunner` בלבד — `app/workouts/[id]/active/page.tsx:1399` (סשן עצמאי) + `HybridStationLayer.tsx:18` (תחנת-hybrid). שאר ה-`…Active`/`…Overlay` הם נגני-**ריצה**. `LiveWorkoutOverlay` לא-קיים כנגן-כוח. **אין dual-render לכוח.**
פירמידה = סט-שיא באותו מנגנון-ריצה (`pyramidSequence[]` אחד). אין נתיב-live ייעודי לסט-שיא (grep §10).

**מה מסונכרן (IN SYNC — לא לגעת):**
- **ספירת/סדר סטים:** live קורא `ex.sets` (`useWorkoutStateMachine.ts:258-267`), וה-build מטביע `sets===pyramidSequence.length` (`pyramid.processor.ts:696`), + `BudgetDistributor` הופך פירמידות חסינות-לעריכת-ספירה (`:289-314`). המונה "שלב N/M" מסכים עם ה-ladder.
- **ערכי-step (reps/hold/שם/וידאו):** `usePyramidManager` **קורא** `pyramidSequence[i]` — לא גוזר-מחדש. כל הערכים קוראים את ה-step (`useExerciseDerivedValues.ts:172-205,306-342`).
- **מנוחה בין-steps:** ה-build שומר `restSeconds` יחיד (בלי per-step) ו-live קורא אותו (`:162-169`). אין ממה לסטות.

**מה לא מסונכרן (הבאג האמיתי — reps↔time render mode per-step):**
step-פירמידה נבנה כ-**reps XOR hold**: `buildStep` כותב `{targetHold}` לוריאנט-זמן ו-`{targetReps}` אחרת (`pyramid.processor.ts:574-584`), והמטריקה נפתרת **per-variant** (`:679-683`) — בדיוק כדי שאב-reps יחזיק step-שיא מסוג-hold (למשל D3 `[8,3,1]` שה-slot-peak שלו = החזקת-planche). אבל הנגן קובע את **מצב-התצוגה מ-`exerciseType` היחיד של האב**, שמחושב פעם אחת ב-flatten (`buildRunnerWorkoutPlanFromGenerated.ts:90,142`) ולעולם לא נדרס per-step:
- `useExerciseDerivedValues.ts:147-156` גוזר `exerciseType` מ-`activeExercise.exerciseType` בלבד — **לא מתייעץ עם `pyramidStep`**.
- `StrengthRunner.tsx:446` `isTimeExercise = sm.exerciseType==='time'` → `ActiveExerciseView.tsx:191-203` (timer card מול reps card).
- `useInputPickerState.ts:138` — יחידת-picker מהאב.

**תוצאות לפירמידה/סט-שיא מעורב:**
- **step-hold תחת אב-reps:** `isTimeExercise=false` → **אין countdown**; רץ כ-reps card + `FillingButton` שממלא אוטו' על `targetReps×2.5+5`. הטקסט נכון ("X שניות") אבל **אין טיימר-החזקה אמיתי**, וה-picker מציג גלגל-חזרות.
- **step-reps תחת אב-time:** `isTimeExercise=true` → `IsometricTimerCard` לסט-חזרות; ה-`duration` נופל ל-default 30s כי `targetHold` null.
- **שיבוש-לוג:** `handleExerciseComplete` prefill `reps ?? targetReps` (`useWorkoutStateMachine.ts:783-786`); ל-step-hold, `targetReps` מחזיר `step.targetHold` (`:202-203`) → שניות-החזקה נרשמות כמספר-חזרות.
- **מראה בצד ה-preview:** `set-status.utils.ts:79` = `exerciseType==='time'` per-pill → preview ו-live **שגויים-יחד** על mode, ו**נכונים-יחד** על value.

**שורש:** הנגן (וה-preview) בוחרים **render-mode + input-unit מ-`exerciseType` ברמת-האב**, בעוד הפירמידה מקודדת מטריקה **per-step**. כל גזירת-*ערך* עודכנה לקרוא `pyramidStep`, אבל בורר-ה-*type/mode* לא. פירמידות טהורות (כולן-reps/כולן-hold) עובדות; **ladders מעורבים — סט-השיא ה-D3 הנפוץ עם שיא-hold — שם צצים התסמינים.** אותו שורש כמו #2.

**reuse-or-build:** **Reuse, תיקון כירורגי — בלי קומפוננטות חדשות.** לגזור type אפקטיבי per-step (`activeStepType = pyramidStep ? (pyramidStep.targetHold!=null?'time':'reps') : exerciseType`) ולהזין ל-3 השערים (`StrengthRunner:446`, ה-`exerciseType` ל-`ActiveExerciseView`, `useInputPickerState:138`). כל plumbing-הערך כבר קורא step. **לא לגעת** ב-`moveToNext`/rest/`pyramidSequence`.

---

## 8. Gap 6 — קונפיג המחולל (זמן/שרירים/תוכנית מול הפלט)

**מיפוי שכבתי:** §4 (חוזה ה-`UserContext`→המחולל) + §7.

**כותרת:** באג ה-overwrite מ-12.07 **תוקן** (§0.3). אין `GeneratorConfig`/`HomeWorkoutConfig`/`planId` — אובייקט-הקונפיג היחיד הוא `HomeWorkoutOptions` (`home-workout.types.ts:26-194`): זמן=`availableTime`, שרירים=`requiredDomains`+`strictDomains`, תוכנית=`scheduledProgramIds`. אין `selectedMuscles` (muscleGroups = מטא-תצוגה per-exercise ב-runtime בלבד, לא קלט-generation).

**4 משטחי-קונפיג:** Home trio (`StatsOverview`, **אין UI זמן/שריר** — hardcoded) · Custom Builder (`WorkoutBuilderSheet`, קונפיג מלא) · Adjuster (`UserWorkoutAdjuster`) · Admin Simulator.

| קלט | סטטוס | פירוט + שורש-לשארית |
|---|---|---|
| **זמן** (`availableTime`) | ✅ מכובד כתקרה ±3 | `resolveEffectiveBoltTime=min(requested,cap)` (`bolt-time.utils.ts:17`); `enforceVolumeCap` מקבל `effectiveTime` לא-קבוע (`home-workout.service.ts:793-798`). **שאריות:** (א) תקרה-בלבד, אף פעם לא target → 60 דק' לא מרפד נפח למעלה; תקציב-הסטים level/weekly-driven (`:1987`). (ב) home-dashboard **בלי picker-זמן** (hardcoded 60/15, `StatsOverview.tsx:736`). (ג) buckets גסים (15/20/25/30 → אותו bucket, `workout-budgeting.utils.ts:127`). |
| **שרירים** (`requiredDomains`+`strictDomains`) | ✅ מכובד | Builder = פוקוס-קשה (שניהם). Adjuster = **רך** (`requiredDomains` בלי `strictDomains` → guarantees עלולים להזריק off-target). Home trio = בלי UI (דומיינים מהתוכנית). צריכה: `WorkoutGenerator.ts:1533-1537`, `GuaranteePassRunner.ts:91,273`. |
| **תוכנית** (`scheduledProgramIds`) | ✅ מכובד מלא | דורס `activePrograms`, מניע גם פוקוס-דומיין וגם רזולוציית-רמה/פרוטוקול (`home-workout.service.ts:1139-1146,1202,1892-1898`). אין drop. |

**מיס-וייר צמוד — נפילת DIFFICULTY ב-Adjuster (משפיע על תקרת-הזמן):**
`generateHomeWorkout` מחזיר `trio.options[1]` (תמיד D2/Bolt-2) כש-`targetDifficulty` לא-מוגדר, ו-`options[0]` רק כשהוא מוגדר (`home-workout.service.ts:209-210`). Builder מעביר `targetDifficulty` (`WorkoutBuilderSheet.tsx:622`) → נכון. **Adjuster מעביר `difficulty` אבל לא `targetDifficulty`** (`UserWorkoutAdjuster.tsx:127-139`) → בחירת-הקושי **נופלת בשקט**, וכתוצאה הזמן נחתך ל-45 (תקרת Bolt-2) גם שהסליידר עד 60.
**שורש:** ה-wrapper בוחר slot-טריו **לפי מיקום**, מפתח על `targetDifficulty`; ה-Adjuster קובע רק `difficulty` שה-loop דורס (`:683`).

**reuse-or-build:** **Reuse.** כל ה-plumbing קיים. תיקוני-מדיניות: (א) העברת `targetDifficulty:difficulty` ב-Adjuster (שורה אחת), (ב) חשיפת picker-זמן ב-home-dashboard, (ג) החלטה אם זמן-ארוך צריך לרפד נפח (target ולא רק ceiling), (ד) הוספת `strictDomains` ל-Adjuster אם רוצים פוקוס-קשה.

---

## 9. הצעת סדר-תיקון (מה קודם, מה תלוי במה)

**עיקרון:** מתקנים את **השורש המשותף בשכבת-התוכן (§5/§6)** תחילה — הוא מחלחל ל-#2/#3/#5. לאחר-מכן תיקונים מקומיים.

| # | צעד | משכך | תלות | סיכון |
|---|---|---|---|---|
| **1** | **סוג-מדידה → SoT יחיד.** backfill `Exercise.type` (רשימה מזוהה-עצמית דרך ה-warn); לחווט כל צרכן ל-`isTimeBasedExercise()`/`isTimeBased`; למחוק phantoms (`metric`, `type==='hold'`). | **#2 מלא** + מסיר את שורש-ה-mode ל-#5 | — | נמוך-בינוני (data + מספר cutover-קריאות) |
| **2** | **תפקיד → SoT יחיד.** לחלץ חלוקת warmup/main/cooldown/**reinforcement** לפונקציה אחת (5+ אתרים); לחווט slot-סוף שצורך `isFinisherVideo`/`reinforcement`. | **#3** (סוף אמיתי) + מונע drop של reinforcement | — | נמוך |
| **3** | **per-step type בנגן.** `activeStepType` → 3 השערים ב-`StrengthRunner`/`ActiveExerciseView`/`useInputPickerState`. | **#5** (ה-desync היחיד) | תלוי ב-#1 (מסתמך על `isTimeBased` נקי) | נמוך (3-4 שערי-שורה) |
| **4** | **חימום מודע-role.** להחריג cooldown/recovery/reinforcement מסלקטור Stage-1 + fallback. | חלק מ-**#3** (טבטה-כחימום) + #1(חימום) | תלוי ב-#2 (role נקי) | נמוך |
| **5** | **שיטות: hold+rest.** ענף time-based בפירמידה (`volumeTier.hold`); מנוחה-מודעת-שיטה; gate איזומטרי ב-`selectPyramidTargets`; החלטת superset/supersetType. | **#4** (שיטות) | תלוי ב-#1 (זיהוי time-based לבחירה) | בינוני (לוגיקת-מנוחה) |
| **6** | **חימום — דיוק-בחירה.** Part A מודע-דומיין; רמה per-domain; `MG_TO_BROAD_PATTERN` מורחב; הידוק fallbacks-מיקום. | **#1** | עצמאי | בינוני |
| **7** | **קונפיג.** `targetDifficulty` ב-Adjuster; picker-זמן ב-home; מדיניות ceiling↔target. | **#6 (קונפיג)** | עצמאי | נמוך |

**החלטת-מוצר תלויה:** האם "טבטה" המבוקשת = בלוק-הפרוטוקול (⇒ **מיזוג `feat/route-stops-v1`**, לא בנייה) או סרטוני-follow-along (⇒ צעדים 2+4). **לשאול את דוד** לפני שמתחילים את #3-הטבטה.

---

## 10. נספח grep — גיבוי לכל טענת "לא קיים / לא-מחובר"

```bash
# [§0.2] "tabata" לא קיים ב-src בענף הנוכחי (ZERO)
grep -rniE "tabata" src/ --include="*.ts" --include="*.tsx" | wc -l          # → 0
grep -rniEl "tabata" . --include="*.ts" --include="*.md" | grep -v node_modules
#   → כל hit תחת .claude/worktrees/feat+route-stops-v1/ בלבד (ענף לא-ממוזג)

# [§0.1] נתיב Truth-file לא קיים; המנוע החי אחר
ls src/features/workout-engine/generator/services/workout-generator.service.ts  # → No such file
grep -rn "GeneratorConfig\|HomeWorkoutConfig\|planId\b" src/                    # → 0 (הקונפיג הוא HomeWorkoutOptions)

# [§0.3] אין overwrite-site; BOLT_DURATION_CAPS = תקרה
grep -rn "BOLT_DURATION_CAPS" src/    # → bolt-time.utils.ts:7(doc), home-workout.service.ts:516(def),693(read-as-ceiling)

# [§2.1] 'metric' לא-מוצהר (phantom, as any); 'hold' לא באיחוד ExerciseType
grep -rn "metric[?]:" src/.../exercise.types.ts src/.../workout-generator.types.ts   # → אין
grep -n "type ExerciseType" src/features/content/exercises/core/exercise.types.ts    # → :94 'reps'|'time'|'rest' (אין 'hold')
grep -rniE "=== ?'hold'|metric: 'hold'" src/  # → WorkoutPreviewClient:95, useExerciseSwap:161, pyramid.processor:680

# [§2.1] רק 3 צרכנים משתמשים במפענח הקנוני
grep -rn "isTimeBasedExercise" src/    # → def budgeting:347; callers budgeting:566, derive-swapped-entry:41, useExerciseSwap:162

# [§3/§5] isFinisherVideo — אפס קוראים במנוע (שני העצים)
grep -rniE "isFinisherVideo" src/features/workout-engine/ .claude/worktrees/*/src/features/workout-engine/   # → 0

# [§3] שירות-החימום בוחר לפי isFollowAlong, דורס role
grep -niE "isFollowAlong|exerciseRole" src/features/workout-engine/services/warmup.service.ts
#   → 608 (isFollowAlong selection), 632 (fallback), 514/527 (overwrite role='warmup')

# [§1] warmup-cooldown-config = RUNNING בלבד; hybrid-warmup = cache-warmer; קורא-יחיד לחימום
grep -rn "WARMUP_COOLDOWN_BY_CATEGORY" src/ | grep -v "running-engine\|warmup-cooldown-config.ts"   # → אין
grep -n "export" src/features/workout-engine/hybrid/hybrid-warmup.ts                                 # → warmHybridCaches בלבד
grep -rn "prependWarmupExercises(" src/ | grep -v "export function"                                  # → home-workout.service.ts:747 (יחיד)

# [§6] מעבדים מתים; superset/supersetType לא-מחוברים
grep -rn "\.inject(" src/features/workout-engine                              # → אין (ProtocolInjector DEAD)
grep -rn "RestCalculator\|createRestCalculator" src/ | grep -v "index.ts\|__tests__\|RestCalculator.ts"  # → אין (DEAD)
grep -rn "supersetType" src/features/workout-engine | grep -v __tests__       # → decl :116 בלבד (0 writers)
grep -n "Processor," src/features/workout-engine/logic/protocols/protocol-processor.registry.ts
#   → Antagonist+Pyramid; // EMOMProcessor, // CompoundSupersetProcessor (מוערים)

# [§5] StrengthRunner = נגן-הכוח היחיד; LiveWorkoutOverlay לא-קיים כנגן-כוח
grep -rnE "<StrengthRunner" src/          # → app/workouts/[id]/active/page.tsx:1399 (+ HybridStationLayer embedded)
grep -rlniE "LiveWorkoutOverlay" src/     # → קיים ב-players/strength אבל אינו נגן-הכוח החי (ראה §5)
```

---

## 11. מיפוי לשכבות מסמך הארכיטקטורה

| Gap | תסמין | שכבת-מסמך | קובץ-שורש חי |
|---|---|---|---|
| **חוצה-חתך §ז** | reps↔time + role מפוזרים | §5 (חוזה-בריכה) + §6.2 | `exercise.types.ts` (שדות), `workout-budgeting.utils.ts:347` (מפענח) |
| **#2** חזרות↔זמן | יחידה שגויה | §5 + §6.2 | `active/page.tsx:144`, `useExerciseDerivedValues:147` (קוראים גולמי) |
| **#3** טבטה | תפקיד/מיקום | §5 ("איפה נכנס") + §7 (מחולל טבטה) | `warmup.service.ts:608` + `isFinisherVideo` לא-נצרך |
| **#4** שיטות | זמן/בחירה שגויים | §6 (buildSets/params) | `pyramid.processor.ts:583`, `applyAntagonistPairing` (rest חסר) |
| **#5** נגן חי | mode לא-מסונכרן | §6.2 (renderActive) | `StrengthRunner.tsx:446` (type ברמת-אב) |
| **#6** קונפיג | drop דק | §4 (UserContext→מחולל) | `home-workout.service.ts:209` (Adjuster difficulty) |

---

*סוף מסמך. כל הממצאים חקירתיים בלבד — לא בוצע שינוי-קוד ולא commit.*
