# עוזר AI בפאנל הניהול — תוכנית (מסמך בלבד, בלי קוד)

**סטטוס:** תוכנית לאישור. אין קוד, אין גישה לפרודקשן, אין שינוי בכללים.
**תאריך:** 22.10.2026 · **בסיס:** `origin/main` @ `d3a95873`
**בקשת דוד (22.10.2026):** צ'אט בתוך פאנל הניהול ש-(1) עוזר למצוא דברים ("איפה טבלת כל הערים") ועונה בקישור לחיץ שמנווט לשם; (2) מכיר סטטיסטיקות ונתוני פאנל (משתמשים, פעילות, מוכנות מיפוי ערים, מסלולים שממתינים לאישור, צנרת CRM, עלויות AI ועוד) ועוזר להבין את הסטארטאפ; (3) בהמשך — גרסה לרשויות שרואה רק את נתוני הרשות שלה ומסיקה מסקנות מהשימוש.

כל טענה על קוד קיים מצוטטת כ-`קובץ:שורה` מול `origin/main` הנ"ל.

---

## 0. תקציר בשורה אחת + התשובה לשאלה "צריך ללמד אותו כל עמוד?"

**לא.** מפת הפאנל נבנית **אוטומטית** מהקוד: סקריפט סורק את כל `src/app/admin/**/page.tsx` (140 עמודים, מתוכם 17 דינמיים עם `[id]`), לוקח את השם מהסיידבר / מה-`<h1>` / מהערת הראש של הקובץ, ומחשב מי רשאי לראות כל עמוד **באמצעות אותן פונקציות שהשער האמיתי משתמש בהן** (`decideAdminGateAction` ב-`src/middleware.ts:357`, `SECTION_PATHS` ב-`src/features/admin/config/adminSections.ts:25`). הפלט נשמר בגיט, ובדיקת CI נכשלת אם עמוד נוסף והמפה לא עודכנה — כך המפה לעולם לא מתיישנת. ידני נשאר רק קובץ "מילים נרדפות" קטן ואופציונלי (למשל "טבלת כל הערים" → עמוד הרשויות), לא חובה לכל עמוד.

השאר: נתיב שרת אחד עם tool use מעל הלקוח, התקציב והלדג'ר הקיימים; כלים **לקריאה בלבד** עם שער תפקיד בכל כלי; מודל `claude-opus-5-5`; workspace + מפתח נפרדים ב-Console עם תקרה משלו; מגירה בצד הפאנל. גרסת הרשויות — שלב נפרד, עם scope שנקבע רק מהסשן המאומת.

---

## 1. מה כבר קיים (ומה מזה ממחזרים)

| רכיב | איפה | שימוש בתוכנית |
|---|---|---|
| לקוח Anthropic יחיד | `getAnthropicClient()` — `src/lib/ai/anthropic.server.ts:41-46` (קורא `ANTHROPIC_API_KEY`) | מרחיבים ללקוח שני עם מפתח admin (סעיף 2.4) |
| בחירת מודל לפי tier | `getAiModel('fast'\|'smart')` — `anthropic.server.ts:48-51`; ברירות מחדל `ai-pricing.ts:21-24` (Haiku 5.5 / Sonnet 5.5) | מוסיפים tier `admin` (סעיף 2.3) |
| Prompt caching | `withPromptCaching()` — `anthropic.server.ts:62-77` (breakpoint על הכלי האחרון ועל בלוק ה-system האחרון) | שימוש ישיר |
| מתג כיבוי + תקציב יומי | `assertAiBudget()` — `anthropic.server.ts:116-139`, קורא `app_config/ai` (`ai-config.ts:4-10`), fail-closed (`:128-131`) | שימוש ישיר + תקציב admin נפרד |
| הגבלת קצב לפי משתמש | `checkAiRateLimit()` — `anthropic.server.ts:161-171`, fail-closed | שימוש ישיר עם מגבלות admin |
| לדג'ר שימוש | `recordAiUsage()` — `anthropic.server.ts:182-213` (`ai_usage/{uid}_{day}` + `ai_usage_global/{day}`, עם `byFeature`) | שימוש ישיר, `feature: 'admin_ai'` |
| טבלת מחירים | `AI_PRICE_TABLE` — `ai-pricing.ts:38-52` (Haiku 5.5, Sonnet 5.5 בלבד) | **חסרה שורת Opus 5.5 — ראו 2.3, באג תמחור** |
| דפוס תקציב-משנה | סוכן הביקורת: `reviewBudgetUsd` (`ai-config.ts:22-27`), נבדק ב-`src/lib/ai/review/reviewer.server.ts:157-169`, נרשם תחת uid מערכתי (`review-types.ts:30`) | אותו דפוס ל-`adminAiBudgetUsd` |
| צ'אט קלי (SSE + tool loop) | `src/app/api/ai-coach/chat/route.ts` — זרם SSE `:353-515`, קריאת מודל בזרם + לדג'ר `:393-401`, breakpoint שני על בלוק הסשן `:328-351` | הדפוס להעתקה (לא הקוד עצמו — סעיף 2.5) |
| רישום כלים | `src/lib/ai/coach/tools.ts` — רשימה קבועה וזהה-בבתים לטובת cache (`:17-19`, `:336-349`), ולידציית zod לכל קלט מהמודל (`:356-369`) | אותו דפוס |
| ביצוע כלי שרת | `src/lib/ai/coach/server-tools.server.ts` — "כל כלי מתמקד מחדש ב-uid המאומת, לעולם לא במה שהמודל העביר" (`:2-4`), `default` → `unknown tool` (`:347-350`) | אותו עיקרון בדיוק |
| חיפוש עברי | `normalizeHe` — `src/lib/ai/coach/app-help/retrieve.ts:26-35` | להעביר ל-`src/lib/` לשימוש משותף (axiom 7 — אין ייבוא חוצה-דומיינים) |
| שערי API לפאנל | `requireAdminApi` (`src/lib/api-auth.ts:58`), `requireSection` (`:76`), `requireSuperAdminApi` (`:211`), `requireKellyTeamAdmin` (`:237`) | ראו 5.1 — אף אחד מהם לא מתאים כמו שהוא |
| scope אנליטי לפי תפקיד | `resolveAdminAnalyticsScope(uid)` — `src/lib/adminAnalyticsScope.ts:50-80` → `platform`/`vertical`/`authority`/`denied` | כל כלי נתונים מקבל scope ממנו |
| פונקציות חישוב שכבר מופרדות מה-route | `computeStatisticsSummary` (`src/app/api/admin/statistics-summary/route.ts:58`), `computeInsightsSummary` (`insights-summary/route.ts:71`), `computeGrowthMetrics` (`growth-metrics/route.ts:252`), `computeRetentionDepth` (`retention-depth/route.ts:124`), `computeRetentionDrivers` (`journey-retention-drivers/route.ts:50`), `computeJourneyActivation` (`journey-activation/route.ts:49`), `computeJourneySources` (`journey-sources/route.ts:60`), `computePushPerformanceSummary` (`push-performance-summary/route.ts:118`), `computePushFunnelSummary` (`push-funnel-summary/route.ts:52`), `computeSignupFailuresList` (`signup-failures/route.ts:36`), `computeAgentsOverview` (`src/lib/agentsPanelServer.ts:174`), `computeAccuracyQueue` (`src/lib/route-decisions/compute-queue.ts:46`) | הכלים קוראים להן ישירות in-process — אין צורך בשאילתות חדשות |
| מבנה הסיידבר | JSX כתוב ידנית ב-`src/app/admin/layout.tsx:1108-1345`; מקטעים→נתיבים ב-`adminSections.ts:25-48`; תקדים לניווט כנתונים: `MILITARY_ROOT_NAV_ITEMS` (`src/features/admin/config/militaryNavItems.ts:1-12`), `sidebarConfigs.ts:14-38` | לחלץ את קישורי הסיידבר הראשי לקובץ נתונים (גל 2) |
| תקדים למניפסט שנוצר בבנייה | `scripts/gen-equipment-icon-manifest.mjs:1-15`, מחובר ל-`predev`/`prebuild` (`package.json:6-8`) | אותו דפוס למפת הפאנל |
| CI | `unit-tests` (`.github/workflows/ci.yml:27-39`, vitest node-only) | בדיקת "המפה לא מיושנת" נכנסת לשם |

