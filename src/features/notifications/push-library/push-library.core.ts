/**
 * Push library core: the ONE definition of every push the app sends
 * (catalog), the write rules for its copy, and the pure selection logic that
 * picks a row for one user.
 *
 * Code decides WHEN a push is sent (each sender in functions/src keeps its
 * own timing/caps). This module and the admin-editable library decide WHAT
 * it says. The library lives in the existing Notification Manager collection
 * (`workoutMetadata/notifications/notifications`), one Firestore doc per
 * variant, extended with pushType/title/body/deepLink/audience/... fields.
 * Rows without a pushType (the original content library) are adapted by the
 * server (functions/src/services/push-copy.service.ts) and stay readable.
 *
 * Used by:
 *   - the admin panel (/admin/notifications/library): catalog, editor
 *     validation, preview with sample values
 *   - Cloud Functions, via functions/src/shared/push-library.core.ts, a
 *     committed byte-for-byte mirror that
 *     functions/scripts/vendor-copy-geo-discovery.js rewrites on every
 *     functions build (a root vitest pins it, so the two can't drift).
 *
 * Gender (Hebrew verbs and adjectives agree with a person's gender). Copy
 * never uses slashes ("יוצא/ת"). Instead a row can be written for one gender:
 *
 *   gender         'both' (default) | 'male' | 'female'
 *                  the RECIPIENT's gender (users/{uid}.core.gender).
 *                  'other' or unknown → only 'both' rows.
 *   subjectGender  'any' (default) | 'male' | 'female'
 *                  the gender of ANOTHER person the push talks about, for
 *                  the pushTypes whose catalog entry declares `subject`:
 *                  partner_plan → who planned the session (@שולח),
 *                  group_join_admin → who joined (@מצטרף),
 *                  kudos_single → who sent the kudos (@שולח).
 *                  The sender passes it as ctx.subjectGender.
 *   pairId         ties a male row to its female twin (the editor edits a
 *                  pair side by side and warns when one side is missing).
 *
 * A row is gendered on ONE axis (recipient or subject), never both. A
 * gendered row counts as one more dimension of specificity, so the chain is:
 * exact gender → 'both'/'any' rows → code defaults (same rules).
 *
 * KEEP THIS FILE IMPORT-FREE AND PURE: it is mirrored into Cloud Functions.
 */

// ─── Storage ──────────────────────────────────────────────────────────────────

export const PUSH_LIBRARY_COLLECTION = 'workoutMetadata/notifications/notifications';

/** Write rules (owner's spec, "ספריית הפושים בפאנל"). */
export const PUSH_TITLE_MAX = 40;
export const PUSH_BODY_MAX = 90;

// ─── Gender ───────────────────────────────────────────────────────────────────

export type PushGender = 'male' | 'female';
/** Row field: whom the copy is written for (the recipient). */
export type PushRowGender = 'both' | PushGender;
/** Row field: the gender of the other person the copy talks about. */
export type PushRowSubjectGender = 'any' | PushGender;
/** Which person a gendered row agrees with. */
export type PushGenderAxis = 'none' | 'recipient' | 'subject';

export const PUSH_GENDER_LABEL: Record<PushGender, string> = { male: 'זכר', female: 'נקבה' };

/** users/{uid}.core.gender ('male' | 'female' | 'other') → a gender copy can agree with, or null. */
export function normalizePushGender(v: unknown): PushGender | null {
  return v === 'male' || v === 'female' ? v : null;
}

function rowGender(v: unknown): PushRowGender {
  return v === 'male' || v === 'female' ? v : 'both';
}

function rowSubjectGender(v: unknown): PushRowSubjectGender {
  return v === 'male' || v === 'female' ? v : 'any';
}

/** The axis a row is gendered on ('none' = neutral copy). */
export function genderAxisOf(row: { gender?: unknown; subjectGender?: unknown }): PushGenderAxis {
  if (rowSubjectGender(row.subjectGender) !== 'any') return 'subject';
  if (rowGender(row.gender) !== 'both') return 'recipient';
  return 'none';
}

/** The gender a row is written for on its axis (null for a neutral row). */
export function genderSideOf(row: { gender?: unknown; subjectGender?: unknown }): PushGender | null {
  const sg = rowSubjectGender(row.subjectGender);
  if (sg !== 'any') return sg;
  const g = rowGender(row.gender);
  return g === 'both' ? null : g;
}

// ─── Levers ───────────────────────────────────────────────────────────────────

export type PushLever = 'routine' | 'streak' | 'social' | 'competition' | 'progress';

export const PUSH_LEVERS: ReadonlyArray<{ id: PushLever; label: string }> = [
  { id: 'routine', label: 'שגרה' },
  { id: 'streak', label: 'רצף' },
  { id: 'social', label: 'חברתי' },
  { id: 'competition', label: 'תחרות' },
  { id: 'progress', label: 'התקדמות' },
];

// ─── Audience ─────────────────────────────────────────────────────────────────

export const PUSH_PERSONAS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'parent', label: 'הורים' },
  { id: 'student', label: 'סטודנטים' },
  { id: 'pupil', label: 'תלמידים' },
  { id: 'office_worker', label: 'עובדי משרד' },
  { id: 'military', label: 'צבא' },
  { id: 'vatikim', label: 'ותיקים' },
  { id: 'pro_athlete', label: 'ספורטאים' },
];

export const PUSH_AGE_BANDS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'under_18', label: 'עד 18' },
  { id: '18_29', label: '18 עד 29' },
  { id: '30_44', label: '30 עד 44' },
  { id: '45_59', label: '45 עד 59' },
  { id: '60_plus', label: '60 ומעלה' },
];

/** users/{uid}.core.mainGoal values. */
export const PUSH_PRIMARY_GOALS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'healthy_lifestyle', label: 'אורח חיים בריא' },
  { id: 'performance_boost', label: 'שיפור ביצועים' },
  { id: 'weight_loss', label: 'ירידה במשקל' },
  { id: 'skill_mastery', label: 'שליטה במיומנויות' },
];

export interface PushAudienceFilter {
  persona?: string[];
  ageBand?: string[];
  primaryGoal?: string[];
}

/** One user's audience values (null = unknown, so a row targeting that dimension won't match). */
export interface PushAudience {
  persona?: string | null;
  ageBand?: string | null;
  primaryGoal?: string | null;
  /** The recipient's gender (users core.gender). null/'other' → only 'both' rows. */
  gender?: PushGender | null;
}

export function ageBandFromBirthDate(birthMillis: number | null | undefined, now: Date = new Date()): string | null {
  if (typeof birthMillis !== 'number' || !Number.isFinite(birthMillis)) return null;
  const birth = new Date(birthMillis);
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const beforeBirthday =
    now.getUTCMonth() < birth.getUTCMonth() ||
    (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() < birth.getUTCDate());
  if (beforeBirthday) age -= 1;
  if (age < 5 || age > 120) return null;
  if (age < 18) return 'under_18';
  if (age < 30) return '18_29';
  if (age < 45) return '30_44';
  if (age < 60) return '45_59';
  return '60_plus';
}

// ─── Variables ────────────────────────────────────────────────────────────────

export type PushVarKey =
  | '@שם'
  | '@רצף'
  | '@צעדים_שנותרו'
  | '@דקות'
  | '@מרחק'
  | '@שעה'
  | '@מקום'
  | '@קבוצה'
  | '@שולח'
  | '@מצטרף'
  | '@רמה'
  | '@תוכנית'
  | '@ימים'
  | '@אימון'
  | '@כמות'
  | '@עוד';

export interface PushVariableDef {
  key: PushVarKey;
  label: string;
  sample: string;
}

/** Every variable any sender fills. A pushType allows only the subset its sender really fills. */
export const PUSH_VARIABLES: ReadonlyArray<PushVariableDef> = [
  { key: '@שם', label: 'השם הפרטי של המשתמש', sample: 'דנה' },
  { key: '@רצף', label: 'ימים ברצף (רק מ-2 ומעלה)', sample: '5' },
  { key: '@צעדים_שנותרו', label: 'צעדים שנשארו ליעד היומי', sample: '2,400' },
  { key: '@דקות', label: 'דקות הליכה שסוגרות את היעד', sample: '20' },
  { key: '@מרחק', label: 'מרחק ההליכה שסוגר את היעד', sample: '1.8 ק"מ' },
  { key: '@שעה', label: 'שעת האימון', sample: '18:30' },
  { key: '@מקום', label: 'שם הגינה או המסלול', sample: 'גן הבנים' },
  { key: '@קבוצה', label: 'שם הקבוצה', sample: 'רצים בפארק' },
  { key: '@שולח', label: 'מי ששלח או יזם', sample: 'נועה' },
  { key: '@מצטרף', label: 'מי שהצטרף לקבוצה', sample: 'יואב' },
  { key: '@רמה', label: 'הרמה החדשה', sample: '5' },
  { key: '@תוכנית', label: 'שם התוכנית הפעילה', sample: 'כוח לכל הגוף' },
  { key: '@ימים', label: 'ימים מאז האימון האחרון', sample: '9' },
  { key: '@אימון', label: 'סוג האימון המתוכנן', sample: 'אימון כוח' },
  { key: '@כמות', label: 'כמה כיפים התקבלו', sample: '4' },
  { key: '@עוד', label: 'כמה אנשים נוספים שלחו', sample: '3' },
];

