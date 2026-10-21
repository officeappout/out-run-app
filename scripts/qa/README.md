# בודקי AI בעולם הדמו — הגדרה והפעלה

שלבים B2–B4 בתכנון `agent-briefs/ai-testers-design.md` (אושר 20.10.2026).
"משתמשים" מבוססי AI נכנסים לאתר האמיתי בדפדפן בגודל אייפון, כחשבונות `demo_qa_*` בתוך עולם הדמו הסגור, עוברים משימה כמו אדם אמיתי ומדווחים ממצאים.

**שום דבר כאן לא רץ מעצמו.** אין הרצה מתוזמנת. מפעילים רק מ-`/admin/demo` (כפתור "הפעל בודקים") או מ-GitHub → Actions → qa-testers → Run workflow.

---

## מה יש ב-PR

| חלק | איפה | מה הוא עושה |
|---|---|---|
| הנפקת כרטיס כניסה | `functions/src/mintDemoTesterToken.ts` | מנפיק Firebase custom token **רק** ל-uid שמתחיל ב-`demo_qa_`, רק כש-`enable_demo_users` וגם `enable_ai_testers` דלוקים, רק ל-uid שרשום ב-`demo_registry/testers`, עד מכסה יומית (30, או פחות לפי "סשנים ביום" בפאנל), ורק למי שמוכיח שהוא ה-service account בשם `qa-runner` (הרשאת IAM + בדיקה שנייה של ה-ID token של גוגל). כל הנפקה נרשמת ב-`audit_logs` |
| הדלת היחידה לנתונים | `functions/src/qaRunnerReport.ts` | כל קריאה וכתיבה של ה-runner והמפקח עוברת כאן: רשימה סגורה של פעולות, כל שדה נבדק, וכל פעולה כותבת רק למסמך הקבוע שלה. תמונות: הפונקציה נותנת כתובת העלאה חתומה לקובץ אחד תחת `qa/<runId>/`, בתוקף 10 דקות. אותה בדיקת זהות כמו בהנפקה |
| דף כניסה | `/qa/signin` | נכנס עם הכרטיס מה-fragment של הכתובת (`#t=…`, לא נשלח לשרת ונמחק מיד). מסרב אם ה-uid לא `demo_qa_`, אם הדגלים כבויים, או אם מחובר כבר משתמש אחר במכשיר |
| דגלים לבודקים | `src/hooks/feature-flag-resolve.ts` | בודק מחובר (uid `demo_qa_*` + claim `qa`) רואה את `enable_home_v2` דלוק, כל עוד שני מתגי הדמו דלוקים. **אף פעם** לא מקבל דגלי סופר-אדמין. משתמש אמיתי: אין שום שינוי |
| ה-runner | `scripts/qa/run.ts` + `lib/` | Playwright + מודל עם ראייה. בכל צעד: צילום מסך, רשימת אלמנטים, ובדיקות קוד קבועות (טקסט קטן מ-11px, תווית שנשברת, יותר מגרדיאנט אחד, אימוג׳י, יעד מגע קטן מ-44px, גלילה הצידה, שגיאות קונסול/רשת). GPS מדומה לאורך מסלול |
| דמויות ומשימות | `personas/*.json`, `missions/*.json` | 3 משימות מסע: רחל 58 הולכת (חדשה), אורי רץ מתקדם (אינטרוולים עם GPS, אות שנעלם, יציאה מהאפליקציה), דנה מתחילה בבית בלי מתח. ועוד 12 סריקות עיצוב (ראו למטה) |
| מפקח | `scripts/qa/overseer.ts` | מאחד ממצאים לנושאים, מדרג, כותב דוח מרקדאון בעברית ומעדכן את `demo_registry/qa_summary` (לכרטיס הממצאים בפאנל) |
| workflow | `.github/workflows/qa-testers.yml` | הפעלה ידנית בלבד, דפדפן אחד בכל פעם, iPhone 13 כברירת מחדל |
| רישום בודקים | `scripts/qa/register-testers.ts` | מוסיף את חשבונות הבודקים של המשימות ל-`demo_registry/testers` |
| מחיקה | `scripts/demo/purge.ts` | המחיקה של עולם הדמו מוחקת עכשיו גם את מסמכי הבודקים ואת חשבונות ה-Auth שלהם |

