# מיפוי מערכת הרצפים (Streaks) + תוכנית למדידת התנהגות משתמש

> נוצר: 01.10.2026 | worktree ייעודי (`streak-system-mapping`), ענף טרי מ-`origin/main`.
> READ-ONLY — מיפוי + תוכנית בלבד, אין קוד שנכתב.
> ממשיך את [[retention-conversion-metrics-audit]] (26.08.2026) — שם זוהה שהרצף קיים במוצר אבל לא נמדד; המסמך הזה עונה "איך זה עובד בפועל, בכל מקום שהוא נוגע".
> כל טענת-קוד הופקה ע"י 2 סוכני Explore מקבילים + אימות ידני נוסף (ראה §9). כל ציטוט הוא file:line אמיתי.

---

## תקציר מנהלים

1. **"רצף" היום = ימי קלנדר רצופים, ללא חסד, ללא הבחנה בין סוגי אימון, timezone לפי המכשיר** (§1). אין "יום מנוחה" שמגן על הרצף, למרות שהטיפוס `'rest'` מוגדר ב-types ואף פעם לא בשימוש.
2. **יש באג דיוק מאומת בפרודקשן: 47% מבעלי רצף נבדקו בלי אימון תואם בהיסטוריה האמיתית** (§2) — צוות אחר כבר דחה את השדה הזה כמקור אמון למסך אחר. כל תכנון חדש על בסיס הרצף הקיים צריך להביא בחשבון שהמספר עצמו לא אמין ב-100%.
3. **הרצף הוא הרבה יותר ממה שנראה על המסך** — הוא מכפיל XP אמיתי בכל אימון (עד 1.30×, §5), הוא *מדד הדירוג של לשונית ברירת-המחדל* בליגת הקהילה (§6), והוא פותח הישגים עם XP אמיתי (§7). שלושת אלה **לא מתועדים** ב-Truth file של ה-XP.
4. **אין שום push שמופעל ע"י אירוע-רצף** (לא "אתה עומד לאבד רצף", לא "שברת רצף", לא "הגעת לאבן דרך") — יש רק משתנה טקסט (`@רצף`) שאפשר להטמיע בפוש-אחר (יעד יומי), וערוץ בשם "progression" שמתאר את עצמו ככולל "streak" אבל בפועל מופעל רק מ-level-up (§8).
5. **בפאנל הניהול יש תא יחיד, read-only, למשתמש בודד** — אין דשבורד, אין טרנד, אין פילוח. הרצף נשלף ישירות מ-`users/{uid}`, לא דרך אנליטיקס (§10).
6. **אין שום כלי behavioral-analytics חיצוני מחובר היום.** Firebase Analytics (GA4) מאותחל בקוד אבל אף `logEvent` אמיתי שלו לא נקרא בשום מקום — כל האנליטיקס בפועל זורם ל-collection פרטי (`analytics_events`). יש תשתית הסכמה (GDPR) מוכנה שכל כלי חדש יצטרך להתחבר אליה (§11).

---

## חלק א — מצב קיים: רצף (Streak)

### §1. מה בדיוק נחשב רצף היום

מקור: `useActivityStore` (`src/features/activity/store/useActivityStore.ts`), בפרט `logWorkout`/`logMultiCategoryWorkout` (שורות 497–667) ו-`loadFromServer` (שורות 898–1017).

| שאלה | תשובה מהקוד | file:line |
|---|---|---|
| קלנדר או חלון מתגלגל? | **קלנדר** — תאריכי `YYYY-MM-DD` מחושבים לפי `toLocalDayString()`, אין חלון 24/48 שעות | `useActivityStore.ts:251-260` |
| כמה ימי חסד מותרים? | **אפס.** `daysDiff > 1 → reset ל-1`. פספוס יום קלנדרי שלם אחד שובר מיידית | `useActivityStore.ts:548-562` |
| אילו סוגי אימון נספרים? | **כולם יחד** — strength + cardio + maintenance, סכום דקות משולב | `useActivityStore.ts:530-540` |
| סף מינימלי | `STREAK_MINIMUM_MINUTES = 10` דקות (סכום כל הקטגוריות ביום) | `activity.types.ts:298` |
| אימון recovery נספר? | **כן** — לא מוחרג מהרצף (רק XP של strength מדולג ל-recovery, לא הרצף עצמו) | `useXpAward.ts:114-123` |
| "יום מנוחה" שומר על הרצף? | **לא קיים בפועל.** הטיפוס `'rest'` מוגדר ב-`ActivityType` אבל `determineActivityType()` אף פעם לא מחזיר אותו | `activity.types.ts:27`, `ActivityPriorityService.ts:243` |
| אזור זמן | **לפי המכשיר** (local getters של `Date`), לא UTC ולא קבוע-ישראל | `useActivityStore.ts:251-260` |