const VARIABLE_BY_KEY: Record<string, PushVariableDef> = Object.fromEntries(
  PUSH_VARIABLES.map((v) => [v.key, v]),
);

export function isKnownPushVar(token: string): token is PushVarKey {
  return token in VARIABLE_BY_KEY;
}

/** Any @word token (Hebrew letters and underscore), e.g. "@שם", "@צעדים_שנותרו". */
const VAR_TOKEN_RE = /@[\u05D0-\u05EA_]+/g;
/** Old-style {placeholder} tokens. Not allowed in new copy. */
const BRACE_TOKEN_RE = /\{(\w+)\}/g;

export function extractVarTokens(text: string): string[] {
  return Array.from(new Set(text.match(VAR_TOKEN_RE) ?? []));
}

/**
 * The original content library and the old hardcoded senders used {word}
 * placeholders. Legacy rows are read through this map so they keep working;
 * the editor never allows braces in new copy.
 */
export const LEGACY_BRACE_ALIASES: Record<string, PushVarKey> = {
  name: '@שם',
  placeName: '@מקום',
  creatorName: '@שולח',
  time: '@שעה',
  steps_left: '@צעדים_שנותרו',
  days_since: '@ימים',
  group_name: '@קבוצה',
  user_name: '@מצטרף',
  sender_name: '@שולח',
  level: '@רמה',
};

export function normalizeLegacyPlaceholders(text: string): string {
  return text.replace(BRACE_TOKEN_RE, (whole, key: string) => LEGACY_BRACE_ALIASES[key] ?? whole);
}

export type PushVars = Partial<Record<PushVarKey, string | number | null | undefined>>;

// ─── Deep links ───────────────────────────────────────────────────────────────

export interface PushDeepLinkRoute {
  id: string;
  label: string;
  /** Tried in order; the first whose {params} are all present wins. The last one has no params. */
  paths: string[];
}

/** Only routes that exist under src/app (pinned by functions/src/__tests__/pushDeepLinks.test.ts). */
export const PUSH_DEEP_LINK_ROUTES: ReadonlyArray<PushDeepLinkRoute> = [
  { id: 'home', label: 'בית (כרטיס האימון של היום)', paths: ['/home'] },
  { id: 'gateway', label: 'המשך הרשמה (מהשלב שבו עצרו)', paths: ['/gateway'] },
  { id: 'progression', label: 'מסך ההתקדמות', paths: ['/progression'] },
  {
    id: 'progression_map',
    label: 'מפת ההתקדמות של התוכנית',
    paths: ['/progression-map/{programId}', '/progression'],
  },
  { id: 'map', label: 'מפה', paths: ['/map'] },
  { id: 'map_park', label: 'המפה, פתוחה על הגינה', paths: ['/map?openPark={parkId}', '/map'] },
  {
    id: 'map_place',
    label: 'המפה, פתוחה על הגינה או המסלול',
    paths: ['/map?openPark={parkId}', '/map?openRoute={routeId}', '/map'],
  },
  {
    id: 'map_walk',
    label: 'המפה, עם הליכה בגודל הפער ליעד',
    paths: ['/map?openRun=walking&targetSteps={targetSteps}', '/map'],
  },
  { id: 'activity_steps', label: 'מסך הצעדים', paths: ['/activity/steps'] },
  { id: 'community', label: 'קהילה', paths: ['/community'] },
  { id: 'community_group', label: 'דף הקבוצה', paths: ['/community/{groupId}', '/community'] },
];

const ROUTE_BY_ID: Record<string, PushDeepLinkRoute> = Object.fromEntries(
  PUSH_DEEP_LINK_ROUTES.map((r) => [r.id, r]),
);

export type PushLinkParams = Record<string, string | number | null | undefined>;

/** Route id + params → a concrete in-app path. Unknown route → null. */
export function buildDeepLink(routeId: string, params: PushLinkParams = {}): string | null {
  const route = ROUTE_BY_ID[routeId];
  if (!route) return null;
  for (const template of route.paths) {
    let missing = false;
    const path = template.replace(/\{(\w+)\}/g, (_, key: string) => {
      const v = params[key];
      if (v === null || v === undefined || String(v).trim() === '') {
        missing = true;
        return '';
      }
      return encodeURIComponent(String(v));
    });
    if (!missing) return path;
  }
  return null;
}

// ─── Catalog ──────────────────────────────────────────────────────────────────

export interface PushCondition {
  key: string;
  label: string;
  options: ReadonlyArray<{ value: string; label: string }>;
}

/** A code default: the copy that ships when no library row fits. */
export interface PushDefaultCopy {
  title: string;
  body: string;
  audience?: PushAudienceFilter;
  conditions?: Record<string, string[]>;
  /** Only used when no other candidate renders (e.g. the variant without a name). */
  fallbackOnly?: boolean;
  /** Written for a recipient of this gender (absent = both). */
  gender?: PushGender;
  /** Written for a subject (entry.subject) of this gender (absent = any). */
  subjectGender?: PushGender;
  /** Ties the male and female defaults of one pair (seeded as the row's pairId). */
  pair?: string;
}

export interface PushSubject {
  /** Who the subject is, e.g. 'מי שיזם את האימון'. */
  label: string;
  /** The variable that names them. */
  var: PushVarKey;
}

export interface PushCatalogEntry {
  pushType: string;
  label: string;
  lever: PushLever;
  /** push.service channel (the user's settings toggle). */
  channel: string;
  /** Cloud Function(s) that send it. */
  sender: string;
  /** What this push is for (shown read-only in the panel). */
  description: string;
  /** WHEN it is sent, as the code does it today (read-only in the panel). */
  whenSent: string;
  vars: ReadonlyArray<PushVarKey>;
  conditions?: ReadonlyArray<PushCondition>;
  /** Allowed route ids; the first is the default. */
  deepLinks: ReadonlyArray<string>;
  defaults: ReadonlyArray<PushDefaultCopy>;
  /** Another person this push talks about, whose gender the sender passes as ctx.subjectGender. */
  subject?: PushSubject;
  /** Not live in production code yet (sender not merged / not deployed). */
  pending?: string;
}

const LEVEL_OPTIONS = ['2', '3', '4', '5', '6', '7', '8', '9', '10'].map((v) => ({ value: v, label: `רמה ${v}` }));