### הגנות (בקוד, לא רק הנחיה למודל)
- **התחברות:** אין סיסמאות ואין מפתח JSON בשום מקום. גם אם ה-workflow נפרץ, אפשר להיכנס רק כ-`demo_qa_*` (הפונקציה לא חותמת על שום uid אחר), וחוקי ארגז החול (#552) מגבילים אותו לעולם הדמו.
- **ה-runner מסרב לפעול** בדף שאינו של האפליקציה, בנתיבים אסורים (`/admin`, `/authority-portal`, `/ai-coach`, הגדרות חשבון, ועוד מה שהמשימה מגדירה), בדף של משתמש/קבוצה/צ׳אט שאינם דמו, וכשהחשבון המחובר אינו בודק. במקרה כזה הוא חוזר להתחלה ולא נוגע בכלום.
- **הרשאות מינימליות:** ל-qa-runner **אין שום הרשאה ל-Firestore או ל-Storage.** הוא יכול רק לקרוא לשתי הפונקציות (`mintDemoTesterToken`, `qaRunnerReport`). הפונקציה `qaRunnerReport` כותבת רק ל-`qa_findings/*`, `demo_registry/control` (פעימת חיים), `demo_registry/usage/days/*` (עלות, `bySource.testers`, רק ליום של היום ±1, ובתקרה לכל קריאה), ו-`demo_registry/qa_summary`, ונותנת כתובות העלאה רק תחת `qa/`. ממצאים וכתובות העלאה נדחים כשהמתגים כבויים.
- **תקרות:** עד 60 צעדים לסשן, 20 דקות לסשן, 8 סשנים להרצה (ברירת מחדל 3), תקרת $ יומית וחודשית ו"סשנים ביום" מהפאנל. ה-runner **לא מתחיל** אם לא הוגדרה תקרת $ יומית או מחיר למודל (אי אפשר לתקרר עלות שלא נמדדת).
- **עצירה:** כפתור "עצור" בפאנל. ה-runner בודק כל 10 שניות ועוצר את הסשן.
- **פרטיות:** Google Analytics וספקי תשלום חסומים בדפדפן של הבודק. התראות חסומות. הכרטיס לא נכתב ללוג.

---

## הגדרה חד-פעמית (אתה)

החלף `appout-1` אם צריך. כל הפקודות מהמחשב שלך עם `gcloud` מחובר כבעלים.

### 1. service account בשם qa-runner
```bash
gcloud iam service-accounts create qa-runner --project appout-1 --display-name "AI testers runner"
SA=qa-runner@appout-1.iam.gserviceaccount.com
```

### 2. חיבור GitHub ← Google (Workload Identity Federation, בלי מפתח)
```bash
PROJECT_NUMBER=$(gcloud projects describe appout-1 --format='value(projectNumber)')

gcloud iam workload-identity-pools create github --project appout-1 --location global --display-name "GitHub Actions"

gcloud iam workload-identity-pools providers create-oidc out-run-app \
  --project appout-1 --location global --workload-identity-pool github \
  --issuer-uri https://token.actions.githubusercontent.com \
  --attribute-mapping "google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref,attribute.workflow_ref=assertion.workflow_ref" \
  --attribute-condition "assertion.repository=='officeappout/out-run-app' && assertion.ref=='refs/heads/main' && assertion.workflow_ref.startsWith('officeappout/out-run-app/.github/workflows/qa-testers.yml@')"

# רק ה-workflow הזה, מ-main, יכול "להיות" qa-runner:
gcloud iam service-accounts add-iam-policy-binding $SA --project appout-1 \
  --role roles/iam.workloadIdentityUser \
  --member "principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github/attribute.repository/officeappout/out-run-app"

```
אם שלב ה-auth ב-workflow נכשל עם `iam.serviceAccounts.getOpenIdToken`, תן לאותו `principalSet` גם `roles/iam.serviceAccountOpenIdTokenCreator` על ה-SA. זו הרשאה להנפיק ID token בשם qa-runner בלבד, לא הרשאה לנתונים.

### 3. הרשאות של qa-runner: רק להפעיל את שתי הפונקציות
**לא** נותנים לו `datastore.user`, `storage.*` או שום תפקיד ברמת הפרויקט. אם נתת בעבר (לפי גרסה קודמת של המסמך), הסר:
```bash
gcloud projects remove-iam-policy-binding appout-1 --member "serviceAccount:$SA" --role roles/datastore.user
gcloud storage buckets remove-iam-policy-binding gs://appout-1.firebasestorage.app --member "serviceAccount:$SA" --role roles/storage.objectCreator --all
```
ההרשאה היחידה שלו היא invoker על שתי הפונקציות (סעיף 4).

### 4. פריסת הפונקציות
```bash
firebase deploy --only functions:mintDemoTesterToken,functions:qaRunnerReport --project appout-1

# רק qa-runner רשאי לקרוא להן:
gcloud functions add-invoker-policy-binding mintDemoTesterToken --region us-central1 --project appout-1 --member "serviceAccount:$SA"
gcloud functions add-invoker-policy-binding qaRunnerReport      --region us-central1 --project appout-1 --member "serviceAccount:$SA"
```
- שתי הפונקציות חותמות עם ה-service account שהן רצות בו: `mintDemoTesterToken` חותמת כרטיסי כניסה, ו-`qaRunnerReport` חותמת כתובות העלאה. אם בהרצה הראשונה מופיעה שגיאת `iam.serviceAccounts.signBlob`, תן ל-SA הזה `roles/iam.serviceAccountTokenCreator` על עצמו (ברירת המחדל: `PROJECT_NUMBER-compute@developer.gserviceaccount.com`). זה ה-SA של הפונקציה, לא qa-runner.
- כתובות ברירת המחדל: `https://us-central1-appout-1.cloudfunctions.net/mintDemoTesterToken` ו-`…/qaRunnerReport`. אם הפריסה מדפיסה כתובות אחרות, שים אותן במשתנים `QA_MINT_URL` / `QA_REPORT_URL` ב-GitHub, וב-`functions/.env` כ-`QA_MINT_AUDIENCE` / `QA_REPORT_AUDIENCE` (ואז פרוס שוב).

### 5. App Check debug token (רק לדפדפן של הבודק)
Firebase Console → App Check → Apps → אפליקציית הווב → Manage debug tokens → Add. שמור את הערך כסוד `APPCHECK_DEBUG_TOKEN` (סעיף 6). אפשר לבטל אותו בכל רגע מאותו מסך. הוא מוזרק רק לדפדפן של הבודק, לא לאפליקציה.

### 6. סודות ומשתנים ב-GitHub (Settings → Secrets and variables → Actions)
| סוג | שם | ערך |
|---|---|---|
| Secret | `ANTHROPIC_DEMO_KEY` | מפתח Anthropic ייעודי לבודקים, עם תקרת הוצאה חודשית ב-Console |
| Secret | `APPCHECK_DEBUG_TOKEN` | מסעיף 5 |
| Variable | `QA_WIF_PROVIDER` | `projects/<PROJECT_NUMBER>/locations/global/workloadIdentityPools/github/providers/out-run-app` |
| Variable | `QA_RUNNER_SA` | `qa-runner@appout-1.iam.gserviceaccount.com` |
| Variable (רשות) | `QA_MINT_URL`, `QA_REPORT_URL` | רק אם הכתובות שונות מברירת המחדל |
| Variable (רשות) | `QA_MODEL` | ברירת מחדל `claude-sonnet-5-5` |

### 7. כפתור ההפעלה בפאנל (Vercel → Environment Variables → Production)
`GITHUB_DISPATCH_TOKEN` — fine-grained token, רק ל-repo `officeappout/out-run-app`, הרשאה אחת: **Actions: Read and write**. בלעדיו הכפתור ב-`/admin/demo` אומר "לא מוגדר".

### 8. בפאנל `/admin/demo`
1. **מחירים:** הוסף את `claude-sonnet-5-5` עם המחירים מעמוד המחירים של Anthropic (לפי הטבלה שבידינו מ-06.10.2026: קלט $2, פלט $10, קריאה מ-cache $0.20 למיליון טוקנים — לוודא).
2. **תקרות:** תקרת $ יומית (מוצע $15), חודשית (מוצע $150), סשנים ביום (מוצע 8).
3. **מתגים:** `enable_demo_users` ו-`enable_ai_testers`.

### 9. רישום הבודקים (פעם אחת, ושוב אחרי שמוסיפים משימה)
```bash
npx tsx scripts/qa/register-testers.ts --project appout-1 --dry-run
npx tsx scripts/qa/register-testers.ts --project appout-1 --confirm "רשום את הבודקים"
```
(דורש `.env.local` עם `FIREBASE_SERVICE_ACCOUNT_KEY`, כמו סקריפטי הדמו.)

---

## הפעלה

- **מהפאנל:** `/admin/demo` → "הפעל בודקים". הפאנל בודק מתגים ותקרות ומפעיל את ה-workflow.
- **מ-GitHub:** Actions → qa-testers → Run workflow. אפשר לבחור משימות (`M01_walker58,M03_home_beginner`), מכשיר ומספר סשנים.
- **בדיקה יבשה בלי רשת** (מאמתת קבצים ומדפיסה תוכנית):
  ```bash
  npx tsx scripts/qa/run.ts --dry-run
  ```

### מה מקבלים
- **בפאנל:** מצב ה-runner (רץ / פנוי), מספר ממצאים, עלות היום לפי מקור (`testers`), וסיכום המפקח ב-`demo_registry/qa_summary`.
- **ב-Firestore:** `qa_findings` (רק Admin SDK ומנהל-על). לכל ממצא: חומרה P0–P3, חוק, מה ציפינו, מה קרה, צעדי שחזור, צילום.
- **ב-Storage:** `qa/<runId>/<משימה>/<צעד>-….png`.
- **ב-GitHub:** artifact בשם ה-run (נשמר 14 יום) עם `report.md`, `findings.jsonl`, `run.json`.
- דוח ידני לתיקיית הדוחות:
  ```bash
  export QA_REPORT_ID_TOKEN=$(gcloud auth print-identity-token \
    --impersonate-service-account qa-runner@appout-1.iam.gserviceaccount.com \
    --audiences https://us-central1-appout-1.cloudfunctions.net/qaRunnerReport --include-email)
  npx tsx scripts/qa/overseer.ts --run-id <runId> --out ../agent-briefs/qa-reports --no-summary
  ```
  (גם המפקח עובר דרך `qaRunnerReport`. ה-impersonation דורש שלחשבון שלך תהיה הרשאת Token Creator על qa-runner. אפשר גם פשוט להוריד את `report.md` מה-artifact.)

### עלות (סדר גודל)
סשן של 40 צעדים עם Sonnet: בערך $0.7–1.2. הרצה של 3 סשנים: בערך $2–4. התקרה היומית עוצרת בכל מקרה.

---

## סריקות עיצוב (21.10.2026)

הבעלים: "הרבה מסכים לא יושבים טוב עיצובית — אני רוצה שהבודקים ישימו לב לזה". מה נוסף:

### צ'קליסט עיצוב לבודק
- `lib/checklist.ts` — טבלת החוקים הורחבה ל-35 חוקים עם מזהה קבוע, מקובצים לפי תחום: טוקנים וכרטיסים, כפתור גרדיאנט אחד, גוון (לא שחור) לנבחר, תוויות שלא נשברות, מינימום 11px, יעד מגע 44px, מגירות (ידית, כפתור סגירה), RTL, ריווח, חפיפות, טקסט חתוך, safe area, מקלדת שמסתירה שדה, מצב ריק, שלד טעינה, ניגודיות, אייקונים לא אחידים/אימוג׳י, וערבוב עיצוב ישן (v1) וחדש (v2) באותו מסך. בנוסף חוקי הנגנים/סיכומים מ-run-ui-brief.
- `lib/design/checklist-builder.ts` בונה מהטבלה את הצ'קליסט שהמודל מקבל (★ = חוקי המיקוד של המשימה) + מחוון ציונים.
- **ציון לכל מסך:** הכלי `score_screen` — 1–5 על בהירות, עקביות עם v2, צפיפות ו-RTL, על המכשיר הנוכחי. **כל ציון 3 ומטה מחייב ממצא** (`report_finding` עם מזהה חוק ומזהה מסך; הצילום מצורף אוטומטית). הציון נשמר כממצא רגיל עם החוק `DESIGN-SCORE` — אין פעולה חדשה ב-`qaRunnerReport` ואין שינוי סכימה.
- **מקלדת מדומה:** הכלי `keyboard` מקטין את המסך בגובה מקלדת (~40%) כדי לבדוק שהשדה והכפתור נשארים גלויים. זה קירוב (מצב resize), לא מקלדת iOS אמיתית.

### משימות סריקה (`missions/D*.json`)
12 משימות קצרות (עד 40 צעדים), כל אחת עוברת על רשימת מסכים קבועה ("checkpoints") ונותנת ציון לכל אחד, בשלושה גדלים: iPhone SE, iPhone 13, iPhone Pro Max. הדמות: נועה, מעצבת מוצר (`personas/noa_designer.json`).

| משימה | מסכים |
|---|---|
| D01_onboard_strength | שאלון כוח (כולל שדות עם מקלדת), הצהרת בריאות, בית משתמשת חדשה |
| D02_onboard_run | שאלון ריצה (שדה זמן/קצב עם מקלדת), סיכום תוכנית, בית של רצה |
| D03_onboard_walk | שאלון הליכה (שדה עם מקלדת), בית של הולכת |
| D04_home_states | בית: היום, גלילה, יום עתידי, יום מנוחה, הוספת אימון, תצוגה מקדימה |
| D05_strength_player | נגן כוח, מנוחה, רשימה מאחור, מיני-נגן, סיום, סיכום, בית אחרי אימון |
| D06_run_player | תצוגה מקדימה, נגן ריצה עם GPS, קטעים, מיני-נגן, סיכום |
| D07_walk_player | נגן הליכה, הפסקה, סיכום |
| D08_schedule_agenda | אג'נדה, שבוע הבא, כרטיס יום, עורך לו"ז (בלי לשמור) |
| D09_map_routes | מפה, מגירת מסלולים, תצוגת מסלול, כרטיס פארק |
| D10_progress | התקדמות, השוואה, עמוד תרגיל |
| D11_profile_settings | פרופיל, שיאים, הגדרות (רק להסתכל) |
| D12_community | קהילה, קבוצות, קבוצת דמו, צ'אט (בלי לשלוח) |

- **חשבון לכל גודל מסך:** `uidPerDevice` — למשל `demo_qa_ds_strength_se` / `_i13` / `_pm`. שלוש קבוצות: כוח (D01, D04, D05, D08, D10), ריצה (D02, D06, D09, D11), הליכה (D03, D07, D12). המשימות של אותה קבוצה בונות זו על זו (קודם הרשמה, אחר כך נגנים), אז מריצים לפי הסדר.
- **רישום:** אחרי המיזוג להריץ שוב את `register-testers.ts` (נרשמים 9 חשבונות חדשים).
- **ברירת מחדל לא משתנה:** הרצה בלי רשימת משימות מריצה רק את M01–M03. סריקות רצות רק כשמבקשים.

### איך מריצים
GitHub → Actions → qa-testers → Run workflow:
- `missions` = `sweep` → כל הסריקות לפי הסדר (בפועל ~3 סשנים בהרצה בגלל ה-token של שעה), או רשימה: `D01_onboard_strength,D04_home_states`.
- `device` = `iphone-se` / `iphone-13` / `iphone-15-pro-max` — הרצה אחת לכל גודל.
- **המשך מאמצע:** `D05_strength_player@strength_summary` מתחיל מהמסך הזה (דוח העיצוב מדפיס בדיוק מה לכתוב).
- עלות: סשן סריקה ≈ $0.6–1. סריקה מלאה = 12 משימות × 3 מכשירים ≈ 36 סשנים ≈ $25–35, מתפרסת על כמה ימים לפי התקרה.

### מה המפקח מוציא
- `design-report.md` ליד `report.md` (ב-artifact): טבלת ציונים לכל מסך (הגרועים קודם, 3 ומטה מודגש), טבלה לפי גודל מסך עם הפער בין המכשירים, פירוט ממצאי העיצוב לכל מסך (חוק + צילום), "ציון נמוך בלי ממצא", וטבלת כיסוי עם פקודת ההמשך.
- דוח משולב לשלושת המכשירים:
  ```bash
  npx tsx scripts/qa/overseer.ts --run-id qa-<id>-iphone-se,qa-<id2>-iphone-13,qa-<id3>-iphone-15-pro-max --out ../agent-briefs/qa-reports --no-summary
  ```
- ב-`demo_registry/qa_summary` נוסף בלוק `design` (מספר מסכים, ממוצע, מסכים חלשים, 15 המסכים הגרועים עם ציון לכל ממד, החוק המוביל וצילום, ופקודות המשך). **שימו לב:** ה-sanitiser של `qaRunnerReport` (`functions/src/lib/qa-runner-ops.ts` → `parseSummary`) ופרסר הפאנל (`src/lib/demo-control/qa-summary.ts`) שומרים רק שדות מוכרים — עד שיתווסף להם `design` (משימת המשך מחוץ ל-scripts/qa, כולל פריסת הפונקציה), הבלוק לא נשמר והכרטיס בפאנל לא מציג אותו. הדוח המלא ב-artifact זמין כבר עכשיו.

---

## מגבלות ידועות
- **ID token של שעה:** ה-workflow מקבל ID token לכל פונקציה (והמפקח מקבל אחד חדש). ה-runner לא מתחיל סשן כשנשארו פחות מ-5 דקות, ולכן הרצה אחת היא בפועל עד ~3 סשנים. מספיק לשלב הזה.
- **לא נבדק עדיין מול פרודקשן (ספייק B0):** האם App Check מקבל את ה-debug token בדפדפן אוטומטי, האם משתמש חדש עם custom token מגיע לאונבורדינג נקי, והאם הנגן מחשב מהירות כשהדפדפן לא שולח `speed`. ההרצה הראשונה היא הספייק — מומלץ `max_sessions=1`.
- **בחירת עיר:** המשימות מבקשות מהבודק לבחור עיר "דמו · …". חוקי ארגז החול חוסמים שמירה של עיר אמיתית לשחקן דמו.
- **רק דפדפן:** GPS ברקע, wake lock, מקלדת iOS אמיתית (יש רק קירוב — הכלי `keyboard`), התראות ו-HealthKit לא נבדקים כאן.
- **המפקח דטרמיניסטי:** מאחד לפי חוק × מסך, בלי מודל. איחוד סמנטי ("אותה בעיה בשלושה מסכים") — בשלב הבא אם יהיה צורך.
