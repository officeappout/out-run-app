# City Mapping Pipeline — Architecture (source of truth)

**סטטוס:** מאושר על ידי דוד (23.09.2026), **טרם מומש**. זהו המסמך שממנו עובדים מכאן והלאה לכל מה שנוגע למיפוי עיר — אם קיים סתירה בין המסמך הזה לבין תיעוד אחר על city-mapping, **המסמך הזה גובר**.

## מה נבדק לפני שנכתב (למה זה מסמך חדש ולא עדכון של קיים)

חיפשתי בכל docs/, .claude/knowledge/, CLAUDE.md, docs/field-test/. נמצאו 4 מסמכים רלוונטיים, כולם **חלקיים/מיושנים** ביחס למה שבנוי היום בפועל — אף אחד לא התאים ל"עדכן במקום":

1. **`CITY-ORCHESTRATOR-PLAN.md`** — **מצוטט כמקור אמת ב-5 קבצי קוד חיים** (`city-mapping-orchestrator.ts`, `city-mapping-summary.ts`, `city-registrations.ts`, `scripts/write-climb-segments-tlv.ts`, `docs/audit-2026-09/DECISION-INDEX.md`) — **אבל הקובץ עצמו לא קיים בריפו בכלל.** אבד/מעולם לא נשמר בגיט. אין מה לעדכן.
2. **`.claude/knowledge/autonomous-city-mapping-audit.md`** (13.07.2026) — אודיט read-only מצוין, אבל ה-TL;DR שלו ("no orchestrator exists, everything is a human at a terminal") **כבר לא נכון** — נכתב **לפני** ש-`/admin/city-mapping` נבנה (Stage B/C1/C2, קומיטים `f419c36e`/`4f9a3bb2`/`7b9b604c`). ה-Part B שלו (cloud job + LLM QA agent + auto-publish) הוא חזון גדול ורחוק יותר ממה שדוד מבקש עכשיו — **לא מוחלף, נשאר כרקע/שלב עתידי אפשרי**, לא כחלק מהמסמך הזה.
3. **`.claude/knowledge/route-enrichment-pipeline-scoping.md`** (16.08.2026) — אותה בעיה בדיוק: §8 שלו ("Orchestration — CONFIRMED: NONE EXISTS") מצטט את המסמך הקודם ומגיע לאותה מסקנה — **גם היא כבר לא נכונה**, מאותה סיבה. שאר הממצאים שלו (elevation קיים אבל לא נקרא בחזרה, `'moderate'` vs `'medium'` באג, 3 pipelines סותרים ל-stairs) **עדיין נכונים** — לא נמחקים, פשוט לא הבסיס לארכיטקטורה הזו.
4. **`docs/audit-2026-09/DECISION-INDEX.md` §10** — קטלוג סטטוס (לא מסמך ארכיטקטורה), מסמן את עצמו כ-"לא מאומת מול קוד", וממליץ *"דורש `git log -- src/app/admin/city-mapping` לפני שסומכים על השורה הזו"*. **בדקתי בסבב הזה: `/admin/city-mapping` אמיתי, בנוי, 4 קומיטים אמיתיים** (`f419c36e` orchestrator+API, `4f9a3bb2` העמוד עצמו, `7b9b604c` מסך "הוסף עיר", `3938ad59` תיקון 504 בתאורה). מתקן כאן את אי-הוודאות של §10 — לא ערכתי את הקובץ עצמו.

**המסמך הזה הוא הראשון שמתעד את מה שבאמת בנוי היום + קובע את העיקרון קדימה.**

---

## עיקרון (מאושר, נעול)

**`/admin/city-mapping` הוא המקום היחיד שממנו מפעילים מיפוי עיר.** לחיצה אחת = כל התשתית של העיר. שום יכולת מיפוי/העשרה חדשה לא נבנית כסקריפט CLI עצמאי — כל יכולת חדשה נכנסת כ-**שלב** בצינור הקיים. סקריפט מותר אך ורק ככלי פנימי ששלב קורא לו (בדיוק כמו ש-`runCityMapping()` כבר קורא ל-`runOsmImport`/`runBackfillRouteLighting`/`runExtractOsmAmenities`/`runTagRouteAmenities` היום — לא הופך את הסקריפטים לחסרי-תועלת, רק אוסר עליהם להיות ה-*ממשק* היחיד).