export const PUSH_CATALOG: ReadonlyArray<PushCatalogEntry> = [
  {
    pushType: 'workout_reminder_day',
    label: 'תזכורת לאימון של היום',
    lever: 'routine',
    channel: 'training_reminder',
    sender: 'trainingReminderScheduler',
    description: 'יש אימון מתוכנן להיום שעוד לא בוצע (בלי שעת התחלה).',
    whenSent:
      'בדיקה כל שעה עגולה. נשלח בשעה שהמשתמש בחר באונבורדינג (lifestyle.reminders.runningTime), ואם לא בחר ב-07:00. פעם אחת ביום לכל היותר, לא אחרי שעת האימון, לא בשעות השקט (22:00 עד 07:00).',
    vars: ['@שם', '@אימון'],
    deepLinks: ['home', 'map', 'progression'],
    defaults: [
      { title: '@אימון היום', body: 'האימון שלך מוכן. יוצאים?' },
      { title: '@אימון היום', body: 'גם 15 דקות נחשבות. מתחילים?' },
      { title: '@אימון היום', body: 'רגע קטן בשבילך היום. האימון כבר מחכה.' },
    ],
  },
  {
    pushType: 'workout_reminder_before',
    label: 'תזכורת לפני אימון מתוזמן',
    lever: 'routine',
    channel: 'training_reminder',
    sender: 'reminderSweepScheduler (מעבר 2)',
    description: 'אימון מתוכנן עם שעת התחלה. התזכורת יוצאת כמה דקות לפני.',
    whenSent:
      'סריקה כל 5 דקות. נשלח כ-10 דקות לפני שעת ההתחלה (reminderSweepLeadMinutes). רק כשהדגלים enableReminderSweepPush ו-reminderSweepWorkoutEntriesEnabled דולקים.',
    vars: ['@שם', '@אימון', '@שעה'],
    deepLinks: ['home', 'map'],
    defaults: [{ title: '@אימון ב-@שעה', body: 'האימון שלך מחכה ב-@שעה. יוצאים?' }],
  },
  {
    pushType: 'workout_reminder_slot',
    label: 'תזכורת בשעה שנקבעה בהגדרות',
    lever: 'routine',
    channel: 'training_reminder',
    sender: 'reminderSweepScheduler (מעבר 1)',
    description: 'המשתמש קבע בהגדרות יום ושעה קבועים לתזכורת אימון.',
    whenSent:
      'סריקה כל 5 דקות. נשלח ביום ובשעה שהמשתמש קבע בהגדרות (תזכורות אימון). רק כשהדגל enableReminderSweepPush דולק.',
    vars: ['@שם', '@שעה'],
    deepLinks: ['home', 'map'],
    defaults: [
      { title: 'הגיע הזמן שקבעת', body: 'קבעת להתאמן עכשיו. יוצאים?' },
      { title: 'הגיע הזמן שקבעת', body: 'התזכורת שביקשת: זה הזמן שלך להתאמן.' },
      { title: 'הגיע הזמן שקבעת', body: 'רגע קטן בשבילך. האימון מחכה.' },
    ],
  },
  {
    pushType: 'retention_lapse',
    label: 'חזרה לשגרה אחרי הפסקה',
    lever: 'routine',
    channel: 'retention',
    sender: 'retentionScheduler',
    description:
      'סיימו אונבורדינג ולא התאמנו כמה ימים (לפי האימון האחרון או פתיחת האפליקציה האחרונה). בלי ספירת ימים ובלי אשמה.',
    whenSent:
      'כל יום ב-10:00, למי שלא התאמן ולא פתח את האפליקציה 7 ימים ומעלה, לכל היותר פעם ב-48 שעות. כשהדגל retentionMilestoneCadence דולק: פעם אחת בכל שלב (יום 4 עד 6, שבוע, שבועיים, חודש) ואחרי יום 30 מפסיקים. לא בשבת ובחג.',
    // No @ימים: the day count is not filled any more (owner, 18.10.2026), so
    // a row that uses it never renders.
    vars: ['@שם'],
    conditions: [
      {
        key: 'milestone',
        label: 'שלב בהפסקה',
        options: [
          { value: 'd4', label: 'יום 4 עד 6' },
          { value: 'd7', label: 'שבוע (שבוע חדש)' },
          { value: 'd14', label: 'שבועיים' },
          { value: 'd30', label: 'חודש (האחרון)' },
        ],
      },
    ],
    deepLinks: ['home', 'map'],
    defaults: [
      // Index 0 rewritten in place (was "פספסת כמה ימים? זה בסדר") so ids keep their order.
      { title: 'רגע קטן בשבילך היום', body: 'מה שבונה הרגל זה לחזור. 15 דקות ליד הבית, בקצב שלך.' },
      { title: '@שם, הגינה עדיין שם', body: 'אימון קצר של 10 דקות, בלי ציוד. חוזרים?' },
      { title: 'חוזרים בקטנה?', body: 'בנינו לך אימון קל לחזרה. 15 דקות, בקצב שלך.' },
      { title: 'יום טוב להתחיל מחדש', body: 'אימון אחד קל, וההרגל חוזר.' },
      // Gendered pairs (recipient). Appended, so the neutral rows keep their ids.
      { title: '@שם, מוכן לחזור?', body: 'אימון קל של 15 דקות, בקצב שלך. הגינה מחכה.', gender: 'male', pair: 'ready_name' },
      { title: '@שם, מוכנה לחזור?', body: 'אימון קל של 15 דקות, בקצב שלך. הגינה מחכה.', gender: 'female', pair: 'ready_name' },
      { title: 'מוכן לחזור לשגרה?', body: 'בנינו לך אימון קל לחזרה. 15 דקות, ואתה שוב בשגרה.', gender: 'male', pair: 'back' },
      { title: 'מוכנה לחזור לשגרה?', body: 'בנינו לך אימון קל לחזרה. 15 דקות, ואת שוב בשגרה.', gender: 'female', pair: 'back' },
      { title: 'יום טוב להתחיל מחדש', body: 'אימון אחד קל, ואתה שוב בעניינים.', gender: 'male', pair: 'fresh' },
      { title: 'יום טוב להתחיל מחדש', body: 'אימון אחד קל, ואת שוב בעניינים.', gender: 'female', pair: 'fresh' },
      // Milestone copy (retentionMilestoneCadence on; the sender passes
      // conditions.milestone). More specific, so it wins over the rows above.
      { title: 'רגע קטן בשבילך?', body: 'אימון קל של 15 דקות ליד הבית. בלי לחץ, בקצב שלך.', conditions: { milestone: ['d4'] } },
      { title: 'בא לך אימון קצר היום?', body: '15 דקות ליד הבית, בקצב שלך. אנחנו כאן כשתרצה.', gender: 'male', conditions: { milestone: ['d4'] }, pair: 'm_d4' },
      { title: 'בא לך אימון קצר היום?', body: '15 דקות ליד הבית, בקצב שלך. אנחנו כאן כשתרצי.', gender: 'female', conditions: { milestone: ['d4'] }, pair: 'm_d4' },
      { title: 'שבוע חדש מתחיל היום', body: '15 דקות זה כל מה שצריך כדי לפתוח אותו. יוצאים?', conditions: { milestone: ['d7'] } },
      { title: 'שבוע חדש מתחיל היום. 15 דקות?', body: 'אימון קל אחד, ואתה פותח את השבוע ברגל ימין.', gender: 'male', conditions: { milestone: ['d7'] }, pair: 'm_d7' },
      { title: 'שבוע חדש מתחיל היום. 15 דקות?', body: 'אימון קל אחד, ואת פותחת את השבוע ברגל ימין.', gender: 'female', conditions: { milestone: ['d7'] }, pair: 'm_d7' },
      { title: 'מתחילים מחדש, בקטנה', body: 'בנינו אימון קל לחזרה. 15 דקות, בקצב שלך.', conditions: { milestone: ['d14'] } },
      { title: 'מוכן להתחלה חדשה?', body: 'אימון קל של 15 דקות, בלי ציוד. מתחילים מאיפה שנוח לך.', gender: 'male', conditions: { milestone: ['d14'] }, pair: 'm_d14' },
      { title: 'מוכנה להתחלה חדשה?', body: 'אימון קל של 15 דקות, בלי ציוד. מתחילים מאיפה שנוח לך.', gender: 'female', conditions: { milestone: ['d14'] }, pair: 'm_d14' },
      { title: 'הדלת תמיד פתוחה', body: 'כשיתאים, אימון קל של 15 דקות מחכה כאן. בלי לחץ.', conditions: { milestone: ['d30'] } },
      { title: 'הדלת תמיד פתוחה', body: 'כשתרצה לחזור, אימון קל של 15 דקות מחכה לך כאן.', gender: 'male', conditions: { milestone: ['d30'] }, pair: 'm_d30' },
      { title: 'הדלת תמיד פתוחה', body: 'כשתרצי לחזור, אימון קל של 15 דקות מחכה לך כאן.', gender: 'female', conditions: { milestone: ['d30'] }, pair: 'm_d30' },
    ],
  },
  {
    pushType: 'onboarding_dropoff',
    label: 'הרשמה שלא הושלמה',
    lever: 'progress',
    channel: 'onboarding_dropoff',
    sender: 'onboardingDropoffDispatcher',
    description: 'התחילו להירשם ועצרו באמצע.',
    whenSent:
      'בדיקה כל 30 דקות (:17 ו-:47). 24 שעות אחרי ההרשמה, ושוב אחרי 48 שעות נוספות. לכל היותר פעמיים בסך הכול. לא בשעות השקט ולא בשבת ובחג.',
    vars: ['@שם'],
    deepLinks: ['gateway'],
    defaults: [
      { title: '@שם, נשאר רק עוד צעד', body: 'עוד דקה וההרשמה מוכנה, ואז מקבלים את האימון הראשון.' },
      { title: 'התוכנית שלך כמעט מוכנה', body: 'מסיימים את ההרשמה, ונבנה לך תוכנית לפי הרמה שלך.' },
      { title: 'נמשיך מאיפה שעצרת?', body: 'שמרנו את מה שמילאת. עוד כמה שאלות וזהו.' },
      { title: 'האימון הראשון מחכה לך', body: 'לסיים את ההרשמה לוקח פחות מדקה.' },
      { title: 'אנשים לידך כבר מתאמנים', body: 'מסיימים להירשם ורואים מי מתאמן בגינה הקרובה.' },
      // Gendered pairs (recipient). Appended, so the neutral rows keep their ids.
      { title: '@שם, נשאר רק עוד צעד', body: 'עוד דקה ואתה מקבל את האימון הראשון שלך.', gender: 'male', pair: 'step' },
      { title: '@שם, נשאר רק עוד צעד', body: 'עוד דקה ואת מקבלת את האימון הראשון שלך.', gender: 'female', pair: 'step' },
      { title: 'מוכן לאימון הראשון?', body: 'מסיימים את ההרשמה ומתחילים. לוקח פחות מדקה.', gender: 'male', pair: 'ready' },
      { title: 'מוכנה לאימון הראשון?', body: 'מסיימים את ההרשמה ומתחילים. לוקח פחות מדקה.', gender: 'female', pair: 'ready' },
    ],
  },
  {
    pushType: 'level_up',
    label: 'עלייה ברמה',
    lever: 'progress',
    channel: 'progression',
    sender: 'onLevelUp',
    description: 'הרמה הכללית של המשתמש עלתה.',
    whenSent: 'מיד כשהרמה עולה (לא ברמה 1). לכל היותר פעם ב-24 שעות.',
    vars: ['@שם', '@רמה', '@תוכנית'],
    conditions: [{ key: 'level', label: 'רמה', options: LEVEL_OPTIONS }],
    deepLinks: ['progression_map', 'progression', 'home'],
    defaults: [
      { title: 'עלית לרמה 2', body: 'יפה מאוד. ככה בונים הרגל, אימון אחרי אימון.', conditions: { level: ['2'] } },
      { title: 'עלית לרמה 3', body: 'ההתמדה שלך עובדת. ממשיכים.', conditions: { level: ['3'] } },
      { title: 'עלית לרמה 4', body: 'כל אימון נספר, וזה כבר מורגש.', conditions: { level: ['4'] } },
      { title: 'רמה 5, חצי הדרך', body: 'הגעת לחצי הדרך לרמה 10. כל הכבוד.', conditions: { level: ['5'] } },
      { title: 'עלית לרמה 6', body: 'הקצב שלך יציב. ממשיכים ככה.', conditions: { level: ['6'] } },
      { title: 'עלית לרמה 7', body: 'מעטים מגיעים לכאן. כל הכבוד על ההתמדה.', conditions: { level: ['7'] } },
      { title: 'עלית לרמה 8', body: 'עוד שתי רמות לפסגה. ממשיכים בקצב שלך.', conditions: { level: ['8'] } },
      { title: 'עלית לרמה 9', body: 'עוד רמה אחת לפסגה.', conditions: { level: ['9'] } },
      { title: 'רמה 10, הפסגה', body: 'הגעת לרמה הכי גבוהה. מסע אמיתי, כל הכבוד.', conditions: { level: ['10'] } },
      { title: 'עלית לרמה @רמה', body: 'כל אימון נספר. ממשיכים.' },
    ],
  },
  {
    pushType: 'kudos_single',
    label: 'כיף אחד שהתקבל',
    lever: 'social',
    channel: 'social',
    sender: 'onKudosCreated',
    description: 'מישהו שלח כיף על אימון, ואין כיפים אחרים שלא נקראו.',
    whenSent: 'מיד כשמגיע כיף. לכל היותר פעם בחצי שעה (שאר הכיפים נאספים להודעה מקובצת).',
    vars: ['@שם', '@שולח'],
    subject: { label: 'מי ששלח את הכיף', var: '@שולח' },
    deepLinks: ['home'],
    defaults: [
      { title: 'קיבלת כיף מ@שולח', body: 'על האימון האחרון שלך. אפשר להחזיר כיף.' },
      // Gendered pair (the sender).
      { title: '@שולח שלח לך כיף', body: 'על האימון האחרון שלך. אפשר להחזיר לו כיף.', subjectGender: 'male', pair: 'sent' },
      { title: '@שולח שלחה לך כיף', body: 'על האימון האחרון שלך. אפשר להחזיר לה כיף.', subjectGender: 'female', pair: 'sent' },
    ],
  },
  {
    pushType: 'kudos_bundle',
    label: 'כמה כיפים ביחד',
    lever: 'social',
    channel: 'social',
    sender: 'onKudosCreated',
    description: 'יש כמה כיפים שלא נקראו. הודעה אחת מסכמת אותם.',
    whenSent: 'מיד כשמגיע כיף ויש כבר כיפים שלא נקראו. לכל היותר פעם בחצי שעה.',
    vars: ['@שם', '@שולח', '@כמות', '@עוד'],
    conditions: [
      {
        key: 'others',
        label: 'כמה שלחו מלבד השולח האחרון',
        options: [
          { value: 'one', label: 'עוד אחד' },
          { value: 'many', label: 'עוד כמה' },
        ],
      },
    ],
    deepLinks: ['home'],
    defaults: [
      { title: 'קיבלת @כמות כיפים', body: '@שולח ועוד @עוד שלחו לך כיף.', conditions: { others: ['many'] } },
      { title: 'קיבלת @כמות כיפים', body: '@שולח ועוד מישהו שלחו לך כיף.', conditions: { others: ['one'] } },
    ],
  },
  {
    pushType: 'group_join_welcome',
    label: 'הצטרפת לקבוצה',
    lever: 'social',
    channel: 'social',
    sender: 'onGroupMemberJoin',
    description: 'אישור למי שהצטרף עכשיו לקבוצה.',
    whenSent: 'מיד עם ההצטרפות. תמיד נשלח (אין הגבלת תדירות).',
    vars: ['@שם', '@קבוצה'],
    deepLinks: ['community_group', 'community'],
    defaults: [{ title: 'הצטרפת ל@קבוצה', body: 'אפשר לראות מתי המפגש הבא ומי מגיע.' }],
  },
  {
    pushType: 'group_join_admin',
    label: 'מישהו הצטרף לקבוצה שלך',
    lever: 'social',
    channel: 'social',
    sender: 'onGroupMemberJoin',
    description: 'למוביל הקבוצה (או למי שיצר אותה) כשמישהו מצטרף.',
    whenSent: 'מיד עם ההצטרפות. לכל היותר פעם בשעה.',
    vars: ['@שם', '@מצטרף', '@קבוצה'],
    subject: { label: 'מי שהצטרף', var: '@מצטרף' },
    deepLinks: ['community_group', 'community'],
    defaults: [
      { title: '@מצטרף איתכם ב@קבוצה', body: 'הקבוצה גדלה. אפשר לשלוח הודעת ברוכים הבאים בצ׳אט.' },
      {
        title: 'יש מצטרפים חדשים ב@קבוצה',
        body: 'הקבוצה גדלה. אפשר לשלוח הודעת ברוכים הבאים בצ׳אט.',
        fallbackOnly: true,
      },
      // Gendered pair (the joiner).
      { title: '@מצטרף הצטרף ל@קבוצה', body: 'הקבוצה גדלה. אפשר לקבל אותו בברכה בצ׳אט.', subjectGender: 'male', pair: 'joined' },
      { title: '@מצטרף הצטרפה ל@קבוצה', body: 'הקבוצה גדלה. אפשר לקבל אותה בברכה בצ׳אט.', subjectGender: 'female', pair: 'joined' },
    ],
  },
  {
    pushType: 'contribution_approved',
    label: 'הגינה שהוספת אושרה',
    lever: 'social',
    channel: 'contribution_status',
    sender: 'onContributionApproved',
    description: 'מיקום חדש שהמשתמש הוסיף אושר ועלה למפה.',
    whenSent: 'מיד כשהתרומה מאושרת (רק מיקום חדש). תמיד נשלח.',
    vars: ['@שם', '@מקום'],
    deepLinks: ['map_park', 'map'],
    defaults: [
      { title: 'הפארק שהוספת עלה למפה', body: '"@מקום" על המפה. מעכשיו כולם יכולים להתאמן שם. תודה!' },
      { title: 'הפארק שהוספת עלה למפה', body: 'מעכשיו כולם יכולים להתאמן שם. תודה!', fallbackOnly: true },
    ],
  },
  {
    pushType: 'week_start',
    label: 'שבוע טוב (מוצאי שבת)',
    lever: 'routine',
    channel: 'week_start',
    sender: 'weekStartScheduler',
    description: 'למי שבחר "שמירת שבת": פתיחת שבוע במוצאי שבת.',
    whenSent: 'במוצאי שבת ב-21:15 (לא כשחג ממשיך). לכל היותר פעם ב-72 שעות.',
    vars: ['@שם'],
    deepLinks: ['home'],
    defaults: [
      { title: 'שבוע טוב', body: 'שבוע חדש מתחיל. נקבע אימון ראשון למחר?' },
      { title: 'שבוע טוב', body: 'מתחילים את השבוע בתנועה. כמה דקות מחר כבר עושות את ההבדל.' },
      { title: 'שבוע חדש מתחיל', body: 'מה האימון הראשון שלך השבוע? אפשר לקבוע אותו כבר עכשיו.' },
    ],
  },
  {
    pushType: 'step_goal',
    label: 'יעד הצעדים היומי',
    lever: 'streak',
    channel: 'health_milestone',
    sender: 'stepGoalNudgeScheduler',
    description: 'עוד לא הגיעו ליעד הצעדים של היום. הטקסט לפי כמה נשאר.',
    whenSent:
      'כל יום ב-18:00, רק כשהדגל stepGoalNudgeEnabled דולק. הטקסטים של "התחלה" הם של בוקר ולכן לא נשלחים מהצהריים. בלי טקסט מתאים לשלב, לא נשלח כלום.',
    vars: ['@שם', '@רצף', '@צעדים_שנותרו', '@דקות', '@מרחק'],
    conditions: [
      {
        key: 'bucket',
        label: 'כמה מהיעד הושלם',
        options: [
          { value: 'start', label: 'התחלה (פחות מרבע)' },
          { value: 'mid', label: 'באמצע' },
          { value: 'close', label: 'כמעט (70% ומעלה)' },
          { value: 'hit', label: 'הגיעו ליעד' },
          { value: 'over', label: 'מעבר ליעד' },
        ],
      },
    ],
    deepLinks: ['map_walk', 'activity_steps', 'home'],
    defaults: [
      { title: 'יעד הצעדים של היום', body: 'כמעט שם. עוד @דקות דקות הליכה וסגרת את היום.', conditions: { bucket: ['close'] } },
      { title: 'יעד הצעדים של היום', body: 'עוד @צעדים_שנותרו צעדים בלבד, הליכה של @דקות דקות.', conditions: { bucket: ['close'] } },
      { title: 'יעד הצעדים של היום', body: 'עברת חצי מהיעד. עוד @צעדים_שנותרו צעדים, בערך @דקות דקות הליכה.', conditions: { bucket: ['mid'] } },
      { title: 'יעד הצעדים של היום', body: 'כבר @רצף ימים ברצף. עוד @צעדים_שנותרו צעדים ושומרים עליו.', conditions: { bucket: ['mid'] } },
      { title: 'יעד הצעדים של היום', body: '@שם, יום חדש. @צעדים_שנותרו צעדים ליעד של היום.', conditions: { bucket: ['start'] } },
      { title: 'יעד הצעדים של היום', body: 'מתחילים את היום בהליכה? @צעדים_שנותרו צעדים ליעד.', conditions: { bucket: ['start'] } },
      {
        title: 'יעד הצעדים של היום',
        body: 'יוצאים מהעבודה? @דקות דקות הליכה וסוגרים את היעד.',
        audience: { persona: ['office_worker'] },
        conditions: { bucket: ['close'] },
      },
      {
        title: 'יעד הצעדים של היום',
        body: 'הליכה קצרה אחרי העבודה? עוד @צעדים_שנותרו צעדים ליעד.',
        audience: { persona: ['office_worker'] },
        conditions: { bucket: ['mid'] },
      },
      {
        title: 'יעד הצעדים של היום',
        body: 'לפני שמתיישבים מול המסך: הליכה קצרה וכבר מתקדמים ליעד.',
        audience: { persona: ['office_worker'] },
        conditions: { bucket: ['start'] },
      },
      {
        title: 'יעד הצעדים של היום',
        body: 'עוד @דקות דקות הליכה, אפשר גם עם הילדים, וסגרת את היום.',
        audience: { persona: ['parent'] },
        conditions: { bucket: ['close'] },
      },
      {
        title: 'יעד הצעדים של היום',
        body: 'גם עם כל הסידורים, נשארו רק @צעדים_שנותרו צעדים ליעד.',
        audience: { persona: ['parent'] },
        conditions: { bucket: ['mid'] },
      },
      {
        title: 'יעד הצעדים של היום',
        body: 'לפני שהבית מתעורר, @צעדים_שנותרו צעדים ליעד של היום.',
        audience: { persona: ['parent'] },
        conditions: { bucket: ['start'] },
      },
    ],
  },
  {
    pushType: 'partner_plan',
    label: 'מתאמנים לידך',
    lever: 'social',
    channel: 'community',
    sender: 'onPlannedActivityCreated',
    description: 'מישהו שהמשתמש עוקב אחריו, או מישהו קרוב (עד 3 ק"מ, רק אימון ציבורי), תכנן אימון.',
    whenSent:
      'מיד כשנוצר אימון מתוכנן. לכל היותר פעם בשעתיים. רק כשהדגל socialActivityNearbyPushEnabled דולק.',
    vars: ['@שם', '@שולח', '@מקום', '@שעה'],
    subject: { label: 'מי שיזם את האימון', var: '@שולח' },
    conditions: [
      {
        key: 'activity',
        label: 'סוג הפעילות',
        options: [
          { value: 'running', label: 'ריצה' },
          { value: 'walking', label: 'הליכה' },
          { value: 'strength', label: 'אימון כוח' },
        ],
      },
    ],
    deepLinks: ['map_place', 'map', 'community'],
    defaults: [
      { title: 'מתאמנים לידך', body: 'ריצה ב@מקום ב-@שעה עם @שולח. מצטרפים?', conditions: { activity: ['running'] } },
      { title: 'מתאמנים לידך', body: 'ריצה ב@מקום ב-@שעה. זה הזמן להצטרף.', conditions: { activity: ['running'] } },
      { title: 'מתאמנים לידך', body: 'אימון כוח ב@מקום ב-@שעה עם @שולח. מצטרפים?', conditions: { activity: ['strength'] } },
      { title: 'מתאמנים לידך', body: 'אימון כוח ב@מקום ב-@שעה. מצטרפים?', conditions: { activity: ['strength'] } },
      { title: 'מתאמנים לידך', body: 'הליכה ב@מקום ב-@שעה עם @שולח. באים?', conditions: { activity: ['walking'] } },
      { title: 'מתאמנים לידך', body: 'הליכה ב@מקום ב-@שעה. לא הולכים לבד.', conditions: { activity: ['walking'] } },
      { title: 'מתאמנים לידך', body: 'אימון ב@מקום ב-@שעה עם @שולח. מצטרפים?' },
      { title: 'מתאמנים לידך', body: 'יש אימון קרוב אליך ב-@שעה. מצטרפים?', fallbackOnly: true },
      { title: 'מתאמנים לידך', body: 'יש אימון קרוב אליך. מצטרפים?', fallbackOnly: true },
      // Gendered pairs (who planned the session). Appended, so the neutral rows keep their ids.
      { title: 'מתאמנים לידך', body: '@שם, @שולח יוצא לרוץ ב@מקום ב-@שעה. מצטרפים?', subjectGender: 'male', conditions: { activity: ['running'] }, pair: 'run_name' },
      { title: 'מתאמנים לידך', body: '@שם, @שולח יוצאת לרוץ ב@מקום ב-@שעה. מצטרפים?', subjectGender: 'female', conditions: { activity: ['running'] }, pair: 'run_name' },
      { title: 'מתאמנים לידך', body: '@שולח יוצא לרוץ ב@מקום ב-@שעה. זה הזמן להצטרף.', subjectGender: 'male', conditions: { activity: ['running'] }, pair: 'run' },
      { title: 'מתאמנים לידך', body: '@שולח יוצאת לרוץ ב@מקום ב-@שעה. זה הזמן להצטרף.', subjectGender: 'female', conditions: { activity: ['running'] }, pair: 'run' },
      { title: 'מתאמנים לידך', body: '@שם, @שולח יוצא להליכה ב@מקום ב-@שעה. באים?', subjectGender: 'male', conditions: { activity: ['walking'] }, pair: 'walk_name' },
      { title: 'מתאמנים לידך', body: '@שם, @שולח יוצאת להליכה ב@מקום ב-@שעה. באים?', subjectGender: 'female', conditions: { activity: ['walking'] }, pair: 'walk_name' },
      { title: 'מתאמנים לידך', body: '@שולח יוצא להליכה ב@מקום ב-@שעה. לא הולכים לבד.', subjectGender: 'male', conditions: { activity: ['walking'] }, pair: 'walk' },
      { title: 'מתאמנים לידך', body: '@שולח יוצאת להליכה ב@מקום ב-@שעה. לא הולכים לבד.', subjectGender: 'female', conditions: { activity: ['walking'] }, pair: 'walk' },
      { title: 'מתאמנים לידך', body: '@שם, @שולח יוצא לאימון כוח ב@מקום ב-@שעה. מצטרפים?', subjectGender: 'male', conditions: { activity: ['strength'] }, pair: 'strength_name' },
      { title: 'מתאמנים לידך', body: '@שם, @שולח יוצאת לאימון כוח ב@מקום ב-@שעה. מצטרפים?', subjectGender: 'female', conditions: { activity: ['strength'] }, pair: 'strength_name' },
      { title: 'מתאמנים לידך', body: '@שולח מתכנן אימון כוח ב@מקום ב-@שעה. מצטרפים?', subjectGender: 'male', conditions: { activity: ['strength'] }, pair: 'strength' },
      { title: 'מתאמנים לידך', body: '@שולח מתכננת אימון כוח ב@מקום ב-@שעה. מצטרפים?', subjectGender: 'female', conditions: { activity: ['strength'] }, pair: 'strength' },
      { title: 'מתאמנים לידך', body: '@שולח יוצא להתאמן ב@מקום ב-@שעה. מצטרפים?', subjectGender: 'male', pair: 'any' },
      { title: 'מתאמנים לידך', body: '@שולח יוצאת להתאמן ב@מקום ב-@שעה. מצטרפים?', subjectGender: 'female', pair: 'any' },
    ],
  },
];

