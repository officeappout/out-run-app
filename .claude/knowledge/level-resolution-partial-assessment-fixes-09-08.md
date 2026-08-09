# Level-Resolution — 4 Partial-Assessment Fixes: SHIPPED (09.08.2026)

> **סטטוס:** ✅ shipped, main (`6cf8927c`). **אומת פעמיים, באופן עצמאי:** פעם אחת ע"י 2 Workflow subagents (code-reviewer + adversarial logic review, PASS על שתיהן, אפס ממצאים), פעם שנייה ע"י דוד עצמו — משך את branch `review/4-engine-fixes-09-08`, השווה דיף אמיתי, ואימת ידנית את חשבון ה--Infinity sentinel נגד כל 4 הצרכנים ב-`ContextualEngine.ts` + `compose-hybrid-session.service.ts`.
> **הקשר:** נבנה בעקבות בקשת דוד ("מוכן להעתקה — צ'אט המנוע") עם 4 תיקונים ל-hasStrengthProgram / calibration / level-fallback / master-eligibility, כולם מאומתים מול קוד חי לפני בנייה (Workflow verify-phase נפרד לכל אחד).

---

## 4 התיקונים

1. **`hasStrengthProgram` → `hasAssessedStrengthDomain`** (commit `82c2f624`) — `DiscoverLayer.tsx:557` עבר מ-`activePrograms.length > 0` (ציר ה"נרשם") ל-`hasAssessedStrengthDomain(profile)` (ציר ה"הוערך בפועל") — אותה פונקציה שדף הבית כבר מחשב inline תחת אותו שם. מתקן פער שכבר תועד בהערת `STRENGTH_ASSESSMENT_PROMPT_CARD_V1` ב-feature-flags.ts.

2. **כיול אורך-מסלול לפי פער-צעדים** (commit `f78e1486`) — `deriveAerobicTargetKm` (`hybrid-aerobic.util.ts`) קיבל פרמטר שלישי אופציונלי `stepContext` שמגדיל את היעד עד +30% לפי `Math.min(1, stepsRemaining/stepGoal)` (אותה נוסחה כמו `rank-suggestions.ts`'s `stepDeficit`). מחווט ב-3 מקומות: `route.generator.ts` (אפס plumbing חדש — כבר על `UserContext`), ושני נתיבי ה-compose ב-`start-hybrid-session.ts` (`buildStepContext(useActivityStore.getState().today)`, אותו דפוס כמו `build-map-user-context.ts`). כולל תיקון-לוואי שלא התבקש: `DiscoverLayer.tsx`'s `hybridWarmKey` cache (חם למשך כל חיי הטאב, בלי רכיב-זמן) קיבל bucket גס של פער-הצעדים כדי שתוצאה שחושבה בבוקר לא תוגש שוב בערב אחרי שהפער נסגר.

3. **`UNASSESSED_DOMAIN_LEVEL` sentinel** (commit `cbdfc356`) — הסיכון הגבוה מבין הארבעה. `hybrid-context.util.ts`'s `resolveUserLevelForExercise` ו-`shadow-level.utils.ts`'s `mapMovementGroupToDomainLevel`/`mapIsolationMuscleToDomainLevel` הפסיקו ליפול ל-`baseUserLevel` כשתרגיל שייך לתחום ידוע-אבל-לא-מוערך — מחזירים `UNASSESSED_DOMAIN_LEVEL = -Infinity` (`contextual-engine.types.ts:91`) במקום. נבחר `-Infinity` ולא `undefined`/`NaN` בכוונה: השוואות `NaN` תמיד `false` ב-JS, מה שהיה **מקבל** את התרגיל בלי גבול-רמה בכלל — ההפך מהכוונה. אומת ידנית (פעמיים) נגד כל 4 הצרכנים: `ContextualEngine.ts:164` (מסנן-טווח), `:240` (שער-סקילים), `:552` (ציון — מעולם לא מגיע לשם בפועל כי המסנן הראשון כבר עוצר), ו-`compose-hybrid-session.service.ts:642` (בדיקת-band ל-fallback). זה **בנוסף** לחסימה המלאה הקיימת (`hasAssessedStrengthDomain`/`needsAssessmentDomains`) — לא מחליף אותה; מטפל בתחום-בודד-לא-מוערך בתוך הערכה חלקית, לא בהיעדר-הערכה מוחלט.

4. **`full_body` דורש את כל 4 התחומים** (commit `6cf8927c`) — `WorkoutBuilderSheet.tsx`'s `isMasterEligible()`: הסף הכללי `enrolledChildCount >= 2` נשאר לכל master אחר; `full_body` ספציפית (מזוהה לפי `id`/slug, **לא** לפי ספירת-`children` גולמית) דורש שכל 4 מ-`KNOWN_MASTER_PROGRAMS.full_body` (push/pull/legs/core) יהיו רשומים. סיבת הבחירה ב-id ולא בספירה: מסמך ה-Firestore החי של `full_body` מכיל 5 `subPrograms` (יש רשומת-משנה תועה "upper_body" — אנומליית-נתונים), אז בדיקת-ספירה גולמית הייתה קוד-מת מול הנתונים האמיתיים.

---

## אימות

- TSC: 454 שגיאות (בייסליין, 0 חדשות) — נבדק בנפרד אחרי כל אחד מה-4 התיקונים, ושוב אחרי rebase לפני push.
- Tests: 300/300 assertions אמיתיים (אותם 2 כשלי `process.exit` קיימים-מראש לא-קשורים). כולל test חדש ל-sentinel (`unassessed-domain-level.test.ts`, מאמת את 4 הנוסחאות + control-case שמראה למה `undefined` היה שגוי) ו-7 test חדשים ל-step-gap calibration.
- Review: 2 Workflow subagents (code-reviewer + adversarial) — PASS, אפס ממצאים, על branch `review/4-engine-fixes-09-08`.
- דוד: בדיקה עצמאית שנייה, ידנית, על אותו branch, לפני מיזוג ל-main.
- **טרם בוצע**: בדיקת-מכשיר/דפדפן חיה — אין גישה לדפדפן מהסביבה הזו לאף אחד מה-4 התיקונים.

## Commits (main, אחרי rebase)

- `82c2f624` — fix(map/hybrid-slots): unify hasStrengthProgram to the assessed-domain axis
- `f78e1486` — feat(workout-engine/hybrid): calibrate the aerobic target route length by the live step-gap
- `cbdfc356` — fix(workout-engine): unassessed domain stays absent, not baseUserLevel — sentinel-safe
- `6cf8927c` — feat(home/workout-builder): full_body requires all 4 known leaf domains

## היסטוריה

Review branch (נדחף, לא נמחק): `review/4-engine-fixes-09-08` — https://github.com/officeappout/out-run-app/compare/main...review/4-engine-fixes-09-08
