# עוזר AI בפאנל הניהול — תוכנית (מסמך בלבד, בלי קוד)

**סטטוס:** תוכנית לאישור, **גרסה 2**. אין קוד, אין גישה לפרודקשן, אין שינוי בכללים.
**תאריך:** 22.10.2026 · **בסיס:** `origin/main` @ `d3a95873`
**בקשת דוד (22.10.2026):** צ'אט בתוך פאנל הניהול ש-(1) עוזר למצוא דברים ("איפה טבלת כל הערים") ועונה בקישור לחיץ שמנווט לשם; (2) מכיר סטטיסטיקות ונתוני פאנל (משתמשים, פעילות, מוכנות מיפוי ערים, מסלולים שממתינים לאישור, צנרת CRM, עלויות AI ועוד) ועוזר להבין את הסטארטאפ; (3) בהמשך — גרסה לרשויות שרואה רק את נתוני הרשות שלה ומסיקה מסקנות מהשימוש.

**מה השתנה בגרסה 2 (משוב דוד, 22.10.2026):**
1. **מודל:** Sonnet 5.5 (`claude-sonnet-5-5`) ב-effort `medium` כברירת מחדל — לא Opus. המודל החזק נשמר לעבודת קוד.
2. **יועץ מוצר/סטארטאפ:** נוסף סעיף 5 — כלי אנליטיקה לנטישה לפי שלב אונבורדינג, עיר ופרסונה; קוהורטות retention; פערי הפעלה; ביצועי פושים לפי סוג ושעה; אימוץ פיצ'רים; פערי שימוש בין ערים. לכל מדד יש הגדרה מדויקת, ויש פורמט חובה של "הראה את הראיות".
3. **עלות:** יעד של כמה דולרים בחודש. ניווט נענה מקומית בלי מודל, קידומת cached רזה, תוצאות כלים קטנות, היסטוריה מתגלגלת, תקרות טוקנים לכל שאלה, תקרה יומית $0.50 ותקרת workspace $10 לחודש. טבלת העלות חושבה מחדש לפי המחירים ב-`ai-pricing.ts` (סעיף 8).

כל טענה על קוד קיים מצוטטת כ-`קובץ:שורה` מול `origin/main` הנ"ל.

---

## 0. תקציר + התשובה לשאלה "צריך ללמד אותו כל עמוד?"

**לא.** מפת הפאנל נבנית **אוטומטית** מהקוד: סקריפט סורק את כל `src/app/admin/**/page.tsx` (140 עמודים, מתוכם 17 דינמיים), לוקח את השם מהסיידבר / מה-`<h1>` / מהערת הראש, ומחשב מי רשאי לראות כל עמוד **באמצעות אותן פונקציות שהשער האמיתי משתמש בהן** (`decideAdminGateAction` — `src/middleware.ts:357-387`; `SECTION_PATHS` — `src/features/admin/config/adminSections.ts:25`). הפלט נשמר בגיט, ובדיקת CI נכשלת כשהמפה מתיישנת. ידני נשאר רק קובץ מילים נרדפות קטן ואופציונלי.

**חיסכון:** חיפוש בעמודים נעשה **בדפדפן, בלי מודל** — fuzzy search על המפה, מיידי ובחינם. המודל נקרא רק כשהשאלה עמומה או כשהיא שאלת נתונים או ניתוח. גם שאלות נתונים נפוצות ("כמה ממתינים לאישור?") נענות דרך כפתורי "תשובה מהירה" שמציגים את תוצאת הכלי ישירות, בלי מודל.

**מודל:** `claude-sonnet-5-5`, effort `medium`. Haiku 5.5 משמש רק לסיכום היסטוריה ולניתוב טריוויאלי. **הערכת עלות** ל-20 שאלות ביום: כ-**$0.20-0.30 ליום, כ-$5-7 לחודש** (טבלה בסעיף 8). המלצה: תקרה יומית $0.50, תקרת workspace $10.

---

## 1. מה כבר קיים (ומה מזה ממחזרים)

| רכיב | איפה | שימוש בתוכנית |
|---|---|---|
| לקוח Anthropic יחיד | `getAnthropicClient()` — `src/lib/ai/anthropic.server.ts:41-46` (קורא `ANTHROPIC_API_KEY`) | מרחיבים ללקוח שני עם מפתח admin (2.4) |
| בחירת מודל לפי tier | `getAiModel('fast'\|'smart')` — `anthropic.server.ts:48-51`; ברירות מחדל `ai-pricing.ts:21-24` (`fast` = Haiku 5.5, `smart` = Sonnet 5.5) | tier `admin` נפרד (2.3) |
| Prompt caching | `withPromptCaching()` — `anthropic.server.ts:62-77` | שימוש ישיר |
| מתג כיבוי + תקציב יומי | `assertAiBudget()` — `anthropic.server.ts:116-139`, `app_config/ai` (`ai-config.ts:4-10`), fail-closed (`:128-131`) | שימוש ישיר + תקציב admin נפרד |
| הגבלת קצב לפי משתמש | `checkAiRateLimit()` — `anthropic.server.ts:161-171`, fail-closed | שימוש ישיר |
| לדג'ר שימוש | `recordAiUsage()` — `anthropic.server.ts:182-213` | `feature: 'admin_ai'` |
| טבלת מחירים | `AI_PRICE_TABLE` — `ai-pricing.ts:38-52`: **רק** `claude-haiku-5-5` ו-`claude-sonnet-5-5`. מודל לא מוכר מתומחר לפי השורה היקרה ביותר (`:59-61`), כלומר כרגע לפי Sonnet | ראו 2.3: tier `admin` מסרב למודל שאין לו שורה בטבלה |
| דפוס תקציב-משנה | `reviewBudgetUsd` (`ai-config.ts:22-27`), נבדק ב-`src/lib/ai/review/reviewer.server.ts:157-169`, uid מערכתי ללדג'ר (`review-types.ts:30`) | אותו דפוס ל-`adminAiBudgetUsd` |
| צ'אט קלי | `src/app/api/ai-coach/chat/route.ts` — SSE `:353-515`, לדג'ר אחרי כל קריאה `:393-401`, breakpoint שני `:328-351`, סיכום היסטוריה במודל המהיר `:94-109` + `:494` | הדפוס להעתקה |
| רישום כלים | `src/lib/ai/coach/tools.ts` — רשימה קבועה (`:17-19`, `:336-349`), zod על כל קלט (`:356-369`) | אותו דפוס |
| ביצוע כלי שרת | `server-tools.server.ts` — "re-scopes to the verified uid" (`:2-4`), `unknown tool` (`:347-350`) | אותו עיקרון |
| שומר עובדות בתשובה | `src/lib/ai/coach/reply-guards.ts:1-12` — בודק שעובדות בתשובה של קלי מופיעות בתוצאת כלי | תקדים ל-"guard ראיות" (5.3) |
| חיפוש עברי | `normalizeHe` — `src/lib/ai/coach/app-help/retrieve.ts:26-35` | להעביר ל-`src/lib/` (axiom 7) |
| שערי API | `requireAdminApi` (`src/lib/api-auth.ts:58`), `requireSection` (`:76`), `requireSuperAdminApi` (`:211`), `requireKellyTeamAdmin` (`:237`) | 6.1 |
| scope אנליטי | `resolveAdminAnalyticsScope(uid)` — `src/lib/adminAnalyticsScope.ts:50-80` | כל כלי |
| הגדרות KPI נעולות | `docs/product/kpi-definitions.md:9-17` (activation = אימון אמיתי אחד; retention = ≥3), predicate — `src/lib/workout-completion-kpi.ts:55-66`, סינון חשבונות בדיקה — `src/lib/testAccountFilter.ts:62` | כל מדד חדש משתמש בהם |
| סיידבר | JSX ידני ב-`src/app/admin/layout.tsx:1108-1345`; תקדים לנתונים: `militaryNavItems.ts:1-12`, `sidebarConfigs.ts:14-38` | חילוץ לנתונים (גל 2) |
| מניפסט שנוצר בבנייה | `scripts/gen-equipment-icon-manifest.mjs:1-15`, `package.json:6-8` | אותו דפוס |
| CI | `unit-tests` — `.github/workflows/ci.yml:27-39` | בדיקת עדכניות |