export const PUSH_CATALOG_BY_TYPE: Record<string, PushCatalogEntry> = Object.fromEntries(
  PUSH_CATALOG.map((e) => [e.pushType, e]),
);

export function defaultRowId(pushType: string, index: number): string {
  return `default:${pushType}:${index}`;
}

// ─── Rows ─────────────────────────────────────────────────────────────────────

export interface PushTimeWindow {
  /** 'HH:MM', Israel time, inclusive. */
  start: string;
  /** 'HH:MM', Israel time, exclusive. */
  end: string;
}

/** A library row as the selector sees it (the server adapts Firestore docs, incl. legacy ones, to this). */
export interface PushCopyRow {
  id: string;
  pushType: string;
  title: string;
  body: string;
  /** Route id from PUSH_DEEP_LINK_ROUTES. Absent/invalid → the pushType's default. */
  deepLink?: string | null;
  audience?: PushAudienceFilter | null;
  conditions?: Record<string, string[]> | null;
  timeWindow?: PushTimeWindow | null;
  active?: boolean;
  archived?: boolean;
  needsRewrite?: boolean;
  fallbackOnly?: boolean;
  /** Recipient gender this copy is written for. Absent = 'both'. */
  gender?: PushRowGender | null;
  /** Subject (entry.subject) gender this copy is written for. Absent = 'any'. */
  subjectGender?: PushRowSubjectGender | null;
  /** Ties a male row to its female twin. */
  pairId?: string | null;
}