**ממצא מסמכים:** `SECURITY.md:252-265` (§7) עדיין טוען "AI surface — fully removed". זה כבר לא נכון (קלי חי). גל 1 מעדכן את §7 כך שיתאר את שני משטחי ה-AI (קלי, עוזר פאנל) והשערים שלהם.

---

## 2. ארכיטקטורה

### 2.1 תמונה כללית

```
מגירה בפאנל (client, Zustand)
   │  POST /api/admin/assistant/chat   { threadId?, message }   (SSE)
   ▼
route.ts (runtime nodejs, maxDuration 60 כמו קלי — chat/route.ts:83)
   1. requireAdminAiCaller(request)      ← אדם, super/root בלבד, בלי agent key
   2. דגל admin_ai_assistant_v1 (fail-closed)
   3. assertAiBudget  +  admin budget    ← app_config/ai
   4. checkAiRateLimit(uid, admin limits)
   5. loop: messages.stream → tool_use → executeAdminTool(ctx, name, input) → ...
   6. recordAiUsage(uid, model, usage, {feature:'admin_ai'}) על כל קריאה
   7. שמירת תור + שורת audit
```

קבצים מוצעים (קוד בגלים, לא כאן): `src/lib/ai/admin-assistant/{gate.server.ts, tools.ts, execute.server.ts, turn.ts, prompt.ts, thread-store.server.ts, audit.server.ts}`, `src/app/api/admin/assistant/chat/route.ts`, `src/features/admin/components/assistant/*`.

### 2.2 למה לא `verifyAiRequest` כמו שהוא

`verifyAiRequest` (`src/lib/ai/verify-ai-request.server.ts:101-153`) בנוי למשתמשי אפליקציה: דורש `core.ageGroup === 'adult'` (`:127`) וזכאות `aiCoach` (`:129`). זה לא רלוונטי למנהלים, ו"לתקן" את זה בהגדרת זכאות קלי למנהלים היה בדיוק מלכודת axiom §32 — שימוש חוזר בדגל קיים לקהל חדש. במקום: שער ייעודי `verifyAdminAiRequest` שממחזר את **החלקים** — `loadAiConfig` + `assertAiBudget` + `checkAiRateLimit` — עם בדיקת תפקיד משלו (5.1).

### 2.3 מודל

- **מודל:** `claude-opus-5-5` (לפי בקשת דוד). מחיר: $4 / $20 ל-1M טוקנים קלט/פלט, קריאת cache $0.20, כתיבת cache (5 דק') $5.
- **tier חדש, לא `AI_MODEL_SMART`:** `getAiModel('smart')` כבר משמש את סוכן הביקורת (`src/lib/ai/review/reviewer.server.ts:191`) ואת סקירת הגנרציה (`src/lib/generation-review/review/run.server.ts:220`). הגדרת `AI_MODEL_SMART=claude-opus-5-5` הייתה מכפילה בשקט את עלותם. לכן: tier `admin` → env `AI_MODEL_ADMIN`, ברירת מחדל `claude-opus-5-5`.
- **באג תמחור שחייב להיסגר לפני השימוש הראשון:** `AI_PRICE_TABLE` (`ai-pricing.ts:38-52`) מכיר רק Haiku 5.5 ו-Sonnet 5.5. מודל לא מוכר מתומחר לפי השורה היקרה ביותר בטבלה (`ai-pricing.ts:59-61`) — היום זו Sonnet ($2/$10), כלומר Opus 5.5 היה נספר **בחצי ממחירו** והתקציב היומי היה נפרץ פי 2 לפני שהמתג קופץ. גל 1 מוסיף שורת `claude-opus-5-5` (4 / 20 / 0.20 / 5) + טסט.
- **פרמטרים:** ב-Opus 5.5 אי אפשר לכבות thinking (`{type:'disabled'}` מחזיר 400) — לכן **אסור** לממחזר את `COACH_THINKING = {type:'disabled'}` (`src/lib/ai/coach/turn-engine.ts:43`). משמיטים `thinking` ושולטים דרך `output_config.effort`: `low` לשאלות ניווט, `medium` (ברירת המחדל של המודל) לשאלות ניתוח. `tool_choice` כפוי (`any`/`tool`) מחזיר 400 — רק `auto`, עם `strict: true` על הגדרות הכלים. מומלץ `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`) כדי שסירוב-מסווג לא ישבור תשובה; לטפל ב-`stop_reason: 'refusal'` במפורש.
- **`max_tokens`:** 4,000 לתשובה (תשובות פאנל קצרות; התקרה היא גם תקרת עלות).

