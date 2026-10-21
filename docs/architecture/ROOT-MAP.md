# מפת השורש: שורש הריפו, `src/`, `docs/` ותוכנית העברה (R1)

> סטטוס: **מסמך בלבד. לא הוזז, לא נמחק ולא שונה שום קובץ קוד.** נכתב 21.10.2026 מתוך `origin/main` @ `0cc2d614`.
> לא הורצה האפליקציה ולא נקראו נתוני פרודקשן. פרוזה בעברית, שמות טכניים באנגלית.
> קשור: [`STANDARDS.md`](./STANDARDS.md) (הכללים), `AUDIT-2026-10.md` + `dead-files.txt` (בענף `docs/architecture-audit`, PR #567: מפת חי/מת),
> `docs/audit-2026-09/03-code-health.md` §2.1 ו-§0 (אודיט ספטמבר, שכבר המליץ על חלק מהצעדים כאן ולא בוצע).
> בקשת בעלים (21.10.2026): **לא מוחקים כלום עכשיו, רק מסמנים.** כל "delete-candidate" כאן הוא סימון, לא הוראה.

---

## 0. בקצרה

| מדד | ערך |
|---|---:|
| קבצים במעקב בשורש הריפו | **34** |
| תיקיות בשורש (כולל dot-folders) | **19** |
| ...מתוכם חייבים להישאר בשורש (כלי build/CI/Firebase/Capacitor/Vercel דורשים) | 19 קבצים + 8 תיקיות |
| ...להעביר ל-`docs/` / `data/` | 5 קבצים |
| ...לארכיון (`docs/archive/`) | 3 קבצים |
| ...delete-candidate (לסמן בלבד) | 1 קובץ + 4 תיקיות (`data/`, `notebooks/`, `temp-data/`, חלק מ-`.cursor/`) |
| תיקיות ברמה הראשונה של `src/` | 18 (+3 קבצי Next שחייבים להיות שם) |
| ...שלא מופיעות ב-STANDARDS ויש לקפל | 9 (`types`, `utils`, `store`, `contexts`, `constants`, `core`, `@core`, `scripts`, `config`) + 2 תיקיות בינאריות (`assets`, `test_video`) |
| קבצים "רופפים" ישירות ב-`src/lib/` | **106** (מתוך 576 ב-`src/lib`) |
| קבצים רופפים ב-`src/components/` (שורש) / `src/components/ui/` (מחוץ ל-v2) | 14 / 25 |
| קבצים בתיקיות-גג משותפות שרק הפאנל / API admin משתמשים בהם | 17 + 2 |
| קבצים בתיקיות-גג משותפות שרק פיצ'ר אחד משתמש בהם | 13 |
| קבצי Markdown בתוך תיקיות קוד (לא README) | 2 |
| PRs של העברה מוצעים | 15 (5 הראשונים ב-§4.3) |

שלוש מסקנות:
1. **השורש כמעט תקין.** רוב מה שיושב בו נדרש שם על ידי כלי (Next, Firebase CLI, Capacitor, Vercel, npm, vitest). הרעש הוא 8 מסמכי Markdown ישנים, קובץ CSV אחד, קובץ פלט אחד ו-4 תיקיות נתונים/ניסוי שאף קוד חי לא קורא.
2. **הבעיה האמיתית היא `src/lib` (106 קבצים רופפים) ו-`src/types`.** אלה תיקיות "כל השאר": קבצי ריצה, דמו, הרשאות, rate-limit ו-feature flags יושבים יחד בלי תת-תיקייה. ב-`src/types` יש 16 קבצים עם 245 קבצים מייבאים, ורובם שייכים לפיצ'ר אחד (`community.types.ts`: 94 מייבאים, 47 מהם ב-`features/arena`).
3. **הסיכון המרכזי הוא התנגשות עם גלי ה-i18n, לא שבירה.** הזזה שמשכתבת שורות import בקבצי פיצ'ר תתנגש עם PRs פעילים של חילוץ טקסט שנוגעים באותם קבצים, ובמיוחד באותו בלוק import (הם מוסיפים `useT`). לכן השיטה המוצעת (§4.1) היא **להעביר את הקובץ ולהשאיר stub ב-path הישן**. כך PR ההעברה לא נוגע באף קובץ מייבא, וסוויפ ה-imports נעשה מאוחר יותר, אזור אחרי אזור, כשהנעילה של אותו אזור משתחררת.

---

## 1. שורש הריפו

שיטה: לכל פריט חיפשתי את שמו בכל הקבצים שבמעקב (`git grep -F`, בלי `package-lock.json` ובלי הקובץ עצמו). אחר כך הפרדתי בין הפניה מקוד/קונפיג להפניה ממסמך בלבד, ובדקתי את הקונפיג שמצביע עליו (`firebase.json`, `capacitor.config.ts`, `tsconfig.json`, `package.json`, `.github/workflows/ci.yml`). "עודכן" = תאריך הקומיט האחרון שנגע בפריט.

מקרא: **keep-tool** = כלי דורש אותו בשורש, אסור להזיז · **keep** = נשאר, מוסכמה · **move** = להעביר (יעד מצוין) · **archive** = `docs/archive/` · **delete-candidate** = לסמן בלבד.

### 1.1 קבצים (34)

| קובץ | מה זה / מי משתמש | ראיה | עודכן | החלטה |
|---|---|---|---|---|
| `package.json`, `package-lock.json` | npm. `package.json` מצביע על `file:./plugins/health-bridge` | npm, Vercel, CI | 21.10 | **keep-tool** |
| `next.config.mjs` | Next.js (webpack cache, אסור לגעת: CLAUDE.md, axioms §13) | Next | 18.10 | **keep-tool** |
| `tsconfig.json` | TS + alias `@/*` ו-`health-bridge` → `plugins/health-bridge/src` | tsc, Next, vitest | 23.04 | **keep-tool** |
| `postcss.config.mjs`, `tailwind.config.ts` | Tailwind/PostCSS (`globals.css`, `MapShell.tsx` מפנים) | Next | 15.10 | **keep-tool** |
| `.eslintrc.json` | ESLint (`ci.yml`: lint advisory) | Next, CI | 12.10 | **keep-tool** |
| `.gitignore`, `.npmrc` (`legacy-peer-deps`) | git / npm | — | 20.10 | **keep-tool** |
| `.env.example` | תבנית משתני סביבה, מוסכמה | — | 19.10 | **keep-tool** |
| `.firebaserc`, `firebase.json` | Firebase CLI. `firebase.json` מצביע על `firestore.rules`, `firestore.indexes.json`, `storage.rules`, `functions/` | Firebase CLI | 17.10 | **keep-tool** |
| `firestore.rules`, `firestore.indexes.json`, `storage.rules` | נטענים דרך `firebase.json` (ו-209 הפניות ל-rules) | Firebase CLI, טסטי emulator | 20.10 | **keep-tool** (וגם פריסה רק מ-main, CLAUDE.md) |
| `capacitor.config.ts` | Capacitor (`webDir: 'capacitor-shell'`, `server.url`) | `npx cap sync`, `scripts/preflight-native-check.mjs` | 19.10 | **keep-tool** |
| `vercel.json` | Vercel: פריסה רק מ-main + cron של `/api/admin/crm-agent/run` | Vercel, `agent-registry.ts` | 17.10 | **keep-tool** |
| `vitest.config.ts`, `vitest.ci.config.ts` | vitest. ה-CI ו-`scripts/ci/run-emulator-suites.sh` מפנים בנתיב | vitest, CI | 21.10 | **keep-tool** (רשימות `include` בתוכו מכילות נתיבים: ראו §4.2) |
| `firebase-audit.json` | קונפיג emulator שני (port 8089) לסוויטות rules/emulator | `scripts/ci/run-emulator-suites.sh:94`, `mutation-check-rules.sh`, 4 טסטים (`--config firebase-audit.json`) | 08.10 | **keep**. אפשר היה להעביר ל-`tests/emulator/`, אבל Firebase CLI פותר את `rules`/`indexes` **יחסית לתיקיית הקונפיג**, כך שהעברה מחייבת לשנות נתיבים בתוכו. הרווח קטן מהסיכון |
| `firebase-storage-audit.json` | קונפיג emulator ל-storage rules (port 8098) | `tests/storage-fix-delete-rules.rules.test.ts` | 11.10 | **keep** (אותה סיבה) |
| `CLAUDE.md` | הוראות לסוכנים. Claude Code קורא אותו מהשורש | כלי | 02.10 | **keep-tool** |
| `.cursorrules` | כללי Cursor + טבלת z-index (axioms §8 מפנה לשורות בו) | Cursor; 71 הפניות | 20.10 | **keep-tool**. הערה: §"Feature folder structure" בו (`{admin\|client\|core}/…`) סותר את `STANDARDS.md` §1. לעדכן כשורה אחת (§5) |
| `README.md` | **boilerplate של create-next-app** ("edit `app/page.tsx`") | — | 29.12.2025 | **keep** + לכתוב מחדש (קצר: מה הריפו, קישור ל-`docs/README.md`, STANDARDS, CLAUDE.md). PR תוכן, לא העברה |
| `SECURITY.md` | מסמך אבטחה פנימי (52KB) | CLAUDE.md (טבלת Reference), axioms §14 (שורות 336-345), `src/lib/firebase.ts:75`, `crm-agent.md` | 13.10 | **keep** בינתיים. ההפניות לשורות ב-axioms הופכות העברה ליקרה. אם יועבר אי-פעם: `docs/security/SECURITY.md` + עדכון 4 המפנים באותו PR |
| `PRODUCT_TECHNICAL_REPORT.md` | דוח מוצר-טכני (מאי 2026) | CLAUDE.md, `.claude/knowledge/product-context.md`, `parking-lot.md` (מציין שהוא מיושן) | 02.05 | **move** → `docs/product/PRODUCT_TECHNICAL_REPORT.md` + עדכון שורה ב-CLAUDE.md |
| `NATIVE_PHASE_QA.md` | runbook לבנייה ול-QA של native | אין הפניות | 13.10 | **move** → `docs/runbooks/native-phase-qa.md` |
| `addendum-intensity-toggle-and-home-carousel.md` | תוספת לספק מאוגוסט 2026 | אין הפניות | 28.08 | **move** → `docs/specs/2026-08/` |
| `spec-summary-screens-display-only-refactor.md` | ספק "מסכי סיכום תצוגה בלבד" | אין הפניות | 28.08 | **move** → `docs/specs/2026-08/` |
| `ARCHITECTURE.md` | דיאגרמה מינואר 2026 (`/run`, `BottomNavigation`, "PWA Ready") | רק `PROJECT_STRUCTURE.md:21`. אודיט 09 §0 ו-MASTER-PLAN #8 קבעו: "מטעה" | 22.01 | **archive** (עם כותרת HISTORICAL) |
| `PROJECT_STRUCTURE.md` | עץ תיקיות מינואר 2026 (מזכיר `next.config.js` שלא קיים) | CLAUDE.md מפנה אליו כ-"File/folder map" | 22.01 | **archive**. ב-CLAUDE.md להחליף את השורה ב-`docs/architecture/ROOT-MAP.md` + `STANDARDS.md` |
| `ACCOUNT_SECURITY_IMPLEMENTATION.md` | סיכום יישום מפברואר ("✅ Implementation Complete") | אין הפניות | 12.02 | **archive** |
| `exercise-inventory.csv` | קטלוג תרגילים (366 שורות) לבנצ'מרק | `scripts/audit/build-exercise-bridge.ts:63`, `build-session-volume.ts:69` (`path.join(REPO_ROOT, …)`), ונקרא דרך `npm run bench:snapshot` | 04.09 | **move** → `data/exercise-inventory.csv` + שינוי שני קבועי `CSV_PATH` (שינוי נתיב בלבד) |
| `firestore_exercises.txt` | **פלט** של `scripts/test-single-upload.js:508` (dump) | נכתב, לא נקרא | 01.06 | **delete-candidate** + `.gitignore` |

### 1.2 תיקיות (19)

| תיקייה | מה זה / מי משתמש | ראיה | החלטה |
|---|---|---|---|
| `.github/` | CI (`ci.yml`, `qa-testers.yml`) + `tsc-baseline.txt` | GitHub | **keep-tool** |
| `ios/`, `android/` | פרויקטים native של Capacitor | `npx cap sync`, Xcode/Gradle | **keep-tool** |
| `functions/` | Cloud Functions | `firebase.json` → `"source": "functions"` | **keep-tool** |
| `public/` | נכסים סטטיים של Next | Next | **keep-tool** |
| `src/` | קוד האפליקציה | Next, `tsconfig` `@/*` | **keep-tool** (§2) |
| `capacitor-shell/` | `index.html` של offline-shell | `capacitor.config.ts:17` `webDir` | **keep-tool** |
| `plugins/health-bridge/` | פלאגין Capacitor מקומי (Swift/Kotlin/TS) | `package.json` `file:./plugins/health-bridge`, alias ב-`tsconfig`, `android/app/build.gradle` | **keep-tool** |
| `.claude/` | סוכנים, כללים, knowledge, skills | Claude Code | **keep-tool** |
| `.cursoragents/` | "truth files" (Workout/XP), שחוק 1 ב-CLAUDE.md מחייב לטעון | CLAUDE.md, axioms §1-2, 4 קבצי קוד מצטטים | **keep** (מוצמד במסמכי ממשל) |
| `docs/` | תיעוד | — | **keep** (§3) |
| `scripts/` | סקריפטים (482 קבצים, 255 מהם רופפים בשורש `scripts/`) | `package.json`, CI | **keep**. ארגון פנימי בהמשך (§4.3 MV-15) |
| `tests/` | סוויטות rules/emulator + `invariants/` | `vitest.config.ts`, CI | **keep** |
| `infra/graphhopper/` | Docker/Cloud Build/Cloud Run של GraphHopper | README משלו, סקריפטים | **keep** (מוסכמה: `infra/`) |
| `evals/ai-coach/` | fixtures של בדיקות רגרסיה לקלי (7 JSON) | `scripts/ai-coach-evals.ts:18`, `src/lib/ai/review/eval-case.ts:4` | **keep**. חלופה: `tests/evals/ai-coach/`. לא כדאי עכשיו, כי ענפי `kelly-*` פעילים |
| `.cursor/` | 2 תוכניות Cursor + `debug-41d0d1.log` (קובץ לוג במעקב!) | התוכניות לא מופנות מקוד | **archive** את `plans/*` → `docs/archive/cursor-plans/`; ה-log הוא **delete-candidate** + `.gitignore` ל-`*.log` |
| `data/` | `run-workout-templates-library.json` (מרץ 2026) | **0 הפניות** | **delete-candidate**. אם יוחלט להשאיר: זה הבית של `exercise-inventory.csv` (שורה למעלה) |
| `notebooks/` | `devlog.ipynb` (ינואר 2026) | **0 הפניות** | **delete-candidate** / archive |
| `temp-data/` | 3 JSON + xlsx של תרגילים (פברואר 2026) | רק `src/features/admin/actions/importExcelAction.ts:1127-1143`, ש**מת** לפי `dead-files.txt` (וגם מכיל נתיב מוחלט לדסקטופ) | **delete-candidate** יחד עם `importExcelAction.ts` |

**לא במעקב, אבל יושב בשורש של ה-main checkout:** `.playwright-mcp/` (פלט Playwright). כדאי להוסיף ל-`.gitignore`. גם `scripts/output/` במעקב חלקי (4 קבצים) ומקבל CSV-ים חדשים בכל ריצה. מומלץ `scripts/output/*` ב-`.gitignore` עם חריגה מפורשת לקבצים שצריך לשמור.

---

## 2. `src/`: הרמה הראשונה

### 2.1 מצב קיים

| פריט | קבצים | שורות | מייבאים מבחוץ | מצב מול STANDARDS |
|---|---:|---:|---:|---|
| `app/` | 553 | 145k | — | תקין (routes). 93 קבצים שאינם route (`community/_hooks`, `_components`, `map/layers` וכו'). ההצעה ב-STANDARDS ("page דק → `features/<d>/screens`") שייכת לפיצולי A0 ולא ל-R1 |
| `features/` | 3,225 | 532k | — | תקין |
| `lib/` | 576 | 66k | 1,194 | **106 קבצים רופפים בשורש** (§2.3). 26 תת-תיקיות תקינות |
| `components/` | 165 | 17k | 294 | `ui/v2` תקין. `ui/` הישן קפוא (STANDARDS §4). 14 רופפים בשורש, 3 ב-`components/admin` |
| `hooks/` | 19 | 1.9k | 300 | חצי מהקבצים בכלל לא hooks (`feature-flag-defs/resolve/viewer-cache`) |
| `messages/` | 39 | — | 158 | קטלוגי i18n. **לא לגעת**: `scripts/safety-check.sh` Check 5 מוצמד ל-`src/messages/` |
| `types/` | 16 | 1.9k | 245 | תיקיית "catch-all" (§2.2) |
| `config/` | 3 | 1.9k | 147 | `feature-flags.ts` (131 מייבאים) + 2 קטנים |
| `utils/` | 5 | 383 | 26 | כפל של `src/lib/utils` |
| `store/` | 2 | 83 | 14 | `useAppStore`, `useLocaleStore` |
| `contexts/` | 1 | 34 | 6 | `LanguageContext` (i18n) |
| `constants/` | 1 | 64 | 1 | `terms-content.ts` |
| `core/` | 2 | 165 | 3 | `constants/index.ts`, `userLifestyles.ts` |
| `@core/` | 1 | 5 | 1 | `useCardPage.ts`. **מת** (רק מייבא מת, `dead-files.txt`) |
| `scripts/` | 3 | 671 | **0** | סקריפטי CLI בתוך `src`. שייכים ל-`scripts/` בשורש |
| `assets/` | 1 PNG (948KB) | — | **0** | `lemur_guide_clean.png`, אף קוד לא מפנה אליו |
| `test_video/` | MP4 (884KB) + `.gitkeep` | — | **0** | וידאו בדיקה. האודיט מספטמבר רשם אותה כ"ריקה", וזה לא נכון: יש בה קובץ |
| `__tests__/` | 2 | — | — | `middleware.test.ts` (בודק את `src/middleware.ts`) + בדיקת selectors כללית. **keep** |
| `middleware.ts`, `instrumentation.ts`, `instrumentation-client.ts` | 3 | — | — | **keep-tool**: Next דורש אותם בשורש `src/` |

"מייבאים" נמדד בגרף import שבניתי לצורך המסמך: כל `from '…'` / `import('…')` / `require('…')` / `vi.mock('…')` ב-`src/`, `scripts/`, `tests/`, `functions/`, נפתר דרך `@/*` ונתיבים יחסיים. הספירה היא של **קבצים מייבאים ייחודיים**, כולל טסטים וסקריפטים. מגבלה: import דינמי עם template string לא נספר. נבדק ב-A0, ולא נמצא כזה לקבצי קוד.

### 2.2 יעד לכל קובץ בתיקיות-הגג החריגות

עיקרון: מה שרק פיצ'ר אחד צורך עובר לפיצ'ר (`features/<d>/{types,lib,hooks,components}`). מה שמשותף לכמה פיצ'רים עובר לתת-תיקייה בעלת שם ב-`src/lib/<topic>/` (STANDARDS §1: "Duplicate roots fold into `src/lib`"). מה שרק הפאנל צורך עובר ל-`features/admin/`. "סיכון" = מול עבודה פעילה (§4.4) ומול נתיבים מוצמדים (§4.2).

**`src/types/` (16 קבצים, 245 מייבאים)**

| קובץ | מייבאים | ריכוז | יעד | סיכון |
|---|---:|---|---|---|
| `community.types.ts` | 94 | arena 47, app 19, search 8, admin 7 | `features/arena/types/community.types.ts` | **גבוה**: גל i18n arena (#594) נוגע ב-~117 קבצים באותו אזור. stub חובה |
| `admin-types.ts` | 70 | admin 34, app(admin) 24, arena 3, parks 2 | `features/admin/types/admin.types.ts` (5 צרכני משתמש: לבדוק אם הם צריכים חלק משותף → `src/lib`) | בינוני: admin מחוץ לגלי i18n |
| `user-profile.ts` | 22 | home 7, app 3, progression-map 3, workout-engine 3 | `features/user/types/user-profile.types.ts` | בינוני. ב-A0 מסומן כ-barrel חי |
| `persona.types.ts` | 13 | user 6 + 3 סקריפטים | `features/user/types/` | נמוך |
| `workout.ts` | 12 | user 5, app 2, content 2, profile 2 | `features/workouts/types/workout.types.ts` | נמוך |
| `onboarding-questionnaire.ts` | 11 | user 7, app 2, admin 1 | `features/user/onboarding/types/` | **גבוה**: `feat/i18n-extract-onboarding-steps` פעיל, ו-`MultilingualText` נמצא כאן |
| `contribution.types.ts` | 11 | parks 9 | `features/parks/types/` | בינוני (`i18n-extract-parks-sheets` פעיל) |
| `persona-question.types.ts` | 8 | user 7 | `features/user/onboarding/types/` | כמו onboarding |
| `invitation.type.ts`, `maintenance.types.ts`, `product-roadmap.types.ts`, `audit-log.type.ts` | 7 / 6 / 7 / 2 | admin בלבד | `features/admin/types/` | נמוך. `audit-log.type.ts` מוזכר ב-`.claude/rules` (לעדכן) |
| `roadmap-unified.types.ts` | 6 | app(admin) 3, admin 2, config 1 | `features/admin/types/` | נמוך |
| `message-template.types.ts` | 3 | arena 2 | `features/arena/types/` | בינוני (arena) |
| `gear-definition.type.ts` | **0** | — (וגם שבור: `TS2307` ב-`tsc-baseline.txt:445`) | **delete-candidate**. התאום החי: `features/content/equipment/gear/core/gear-definition.types.ts` | — |
| `progression-settings.type.ts` | **0** | — | **delete-candidate** | — |

**`src/hooks/` (19 קבצים, 300 מייבאים).** הצעה: `src/hooks/` **נשאר** כבית ל-hooks משותפים באמת (זו מוסכמה מוכרת ב-Next). לרשום את זה ב-STANDARDS, ולהוציא ממנו את מה שאינו hook ואת מה שפיצ'רי.

| קובץ | מייבאים | יעד |
|---|---:|---|
| `useT.ts` | **141** (workout-engine 49, arena 23, search 21…) | `src/lib/i18n/useT.ts`, **רק אחרי שגל 2 נגמר**. כל PR של i18n מוסיף import שלו |
| `useFeatureFlags.ts` | **122** | `src/lib/feature-flags/useFeatureFlags.ts` (MV-11) |
| `feature-flag-defs.ts` | 21 | `src/lib/feature-flags/flag-defs.ts`. **מוצמד ב-CLAUDE.md** (חובות wave 1). עדכון באותו PR |
| `feature-flag-resolve.ts`, `feature-flag-viewer-cache.ts` | 2 / 6 | `src/lib/feature-flags/` |
| `useTranslation.ts` | 6 | `src/lib/i18n/` (גל 1A של i18n מחליף אותו; לחכות לו) |
| `useAiEntitlement.ts` | 1 (ai-coach) | `features/ai-coach/hooks/` |
| `useDashboardMode.ts` | 4 (home 2, profile 1, app 1) | `features/home/hooks/` |
| `useHealthConnected.ts`, `useHealthWithDisclosure.ts` | 5 / 6 | `features/activity/hooks/` (או `src/lib/healthBridge/`) |
| `useAndroidBack.ts` | 2 (onboarding-new) | נשאר (גנרי) |
| `useIsMounted`, `useKeyboardInset`, `useOnlineStatus`, `useScrollDirection`, `useSheetScrollChain` | 7 / 3 / 7 / 1 / 7 | נשארים ב-`src/hooks/` |

**`src/config/` (3 קבצים, 147 מייבאים)**

| קובץ | מייבאים | יעד | הערה |
|---|---:|---|---|
| `feature-flags.ts` (קבועי קומפילציה `IS_XP_ENABLED`…) | **131** | `src/lib/feature-flags/compile-time.ts` | כל הגלים נוגעים בו. stub חובה. MV-11 |
| `health-goals.ts` | 14 | `features/activity/config/health-goals.config.ts` | activity 7, home 4 |
| `roadmap-lanes.config.ts` | 2 (admin) | `features/admin/config/` | — |

שימו לב שיש גם `src/lib/config/` (`domain.ts`, `app-urls.ts`), תיקייה חוקית ותקינה. `src/config/` מתקפל לתוכה או לפיצ'רים, ואחרי זה נמחק.

**`src/utils/` (5) → `src/lib`**

| קובץ | מייבאים | יעד |
|---|---:|---|
| `render-helpers.ts` | 15 (content 8, app 5, admin 2) | `src/lib/utils/render-helpers.ts` |
| `facility-icon.ts` | 4 | `src/lib/utils/` (או `features/parks/lib/`) |
| `geoValidation.ts` | 4 (parks בלבד) | `features/parks/lib/geo-validation.ts` |
| `pathSimplify.ts` | 2 (parks, workout-engine) | `src/lib/geo/path-simplify.ts` (A0 מציע `src/lib/geo/` גם לגאומטריה מ-parks) |
| `video-utils.ts` | 2 (admin) | `features/admin/lib/` |

**שאר הגגות הקטנים**

| קובץ | מייבאים | יעד | סיכון |
|---|---:|---|---|
| `store/useAppStore.ts` | 11 (user 8) | `features/user/store/useAppStore.ts` (`LanguageContext` עוטף אותו) | בינוני: onboarding i18n פעיל |
| `store/useLocaleStore.ts` | 5 | `src/lib/i18n/useLocaleStore.ts` | **לחכות לגל 1A** |
| `contexts/LanguageContext.tsx` | 6 | `src/lib/i18n/LanguageContext.tsx` (או למחוק כשגל 1A מחליף אותו) | **לחכות לגל 1A** |
| `constants/terms-content.ts` | 1 (user) | `features/legal/data/terms-content.data.ts` (יש `features/legal`) | נמוך |
| `core/constants/index.ts` + `userLifestyles.ts` | 3 (messages 2, app 1) | `src/lib/constants/` | נמוך |
| `@core/hooks/useCardPage.ts` | 1 (מת) | **delete-candidate** יחד עם `park-item` (A0) | — |
| `scripts/*.ts` (3) | 0 | `scripts/` בשורש (`fix-authority-coordinates.ts`, `import-osm-segments.ts`, `seedAchievements.ts`) | נמוך. `safety-check.sh` מוצמד ל-`src/scripts/import-osm-segments.ts`, ויש import יחסי אחד (`'../lib/firebase'`) לתקן |
| `assets/images/lemur/lemur_guide_clean.png` | 0 | **delete-candidate** (או `public/` אם יש לו שימוש מתוכנן) | — |
| `test_video/*.mp4` | 0 | **delete-candidate** | — |

### 2.3 `src/lib`: 106 קבצים רופפים → תת-תיקיות

`src/lib` עצמו הוא המקום הנכון לקוד משותף. הבעיה היא שאין לו מבנה פנימי. ההצעה היא לקבץ לפי נושא, ולהעביר קובץ שרק פיצ'ר אחד צורך אל הפיצ'ר. המספר בסוגריים הוא מספר המייבאים.

| קבוצה → יעד | קבצים (מייבאים) |
|---|---|
| **לא להזיז** (מוצמדים במסמכי ממשל, fan-in עצום) | `firebase.ts` (529), `firebase-admin.ts` (232). מוזכרים ב-CLAUDE.md וב-axioms §15. העלות גבוהה מהערך. נשארים ב-`src/lib/` לתמיד, ו-STANDARDS ירשום זאת כחריגה |
| `lib/firestore/` | `firestore.service.ts` (36), `firestore-sanitize.ts` (9), `broken-timestamps-backfill.ts` (2, רק סקריפט + טסט → `scripts/lib/`) |
| `lib/auth/` | `auth.service.ts` (26, מוצמד ב-axioms §4), `api-auth.ts` (70), `admin-session.ts` (6), `native-auth-validation.ts` (1), `capacitorAuthPersistence.ts` (1), `resolveAuthLinkOutcome.ts` (2), `identity.ts` (4), `requestAccountDeletion.ts` (1, home), `appCheckDebugGate.ts` (2), `appCheckTelemetry.ts` (2) |
| `lib/access/` (scopes) | `unitPermissionScope.ts` (64), `authorityManagerScope.ts` (18), `adminAnalyticsScope.ts` (14), `testAccountFilter.ts` (21), `tenantType.ts` (4) |
| `lib/rate-limit/` | `rateLimit.ts` (26), `rateLimitConfig.ts` (42), `rateLimitLog.ts` (23), `requestIp.ts` (27) |
| `lib/running/` | 12 קבצי `running-*.ts` (2-10 כל אחד; home, user, schedule, workout-engine, ai-coach) + `planned-run.ts` (14) + `track-ownership.ts` (17) + `who-strength-target.ts` (9). `running-today-workout` (home בלבד), `running-schedule-signup-default` (user בלבד) ו-`running-onboarding-gate` (app/home בלבד) **נשארים בקבוצה** כי הם חלק מאותה משפחה |
| `lib/demo/` (ליד `demo-control/` הקיים) | `demo.ts` (45), `demo-actor.ts` (13), `demo-world.server.ts` (20), `demo-viewer-world.server.ts` (6), `demo-viewer-presence.server.ts` (2) |
| `lib/units/` (ורטיקל צבאי/בתי ספר) | `unit-doc.ts` (3), `unit-id.ts` (4), `org-name.ts` (4), `military-reserve-league.ts` (4) |
| `lib/join/` | `joinEngine.ts` (7, **מוצמד** ב-`safety-check.sh` ו-axioms §17), `validateGroupJoinAccess.ts` (2), `resolveJoinLanding.ts` (2) |
| `lib/xp/` | `awardWorkoutXP.ts` (7), `reverseWorkoutXP.ts` (1). **מוצמדים** ב-axioms §2. העברה רק עם עדכון axioms באותו PR, או להשאיר |
| `lib/cache/` | `persistentTtlCache.ts` (9), `ttlAsyncCache.ts` (3), `idbRecordStore.ts` (7) |
| `lib/native/` (קיים) | `haptics.ts` (28), `sound.ts` (5), `appForeground.ts` (4), `onboardingPrefs.ts` (48, **מוצמד** ב-axioms §19), `accessibilityWidgetPref.ts` (2), `chunk-reload.ts` (2) |
| `lib/telemetry/` | `sentry-shared.ts` (5; `instrumentation*` מייבאים), `reportSignupFailure.ts` (9), `signupFailureLog.ts` (4), `sessionHealth.store.ts` (4), `marketingAttribution.ts` (4), `gen-perf.ts` (6) |
| `lib/calendar/` | `calendar-feed-ics.ts` (2), `calendar-feed-token.ts` (4) |
| `lib/feature-flags/` | `feature-flag-live.ts` (12), `feature-flag-once.ts` (8), ועוד הקבצים מ-`src/hooks` ו-`src/config` (MV-11) |
| `lib/healthBridge/` (קיים) | `ingestHealthSamples.ts` (2), `health-declaration.ts` (11) |
| `lib/content/` | `muscle-chips.const.ts` (3), `muscle-icons.const.ts` (5), `difficulty-display.ts` (2), `calories.utils.ts` (4), `running-workout-labels.ts` (8), `hidden-programs.ts` (5), `progression-map-config.ts` (11), `persona-declaration.ts` (2) |
| `lib/workouts/` | `workoutDeletion.ts` (3), `workoutInvite.ts` (5), `workout-completion-kpi.ts` (8) |
| `lib/parks/` | `park-image.ts` (8), `park-stop-role.ts` (5), `nearbyPresence.service.ts` (6), `map-defaults.ts` (4); `bunny-image.ts` (8) → `lib/bunny/` הקיים |
| `lib/time/` | `israelTime.ts` (24), `age.ts` (7), `scheduleIdle.ts` (3) |
| **לפיצ'ר אחד** | `distanseStr.ts` (1) + `requestGovernor.ts` (4) → `features/parks/lib/` · `resolveTabLocks.ts` (2) → `features/schedule/lib/` · `top-padding-exempt-routes.ts` (3) → `features/navigation/` · `moderation.ts` (8) → `features/social/lib/` (arena/app) · `city-registrations.ts` (2) → `lib/route-collections/` |
| **לפאנל** (`features/admin/{lib,server}/`) | `admin-fetch.ts` (2), `adminAuthedFetch.ts` (8), `age-buckets.ts` (2), `reportScope.ts` (2), `agentsPanelServer.ts` (5, server), `previewNotificationContent.ts` (1), `addScheduleEntryAdmin.ts` (2, API), `testAccountFilterAdmin.ts` (2, API). `google-service-account.ts` (7) **מוצמד** ב-CLAUDE.md (Architecture Patterns), ולכן נשאר או מועבר עם עדכון |

עוד שתי תת-תיקיות ב-`src/lib` שאינן קוד אפליקציה: `trail-graph/` (7 מייבאים חיצוניים, כולם סקריפטים וטסטים) ו-`dem-tile-cache/` (רובם סקריפטים). A0 §1.3 מציע להעביר אותן ל-`scripts/lib/`. **אבל** `functions/scripts/vendor-copy-geo-discovery.js` מעתיק את סגירת ה-imports של `scripts/geo-discovery-routes.ts` + `src/lib/route-collections/index.ts` ל-`functions/`, כך שהעברת קובץ בתוך הסגירה הזו משנה את ה-mirror. זה PR נפרד, עם הרצת הסקריפט ובדיקת ה-mirror.

### 2.4 `src/components/`: שורש ו-`admin/`

| קובץ | מייבאים | יעד |
|---|---:|---|
| `AuthModal`, `BottomNavigation`, `CalculatingProfileScreen`, `KingLemurLoadingScreen`, `SecureAccountBanner`, `ui/FeedbackFAB` | 0 | **delete-candidate** (מתים לפי A0). PR המחיקות של A0, לא העברה |
| `ErrorBoundary.tsx` | 4 | `components/system/` |
| `AppLogoLoader.tsx`, `BrandedSplashScreen.tsx` | 4 / 1 | `components/system/` (splash/loader גלובליים) |
| `CircularProgress.tsx` | 4 (home 2, profile 2) | `components/ui/` (קפוא) או מועמד ל-v2 |
| `ExistingAccountModal.tsx`, `LinkAccountPrompt.tsx` | 2 / 2 | `features/user/auth/components/`. `ExistingAccountModal` מוזכר ב-axioms (עדכון) |
| `LemurMarker.tsx`, `MapLoadingSkeleton.tsx` | 1 / 1 (parks) | `features/parks/core/components/` |
| `MobileFrame.tsx` | 1 (admin) | `features/admin/components/` |
| `admin/Alert.tsx`, `admin/ExerciseAutocomplete.tsx`, `admin/ProgramAutocomplete.tsx` | 2 / 6 / 1 | `features/admin/components/shared/` |
| `ui/StickyActionButton.tsx` | 14 (user בלבד) | `features/user/onboarding/components/`. **גבוה**: גל onboarding-steps פעיל |
| `ui/WheelPicker.tsx` | 1 (user) | `features/user/onboarding/components/` |
| `ui/CaloriesChip.tsx` | 3 (parks) | `features/parks/` |

`components/ui/*` (25 קבצים) הם בחירה מכוונת: "קפוא" לפי STANDARDS §4. הם נשארים עד שהקובץ שמשתמש בהם עובר ל-v2. ב-R1 מעבירים רק את מי שיש לו צרכן יחיד.

---

## 3. `docs/` ו-Markdown בתיקיות קוד

### 3.1 מצב קיים

`docs/` מכיל 136 קבצים. רובם כבר מאורגנים בתיקיות לפי נושא: `audit-2026-09/` (29), `audit-2026-10/` (22), `field-test/` (41), `workout-engine/` (17), `research/` (8), `architecture/` (4), `i18n/`, `analytics/`, `trails-pilot/`, `product/`, `design-v2/`, `push-library/`. **5 קבצים רופפים** בשורש `docs/`: `CITY-MAPPING-PIPELINE-ARCHITECTURE.md`, `SPEC-PERMISSIONS-MODEL.md`, `TRAILS-PILOT-SHAAR-HANEGEV.md`, `amenities-approval-to-data-roadmap.md`, `android-package-id-discrepancy.md`. אין `docs/README.md` (אינדקס).

Markdown מחוץ ל-`docs/`, `.claude/` ו-`.cursor*`: 9 קבצים. 7 מהם README של תיקיית כלי (`infra/graphhopper`, `plugins/health-bridge`, `scripts/demo`, `scripts/qa`, `tests/invariants`, `src/features/workout-engine/engines`), וזו מוסכמה תקינה, **keep**. שניים הם מסמכי תכנון בתוך קוד:
- `src/features/schedule/out-run-schedule-logic-v1.3.md`: **מוצמד** ב-CLAUDE.md (טבלת Reference) ומצוטט ב-`scheduleRules.ts` וב-`smartSchedule.types.ts`.
- `src/features/workout-engine/hybrid/HYBRID_ENGINE_DESIGN.md`: מצוטט ב-`compose-hybrid-session.service.ts`, `strength-block.service.ts`, `route-distance.utils.ts` ו-3 קבצי knowledge.

### 3.2 מבנה מוצע

```
docs/
  README.md                 ← חדש: אינדקס קצר (איפה מה, מי מקור-אמת)
  architecture/             STANDARDS, ROOT-MAP, AUDIT-2026-10 (+dead-files), marketing-attribution,
                            workout-recommendation-engine, finance-scan…, + CITY-MAPPING-PIPELINE-ARCHITECTURE,
                            + SPEC-PERMISSIONS-MODEL (מ-docs/)
  product/                  kpi-definitions, + PRODUCT_TECHNICAL_REPORT (מהשורש), + amenities-approval-to-data-roadmap
  runbooks/                 + native-phase-qa (מהשורש), + android-package-id-discrepancy
  specs/2026-08/            + addendum-intensity-…, + spec-summary-screens-… (מהשורש)
  schedule/                 + out-run-schedule-logic-v1.3.md (מ-src/features/schedule; עדכון CLAUDE.md)
  workout-engine/           + hybrid-engine-design.md (מ-src/features/workout-engine/hybrid)
  trails-pilot/             + TRAILS-PILOT-SHAAR-HANEGEV.md (מ-docs/)
  audit-2026-09/, audit-2026-10/, field-test/, research/, i18n/, analytics/, design-v2/, push-library/  ← ללא שינוי
  archive/                  ARCHITECTURE, PROJECT_STRUCTURE, ACCOUNT_SECURITY_IMPLEMENTATION, cursor-plans/
```

החלטות:
- **לא לשנות שם ל-`audit-2026-09/`** (למשל ל-`audits/2026-09/`). CLAUDE.md, axioms וקבצי knowledge מפנים אליה עשרות פעמים, כולל לסעיפים (`00-MASTER-PLAN.md` §13.x). שינוי שם ישבור את כל ההפניות האלה בשביל אסתטיקה.
- `docs/archive/` מקבל שורת כותרת `> HISTORICAL — לא משקף את הקוד. נשמר לתיעוד.` בראש כל קובץ. זו הוספה של שורה, לא תוכן חדש.
- `.claude/knowledge/` נשאר מחוץ ל-`docs/`. זה זיכרון עבודה של סוכנים, וכלל 9 ב-CLAUDE.md מבקש לא לקמט אליו "לוגים". זה לא תיעוד מוצר.
- PR התיעוד (MV-01) מעדכן **באותו PR** כל הפניה לנתיב ישן (`git grep` = 0 אחרי השינוי), כולל ההערות בקוד ששמות את הקובץ. תיקון הערה בקוד הוא עדיין "העברה בלבד".

---

## 4. תוכנית העברה

### 4.1 שיטת שכתוב ה-imports

**ברירת מחדל: codemod + stub זמני.**
1. `git mv old new`. ה-diff מראה rename ב-100% similarity, וזו ההוכחה שהתוכן לא השתנה.
2. codemod (סקריפט `ts-morph` קטן שייכנס ל-`scripts/codemods/move-module.ts` ב-PR הראשון שצריך אותו). הסקריפט פותר כל specifier (`@/…` ויחסי) דרך ה-resolver של TS, ומשכתב **רק** specifiers שנפתרים לקובץ שהועבר אל `@/<new>`. אין פתרון טקסטואלי ב-sed, כי שם הקובץ מופיע גם במחרוזות ובהערות.
3. **אם אחד המייבאים נמצא באזור נעול** (גל i18n פעיל, ענף עיצוב פתוח, ראו §4.4), ה-codemod **לא נוגע בו**. במקום זה נשאר ב-path הישן stub של שורה אחת: `export { A, B } from '@/new/path'; // MOVED → @/new/path, remove after <area> sweep (R1 MV-xx)`. אם יש default export, מוסיפים `export { default } …`. לא `export *` (STANDARDS §5). אחר כך PR סוויפ קטן לכל אזור, כשהנעילה משתחררת, ובסופו מוחקים את ה-stub.
4. **לא מוסיפים alias חדש ל-`tsconfig`** (למשל `@types/*` או `@flags/*`). alias לכל תיקייה מסתיר את המבנה ומכפיל את הדרכים להגיע לאותו קובץ. `@/*` נשאר היחיד, יחד עם `health-bridge` הקיים.

### 4.2 הוכחת בטיחות לכל PR העברה

אף אחד מהצעדים לא מריץ את האפליקציה (axioms §11: אין `npm run dev`/`build`).

| בדיקה | למה |
|---|---|
| `git diff -M --stat origin/main` | כל קובץ שהועבר הוא `R100`. שינויים מותרים רק בשורות import, ב-stubs ובמסמכים |
| `bash scripts/ci/tsc-baseline.sh check` | אפס שגיאות TS **חדשות**. **שימו לב:** ה-baseline (`.github/tsc-baseline.txt`, 446 שורות) ממופתח לפי נתיב קובץ. קובץ עם שגיאה קיימת שזז ייראה כ"שגיאה חדשה". לכן ה-PR משנה את הנתיב בשורות ה-baseline של הקבצים שהוזזו (sed על השורות האלה בלבד, ולא `update` גורף). רלוונטי ל-16 שורות ב-`src/lib/`, 1 ב-`src/types`, 1 ב-`src/hooks`, 1 ב-`src/contexts` |
| `npx vitest run` (ו-`vitest.ci.config.ts` כמו ב-CI) | הטסטים הקיימים. טסט שמייבא נתיב ישן מתעדכן באותו PR (STANDARDS §7). אם טסט זז, לבדוק שהוא עדיין תואם ל-`include` ב-`vitest.config.ts`. חלק מהרשימות שם מפורשות לפי תיקייה (למשל `src/components/system/__tests__/**/*.test.tsx`) |
| `src/lib/i18n/__tests__/*` (catalogs, `*-he.test.ts`, `functions-i18n-mirror`) | "parity snapshots" של i18n. מוודא שהעברה לא שינתה טקסט ולא ניתקה namespace |
| `bash scripts/safety-check.sh` | הסקריפט **מוצמד לנתיבים**: `src/lib/joinEngine.ts`, `src/lib/route-collections/*`, `src/scripts/import-osm-segments.ts`, `src/messages/`, `src/lib/i18n/migrated-paths.txt`, רשימות `AUTHORIZED_ROUTE_WRITERS` ועוד. כל PR שמזיז קובץ מהרשימות האלה מעדכן את הסקריפט באותו PR ומריץ אותו |
| `src/lib/i18n/migrated-paths.txt` | המניפסט של Check 5 (תיקיות שאסור להוסיף בהן עברית). העברה של **תיקייה** שרשומה בו מחייבת עדכון שורה. העברה של קובץ בודד לתוך תיקייה רשומה מחילה עליו את הכלל, וזה רצוי |
| `git grep -n '<old/path>'` | אפס תוצאות, מלבד ה-stub עצמו |
| קבצים בסגירה של `vendor-copy-geo-discovery.js` | אם הוזז קובץ שם: `node functions/scripts/vendor-copy-geo-discovery.js` + בדיקת diff ב-`functions/src/shared/` |
| מסמכי ממשל | קובץ שמוזכר ב-CLAUDE.md / `.claude/rules/axioms.md` / `.cursorrules` / `SECURITY.md`: מעדכנים את ההפניה באותו PR. רשימה מלאה: `firebase.ts`, `firebase-admin.ts`, `awardWorkoutXP.ts`, `reverseWorkoutXP.ts`, `onboardingPrefs.ts`, `auth.service.ts`, `google-service-account.ts`, `joinEngine.ts`, `feature-flag-defs.ts`, `audit-log.type.ts`, `ExistingAccountModal.tsx`, `out-run-schedule-logic-v1.3.md` |

### 4.3 PRs העברה, לפי הסדר

כל PR הוא **אזור אחד, העברה בלבד**. אין בו שינויי לוגיקה, i18n או עיצוב. מחיקות (delete-candidates) לא נכנסות ל-PRs האלה. הן הולכות ל-PRs המחיקה של A0 (§4 שם), אחרי אישור בעלים.

| # | PR | קבצים → נתיבים חדשים | שכתוב imports | סיכון התנגשות |
|---|---|---|---|---|
| **MV-01** | docs: מסמכי השורש → `docs/` | `PRODUCT_TECHNICAL_REPORT.md` → `docs/product/`; `NATIVE_PHASE_QA.md`, `docs/android-package-id-discrepancy.md` → `docs/runbooks/`; 2 ספקים → `docs/specs/2026-08/`; `ARCHITECTURE.md`, `PROJECT_STRUCTURE.md`, `ACCOUNT_SECURITY_IMPLEMENTATION.md`, `.cursor/plans/*` → `docs/archive/`; 4 קבצים רופפים ב-`docs/` לתיקיות (§3.2); `docs/README.md` (אינדקס) | אין קוד. עדכון CLAUDE.md (טבלת Reference: 2 שורות) + `.claude/knowledge/product-context.md` + הפניות ב-`.claude/plans` | **נמוך**. אף PR פתוח לא נוגע בקבצים האלה. CLAUDE.md נערך לעיתים רחוקות |
| **MV-02** | scripts: `src/scripts/*` → `scripts/` | `fix-authority-coordinates.ts`, `import-osm-segments.ts`, `seedAchievements.ts` → `scripts/` (fan-in 0) | import יחסי אחד (`'../lib/firebase'` → `'@/lib/firebase'`, ידני) + `safety-check.sh` + 2 קבצי knowledge + `docs/i18n/PLAN.md:115` | **נמוך** |
| **MV-03** | admin out of shared roots | 19 קבצים (17 שרק admin צורך + 2 שרק API admin צורך; בלי `google-service-account.ts`, שמוצמד): `components/admin/*` (3) + `MobileFrame` → `features/admin/components/shared/`; `src/types/{invitation,maintenance,product-roadmap,audit-log,roadmap-unified}` → `features/admin/types/`; `src/lib/{admin-fetch,adminAuthedFetch,age-buckets,reportScope,previewNotificationContent}` → `features/admin/lib/`; `agentsPanelServer`, `addScheduleEntryAdmin`, `testAccountFilterAdmin` → `features/admin/server/`; `utils/video-utils`, `config/roadmap-lanes.config` → `features/admin/{lib,config}/` | codemod מלא, בלי stubs (~60 מייבאים, כולם admin/API) | **נמוך**: admin מוחרג מגלי i18n wave 2. לבדוק מול `worktree-agents-graph` (#270) ו-`feat/demo-control-center` לפני שמתחילים |
| **MV-04** | vestigial roots | `src/core/constants/*` → `src/lib/constants/`; `src/constants/terms-content.ts` → `features/legal/data/terms-content.data.ts`; `src/utils/*` → יעדים ב-§2.2; `src/config/health-goals.ts` → `features/activity/config/` | codemod. stub רק ל-`render-helpers.ts` (content/app) אם `i18n-extract-library-page` (#589) עוד פתוח | **נמוך-בינוני** |
| **MV-05** | single-consumer files → their feature | `LemurMarker`, `MapLoadingSkeleton`, `ui/CaloriesChip`, `lib/distanseStr`, `lib/requestGovernor`, `utils/geoValidation` → `features/parks/…`; `hooks/useAiEntitlement` → `features/ai-coach/hooks/`; `lib/resolveTabLocks` → `features/schedule/lib/`; `hooks/useDashboardMode` → `features/home/hooks/`; `ExistingAccountModal`, `LinkAccountPrompt` → `features/user/auth/components/` (+axioms) | codemod. **stubs** לכל מה שנוגע ב-parks sheets / onboarding | **בינוני**: `feat/i18n-extract-parks-sheets` פעיל. `StickyActionButton`/`WheelPicker` **נדחים** עד שגל onboarding-steps נסגר |
| MV-06 | `src/types` → features | 9 הקבצים הנותרים (§2.2) | codemod + **stub חובה** ל-`community.types`, `onboarding-questionnaire`, `persona-question`, `contribution`. סוויפ לכל אזור אחרי הגל שלו | **גבוה** בלי stub, **אפסי** עם stub |
| MV-07 | `src/lib` → `lib/{auth,access,rate-limit}/` | 19 קבצים | codemod. רובם מיובאים מ-`src/app/api/**` (אין שם i18n) | נמוך. `auth.service.ts` (axioms) עם עדכון |
| MV-08 | `src/lib` → `lib/{running,demo,units}/` | 25 קבצים | codemod + stubs לצרכני home/user | בינוני: `fix/home-run-days-by-type`, `feat/schedule-engine-v2`, `feat/demo-viewer-world` פעילים |
| MV-09 | `src/lib` → `lib/{cache,telemetry,calendar,time,content,workouts,parks,firestore}/` | ~35 קבצים | codemod + stubs לפי אזור | בינוני |
| MV-10 | `src/components` root live → `components/system/` | `ErrorBoundary`, `AppLogoLoader`, `BrandedSplashScreen`, `CircularProgress` | codemod | נמוך. `fix/home-design-qa1` נוגע ב-`components/ui`, לא בשורש |
| MV-11 | feature flags → `src/lib/feature-flags/` | `config/feature-flags.ts` (131), `hooks/useFeatureFlags.ts` (122), `hooks/feature-flag-{defs,resolve,viewer-cache}.ts`, `lib/feature-flag-{live,once}.ts` | **stub חובה** ל-`config/feature-flags.ts` ול-`useFeatureFlags.ts`. CLAUDE.md מעודכן (חוב wave 1 מצטט `src/hooks/feature-flag-defs.ts`) | **גבוה** בלי stub: כמעט כל PR מוסיף דגל או קורא דגל |
| MV-12 | i18n plumbing → `src/lib/i18n/` | `hooks/useT.ts` (141), `hooks/useTranslation.ts`, `store/useLocaleStore.ts`, `contexts/LanguageContext.tsx` | **רק אחרי שגל 2 נסגר וגל 1A מוזג.** stub ל-`useT` לתקופת מעבר | **גבוה מאוד** עכשיו. כל PR של i18n נוגע ב-`useT` |
| MV-13 | `store/useAppStore` → `features/user/store/` | 1 קובץ (11) | codemod | בינוני (onboarding) |
| MV-14 | design docs בקוד → `docs/` | `out-run-schedule-logic-v1.3.md` → `docs/schedule/`, `HYBRID_ENGINE_DESIGN.md` → `docs/workout-engine/hybrid-engine-design.md` | עדכון CLAUDE.md + 5 הערות בקוד + 3 קבצי knowledge | נמוך-בינוני (`feat/hybrid-engine`, `fix/hybrid-counting` פעילים, אבל נוגעים בקוד ולא במסמך) |
| MV-15 | `scripts/` root (255 רופפים) → `scripts/{backfill,import,verify,seed,migrate,probe}/` | לפי prefix (`backfill-*` 32, `import-*` 30, `verify-*` 13, `seed-*` 10…) | עדכון `package.json` scripts + הערות usage בראש כל קובץ + `safety-check.sh` (רשימת route writers מוצמדת ל-`scripts/*`) | בינוני. סקריפטים חד-פעמיים עדיף להעביר ל-`scripts/archive/` ולא למיין |

**חמשת הראשונים: MV-01 עד MV-05.** כולם נמוכי התנגשות, אין בהם קוד חי שמשנה התנהגות, וכל אחד מסיר תיקייה או קבוצה שלמה מהשורש. הם גם מוכיחים את ה-codemod ואת תהליך ה-baseline לפני שמגיעים ל-MV-06 ול-MV-11, שבהם יש fan-in גבוה.

### 4.4 התנגשויות עם עבודה פעילה (נמדד 21.10.2026)

PRs פתוחים שעודכנו ב-48 השעות האחרונות, והקבצים שלהם בתיקיות-היעד של R1 (`git diff --name-only origin/main...origin/<branch>`):

| ענף | קבצים | חפיפה עם R1 |
|---|---:|---|
| `feat/i18n-extract-arena` (#594) | 117 | `vitest.config.ts`, `docs/i18n/HOW-TO.md`. **עקיפה**: 47 צרכני `community.types.ts` + `useT` → MV-06/MV-12 |
| `feat/i18n-extract-profile` (#593) | 54 | `vitest.config.ts`. עקיפה: `messages/ns/profile`, `user-profile.ts` |
| `feat/i18n-extract-library-page` (#589) | 63 | `vitest.config.ts`. עקיפה: `render-helpers.ts` (content) |
| `fix/home-design-qa1` (#592) | 22 | `src/components/ui/AppHeader.tsx`, `ui/v2/*`, `src/hooks/useElementHeight.ts` (חדש ב-`src/hooks`) |
| `feat/g71-finish-and-continue` (#328) | 13 | `src/hooks/feature-flag-defs.ts` → MV-11 |
| `a11y-placeholders` (#268) | 22 | `src/components/ui/AccessCodeGate.tsx`, `ui/FeedbackFAB.tsx` (מת) |
| `test/generator-qa-v2-matrix` (#591) | 17 | `.gitignore` |
| `worktree-agents-graph` (#270) | 8 | `package.json` |

worktrees פעילים (קומיט ב-24 השעות האחרונות), מעבר ל-PRs: `feat/i18n-extract-onboarding-steps`, `feat/i18n-extract-parks-sheets`, `feat/i18n-extract-running-players`, `fix/onboarding-fit-run-user`, `fix/v2-flash`, `feat/demo-viewer-world`, `feat/qa-*`, `feat/carousel-sync`, `feat/records-fields-v2`, `fix/home-run-days-by-type`, `fix/run-long-run-day`, `feat/entry-intro-stories`, `feat/demo-control-center`, `docs/gender-copy-inventory`.

כללים שנובעים מזה:
- **`vitest.config.ts`** נערך כמעט בכל PR של i18n (הוספת שורות `include`). PR העברה שמזיז טסטים לתיקייה שיש לה `include` מפורש נוגע בו. לכן מעדיפים יעדים שכבר מכוסים ב-`'src/**/__tests__/**/*.test.ts'`.
- **לפני כל PR העברה**: `gh pr list` + `git worktree list` + בדיקת `git diff --name-only` של הענפים הפעילים מול רשימת המייבאים של הקבצים שזזים. אם יש חפיפה, stub לאותם מייבאים. אם `docs/i18n/LOCKS.md` קיים (מוצע ב-A0 §4, עוד לא ב-main), לרשום שם נעילת `move`.
- סוכני העיצוב של הבעלים (`design-lab/*`, `fix/home-design-qa1`) עובדים ב-`src/components/ui/v2` וב-`features/home`. R1 לא מזיז שום דבר מ-`ui/v2` או מ-`features/home/components`.

---

## 5. כללים לסוכנים מעכשיו

כללים קצרים, להוספה ל-`STANDARDS.md` §1 (PR נפרד, באישור):

1. **שורש הריפו:** קובץ חדש בשורש רק אם כלי דורש אותו שם (רשימה סגורה ב-§1.1 כ-keep-tool). מסמך → `docs/<topic>/`. פלט סקריפט → `scripts/output/` (ב-gitignore). נתונים לסקריפט → `data/`.
2. **`src/` ברמה הראשונה:** לא פותחים תיקייה חדשה ישירות תחת `src/`. הרשימה הסגורה: `app`, `features`, `lib`, `components`, `hooks`, `messages`, `__tests__` + 3 קבצי Next.
3. **`src/lib`:** אין קובץ חדש ישירות ב-`src/lib/`. תמיד ב-`src/lib/<topic>/`. אם רק פיצ'ר אחד צורך את הקוד, הוא נכנס ל-`features/<d>/lib/` ולא ל-`src/lib`.
4. **types/hooks/components של פיצ'ר** נכנסים לפיצ'ר (`features/<d>/{types,hooks,components}`). `src/hooks` מיועד רק ל-hook גנרי בלי ידע על דומיין. `src/types`, `src/utils`, `src/store`, `src/contexts`, `src/constants`, `src/config` **סגורים לקבצים חדשים**.
5. **קוד פאנל** → `features/admin/**` או `features/<d>/admin/**`, לעולם לא `src/components/admin` או `src/lib`.
6. **Markdown** לא נכנס לתיקיית קוד, מלבד `README.md` של תיקיית כלי. מסמך תכנון → `docs/<topic>/`, וההערה בקוד מפנה אליו.
7. **הזזה = PR נפרד**, בשיטת §4.1–4.2. לא מערבבים הזזה עם לוגיקה, i18n או עיצוב.

**CI advisory: כן.** מומלץ `scripts/ci/loose-files-advisory.sh`, באותה רוח של `file-size-advisory.sh`: תמיד `exit 0`, `::warning` ב-Actions, רק על קבצים **שנוספו** ב-PR (`git diff --diff-filter=A`), לא מחוץ ל-`safety-check.sh`. הסקריפט יזהיר על:
- קובץ חדש בשורש הריפו שלא ברשימת keep-tool;
- קובץ חדש ישירות תחת `src/` או `src/lib/`, או בכל אחת מ-`src/{types,utils,store,contexts,constants,config,core,@core,scripts}`;
- קובץ חדש ישירות תחת `src/components/` (שורש) או `src/components/ui/` (מחוץ ל-`v2/`);
- `*.md` חדש תחת `src/` (מלבד `README.md`);
- בינארי חדש (`*.mp4`, `*.png`, `*.xlsx`, `*.ipynb`) מחוץ ל-`public/`, `ios/`, `android/`.

רשימת ההיתרים יושבת בראש הסקריפט, כך שמי שמוסיף קובץ-כלי לגיטימי מעדכן שורה אחת ונמנע מה-warning. ~40 שורות bash. job חדש ב-`ci.yml` ליד `file-size`. לא נכנס ל-PR הזה (מסמך בלבד).

---

## נספח: שיטת המדידה

- רשימת השורש: `git ls-files | awk -F/ 'NF==1'` (34) ותיקיות ברמה הראשונה. הפניות: `git grep -l -F -- <name>`, בלי `package-lock.json` ובלי הקובץ עצמו, ואחר כך מעבר ידני על כל פגיעה (למשל רוב הפגיעות של `ARCHITECTURE.md` הן קבצים אחרים ששמם מסתיים כך, כמו `CITY-MAPPING-PIPELINE-ARCHITECTURE.md` ו-`HOME_WORKOUT_SERVICE_*_ARCHITECTURE.md`. השאר הן `PROJECT_STRUCTURE.md` והאודיטים שממליצים לגנוז אותו).
- fan-in: סקריפט Node חד-פעמי (לא נכנס ל-PR) שעובר על כל קבצי `ts/tsx/js/mjs` במעקב (בלי `ios/`, `android/`), מחלץ specifiers מ-`from`, `import()`, `require()`, `vi.mock()`, ופותר `@/` ונתיבים יחסיים עם סיומות `.ts/.tsx/.js/.json` ו-`/index.*`. מספר = קבצים ייחודיים שמייבאים. "צרכן יחיד" = כל המייבאים שאינם טסט נמצאים באזור אחד (`features/<d>`, admin, API או סקריפטים).
- פעילות: `gh pr list --state open`, `git diff --name-only origin/main...origin/<branch>` ל-12 הענפים שעודכנו לאחרונה, ותאריך הקומיט האחרון בכל worktree רשום.