כל שלב, בלי יוצא מן הכלל: **dry-run כברירת מחדל, דילוג על מה שכבר מחושב, דיווח מדויק מה נכתב.**

---

## הצינור היום — 7 שלבים אמיתיים (`city-mapping-orchestrator.ts`, מאומת מול קוד חי)

| # | שלב | קובץ מקור | כותב ל-collection |
|---|---|---|---|
| 1 | זיהוי רשות מקומית | `findAuthorityByCityName` | קריאה בלבד |
| 2 | שער מסלולים (ידני בכוונה — גילוי מסלולים נשאר CLI, [LOCKED DECISION מהמסמך האבוד, עדיין בתוקף]) | קריאה בלבד | — |
| 3 | ייבוא קטעי רחוב | `osm-segment-importer.ts`'s `runOsmImport` | `street_segments` |
| 4 | תאורת מסלולים | `route-lighting-street-segments.node.ts` (chunked) | `official_routes.qualitySignals.lighting` |
| 5 | ייבוא מתקנים | `extract-osm-amenities-tlv.ts`'s `runExtractOsmAmenities` | `osm_amenities` |
| 6 | תיוג מסלולים במתקנים | `tag-route-amenities.ts`'s `runTagRouteAmenities` | `official_routes.qualitySignals.amenities` + `nearbyAmenities` |
| 7 | אימות סמיכות (קריאה בלבד) | — | קריאה בלבד |

**הפער שגילינו (למה המסמך הזה נכתב עכשיו):** אין שלב composition, אין שלב גובה. שניהם קיימים כסקריפטים **ברמת מסד-נתונים שלם** (`backfill-route-quality-signals.ts`, `populate-route-elevation-tlv.ts`) — בדיוק הדפוס האסור: יכולת אמיתית שלא נכנסה כשלב.

---

## תוספת מיידית — פריט 1: composition + גובה כשלבים

**למה composition צריך לרוץ *לפני* שלב 6 (תיוג מתקנים), לא רק "איפשהו":** `tag-route-amenities.ts` מדלג על כתיבת `qualitySignals.amenities` לכל מסלול בלי `qualitySignals.composition` קיים (ה-bug שגילינו ב-"מסלול הכלניות בדיקה" — ותיקנו ידנית דרך `enrich-route.ts`). **אם composition נכנס כשלב 3.5 (אחרי street_segments, לפני lighting), הבאג הזה לא יקרה יותר לאף עיר חדשה** — זו לא רק תוספת יכולת, זו סגירת חוב אמיתי.

**Composition (שלב חדש, city-scoped):**
- לחלץ `runComposition(city, apply, db)` מ-`backfill-route-quality-signals.ts` (שכיום רץ על **כל** הערים בבת אחת) — פונקציות טהורות כבר קיימות ומוכנות לשימוש חוזר: `deriveCityBbox`/`fetchCityWayGrid`/`computeCityComposition` (`scripts/lib/route-quality-osm-fetch.node.ts`).
- דילוג: מסלול עם `qualitySignals.composition` קיים כבר — מדלגים, אלא אם `--force`.
- **הערכה: 3-4 שעות** (הלוגיקה כבר מוכחת, זה חילוץ + city-scoping, לא בנייה מאפס).

**גובה (שלב חדש, city-scoped):**
- לחלץ `runElevation(city, apply, db)` — בעצם `populate-route-elevation-tlv.ts` (שכיום נעול ל-TLV) מפורמט מחדש עם `--city=`, באותו הדפוס בדיוק שכבר עשינו ל-`backfill-route-lighting-haifa.ts`. פונקציות טהורות קיימות ומוכנות: `computeDemProfile`/`warmDemTileCache`/`loadCachedTiles`/`boundingBoxWithMargin` (`src/lib/dem-tile-cache/`) — **אותן פונקציות בדיוק ש-`scripts/enrich-route.ts` כבר משתמש בהן למסלול בודד**; השלב הזה הוא בעצם `enrich-route.ts`'s חלק הגובה, בלולאה על כל מסלולי העיר, עם warm-cache אחד ל-bbox של כל העיר (לא per-route) ליעילות.
- דילוג: מסלול עם `elevationGain` קיים — מדלגים.
- **הערכה: 3-4 שעות.**

