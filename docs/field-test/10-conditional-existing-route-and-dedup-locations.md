# תנאי existing_route + מיקומי דה-דופ — 22.09.2026

## 1. שתי בדיקות בהרצה — כפי שנדרש

**סקריפט:** שחזור מדויק (לא ניחוש) של לוגיקת "המסלול המפורסם הקרוב ביותר" מתוך `resolveRouteStopsBackbone('existing_route', ...)`, מורץ ישירות מול Firestore אמיתי.

**תרחיש א' — משתמש 3 ק"מ מהמסלולים של שדרות:**
```
routes available: 27
nearest published route: שדרות בפארק קלאסי @ 1938m
exceeds 800m cap? true
=> resolveRouteStopsBackbone would return: null
```
המסלול הקרוב ביותר בפועל הוא 1938מ' — מעל ה-cap הקיים (800מ'). `null` מוחזר, בלי שגיאה.

**תרחיש ב' — אשקלון, 0 מסלולים:**
```
routes available: 0
best: null
=> resolveRouteStopsBackbone would return: null
(no exception thrown)
```
`null` נקי, בלי קריסה, גם עם מערך ריק.

**מסקנה:** אין תרחיש שמחזיר שגיאה/קריסה — רק `null` נקי בשני המקרים. `composeRouteStopsWorkout` כבר מטפל ב-`null` הזה (`if (!backbone) return null;`) — זה בדיוק הנקודה שבה נכנס ה-fallback המוצע.

---

## 2. Diff מוצע עם תנאי — עדיין לא נכתב

**הרדיוס המוצע: 800מ' — לא מספר חדש, זה ה-cap שכבר קיים בקוד (`ROUTE_STOPS_MAX_START_M`).** הוא כבר "ניתר" באמצעות ה-`null` שהפונקציה מחזירה כשחורגים ממנו — אין צורך להמציא סף נוסף; רק להשתמש בתוצאה הקיימת כדי להחליט על fallback, במקום להתעלם ממנה.

```diff
--- a/src/features/workout-engine/hybrid/start-hybrid-session.ts
+++ b/src/features/workout-engine/hybrid/start-hybrid-session.ts
@@ composeRouteStopsWorkout()
-  const backbone = await resolveRouteStopsBackbone('generated_loop', {
-    userPosition: ctx.userPosition, parks, targetKm,
-    cityName: ctx.cityName, activity: intent.aerobicKind as ActivityType,
-  });
+  // Try a real published route first (existing_route) — if the nearest one
+  // is within ROUTE_STOPS_MAX_START_M (800m, pre-existing cap), anchor the
+  // hybrid session to it so stops land on a route someone actually signed/
+  // walks regularly. Otherwise fall back to today's behavior unchanged.
+  let backbone = await resolveRouteStopsBackbone('existing_route', {
+    userPosition: ctx.userPosition, parks, targetKm,
+    cityName: ctx.cityName, activity: intent.aerobicKind as ActivityType,
+  });
+  if (!backbone) {
+    backbone = await resolveRouteStopsBackbone('generated_loop', {
+      userPosition: ctx.userPosition, parks, targetKm,
+      cityName: ctx.cityName, activity: intent.aerobicKind as ActivityType,
+    });
+  }
```

**היקף:** קובץ אחד, ~10 שורות (במקום שורה אחת — כי עכשיו יש גם fallback, לא swap עיוור). התנהגות גלובלית: כל עיר עם מסלול מפורסם בתוך 800מ' תקבל אותו כ-backbone; כל עיר בלי — בדיוק כמו היום, לולאה חדשה. **לא נכתב, לא הופעל.**

---

## 3. מיקומי דה-דופ — הוכח בהרצה, לא רק בקריאה

**סקריפט:** `scripts/_verify-dedup-collision-simulation.ts` (קומיט `ce285184`). הוספתי תחנה סינתטית בזיכרון בלבד (לא נשמרה בשום מקום), 50מ' מ"פארק כושר הכרמים", מתויגת בדיוק כמו שהפאנל היה מתייג אותה (`nature_community`/`spring` → `stretch`, rank 0).

**תוצאה:** התחנה הידנית **נופלת בשקט**; הפארק הקיים (strength, rank 2) שורד ללא שינוי. מאשר את מה שנקבע בקריאה — עכשיו מוכח.

**המיקומים המדויקים לתכנון השילוט (שלא יתנגשו):**

| שם | קואורדינטות | מרחק מהמסלול |
|---|---|---|
| פארק כושר הכרמים - שדרות | `31.531937, 34.603380` | 68מ' |
| פארק הבריאות - נאות השקמה | `31.534000, 34.600500` | 168מ' |

**כלל תכנון:** כל תחנה חדשה שתמקם חייבת להיות **מעל 150מ'** משתי הנקודות האלה (ומכל תחנה חדשה אחרת) — אחרת התחנה החדשה היא זו שתיפול, לא הקיימת. שיקול נוסף: אפשר גם לבחור **להשתמש בשתי הנקודות הקיימות עצמן** כ-2 מתוך ה-4-6 תחנות (הן כבר `strength`, מצוידות, ומוכחות שנקלטות) — במקום למקם תחנות חדשות סמוכות אליהן.

---

## 4-5. נרשם, לא בוצע

- **OSM יוצא מההשקה** — לא הרצתי `--apply`, לא נגעתי ב-`AmenitiesQueueMap`. אם תרצה ברזייה/ספסל בעתיד — הזנה ידנית דרך `/admin/locations` בלבד (כבר מתועד ב-`08-...md` §3).
- **צ'קליסט עודכן** — סעיף 0.5 חדש ב-`04-sderot-field-checklist.md`: הזנה 48+ שעות מראש, אימות-מכשיר אחרי מחזור cache, ואימות-שרת נפרד דרך הסקריפט הקיים.
- **ממתין לפורט dev server שלך** לבדיקת `reset()`.
