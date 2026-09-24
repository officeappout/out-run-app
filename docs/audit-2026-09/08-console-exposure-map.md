# 08 — מיפוי חשיפת קונסולה (SPEC-03 Wave D.1)

**נוצר:** 09.09.2026 · **סוג:** מיפוי בלבד — **לא בוצע שום שינוי קוד** במסגרת המסמך הזה, כנדרש.

## שיטה

שלושה סבבי חיפוש מקבילים, ללא חפיפה:
1. **פאנל אדמין** — `src/app/admin/**`, `src/features/admin/**`, `src/features/content/exercises/admin/**`
2. **מעטפת האפליקציה** — `src/app/*.tsx`, `onboarding*`, `gateway`, `map`, `join`, `challenge`, `community`, `search`, `profile`, `authority-portal`, `middleware.ts`, `src/lib/**` (רק קבצי לקוח), `src/components/**`
3. **פיצ'רים ליבתיים** — כל שאר `src/features/**` (workout-engine, activity, arena, social, parks, user, safecity, partners, content הלקוחי, home, profile, favorites, heatmap, וכו')

**סה"כ:** ~2,670+ קריאות `console.*` בקוד צד-לקוח, על פני 440+ קבצים. אין logger עטוף גלובלי בקוד הזה — כמעט כל קריאה היא `console.*` גולמית, ורוב הקבצים (מלבד 2-3 חריגים מתועדים למטה) **לא** ננעלים מאחורי `NODE_ENV`. **המשמעות: כמעט כל ממצא כאן רץ בפרודקשן, לא רק בפיתוח.**

**העיקרון המנחה:** הדפסה בדפדפן לא מדליפה דבר שלא כבר נשלף. ההדפסה היא ההוכחה, לא הבאג — הבאג הוא בשליפה. לכן רוב התיקונים למטה הם "לצמצם מה שנשלף", לא "למחוק את ה-console.log".

---

## קטגוריה 3 — טוקנים / מפתחות / מזהי סשן (החמור ביותר, מפורט לפי מופע)

### `src/lib/auth.service.ts:377-409` — נונס Apple Sign-In גולמי. חומרה גבוהה.
בלוק המסומן במפורש `// ── DEBUG: diagnose raw-vs-hash nonce mismatch` מדפיס את ה-nonce הגולמי של תהליך Apple Sign-In, את ה-SHA-256 שלו, ואת ה-nonce מתוך ה-idToken המפוענח — **ללא שום gate**. ה-remark בקוד עצמו אומר "Remove once Apple Sign-In is confirmed working" — נשכח. **רץ בפרודקשן בכל התחברות Apple ב-iOS.**
**התיקון:** מחיקת הבלוק. זו לא בעיית over-fetch — זו הדפסת debug שנשארה, וצריכה להימחק ולא רק "לצמצם."

### `src/lib/native/init.ts:144` — כתובת deep-link גולמית, כולל טוקנים מוטמעים. חומרה בינונית.
`handleNativeDeepLink` מטפל ב-`outrun://` וב-universal links שיכולים לשאת `inviteCode`, `?ref=<uid>` (uid של משתמש אחר — גם קטגוריה 2), `sessionToken`, או `institutionCode`. בכשל parsing, ה-URL **המלא** מודפס. לא ננעל, רץ בפרודקשן.
**התיקון:** להדפיס רק את צורת ה-path/קוד שגיאה אטום, לא את ה-URL המלא.

### `src/features/admin/services/invitation.service.ts:185,191` + `src/app/admin/authority/team/page.tsx:259` — טוקן הזמנה + קישור מלא. חומרה גבוהה (אדמין, אך הטוקן עצמו מעניק גישת authority_manager/tenant_owner).
מדפיס את ה-`token` הגולמי ואת קישור ההזמנה **המלא כולל הטוקן** בכל יצירת הזמנה. הסיכון העיקרי אינו "האדמין עצמו רואה" אלא כלים חיצוניים (Sentry breadcrumbs, session-replay) שתופסים פלט קונסולה ומחזיקים סוד גישה חי.
**התיקון:** להדפיס רק מזהה מסמך + אימייל, לעולם לא את הטוקן/קישור המלא.

### `src/components/ui/AccessCodeGate.tsx:75` — קוד גישה מוסדי גולמי. חומרה נמוכה (self-disclosure).
מדפיס את הקוד המוסדי שהמשתמש עצמו הקליד, בכשל אימות. פחות חמור כי זו חשיפה-עצמית, אבל עדיין קוד-סוד מודפס גולמי.

