/**
 * scripts/audit/build-time-vs-reps.ts — READ ONLY. No Firestore writes, no
 * value fixes. One-off audit of the `exercises` collection's type-related
 * fields (docs/workout-engine/06-TIME-VS-REPS.md, task Part 2).
 *
 * Reads RAW Firestore docs (not getAllExercises()/normalizeExercise()) —
 * normalizeExercise defaults `type` to 'reps' when absent
 * (exercise-mapping.utils.ts), which would make "type missing entirely"
 * (one of the four patterns this audit must count) invisible. Same
 * rationale as exercise-catalog-audit.ts.
 *
 * Cross-references, per exercise: type, loggingMode, mechanicalType,
 * movementGroup, name. Flags:
 *   1. type='reps' but mechanicalType='straight_arm' — isTimeBasedExercise
 *      already overrides this at runtime (mechanicalType wins) and logs a
 *      console.warn every time it fires; this counts how many exercises
 *      trigger that warning on every single generation.
 *   2. type='reps' but name contains a hold-keyword (החזק/פלאנק/hold/plank/
 *      hang) — same runtime override via the name-heuristic fallback (fixed
 *      this session to also match 'פלאנק' — see workout-budgeting.utils.ts).
 *   3. type='time' but movementGroup is one of the always-dynamic groups
 *      (squat/hinge/lunge/vertical_push/horizontal_push/vertical_pull/
 *      horizontal_pull) — isTimeBasedExercise's DYNAMIC_MOVEMENT_GROUPS
 *      guard would force this back to false, contradicting the explicit
 *      CMS tag entirely (type says time, engine says reps).
 *   4. type missing entirely — falls through to the mechanicalType/
 *      movementGroup/name heuristics with zero explicit signal from the CMS.
 *
 * Also reports (bonus, not one of the four requested patterns, but
 * discovered while building this): ExerciseType has a third value, 'rest',
 * that isTimeBasedExercise never checks for explicitly — a `type:'rest'`
 * exercise falls through to the same heuristics as a missing type.
 *
 * Run:  npx tsx scripts/audit/build-time-vs-reps.ts
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const OUT_MD_PATH = path.join(REPO_ROOT, 'docs', 'workout-engine', '06-TIME-VS-REPS.md');

const DYNAMIC_MOVEMENT_GROUPS = new Set([
  'vertical_pull', 'horizontal_pull',
  'vertical_push', 'horizontal_push',
  'squat', 'hinge', 'lunge',
]);

// Same keyword set as the (now-fixed) isTimeBasedExercise name heuristic —
// deliberately duplicated here rather than imported, since this script reads
// RAW docs (no Exercise-shaped object to pass to the real function) and this
// audit's whole point is to check the CMS field against what the heuristic
// WOULD catch, not to re-run the production function itself.
const HOLD_KEYWORDS = ['hold', 'plank', 'hang', 'החזק', 'פלאנק'];

function initFirebase() {
  if (admin.apps.length) return;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY not set in .env.local');
  const c = JSON.parse(raw);
  admin.initializeApp({ credential: admin.credential.cert(c as any), projectId: c.project_id });
}

function getName(data: any): string {
  const n = data?.name;
  if (!n) return '(no name)';
  if (typeof n === 'string') return n;
  return n.he || n.en || n.es || '(no name)';
}

function hasHoldKeyword(name: string): boolean {
  const lower = name.toLowerCase();
  return HOLD_KEYWORDS.some((kw) => lower.includes(kw));
}

async function main() {
  initFirebase();
  const db = admin.firestore();

  console.log('Reading exercises (raw)…');
  const snap = await db.collection('exercises').get();
  const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as any));
  console.log(`Total exercises: ${docs.length}`);

  // Pattern 1: type='reps' but mechanicalType='straight_arm'
  const p1 = docs.filter((d) => d.type === 'reps' && d.mechanicalType === 'straight_arm');

  // Pattern 2: type='reps' but name contains a hold-keyword
  const p2 = docs.filter((d) => d.type === 'reps' && hasHoldKeyword(getName(d)));

  // Pattern 3: type='time' but movementGroup is dynamic
  const p3 = docs.filter((d) => d.type === 'time' && DYNAMIC_MOVEMENT_GROUPS.has(d.movementGroup ?? ''));

  // Pattern 4: type missing entirely
  const p4 = docs.filter((d) => d.type === undefined || d.type === null || d.type === '');

  // Bonus: type='rest'
  const pRest = docs.filter((d) => d.type === 'rest');

  // type distribution overall
  const typeDist = new Map<string, number>();
  for (const d of docs) {
    const key = d.type === undefined || d.type === null || d.type === '' ? '(missing)' : String(d.type);
    typeDist.set(key, (typeDist.get(key) ?? 0) + 1);
  }

  // loggingMode distribution + cross-tab vs type (requested field, reported
  // even though it turned out to belong to a different subsystem — see
  // report body)
  const loggingModeDist = new Map<string, number>();
  for (const d of docs) {
    const key = d.loggingMode === undefined || d.loggingMode === null || d.loggingMode === '' ? '(missing)' : String(d.loggingMode);
    loggingModeDist.set(key, (loggingModeDist.get(key) ?? 0) + 1);
  }

  const results = { total: docs.length, p1, p2, p3, p4, pRest, typeDist: Object.fromEntries(typeDist), loggingModeDist: Object.fromEntries(loggingModeDist) };

  console.log('Pattern 1 (reps + straight_arm):', p1.length);
  console.log('Pattern 2 (reps + hold-name):', p2.length);
  console.log('Pattern 3 (time + dynamic group):', p3.length);
  console.log('Pattern 4 (type missing):', p4.length);
  console.log('Bonus (type=rest):', pRest.length);
  console.log('type distribution:', results.typeDist);
  console.log('loggingMode distribution:', results.loggingModeDist);

  // ── Write the markdown report ──────────────────────────────────────────
  const esc = (s: string) => s.replace(/\|/g, '\\|');
  const row = (d: any, extra: string) =>
    `| ${esc(getName(d))} | \`${d.type ?? '—'}\` | \`${d.loggingMode ?? '—'}\` | \`${d.mechanicalType ?? '—'}\` | \`${d.movementGroup ?? '—'}\` | ${extra} | \`${d.id}\` |`;

  const header = `| שם | type | loggingMode | mechanicalType | movementGroup | הערה | id |\n|---|---|---|---|---|---|---|`;

  const md = `# ביקורת שדה type — סתירות בין reps ל-time

> **קריאה בלבד.** נקרא ישירות מ-\`exercises\` ב-Firestore (raw docs, לא
> \`getAllExercises()\`/\`normalizeExercise\` — הנרמול משלים \`type\` ברירת מחדל
> \`'reps'\` כשהוא חסר, מה שהיה מסתיר בדיוק את הדפוס §4 למטה). ${docs.length} תרגילים
> נסרקו. אלה 4 הדפוסים שהתבקשו + ממצא נוסף שנמצא תוך כדי בנייה.

## רקע — 6 מקורות קוד שנמצאו ותוקנו בסבב הזה (חלק 1, פירוט מלא ב-03-CHANGES.md)

\`isTimeBasedExercise\` (\`workout-budgeting.utils.ts:348\`) דטרמיניסטית וטהורה —
הבעיה מעולם לא הייתה בה, אלא במקומות שדרסו/פספסו אותה במורד הזרם. אומת ישירות:
אותו \`exercise_id\` ("שכיבות סמיכה ברכיים") הופיע ב-snapshot.sqlite עם
\`is_time_based=0\` (55 ריצות) **וגם** \`=1\` (38 ריצות), \`exerciseRole='main'\`
בשני הצדדים — סתירה אמיתית, לא רעש.

| # | קובץ | הבעיה | התיקון |
|---|---|---|---|
| 1 | \`tabata.block.ts\` (pool-injection) | \`isTimeBased:false\` קשיח, בעוד \`reps\` מכיל שניות (\`TABATA_CLASSIC.workSec\`) — סתירה ישירה באותה שורה | \`isTimeBased:true\` — חריג מוצהר ומתועד, הפרוטוקול תמיד תוחם-זמן |
| 2 | \`warmup.service.ts\` | שכפול חלקי של הלוגיקה, בלי היוריסטיקת השם | קריאה ישירה ל-\`isTimeBasedExercise\` |
| 3 | \`cooldown.service.ts\` | שכפול צר ביותר — רק \`type==='time'\`, בלי straight_arm ובלי היוריסטיקת שם | קריאה ישירה ל-\`isTimeBasedExercise\` |
| 4 | \`home-workout.service.ts\` (\`generateRecoveryWorkout\`) | \`reps:15\` קשיח לכולם + שכפול לוגיקה חלקי | קריאה ישירה + \`reps\` נגזר (20 אם זמן, 15 אם לא) |
| 5 | \`trio-modifiers.service.ts\` (\`applyEssentialGearFilter\`, naked-backfill) | \`isTimeBased:false, reps:10\` קשיח לכל תרגיל שנשלף מהמאגר הגולמי | קריאה ישירה + \`reps\` נגזר |
| 6 | \`trio-modifiers.service.ts\` (\`applyFlowRegression\`) | **הכי חמור** — מחליף \`ex.exercise\` לגמרי (רמת-רגרסיה, בולט 1) בלי לחשב מחדש \`isTimeBased\`/\`mechanicalType\` בכלל — התרגיל החדש יורש את הטבע של הישן | חישוב מחדש מיד אחרי ההחלפה |

בנוסף: \`isTimeBasedExercise\` עצמה תוקנה — \`getLocalizedText\` בררת מחדל ל-'he',
והקטלוג הזה עברית-בלבד בפועל, כך שהיוריסטיקת השם (hold/plank/hang, לטינית)
כמעט אף פעם לא ירתה על דאטה אמיתי. נוסף \`'פלאנק'\` כמילת מפתח עברית מפורשת —
נמצא ישירות דרך כתיבת הטסטים לתיקון הזה, לא ניחוש.

**כל הנתיבים האלה תוקנו ואומתו: קריאה חוזרת אמיתית של \`generateHomeWorkoutTrio\`
אחרי כל תיקון אישרה שהסתירה נעלמה בדיוק בנקודה שאותרה.** נתיבים נוספים שנבדקו
ואומתו כבר נכונים (לא תוקנו כי אין בהם באג): \`WorkoutGenerator.ts\`'s David Rule,
\`applyIntenseOption\`, \`pyramid.processor.ts\`, שלושת מעברי \`GuaranteePassRunner.ts\`
(דרך \`substituteExercise\` המשותפת), \`assignVolume\` (הנתיב הראשי), \`applySmartSetCap\`
(לא נוגע ב-isTimeBased כלל — רק בכמות סטים). שני מקומות עם \`isTimeBased:true\`
קשיח נבדקו ואומתו כתקינים בכוונה — לא תוקנו: \`home-workout.service.ts\` ו-
\`recovery-video-content.service.ts\`'s "אימון וידאו ליום מנוחה" (sets:1/reps:1 —
בנאי UI לצפייה בסרטון, לא נתון reps/זמן אמיתי).

**התפלגות \`type\` בקטלוג:**

| ערך | ספירה |
|---|---|
${Object.entries(results.typeDist).map(([k, v]) => `| \`${k}\` | ${v} |`).join('\n')}

**התפלגות \`loggingMode\` בקטלוג** (נדרש לצלוב, אבל ראו הערה למטה — שדה ממערכת אחרת):

| ערך | ספירה |
|---|---|
${Object.entries(results.loggingModeDist).map(([k, v]) => `| \`${k}\` | ${v} |`).join('\n')}

**הערה על \`loggingMode\`:** \`LoggingMode = 'reps' | 'completion'\` — שדה נפרד
מ-\`ExerciseType\`, לא קשור ללוגיקת reps-מול-time של \`isTimeBasedExercise\`. נבדק
ישירות בקוד: הצריכה היחידה שלו במנוע היא \`hybrid/station-content-resolver.ts\`
(תחום נפרד — תחנות פארק/hybrid, לא מסלול האימון הרגיל). הוצג כאן כי התבקש
במפורש, לא כי הוא חלק מהבאג.

---

## 1. \`type='reps'\` אבל \`mechanicalType='straight_arm'\` — ${p1.length} תרגילים

\`isTimeBasedExercise\` כבר דורס את זה בזמן ריצה (straight_arm מנצח, ומדפיס
\`console.warn\` על כל קריאה) — כלומר **כל אחד מ-${p1.length} האלה מדפיס אזהרה בכל
פעם שהוא נבחר לאימון.** זה תיקון פאנל טהור: לשנות \`type\` ל-\`'time'\` בכל שורה.

${p1.length > 0 ? header + '\n' + p1.map((d) => row(d, '')).join('\n') : '_(אין)_'}

---

## 2. \`type='reps'\` אבל השם מכיל מילת-מפתח החזקה — ${p2.length} תרגילים

מילות המפתח שנבדקות: hold/plank/hang/החזק/פלאנק (הרשימה המלאה של
\`isTimeBasedExercise\`, אחרי התיקון לפרומט הזה שהוסיף 'פלאנק' — ראו
03-CHANGES.md). כמו קטגוריה 1 — נדרס בזמן ריצה, אבל שדה \`type\` בפאנל שגוי.

${p2.length > 0 ? header + '\n' + p2.map((d) => row(d, '')).join('\n') : '_(אין)_'}

---

## 3. \`type='time'\` אבל \`movementGroup\` דינמי (סקוואט/היפ-הינג'/לאנג'/דחיפה/משיכה) — ${p3.length} תרגילים

**תוקן כאן לפני הפרסום — הבדיקה הראשונית שלי הייתה שגויה, מתועד כדי לא לחזור על
הטעות:** ניחשתי ש-DYNAMIC_MOVEMENT_GROUPS דורס \`type='time'\` בחזרה ל-\`false\`,
כמו שהוא דורס את ברירת המחדל. **בדקתי ישירות מול הקוד ולא כך — \`type==='time'\`
הוא הבדיקה הראשונה בפונקציה ומחזיר \`true\` באופן מיידי, לפני שה-DYNAMIC_MOVEMENT_
GROUPS guard נבדק בכלל.** אומת ריצה אמיתית: \`isTimeBasedExercise({type:'time',
movementGroup:'vertical_pull', ...})\` → \`true\`. **כלומר אין כאן באג פונקציונלי —
כל ${p3.length} האלה כן יוצגו נכון כ"זמן".**

מה שכן נשאר פה מעניין: ${p3.length} תרגילים (60% מתוך 91 תרגילי \`type='time'\`
בקטלוג כולו) הם החזקות/סקילים ש-\`movementGroup\` שלהם מקובע למשפחה
"דינמית"-לכאורה (vertical_pull/horizontal_push/squat וכו'). זה **כנראה תקין
בכוונה** — למשל "החזקת מתח ב-15°" שייך למסלול/סולם הרמות של vertical_pull
(פרוגרסיית משיכה), לא לתוכנית סקיל נפרדת — בדיוק כמו שתרגילי דגל שייכים
ל-human_flag ולא ל-core (00-PLAN.md §12.3, טופל בסבב קודם). **לא תוקן כאן —
זו לא סתירה פונקציונלית, ולא ברור שהיא בכלל טעות תיוג. מסומן לעיון דוד, לא
לתיקון.**

${p3.length > 0 ? header + '\n' + p3.map((d) => row(d, '')).join('\n') : '_(אין)_'}

---

## 4. \`type\` חסר לגמרי — ${p4.length} תרגילים

אלה נופלים ישירות להיוריסטיקות (mechanicalType → movementGroup → שם) בלי שום
איתות מפורש מה-CMS. לא בעיה בפני עצמה (ה-fallback עובד), אבל כל אחד מהם תלוי
לגמרי בכך שהשם/mechanicalType/movementGroup שלו נכונים — אין רשת ביטחון שנייה.

${p4.length > 0 ? header + '\n' + p4.map((d) => row(d, '')).join('\n') : '_(אין)_'}

---

## בונוס — \`type='rest'\` — ${pRest.length} תרגילים

\`ExerciseType\` מוגדר כ-\`'reps' | 'time' | 'rest'\` — ערך שלישי ש-\`isTimeBasedExercise\`
**לא בודק במפורש בכלל**. תרגיל עם \`type:'rest'\` נופל לאותן היוריסטיקות כמו \`type\`
חסר (קטגוריה 4) — אין טיפול ייעודי ל-\`'rest'\`. לא ברור אם זה תקין (אולי 'rest'
אמור בכלל לא להיכנס לזרימת reps/time הזו) — מסומן לבירור, לא תוקן כאן (מחוץ
לתחום ה-4 הדפוסים המבוקשים).

${pRest.length > 0 ? header + '\n' + pRest.map((d) => row(d, '')).join('\n') : '_(אין)_'}
`;

  fs.writeFileSync(OUT_MD_PATH, md, 'utf-8');
  console.log(`Wrote ${OUT_MD_PATH}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
