# בודקי AI בעולם הדמו — הגדרה והפעלה

שלבים B2–B4 בתכנון `agent-briefs/ai-testers-design.md` (אושר 20.10.2026).
"משתמשים" מבוססי AI נכנסים לאתר האמיתי בדפדפן בגודל אייפון, כחשבונות `demo_qa_*` בתוך עולם הדמו הסגור, עוברים משימה כמו אדם אמיתי ומדווחים ממצאים.

**שום דבר כאן לא רץ מעצמו.** אין הרצה מתוזמנת. מפעילים רק מ-`/admin/demo` (כפתור "הפעל בודקים") או מ-GitHub → Actions → qa-testers → Run workflow.

---

## מה יש ב-PR

| חלק | איפה | מה הוא עושה |
|---|---|---|
| הנפקת כרטיס כניסה | `functions/src/mintDemoTesterToken.ts` | מנפיק Firebase custom token **רק** ל-uid שמתחיל ב-`demo_qa_`, רק כש-`enable_demo_users` וגם `enable_ai_testers` דלוקים, רק ל-uid שרשום ב-`demo_registry/testers`, עד מכסה יומית (30, או פחות לפי "סשנים ביום" בפאנל), ורק למי שמוכיח שהוא ה-service account בשם `qa-runner` (הרשאת IAM + בדיקה שנייה של ה-ID token של גוגל). כל הנפקה נרשמת ב-`audit_logs` |
| דף כניסה | `/qa/signin` | נכנס עם הכרטיס מה-fragment של הכתובת (`#t=…`, לא נשלח לשרת ונמחק מיד). מסרב אם ה-uid לא `demo_qa_`, אם הדגלים כבויים, או אם מחובר כבר משתמש אחר במכשיר |
| דגלים לבודקים | `src/hooks/feature-flag-resolve.ts` | בודק מחובר (uid `demo_qa_*` + claim `qa`) רואה את `enable_home_v2` דלוק, כל עוד שני מתגי הדמו דלוקים. **אף פעם** לא מקבל דגלי סופר-אדמין. משתמש אמיתי: אין שום שינוי |
| ה-runner | `scripts/qa/run.ts` + `lib/` | Playwright + מודל עם ראייה. בכל צעד: צילום מסך, רשימת אלמנטים, ובדיקות קוד קבועות (טקסט קטן מ-11px, תווית שנשברת, יותר מגרדיאנט אחד, אימוג׳י, יעד מגע קטן מ-44px, גלילה הצידה, שגיאות קונסול/רשת). GPS מדומה לאורך מסלול |
| דמויות ומשימות | `personas/*.json`, `missions/*.json` | 3 משימות: רחל 58 הולכת (חדשה), אורי רץ מתקדם (אינטרוולים עם GPS, אות שנעלם, יציאה מהאפליקציה), דנה מתחילה בבית בלי מתח |
| מפקח | `scripts/qa/overseer.ts` | מאחד ממצאים לנושאים, מדרג, כותב דוח מרקדאון בעברית ומעדכן את `demo_registry/qa_summary` (לכרטיס הממצאים בפאנל) |
| workflow | `.github/workflows/qa-testers.yml` | הפעלה ידנית בלבד, דפדפן אחד בכל פעם, iPhone 13 כברירת מחדל |
| רישום בודקים | `scripts/qa/register-testers.ts` | מוסיף את חשבונות הבודקים של המשימות ל-`demo_registry/testers` |
| מחיקה | `scripts/demo/purge.ts` | המחיקה של עולם הדמו מוחקת עכשיו גם את מסמכי הבודקים ואת חשבונות ה-Auth שלהם |