**חוסר-עקביות שנמצא:** הצד השרתי היחיד שקורא את הרצף (`stepGoalNudgeScheduler.ts:142-154`) מחשב "היום" לפי `Asia/Jerusalem` קשיח — יכול לא להסכים עם גבול-היום-לפי-מכשיר למשתמש שאינו בישראל, או ממש סביב חצות.

### §2. ⚠️ באג דיוק נתונים מאומת בפרודקשן

סקריפט אודיט קיים (`scripts/_audit-streak-lastactivity-accuracy.ts`) בדק 146 מסמכי `streaks/{uid}` אמיתיים מול היסטוריית `workouts` האמיתית, ומצא:
- **47% מבעלי רצף — אפס מסמכי workouts תואמים בהיסטוריה.**
- **4 מקרים** שבהם `lastActivityDate` מקדים את תאריך האימון האמיתי האחרון ב-2 עד 45 ימים.

תיעוד: `src/app/api/units/roster-workout-summary/route.ts:14-24`. בעקבות זה, צוות אחר (מסך roster של יחידות) **דחה במפורש** את `streaks/{uid}.lastActivityDate` כמקור ל"פעילות אחרונה" ובנה אגרגציה נפרדת ועצמאית (`admin/authority/units/[unitId]/page.tsx:1190-1196`).

**המשמעות לתכנון:** כל מדד חדש (שלב-משפך, פאנל ניהול, פוש) שנשען על `currentStreak`/`streaks/{uid}` יורש את חוסר-האמינות הזה, עד שמישהו יחקור למה 47% מהמקרים התנתקו מההיסטוריה האמיתית (חשוד מיידי: כתיבה כפולה ל-2 מיקומים ללא טרנזקציה, ראה §3).

### §3. איפה זה מחושב ונשמר

שני מיקומי Firestore, נכתבים יחד (לא בטרנזקציה):

1. **`streaks/{uid}`** (collection עצמאית) — `currentStreak`, `longestStreak`, `lastActivityDate` + חותמות scope. נכתב ע"י `useActivityStore.syncToServer()` (`useActivityStore.ts:862-870`). קריאה פתוחה לכל משתמש מחובר (ללוחות מובילים), כתיבה owner-only/admin (`firestore.rules:728-731`).
2. **`users/{uid}.progression.currentStreak`** — מראה (mirror) של אותו ערך, נכתב מיד אחרי, **best-effort** — אם הכתיבה נכשלת זה רק מתועד כ-"non-critical" (`useActivityStore.ts:880-888`). **זה בדיוק המנגנון שיכול להסביר את ה-47% מ-§2** — אין ערובה ששני המיקומים תמיד מסונכרנים.

מצב Zustand לפני כתיבה: `currentStreak`/`longestStreak`/`lastStreakDate`, persisted ל-`localStorage` (`useActivityStore.ts:127-132,1190-1200`). הנתון הגולמי שממנו נגזר הרצף: `dailyActivity/{uid}_{date}` (דקות לפי קטגוריה).

**⚠️ מסלול כתיבה שני, מת, אל תתבלבלו:** `smart-goals.service.ts`'s `recordDailyActivity()`/`initializeGoals()` גם כותבים ל-`progression.currentStreak`, אבל לפי כלל שונה לגמרי (baseline צעדים/קומות). מתועד כמת במפורש בקוד עצמו (`src/app/home/page.tsx:889-900` — "confirmed dead, deliberately left alone"). **שום Cloud Function לא כותב רצף** — החישוב כולו client-side.

### §4. איך זה מתבטא למשתמש — כל המקומות

