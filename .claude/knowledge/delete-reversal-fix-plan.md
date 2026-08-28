# תוכנית: תיקון deleteWorkoutWithReversal — ביטול מלא, לא רק XP+streak

> נוצר: 22.08.2026 | תוכנית כתובה בלבד — **אין קוד עדיין**. ממתין לאישור דוד. רקע מלא: [[hybrid-completion-state-gaps]] Finding 1.

## מה מתקנים
`deleteWorkoutWithReversal` מבטל XP + streak, אבל לא `today.categories[cat].minutes/.sessions` (activity store, גם ב-Firestore) ולא `dailyProgress.workoutCompleted`. תיקון גנרי — לכל סוג אימון, לא רק hybrid.

## עובדות-יסוד (מאומתות, file:line)

שלושת חלקי ה-state יושבים ב**שלושה דוקים נפרדים**:

| State | דוק Firestore | כתיבה קיימת |
|---|---|---|
| `categories[cat].minutes/.sessions` | `dailyActivity/{userId}_{date}` | `syncToServer` (`useActivityStore.ts:796,820-834`) — `setDoc(merge:true)` על **כל** ה-day shape |
| `currentStreak`/`lastActivityDate` | `streaks/{userId}` + מראה ב-`users/{userId}.progression` | `reverseStreakForToday`→`syncToServer` (`:704-709,852,875-878`) |
| `dailyProgress.workoutCompleted` | `dailyProgress/{userId}_{date}` | `markTodayAsCompleted` (`useProgressionStore.ts:846,891-925`) |

3 הצעדים הקיימים ב-`workoutDeletion.ts:74-160`:
1. **XP reversal** = Cloud Function callable `reverseWorkoutXP` (`reverseWorkoutXP.ts:23,39`) — **לא** client Firestore write. כבר idempotent (marker טרנזקציוני, axioms §2).
2. **מחיקת דוק** = `deleteDoc` ישיר (`storage.service.ts:389-399`), מחזיר את הדוק שנמחק.
3. **ביטול streak** = client writes דרך `syncToServer` (setDoc/updateDoc, merge), מותנה ב-`workoutDateStr===todayStr && remainingToday===0`.

## (א) האם נדרש transaction אחד? — **לא אפשרי במלואו, אבל writeBatch כן אפשרי ונדרש**

CF callable (שלב 1) **לא יכול** לשבת באותו client-side transaction/batch עם writes ישירים — זו מגבלה ארכיטקטונית, לא בחירה. **אבל** כל שאר הפעולות (מחיקת הדוק + עדכון 3 הדוקים הישירים) **כולן writes ישירים מהקליינט** לדוקים של אותו user — ואפשר וצריך לאחד אותן ל-**`writeBatch` אחד אטומי**, כדי לעמוד ב-Agent Operating Rule 4 ("Partial success is silent data corruption") ככל שהארכיטקטורה מאפשרת:

```
const batch = writeBatch(db);
batch.delete(doc(db, 'workouts', workoutId));                          // היה deleteDoc נפרד
batch.set(dailyActivityRef, updatedDailyActivity, { merge: true });    // categories מופחתים — חדש
batch.set(streaksRef, streakFields, { merge: true });                  // קיים, מוזז לתוך ה-batch
batch.update(usersRef, { 'progression.currentStreak': ..., ... });     // קיים, מוזז לתוך ה-batch
if (remainingToday === 0) {
  batch.set(dailyProgressRef, { workoutCompleted: false }, { merge: true }); // חדש
}
await batch.commit();
```

סדר מוצע: (1) `reverseWorkoutXP` CF (כמו היום, ראשון) → (2) `getDoc` על דוק האימון (לפני מחיקה, כדי לחשב תרומה — ראה §ב) → (3) `getWorkoutsForDate` לחישוב `remainingToday` (קיים היום) → (4) בניית ה-batch למעלה → (5) `commit()`. שלב 1 נשאר מחוץ ל-batch (מוכרח); שלבים 2-5 הופכים לאטומיים יחד, לעומת רצף `setDoc`/`updateDoc` נפרדים כמו היום.

## (ב) איך מפחיתים בדיוק, לא מאפסים — כשיש כמה אימונים באותה קטגוריה/יום

התרומה מחושבת **מהדוק הנמחק עצמו** (לא מהיום כולו), אז שני אימונים באותה קטגוריה לא מתנגשים — כל אחד מפחית רק את מה שהוא הוסיף:

- **אימון רגיל (strength/cardio/recovery):** תרומה = `Math.round(deletedEntry.duration / 60)` דקות על `deletedEntry.category`, `.sessions -1`. (העלייה המקורית: `logWorkout`, `useActivityStore.ts:515-516`.)
- **Hybrid:** תורם **לשתי** הקטגוריות (`categorySplits`, `useHybridRun.ts:217-220`). נגזר מ-`deletedEntry.segments[]` — בדיוק אותה לוגיקה של `workoutHistoryEntryToHybridFinalizeResult` (כבר קיימת, `hybrid-history-adapter.ts`): `aerobicSec = summary.totalActualAerobicSec`, `strengthSec = totalDurationSec - aerobicSec`. תרומה = `Math.round(aerobicSec/60)` ל-cardio, `Math.round(strengthSec/60)` ל-strength, `.sessions -1` על **שתיהן**.
- **⚠️ סטיית עיגול ידועה:** כל חצי עוגל בנפרד גם בשמירה המקורית — הפחתה מחדש עלולה לסטות ב-≤1 דקה מהתוספת המקורית. לא תוקן — לא שווה את המורכבות, מתועד כאן כדי שלא יופתעו.
- **הגנת שלילי:** `Math.max(0, current - contribution)` על כל שדה — כי סנכרון server/client יכול להיות לא מדויק (סיכון אמיתי, לא תיאורטי).

## dailyProgress.workoutCompleted — תנאי ביטול + מי עוד קורא

תנאי: **בדיוק אותו** `remainingToday===0` שכבר מחושב לצורך ה-streak (שימוש חוזר, לא חישוב כפול).

קוראים נוספים ל-`workoutCompleted` (מעבר ל-`useDayStatus.ts:119-126`) — כולם עקביים סמנטית עם "בטל אם לא נותר אימון היום", אבל אחד מהם משפיע מעבר לכרטיס/לתא היומי:
- `home/page.tsx:405` — `todayWorkoutDone` (כרטיס + טריגר ה-carousel)
- `MonthlyCalendarGrid.tsx` — תא-יום בלוח חודשי
- `usePastWorkoutCompleted.ts` — דגל "flame" ליום שעבר
- `useSmartGreeting.ts` — נוסח הברכה
- **`useWeeklyStrengthGoal.ts:66-69`** — צבירה **שבועית** (`isStrengthLegacy = workoutCompleted && workoutType==='strength'`). ביטול היום ישנה את הספירה השבועית. נכון סמנטית (אימון שנמחק לא אמור להיספר) אבל זו **תופעת-לוואי רחבה יותר** מכרטיס הבית/תא היומי — שווה שתדע לפני שממשיכים, לא חוסם.

## מה לא נוגעים בו
- לוגיקת XP reversal עצמה (`reverseWorkoutXP` CF) — כבר נכונה, כבר idempotent.
- כל דוק/collection אחר.
- לא hybrid-ספציפי — התיקון חל אחיד על כל סוג אימון.

## הצעד הבא
לאשר את התוכנית (בפרט: ה-writeBatch, נוסחת החישוב ל-hybrid, וה-flag על `useWeeklyStrengthGoal`) — ואז מימוש בפועל.
