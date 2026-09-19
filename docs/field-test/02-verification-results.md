# שלב 2 — אימות בהרצה (RUN-BASED VERIFICATION)

**מאומת מול:** `origin/main` @ `dc6532ed`. כל מספר בעמוד הזה הוא פלט אמיתי של קוד שהורץ — לא קריאה. סקריפטי ההוכחה נשמרו בריפו (ראו הפניות) לשחזור.

**סדר לפי הנחיית דוד (19.09.2026):** (1) P0 — סיכון NaN בנתיב מסלול מודרך/קבוצתי, (2) אימות תיוג שגוי בהרצה, (3) ספירות שדרות. סעיף 4 (watchdog/סוללה/resume) — **לא נחקר בכוונה**, עובר כ-`[לא אומת]` לצ'קליסט השטח (שלב 4).

---

## 1. P0 — סיכון ה-NaN במסלול מודרך/קבוצתי: מוכח, וחמור מהמשוער

**סקריפט:** `scripts/_verify-freerunlayer-geometry-nan.ts` (`npx tsx scripts/_verify-freerunlayer-geometry-nan.ts`)

**המסקנה מתעדכנת לעומת שלב 1: זו לא "NaN שקט" — זו קריסה (`TypeError`) שמתרחשת בפועל.**

`FreeRunLayer.tsx:102-133` שולף `official_routes/{id}` וכותב `path` ל-state בלי לעבור דרך `normalizeStoredRoutePath`. הרצתי את אותה גיאומטריה בדיוק כפי שהיא מאוחסנת ב-Firestore (מערך אובייקטי `{lng,lat}`, 5 נקודות הלוך-חזור) דרך שתי הפונקציות האמיתיות שצורכות את ה-`path` הזה בפועל:

| קריאה אמיתית | קלט פגום (בלי נרמול) | פלט בפועל |
|---|---|---|
| `isOutAndBackPath(buggyPath)` — הצעד הראשון שמבצע `buildLaneOffsetPath` | מערך `{lng,lat}` | **`TypeError: object is not iterable`** — נזרק בפועל |
| `buildLaneOffsetPath(buggyPath, 3)` | אותו קלט | **אותה חריגה, נזרקת** |
| `crossTrackDistanceMeters(pos, buggyPath)` (זיהוי סטייה מהמסלול) | אותו קלט | `Infinity` — **לא קורס**, רק "תמיד מחוץ למסלול" בשקט |

**מסלול תגובה מלא, מאומת עד הסוף (לא רק תיאורטי):** `FreeRunLayer.tsx:259-260` מעביר את ה-`groupRoute` הפגום ישירות ל-`AppMap`'s `routes={[groupRoute]}` **וגם** `focusedRoute={groupRoute}`. שני אלה מפעילים את `buildLaneOffsetPath` בלי try/catch, בתוך `useMemo` בזמן רינדור:
- `AppMap.tsx:1234` (`routesGeoJSON` — מצייר כל מסלול גלוי)
- `AppMap.tsx:1262` (`routeDirectionArrowsGeoJSON` — חצי כיוון על המסלול הממוקד)

**מתי זה נשבר בפועל:** `isOutAndBackPath` בודק קודם `path.length % 2 === 0 → false` (יציאה בטוחה, בלי לגעת בתוכן) — אבל לכל `path` באורך **אי-זוגי** (שכיח מאוד במסלולי הלוך-חזור, ראו הערת התיעוד בקוד: "2n-1 is always odd"), הפונקציה ממשיכה ל-destructuring `const [lngA, latA] = path[i]` — וזה מה שקורס על אובייקט. **זה לא מוגבל למסלולי הלוך-חזור בלבד** — כל מסמך `official_routes` עם מספר-נקודות אי-זוגי שמגיע דרך הנתיב הזה (מפגש קבוצתי/מודרך) יקרוס באותה נקודה, בלי קשר לצורתו האמיתית.

**בקרה (מה אמור לקרות):** אותו קלט בדיוק, אחרי `normalizeStoredRoutePath` — אין NaN, אין קריסה, `crossTrackDistanceMeters` מחזיר `14.44` מטר תקין.