| מיקום | file:line | מה מוצג |
|---|---|---|
| `DopamineStreakBlock` (מסך סיכום אימון) | `workout-engine/summary/components/shared/DopamineStreakBlock.tsx:6-10` | קומפוננטה טהורה — מקבלת `streakDays: number` כ-prop, אין לה חישוב/state/Firestore משלה |
| מסך סיכום ראשי | `WorkoutSummaryPage.tsx:33` | קורא מ-`useProgressionStore().currentStreak` (**לא** ישירות מ-`useActivityStore`) |
| ריצה חופשית | `FreeRunSummary.tsx:71,436-437` | מוצג רק כש-`currentStreak > 1` (מונע "רצף: 1" מבלבל באימון ראשון) |
| היסטוריית אימון | `app/workouts/[id]/history/page.tsx:85,183` | אותו מקור |
| כותרת מסך הבית | `UserHeaderPill.tsx:62,184-191` | badge, רק אם `> 0` |
| כרטיס התקדמות בבית | `ProgressCard.tsx:39,119-123` | badge כתום |
| כרטיס hero אחרי אימון | `HeroCard.tsx:14,81` | טקסט "N אימונים ברצף" מ-`sessionStorage` |
| ברכה חכמה (`SmartGreeting`) | `messages/components/SmartGreeting.tsx:129,135,162` | משתנה `'streak_milestone'`, אינטרוולים `[3,7,14,30,60,100]` |
| פרופיל — תג על אווטאר | `profile/components/DashboardTab.tsx:44,165` | תג להבה |
| פרופיל — שורת סטטיסטיקות | `DashboardTab.tsx:226-234` | "ימי רצף" |
| "הדירוג שלי" בקהילה | `app/community/page.tsx:967-973` | `profile.progression.currentStreak` + 🔥 |
| לוח מובילים — לשונית ברירת מחדל! | `arena/services/ranking.service.ts:432-470` (`getStreakLeaderboard`) | שאילתה ישירה ל-`streaks` collection, `orderBy('currentStreak','desc')` |
| כרטיסי שותפים (נוכחות חיה) | `partners/components/PartnerCard.tsx:62,372-375` | "N ימים רצף" |
| מסמך נוכחות אמיתי | `useWorkoutPresence.ts:145` | כותב `currentStreak` ל-`presence/{uid}` בזמן אימון פעיל |

**false friends — אל תתבלבלו בתכנון:**
- `achievement-definitions.ts:210-218` — `monthly_streak` (שם מטעה!) סופר **ימי-פעילות-מצטברים לכל החיים** (`progression.daysActive`), **לא** את הרצף העוקב.
- `admin/progression-manager/page.tsx:1202,1466-1469` — טבלת "Monthly Streak" bonus היא עקומת בונוס-לפי-מספר-אימונים-בחודש (LAW 5), לא קשורה לרצף היומי.
- `health-economics.service.ts` — `STREAK_MINIMUM_MINUTES` שם שאול-בהשאלה לסף WHO, לא הרצף.
- קוד מנוע לו"ז (`runningRules.ts:330-349`, `scheduleRules.ts:478-496`) משתמש במשתנה מקומי בשם `streak` לבדיקת ימי-לו"ז-רצופים — אין לו קשר לפיצ'ר.

### §5. השפעה על XP — מכפיל אמיתי, לא מתועד

`xp-rules.ts:22-25`: `STREAK_MULTIPLIER_INCREMENT = 0.01`, מקס' 30 יום → עד **1.30×**. מיושם על **כל** נוסחת XP (strength/running/commute) ב-`xp.service.ts`. זורם בפועל דרך `useXpAward.ts`/`useRunningPlayer.ts` עד ל-Guardian CF (`awardWorkoutXP`), שמקבל את ה-`xpDelta` המחושב-בצד-לקוח **כמו שהוא**, בלי חישוב מחדש בצד שרת.