### 2.4 Console: workspace, מפתח ותקרה נפרדים

היום ל-org תקרה של $200 לחודש ו-workspace דמו עם $50. ממליץ:

- **workspace חדש `admin`** עם תקרת הוצאה חודשית משלו — **$50** בהתחלה (הערכה בסעיף 7: ~$20-40 לחודש בשימוש של דוד).
- **מפתח API נפרד** מה-workspace הזה → env `ANTHROPIC_API_KEY_ADMIN` ב-Vercel. בקוד: `getAnthropicClient('admin')` שבונה `new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY_ADMIN })`, ובמקרה שהמשתנה חסר — **נכשל סגור** (503), לא נופל למפתח של קלי. כך פריצה או לולאה בעוזר לא יכולים לרוקן את התקציב של משתמשי הקצה, והעלות נראית בנפרד בדוח העלויות (`src/lib/costs/connectors/anthropic-admin.ts:1-8` כבר קורא את ה-cost report; אפשר להוסיף פיצול לפי workspace בהמשך).
- **בתוך המערכת:** שדה חדש `adminAiBudgetUsd` ב-`app_config/ai` (ברירת מחדל מוצעת $3 ליום), נבדק בנוסף ל-`dailyBudgetUsd` הגלובלי — אותו דפוס כמו `reviewBudgetUsd`. ההוצאה עדיין נרשמת גם בלדג'ר הגלובלי (`anthropic.server.ts:207`), כך שמתג הכיבוי הגלובלי עוצר גם את העוזר.

### 2.5 לולאת התור וה-streaming

- `runCoachTurn` (`turn-engine.ts:179`) קשור לקלי: guards של קלי, כלי client (`generate_workout`), thinking כבוי. לא ממחזרים אותו; כותבים לולאה קטנה דומה (`turn.ts`): עד 6 סבבי כלים, כלי שרת בלבד, כלים מקבילים מבוצעים יחד ונשלחים בהודעת `user` אחת, כלי שנכשל → `tool_result` עם `is_error`.
- **Streaming:** `getAnthropicClient('admin').messages.stream(params)` + `finalMessage()` ולדג'ר אחרי כל קריאה — בדיוק כמו `chat/route.ts:393-401`. אירועי SSE: `text` (דלתא), `tool` (סטטוס: "בודק את מוכנות המיפוי…"), `link` (כפתור ניווט מהכלי `navigate`), `done`, `error`.
- **ניתוק לקוח:** כמו קלי — התור נשלם ונשמר (`chat/route.ts:394-395`).

### 2.6 Prompt caching

סדר הרינדור tools → system → messages. מה שנכנס לקידומת הקבועה (cached):
1. הגדרות הכלים (רשימה קבועה בסדר קבוע — `tools.ts:17-19` הוא התקדים).
2. ה-system prompt: תפקיד, כללי התנהגות, כללי prompt-injection, **ומפת הפאנל המלאה** (~140 עמודים × ~40 טוקנים ≈ 6K טוקנים). המפה משתנה רק בדיפלוי, ולכן יציבה ל-cache.
3. breakpoint שני על בלוק סשן קצר (תאריך ישראלי, שם המנהל) — כמו `chat/route.ts:347-350`.
4. breakpoint שלישי על סוף ההיסטוריה, כדי שסבבי הכלים באותו תור יקראו את השיחה מ-cache.

המינימום ל-cache ב-Opus 5.5 הוא 512 טוקנים — הקידומת (~9K) גבוהה ממנו בהרבה. TTL של 5 דקות מספיק לשיחה; שאלה ראשונה ביום משלמת כתיבה.

### 2.7 אחסון שיחות

- `admin_ai_threads/{uid}` + `messages/{id}` — Admin SDK בלבד, TTL על `expireAt` (90 יום, כמו קלי — `firestore.rules:1245-1251`).
- **כללים:** ה-catch-all בסוף הקובץ הוא `allow read, write: if isRootAdmin()` (`firestore.rules:3485-3487`), כלומר בלי בלוק מפורש — root admin יכול לקרוא/לכתוב את האוספים החדשים **מהדפדפן**. לכן כל אוסף חדש מקבל בלוק מפורש עם `allow read, write: if false;` (הצהרה אחת לפחות — axiom §30), ו-`firebase deploy --only firestore:rules --dry-run` רץ לפני שהוראת פריסה נמסרת לדוד. הפריסה מ-`main` אחרי מיזוג, על ידי דוד (CLAUDE.md, Git/Deploy Rules).

---

## 3. מפת הפאנל שנוצרת אוטומטית + כלי הניווט

### 3.1 מקורות לכל עמוד

| שדה | מקור (לפי סדר עדיפות) |
|---|---|
| `path` | נתיב הקובץ `src/app/admin/**/page.tsx` (140 קבצים; 17 עם `[param]`) |
| `title` | (1) תווית הסיידבר; (2) ה-`<h1>` הראשון (קיים ב-116 מתוך 140 עמודים); (3) שם התיקייה |
| `section` | `SECTION_PATHS` / `HIGHLIGHT_ONLY` — `adminSections.ts:25-57` |
| `description` | הערת ה-JSDoc בראש הקובץ (למשל `src/app/admin/page.tsx:11`); אחרת ריק |
| `roles` | מחושב, לא נכתב: לכל scope (`authority_manager`, `tenant_owner`, `unit_admin`, `readiness_chief_officer`, super) מריצים את `decideAdminGateAction(path, session)` (`src/middleware.ts:357-387`); ל-platform members — `isPathAllowed` (`adminSections.ts:88`) |
| `params` | לעמודים דינמיים — שם הפרמטר וכלי ה-lookup שמספק אותו (למשל `authorities/[id]` ← `find_authority`) |
| `synonyms` | אופציונלי, מקובץ overrides קטן כתוב ביד (`admin-page-map.overrides.ts`) |