**ממצא מסמכים:** `SECURITY.md:252-265` (§7) עדיין טוען "AI surface — fully removed". גל 1 מעדכן.

---

## 2. ארכיטקטורה

### 2.1 תמונה כללית — שלוש דרכים לענות, מהזולה ליקרה

```
מגירה בפאנל (client)
 │
 ├─ 1. ניווט מקומי ─ fuzzy על admin-page-map.json (בדפדפן) ─► כפתורים        $0
 ├─ 2. תשובה מהירה ─ GET /api/admin/assistant/quick/<metric> ─► כרטיס מספרים  $0 (Firestore בלבד)
 └─ 3. מודל ─ POST /api/admin/assistant/chat (SSE)                           סנטים
        requireAdminAiCaller → דגל → assertAiBudget + admin budget → rate limit
        → [Haiku router רק אם לא ברור] → Sonnet 5.5 loop (≤3 סבבי כלים)
        → recordAiUsage(feature:'admin_ai') על כל קריאה → audit
```

קבצים מוצעים (קוד בגלים): `src/lib/ai/admin-assistant/{gate.server.ts, tools.ts, execute.server.ts, turn.ts, prompt.ts, router.ts, thread-store.server.ts, audit.server.ts}`, `src/lib/admin-analytics/*.server.ts` (העברת פונקציות compute + פונקציות חדשות), `src/app/api/admin/assistant/{chat,quick/[metric]}/route.ts`, `src/features/admin/components/assistant/*`.

### 2.2 למה לא `verifyAiRequest` כמו שהוא

הוא בנוי למשתמשי אפליקציה: דורש `core.ageGroup === 'adult'` (`src/lib/ai/verify-ai-request.server.ts:127`) וזכאות `aiCoach` (`:129`). לתת למנהלים זכאות קלי כדי לעבור את השער הזה היא בדיוק מלכודת axiom §32. במקום זאת, שער ייעודי שממחזר את `loadAiConfig` + `assertAiBudget` + `checkAiRateLimit` עם בדיקת תפקיד משלו (6.1).

### 2.3 מודל

- **ברירת מחדל: `claude-sonnet-5-5`**, `output_config.effort: 'medium'`. ב-Sonnet 5.5 ברירת המחדל של effort היא `high`, ולכן קובעים `medium` במפורש. מחיר מ-`ai-pricing.ts:46-51`: $2 קלט / $10 פלט / $0.20 קריאת cache / $2.5 כתיבת cache ל-1M.
- **Haiku 5.5 (`claude-haiku-5-5`)** ($0.10 / $0.50 / $0.01 / $0.125 — `ai-pricing.ts:39-45`) רק ל: (א) סיכום היסטוריה מתגלגל (כמו `summarizeOlder` של קלי, `chat/route.ts:94-109`); (ב) ניתוב, כשהניווט המקומי לא הכריע ("ניווט / נתון / ניתוח / מחוץ לתחום"). Haiku לא עונה על שאלות ניתוח.
- **tier נפרד:** `getAiModel('admin')` → env `AI_MODEL_ADMIN`, ברירת מחדל `claude-sonnet-5-5`. לא `smart`, כדי שהחלפת מודל לעוזר לא תשנה את סוכן הביקורת (`reviewer.server.ts:191`) ואת סקירת הגנרציה (`src/lib/generation-review/review/run.server.ts:220`). **גארד:** אם `AI_MODEL_ADMIN` מצביע על מודל שאין לו שורה ב-`AI_PRICE_TABLE`, ה-route מחזיר 503 ולא קורא למודל. כך החלפה ל-Opus בלי לתמחר אותו לא תיספר בטעות במחיר Sonnet (`ai-pricing.ts:59-61`).
- **פרמטרים ב-Sonnet 5.5:**
  - `thinking: {type:'disabled'}` מחזיר 400. לכן לא ממחזרים את `COACH_THINKING` (`src/lib/ai/coach/turn-engine.ts:43`).
  - משמיטים את `thinking` (adaptive). ל-thinking יש עלות של טוקני פלט, ולכן `max_tokens` הוא תקרת העלות האמיתית (2.6).
  - מנוף שני אפשרי למדידה בגל 6: `thinking: {type:'between_tools'}` בשאלות נתון-בודד.
  - `tool_choice` כפוי מחזיר 400 — רק `auto`, עם `strict: true` בהגדרות הכלים.
  - `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`, Claude API בלבד) + טיפול ב-`stop_reason: 'refusal'`.

### 2.4 Console: workspace, מפתח ותקרות