**הפער:** `.cursoragents/XP_Progression_Truth.md` מתעד רק "LAW 5 — Monthly Streak" (בונוס לפי מס' אימונים בחודש) — **אין אזכור כלשהו** למכפיל הרצף-היומי. ה-Truth file לא מעודכן בנקודה הזו.

### §6. השפעה על ליגות — מדד הדירוג של הלשונית הראשית

`NeighborhoodLeaderboard.tsx:51,471` — הקטגוריה `'general'` (🔥, תווית "כללי") היא **ברירת המחדל הנבחרת** כשנכנסים ל-`/community`, והמטריקה שלה (`:135`) היא פשוט `'ימי אימון ברצף'`. כלומר: **רוב המשתמשים, רוב הזמן, רואים דירוג-קהילה שהוא בעצם דירוג-רצף.** נפרד לגמרי ממערכת ה"ליגה הרשמית" (functions/src/leaderboard.ts וכו') שלא נוגעת ברצף בכלל.

### §7. הישגים — XP אמיתי מרצף

`achievement-definitions.ts:232-244` — `weekly_streak` (🔥), tiers 7/30/100 יום, **+50/+150/+300 XP** ממשי, מחובר חי דרך `useAchievements.ts` ל-Guardian CF.

### §8. פושים — מה קיים ומה לא

**אין שום טריגר שמופעל ע"י אירוע-רצף.** רשימת ה-trigger types הסגורה (`workout-settings/bulk/page.tsx:33-42`) לא כוללת "streak at risk"/"streak broken"/"streak milestone". חיפוש שלילי אישר: `grep` ל-`lastActiveDate`/`lastStreakDate` ב-`functions/src` מחזיר **אפס** תוצאות — אין Cloud Function שבודק "כמה זמן לא היה פעיל" כדי לשלוח תזכורת.

מה שכן קיים — **רק משתנה טקסט**, לא טריגר:
- `@רצף` — תג personalization שאפשר להטמיע בתוכן הפוש (`notification-content.service.ts:195-198`), אבל נקרא היום רק ע"י פוש-יעד-יומי (`stepGoalNudgeScheduler.ts`), לא ע"י שום דבר שקשור לרצף עצמו.
- ערוץ בשם `'progression' // level-up, streak, PR` (`push.service.ts:229`) — השם מרמז שרצף שולח פוש, אבל השולח היחיד עליו (`onLevelUp.ts`) מופעל **רק** מעליית-level. יש הודעת-flavor קבועה ברמה 6 שמזכירה "תמשיך ברצף שלך" אבל זה טקסט סטטי, לא נגזר מהרצף האמיתי של המשתמש.

**מערכת תוכן-בתוך-אפליקציה, מוגדרת אבל לא מחוברת:** `MessageService.ts` מגדיר `streak_milestone` כ-`MessageType` עם `minStreak`/`maxStreak`, ניתן לניהול מ-`admin/messages`. אבל שתי נקודות הקריאה החיות היחידות באפליקציה (`home/page.tsx:650`, `workouts/[id]/active/page.tsx:594`) קוראות ל-hook הפשוט `useSmartMessage('post_workout')` עם טיפוס קשיח — **אף אחת לא קוראת** ל-`useSmartGreeting()` שבאמת מחשב `streak_milestone`. כלומר: אפשר לכתוב תוכן "אבן דרך ברצף" בפאנל היום, ושום דבר באפליקציה לא יציג אותו בפועל.

### §9. פאנל ניהול — מה קיים היום

**תא יחיד, read-only, למשתמש בודד:** `admin/users/all/page.tsx:2105-2108` — "רצף נוכחי" בטאב פרטי-משתמש, קורא ישירות `users/{uid}.progression.currentStreak`. אין עריכה, אין טרנד, אין דשבורד אגרגטיבי, אין פילוח לפי רצף בשום דוח קיים (`analytics`/`statistics`/`insights` נבדקו ישירות — אפס תוצאות).

`admin/messages` כן מאפשר הגדרת `minStreak`/`maxStreak` כתנאי-מיקוד להודעה — זו קונפיגורציית-קלט, לא תצוגת-נתון.

---

## חלק ב — המלצה: איך רצף צריך להיספר ולהיראות בפאנל ניהול

זו הצעה בלבד — שום דבר כאן לא נבנה.

1. **לפני הכל: לתקן את מקור האמת.** עם 47% אי-התאמה מאומתת (§2), דשבורד-רצף חדש שנשען על `streaks/{uid}`/`progression.currentStreak` כמו שהם היום יראה מספרים יפים ושגויים. הצעד הראשון הוא לא "להוסיף תצוגה" אלא לתקן את ה-dual-write הלא-טרנזקציוני ב-§3 (או, זול יותר: לבנות שדה רצף *חדש*, מחושב מ-`dailyActivity`/`workouts` האמיתיים בצד שרת, ולא לסמוך על ה-client-side הקיים).
2. **שלב משפך נפרד** ("רצף פעיל 7+ ימים") — תואם ישירות להמלצה מ-[[retention-conversion-metrics-audit]] (חלון 7 ימים), עכשיו עם ההקשר המלא: זה אותו שדה שכבר מכפיל XP ומדרג בליגה, אז יש לו כבר "דלת-כניסה" ידועה למדידה.
3. **טווח התפלגות**, לא רק ממוצע: היסטוגרמה של אורכי רצף פעילים (1-2 / 3-6 / 7-13 / 14-29 / 30+) — חושף אם רוב המשתמשים נתקעים ב"יום 1" (איתות-נטישה) או מגיעים ל"חלון ה-30 יום" (כבר במכפיל XP מקסימלי, סימן התמדה אמיתי).
4. **לחבר את ה-streak_milestone הקיים** (MessageService, §8) בפועל — זה המקום הזול ביותר להתחיל: הקוד כבר קיים, רק חסר קריאה ל-`useSmartGreeting()` בשתי נקודות הקריאה.
5. **לשקול push אמיתי מבוסס-רצף** (לא קיים כלל היום) — "עומד להישבר" (D-1 מהרצף הנוכחי, בלי אימון עדיין) ו"נשבר" (D+1 בבוקר) הם שני ה-triggers בעלי הפוטנציאל הגבוה ביותר, לפי מחקר התעשייה שכבר הובא ב-[[retention-conversion-metrics-audit]] (תדירות שבועית = המדד השני-הכי-חזק).

---

## חלק ג — מדדי פלטפורמה: מעקב התנהגות משתמש (קליקים, זמן, מסכים)

### §10. מה קיים היום

**שום כלי behavioral-analytics חיצוני לא מחובר.** נבדק `package.json` ישירות — אין Mixpanel/Amplitude/PostHog/Hotjar/FullStory/Heap/Segment.

**Firebase Analytics (GA4) מאותחל אבל מת בפועל:** `src/lib/firebase.ts:503-511` יוצר `getAnalytics(app)`, ויש תשתית-הסכמה מלאה (`consent.ts`) שמכבה/מדליקה את האיסוף שלו לפי `users/{uid}.core.analyticsOptOut`. **אבל** — grep ל-`logEvent(` מאשר: ה-`logEvent` היחיד שנקרא בכל הקוד הוא הפונקציה **הפרטית** של `AnalyticsService.ts` (כותבת ל-Firestore `analytics_events`), **לא** `logEvent` של `firebase/analytics`. כלומר GA4 כנראה אוסף רק את אירועי ברירת-המחדל האוטומטיים שלו (session_start וכו', אם בכלל רלוונטיים ל-SPA בתוך WebView) — שום אירוע עסקי-מותאם לא זורם אליו. זה בדיוק אותה משפחת-תבנית שתועדה כבר בפרויקט (axioms.md §26/§27): מנגנון שנראה כאילו הוא עושה משהו, אבל בפועל לא.

### §11. למה זה רלוונטי — אתם *וואב-אפ עטוף*, לא אפליקציה native טהורה

נקודה נכונה וחשובה: האפליקציה בנויה כ-React/Next.js רץ בתוך Capacitor WebView (iOS/Android). זה אומר שכל כלי JS סטנדרטי לניטור התנהגות-באתר (sessionreplay/heatmap/product-analytics) **טכנית יכול לרוץ בתוכה בלי שינוי ארכיטקטוני** — הוא רק סקריפט שנטען בדף, בדיוק כמו באתר רגיל.

אבל יש 3 הסתייגויות אמיתיות לבדוק *לפני* שבוחרים ספק, כולן נובעות ממוסכמות שכבר קיימות בקוד:

1. **אין "סגירת טאב" אמיתית.** כלים רבים (Hotjar/Mixpanel) נשענים על `beforeunload`/`visibilitychange` של הדפדפן כדי לדעת "המשתמש עזב". ב-Capacitor WebView, המשתמש "עוזב" ע"י מעבר-לרקע (home button / app switcher), לא סגירת טאב — וזה כבר מטופל אחרת באפליקציה (axioms.md §19, `onboardingPrefs.ts`). כל SDK חדש חייב להתחבר ל-event native של Capacitor (`App.addListener('appStateChange', ...)`), לא לברירת-המחדל-לדפדפן של הספק.
2. **אחסון מקומי לא אמין לאורך זמן ב-iOS.** בדיוק כמו ש-axioms.md §19 מתעד ש-`localStorage` יכול להימחק ע"י WKWebView בין הפעלות — אם ה-SDK שומר `device_id`/`anonymous_id` רק ב-`localStorage`, ה"משתמש" שלו בפלטפורמה האנליטית יתחלף מדי פעם ל"משתמש חדש" באופן מלאכותי, ויעוות לגמרי כל ניתוח retention. חובה לוודא שה-SDK נתמך רשמית ל-hybrid/Capacitor (לא רק "אתר נייד"), או לגשר את ה-id דרך `@capacitor/preferences` בעצמכם.
3. **הסכמה (consent) כבר קיימת — אסור לבנות ערוץ-הסכמה שני.** יש כבר שדה יחיד, `core.analyticsOptOut`, שמכבה גם את ה-custom analytics וגם את GA4 (`consent.ts`). כל ספק חדש **חייב** להתחבר לאותו שדה, לא ליצור toggle נפרד — אחרת משתמש שסירב להסכמה ימשיך להיות מנוטר בכלי אחד ולא באחר.

### §12. אפשרויות — סוגי כלים וההבדל ביניהם

| סוג | מה זה נותן | דוגמאות | הערה לגבי Capacitor |
|---|---|---|---|
| **Product analytics** (אירועים + funnels + retention cohorts) | בדיוק מה ש-[[retention-conversion-metrics-audit]] ביקש: עקומות שימור, ניתוח קוהורט, A/B | PostHog, Mixpanel, Amplitude | תומכים רשמית ב-mobile web / hybrid; Amplitude ו-PostHog הכי חזקים בניתוח retention מובנה |
| **Session replay + heatmaps** (לראות בדיוק מה המשתמש עשה, לא רק "מה קרה") | הקלטת מסך אמיתית (DOM, לא וידאו) — בדיוק "על מה לחץ, כמה זמן שהה" | Hotjar, Microsoft Clarity (חינם), FullStory, PostHog (כלול) | מבוסס `rrweb` — תומך touch events; יש לוודא שלא "מקליט" שדות בריאותיים/אישיים רגישים בלי מיסוך (חשוב פי כמה באפליקציית בריאות/כושר) |
| **CDP / שכבת-צנרת** (שולח אירועים למספר כלים בבת-אחת) | לא עוד תובנה בעצמו — אינטגרציה אחת, הפצה לכמה ספקים | Segment, RudderStack | שווה רק אם מתכננים >1 כלי; תוספת latency/עלות אם צריך רק אחד |
| **מה שכבר יש, פשוט לא בשימוש** | GA4 — חינמי, כבר מאותחל, כבר מחובר ל-consent | Firebase Analytics | הכי זול (אין עלות נוספת, אין SDK חדש) אבל חלש משמעותית ב-retention/cohort analysis לעומת PostHog/Amplitude, ואין בו session replay |

### §13. המלצה (לא סגורה — דורשת החלטת דוד)

אם המטרה היא בדיוק מה שתואר — "מה הוא עשה, על מה לחץ, כמה זמן, ואז להגיע למסקנות" — זה המרחב של **product analytics + session replay יחד**, לא רק GA4. **PostHog** בולט כמועמד ראשון לבדיקה:
- Tier חינמי נדיב (כולל session replay + heatmaps + product analytics + feature flags תחת קורת-גג אחת — פחות ספקים נפרדים לנהל).
- אפשרות self-host (רלוונטי אם יש רגישות לנתוני-בריאות יוצאים לענן של ספק שלישי — שווה לבדוק מול הדרישות של חוק הפרטיות הישראלי שכבר מוזכר ב-`consent.ts`).
- יש לו retention/cohort analysis מובנה — בדיוק המדדים שה-funnel הקיים (`funnel-analytics.service.ts`) בונה ידנית היום.

**אבל** — זו החלטה עם שתי השלכות אמיתיות שלא ניתן לעקוף:
1. **נתוני-משתמש (כולל כנראה מיקום/בריאות-אדג') יזרמו לספק חיצוני** — צריך סקירת-פרטיות לפני בחירה, לא רק השוואת-features.
2. **זו לא "הוספת SDK" קטנה** — צריך תכנון-מיפוי-אירועים (איזה event names, איזה properties, איך זה מתחבר לשכבת ה-consent הקיימת) לפני שורת-קוד ראשונה. מומלץ scope נפרד, לא "אגב" בתוך משימה אחרת.

**לא ממומש כאן — זו המלצת-כיוון לדיון, לא פעולה.**

---

## מקורות למיפוי הקוד (§1-§9)

הופק ע"י 2 סוכני Explore מקבילים (01.10.2026): אחד מיפה חישוב/אחסון/UI, שני מיפה פושים/ליגות/פאנל-ניהול — כל אחד קיבל הנחיה מפורשת לצטט file:line ולהצהיר "לא נמצא" ולא לנחש. §10-§13 (GA4/package.json) אומתו ישירות ע"י הסשן הראשי (grep בפועל, לא מהסוכנים).