אין `export const metadata` באף עמוד אדמין (139 מתוך 140 הם `'use client'`), ולכן לא נשענים על metadata של Next.

### 3.2 צעד מקדים: לחלץ את קישורי הסיידבר לנתונים

הסיידבר הראשי הוא JSX ידני (`layout.tsx:1108-1345`), ו-parsing של JSX בסקריפט שביר. גל 2 מעביר את הקישורים לקובץ נתונים `src/features/admin/config/adminNavItems.ts` (בדיוק כמו `MILITARY_ROOT_NAV_ITEMS`), וה-layout מרנדר ממנו. בלי שינוי נראה. יש לזה ערך גם בלי העוזר: מקור אחד לתוויות.

### 3.3 יצירה ושמירה על עדכניות

- `scripts/gen-admin-page-map.mjs` → `src/generated/admin-page-map.json` (נשמר בגיט, ממוין, דטרמיניסטי — כדי שה-prompt יהיה זהה-בבתים בין דיפלויים ללא שינוי).
- **בדיקת CI:** טסט vitest (node-only, נכנס ל-job `unit-tests`) שמריץ את הגנרטור בזיכרון ומשווה לקובץ השמור. עמוד חדש בלי `npm run gen:admin-map` → CI אדום עם הודעה מה להריץ. זה עדיף על `prebuild` בלבד, כי `prebuild` כותב ב-Vercel אבל לא מעדכן את הגיט.
- טסט נוסף: כל `href` בסיידבר קיים כעמוד, וכל עמוד שמופיע ב-`SECTION_PATHS` קיים — מוצא סחף ישן בדרך.

### 3.4 כלים

| כלי | קלט | מה עושה | אכיפה |
|---|---|---|---|
| `find_admin_page` | `query` (טקסט חופשי) | חיפוש על title/description/synonyms/section עם `normalizeHe`; מחזיר עד 5 עמודים | רק עמודים שהמשתמש הנוכחי רשאי לראות (לפי `roles`) |
| `navigate` | `pageId`, `params?`, `query?` | מחזיר `{href, title}`; ה-UI מציג כפתור, לחיצה → `router.push` | `pageId` חייב להיות במפה; `params` עוברים ולידציה (מזהה Firestore תקין, `encodeURIComponent`); ה-href מורכב בשרת ומתחיל תמיד ב-`/admin/`; לעולם לא URL חופשי מהמודל |

**מה עם קישורים בטקסט החופשי של המודל:** ה-UI **לא** הופך URL-ים בטקסט לקישורים. קישור לחיץ מגיע רק מאירוע `link` שנוצר מתוצאת `navigate`. זה סוגר את הנתיב שבו נתון ממסמך/Firestore משכנע את המודל לשתול קישור חיצוני.

דוגמה: "איפה טבלת כל הערים?" → `find_admin_page("טבלת כל הערים")` → (synonym) `authorities` → `navigate` → "ניהול רשויות" [כפתור]. אם החיפוש מחזיר כמה תוצאות (למשל גם `city-mapping`), המודל מציג 2-3 כפתורים עם שורה על כל אחד.

---

## 4. כלי נתונים — קריאה בלבד

**עקרונות:**
- אין כלי "הרץ שאילתה כלשהי". כל כלי עונה על שאלה מוגדרת, מעל פונקציה קיימת.
- כל כלי מקבל `ctx = { uid, role, scope }` מהשער (`resolveAdminAnalyticsScope`, `adminAnalyticsScope.ts:50`) ומפעיל את ה-compute עם ה-scope הזה. לעולם לא scope מארגומנט של המודל.
- כל ספירה שנכשלה מוחזרת כ-`null` + סיבה, לא כ-0 — אותה מדיניות כמו `home-today/route.ts:3-5` ו-axiom §25 ("0 שאינו באמת 0").
- תוצאות נחתכות (top-N, בלי מערכים גולמיים) כדי לשמור על עלות טוקנים.
- cache תוצאות בזיכרון / Firestore ל-5-10 דקות לכלים כבדים — `home-today` קורא את **כל** אוסף `users` בכל קריאה (`home-today/route.ts:69-71`).

