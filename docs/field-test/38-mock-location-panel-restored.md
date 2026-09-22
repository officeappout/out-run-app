# 38 — MockLocationPanel: הוחזר, super-admin בלבד

**תאריך:** 22.09.2026
**ענף:** `fix/mock-location-panel-restore` (worktree `city-override-investigation`)
**סטטוס:** ממתין לאישור דוד (diff) — **טרם merge**
**מקושר:** [[37-mock-location-panel-investigation]] (החקירה שהובילה ל-PR הזה)

---

## מה בוצע

6 קבצים משונים + 2 חדשים. הכלי (🧪 כפתור מתחתית-שמאל + חדש: באנר עליון קבוע) חי מחדש,
**רק** ל-`profile.core.isSuperAdmin === true`.

| קובץ | שינוי |
|---|---|
| `features/dev/services/mock-location-storage.ts` (חדש) | קריאה/כתיבה/מחיקה ל-localStorage + מראה ל-@capacitor/preferences (אותה טכניקה בדיוק כמו `onboardingPrefs.ts`, קובץ נפרד כי ה-scope שם מוצהר ל-onboarding/gateway בלבד) |
| `features/dev/components/MockLocationBanner.tsx` (חדש) | באנר עליון קבוע, z-[120] ("Dev-only banners" — ערך קיים בטבלת ה-budget, לא נוסף חדש) |
| `useDevSimulation.ts` | טוען מצב שמור ב-mount (sync + async fallback ל-Preferences), שומר ב-3 נקודות פעולה מפורשות (לא ב-effect כללי — ראו הסבר בסעיף 2) |
| `MockLocationPanel.tsx` | הסרת בדיקת `NODE_ENV`; הוספת שדות lat/lng ידניים; חסימת "הפעל" + הודעה כש-`isWorkoutActive` |
| `MapShell.tsx` | `isSuperAdmin` מחושב, `devSim`/`profile` הועלו מעל `useMapLogic` כדי להזין guard; import דינמי + רינדור מותנה לבאנר+פאנל; guard לפני התחלת אימון |
| `useMapLogic.ts` / `useWorkoutSession.ts` | פרמטר אופציונלי חדש `beforeStartWorkout` — נקודת-חנק יחידה ל-8+ מקומות הקריאה ל-`startActiveWorkout` |
| `DiscoverLayer.tsx` | הוסר import + שורת הרינדור הישנה של הפאנל (עברה ל-`MapShell.tsx`) |

---

## הוכחה לכל דרישה

### 1. גישה — super-admin בלבד, לא מרונדר לרגיל
`MapShell.tsx`: `const isSuperAdmin = profile?.core?.isSuperAdmin === true;` — **אותו שדה בדיוק**
ש-`DiscoverLayer.tsx:683` כבר בודק. הרינדור: `{isSuperAdmin && (<><MockLocationBanner/><MockLocationPanel/></>)}`
— למשתמש רגיל `isSuperAdmin===false` תמיד, כך שה-JSX הזה מעולם לא מתבצע. הגנה כפולה: הרכיב
עצמו (`MockLocationPanel`) גם בודק `isSuperAdmin` פנימית (defense-in-depth, למקרה של import
ישיר עתידי שלא דרך MapShell).

### 2. נשמר בין רענונים, כולל סגירת אפליקציה
`mock-location-storage.ts` — אותה טכניקה בדיוק כמו `onboardingPrefs.ts` (sync ל-localStorage +
מראה אסינכרונית ל-`@capacitor/preferences`/NSUserDefaults, ששורדת hard-close ב-iOS כש-WKWebView
מוחק localStorage). 8 טסטים חדשים (`mock-location-storage.test.ts`) — round-trip מלא (עיר,
lat/lng ידני, מצב כבוי, מחיקה, ערך פגום נדחה בלי לזרוק, ואין `window` = לא נכשל).

**נקודה חשובה שגיליתי ותיקנתי תוך כדי:** לא שמרתי דרך `useEffect` כללי שצופה ב-`mockLocation` —
כי לולאת ה"הליכה על מסלול" הקיימת (`startSimulation`) מעדכנת את `mockLocation` כל 100ms
דרך setter פנימי (עוקף את ה-API הציבורי). effect כזה היה כותב ל-localStorage (ולNative
Preferences!) 10 פעמים בשנייה במהלך סימולציית הליכה — בזבזני ומיותר. פתרתי בקריאה מפורשת
ל-`saveMockLocationState`/`clearMockLocationState` רק משלוש נקודות הפעולה המכוונות
(`toggleMock`, `setMockLocation`, `setCityPreset`) — לא מה-tick הפנימי.