- **workspace `admin`** עם תקרה חודשית **$10**, ו**מפתח נפרד** `ANTHROPIC_API_KEY_ADMIN`. `getAnthropicClient('admin')` נכשל סגור (503) כשהמפתח חסר — לא נופל למפתח של קלי.
- **במערכת:** `adminAiBudgetUsd` ב-`app_config/ai` = **$0.50 ליום** (דפוס `reviewBudgetUsd`). ההוצאה נרשמת גם בלדג'ר הגלובלי (`anthropic.server.ts:207`), כך שמתג הכיבוי הגלובלי עוצר גם את העוזר.
- **תקרה לכל שאלה:** הערכת עלות מצטברת אחרי כל קריאה (`estimateCostUsd`, `ai-pricing.ts:92-104`). מעל **$0.05** לשאלה — אין סבב כלים נוסף; המודל נדרש לסכם עם מה שיש ולציין זאת.

### 2.5 לולאת התור

- לולאה קטנה משלנו (`runCoachTurn`, `turn-engine.ts:179`, קשור לקלי). **עד 3 סבבי כלים**; כלים מקבילים מבוצעים יחד ונשלחים בהודעת `user` אחת; כשל → `tool_result` עם `is_error`.
- Streaming: `messages.stream` + `finalMessage()` + לדג'ר אחרי כל קריאה (כמו `chat/route.ts:393-401`). אירועי SSE: `text`, `tool`, `link`, `evidence`, `done`, `error`.

### 2.6 משמעת טוקנים (העיקר בחיסכון)

| מנוף | ערך מוצע | למה |
|---|---|---|
| קידומת cached רזה | כלים (~2.5K) + system (~1K) + **מילון מדדים** (~0.8K) ≈ **4.5K** | המפה המלאה (~6K) **לא** נכנסת לקידומת — הניווט מקומי, ולמודל יש `find_admin_page` כשצריך. ב-Sonnet כתיבת cache עולה 1.25× ($2.5/M), ובשאלות פזורות לאורך היום רוב השיחות מתחילות קרות — קידומת קטנה = כתיבה זולה |
| breakpoints | (1) סוף הכלים+system; (2) סוף ההיסטוריה | כמו `chat/route.ts:328-351`; סבבי הכלים בתוך שאלה קוראים הכל מ-cache |
| TTL | 5 דקות (ברירת מחדל) | 1 שעה עולה 2× בכתיבה; בשימוש של 20 שאלות ביום זה לא משתלם |
| היסטוריה מתגלגלת | 3 תורות אחרונות מילולית (≤1.5K טוקנים); ישנות יותר → סיכום Haiku של ≤150 טוקנים | תקדים: `maybeRollSummary` (`chat/route.ts:494`) |
| תוצאות כלים | ≤ **800 טוקנים** לכלי: אגרגטים, top-5, בלי שורות גולמיות; חיתוך מסומן `truncated:true` | 4 |
| `max_tokens` | 400 בסבב כלי; **900** בתשובה הסופית (כולל thinking) | תקרת עלות קשיחה |
| סבבים | ≤3 קריאות מודל לשאלה | |
| cache לתוצאות כלים | 10 דקות לכלים כבדים (Firestore) | `home-today` קורא את כל `users` (`home-today/route.ts:69-71`) |

### 2.7 אחסון שיחות

- `admin_ai_threads/{uid}` + `messages/{id}`, Admin SDK בלבד, TTL של 90 יום (כמו קלי — `firestore.rules:1245-1251`).
- ה-catch-all הוא `allow read, write: if isRootAdmin()` (`firestore.rules:3485-3487`), ולכן כל אוסף חדש מקבל בלוק מפורש `allow read, write: if false;` (axiom §30). `firebase deploy --only firestore:rules --dry-run` רץ לפני הוראת פריסה, והפריסה מ-`main` על ידי דוד.

---

## 3. מפת הפאנל + ניווט מקומי (בלי מודל)

### 3.1 מקורות לכל עמוד