| כלי | עונה על | מקור | שער (v1) | עלות משוערת |
|---|---|---|---|---|
| `get_platform_pulse` | משתמשים, פעילים השבוע, אימונים, צמיחה שבועית | `computeWeekPulse` (`src/features/admin/services/home-today.ts:39`) על הנתונים ש-`home-today/route.ts:69-71` קורא | super, scope `platform` (כמו `home-today/route.ts:60-63`) | כבד ב-Firestore (כל המשתמשים) → cache 10 דק'; ~500 טוקנים |
| `get_attention_queue` | פארקים ממתינים, דיווחי תחזוקה ישנים, חשבוניות, כשלי הרשמה | הספירות ב-`home-today/route.ts:102-122` (לחלץ לפונקציה) | כנ"ל | ספירות `count()`; ~200 טוקנים |
| `get_statistics_summary` | ביצועי רשויות, השלמות | `computeStatisticsSummary` (`statistics-summary/route.ts:58`) | כנ"ל | בינוני; ~1.5K טוקנים (top 10) |
| `get_insights_summary` | תובנות מוצר | `computeInsightsSummary` (`insights-summary/route.ts:71`) | כנ"ל | בינוני |
| `get_growth_metrics` | צמיחה, מקורות | `computeGrowthMetrics` (`growth-metrics/route.ts:252`), `computeJourneySources` (`journey-sources/route.ts:60`) | כנ"ל | בינוני |
| `get_retention` | retention ומניעיו | `computeRetentionDepth` (`retention-depth/route.ts:124`), `computeRetentionDrivers` (`journey-retention-drivers/route.ts:50`) | כנ"ל | בינוני |
| `get_activation_funnel` | משפך הפעלה | `computeJourneyActivation` (`journey-activation/route.ts:49`) | כנ"ל | בינוני |
| `get_push_performance` | ביצועי פושים | `computePushPerformanceSummary` (`:118`), `computePushFunnelSummary` (`:52`) | כנ"ל | בינוני |
| `get_pending_approvals` | מה מחכה במרכז האישורים, לפי סוג ועיר | היום נקרא **מהדפדפן**: מסלולים `official_routes.published==false` (`src/app/admin/approval-center/page.tsx:269`), טיפוסים `climb_segments` (`:294`), יחידות `pending_units` (`:319`), תרומות (`:353`), מתקנים (`:369`); + `computeAccuracyQueue` (`compute-queue.ts:46`). צריך פונקציית קריאה שרתית חדשה (קריאה בלבד — `safety-check.sh` אוכף כותבים, לא קוראים) | כנ"ל | ספירות + top-5 ערים; ~400 טוקנים |
| `get_city_mapping_readiness` | אדום/צהוב/ירוק לעיר, ציון, מה חסר | `readCityInventory` (`src/lib/city-inventory/store`, כמו `city-mapping/inventory/route.ts:5-10`) + `computeReadiness` (`src/lib/city-inventory/readiness.ts:78`) | כנ"ל (`requireSuperAdminApi` הוא השער של ה-route המקביל, `inventory/route.ts:34`) | doc אחד לעיר; גרסת "כל הערים" → טבלה מקוצרת |
| `get_crm_pipeline` | כמה רשויות בכל שלב, מה דחוף | `authorities.status` (8 הסטטוסים — `src/types/admin-types.ts:15`), `URGENT_PIPELINE_STATUSES` (`:271`) | כנ"ל | קריאת `authorities` עם `select`; ~600 טוקנים. **קריאה בלבד — לעולם לא נוגע ב-`isActiveClient`** (axiom §6) |
| `find_authority` | "מה המצב של חיפה?" → id + סטטוס + קישורים | `authorities` לפי שם (normalizeHe) | כנ"ל | קטן; מזין את `navigate` לעמודים דינמיים |
| `get_ai_costs` | עלות AI היום/החודש, לפי פיצ'ר | `ai_usage_global/{day}` (`anthropic.server.ts:93-94`), `loadTodayAiUsd`/`loadMonths` (`src/lib/costs/costs-store.server.ts:22-36`), `buildDashboard` (כמו `costs/route.ts:1-17`) | כנ"ל | קטן |
| `get_signup_failures` | כמה ולמה נכשלו הרשמות | `computeSignupFailuresList` (`signup-failures/route.ts:36`) — **מוחזרות רק ספירות לפי סיבה**, לא אימיילים | כנ"ל | קטן |
| `get_agents_status` | מצב סוכני האוטומציה | `computeAgentsOverview` (`src/lib/agentsPanelServer.ts:174`) | כנ"ל | קטן |
| `search_docs` / `read_doc_section` | "מה החלטנו על X" | אינדקס מסמכים (4.1) | כנ"ל | ~1-3K טוקנים לתוצאה |

הערה טכנית: חלק מפונקציות ה-compute מיוצאות מקבצי `route.ts`. בגל 4/6 מעבירים אותן (העברה בלבד, בלי שינוי התנהגות) ל-`src/lib/admin-analytics/*.server.ts`, ה-route וגם הכלי מייבאים משם.

### 4.1 שליפת מסמכים ("מה החלטנו על X")

- היקף: 123 קבצי `docs/**/*.md` בלי `docs/archive/` (שמסומן "לא משקף את הקוד" ב-`docs/README.md`), כ-3.5MB טקסט — גדול מדי להכנסה ל-prompt. נוסף: `CLAUDE.md`, `SECURITY.md`, `.claude/rules/*.md`. **לא** `.claude/knowledge/` (זיכרון עבודה, לא תיעוד — `docs/README.md`; ולפי CLAUDE.md חלקו לא בגיט).
- `scripts/gen-docs-index.mjs` חותך לפי כותרות (`##`/`###`) → `src/generated/docs-index.json`: `{path, heading, line, date?, text}`. נטען בשרת בלבד. אותה בדיקת עדכניות ב-CI כמו המפה. (לא משנים את `next.config.mjs` כדי לכלול את `docs/` בחבילה — CLAUDE.md אוסר לגעת בהגדרות שם; האינדקס הוא JSON שמיובא כמודול.)
- `search_docs(query)` → עד 5 חלקים (keyword/BM25 עם `normalizeHe`), כל אחד עם `path:line`. `read_doc_section(path, heading)` → הטקסט המלא של החלק.
- **כלל ב-prompt:** כל תשובה מתוך מסמך מצטטת `path:line` ואומרת "לפי המסמך" — לא "זה מומש". מסמך שאומר שמשהו נעשה אינו הוכחה שהוא בקוד (הלקח של `DECISION-INDEX.md`, CLAUDE.md Workflow).

---

## 5. אבטחה

### 5.1 מי יכול להשתמש (v1)

- **super admin או root בלבד, ורק אדם.** לא `requireSuperAdminApi` — הוא מקבל גם `X-Agent-Key` (`api-auth.ts:211-212`), ומפתח מכונה לא צריך לשרוף תקציב Opus. לא `requireAdminApi`/`requireSection` — רחבים מדי (`api-auth.ts:16-49`, `:136-140`). התבנית: `requireKellyTeamAdmin` (`api-auth.ts:237-262`) — זהות מ-Bearer או מקוקי הסשן, root לפי אימייל או `core.isSuperAdmin`, בלי מסלול agent key. השער החדש `requireAdminAiCaller` מחזיר `{uid, email, role}`.
- דגל ייעודי `admin_ai_assistant_v1` ב-`system_config/feature_flags`, `defaultValue: false` (fail-closed). **לא** שימוש חוזר ב-`aiCoachEnabled` או בדגל תפקיד קיים (axiom §32).
- השער יושב ב-route **ובכל כלי** (5.2), לא בהסתרת הכפתור. הסתרת המגירה ב-UI היא נוחות, לא הגנה (axiom §26).

