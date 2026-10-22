# docs/ — אינדקס

מפה קצרה: מה יושב איפה. מסמכי ממשל ל-agents נשארים מחוץ ל-`docs/`: `CLAUDE.md` ו-`SECURITY.md` בשורש, `.claude/rules/` (כולל `axioms.md`), ו-`.cursoragents/` (קבצי האמת של Workout/XP). `.claude/knowledge/` הוא זיכרון עבודה של סוכנים, לא תיעוד.

| תיקייה | מה יש בה | מקור-אמת? |
|---|---|---|
| `architecture/` | `STANDARDS.md` (כללי מבנה קוד), מפרט ההרשאות (`SPEC-PERMISSIONS-MODEL.md`), צינור מיפוי ערים (`CITY-MAPPING-PIPELINE-ARCHITECTURE.md`), attribution שיווקי, מנוע ההמלצות | כן, לנושא שלהם |
| `product/` | `PRODUCT_TECHNICAL_REPORT.md` (תמונת מצב ממאי 2026, חלקית מיושנת), הגדרות KPI, roadmap של אישור מתקנים | תמונת מצב |
| `runbooks/` | QA ובנייה של native (`native-phase-qa.md`), פער ה-package id של Android | נהלים |
| `specs/2026-08/` | ספקים מאוגוסט 2026 (מסכי סיכום, intensity toggle + קרוסלת בית) | היסטורי-למחצה |
| `workout-engine/` | תוכנית, מפה, אודיטים ושינויים של מנוע האימונים (`03-CHANGES.md` = יומן שינויים) | כן, לצד `.cursoragents/Workout_Engine_Truth.md` |
| `audit-2026-09/` | אודיט ספטמבר: `00-MASTER-PLAN.md` (סעיפי §13.x מצוטטים בכל מקום), `DECISION-INDEX.md`, SPEC-01..07 | כן. **לא לשנות שם לתיקייה** — מפנים אליה עשרות פעמים |
| `audit-2026-10/` | אודיט נגישות ואודיטי מסכים מאוקטובר | כן |
| `field-test/` | יומני ניסוי שטח ממוספרים (שדרות ועוד) | היסטורי |
| `research/` | חקירות חד-פעמיות | היסטורי |
| `trails-pilot/` | פיילוט שבילים שער הנגב (`TRAILS-PILOT-SHAAR-HANEGEV.md` + פלטי dry-run) | כן, לפיילוט |
| `i18n/` | תוכנית ו-HOW-TO לתרגום | כן |
| `admin/` | תוכנית עוזר ה-AI בפאנל הניהול (`ADMIN-AI-ASSISTANT-PLAN.md`) | תוכנית לאישור |
| `analytics/` | טקסונומיית אירועים, תוכנית growth analytics | כן |
| `design-v2/` | אודיט עיצוב v2 | תמונת מצב |
| `push-library/` | פלטי סיווג של ספריית ה-push | נתונים |
| `archive/` | `ARCHITECTURE.md`, `PROJECT_STRUCTURE.md`, `ACCOUNT_SECURITY_IMPLEMENTATION.md` (ינואר-פברואר 2026), `cursor-plans/` | **לא**. HISTORICAL, לא משקף את הקוד |

מסמכי תכנון שעדיין יושבים בתוך קוד (מוצמדים מהקוד, לא הועברו ב-MV-01): `src/features/schedule/out-run-schedule-logic-v1.3.md`, `src/features/workout-engine/hybrid/HYBRID_ENGINE_DESIGN.md`.

כלל: מסמך חדש נכנס לתיקיית הנושא שלו, לא לשורש הריפו ולא לשורש `docs/`. מסמך שנוצר או מתעדכן נכנס לגיט (CLAUDE.md, Workflow).