### `src/features/user/onboarding/services/access-code.service.ts:39` — אותו דפוס, קוד גישה עצמי. חומרה נמוכה.

**נבדק ונמצא נקי:** לא נמצאה שום הדפסה של Firebase ID token, App Check token, עוגיית סשן אדמין, או `AGENT_API_KEY` בשום מקום בשלושת הסבבים. `requestAccountDeletion.ts` מדפיס רק `token.length` ובוליאני — זה הדפוס הנכון, וצריך לשמש תבנית לתיקון שלושת הממצאים למעלה.

---

## קטגוריה 2 — פרטים מזהים של אנשים אחרים

### `src/features/safecity/hooks/usePresenceLayer.ts:489-495` — הממצא החמור ביותר במסמך הזה. חי, בפרודקשן, פוגע בפולשהו-בטיחותי מתועד.
שאילתת "discover" של `presence` (`where('mode','==','verified_global')` [+ authorityId]) **לא כוללת `where('ageGroup', ...)`**. לשם השוואה, `segregation.service.ts:140-145` — עם הערה מפורשת "CRITICAL SAFETY INVARIANT: Minors NEVER see adults... enforced at the query level" — **כן** מוסיף את הסינון הזה. הפילטור בפועל ב-`usePresenceLayer` נעשה רק בצד לקוח (שורות 503-506), **ומדולג לגמרי כש-`IS_DEV`**. משמעות בפועל: **כל** לקוח מושך uid + שם + מיקום GPS מדויק + `schoolName` + פעילות של **כל הגילאים**, ומסנן מקומית. זו לא רק הדלפת PII — זו סתירה לפולשהו בטיחות מתועד בקוד עצמו.
**התיקון:** הוסף `where('ageGroup','==',myAgeGroup)` לשאילתה עצמה, כמו ב-segregation.service.ts. תלוי שיקול UX (עצירה-מסוג-C? לבדוק אם זה משנה זרימה נראית-למשתמש) — **מומלץ בירור עם דוד לפני מימוש**, לא רק תיקון-שקט, כי זה נוגע בבטיחות קטינים.

### `src/features/safecity/hooks/useSocialLiveMap.ts` (שורות רבות) — אותו דפוס בדיוק, אך **קוד מת** (מאומת: `grep` אפס קריאות ל-`useSocialLiveMap(` מלבד ההגדרה עצמה — הוחלף ב-usePresenceLayer). מתועד להשלמת התמונה, לא פעיל.

### `src/features/partners/components/PartnerOverlay.tsx:600-613` — שמות אמיתיים של שותפים קרובים. לא ננעל, רץ בפרודקשן.
מדפיס `samplePartners` (3 השותפים הראשונים: שם, רמה, סטטוס פעילות) בכל שינוי פילטר. שורה 25 מעליו עושה בדיוק אותו דבר אך **כן** ננעלת מאחורי `NODE_ENV !== 'production'` — עדות לחוסר עקביות בתוך אותו קובץ.

### `src/lib/native/init.ts:144` — גם `ref=<uid>` (ראה קטגוריה 3 למעלה).

---

## קטגוריה 1/4/5/6/7 — over-fetch, מבנה פנימי, לוגיקה עסקית, דגלים, תגובות מלאות (מקובץ לפי חומרה)

### Authority CRM המלא נשלף ללקוחות קצה — 5 נקודות קריאה עצמאיות
`getDoc(doc(db,'authorities',id))` מחזיר את מסמך ה-`Authority` **המלא** — `contacts` (שם/טלפון/אימייל של אנשי קשר עירוניים), `financials`, `activityLog`, `tasks`, `documents` (קישורי Drive לחוזים/חשבוניות) — לכל משתמש-קצה רגיל, רק כדי לקרוא 1-4 שדות (`gatingMode`, `isActiveClient`, `tier`). חמישה מקומות: `arena/hooks/useArenaData.ts:142-146,201-209` (כולל `console.log('[ArenaGating Debug]', {...})` שחושף מצב gating חי — קטגוריה 6), `home/components/SettingsModal.tsx:355,365`, `user/identity/services/affiliation.service.ts:54`, `parks/core/hooks/useUserCityName.ts:128`, `arena/services/ranking.service.ts:1095`. **התיקון האמיתי:** projection דל (name/isActiveClient/gatingMode/logoUrl/coordinates) ל-collection נפרד שמשתמשי-קצה קוראים ממנו — בדיוק הדפוס שכבר יושם ל-`dailyActivityPublic`/`userPublic` היום.

