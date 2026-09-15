---
name: panel-split-branch-summary
description: Review package for commit 690f5bdd — /admin/unreachable-exercises NO_LEVEL 3-way split (parked/prep-content/hygiene), for David's separate review chat
metadata:
  type: project
---

**סטטוס: מקומי בלבד. לא נדחף, לא ממוזג. ממתין לביקורת בצ'אט נפרד.**

Branch: `tmp-flag-flip`, 2 קומיטים מעל `origin/main` (`35176c60`):
- `690f5bdd` — הפיצ'ר עצמו (זה שביקשת ביקורת עליו)
- `98ef75ed` — תיקון-תיעוד נפרד וקטן (מתקן טקסט בקובץ הידע, לא נוגע בקוד; הוסיפו אחרי הפיצ'ר בעקבות ממצא-הפיסטול)

---

## 1. מה בדיוק השתנה — נתיב:שורה

**קובץ יחיד משתנה בקוד:** `src/app/admin/unreachable-exercises/page.tsx` (+112/-4 שורות).
**קובץ חדש:** `.claude/knowledge/exercises-without-level-parked.md` (תיעוד, לא קוד).

| מה | נתיב:שורה (במצב הנוכחי של הקובץ) |
|---|---|
| טיפוס `NoLevelSubcategory` | `page.tsx:201` |
| `PARKED_STRENGTH_IDS` (18 IDs) | `page.tsx:205-211` |
| `DATA_HYGIENE_IDS` (2 IDs) | `page.tsx:221-223` |
| `classifyNoLevelSubcategory(id)` | `page.tsx:225-229` |
| `NO_LEVEL_SUBCATEGORY_META` (תוויות+צבעים) | `page.tsx:233-237` |
| שדה `noLevelSubcategory?` ב-`UnreachableRow` | `page.tsx:262` |
| חישוב בפועל, בתוך לולאת-הסריקה הראשית | `page.tsx:416` (`const noLevelSubcategory = hasLevel ? undefined : classifyNoLevelSubcategory(ex.id);`) |
| הצבה ל-row המחושב | `page.tsx:538` |
| state לסינון-משני | `page.tsx:383` (`const [noLevelSubFilter, setNoLevelSubFilter] = useState<NoLevelSubcategory \| 'all'>('all');`) |
| `noLevelSubCounts` (ספירה חיה, `useMemo`) | `page.tsx:582-588` |
| `filteredRows` — תנאי-הסינון הנוסף | בתוך `useMemo` הקיים, מייד אחרי תנאי `reasonFilter` הראשי |
| כרטיסיית-UI "פירוט 'אין רמה'" + 3 תת-כפתורים | `page.tsx:683-710` (מתחת לכרטיסי-הסיבה הראשיים, מוצגת רק כש-`reasonCounts.NO_LEVEL > 0`) |
| איפוס `noLevelSubFilter` בלחיצה על כרטיס-סיבה ראשי / "נקה סינון" | שני ה-`onClick` הקיימים של אותם כפתורים, עודכנו לקרוא גם ל-`setNoLevelSubFilter('all')` |

**לא נגעתי:** ב-11 קטגוריות-הסיבה האחרות (`NO_ROLE_OR_TAG`, `NO_EXECUTION_METHODS` וכו'), בלוגיקת-הסריקה הקיימת, ב-CSV export, בטעינת-הנתונים (`getAllExercises`), או בכל query/write אחר.

---

## 2. שני ה-Set הקשיחים, במלואם

```ts
// David's decision (15.09.2026): held pending a product decision on these 18
// exercises. Not a bug — do not re-surface as a finding in any report.
const PARKED_STRENGTH_IDS = new Set<string>([
  'CQtZDiAEvfNB8khudfsG', 'LitmztKbOSD9MvQwBDsE', 'TZMFGuNweuAnTLIjyhkx',
  'UmPbE7WydxjOSw5UlDIT', 'Vr2htqrpnuBObpjzzzyj', 'ZovShNVtJBRPgdwsngxr',
  'gGlZXMEjhAXTxxmO3hTN', 'niIBVtXV75LjFsWNJp0k', 'nrPxCJYZtHAyRF6Iywry',
  '3dIrpJQHp5QbimPVTZDk', '4kww5BB13UkNaaAjZKS0', 'f4ZbXHOaV5lRTC9JQPkk',
  'nunGVGOEmOMnxiwh7jcu', 'hB253EVZ8ksjQyve6TOu', 'hECufw1PU0a0lcUEadY9',
  'sgjfCmExjbU1CTmSxoMu', 'vUt6DeXfFk9zvRO5IQza', 'xeo8dpAwk2pNe0IuokLk',
]);

// qHy5Te1jSPSi5jA3W9d6 — no resolvable name in any language (he/en/es all
// empty/absent). sgrEdIolfxaRCgz8Oqyp — "עותק של פיסטול סקוואט שלילי שמאל":
// verified 15.09.2026 this is NOT a duplicate (no exercise named "פיסטול
// סקוואט שלילי שמאל" exists without the "עותק של" prefix) — it's an
// unfinished left-side document, missing movementGroup/tags/exerciseRole/
// targetPrograms entirely. Both are data-quality issues, not content David
// needs to make a product call on.
const DATA_HYGIENE_IDS = new Set<string>([
  'qHy5Te1jSPSi5jA3W9d6', 'sgrEdIolfxaRCgz8Oqyp',
]);
```

**נימוק — למה סיווג ידני-קשיח ולא נגזר משדה:** שלוש הקבוצות ("חוזק שהוחזק לדיון", "תוכן-הכנה שלא רלוונטי", "היגיינת-נתונים") הן שיפוט-מוצרי של דוד, לא מאפיין-נתונים קיים. אין שדה ב-`Exercise` (לא `exerciseRole`, לא `tags`, לא `movementGroup`) שמבחין בין "גומייה שממתינה להחלטה" ל"מתיחה שלא צריכה רמה" — שניהם `exerciseRole=null`/`tags=[]` זהים לגמרי במבנה. הדרך היחידה לשמר את ההחלטה הזו היא לרשום אותה במפורש, פעם אחת, לפי ID. זה **בכוונה** לא היוריסטיקה (למשל "כל שם עם 'בהתנגדות גומיה' = מוחזק") — היוריסטיקה כזו הייתה שברירית (תרגיל-גומייה עתידי-חדש היה נכנס אוטומטית לקטגוריה בלי שדוד בכלל ראה אותו) ולא באמת "החלטת דוד", רק ניחוש שמחקה אותה.

---

## 3. מה קורה לתרגיל שאינו באף Set

**נופל ל-`PREP_CONTENT` כברירת-מחדל** (`classifyNoLevelSubcategory`, שורה 225-229 — `if...return 'PARKED_STRENGTH'; if...return 'DATA_HYGIENE'; return 'PREP_CONTENT';`). זו ברירת-המחדל הבטוחה ביותר מבין השלוש: היא **לא** טוענת "זה החלטה-של-דוד" (כמו PARKED) ו**לא** טוענת "זה בעיית-נתונים" (כמו HYGIENE) — רק "לא סווג עדיין, מוצג בקבוצה הכי-נמוכת-סיכון".

זה חל על **כל** תרגיל NO_LEVEL עתידי — כולל אחד שבאמת שייך ל-PARKED_STRENGTH או ל-DATA_HYGIENE מבחינה מהותית, אבל טרם עודכן ידנית בשני ה-Set. אין מנגנון-זיהוי אוטומטי לכך (ר' סעיף 4).

---

## 4. מה קורה אם דוד ישנה תרגיל בפאנל — הסיווג הידני והתיישנות

**שני מסלולים שונים לגמרי, לפי סוג-השינוי:**

**א. דוד מוסיף רמה אמיתית לאחד מ-18 המוחזקים (`targetPrograms`/`programIds`)** — **לא מתיישן, מתעדכן אוטומטית ונכון.** `hasLevel` הופך `true` → `reasons` לא כולל יותר `'NO_LEVEL'` בכלל → התרגיל יוצא **מכל** התצוגה של "אין רמה", כולל משלוש התת-הקטגוריות. ה-ID נשאר יושב בתוך `PARKED_STRENGTH_IDS` (שורת-קוד מתה, לא-מזיקה) עד שמישהו ינקה אותה ידנית מהרשימה — לא גורם לשום תצוגה שגויה, כי `classifyNoLevelSubcategory` נקרא רק כש-`!hasLevel`.

**ב. דוד עורך שדה אחר (שם, movementGroup, תגיות, execution_methods) בלי לגעת ברמה** — **לא מתיישן.** ההתאמה היא לפי `id` (Firestore doc ID, קבוע), לא לפי תוכן — כל שינוי שלא נוגע ב-`targetPrograms`/`programIds` לא משפיע על הסיווג.

**ג. דוד מוחק תרגיל מוחזק/היגיינה** — ה-ID נשאר ב-Set כרשומה-מתה (לא-מזיקה, לא-נראית — התרגיל כבר לא קיים ב-`allExercises` אז אף פעם לא נבדק מולו).

**ד. דוד יוצר תרגיל-חדש שמבחינה מהותית שייך ל-PARKED/HYGIENE אבל לא נמצא בסקירה של 14-15.09.2026** — **כן מתיישן, ואין מנגנון שיודיע על כך.** זה הפער האמיתי: התרגיל ייפול ל-`PREP_CONTENT` כברירת-מחדל (סעיף 3) בלי שום אזהרה — לא console warning, לא badge, לא כלום. **מישהו יֵדע רק אם יפתח את הפאנל ויבחין ש"לא רלוונטי" גדל במספר לא-צפוי, או אם יקרא שוב את `.claude/knowledge/exercises-without-level-parked.md` ולא ימצא שם את התרגיל החדש.** אין היום שום automated tripwire לזה — בדיוק כמו שה-Set עצמם הם "רשימה קפואה מנקודת-זמן", לא query חי.

---

## 5. מדידה יחסית — `origin/main` טרי מול הענף

מדידה כפולה, שתיהן היום (15.09.2026), אותה שיטה, `vitest` עם `--exclude tests/firestore-rules.test.ts` (הקובץ הזה תלוי ב-emulator משותף על פורט 8080 עם סשן מקביל אחר — לא רלוונטי לשינוי הזה, שהוא client-component בלבד, אז הודר משתי המדידות באופן זהה כדי שההשוואה תהיה נקייה).

| | `origin/main` (detached HEAD, `35176c60`) | הענף (`98ef75ed`, כולל שני הקומיטים) |
|---|---|---|
| `tsc --noEmit` | **454** | **454** |
| `vitest` (טסטים) | **1807/1808 עוברים** (1 כשל ידוע — streak flaky) | **1807/1808 עוברים** (אותו כשל בדיוק) |
| `vitest` (קבצים) | 200/204 | 200/204 |

**דלתא: אפס בשני המספרים.** צפוי — אין jsdom בריפו, קומפוננטת-React client-side לא ניתנת לבדיקה-אוטומטית (כבר מתועד כפער-ידוע בכל הריפו), אז אין טסט חדש שיכול להראות שינוי. `tsc` זהה כי כל הטיפוסים החדשים (`NoLevelSubcategory`, ה-Sets) תקינים ללא שגיאה.

---

## 6. QA ידני מומלץ (לביקורת, לא בוצע על-ידי)

1. לפתוח `/admin/unreachable-exercises`, ללחוץ על כרטיס "אין רמה" הראשי — לוודא שהכרטיסייה "פירוט 'אין רמה'" מופיעה עם 3 מספרים שמסתכמים בדיוק לכרטיס הראשי (18+41+2=61 נכון להיום, נתון לשינוי אם מישהו כבר ערך תרגיל).
2. ללחוץ על כל אחד משלושת תתי-הכפתורים בנפרד — לוודא שהטבלה מסתננת נכון, ושה"נקה סינון" מציג גם את שם-תת-הקטגוריה.
3. ללחוץ על כרטיס-סיבה אחר (למשל "אין role/תג") — לוודא שהכרטיסייה המשנית נעלמת/לא-רלוונטית, וש-`noLevelSubFilter` התאפס (לא "דולף" לסינון הבא).