**ממצא משני מהריצה (לא בתיעוד שלב 1):** בדקתי גם וריאנטים פגומים נוספים דרך `normalizeStoredRoutePath` (הנקודה הנכונה): נקודות חסרות/`null`/`undefined` מטופלות נכון (מושמטות בשקט, לא קורסות). **אבל** `lat`/`lng` עם שמות-מפתח **הפוכים** (למשל `{lng: 31.5, lat: 34.6}` כש-הכוונה הייתה הפוך) **עובר בשקט כתקין** — הבדיקה היחידה היא finite-number, לא טווח סביר. זה לא הבאג שנבדק כאן, אבל שווה תיעוד כפער נפרד (לא P0, לא נבדק היקף/שכיחות).

**מסקנה לצ'קליסט השטח:** אם הדגמה בשדרות כוללת **סשן קבוצתי/מודרך** (לא free-run עצמאי) על מסלול הלוך-חזור אמיתי — יש סיכון אמיתי למסך מפה שקורס. יש לבדוק בשלב 2 (אם אפשרי) או להימנע ממסלולי הלוך-חזור בדמו הקבוצתי עד שהתיקון ייכנס.

---

## 2. אימות תיוג שגוי בהרצה — מוכח, לא רק נקרא

**סקריפט:** `src/features/workout-engine/services/__tests__/_verify-walking-mislabel-bugs.test.ts` (`npx vitest run <path> --reporter=verbose`) — **4/4 טסטים עברו**, מה שמוכיח שהקוד המקורי מתנהג בדיוק כפי שנטען.

**שיטה:** לא reimplementation — הרצתי את הקוד האמיתי, הבלתי-משתנה (`syncWorkoutCompletion` → `useProgressionStore.markTodayAsCompleted`), עם mock רק לגבול ה-I/O האמיתי (Firestore SDK, Firebase auth). כל שאר השרשרת היא קוד production חי.

**פלט אמיתי, הליכה שהושלמה (בדיוק מה ש-`useRunningPlayer.ts:1846-1854` שולח היום):**
```json
{
  "userId": "verify-walk-uid",
  "date": "2026-09-19",
  "workoutCompleted": true,
  "workoutType": "running",
  "displayIcon": "run-fast",
  "isRecovery": false,
  "updatedAt": "SERVER_TIMESTAMP"
}
```

**בקרה — אותו קוד בדיוק, עם קלט נכון (`workoutType:'walking'`):**
```json
{
  "userId": "verify-walk-uid",
  "date": "2026-09-19",
  "workoutCompleted": true,
  "workoutType": "walking",
  "displayIcon": "walk",
  "isRecovery": false,
  "updatedAt": "SERVER_TIMESTAMP"
}
```

זה סוגר את השאלה: הבאג מבודד לחלוטין לנקודת המקור (`useRunningPlayer.ts:1848,1852`) — הצינור כולו (`completion-sync.service.ts` → `useProgressionStore.markTodayAsCompleted` → `getWorkoutIcon`) מתפקד נכון **כשמקבל את הערך הנכון**. אין תיקון מוסתר וגם אין באג נוסף שמסתתר בהמשך השרשרת.

**ממצא נוסף מהריצה, לא בתיעוד שלב 1:** אותה קריאה הפעילה גם את `useWeeklyVolumeStore.recordRunningSession(1.8, 22)` — כי `completion-sync.service.ts:104` בודק `payload.workoutType === 'running'`, וזה `true` גם כשמדובר בהליכה. כלומר **מרחק/משך של הליכה נכנס בפועל למעקב הנפח השבועי של ריצה**, לא רק לאייקון קוסמטי. הבקרה (עם `'walking'`) אימתה ש-`recordRunningSession` **לא** נקרא כשהתיוג נכון.