### `src/lib/firestore.service.ts:59-131` (`getUserFromFirestore`) — מסמך המשתמש המלא בכל hydration
זו הבסיס של כל `useUserStore` — כל שדה (core, ציוד, אורח חיים, בריאות, ריצה, progression, onboarding) נשלף בכל session לכל משתמש. נקודת השורש להרבה מדפוס ה-over-fetch של "המשתמש-הנוכחי" שחוזר על עצמו במקומות רבים למטה.

### קריאות מסמך-משתמש-מלא חוזרות, רק בשביל 1-4 שדות ניתוב
`src/app/page.tsx:378,518`, `src/app/gateway/page.tsx:122`, `src/app/onboarding-new/health/page.tsx:119` — כל אחד קורא `getDoc(doc(db,'users',uid))` המלא רק כדי לבדוק `onboardingStatus`/`onboardingStep`/`assignedResults`. אותו אנטי-דפוס מיושם מחדש 4 פעמים, בנקודות התדירות הגבוהות ביותר באפליקציה (כל פתיחה קרה).

### פאנל אדמין — קריאות אוסף-`users` שלם, ללא סינון
`src/features/admin/services/admin-management.service.ts:48,90,371` (`getAllSuperAdmins`/`getPendingUsers`/`getAllAdmins`) — `getDocs(collection(db,USERS_COLLECTION))` **ללא שום where** — מושך את **כל** בסיס המשתמשים (מסמך מלא לכל תושב/משתמש-קצה) רק כדי לסנן ~5-10 חשבונות אדמין בצד לקוח. `getUserByEmail` **באותו קובץ** כן משתמש ב-`where('core.email','==',email)` — מוכיח שהדפוס הנכון היה ידוע ופשוט לא יושם בשלוש הפונקציות האחרות. `src/features/admin/services/users.service.ts:152-154` (`getAllUsers`) — אותו דבר, **בלי אפילו `limit()`**. `src/app/admin/users/page.tsx:85` — יש `limit(1000)` אך עדיין מסמכים מלאים.

### `src/features/workout-engine/core/services/running-admin.service.ts:79-89` (`getRunWorkoutTemplates`)
`getDocs(collection(db,WORKOUT_TEMPLATES_COLLECTION))` ללא סינון, כדי לבנות תוכנית ריצה **אחת**. מוכח ע"י `console.log`-ים סמוכים ב-`onboarding-sync.service.ts:1750-1763` ("Template census", "Categories in DB").

### `src/features/content/exercises/core/exercise.service.ts:102-110` (`getAllExercisesNoOrder`)
אוסף התרגילים **המלא** נשלף לכל לקוח, כולל תוכן persona-gated (`location:'service'`, צבאי-בלבד) — השער היחיד הוא בדיקת `isMilitaryPersona` **בצד לקוח**, כלומר התוכן כבר בדפדפן של כל משתמש לפני הבדיקה. קטגוריה 1+4+6.

### `src/features/workout-engine/core/services/storage.service.ts:672-712` (`getWorkoutHistory`)
עד 50 מסמכי אימון מלאים (כולל `routePath` GPS מלא) נשלפים כדי להזין טאב-סיכום שמציג רק ספירה + רשימה קצרה.

### מנוע ה-onboarding assessment — לוגיקה עסקית רצה בצד לקוח
`onboarding-new/dynamic/page.tsx:121,463`, `assessment-visual/page.tsx:284-288,783-789` — מדפיסים את הפלט המלא של אלגוריתם השיוך לתוכנית/רמה. לא ננעל. הסיבה השורשית: **החישוב עצמו** רץ בצד לקוח, לא רק ה-הדפסה — לכן הלקוח מחזיק (וממילא יכול להדפיס) הרבה יותר מלוגיקת הניקוד ממה שהמסך צריך.

### `src/features/user/progression/services/progression.service.ts` — החשיפה הגדולה ביותר של לוגיקה עסקית
~90 קריאות console ללא gate בקובץ בן 2,600+ שורות — כולל הדפסת מסמכי Firestore גולמיים (`console.log('[Progression] Rule loaded:', resolved, '(raw Firestore:', data, ')')`) וכל אלגוריתם ה-XP/רמות. דפוס דומה, קטן יותר, ב-`workout-selection.utils.ts:1004-1014` ו-`InputSanitizerMiddleware.ts`.

