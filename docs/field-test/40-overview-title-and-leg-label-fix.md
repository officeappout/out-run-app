# 40 — PR קטן: כותרת מבט-על (#2) + תווית "רגל ריצה" (#4)

**תאריך:** 23.09.2026
**ענף:** `fix/hybrid-overview-title-and-pace-label`
**סטטוס:** ממתין לאישור דוד — diff מוכן, טרם merge

---

## #2 — כותרת מבט-על לפי ה-mode בפועל

**באג:** `HybridOverviewScreen.tsx:413-414` בדק רק `composed.bolts` כדי להחליט בין "אימון מלא
בפארק" ל"אימון משולב" — אבל `composeRouteStopsWorkout` **גם** מחזיר `bolts` (טריו, בדיוק כמו
full-park — מתועד ב-`ComposedHybridSession.bolts`'s doc comment, `start-hybrid-session.ts`).
משמעות: מסלול+עצירות היה מציג בטעות "אימון מלא בפארק".

**תיקון:** `composed.fullParkRun === false` נבדק **ראשון** — זה השדה שכבר קיים בקוד
(`start-hybrid-session.ts:78`, מוגדר במפורש ל-`false` רק ע"י `composeRouteStopsWorkout`,
שורה 999) בדיוק בשביל להבחין בין השניים. route_stops מציג עכשיו "מסלול + עצירות"; אימון מלא
בפארק ותקציב-מפוצל נשארים ללא שינוי (fallback זהה לקוד הקיים).

## #4 — "רגל ריצה" גם בהליכה

**באג:** `HybridJourneyAxis.tsx` — כשאין `stationName` (מסלול legacy/bodyweight-fallback ללא
תחנה אמיתית), תווית הרגל האווירובית הייתה מקודדת קשיח "רגל ריצה N — X", גם כשהפעילות בפועל
היא הליכה. המשתנה `action` (`(seg.aerobicType ?? 'walking') === 'running' ? 'ריצה' : 'הליכה'`)
כבר קיים ומחושב נכון — פשוט לא היה בשימוש בשני המקומות האלה.

**תיקון:** שני המקומות (`legTitle`'s fallback, והרינדור בפועל בענף `!stationName`) עכשיו
משתמשים ב-`` `רגל ${action} N — X` `` במקום המחרוזת הקשיחה.

---

## טסטים

`hybrid-overview-screen-design-unification.test.ts` — תיקנתי regex אחד ששבר בגלל שינוי צורת
ה-ternary (עדיין בודק אותה כוונה: budget-split שומר "אימון משולב"), והוספתי 3 טסטים חדשים:
1. `fullParkRun===false` נבדק **לפני** `bolts` בסדר הבדיקה (מוודא ש-route_stops לא ייפול
   בטעות לענף full-park).
2. אין יותר מחרוזת "רגל ריצה" קשיחה בקובץ.
3. שני המקומות משתמשים ב-`action`.

11/11 עוברים (8 קיימים + 3 חדשים). כל תיקיית `__tests__/hybrid` — 21/21. רגרסיה מלאה:
2199 עברו, אותם 2 כשלים ידועים. `tsc --noEmit`: 802, ללא שינוי.

---

## החלטה

ממתין לאישור דוד. לאחר אישור: merge, Vercel Ready, SHA + revert, עצירה.