**חיווט לאורקסטרטור + API routes דקים (אותו דפוס בדיוק כמו lighting/amenities):** 2 API routes (~1 שעה כל אחד) + הוספת 2 ערכים ל-`CityMappingStepName`/`STEP_DEFINITIONS` + מיקום composition לפני lighting ברצף (~2 שעות).

**פאנל הסיכום ("מצב נוכחי בעיר") — 2 סקציות חדשות, אותו דפוס בדיוק כמו כיסוי תאורה שכבר שם:** ~2-3 שעות.

**בדיקה — dry-run + apply אמיתיים על עיר קטנה אחת:** ~2 שעות.

### סה"כ פריט 1: **~15-20 שעות**

---

## פריט 2 — מקום לשלבים עתידיים (שבילי אופניים, הצללה, ומה שיבוא)

לא בונים placeholder ריק — קובעים **את החוזה** ששלב חדש חייב לעמוד בו, כדי שהוספתו תהיה מכנית:

1. פונקציה טהורה `run<Capability>(city, apply, db): Promise<Result>` — לא תלויה ב-Next.js/React, ניתנת לקריאה גם מ-script וגם מ-API route (בדיוק הדפוס של `runTagRouteAmenities`/`runExtractOsmAmenities` היום).
2. API route דק תחת `/api/admin/city-mapping/<capability>` — עוטף את (1) בלבד, אפס לוגיקה משלו.
3. ערך חדש ב-`CityMappingStepName` + שורה ב-`STEP_DEFINITIONS` (עמוד).
4. דילוג-על-כבר-מחושב מובנה בפונקציה עצמה (לא באורקסטרטור).
5. שדה/ים חדשים בפאנל הסיכום — סטטוס + אחוז כיסוי, אותו איור-progress-bar כמו lighting.

**שבילי אופניים (שכבת משרד התחבורה):** מקור נתונים חדש (לא OSM) — צריך מחקר קצר של ה-API/פורמט של משרד התחבורה לפני שאפשר להעריך שעות. לא מוערך כאן.

**הצללה (חופות עצים, מפ"י):** כבר עלה בשיחה קודמת בהקשר אחר (roadmap של amenities) — אין מקור מחשוב היום, האנלוגיה הקרובה ביותר היא אלגוריתם התאורה (`route-lighting-classify.ts`) עם `natural=tree/wood` במקום עמודי תאורה. לא מוערך כאן — שני המקורות (משרד התחבורה, מפ"י) דורשים סקופינג נפרד לפני הערכת שעות אמיתית.

---

## פריט 5 — סטטוס per-step per-city במסך

**מה שכבר קיים:** ספירות (routes/amenities/lighting) — אבל **אין שום מעקב "מתי שלב רץ לאחרונה"** בשום מקום היום. תאריך `computedAt`/`updatedAt` על שדה בודד לא אמין לזה (עשוי להיכתב ממקור אחר, לא בהכרח מריצת השלב המלאה).

**מוצע:** collection חדש `city_mapping_runs/{city}_{step}` — `{city, step, lastRunAt, lastRunBy, applied: boolean, counts}`, נכתב על ידי האורקסטרטור בסוף כל שלב (הצלחה או כישלון). פאנל הסיכום קורא ממנו ישירות במקום לגזור תאריכים מנתונים אחרים. **זו תוספת נפרדת מפריט 1** — לא נכללת בהערכת 15-20 השעות למעלה. הערכה משוערת (לא מפורטת כאן, דורש עיצוב קצר של סכימת ה-doc): ~4-6 שעות.

---

## נתיב אחד לתמונה המלאה

**`/admin/city-mapping`** — פותחים עיר, רואים: 7 השלבים הקיימים + (אחרי מימוש) composition/גובה, כל אחד עם ה-badge סטטוס שלו (running/done/error) מריצה נוכחית, ופאנל "מצב נוכחי בעיר" עם אחוזי כיסוי לכל שכבה. זה המסמך + זה המסך — אין מקור שלישי.