### הגנות (בקוד, לא רק הנחיה למודל)
- **התחברות:** אין סיסמאות ואין מפתח JSON בשום מקום. גם אם ה-workflow נפרץ, אפשר להיכנס רק כ-`demo_qa_*` (הפונקציה לא חותמת על שום uid אחר), וחוקי ארגז החול (#552) מגבילים אותו לעולם הדמו.
- **ה-runner מסרב לפעול** בדף שאינו של האפליקציה, בנתיבים אסורים (`/admin`, `/authority-portal`, `/ai-coach`, הגדרות חשבון, ועוד מה שהמשימה מגדירה), בדף של משתמש/קבוצה/צ׳אט שאינם דמו, וכשהחשבון המחובר אינו בודק. במקרה כזה הוא חוזר להתחלה ולא נוגע בכלום.
- **כתיבות של ה-runner:** רק `qa_findings/*`, `demo_registry/control` (פעימת חיים), `demo_registry/usage/days/*` (עלות, `bySource.testers`), `demo_registry/qa_summary`, ותמונות ב-Storage תחת `qa/`. כל כתיבה אחרת נזרקת בקוד.
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

# qa-runner מנפיק לעצמו ID token (בשביל לקרוא לפונקציה). רק ID tokens, לא חתימות:
gcloud iam service-accounts add-iam-policy-binding $SA --project appout-1 \
  --role roles/iam.serviceAccountOpenIdTokenCreator --member "serviceAccount:$SA"
```

### 3. הרשאות של qa-runner
```bash
# Firestore (ממצאים, עלות, פעימת חיים). שים לב: זו הרשאת קריאה/כתיבה לכל Firestore —
# ההגבלה לנתיבים של ה-runner היא בקוד (lib/store.ts). אין לו Auth ואין לו חתימת טוקנים.
gcloud projects add-iam-policy-binding appout-1 --member "serviceAccount:$SA" --role roles/datastore.user

# Storage: יצירת קבצים בלבד (לא מחיקה ולא דריסה), רק תחת qa/
gcloud storage buckets add-iam-policy-binding gs://appout-1.firebasestorage.app \
  --member "serviceAccount:$SA" --role roles/storage.objectCreator \
  --condition='expression=resource.name.startsWith("projects/_/buckets/appout-1.firebasestorage.app/objects/qa/"),title=qa-only'
```
אם ה-bucket לא מאפשר תנאים (בלי uniform bucket-level access), הרץ בלי `--condition`.

### 4. פריסת הפונקציה
```bash
firebase deploy --only functions:mintDemoTesterToken --project appout-1

# רק qa-runner רשאי לקרוא לה:
gcloud functions add-invoker-policy-binding mintDemoTesterToken --region us-central1 --project appout-1 \
  --member "serviceAccount:$SA"
```
- הפונקציה חותמת טוקנים עם ה-service account שהיא רצה בו. אם בהרצה הראשונה מופיעה שגיאת `iam.serviceAccounts.signBlob`, תן לו `roles/iam.serviceAccountTokenCreator` על עצמו (ברירת המחדל: `PROJECT_NUMBER-compute@developer.gserviceaccount.com`).
- כתובת ברירת המחדל: `https://us-central1-appout-1.cloudfunctions.net/mintDemoTesterToken`. אם הפריסה מדפיסה כתובת אחרת, שים אותה במשתנה `QA_MINT_URL` ב-GitHub וב-`functions/.env` כ-`QA_MINT_AUDIENCE` (ואז פרוס שוב).

### 5. App Check debug token (רק לדפדפן של הבודק)
Firebase Console → App Check → Apps → אפליקציית הווב → Manage debug tokens → Add. שמור את הערך כסוד `APPCHECK_DEBUG_TOKEN` (סעיף 6). אפשר לבטל אותו בכל רגע מאותו מסך. הוא מוזרק רק לדפדפן של הבודק, לא לאפליקציה.

### 6. סודות ומשתנים ב-GitHub (Settings → Secrets and variables → Actions)
| סוג | שם | ערך |
|---|---|---|
| Secret | `ANTHROPIC_DEMO_KEY` | מפתח Anthropic ייעודי לבודקים, עם תקרת הוצאה חודשית ב-Console |
| Secret | `APPCHECK_DEBUG_TOKEN` | מסעיף 5 |
| Variable | `QA_WIF_PROVIDER` | `projects/<PROJECT_NUMBER>/locations/global/workloadIdentityPools/github/providers/out-run-app` |
| Variable | `QA_RUNNER_SA` | `qa-runner@appout-1.iam.gserviceaccount.com` |
| Variable (רשות) | `QA_MINT_URL` | רק אם הכתובת שונה מברירת המחדל |
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
  npx tsx scripts/qa/overseer.ts --run-id <runId> --out ../agent-briefs/qa-reports --no-summary
  ```

### עלות (סדר גודל)
סשן של 40 צעדים עם Sonnet: בערך $0.7–1.2. הרצה של 3 סשנים: בערך $2–4. התקרה היומית עוצרת בכל מקרה.

---

## מגבלות ידועות
- **ID token של שעה:** ה-workflow מקבל ID token אחד. ה-runner לא מתחיל סשן כשנשארו פחות מ-5 דקות, ולכן הרצה אחת היא בפועל עד ~3 סשנים. מספיק לשלב הזה.
- **לא נבדק עדיין מול פרודקשן (ספייק B0):** האם App Check מקבל את ה-debug token בדפדפן אוטומטי, האם משתמש חדש עם custom token מגיע לאונבורדינג נקי, והאם הנגן מחשב מהירות כשהדפדפן לא שולח `speed`. ההרצה הראשונה היא הספייק — מומלץ `max_sessions=1`.
- **בחירת עיר:** המשימות מבקשות מהבודק לבחור עיר "דמו · …". חוקי ארגז החול חוסמים שמירה של עיר אמיתית לשחקן דמו.
- **רק דפדפן:** GPS ברקע, wake lock, מקלדת iOS אמיתית, התראות ו-HealthKit לא נבדקים כאן.
- **המפקח דטרמיניסטי:** מאחד לפי חוק × מסך, בלי מודל. איחוד סמנטי ("אותה בעיה בשלושה מסכים") — בשלב הבא אם יהיה צורך.