### 5.2 כל כלי בודק מחדש

`executeAdminTool(ctx, name, input)`: (1) zod על הקלט (כמו `tools.ts:356-369`); (2) `ctx.role` חייב לעמוד בדרישת הכלי (טבלה בסעיף 4); (3) ה-scope מגיע מ-`ctx`, לעולם לא מהקלט; (4) שם לא מוכר → `unknown tool`, לא מבוצע (`server-tools.server.ts:347-350`). טסט לכל כלי: קריאה עם `ctx` של תפקיד לא מורשה → שגיאה, אפס קריאות Firestore.

לא נשענים על `hasTenant()`/claim `tenantId` — ענף מת (axiom §29; `SECURITY.md:56-59` מתאר אותו כאילו הוא חי).

### 5.3 Prompt injection

- נתונים מ-Firestore (שמות פארקים, הערות תחזוקה, טקסט משתמשים) ומ-`docs/` הם **נתונים, לא הוראות**. כך כתוב ב-system prompt, ותוצאות כלים עטופות בתגית `<tool_data source="...">`.
- אין כלי כתיבה ב-v1, ולכן במקרה הגרוע הזרקה מייצרת טקסט מטעה — לא פעולה.
- קישורים לחיצים רק מ-`navigate` (3.4); `href` נבנה בשרת מהמפה.
- שדות טקסט חופשי שמשתמשים כתבו (הערות, דיווחים) לא מוחזרים בכלים של v1 בכלל — רק ספירות וקטגוריות.

### 5.4 אין כלי כתיבה ב-v1

אין שינוי סטטוס CRM, אין אישור מסלולים, אין שליחת הודעות. אם בעתיד: כל פעולה היא "כרטיס הצעה" שהאדם מאשר בלחיצה, דרך ה-API הקיים של אותה פעולה עם השער שלו — לא כלי שכותב ישירות (כמו `propose_schedule_change` של קלי, `tools.ts:296-334`).

### 5.5 Audit

- `admin_ai_audit/{autoId}`: `uid`, `threadId`, `question` (חתוך ל-500 תווים), `tools: [{name, input, ok, resultBytes, ms}]`, `model`, `usage`, `costUsd`, `createdAt`, `expireAt` (180 יום). Admin SDK בלבד, כללים `if false`.
- לא מרחיבים את `audit_logs`: היחיד שכותב לשם הוא Callable `logAuditAction` עם allowlist של פעולות (`SECURITY.md:430-441`), והוא מיועד לשינויים, לא לקריאות.
- תצוגה: טאב "שימוש בעוזר" בעמוד `/admin/costs` או `/admin/ai-coach` — root בלבד.

### 5.6 צמצום PII

- הכלים מחזירים **אגרגטים**. ב-v1 אין כלי שמחזיר משתמש בודד.
- אף כלי לא מחזיר אימייל, טלפון, תאריך לידה, מיקום מדויק או נתוני בריאות (`SECURITY.md:588-600`, §12.7). משתמשים קטינים לא נספרים בנפרד ברזולוציה שמזהה אותם.
- הלוגים — מטא-דאטה בלבד (`SECURITY.md:575-586`, §12.6): לא תוכן השאלה ב-`console.log`, רק ב-audit המוגן.
- מה שנשלח ל-Anthropic הוא בדיוק מה שהכלים מחזירים — מספרים ושמות רשויות/עמודים.

---

## 6. גרסת הרשויות (בהמשך — שלב נפרד עם אישור נפרד)

### 6.1 scope מהסשן בלבד

- ה-scope של רשות נקבע **רק** מ-`resolveAdminAnalyticsScope(uid)` → `{kind:'authority', authorityId}` (`adminAnalyticsScope.ts:74-77`), או מ-`resolveUnitPermissionScope` (`src/lib/unitPermissionScope.ts:355`) לאנכים צבאי/חינוכי. ה-`authorityId` נכנס ל-`ctx` וכל כלי משתמש **רק** בו.
- ארגומנט של המודל יכול רק **לצמצם** בתוך הרשות (שכונה, פארק, טווח תאריכים), ונבדק בשרת שהוא שייך ל-`ctx.authorityId`. אי-התאמה → שגיאה + שורת audit. טסט לכל כלי: `authorityId` זר בארגומנט → נדחה, אפס נתונים.
- axiom §25: הכלים רצים ב-Admin SDK — לא שאילתות דפדפן שתלויות בכללי `list`.
- axiom §26: השער הוא ב-route ובכל כלי. לא "מנהל רשות ממילא לא יגיע לעמוד הזה".
- axiom §32: הרשאה חדשה וייעודית — `authorities/{id}.aiInsightsEnabled` שרק super admin כותב — ולא שימוש חוזר ב-`isActiveClient` (שאסור לגעת בו בלי אישור כתוב, axiom §6), ב-`isTenantOwner` או ב-`isVerticalAdmin`. לפני הפתיחה: grep לכל קוראי השדה.
- הערה: `resolveAdminAnalyticsScope` לוקח את הרשות הראשונה שהמנהל רשום בה (`limit(1)`, `adminAnalyticsScope.ts:74`). מנהל של כמה רשויות יראה רק אחת — לסגור לפני הפתיחה, לא לעקוף.

### 6.2 מה הוא רואה