### `src/app/map/MapShell.tsx` (9 קריאות) ו-`DiscoverLayer.tsx` (5 קריאות) — הדפסות debug זמניות ששכחו למחוק
מסומנות במפורש בהערות כמו `// DEBUG — remove after routing confirmed` ו-`// TEMPORARY diagnostic` — אף אחת לא ננעלת מאחורי `NODE_ENV`. חושפות מבנה state-machine פנימי (קטגוריה 4), לא PII.

### `src/features/profile/components/DashboardTab.tsx:51-60` — עץ progression מלא, ללא gate
`console.group` שמדפיס `JSON.stringify` מלא של `activePrograms`/`tracks`/`domains` בכל mount, כשה-Dashboard מציג רק XP/רמה/streak.

**נבדק ונמצא נקי (gate תקין, לדוגמה לחיקוי):** `src/lib/gen-perf.ts`, `src/lib/native/push.ts:309,525`, `src/lib/healthBridge/init.ts:383` — כולם ננעלים כראוי מאחורי `NODE_ENV`/דגל explicit, dev-only.

---

## עשרת המועמדים המובילים — היכן השליפה עצמה מוגזמת (משולב, משלושת הסבבים, מדורג)

| # | שאילתה (file:line) | למה זה חמור |
|---|---|---|
| 1 | `usePresenceLayer.ts:489-495` — חסר `where('ageGroup',...)` | **בטיחותי** — סותר פולשהו קטינים-לא-רואים-מבוגרים מתועד באותה בסיס קוד; GPS מדויק + שם + בית-ספר לכל הגילאים נשלף ומסונן רק בצד לקוח |
| 2 | `authorities/{id}` — 5 נקודות קריאה (`useArenaData.ts` ועוד 4) | מסמך CRM מלא (אנשי קשר, כספים, חוזים) ללקוחות-קצה רגילים, רק בשביל 1-4 שדות gating |
| 3 | `firestore.service.ts:59-131` (`getUserFromFirestore`) | הבסיס של כל `useUserStore` — מסמך משתמש מלא (60+ שדות) בכל hydration, נקודת התדירות הגבוהה ביותר באפליקציה |
| 4 | `page.tsx`/`gateway/page.tsx`/`onboarding-new/health/page.tsx` — 4 קריאות `users/{uid}` מלאות | רק לניתוב onboarding (1-4 שדות), על כל פתיחה קרה |
| 5 | `admin-management.service.ts:48,90,371` — 3 קריאות אוסף-`users` שלם ללא סינון | כל בסיס המשתמשים (כולל בריאות/onboarding) נשלף כדי לסנן ~5-10 אדמינים; `getUserByEmail` **באותו קובץ** מוכיח שהפתרון הנכון כבר קיים |
| 6 | `users.service.ts:152-154` (`getAllUsers`) | אותו דבר, בלי אפילו `limit()` |
| 7 | `running-admin.service.ts:80-81` (`getRunWorkoutTemplates`) | אוסף תבניות שלם כדי לבנות תוכנית ריצה אחת |
| 8 | `exercise.service.ts:104` (`getAllExercisesNoOrder`) | קורפוס תרגילים שלם, כולל תוכן persona-gated שהשער שלו הוא client-side בלבד |
| 9 | `storage.service.ts:672-679` (`getWorkoutHistory`) | עד 50 מסמכי אימון מלאים (כולל GPS `routePath`) בשביל טאב-סיכום |
| 10 | `admin/users/page.tsx:85` — `limit(1000)` אך מסמכים מלאים | טוב יותר מ-5/6 (יש limit), אך עדיין ללא projection |

**הערה מתודולוגית:** ל-Firestore Client SDK אין field-projection אמיתי ברמת השאילתה — הפתרון החוזר בכל הממצאים למעלה הוא collection-ציבורי-רזה נפרד (בדיוק הדפוס שיושם היום ב-`dailyActivityPublic`/`userPublic`), לא "לבחור שדות" בשאילתה עצמה.

---

## מה לא נגעתי בו

לפי הנחיית הספק: **אף קובץ קוד לא שונה** במסגרת המסמך הזה. כל הממצאים למעלה ממתינים להחלטת דוד על סדר עדיפויות לספק תיקון נפרד — למעט הממצא #1 בטבלה (usePresenceLayer age-gap), שמומלץ לטפל בו כעדיפות ראשונה בכל ספק המשך, בהתחשב באופי הבטיחותי.