/**
 * Rows written before the library had a pushType (the original content
 * library) that a live sender used: mapped onto their pushType with exactly
 * the filters the old selectNotificationContent() call sites used, so they
 * keep working until archived. Anything else (e.g. the dormant Inactivity
 * rows) → null.
 */
export function legacyPushMapping(data: {
  triggerType?: unknown;
  activityType?: unknown;
  dailyGoalBucket?: unknown;
}): { pushType: string; conditions: Record<string, string[]> | null } | null {
  const activity = typeof data.activityType === 'string' ? data.activityType : '';
  if (data.triggerType === 'Daily_Goal') {
    const bucket = typeof data.dailyGoalBucket === 'string' ? data.dailyGoalBucket : '';
    if (activity !== 'walking' || !bucket) return null;
    return { pushType: 'step_goal', conditions: { bucket: [bucket] } };
  }
  if (data.triggerType === 'Future_Partner_Plan') {
    return { pushType: 'partner_plan', conditions: activity ? { activity: [activity] } : null };
  }
  return null;
}

export function isRowLive(row: PushCopyRow): boolean {
  return row.active !== false && row.archived !== true && row.needsRewrite !== true;
}

export function defaultRowsFor(pushType: string): PushCopyRow[] {
  const entry = PUSH_CATALOG_BY_TYPE[pushType];
  if (!entry) return [];
  return entry.defaults.map((d, i) => ({
    id: defaultRowId(pushType, i),
    pushType,
    title: d.title,
    body: d.body,
    deepLink: entry.deepLinks[0],
    audience: d.audience ?? null,
    conditions: d.conditions ?? null,
    fallbackOnly: d.fallbackOnly === true,
    gender: d.gender ?? 'both',
    subjectGender: d.subjectGender ?? 'any',
    pairId: d.pair ? `default:${pushType}:${d.pair}` : null,
    active: true,
  }));
}