- **מפה:** רק העמודים ש-`decideAdminGateAction` מתיר ל-scope שלו (אותה מפה מסוננת). את השאר הוא לא יודע שקיימים.
- **כלים:** עטיפות מעל ה-routes העירוניים הקיימים: `src/app/api/authority-manager/{city-summary, dashboard-summary, city-week, city-aggregates, parks-activity, neighborhood-breakdown, who-compliance-summary, health-savings-summary}`. אין `search_docs` (מסמכים פנימיים) — במקומו עזרה מובנית לרשויות.
- **מסקנות שהוא יכול להסיק:** מגמה שבועית/חודשית; שעות ושימוש לפי פארק ("פארק X עמוס בערב, פארק Y כמעט ריק"); פערים בין שכונות; עמידה ביעדי WHO; חיסכון בריאותי משוער (לפי המתודולוגיה של `health-savings-summary`); retention; מה כדאי לבדוק (מתקן שלא נמצא בשימוש, שכונה בלי פעילות).
- **השוואה לערים אחרות:** רק benchmark אנונימי (ממוצע/חציון של לפחות 5 רשויות, בלי שמות). אף שם של רשות אחרת לא יוצא.
- **הסתרת מספרים קטנים:** פלח עם פחות מ-5 משתמשים מוצג "פחות מ-5", כדי שאי אפשר יהיה לזהות אדם בשכונה קטנה.

### 6.3 תקציב

- workspace נפרד `municipal` עם תקרה משלו, ותקרה יומית לכל רשות (`authorities/{id}.aiDailyBudgetUsd` או ברירת מחדל ב-`app_config/ai`).
- מודל: לשקול Sonnet 5.5 ($2/$10) לרשויות — החלטה של דוד (שאלה 9).

---

## 7. הערכת עלות

הנחות (Opus 5.5: קלט $4, פלט $20, קריאת cache $0.20, כתיבת cache $5 — ל-1M):
- קידומת cached: כלים ~2.5K + system ~1K + מפת פאנל ~6K ≈ **9.5K טוקנים**.
- thinking נספר כפלט. ב-effort `low` הוא קצר; ב-`medium` ארוך יותר.

| סוג שאלה | קריאות למודל | טוקנים (בערך) | עלות |
|---|---|---|---|
| ניווט ("איפה X?"), cache חם | 2 (find → navigate+תשובה) | קריאת cache 2×9.5K; קלט חדש ~1.5K; פלט ~500 | **~$0.02** |
| נתון בודד ("כמה ממתינים לאישור?") | 2 | קלט חדש ~2.5K; פלט ~700 | **~$0.03** |
| ניתוח ("למה ה-retention ירד החודש?"), 3-4 כלים | 3-4 | קלט חדש ~10-15K (תוצאות כלים); פלט ~2K | **~$0.10-0.15** |
| שאלה ראשונה אחרי >5 דק' שקט | +1 כתיבת cache | 9.5K × $5/M | **+$0.05** |

**חודש:** 20 שאלות ביום, תמהיל 60% ניווט/נתון ו-40% ניתוח → בערך $1.2-1.5 ליום ≈ **$35-45 לחודש**. מכאן ההמלצה: תקרת workspace $50, תקרה יומית במערכת $3. מעל זה — להוריד ל-effort `low` כברירת מחדל ולעלות רק בשאלות ניתוח.

**Firestore:** `get_platform_pulse` קורא את כל `users` — אלפי קריאות לכל שאלה בלי cache. עם cache של 10 דק' זה זניח. הכלים האחרים הם `count()`/`select` ו-top-N.

---

## 8. UI

- **מיקום:** כפתור "שאל את OUT ✨" בכותרת הפאנל + קיצור `Ctrl/⌘+K`. נטען ב-`layout.tsx` (סביב `<main>`, `:1437`), כך שהמגירה **נשארת פתוחה בזמן ניווט** — לוחצים על הקישור והתשובה עדיין שם.
- **צורה:** RTL — הסיידבר מימין, ולכן המגירה נפתחת **משמאל**. דסקטופ: פאנל עגון ברוחב 400px שמצמצם את התוכן (לא overlay, לא חוסם את הדף). מובייל (<768px): גיליון במסך מלא.
- **מצב:** Zustand store (`useAdminAssistantStore`) — אין Context חדש (axiom 7).
- **תוכן:** markdown קל (כותרות, רשימות, טבלאות קטנות); כפתורי ניווט מאירועי `link`; שורת סטטוס בזמן ריצת כלי ("בודק מוכנות מיפוי…"); מקורות (`path:line` למסמכים, שם הכלי/העמוד לנתונים); עלות התשובה בקטן (לדוד); 👍/👎 שנשמרים ב-audit.
- **z-index:** טבלת התקציב ב-`.cursorrules` היא למפת האפליקציה (`.cursorrules:31`); לפאנל אין טבלה רשומה. הערכים בפועל בפאנל: `.mobileBar` 40 (`src/app/admin/admin-shell.module.css:252-255`), `.sidebar` במובייל 60 (`:289-293`), `.scrim` 55 (`:325-328`), מודאלים `z-[80]/[81]` (`src/app/admin/finance/expenses/page.tsx:190-191`), מודאלי roadmap `z-[9999]` (`src/app/admin/roadmap/components/TagManager.tsx:111`). **הצעה:** המגירה ב-`z-[70]` — מעל הסיידבר/scrim במובייל, ומתחת למודאלים של הדפים, כך שמודאל שנפתח בדף שאליו ניווטנו יכסה אותה. ובאותו PR: תת-טבלה "Admin panel" ב-`.cursorrules` עם כל הערכים האלה (axiom §8 — אין ערך לא רשום). מאמתים במדידה (`getBoundingClientRect`, computed z-index), לא בהנחה.

---

## 9. גלים (PR-ים קטנים)

כל גל: ענף מ-`origin/main`, PR רגיל, בדיקות CI ירוקות, ולא ממזגים בלי אישור דוד. כל מה שמשנה התנהגות נמצא מאחורי `admin_ai_assistant_v1` (ברירת מחדל `false`).