**בדיקת עובדה מכנית משלימה (לא הסתמכות על קריאה עיניים בלבד):** שני הטסטים הראשונים בקובץ קוראים את הקבצים בפועל מהדיסק (`fs.readFileSync`) ומאמתים אוטומטית שהשורות המצוטטות ב-`01-walking-flow-map.md` אכן אומרות מה שנטען, ושאין בהן שום אזכור של `activityType`/`sessionActivityType` — מה שהופך את "זה ליטרל קבוע" מהצהרה שלי לעובדה נבדקת בקוד.

---

## 3. ספירות שדרות — Firestore, קריאה בלבד

**סקריפט:** `scripts/_verify-sderot-walking-route-counts.ts` (`npx tsx scripts/_verify-sderot-walking-route-counts.ts`)

**זהירות שם-רשות (לקח מ-audit קודם על קריית אונו):** נמצאו 2 מסמכי authority עם ההתאמה "שדרות" — `שדרות` (הרשות האמיתית) ו-`שכונת שדרות בפארק` (מילה כללית בעברית, "שדרות" = בולווארים, לא קשור לעיר). **אימתתי בנפרד** (שאילתה ישירה לפי `authorityId`) שכל 27 המסמכים שנספרו שייכים ל-`שדרות` האמיתית (`CdiRk1QP5UrUGSbGjCkU`) ו-**אפס** למועמד השני — כדי לא לחזור על טעות ההתאמה-לפי-שם.

| | official_routes | curated_routes |
|---|---|---|
| סה"כ במאגר (כלל-ארצי) | 192 | 18 |
| **בשדרות** | **27** | **0** |
| מתויג `type`/`activityTypes` כולל `'walking'` | **1** | — |
| מתויג `'running'` (בלי walking) | 26 | — |
| גיאומטריה חסרה | 0 | — |
| גיאומטריה קצרה (<2 נק') | 0 | — |
| שדה חובה חסר (מכל 12 השדות בסכימה) | 0 | — |

**ממצא שדורש תשומת לב שלך, דוד — לא באג קוד, פער תוכן:** מתוך 27 מסלולים בשדרות, **רק 1** מתויג `walking`. `curated_routes` (מסלולים "מוגשים" ידנית לעומת גילוי OSM) — **אפס** בשדרות בכלל. שווה לוודא לפני הטסט: האם הדמו מתבסס על המסלול המתויג-הליכה הבודד הזה, על מסלולים שנוצרים "תוך כדי" (Mapbox, לא מהמאגר), או שצריך לתייג/להוסיף עוד מסלולי הליכה לשדרות מראש. (הערה: תיוג `type` קובע איך המסלול *נוצר*, לא בהכרח מונע ממשתמש "ללכת" על מסלול שמתויג `running` — לא נבדק אם מסך הפעלת-מסלול מסנן ספציפית לפי `type`.)

מבחינת תקינות דאטה: **0 בעיות** — כל 27 המסמכים תקינים מבחינת גיאומטריה ושדות חובה. זה לא צפוי לגרום לתקלה בשטח.

---

## 4. לא נחקר בכוונה (לפי הנחיית דוד) — עובר ל-`[לא אומת]` בצ'קליסט השטח

Watchdog לאובדן GPS, מודעות-סוללה, resume-אחרי-קריסה — נשארים כפי שתועדו בשלב 1 (קריאת קוד בלבד, לא הורצו). לא הושקע בהם זמן ריצה בשלב הזה.

---

## סיכום קבצים

- `scripts/_verify-freerunlayer-geometry-nan.ts` — הרץ, פלט תועד למעלה
- `src/features/workout-engine/services/__tests__/_verify-walking-mislabel-bugs.test.ts` — 4/4 עברו
- `scripts/_verify-sderot-walking-route-counts.ts` — הרץ, קריאה בלבד, ספירות בלבד (אין שמות/UID אמיתיים בפלט)

כל שלושת הסקריפטים סומנו `_verify-*` (מוסכמת קבצי אבחון חד-פעמיים בריפו) ונשמרים ל-reproducibility, לא כטסט רגרסיה קבוע — להחלטתך אם לקדם אחד מהם לסוויטה הרגילה אחרי שהתיקון ייכנס.