// ─── Time helpers (Israel) ────────────────────────────────────────────────────

const TZ = 'Asia/Jerusalem';

/** 'YYYY-MM-DD' in Israel. */
export function israelDateKey(now: Date): string {
  return now.toLocaleDateString('sv-SE', { timeZone: TZ });
}

/** 'HH:MM' (24h) in Israel. */
export function israelHHMM(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const hh = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const mm = parts.find((p) => p.type === 'minute')?.value ?? '00';
  return `${hh}:${mm}`;
}

const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function hhmmToMinutes(v: string): number | null {
  const m = HHMM_RE.exec(v);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export function isInTimeWindow(window: PushTimeWindow | null | undefined, now: Date): boolean {
  if (!window || (!window.start && !window.end)) return true;
  const start = hhmmToMinutes(window.start);
  const end = hhmmToMinutes(window.end);
  if (start === null || end === null) return true; // malformed windows are rejected on save; never block a send over one
  const nowMin = hhmmToMinutes(israelHHMM(now)) ?? 0;
  return start <= end ? nowMin >= start && nowMin < end : nowMin >= start || nowMin < end;
}

// ─── Rendering ────────────────────────────────────────────────────────────────

const SLASH_RE = /\//;
const DASH_RE = /[\u2013\u2014]/;
// Built from a string so the type-checker's regex-target check doesn't apply (the app's tsconfig has no target).
const EMOJI_RE = new RegExp('[\\p{Extended_Pictographic}\\u{1F1E6}-\\u{1F1FF}\\uFE0F\\u20E3]', 'u');
/** Non-global twin of BRACE_TOKEN_RE for .test() (a /g regex keeps lastIndex between calls). */
const BRACE_TEST_RE = /\{\w+\}/;

/**
 * The write rules a row can't be sent without, checked on the TEMPLATE
 * (before values are filled): no '/' gender slash, no em/en dash, no emoji,
 * no {placeholder}. Codes: 'slash' | 'dash' | 'emoji' | 'placeholder'.
 */
export function textRuleProblems(title: string, body: string): string[] {
  const problems: string[] = [];
  const t = `${title ?? ''}\n${body ?? ''}`;
  if (SLASH_RE.test(t)) problems.push('slash');
  if (DASH_RE.test(t)) problems.push('dash');
  if (EMOJI_RE.test(t)) problems.push('emoji');
  if (BRACE_TEST_RE.test(t)) problems.push('placeholder');
  return problems;
}

export const SEND_PROBLEM_LABEL: Record<string, string> = {
  slash: 'לוכסן',
  dash: 'קו מפריד ארוך',
  emoji: 'אימוג׳י',
  placeholder: 'משתנה בסוגריים',
  'empty-title': 'כותרת ריקה',
  'empty-body': 'טקסט ריק',
  'unknown-var': 'משתנה לא מוכר',
  'unfilled-var': 'משתנה שהפוש לא ממלא',
};

/**
 * Why a row will ALWAYS be skipped at send time, whatever the recipient's
 * values (the panel flags these rows: not sent, the next variant or the code
 * default goes instead). Codes as in SEND_PROBLEM_LABEL, a variable code
 * carries the token: 'unknown-var:@x'.
 */
export function sendBlockers(row: { pushType: string; title: string; body: string }): string[] {
  const title = (row.title ?? '').trim();
  const body = (row.body ?? '').trim();
  const problems = textRuleProblems(title, body);
  if (!title) problems.push('empty-title');
  if (!body) problems.push('empty-body');
  const entry = PUSH_CATALOG_BY_TYPE[row.pushType];
  for (const token of extractVarTokens(`${title} ${body}`)) {
    if (!isKnownPushVar(token)) problems.push(`unknown-var:${token}`);
    else if (entry && !entry.vars.includes(token)) problems.push(`unfilled-var:${token}`);
  }
  return problems;
}

/** 'unknown-var:@x' → 'משתנה לא מוכר @x'. */
export function sendProblemLabel(code: string): string {
  const [kind, token] = code.split(':');
  const label = SEND_PROBLEM_LABEL[kind] ?? kind;
  return token ? `${label} ${token}` : label;
}

export interface RenderOutcome {
  ok: boolean;
  title: string;
  body: string;
  /** Why the row can't be sent (empty when ok). */
  problems: string[];
}

function renderText(template: string, vars: PushVars, unresolved: Set<string>): string {
  // One pass over the TEMPLATE only: a value (e.g. a user's display name that
  // happens to contain "@שם") is never re-scanned as a variable.
  return template.replace(VAR_TOKEN_RE, (token) => {
    if (!isKnownPushVar(token)) {
      unresolved.add(token);
      return token;
    }
    const v = vars[token];
    if (v === null || v === undefined || String(v).trim() === '') {
      unresolved.add(token);
      return token;
    }
    return String(v).trim();
  });
}

/**
 * Fill a row with real values and check it can be sent: every variable
 * resolved, none of the text rules broken (no '/' gender slash, no em/en
 * dash, no emoji, no leftover {placeholder}), title and body not empty. A
 * failing row is skipped (the next candidate or the code default is used),
 * never sent half-filled.
 */
export function renderCopy(row: { title: string; body: string }, vars: PushVars): RenderOutcome {
  const titleT = (row.title ?? '').trim();
  const bodyT = (row.body ?? '').trim();
  const problems = textRuleProblems(titleT, bodyT);
  const unresolved = new Set<string>();
  const title = renderText(titleT, vars, unresolved).replace(/\s+/g, ' ').trim();
  const body = renderText(bodyT, vars, unresolved).replace(/\s+/g, ' ').trim();
  if (unresolved.size > 0) problems.push(`unresolved:${Array.from(unresolved).join(',')}`);
  if (!title) problems.push('empty-title');
  if (!body) problems.push('empty-body');
  return { ok: problems.length === 0, title, body, problems };
}

// ─── Selection ────────────────────────────────────────────────────────────────

export interface PushCopyContext {
  /** Recipient uid (or any stable key for a broadcast) — drives the rotation. */
  uid: string;
  now?: Date;
  audience?: PushAudience;
  vars?: PushVars;
  /** Values for the pushType's conditions, e.g. { level: '5' }, { bucket: 'mid' }. */
  conditions?: Record<string, string | null | undefined>;
  /** Deep-link params, e.g. { parkId }, { programId }, { groupId }. */
  params?: PushLinkParams;
  /**
   * Gender of the push's subject (entry.subject: who planned / joined / sent).
   * Unknown → only rows with subjectGender 'any'. The recipient's own gender
   * is audience.gender.
   */
  subjectGender?: PushGender | null;
}

export type PushCopySource = 'library' | 'default';

export interface ResolvedPushCopy {
  pushType: string;
  title: string;
  body: string;
  /** Concrete in-app path, e.g. '/map?openPark=abc'. */
  deepLink: string;
  deepLinkId: string;
  /** Library doc id, or 'default:<pushType>:<n>' for a code default. Recorded on the push for per-row analytics. */
  rowId: string;
  source: PushCopySource;
}

function hashString(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
  return Math.abs(hash);
}

function nonEmpty(list: string[] | null | undefined): list is string[] {
  return Array.isArray(list) && list.length > 0;
}

function audienceMatches(filter: PushAudienceFilter | null | undefined, audience: PushAudience | undefined): boolean {
  if (!filter) return true;
  const dims: Array<keyof PushAudienceFilter> = ['persona', 'ageBand', 'primaryGoal'];
  for (const dim of dims) {
    const allowed = filter[dim];
    if (!nonEmpty(allowed)) continue;
    const value = audience?.[dim];
    if (!value || !allowed.includes(value)) return false;
  }
  return true;
}

function genderMatches(row: Pick<PushCopyRow, 'gender' | 'subjectGender'>, ctx: PushCopyContext): boolean {
  const g = rowGender(row.gender);
  if (g !== 'both' && g !== normalizePushGender(ctx.audience?.gender)) return false;
  const sg = rowSubjectGender(row.subjectGender);
  if (sg !== 'any' && sg !== normalizePushGender(ctx.subjectGender)) return false;
  return true;
}

function conditionsMatch(
  rowConds: Record<string, string[]> | null | undefined,
  ctxConds: PushCopyContext['conditions'],
): boolean {
  if (!rowConds) return true;
  for (const [key, allowed] of Object.entries(rowConds)) {
    if (!nonEmpty(allowed)) continue;
    const value = ctxConds?.[key];
    if (!value || !allowed.includes(value)) return false;
  }
  return true;
}

/** Number of constrained audience dimensions + conditions + gender. Higher = more specific. */
export function specificity(row: Pick<PushCopyRow, 'audience' | 'conditions' | 'gender' | 'subjectGender'>): number {
  let n = 0;
  if (rowGender(row.gender) !== 'both') n++;
  if (rowSubjectGender(row.subjectGender) !== 'any') n++;
  if (row.audience) {
    for (const v of Object.values(row.audience)) if (nonEmpty(v as string[])) n++;
  }
  if (row.conditions) {
    for (const v of Object.values(row.conditions)) if (nonEmpty(v)) n++;
  }
  return n;
}

function resolveRouteId(entry: PushCatalogEntry, rowDeepLink: string | null | undefined): string {
  return rowDeepLink && entry.deepLinks.includes(rowDeepLink) ? rowDeepLink : entry.deepLinks[0];
}

/** Picks among already-filtered rows; null when none renders. Exported for the panel's preview. */
export function pickFromRows(
  entry: PushCatalogEntry,
  rows: PushCopyRow[],
  ctx: PushCopyContext,
  source: PushCopySource,
): ResolvedPushCopy | null {
  const now = ctx.now ?? new Date();
  const vars = ctx.vars ?? {};
  const eligible = rows.filter(
    (r) =>
      r.pushType === entry.pushType &&
      isRowLive(r) &&
      conditionsMatch(r.conditions, ctx.conditions) &&
      audienceMatches(r.audience, ctx.audience) &&
      genderMatches(r, ctx) &&
      isInTimeWindow(r.timeWindow, now),
  );
  const rendered = eligible
    .map((row) => ({ row, out: renderCopy(row, vars) }))
    .filter((x) => x.out.ok);
  const primary = rendered.filter((x) => !x.row.fallbackOnly);
  const pool = primary.length > 0 ? primary : rendered.filter((x) => x.row.fallbackOnly);
  if (pool.length === 0) return null;

  const top = Math.max(...pool.map((x) => specificity(x.row)));
  const tier = pool
    .filter((x) => specificity(x.row) === top)
    .sort((a, b) => (a.row.id < b.row.id ? -1 : a.row.id > b.row.id ? 1 : 0));
  // Deterministic per user per day: same user, same day → same variant.
  const chosen = tier[hashString(`${ctx.uid}|${israelDateKey(now)}|${entry.pushType}`) % tier.length];

  const deepLinkId = resolveRouteId(entry, chosen.row.deepLink);
  const deepLink =
    buildDeepLink(deepLinkId, ctx.params) ?? buildDeepLink(entry.deepLinks[0], ctx.params) ?? '/home';
  return {
    pushType: entry.pushType,
    title: chosen.out.title,
    body: chosen.out.body,
    deepLink,
    deepLinkId,
    rowId: chosen.row.id,
    source,
  };
}

/**
 * The library first (active, audience + gender match, most specific wins,
 * rotated per user per day, must render cleanly), then the code defaults by the same
 * rules. null only when neither has copy that fits (e.g. a step-goal bucket
 * with no copy) — the caller then sends nothing.
 */
export function selectPushCopy(
  pushType: string,
  libraryRows: PushCopyRow[],
  ctx: PushCopyContext,
): ResolvedPushCopy | null {
  const entry = PUSH_CATALOG_BY_TYPE[pushType];
  if (!entry) return null;
  return (
    pickFromRows(entry, libraryRows, ctx, 'library') ??
    pickFromRows(entry, defaultRowsFor(pushType), ctx, 'default')
  );
}

// ─── Editor validation (enforced on save in the panel) ────────────────────────

export interface PushCopyDraft {
  pushType: string;
  lever?: string;
  title: string;
  body: string;
  deepLink?: string | null;
  audience?: PushAudienceFilter | null;
  conditions?: Record<string, string[]> | null;
  timeWindow?: PushTimeWindow | null;
  gender?: PushRowGender | null;
  subjectGender?: PushRowSubjectGender | null;
}

export interface PushCopyIssue {
  field: 'pushType' | 'lever' | 'title' | 'body' | 'deepLink' | 'timeWindow' | 'conditions' | 'audience' | 'gender';
  message: string;
}

/** Sample first names that agree with a gender (the preview's @שם and the subject's variable). */
const SAMPLE_NAME: Record<PushGender, string> = { male: 'יואב', female: 'נועה' };
const SAMPLE_RECIPIENT_NAME: Record<PushGender, string> = { male: 'איתי', female: 'דנה' };

export interface PushSampleGenders {
  /** Recipient (fills @שם with a matching name). */
  gender?: PushGender | null;
  /** Subject (fills entry.subject.var with a matching name). */
  subjectGender?: PushGender | null;
}

/** Sample values for a pushType's variables (the preview). Names follow the given genders. */
export function sampleVarsFor(pushType: string, genders: PushSampleGenders = {}): PushVars {
  const entry = PUSH_CATALOG_BY_TYPE[pushType];
  const keys = entry ? entry.vars : PUSH_VARIABLES.map((v) => v.key);
  const out: PushVars = {};
  for (const k of keys) out[k] = VARIABLE_BY_KEY[k]?.sample;
  if (genders.gender && keys.includes('@שם')) out['@שם'] = SAMPLE_RECIPIENT_NAME[genders.gender];
  if (genders.subjectGender && entry?.subject) out[entry.subject.var] = SAMPLE_NAME[genders.subjectGender];
  return out;
}

export const SAMPLE_LINK_PARAMS: PushLinkParams = {
  programId: 'program123',
  parkId: 'park123',
  routeId: 'route123',
  groupId: 'group123',
  targetSteps: 2400,
};

function checkText(field: 'title' | 'body', text: string, max: number, entry: PushCatalogEntry | undefined): PushCopyIssue[] {
  const issues: PushCopyIssue[] = [];
  const name = field === 'title' ? 'הכותרת' : 'הטקסט';
  const t = (text ?? '').trim();
  if (!t) {
    issues.push({ field, message: `${name} ריקה` });
    return issues;
  }
  if (SLASH_RE.test(t)) issues.push({ field, message: `${name}: בלי לוכסן (כמו "את/ה"). כותבים ברבים, או נוסח נפרד לזכר ולנקבה` });
  if (DASH_RE.test(t)) issues.push({ field, message: `${name}: בלי קו מפריד ארוך (— או –). נקודה או פסיק במקום` });
  if (EMOJI_RE.test(t)) issues.push({ field, message: `${name}: בלי אימוג׳י` });
  if (BRACE_TEST_RE.test(t)) issues.push({ field, message: `${name}: משתנים כותבים עם @ (למשל @שם), לא בסוגריים מסולסלים` });
  for (const token of extractVarTokens(t)) {
    if (!isKnownPushVar(token)) {
      issues.push({ field, message: `${name}: המשתנה ${token} לא קיים` });
    } else if (entry && !entry.vars.includes(token)) {
      issues.push({ field, message: `${name}: הפוש הזה לא ממלא את ${token}. אפשר: ${entry.vars.join(' ')}` });
    }
  }
  const rendered = renderText(t, sampleVarsFor(entry?.pushType ?? ''), new Set());
  if (rendered.length > max) {
    issues.push({ field, message: `${name} ארוכה מדי: ${rendered.length} תווים עם ערכים לדוגמה (עד ${max})` });
  }
  return issues;
}

export function validatePushCopyDraft(draft: PushCopyDraft): PushCopyIssue[] {
  const issues: PushCopyIssue[] = [];
  const entry = PUSH_CATALOG_BY_TYPE[draft.pushType];
  if (!entry) issues.push({ field: 'pushType', message: 'סוג הפוש לא מוכר' });
  if (draft.lever && !PUSH_LEVERS.some((l) => l.id === draft.lever)) {
    issues.push({ field: 'lever', message: 'מנוף לא מוכר' });
  }
  issues.push(...checkText('title', draft.title, PUSH_TITLE_MAX, entry));
  issues.push(...checkText('body', draft.body, PUSH_BODY_MAX, entry));
  const g = draft.gender ?? 'both';
  const sg = draft.subjectGender ?? 'any';
  if (!['both', 'male', 'female'].includes(g)) issues.push({ field: 'gender', message: 'ערך מגדר לא מוכר' });
  if (!['any', 'male', 'female'].includes(sg)) issues.push({ field: 'gender', message: 'ערך מגדר לא מוכר' });
  if (sg !== 'any' && entry && !entry.subject) {
    issues.push({ field: 'gender', message: 'בפוש הזה אין אדם נוסף שהטקסט מדבר עליו' });
  }
  if (g !== 'both' && sg !== 'any') {
    issues.push({ field: 'gender', message: 'וריאנט מותאם למגדר של אדם אחד בלבד (הנמען או האדם הנוסף)' });
  }
  if (!draft.deepLink) {
    issues.push({ field: 'deepLink', message: 'חובה לבחור לאן הפוש מוביל' });
  } else if (entry && !entry.deepLinks.includes(draft.deepLink)) {
    issues.push({ field: 'deepLink', message: 'היעד הזה לא זמין לפוש הזה' });
  }
  if (draft.timeWindow && (draft.timeWindow.start || draft.timeWindow.end)) {
    const s = hhmmToMinutes(draft.timeWindow.start);
    const e = hhmmToMinutes(draft.timeWindow.end);
    if (s === null || e === null) issues.push({ field: 'timeWindow', message: 'חלון זמן: שעה בפורמט 18:30' });
    else if (s === e) issues.push({ field: 'timeWindow', message: 'חלון זמן: שעת ההתחלה והסיום זהות' });
  }
  if (draft.conditions) {
    for (const [key, values] of Object.entries(draft.conditions)) {
      if (!nonEmpty(values)) continue;
      const cond = entry?.conditions?.find((c) => c.key === key);
      if (!cond) issues.push({ field: 'conditions', message: `תנאי לא מוכר: ${key}` });
      else if (values.some((v) => !cond.options.some((o) => o.value === v))) {
        issues.push({ field: 'conditions', message: `ערך לא מוכר בתנאי ${cond.label}` });
      }
    }
  }
  if (draft.audience) {
    const known: Record<keyof PushAudienceFilter, ReadonlyArray<{ id: string }>> = {
      persona: PUSH_PERSONAS,
      ageBand: PUSH_AGE_BANDS,
      primaryGoal: PUSH_PRIMARY_GOALS,
    };
    for (const dim of Object.keys(known) as Array<keyof PushAudienceFilter>) {
      const values = draft.audience[dim];
      if (nonEmpty(values) && values.some((v) => !known[dim].some((k) => k.id === v))) {
        issues.push({ field: 'audience', message: 'ערך קהל לא מוכר' });
      }
    }
  }
  return issues;
}

/** Preview with sample values (the panel's live preview). Sample names agree with the row's gender. */
export function previewPushCopy(
  draft: PushCopyDraft,
  genders?: PushSampleGenders,
): { title: string; body: string; deepLink: string | null } {
  const g = rowGender(draft.gender);
  const sg = rowSubjectGender(draft.subjectGender);
  const vars = sampleVarsFor(
    draft.pushType,
    genders ?? { gender: g === 'both' ? null : g, subjectGender: sg === 'any' ? null : sg },
  );
  const unresolved = new Set<string>();
  const entry = PUSH_CATALOG_BY_TYPE[draft.pushType];
  const routeId = entry ? resolveRouteId(entry, draft.deepLink) : draft.deepLink ?? '';
  return {
    title: renderText((draft.title ?? '').trim(), vars, unresolved),
    body: renderText((draft.body ?? '').trim(), vars, unresolved),
    deepLink: buildDeepLink(routeId, SAMPLE_LINK_PARAMS),
  };
}

// ─── Gender pairs (the editor) ────────────────────────────────────────────────

export interface PushCopyText {
  title: string;
  body: string;
}

export type PushPairSide = 'neutral' | PushGender;

/**
 * What the editor edits: one neutral variant (axis 'none'), or a male/female
 * pair on one axis. Saved as one row per filled side, the pair sharing a
 * pairId. Everything except the text is shared by the pair.
 */
export interface PushCopyPairDraft extends Omit<PushCopyDraft, 'title' | 'body' | 'gender' | 'subjectGender'> {
  axis: PushGenderAxis;
  neutral: PushCopyText;
  male: PushCopyText;
  female: PushCopyText;
}

export interface PushPairIssue extends PushCopyIssue {
  /** Which text the issue is about ('shared' = deep link, conditions, audience...). */
  side: PushPairSide | 'shared';
}

function sideFilled(t: PushCopyText): boolean {
  return !!((t.title ?? '').trim() || (t.body ?? '').trim());
}

/** The rows a pair draft saves: one draft per filled side, with its gender fields set. */
export function pairDraftRows(p: PushCopyPairDraft): Array<{ side: PushPairSide; draft: PushCopyDraft }> {
  const { axis, neutral, male, female, ...shared } = p;
  if (axis === 'none') {
    return [{ side: 'neutral', draft: { ...shared, ...neutral, gender: 'both', subjectGender: 'any' } }];
  }
  const out: Array<{ side: PushPairSide; draft: PushCopyDraft }> = [];
  for (const side of ['male', 'female'] as const) {
    const text = side === 'male' ? male : female;
    if (!sideFilled(text)) continue;
    out.push({
      side,
      draft: {
        ...shared,
        ...text,
        gender: axis === 'recipient' ? side : 'both',
        subjectGender: axis === 'subject' ? side : 'any',
      },
    });
  }
  return out;
}

const TEXT_FIELDS = new Set<PushCopyIssue['field']>(['title', 'body']);

/**
 * Save rules for a pair: every filled side passes validatePushCopyDraft
 * (slashes are still rejected), at least one side is written. A gendered
 * side without its counterpart is allowed but WARNED (that gender then gets
 * a neutral variant or the code default).
 */
export function validatePushCopyPair(p: PushCopyPairDraft): { issues: PushPairIssue[]; warnings: string[] } {
  const issues: PushPairIssue[] = [];
  const warnings: string[] = [];
  const entry = PUSH_CATALOG_BY_TYPE[p.pushType];
  const rows = pairDraftRows(p);
  const seenShared = new Set<string>();

  if (p.axis === 'subject' && entry && !entry.subject) {
    issues.push({ side: 'shared', field: 'gender', message: 'בפוש הזה אין אדם נוסף שהטקסט מדבר עליו' });
  }
  if (rows.length === 0) {
    issues.push({ side: 'shared', field: 'body', message: 'כותבים לפחות נוסח אחד (זכר או נקבה)' });
  }
  for (const { side, draft } of rows) {
    for (const issue of validatePushCopyDraft(draft)) {
      if (TEXT_FIELDS.has(issue.field)) {
        issues.push({ ...issue, side });
      } else if (!seenShared.has(issue.message)) {
        seenShared.add(issue.message);
        issues.push({ ...issue, side: 'shared' });
      }
    }
  }
  if (p.axis !== 'none' && rows.length === 1) {
    const missing: PushGender = rows[0].side === 'male' ? 'female' : 'male';
    warnings.push(missingCounterpartMessage(p.axis, missing, entry));
  }
  return { issues, warnings };
}

/** The warning text for a gendered row whose other-gender twin is missing. */
export function missingCounterpartMessage(
  axis: PushGenderAxis,
  missing: PushGender,
  entry: PushCatalogEntry | undefined,
): string {
  if (axis === 'subject') {
    const who = entry?.subject?.label ?? 'האדם הנוסף';
    return `אין נוסח ל${PUSH_GENDER_LABEL[missing]} (${who}). במקרה כזה נשלח וריאנט כללי או ברירת המחדל שבקוד`;
  }
  const who = missing === 'female' ? 'נשים' : 'גברים';
  return `אין נוסח ל${PUSH_GENDER_LABEL[missing]}. ${who} יקבלו וריאנט כללי או את ברירת המחדל שבקוד`;
}

/**
 * Which text of a pair a recipient gets (the editor's preview toggles), or
 * null when this variant isn't sent to them (another variant or the code
 * default goes instead).
 */
export function pairSideFor(
  p: Pick<PushCopyPairDraft, 'axis' | 'male' | 'female'>,
  recipient: PushGender | null,
  subject: PushGender | null,
): PushPairSide | null {
  if (p.axis === 'none') return 'neutral';
  const g = p.axis === 'recipient' ? recipient : subject;
  if (!g) return null;
  return sideFilled(g === 'male' ? p.male : p.female) ? g : null;
}

/**
 * Gendered rows whose other-gender twin is missing among the live rows (the
 * panel's warning). Twins: same pairId, or (no pairId) same pushType, axis,
 * conditions and audience. Returns row id → the missing gender.
 */
export function findUnpairedRows(rows: PushCopyRow[]): Map<string, PushGender> {
  const live = rows.filter(isRowLive);
  const key = (r: PushCopyRow) =>
    r.pairId
      ? `pair|${r.pushType}|${r.pairId}`
      : `auto|${r.pushType}|${genderAxisOf(r)}|${JSON.stringify(r.conditions ?? null)}|${JSON.stringify(r.audience ?? null)}`;
  const sidesByKey = new Map<string, Set<PushGender>>();
  for (const r of live) {
    const side = genderSideOf(r);
    if (!side) continue;
    const k = key(r);
    if (!sidesByKey.has(k)) sidesByKey.set(k, new Set());
    sidesByKey.get(k)!.add(side);
  }
  const out = new Map<string, PushGender>();
  for (const r of live) {
    const side = genderSideOf(r);
    if (!side) continue;
    const other: PushGender = side === 'male' ? 'female' : 'male';
    if (!sidesByKey.get(key(r))?.has(other)) out.set(r.id, other);
  }
  return out;
}