| גל | תוכן | בדיקות קבלה |
|---|---|---|
| **0** | המסמך הזה | דוד מאשר / מתקן את התשובות לשאלות בסעיף 10 |
| **1 — תשתית** | שורת `claude-opus-5-5` ב-`AI_PRICE_TABLE`; tier `admin` + `AI_MODEL_ADMIN`; `getAnthropicClient('admin')` (`ANTHROPIC_API_KEY_ADMIN`, fail-closed); `adminAiBudgetUsd` + מגבלות קצב admin ב-`ai-config.ts`; דגל `admin_ai_assistant_v1` (false); `requireAdminAiCaller`; עדכון `SECURITY.md` §7 | טסטים: עלות Opus לפי 4/20/0.2/5; מפתח חסר → 503 ולא נפילה למפתח קלי; agent key → 401; admin רגיל/מנהל רשות → 403; super/root → עובר; תקציב admin מוצה → 503 גם כשהגלובלי פנוי |
| **2 — מפת פאנל** | חילוץ קישורי הסיידבר ל-`adminNavItems.ts` (בלי שינוי נראה); `gen-admin-page-map.mjs` + JSON שמור; טסט עדכניות; `find_admin_page`/`navigate` כפונקציות טהורות + טסטים | CI אדום כשמוסיפים עמוד בלי להריץ את הגנרטור; הסיידבר זהה לפני/אחרי (צילום מסך); `navigate` עם `pageId` לא קיים / `params` זדוני → נדחה; עמוד שמנהל רשות לא רשאי לראות לא חוזר עבורו |
| **3 — צ'אט + ניווט** | route SSE, לולאת תור, אחסון שיחה, audit, בלוקי כללים (`if false`) + dry-run, מגירה ב-UI — **רק כלי המפה** | דוד שואל "איפה טבלת כל הערים" → כפתור → ניווט, המגירה נשארת פתוחה; שורת `ai_usage` עם `byFeature.admin_ai`; שורת audit; `cache_read_input_tokens > 0` מהשאלה השנייה; z-index נמדד בדסקטופ ובמובייל; dry-run של הכללים מוצג ב-PR |
| **4 — נתונים, מנה 1** | `get_platform_pulse`, `get_attention_queue`, `get_crm_pipeline`, `find_authority`, `get_pending_approvals`, `get_city_mapping_readiness`, `get_ai_costs` (כולל העברת compute ל-`src/lib/admin-analytics/`) | לכל כלי: המספר זהה למה שהעמוד המקביל מציג באותו רגע (השוואה צד-לצד); כשל → `null`+סיבה ולא 0; טסט תפקיד לכל כלי; זמן תשובה < 15 שנ' |
| **5 — מסמכים** | `gen-docs-index.mjs` + `search_docs`/`read_doc_section` + טסט עדכניות | 10 שאלות "מה החלטנו על X" שהתשובה עליהן ידועה → ציטוט `path:line` נכון ב-≥8; אין ציטוט מ-`docs/archive/` |
| **6 — נתונים, מנה 2 + איכות** | growth / retention / activation / push / signup-failures / agents; סט eval של 25 שאלות זהב (ניווט, נתון, ניתוח, ניסיונות injection) | eval עובר ≥ 90% בניווט ובנתונים; 0 מקרים שבהם טקסט מתוך נתונים גרם לקישור או לפעולה; עלות ממוצעת לשאלה בטווח של סעיף 7 |
| **7 — רשויות (תוכנית נפרדת)** | סעיף 6, אחרי אישור נפרד, עם audit של קוראי השדה (axiom §32) וטסטי scope לכל כלי | טסט: `authorityId` זר בארגומנט → נדחה; benchmark לא חושף שמות; הסתרת פלחים <5 |

---

## 10. שאלות פתוחות לדוד — עם המלצה לכל אחת

1. **מודל לכל השאלות?** Opus 5.5 לכל שאלה, או Sonnet 5.5 לניווט ו-Opus לניתוח? **המלצה:** Opus 5.5 בלבד, עם effort `low` לניווט ו-`medium` לניתוח. מודל אחד = cache אחד, וההפרש בניווט הוא אגורות.
2. **תקציב:** workspace `admin` עם תקרה של $50 לחודש + תקרה יומית במערכת $3? **המלצה:** כן. מעלים אחרי חודש לפי השימוש בפועל.
3. **מי מקבל גישה ב-v1:** רק david@/office@, או כל super admin? **המלצה:** root + super admins. לפני ההדלקה — לבדוק מי בפועל מסומן `isSuperAdmin`.
4. **שמירת שיחות:** 90 יום לשיחות, 180 ל-audit? **המלצה:** כן.
5. **פרטיות בין מנהלים:** האם super admin אחד רואה שיחות של אחר? **המלצה:** לא. כל אחד רואה את שלו; ה-audit גלוי ל-root בלבד.
6. **חיפוש משתמש ספציפי** ("מה המצב של יוסי כהן?") ב-v1? **המלצה:** לא. רק אגרגטים. אם צריך — כלי ייעודי בגל מאוחר, מחזיר uid ושם פרטי בלבד, עם audit.
7. **היקף אינדקס המסמכים:** `docs/**` + `CLAUDE.md` + `SECURITY.md` + `.claude/rules/`, בלי `docs/archive/` ובלי `.claude/knowledge/`? **המלצה:** כן.
8. **פעולות כתיבה בעתיד** (טיוטת משימה, קידום שלב CRM)? **המלצה:** לא לפני ש-v1 רץ חודש. אחר כך רק "כרטיס הצעה" שמאשרים בלחיצה, דרך ה-API הקיים.
9. **רשויות:** חלק מחבילה בתשלום? איזה מודל? סף אנונימיות ל-benchmark? **המלצה:** דגל לכל רשות (`aiInsightsEnabled`), Sonnet 5.5, benchmark מ-≥5 רשויות, הסתרת פלחים <5.
10. **רפקטור הסיידבר לנתונים** (גל 2) — מאושר? **המלצה:** כן. בלי שינוי נראה, ומקור אחד לתוויות גם לעוזר וגם לסיידבר.
11. **שפה:** עברית בלבד? **המלצה:** כן. עונה בעברית גם אם שאלו באנגלית, אלא אם ביקשו אחרת.
12. **"טבלת כל הערים"** — לאיזה עמוד הכוונה: `/admin/authorities` (ניהול רשויות) או `/admin/city-mapping`? **המלצה:** synonym לשניהם; העוזר מציג את שני הכפתורים עם שורה על כל אחד.