| שדה | מקור |
|---|---|
| `path` | `src/app/admin/**/page.tsx` (140; 17 עם `[param]`) |
| `title` | תווית סיידבר → `<h1>` ראשון (קיים ב-116/140) → שם תיקייה |
| `section` | `SECTION_PATHS`/`HIGHLIGHT_ONLY` — `adminSections.ts:25-57` |
| `description` | JSDoc בראש הקובץ (למשל `src/app/admin/page.tsx:11`) |
| `roles` | מחושב: `decideAdminGateAction` (`middleware.ts:357-387`) לכל scope; `isPathAllowed` (`adminSections.ts:88`) ל-platform members |
| `params` | לעמודים דינמיים — שם הפרמטר + כלי ה-lookup (`find_authority` וכו') |
| `synonyms` | קובץ overrides אופציונלי |

אין `export const metadata` בעמודי אדמין (139/140 הם `'use client'`).

### 3.2 יצירה ועדכניות

- צעד מקדים (גל 2): חילוץ קישורי הסיידבר הראשי (`layout.tsx:1108-1345`) ל-`adminNavItems.ts`, בלי שינוי נראה.
- `scripts/gen-admin-page-map.mjs` → `src/generated/admin-page-map.json` (שמור, ממוין, דטרמיניסטי).
- טסט vitest ב-`unit-tests`: מריץ את הגנרטור בזיכרון ומשווה לקובץ השמור. עמוד חדש בלי הרצת הגנרטור → CI אדום. טסט נוסף: כל `href` בסיידבר קיים כעמוד.

### 3.3 ניווט מקומי — האלגוריתם

1. הקלט מנורמל (`normalizeHe`), מילות שאלה מוסרות ("איפה", "איך מגיעים ל", "תפתח").
2. ניקוד fuzzy (התאמת מילים/תחיליות + מרחק עריכה קצר) מול title, synonyms, section ו-description, **רק על עמודים שהתפקיד הנוכחי רשאי לראות**.
3. **הכרעה:**
   - תוצאה עליונה עם ציון ≥ 0.75 ופער ≥ 0.15 מהשנייה → כפתור אחד, מיידי.
   - 2-3 תוצאות סבירות → "התכוונת ל…" עם 3 כפתורים, עדיין בלי מודל.
   - כלום, או שהשאלה היא על נתונים ("כמה", "למה", "מה המצב") → שרת.
4. בשרת, כשהסוג לא ברור: router של Haiku (≤300 טוקנים קלט, תשובה של מילה אחת) → ניווט (עם `find_admin_page`) / תשובה מהירה / Sonnet.

ספי הציון מכוילים בגל 2 מול 40 שאלות ניווט אמיתיות. היעד: ≥85% נענות מקומית.

### 3.4 כלי ניווט למודל

| כלי | אכיפה |
|---|---|
| `find_admin_page(query)` | אותו חיפוש, רק עמודים מותרים, עד 5 תוצאות |
| `navigate(pageId, params?, query?)` | `pageId` חייב להיות במפה; `params` עוברים ולידציה + `encodeURIComponent`; ה-href נבנה בשרת ומתחיל ב-`/admin/` |

ה-UI **לא** הופך URL-ים בטקסט החופשי של המודל לקישורים. קישור לחיץ מגיע רק מאירוע `link`.

---

## 4. כלי נתוני פאנל — קריאה בלבד

**עקרונות:**
- אין "הרץ שאילתה".
- כל כלי מקבל `ctx = {uid, role, scope}` מ-`resolveAdminAnalyticsScope` (`adminAnalyticsScope.ts:50`), לעולם לא מהמודל.
- כשל → `null` + סיבה, לא 0 (`home-today/route.ts:3-5`; axiom §25).
- תוצאה ≤ 800 טוקנים, עם מעטפת `meta` (5.3).

| כלי | מקור | הערות |
|---|---|---|
| `get_attention_queue` | ספירות `home-today/route.ts:102-122` (לחלץ לפונקציה) | גם "תשובה מהירה" |
| `get_pending_approvals` | היום נקרא מהדפדפן ב-`approval-center/page.tsx:269` (מסלולים), `:294` (טיפוסים), `:319` (יחידות), `:353` (תרומות), `:369` (מתקנים) + `computeAccuracyQueue` (`src/lib/route-decisions/compute-queue.ts:46`). **פונקציית ספירה שרתית חדשה** | ספירות + top-5 ערים; תשובה מהירה |
| `get_city_mapping_readiness` | `readCityInventory` (`city-mapping/inventory/route.ts:5-10`) + `computeReadiness` (`src/lib/city-inventory/readiness.ts:78`) | |
| `get_crm_pipeline` | `authorities.status` (`src/types/admin-types.ts:15`), `URGENT_PIPELINE_STATUSES` (`:271`) | קריאה בלבד; לעולם לא `isActiveClient` (axiom §6); תשובה מהירה |
| `find_authority` | `authorities` לפי שם | מזין את `navigate` |
| `get_ai_costs` | `ai_usage_global` (`anthropic.server.ts:93-94`), `src/lib/costs/costs-store.server.ts:22-36` | תשובה מהירה |
| `get_signup_failures` | `computeSignupFailuresList` (`signup-failures/route.ts:36`) | ספירות לפי סיבה בלבד |
| `get_agents_status` | `computeAgentsOverview` (`src/lib/agentsPanelServer.ts:174`) | |
| `search_docs` / `read_doc_section` | אינדקס מסמכים (4.1) | ≤800 טוקנים לתוצאה |

### 4.1 שליפת מסמכים

- 123 קבצי `docs/**/*.md` בלי `docs/archive/` (שמסומן "לא משקף את הקוד" ב-`docs/README.md`), + `CLAUDE.md`, `SECURITY.md`, `.claude/rules/*.md`. לא `.claude/knowledge/`.
- `scripts/gen-docs-index.mjs` → `src/generated/docs-index.json`, חיתוך לפי כותרות, עם `path:line`. אותה בדיקת עדכניות. לא נוגעים ב-`next.config.mjs`.
- תשובה ממסמך מצטטת `path:line` ואומרת "לפי המסמך". מסמך שאומר שמשהו נעשה אינו הוכחה שזה בקוד (CLAUDE.md, Workflow).

---

## 5. יועץ מוצר וסטארטאפ — אנליטיקה, הגדרות וראיות

המטרה: לענות על "איפה אנחנו מאבדים משתמשים, למה, ומה לעשות" עם מסקנה, המלצה **והמספרים שמאחוריהן**. העוזר לא ממציא מדדים: כל מספר מגיע מכלי, וכל כלי מבוסס על הגדרה אחת במילון מדדים משותף.

### 5.1 מילון מדדים (מקור אחד)

`src/lib/admin-analytics/metric-defs.ts` — לכל מדד: `id`, שם עברי, נוסחה, מכנה, חלון, `minSample`, מקור. המילון (~0.8K טוקנים) נכנס לקידומת ה-cached, כדי שהמודל יוכל לצטט `definitionId`. ההגדרות כאן מאמצות את הקיימות:

| `id` | הגדרה | מקור |
|---|---|---|
| `real_workout` | `isRealWorkoutCompletion`: recovery לא נחשב; כוח רק עם `setsCompleted ≥ 1`; ריצה/הליכה/היברידי — עצם קיום המסמך | `workout-completion-kpi.ts:55-66`. **מגבלה ידועה:** כוח של חימום בלבד עדיין נחשב (`kpi-definitions.md:25-34`) |
| `real_user` | לא חשבון בדיקה/דמו | `testAccountFilter.ts:62` |
| `activated` | ≥1 `real_workout` (בכל זמן) | `kpi-definitions.md:9-15` |
| `activated_7d` | ≥1 `real_workout` תוך 7 ימים מההרשמה | `journey-sources/route.ts:1-15` |
| `retained_lifetime` | ≥3 `real_workout` | `kpi-definitions.md:17` |
| `wae` | משתמשים ייחודיים עם ≥1 אימון ב-7 הימים האחרונים | `growth-metrics/route.ts` (כותרת, "northStar") |
| `stickiness` | DAU ÷ MAU × 100 (MAU = איחוד ייחודי של 30 יום) | שם |
| `cohort_dN` | מקוהורטת הרשמה שבועית: % הפעילים ביום N (0/1/3/7/14/30) ±1 יום; קוהורטה < 50 → "אין מספיק נתונים"; יום N לא נמדד לפני שהקוהורטה בת N+1 ימים | `retention-depth/route.ts:55-67`, `:193-262` |
| `resurrected` | פעיל ב-30 הימים האחרונים אחרי 30 ימי אפס מלאים | `retention-depth/route.ts:64-67` |
| `retained_14_28` | ≥1 `real_workout` בין יום 14 ליום 28 מההרשמה | `journey-retention-drivers.ts:1-15` (`RETAIN_FROM/TO`, `MIN_SAMPLE=30`) |
| `onboarding_stall` | **צילום מצב:** נרשמים בטווח שעדיין באמצע האונבורדינג, לפי `users.onboardingStep` הנוכחי | `journey-activation.ts:2-9`, שלבים `:14-30` |
| `first_workout_road` | מתוך הנרשמים: כמה הגיעו לכל אירוע תוך 7 ימים (`recommendation_shown` → `workout_detail_viewed` → `workout_start_pressed` → `workout_session_started` → `workout_complete`) | `journey-activation.ts:33-39` |
| `push_delivered/opened/acted` | משפך מדורג: delivered/sent, opened/delivered, acted/opened. acted = `post_push_outcome.goalCompleted` בחלון שמעוגן לפתיחה | `push-performance-summary/route.ts` (כותרת) |
| `push_started_workout` | sent→delivered→opened→התחיל אימון | `push-funnel-summary/route.ts` (כותרת) |

### 5.2 הכלים

**א. על חישובים קיימים** (מועברים ל-`src/lib/admin-analytics/` בלי שינוי התנהגות):

| כלי | עונה על | פונקציה קיימת | פילוחים |
|---|---|---|---|
| `get_north_star` | WAE, אימונים למשתמש פעיל, DAU/MAU, מגמת 30 יום | `computeGrowthMetrics` (`growth-metrics/route.ts:252`) | עיר, קמפיין, מקור, מין, גיל, רמה, תוכנית — כבר נתמך (`growth-metrics/route.ts:127-156`, `:181-241`) |
| `get_retention_cohorts` | עקומות קוהורטה, D7, resurrected | `computeRetentionDepth` (`retention-depth/route.ts:124`) | **אין פילוח** (בכוונה — הערת הכותרת, `:19-23`) → ראו `get_retention_by_segment` |
| `get_retention_drivers` | אילו התנהגויות בשבוע הראשון מתואמות עם הישארות | `computeRetentionDrivers` (`journey-retention-drivers/route.ts:50`) | — (מתאם, לא סיבתיות — `journey-retention-drivers.ts:8-10`) |
| `get_onboarding_stall` | איפה האונבורדינג נתקע + הדרך לאימון הראשון | `computeJourneyActivation` (`journey-activation/route.ts:49`) | — |
| `get_acquisition_sources` | מקורות הגעה ו-`activated_7d` לפי מקור | `computeJourneySources` (`journey-sources/route.ts:60`) | מקור/קמפיין |
| `get_push_performance` | איזה סוג ואיזה נוסח פוש עובד | `computePushPerformanceSummary` (`push-performance-summary/route.ts:118`) | קטגוריה × וריאנט, ערוץ, טווח תאריכים |
| `get_push_funnel` | פוש → אימון | `computePushFunnelSummary` (`push-funnel-summary/route.ts:52`) | קטגוריה |
| `get_commitment_usage` | תזכורות, לו"ז עם שעה, אימונים מתוכננים, צ'ק-אין קבוצתי | `computeCommitmentSurfacesSummary` (`commitment-surfaces-summary/route.ts:35`) | — |
| `get_city_insights` | שכונות "רדומות", פערי ציוד | `computeInsightsSummary` (`insights-summary/route.ts:71`) | עיר |

**ב. פונקציות אגרגציה חדשות** (טהורות, עם טסט יחידה, מעל אותן קריאות):

| כלי חדש | מדד | הגדרה מדויקת | הערות ופערי נתונים |
|---|---|---|---|
| `get_retention_by_segment(segment, cohortWeeks≤12)` | `cohort_d7`, `cohort_d30` לכל ערך פילוח | אותה הגדרה כמו `retention-depth` (חילוץ ה-helpers המשותפים, לא העתקה). פילוח: `city` = `core.authorityId`; `persona` = `personas[]` (`src/features/user/core/types/user.types.ts:502-507` — **רב-ערכי**: משתמש נספר בכל פרסונה שלו, והתשובה אומרת זאת); `source`; `program` | תא < 50 → `belowThreshold`. top-8 ערכים + "אחר" |
| `get_onboarding_stall_by_segment(segment)` | התפלגות `onboarding_stall` | כמו `journey-activation`, לפי עיר/פרסונה/מקור | **פער נתונים:** אין משפך שלבים מלא מבוסס אירועים. `Analytics.logOnboardingStepComplete` (`src/features/analytics/AnalyticsService.ts:477-478`, אירוע `onboarding_step_completed`) נקרא רק בשני שלבים מתוך 15 — `SCHEDULE` (למשל `src/features/user/onboarding/components/steps/ScheduleStep.tsx:473`) ו-`HISTORY` (`steps/HistoryStep.tsx:146`). לכן "נטישה לפי שלב" = **צילום מצב** של איפה אנשים עומדים עכשיו (בתוספת שני השלבים האלה כמעברים אמיתיים), לא שיעור נטישה בין כל השלבים, והתשובה חייבת לומר זאת. לפני שבונים — לוודא מי כותב את `onboardingStep` (axiom §29) |
| `get_activation_gaps(segment)` | `activated_7d` %, זמן חציוני להפעלה, `first_workout_road` לפי פילוח | מכנה: `real_user` שנרשמו בטווח ושעברו עליהם ≥7 ימים | |
| `get_push_timing(category?)` | open rate ו-acted rate לפי שעת שליחה (שעון ישראל, 6 חלונות) ויום בשבוע | מעל `push_events` (`sentAt`, `openedAt`, `category`, `variantId`, `channel` — `functions/src/services/push-events.service.ts:120-140`). open = opened/delivered; acted = acted/opened | **פערים:** רק 5 מתוך 15 סוגי פוש נמדדים (`push-funnel-summary/route.ts`, כותרת; `push-performance-summary/route.ts`, כותרת). את השאר מחזירים כ-`null` = "לא נמדד", לא 0. **"חזרה לאפליקציה" בלי הקשה לא ניתנת למדידה היום** — `app_open`/`session_start` הוסרו מהטקסונומיה (`AnalyticsService.ts:14-30`). לכן "חזרה" = פתיחה מפוש (opened) או פעולה (acted) בלבד |
| `get_feature_adoption(period=30d)` | % אימוץ לכל פיצ'ר | מונה: משתמשים ייחודיים (`real_user`) שהשתמשו בפיצ'ר בתקופה; **מכנה: MAU** (משתמשים עם ≥1 `real_workout` ב-30 יום). פיצ'רים ראשונים: סוג אימון (כוח/ריצה/הליכה/היברידי — `workoutType`/`activityType`, `workout-completion-kpi.ts:57`), תזכורות ולו"ז (מקורות `commitment-surfaces`), קבוצות (`social.groupIds`), צ'אט קלי (`ai_usage.byFeature`, `anthropic.server.ts:204`) | כל פיצ'ר נכנס לרשימה רק אחרי שאימתנו שיש קוד חי שכותב את השדה שהוא קורא (axiom §29) |
| `get_city_usage_gaps(top=10)` | לכל רשות: משתמשים רשומים, WAE, `activated_7d`, D7, ופער מהחציון של כל הערים | אגרגציה לפי `core.authorityId`; רק ערים עם ≥50 משתמשים רשומים מדורגות | שדה האוכלוסייה ב-`authorities` חסר בחלק מהרשויות — מדד "חדירה לאוכלוסייה" מוצג רק כשהשדה קיים, ואחרת `null` |

### 5.3 פורמט "הראה את הראיות" (חובה)

**מעטפת כל תוצאת כלי** (נאכפת בטיפוס, לא בבקשה מהמודל):
```
{ value…, meta: { definitionId, period: {from, to, tz:'Asia/Jerusalem'},
                  n, minSample, belowThreshold, measuredSources?, caveats: [] } }
```

**מבנה תשובה ב-system prompt:**
1. **שורה תחתונה** — משפט אחד.
2. **הראיות** — לכל טענה: מספר + `definitionId` + תקופה + `n`. השוואה מוצגת כשני המספרים + ההפרש בנקודות אחוז, לא רק "גבוה יותר".
3. **הסתייגויות** — כל `caveats` מהכלים (צילום מצב ולא משפך; מתאם ולא סיבה; "לא נמדד"; כוח-חימום נחשב).
4. **המלצה** — 1-3 צעדים, לכל אחד רמת ביטחון (גבוהה/בינונית/נמוכה) ו"מה יאשר את זה" (מדד, יעד ותאריך לבדיקה).

**כללים:**
- `belowThreshold: true` → "מדגם קטן (n=…) — לא להסיק". אין המלצה שנשענת רק עליו.
- אסור מספר שלא הופיע בתוצאת כלי בתור הזה. **guard ראיות** (תקדים: `reply-guards.ts:1-12`) בודק שכל מספר/אחוז בתשובה מופיע ב-evidence של התור. אם לא — התשובה מסומנת "לא אומת" (לא נחסמת), ונרשמת ב-audit.
- ה-UI מציג את הראיות ככרטיס מתקפל מתחת לתשובה (אירוע `evidence`).

**דוגמה:** "למה ה-D7 ירד?" → `get_retention_cohorts` + `get_retention_by_segment('city')` → "D7 של קוהורטות ספטמבר: 18% (n=412) מול 24% באוגוסט (n=388), ‎-6 נק'. הירידה מרוכזת בשדרות: 9% (n=61) מול חציון 22%. … המלצה (ביטחון בינוני): …; לאשר לפי D7 של קוהורטת 03.11, n≥50."

---

## 6. אבטחה

### 6.1 מי יכול להשתמש (v1)
- **super admin או root, ורק אדם.**
  - לא `requireSuperAdminApi` — הוא מקבל גם agent key (`api-auth.ts:211-212`).
  - לא `requireAdminApi`/`requireSection` — רחבים מדי (`api-auth.ts:16-49`, `:136-140`).
  - התבנית היא `requireKellyTeamAdmin` (`api-auth.ts:237-262`). השער החדש `requireAdminAiCaller` מחזיר `{uid, email, role}`.
- גם נקודות ה-`quick/<metric>` עוברות את אותו שער (בלי תקציב AI).
- דגל ייעודי `admin_ai_assistant_v1`, `defaultValue: false`. לא שימוש חוזר בדגל קיים (axiom §32). השער ב-route ובכל כלי, לא בהסתרת הכפתור (axiom §26).

### 6.2 כל כלי בודק מחדש
zod על הקלט (`tools.ts:356-369`); `ctx.role` מול דרישת הכלי; scope מ-`ctx` בלבד; שם לא מוכר → לא מבוצע (`server-tools.server.ts:347-350`). טסט לכל כלי: תפקיד לא מורשה → שגיאה, אפס קריאות Firestore. לא נשענים על claim `tenantId` (axiom §29; `SECURITY.md:56-59`).

### 6.3 Prompt injection
נתונים מ-Firestore ומ-`docs/` הם נתונים, לא הוראות, ועטופים ב-`<tool_data>`. אין כלי כתיבה. קישורים רק מ-`navigate`. כלי v1 לא מחזירים טקסט חופשי שמשתמשים כתבו — רק ספירות וקטגוריות.

### 6.4 בלי כתיבה ב-v1
פעולות עתידיות רק ככרטיס הצעה שמאשרים בלחיצה, דרך ה-API הקיים של אותה פעולה (תקדים: `tools.ts:296-334`).

### 6.5 Audit
`admin_ai_audit/{id}`: uid, שאלה (≤500 תווים), מסלול (`local`/`quick`/`model`), כלים + קלט + גודל תוצאה, מודל, usage, עלות, האם guard הראיות נכשל, 👍/👎, `expireAt` 180 יום. Admin SDK, כללים `if false`. לא `audit_logs` (Callable עם allowlist — `SECURITY.md:430-441`). ניווט מקומי נספר רק כמונה יומי, בלי טקסט השאלה.

### 6.6 PII
אגרגטים בלבד. בלי אימייל, טלפון, תאריך לידה, מיקום מדויק או בריאות (`SECURITY.md:588-600`). לוגים — מטא-דאטה בלבד (`SECURITY.md:575-586`). פילוחים עם n<5 מוצגים "פחות מ-5".

---

## 7. גרסת הרשויות (בהמשך — שלב נפרד)

- **scope מהסשן בלבד:** `resolveAdminAnalyticsScope` → `{kind:'authority', authorityId}` (`adminAnalyticsScope.ts:74-77`) או `resolveUnitPermissionScope` (`src/lib/unitPermissionScope.ts:355`). ארגומנט של המודל יכול רק לצמצם בתוך הרשות, ונבדק בשרת. טסט: `authorityId` זר → נדחה.
- axioms: §25 (Admin SDK, לא שאילתות דפדפן), §26 (שער בכל כלי), §32 (הרשאה ייעודית חדשה `authorities/{id}.aiInsightsEnabled`, לא `isActiveClient` — axiom §6 — ולא `isTenantOwner`/`isVerticalAdmin`).
- `resolveAdminAnalyticsScope` לוקח את הרשות הראשונה בלבד (`limit(1)`, `adminAnalyticsScope.ts:74`) — לסגור לפני הפתיחה.
- **כלים:** עטיפות מעל `src/app/api/authority-manager/{city-summary, dashboard-summary, city-week, city-aggregates, parks-activity, neighborhood-breakdown, who-compliance-summary, health-savings-summary}`, עם אותו פורמט ראיות.
- **מסקנות:** מגמות, שעות ופארקים עמוסים או ריקים, פערים בין שכונות, WHO, חיסכון בריאותי, retention. benchmark אנונימי מ-≥5 רשויות בלבד; פלחים קטנים מ-5 מוסתרים.
- **תקציב:** workspace `municipal` + תקרה לכל רשות; Haiku/Sonnet לפי המדידה; ניווט מקומי גם שם.

---

## 8. עלות — חישוב מחדש לפי `ai-pricing.ts`

**מחירים מהקוד (USD ל-1M טוקנים):** Sonnet 5.5 — 2 / 10 / 0.20 (קריאה) / 2.5 (כתיבה) (`ai-pricing.ts:46-51`); Haiku 5.5 — 0.10 / 0.50 / 0.01 / 0.125 (`:39-45`).
**חסרים בטבלה:** `claude-opus-5-5` (4 / 20 / 0.20 / 5) וכל מודל אחר. מודל חסר מתומחר כ-Sonnet (`:59-61`), ולכן ה-tier `admin` מסרב למודל לא מתומחר (2.3).

**הנחות לכל קריאה ב-Sonnet:**
- קידומת 4.5K: קריאה = $0.0009, כתיבה (שיחה קרה) = $0.011.
- thinking ב-`medium` נספר כפלט, בתוך תקרות ה-`max_tokens`.

| מסלול | קריאות | פירוט | עלות לשאלה |
|---|---|---|---|
| ניווט מקומי | 0 | — | **$0** |
| תשובה מהירה (chip) | 0 | Firestore בלבד | **$0** |
| router Haiku (כשלא ברור) | 1 Haiku | ~300 קלט, ~5 פלט | ~$0.00003 |
| ניווט עמום → Sonnet | 2 | ~1.2K קלט חדש, ~350 פלט | ~$0.007 |
| נתון בודד | 2 | קריאה 1: 1.2K קלט + 250 פלט; קריאה 2: 650 קלט + 400 פלט | ~$0.012 |
| ניתוח (2 סבבי כלים) | 3 | ~3.5K קלט חדש (תוצאות ≤800×2), ~1.4K פלט כולל thinking | ~$0.03 |
| תוספת לשיחה קרה (פעם ב-session) | — | כתיבת 4.5K | +$0.010 |
| סיכום היסטוריה (Haiku, כל ~4 תורות) | 1 Haiku | ~2K קלט, 150 פלט | ~$0.0003 |

**20 שאלות ביום, תמהיל ריאליסטי:** 8 ניווט (7 מקומי, 1 עמום) · 4 נתון שנענה ב-chip · 3 נתון דרך המודל · 5 ניתוח · 4 sessions.

| רכיב | חישוב | ליום |
|---|---|---|
| ניווט | 7×$0 + 1×$0.007 | $0.007 |
| נתון (chip) | 4×$0 | $0 |
| נתון (מודל) | 3×$0.012 | $0.036 |
| ניתוח | 5×$0.03 | $0.150 |
| שיחות קרות | 4×$0.010 | $0.040 |
| Haiku (router + סיכומים) | ~10 קריאות | ~$0.003 |
| **סה"כ** | | **≈ $0.24 ליום** |

**לחודש:** כ-**$5** ב-22 ימי עבודה, כ-**$7** ב-30 יום. תקרה יומית מוצעת $0.50 (פי 2 מהממוצע, מאפשרת יום ניתוח כבד); תקרת workspace $10 — Console חוסם פריצה גם אם כל ההגנות בקוד כשלו.

**להשוואה:** אותו תמהיל ב-Opus 5.5 ≈ פי 2 (~$0.50 ליום, ~$12-15 לחודש). אם כל שאלה הייתה עוברת במודל, עם המפה בקידומת וללא תקרות — ~$1-1.5 ליום. **החיסכון העיקרי מגיע מהניווט המקומי, מה-chips ומהקידומת הרזה**, לא מהמודל.

**Firestore:** כלים כבדים (קוראים את כל `users`) עם cache של 10 דקות. chips משתמשים ב-`count()` היכן שאפשר.

---

## 9. UI

- כפתור "שאל את OUT" בכותרת + `Ctrl/⌘+K`. המגירה נטענת ב-`layout.tsx` (סביב `<main>`, `:1437`), ולכן נשארת פתוחה בזמן ניווט.
- RTL: הסיידבר מימין, המגירה משמאל. דסקטופ: פאנל עגון 400px. מובייל (<768px): מסך מלא. Zustand (`useAdminAssistantStore`), אין Context חדש (axiom 7).
- **שדה החיפוש הוא גם הניווט:** תוצאות מקומיות מופיעות **תוך כדי הקלדה** (כמו command palette). Enter על שאלה שאינה ניווט שולח לשרת. מתחת לשדה: 6 chips של "תשובה מהירה" (ממתינים לאישור, עלות AI היום, צנרת CRM, WAE השבוע, כשלי הרשמה השבוע, ערים במיפוי).
- תשובת מודל: markdown קל, כפתורי ניווט, כרטיס ראיות מתקפל, תג "לא אומת" כשה-guard נכשל, עלות התשובה בקטן, 👍/👎.
- **z-index:** טבלת `.cursorrules` היא למפת האפליקציה (`.cursorrules:31`), ולפאנל אין טבלה. הערכים בפועל: `.mobileBar` 40 (`admin-shell.module.css:252-255`), `.sidebar` במובייל 60 (`:289-293`), `.scrim` 55 (`:325-328`), מודאלים `z-[80]/[81]` (`src/app/admin/finance/expenses/page.tsx:190-191`), roadmap `z-[9999]` (`src/app/admin/roadmap/components/TagManager.tsx:111`). **הצעה:** המגירה ב-`z-[70]`, ובאותו PR תת-טבלה "Admin panel" ב-`.cursorrules` (axiom §8). אימות במדידה.

---

## 10. גלים (PR-ים קטנים)

הכל מאחורי `admin_ai_assistant_v1` (false). ענף מ-`origin/main`, PR רגיל, בלי מיזוג ללא אישור דוד.

| גל | תוכן | בדיקות קבלה |
|---|---|---|
| **0** | המסמך הזה | דוד עונה על סעיף 11 |
| **1 — תשתית** | tier `admin` (Sonnet 5.5) + גארד מודל-לא-מתומחר; `getAnthropicClient('admin')`; `adminAiBudgetUsd` ($0.50) + תקרה לשאלה; דגל; `requireAdminAiCaller`; עדכון `SECURITY.md` §7 | טסטים: מודל לא מתומחר → 503; מפתח חסר → 503; agent key → 401; לא-super → 403; תקציב admin מוצה → 503; תקרה לשאלה עוצרת סבב נוסף |
| **2 — מפה + ניווט מקומי** | `adminNavItems.ts`; גנרטור + JSON + טסט עדכניות; fuzzy בדפדפן; מגירה עם ניווט בלבד — **אפס קריאות מודל** | ≥85% מתוך 40 שאלות ניווט אמיתיות נענות מקומית ונכון; זמן תגובה < 50ms; עמוד לא מורשה לא מוצג; הסיידבר זהה לפני ואחרי |
| **3 — chips + צ'אט** | נקודות `quick/<metric>` (6 chips); route SSE; Haiku router; היסטוריה מתגלגלת; audit; בלוקי כללים + dry-run; כלי ניווט + `get_attention_queue`, `get_pending_approvals`, `get_crm_pipeline`, `get_ai_costs` | המספרים ב-chips זהים לעמודים המקבילים; `cache_read_input_tokens > 0` מהקריאה השנייה; עלות ממוצעת לשאלת נתון ≤ $0.015; שורת audit לכל מסלול |
| **4 — יועץ מוצר, מנה 1** | `metric-defs.ts`; מעטפת `meta`; guard ראיות; `get_north_star`, `get_retention_cohorts`, `get_retention_drivers`, `get_onboarding_stall`, `get_push_performance`, `get_push_funnel` (העברה ל-`src/lib/admin-analytics/`) | לכל כלי: מספר זהה לעמוד `/admin/journey` / `/admin/statistics` באותו רגע; תאים מתחת לסף מסומנים; guard תופס מספר מומצא בטסט |
| **5 — יועץ מוצר, מנה 2 (חדשים)** | `get_retention_by_segment`, `get_onboarding_stall_by_segment`, `get_activation_gaps`, `get_push_timing`, `get_feature_adoption`, `get_city_usage_gaps` — פונקציות טהורות + טסטים | לכל פונקציה: טסט על dataset קטן עם תשובה ידועה; אימות writers לכל שדה (axiom §29) מתועד ב-PR; ספירת n תואמת |
| **6 — מסמכים + איכות** | אינדקס מסמכים; סט eval של 25 שאלות (ניווט, נתון, ניתוח, injection); מדידת `between_tools` מול `medium` | ≥90% נכון; 0 מספרים לא מאומתים שעוברים בלי סימון; עלות חודשית מוערכת ≤ $10 |
| **7 — רשויות (תוכנית נפרדת)** | סעיף 7 | `authorityId` זר → נדחה; benchmark אנונימי |

---

## 11. שאלות פתוחות לדוד — עם המלצה לכל אחת

**נסגרו במשוב 22.10:** מודל (Sonnet 5.5, `medium`); יעד עלות (כמה דולרים בחודש — תקרות $0.50 ליום / $10 ל-workspace).

1. **מי מקבל גישה ב-v1:** רק david@/office@, או כל super admin? **המלצה:** root + super admins, אחרי שבודקים מי מסומן `isSuperAdmin`.
2. **שמירת שיחות:** 90 יום לשיחות, 180 ל-audit? **המלצה:** כן.
3. **פרטיות בין מנהלים:** **המלצה:** כל אחד רואה רק את שלו; audit ל-root בלבד.
4. **חיפוש משתמש ספציפי ב-v1?** **המלצה:** לא — אגרגטים בלבד.
5. **היקף אינדקס המסמכים:** **המלצה:** `docs/**` (בלי archive) + `CLAUDE.md` + `SECURITY.md` + `.claude/rules`.
6. **פעולות כתיבה בעתיד?** **המלצה:** לא לפני חודש של v1, ואז רק ככרטיס הצעה.
7. **רפקטור הסיידבר לנתונים (גל 2)?** **המלצה:** כן.
8. **6 ה-chips הראשונים** — הרשימה בסעיף 9 נכונה? **המלצה:** כן; אחרי חודש מחליפים לפי מה שנשאל בפועל (מה-audit).
9. **אירוע `onboarding_step_completed`:** להוסיף קריאה ל-`logOnboardingStepComplete` גם ב-13 השלבים שעוד חסרים, כדי שתהיה נטישה **בין שלבים** ולא רק צילום מצב? **המלצה:** כן, כמשימה נפרדת (שינוי באפליקציה, לא בפאנל). עד אז העוזר אומר במפורש "צילום מצב".
10. **מדידת "חזרה לאפליקציה" בלי הקשה על פוש** (`app_open`/`session_start` הוסרו)? **המלצה:** לא עכשיו. מסתפקים ב-opened/acted, ומחזירים אירוע session רק אם שאלת התזמון תדרוש זאת.
11. **מדידת 10 סוגי הפוש שלא נמדדים** — להרחיב את `measurement`? **המלצה:** כן, בהדרגה. עד אז הם "לא נמדד", לא 0.
12. **מכנה לאימוץ פיצ'רים:** MAU (מי שהתאמן ב-30 יום) או כל הרשומים? **המלצה:** MAU. אחוז מכלל הרשומים מנפח את המכנה במשתמשים מתים.
13. **רשויות:** חבילה בתשלום? מודל? **המלצה:** דגל לכל רשות, Haiku או Sonnet לפי המדידה, benchmark מ-≥5 רשויות.
14. **"טבלת כל הערים"** — `/admin/authorities` או `/admin/city-mapping`? **המלצה:** synonym לשניהם; הניווט המקומי מציג את שני הכפתורים.