### 3. פאנל: רשימת ערים + lat/lng ידני
נוספו 2 שדות מספריים + כפתור "הגדר קואורדינטות" בתוך `MockLocationPanelInner`, קוראים ל-
`devSim.setMockLocation({lat,lng})` — **אותה פונקציה בדיוק** שה-long-press על המפה כבר משתמש
בה (`MapShell.tsx`). ולידציה בסיסית (טווח lat/lng חוקי) לפני הפעלה.

### 4. חיווי — באנר עליון קבוע
`MockLocationBanner.tsx` — `fixed top-0 inset-x-0`, "🧪 מצב בדיקה: מיקום מדומה — <שם עיר או
lat,lng>" + כפתור "כבה". מרונדר ב-`MapShell.tsx` ברמה גלובלית — **לא** בתוך `DiscoverLayer`
כמו הפאנל המקורי — כך שהוא ממשיך להיות מוצג בכל מצב (`mode`), כולל 'active'/'free_run', לכל
אורך אימון.

### 5. בטיחות אימון — שני הכיוונים
- **חוסם הדלקה:** `MockLocationPanel` מקבל `isWorkoutActive` מ-`logic.isWorkoutActive`; כפתור
  "הפעל", ה-select, ושדות lat/lng — כולם `disabled` כש-`isWorkoutActive===true`, עם הודעה
  אדומה "אי אפשר להדליק מיקום מדומה בזמן אימון". כיבוי (כפתור "כבה") **תמיד** נשאר זמין.
- **אזהרה לפני התחלת אימון עם מדומה כבר פעיל:** `startActiveWorkout` יש לו **8+ נקודות קריאה**
  שונות (DiscoverLayer×8, FreeRunLayer, BuilderLayer, PlannedPreviewLayer, NavigateLayer,
  MapShell) — במקום לתקן כל אחת בנפרד (סיכון גבוה, diff גדול), הוספתי פרמטר אופציונלי יחיד
  `beforeStartWorkout` שעובר דרך `useMapLogic`→`useWorkoutSession`'s `startActiveWorkout`
  עצמו — **נקודת חנק אחת** שמכסה את כל ה-8+ נתיבים בבת אחת. `MapShell.tsx` מגדיר אותו
  (`confirmStartWithMockLocation`) — `window.confirm` עם שם העיר/קואורדינטות, ומבטל את
  ההתחלה אם המשתמש לוחץ ביטול. **אופציונלי** — כל קריאה קיימת שלא מעבירה את הפרמטר (אין
  כאלה מלבד MapShell עצמו) ממשיכה לעבוד זהה לגמרי.

### 6. אפס שינוי למשתמש רגיל — הוכחה
- `isSuperAdmin===false` (כל משתמש רגיל): ה-JSX המרונדר אף פעם לא מגיע ל-`<MockLocationPanel/>`
  → קריאת ה-`import()` הדינמית (`next/dynamic`) **אף פעם לא נורית** → ה-chunk של הרכיבים
  אף פעם לא מבוקש ברשת — לא רק "לא מרונדר", גם לא נטען בפועל.
  `confirmStartWithMockLocation` תמיד מחזיר `true` מיידית בלי `window.confirm`
  (`devSim.isMockEnabled` תמיד `false` למי שלא יכול להדליק אותו) — התחלת אימון זהה ביט-לביט.
  `devSim` עצמו עדיין נקרא (כמו היום) לכל משתמש — אבל `loadMockLocationState()` תמיד מחזיר
  `null` (אין להם מה ששמור תחת המפתח), אז ההתנהגות זהה למה שהיה: `isMockEnabled=false` תמיד.

**⚠️ מגבלת הוכחה:** רכיבי React (`.tsx`) לא ניתנים לטסט אוטומטי בסביבת ה-vitest של הריפו
(node-only, בלי jsdom — מגבלה קיימת, לא שלי). הרגרסיה+ה-8 טסטים החדשים מכסים את הלוגיקה
הטהורה (persistence) בלבד. **זרימת ה-UI בפועל (באנר, פאנל, חסימה, אזהרה) לא נבדקה
אוטומטית — נדרשת בדיקתך במכשיר**, בדיוק כפי שביקשת.

---

## רגרסיה

`npx vitest run`: 2194 עברו, 26 דולגו, כשל 1 בלבד + suite אחד (שניהם ידועים מראש, לא קשורים).
`tsc --noEmit`: 802 שורות — זהה לבייסליין הנקי (אימתתי דרך stash), אין שגיאה חדשה.

---

## החלטה

ממתין לאישור דוד על ה-diff. לאחר אישור: merge, המתנה ל-Vercel Ready, SHA + revert, עצירה —
דוד בודק מיד עם שדרות.
