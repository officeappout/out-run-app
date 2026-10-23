// AUTO-GENERATED from src/features/notifications/push-library/push-library.core.ts by functions/scripts/vendor-copy-geo-discovery.js — do not edit.
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
 * Copy text (i18n wave 2A): the title/body of every code default lives in the `push` catalog
 * (src/messages/he/push.json, key `<pushType>.<index>.title|body` — the index is the one in
 * the row id `default:<pushType>:<index>`), resolved through the shared ICU core by
 * ./push-copy-t. Admin-only text (labels, descriptions, whenSent) stays Hebrew here.
 *
 * KEEP THIS FILE PURE AND FREE OF IMPORTS EXCEPT ./push-copy-t: it is mirrored into Cloud
 * Functions, where ./push-copy-t is the functions-side twin (functions/src/shared/push-copy-t.ts,
 * same API, hand-written because each side reaches its catalogs differently).
 */
import { pushCopyT } from './push-copy-t';

/** The Hebrew catalog (the source) — used to build the static PUSH_CATALOG. */
const T = pushCopyT('he');

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
  | '@עוד'
  | '@שיא'
  | '@אנשים'
  | '@דירוג'
  | '@מתחרה';

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
  { key: '@שיא', label: 'השיא האישי ברצף (ימים)', sample: '23' },
  { key: '@אנשים', label: 'כמה אנשים התאמנו שם השבוע (אמיתי)', sample: '12' },
  { key: '@דירוג', label: 'המקום בטבלה לפני שעקפו', sample: '3' },
  { key: '@מתחרה', label: 'מי שעקף בטבלה', sample: 'יואב' },
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
  /** Route id for this default's row (absent = the entry's first deep link). */
  deepLink?: string;
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
  /**
   * Rows may be gendered on BOTH axes at once (the subject's verb in the title,
   * the recipient's grammar in the body — owner rule for "עקפו אותך"). Pairs
   * then run along the subject axis per recipient gender.
   */
  dualGender?: boolean;
}

/**
 * Tone of a row (owner, 21.10.2026). A sender that rotates tones passes
 * conditions.tone; senders that don't, never match a toned row. 'friendly'
 * (ישראלי-חברי) is singular and gendered in title AND body, never for 60+.
 */
export const TONE_CONDITION: PushCondition = {
  key: 'tone',
  label: 'טון',
  options: [
    { value: 'cute', label: 'חמוד ומצחיק' },
    { value: 'personal', label: 'אישי ורגשי' },
    { value: 'curious', label: 'מסקרן' },
    { value: 'friendly', label: 'ישראלי-חברי' },
  ],
};

/** The casual tone: a known age under 60 only (the sender also filters ותיקים and city broadcasts). */
const CASUAL_AGES: PushAudienceFilter = { ageBand: ['under_18', '18_29', '30_44', '45_59'] };

const LEVEL_OPTIONS = ['2', '3', '4', '5', '6', '7', '8', '9', '10'].map((v) => ({ value: v, label: `רמה ${v}` }));

/**
 * The user's track (push-lifecycle audit, 21.10.2026): copy for a runner or a
 * walker must not talk about "the park". The sender passes conditions.track
 * ('strength' | 'run' | 'walk'; a mixed or unknown track passes nothing, so
 * only rows without a track condition fit).
 */
export const TRACK_CONDITION: PushCondition = {
  key: 'track',
  label: 'מסלול',
  options: [
    { value: 'strength', label: 'כוח' },
    { value: 'run', label: 'ריצה' },
    { value: 'walk', label: 'הליכה' },
  ],
};

/**
 * Where in signup the user stopped (onboarding_dropoff, from users.onboardingStep):
 * early = profile and the first questions, mid = the level assessment,
 * near_end = the health declaration (the last screen). "נשאר רק עוד צעד" is
 * written for near_end only.
 */
export const DROPOFF_STAGE_CONDITION: PushCondition = {
  key: 'stage',
  label: 'איפה עצרו בהרשמה',
  options: [
    { value: 'early', label: 'בהתחלה (פרופיל ושאלות)' },
    { value: 'mid', label: 'באמצע (הערכת רמה)' },
    { value: 'near_end', label: 'ממש בסוף (הצהרת בריאות)' },
  ],
};

export const PUSH_CATALOG: ReadonlyArray<PushCatalogEntry> = [
  {
    pushType: 'workout_reminder_day',
    label: 'תזכורת לאימון של היום',
    lever: 'routine',
    channel: 'training_reminder',
    sender: 'trainingReminderScheduler',
    description: 'יש אימון מתוכנן להיום שעוד לא בוצע: ביומן של היום, או לפי התבנית השבועית גם כשהמשתמש לא פתח את האפליקציה היום.',
    whenSent:
      'בדיקה כל שעה עגולה. נשלח בשעה שהמשתמש בחר באונבורדינג (lifestyle.reminders.runningTime), ואם לא בחר ב-07:00. פעם אחת ביום לכל היותר, לא לאימון שהתחיל לפני השעה הזו, לא למי שכבר התאמן היום, לא בשעות השקט (22:00 עד 07:00).',
    vars: ['@שם', '@אימון'],
    deepLinks: ['home', 'map', 'progression'],
    defaults: [
      { title: T('workout_reminder_day.0.title'), body: T('workout_reminder_day.0.body') },
      { title: T('workout_reminder_day.1.title'), body: T('workout_reminder_day.1.body') },
      { title: T('workout_reminder_day.2.title'), body: T('workout_reminder_day.2.body') },
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
    defaults: [{ title: T('workout_reminder_before.0.title'), body: T('workout_reminder_before.0.body') }],
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
      { title: T('workout_reminder_slot.0.title'), body: T('workout_reminder_slot.0.body') },
      { title: T('workout_reminder_slot.1.title'), body: T('workout_reminder_slot.1.body') },
      { title: T('workout_reminder_slot.2.title'), body: T('workout_reminder_slot.2.body') },
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
      'כל יום ב-10:00, למי שלא התאמן ולא פתח את האפליקציה 7 ימים ומעלה, לכל היותר פעם ב-48 שעות. כשהדגל retentionMilestoneCadence דולק: פעם אחת בכל שלב (יום 4 עד 6, שבוע, שבועיים, חודש: יום 30 עד 35) ואחרי יום 35 מפסיקים. כשהדגל retentionLadderV2 דולק: יום 4, יום 7, יום 14, יום 21, יום 28, ואז שקט. כשהדגל firstWeekSequenceEnabled דולק, לא נשלח בשבוע הראשון (סדרת השבוע הראשון אחראית עליו). לא בשבת ובחג.',
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
          // Ladder v2 (retentionLadderV2): d4, d7, d14, d21, d28, then quiet.
          { value: 'd21', label: 'שלושה שבועות' },
          { value: 'd28', label: 'יום 28 (האחרון בסולם החדש)' },
        ],
      },
      TRACK_CONDITION,
      TONE_CONDITION,
    ],
    deepLinks: ['home', 'map'],
    defaults: [
      // Index 0 rewritten in place (was "פספסת כמה ימים? זה בסדר") so ids keep their order.
      { title: T('retention_lapse.0.title'), body: T('retention_lapse.0.body') },
      // "The park" is strength copy (21.10.2026: track condition, was sent to runners and walkers too).
      { title: T('retention_lapse.1.title'), body: T('retention_lapse.1.body'), conditions: { track: ['strength'] } },
      { title: T('retention_lapse.2.title'), body: T('retention_lapse.2.body') },
      { title: T('retention_lapse.3.title'), body: T('retention_lapse.3.body') },
      // Gendered pairs (recipient). Appended, so the neutral rows keep their ids.
      { title: T('retention_lapse.4.title'), body: T('retention_lapse.4.body'), gender: 'male', pair: 'ready_name', conditions: { track: ['strength'] } },
      { title: T('retention_lapse.5.title'), body: T('retention_lapse.5.body'), gender: 'female', pair: 'ready_name', conditions: { track: ['strength'] } },
      { title: T('retention_lapse.6.title'), body: T('retention_lapse.6.body'), gender: 'male', pair: 'back' },
      { title: T('retention_lapse.7.title'), body: T('retention_lapse.7.body'), gender: 'female', pair: 'back' },
      { title: T('retention_lapse.8.title'), body: T('retention_lapse.8.body'), gender: 'male', pair: 'fresh' },
      { title: T('retention_lapse.9.title'), body: T('retention_lapse.9.body'), gender: 'female', pair: 'fresh' },
      // Milestone copy (retentionMilestoneCadence on; the sender passes
      // conditions.milestone). More specific, so it wins over the rows above.
      { title: T('retention_lapse.10.title'), body: T('retention_lapse.10.body'), conditions: { milestone: ['d4'] } },
      { title: T('retention_lapse.11.title'), body: T('retention_lapse.11.body'), gender: 'male', conditions: { milestone: ['d4'] }, pair: 'm_d4' },
      { title: T('retention_lapse.12.title'), body: T('retention_lapse.12.body'), gender: 'female', conditions: { milestone: ['d4'] }, pair: 'm_d4' },
      { title: T('retention_lapse.13.title'), body: T('retention_lapse.13.body'), conditions: { milestone: ['d7'] } },
      { title: T('retention_lapse.14.title'), body: T('retention_lapse.14.body'), gender: 'male', conditions: { milestone: ['d7'] }, pair: 'm_d7' },
      { title: T('retention_lapse.15.title'), body: T('retention_lapse.15.body'), gender: 'female', conditions: { milestone: ['d7'] }, pair: 'm_d7' },
      { title: T('retention_lapse.16.title'), body: T('retention_lapse.16.body'), conditions: { milestone: ['d14'] } },
      { title: T('retention_lapse.17.title'), body: T('retention_lapse.17.body'), gender: 'male', conditions: { milestone: ['d14'] }, pair: 'm_d14' },
      { title: T('retention_lapse.18.title'), body: T('retention_lapse.18.body'), gender: 'female', conditions: { milestone: ['d14'] }, pair: 'm_d14' },
      { title: T('retention_lapse.19.title'), body: T('retention_lapse.19.body'), conditions: { milestone: ['d30'] } },
      { title: T('retention_lapse.20.title'), body: T('retention_lapse.20.body'), gender: 'male', conditions: { milestone: ['d30'] }, pair: 'm_d30' },
      { title: T('retention_lapse.21.title'), body: T('retention_lapse.21.body'), gender: 'female', conditions: { milestone: ['d30'] }, pair: 'm_d30' },
      // Per track (21.10.2026). Appended, so the rows above keep their ids.
      { title: T('retention_lapse.22.title'), body: T('retention_lapse.22.body'), conditions: { track: ['run'] } },
      { title: T('retention_lapse.23.title'), body: T('retention_lapse.23.body'), conditions: { track: ['run'] } },
      { title: T('retention_lapse.24.title'), body: T('retention_lapse.24.body'), gender: 'male', pair: 'run_ready', conditions: { track: ['run'] } },
      { title: T('retention_lapse.25.title'), body: T('retention_lapse.25.body'), gender: 'female', pair: 'run_ready', conditions: { track: ['run'] } },
      { title: T('retention_lapse.26.title'), body: T('retention_lapse.26.body'), conditions: { track: ['walk'] } },
      { title: T('retention_lapse.27.title'), body: T('retention_lapse.27.body'), conditions: { track: ['walk'] } },
      { title: T('retention_lapse.28.title'), body: T('retention_lapse.28.body'), gender: 'male', pair: 'walk_ready', conditions: { track: ['walk'] } },
      { title: T('retention_lapse.29.title'), body: T('retention_lapse.29.body'), gender: 'female', pair: 'walk_ready', conditions: { track: ['walk'] } },
      // push-copy-v2 (owner, 21.10.2026), per tone. Only a sender that rotates
      // tones (pushToneRotation) passes conditions.tone. Appended, ids stable.
      { title: T('retention_lapse.30.title'), body: T('retention_lapse.30.body'), conditions: { milestone: ['d4'], tone: ['personal'] } },
      { title: T('retention_lapse.31.title'), body: T('retention_lapse.31.body'), conditions: { milestone: ['d4'], track: ['walk'], tone: ['cute'] } },
      { title: T('retention_lapse.32.title'), body: T('retention_lapse.32.body'), conditions: { milestone: ['d7', 'd14', 'd21'], tone: ['personal'] } },
      { title: T('retention_lapse.33.title'), body: T('retention_lapse.33.body'), conditions: { milestone: ['d28', 'd30'], tone: ['personal'] } },
      { title: T('retention_lapse.34.title'), body: T('retention_lapse.34.body'), gender: 'male', pair: 'friendly_d4', audience: CASUAL_AGES, conditions: { milestone: ['d4'], tone: ['friendly'] } },
      { title: T('retention_lapse.35.title'), body: T('retention_lapse.35.body'), gender: 'female', pair: 'friendly_d4', audience: CASUAL_AGES, conditions: { milestone: ['d4'], tone: ['friendly'] } },
      { title: T('retention_lapse.36.title'), body: T('retention_lapse.36.body'), gender: 'male', pair: 'friendly_d28', audience: CASUAL_AGES, conditions: { milestone: ['d28', 'd30'], tone: ['friendly'] } },
      { title: T('retention_lapse.37.title'), body: T('retention_lapse.37.body'), gender: 'female', pair: 'friendly_d28', audience: CASUAL_AGES, conditions: { milestone: ['d28', 'd30'], tone: ['friendly'] } },
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
    // 21.10.2026: "עוד דקה" / "נשאר רק עוד צעד" only for who stopped at the
    // end (stage near_end); per-stage and per-track rows below.
    conditions: [DROPOFF_STAGE_CONDITION, TRACK_CONDITION],
    deepLinks: ['gateway'],
    defaults: [
      { title: T('onboarding_dropoff.0.title'), body: T('onboarding_dropoff.0.body'), conditions: { stage: ['near_end'] } },
      { title: T('onboarding_dropoff.1.title'), body: T('onboarding_dropoff.1.body') },
      { title: T('onboarding_dropoff.2.title'), body: T('onboarding_dropoff.2.body') },
      { title: T('onboarding_dropoff.3.title'), body: T('onboarding_dropoff.3.body'), conditions: { stage: ['near_end'] } },
      { title: T('onboarding_dropoff.4.title'), body: T('onboarding_dropoff.4.body') },
      // Gendered pairs (recipient). Appended, so the neutral rows keep their ids.
      { title: T('onboarding_dropoff.5.title'), body: T('onboarding_dropoff.5.body'), gender: 'male', pair: 'step', conditions: { stage: ['near_end'] } },
      { title: T('onboarding_dropoff.6.title'), body: T('onboarding_dropoff.6.body'), gender: 'female', pair: 'step', conditions: { stage: ['near_end'] } },
      { title: T('onboarding_dropoff.7.title'), body: T('onboarding_dropoff.7.body'), gender: 'male', pair: 'ready', conditions: { stage: ['near_end'] } },
      { title: T('onboarding_dropoff.8.title'), body: T('onboarding_dropoff.8.body'), gender: 'female', pair: 'ready', conditions: { stage: ['near_end'] } },
      // Per stage (21.10.2026). Appended, so the rows above keep their ids.
      { title: T('onboarding_dropoff.9.title'), body: T('onboarding_dropoff.9.body'), conditions: { stage: ['early'] } },
      { title: T('onboarding_dropoff.10.title'), body: T('onboarding_dropoff.10.body'), conditions: { stage: ['early'] } },
      { title: T('onboarding_dropoff.11.title'), body: T('onboarding_dropoff.11.body'), conditions: { stage: ['mid'] } },
      { title: T('onboarding_dropoff.12.title'), body: T('onboarding_dropoff.12.body'), conditions: { stage: ['mid'] } },
      // Per track (any stage).
      { title: T('onboarding_dropoff.13.title'), body: T('onboarding_dropoff.13.body'), conditions: { track: ['run'] } },
      { title: T('onboarding_dropoff.14.title'), body: T('onboarding_dropoff.14.body'), conditions: { track: ['walk'] } },
    ],
  },
  {
    pushType: 'first_workout',
    label: 'האימון הראשון (עוד לא התחילו)',
    lever: 'progress',
    channel: 'retention',
    sender: 'firstWorkoutScheduler, retentionScheduler',
    description:
      'סיימו הרשמה ועוד לא התאמנו אף פעם. במקום "לחזור" (הם עוד לא התחילו), הזמנה לאימון הראשון לפי המסלול.',
    whenSent:
      'firstWorkoutScheduler: כל יום ב-17:00, ביום הראשון והשני אחרי ההרשמה, רק למי שעוד אין לו אף אימון. לכל היותר פעמיים. retentionScheduler: למי שמעולם לא התאמן, במקום הנוסח של "חזרה לשגרה". רק כשהדגל firstWorkoutPushEnabled דולק. כשהדגל firstWeekSequenceEnabled דולק, הסדרה של השבוע הראשון (first_week) מחליפה את הפוש של יום 1 ויום 2.',
    vars: ['@שם'],
    conditions: [
      {
        key: 'when',
        label: 'מתי',
        options: [
          { value: 'day1', label: 'יום אחרי ההרשמה' },
          { value: 'day2', label: 'יומיים אחרי ההרשמה' },
          { value: 'later', label: 'שבוע ומעלה (במקום "חזרה לשגרה")' },
        ],
      },
      TRACK_CONDITION,
    ],
    deepLinks: ['home', 'map'],
    defaults: [
      { title: T('first_workout.0.title'), body: T('first_workout.0.body') },
      { title: T('first_workout.1.title'), body: T('first_workout.1.body') },
      { title: T('first_workout.2.title'), body: T('first_workout.2.body') },
      { title: T('first_workout.3.title'), body: T('first_workout.3.body'), conditions: { track: ['strength'] } },
      { title: T('first_workout.4.title'), body: T('first_workout.4.body'), conditions: { track: ['run'] } },
      { title: T('first_workout.5.title'), body: T('first_workout.5.body'), conditions: { track: ['walk'] } },
      { title: T('first_workout.6.title'), body: T('first_workout.6.body'), conditions: { when: ['later'] } },
      { title: T('first_workout.7.title'), body: T('first_workout.7.body'), conditions: { when: ['later'], track: ['run'] } },
      { title: T('first_workout.8.title'), body: T('first_workout.8.body'), conditions: { when: ['later'], track: ['walk'] } },
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
      { title: T('level_up.0.title'), body: T('level_up.0.body'), conditions: { level: ['2'] } },
      { title: T('level_up.1.title'), body: T('level_up.1.body'), conditions: { level: ['3'] } },
      { title: T('level_up.2.title'), body: T('level_up.2.body'), conditions: { level: ['4'] } },
      { title: T('level_up.3.title'), body: T('level_up.3.body'), conditions: { level: ['5'] } },
      { title: T('level_up.4.title'), body: T('level_up.4.body'), conditions: { level: ['6'] } },
      { title: T('level_up.5.title'), body: T('level_up.5.body'), conditions: { level: ['7'] } },
      { title: T('level_up.6.title'), body: T('level_up.6.body'), conditions: { level: ['8'] } },
      { title: T('level_up.7.title'), body: T('level_up.7.body'), conditions: { level: ['9'] } },
      { title: T('level_up.8.title'), body: T('level_up.8.body'), conditions: { level: ['10'] } },
      { title: T('level_up.9.title'), body: T('level_up.9.body') },
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
      { title: T('kudos_single.0.title'), body: T('kudos_single.0.body') },
      // Gendered pair (the sender).
      { title: T('kudos_single.1.title'), body: T('kudos_single.1.body'), subjectGender: 'male', pair: 'sent' },
      { title: T('kudos_single.2.title'), body: T('kudos_single.2.body'), subjectGender: 'female', pair: 'sent' },
      // push-copy-v2 (cute). Appended, ids stable.
      { title: T('kudos_single.3.title'), body: T('kudos_single.3.body'), subjectGender: 'male', pair: 'v2_sent' },
      { title: T('kudos_single.4.title'), body: T('kudos_single.4.body'), subjectGender: 'female', pair: 'v2_sent' },
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
      { title: T('kudos_bundle.0.title'), body: T('kudos_bundle.0.body'), conditions: { others: ['many'] } },
      { title: T('kudos_bundle.1.title'), body: T('kudos_bundle.1.body'), conditions: { others: ['one'] } },
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
    defaults: [{ title: T('group_join_welcome.0.title'), body: T('group_join_welcome.0.body') }],
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
      { title: T('group_join_admin.0.title'), body: T('group_join_admin.0.body') },
      {
        title: T('group_join_admin.1.title'),
        body: T('group_join_admin.1.body'),
        fallbackOnly: true,
      },
      // Gendered pair (the joiner).
      { title: T('group_join_admin.2.title'), body: T('group_join_admin.2.body'), subjectGender: 'male', pair: 'joined' },
      { title: T('group_join_admin.3.title'), body: T('group_join_admin.3.body'), subjectGender: 'female', pair: 'joined' },
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
      { title: T('contribution_approved.0.title'), body: T('contribution_approved.0.body') },
      { title: T('contribution_approved.1.title'), body: T('contribution_approved.1.body'), fallbackOnly: true },
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
      { title: T('week_start.0.title'), body: T('week_start.0.body') },
      { title: T('week_start.1.title'), body: T('week_start.1.body') },
      { title: T('week_start.2.title'), body: T('week_start.2.body') },
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
      TONE_CONDITION,
    ],
    deepLinks: ['map_walk', 'activity_steps', 'home'],
    defaults: [
      { title: T('step_goal.0.title'), body: T('step_goal.0.body'), conditions: { bucket: ['close'] } },
      { title: T('step_goal.1.title'), body: T('step_goal.1.body'), conditions: { bucket: ['close'] } },
      { title: T('step_goal.2.title'), body: T('step_goal.2.body'), conditions: { bucket: ['mid'] } },
      { title: T('step_goal.3.title'), body: T('step_goal.3.body'), conditions: { bucket: ['mid'] } },
      { title: T('step_goal.4.title'), body: T('step_goal.4.body'), conditions: { bucket: ['start'] } },
      { title: T('step_goal.5.title'), body: T('step_goal.5.body'), conditions: { bucket: ['start'] } },
      {
        title: T('step_goal.6.title'),
        body: T('step_goal.6.body'),
        audience: { persona: ['office_worker'] },
        conditions: { bucket: ['close'] },
      },
      {
        title: T('step_goal.7.title'),
        body: T('step_goal.7.body'),
        audience: { persona: ['office_worker'] },
        conditions: { bucket: ['mid'] },
      },
      {
        title: T('step_goal.8.title'),
        body: T('step_goal.8.body'),
        audience: { persona: ['office_worker'] },
        conditions: { bucket: ['start'] },
      },
      {
        title: T('step_goal.9.title'),
        body: T('step_goal.9.body'),
        audience: { persona: ['parent'] },
        conditions: { bucket: ['close'] },
      },
      {
        title: T('step_goal.10.title'),
        body: T('step_goal.10.body'),
        audience: { persona: ['parent'] },
        conditions: { bucket: ['mid'] },
      },
      {
        title: T('step_goal.11.title'),
        body: T('step_goal.11.body'),
        audience: { persona: ['parent'] },
        conditions: { bucket: ['start'] },
      },
      // push-copy-v2 (owner, 21.10.2026), per tone — only with pushToneRotation
      // (the sender passes conditions.tone). Appended, ids stable. The 'start'
      // row is evening copy; the sender still skips 'start' from noon.
      { title: T('step_goal.12.title'), body: T('step_goal.12.body'), conditions: { bucket: ['close'], tone: ['cute'] } },
      { title: T('step_goal.13.title'), body: T('step_goal.13.body'), conditions: { bucket: ['mid'], tone: ['curious'] } },
      { title: T('step_goal.14.title'), body: T('step_goal.14.body'), conditions: { bucket: ['start'], tone: ['personal'] } },
      { title: T('step_goal.15.title'), body: T('step_goal.15.body'), gender: 'male', pair: 'friendly_close', audience: CASUAL_AGES, conditions: { bucket: ['close'], tone: ['friendly'] } },
      { title: T('step_goal.16.title'), body: T('step_goal.16.body'), gender: 'female', pair: 'friendly_close', audience: CASUAL_AGES, conditions: { bucket: ['close'], tone: ['friendly'] } },
    ],
  },
  // ── Streak (owner decisions 21.10.2026; sender streakRescueScheduler, flag
  // enable_streak_pushes). Tones (conditions.tone, rotated by the sender): cute /
  // personal / curious + the Israeli-friendly pairs (CASUAL_AGES: known age under 60).
  // An untoned row per case is the fallback.
  {
    pushType: 'streak_rescue',
    label: 'הצלת רצף',
    lever: 'streak',
    channel: 'progression',
    sender: 'streakRescueScheduler',
    description: 'יש רצף פעיל והיום עוד לא נסגר (10 דקות פעילות או יעד הצעדים). הדרך הכי קצרה לשמור עליו.',
    whenSent:
      'ב-19:30 לרצף של 2 ימים ומעלה, וב-21:15 רק לרצף של 7 ומעלה ורק אם הראשון לא נפתח. לא כשהיום כבר נסגר, לא בשבת כשהשבת לא שוברת רצף, ולא כשקלי כבר שלחה הודעה יזומה היום. נספר בתקרה היומית (הראשון קודם לאחרים). רק כשהדגל enable_streak_pushes דולק.',
    vars: ['@שם', '@רצף', '@צעדים_שנותרו', '@דקות'],
    conditions: [
      {
        key: 'when',
        label: 'מתי',
        options: [
          { value: 'first', label: '19:30' },
          { value: 'late', label: '21:15 (רצף 7 ומעלה)' },
        ],
      },
      TONE_CONDITION,
    ],
    deepLinks: ['home', 'map_walk'],
    defaults: [
      { title: T('streak_rescue.0.title'), body: T('streak_rescue.0.body'), conditions: { when: ['first'], tone: ['cute'] } },
      { title: T('streak_rescue.1.title'), body: T('streak_rescue.1.body'), conditions: { when: ['first'], tone: ['personal'] } },
      { title: T('streak_rescue.2.title'), body: T('streak_rescue.2.body'), conditions: { when: ['first'] } },
      { title: T('streak_rescue.3.title'), body: T('streak_rescue.3.body'), gender: 'male', audience: CASUAL_AGES, conditions: { when: ['first'], tone: ['friendly'] }, pair: 'rescue_il' },
      { title: T('streak_rescue.4.title'), body: T('streak_rescue.4.body'), gender: 'female', audience: CASUAL_AGES, conditions: { when: ['first'], tone: ['friendly'] }, pair: 'rescue_il' },
      { title: T('streak_rescue.5.title'), body: T('streak_rescue.5.body'), conditions: { when: ['late'], tone: ['curious'] } },
      { title: T('streak_rescue.6.title'), body: T('streak_rescue.6.body'), conditions: { when: ['late'] } },
    ],
  },
  {
    pushType: 'streak_broken',
    label: 'הרצף נעצר',
    lever: 'streak',
    channel: 'progression',
    sender: 'streakRescueScheduler',
    description: 'אתמול הרצף נעצר. בלי אשמה: השיא נשאר, ומתחילים מחדש. כולם רואים כרטיס בבית, פוש רק למי שהרצף שלו היה 7 ימים ומעלה.',
    whenSent:
      'למחרת ב-10:00, פעם אחת לכל רצף שנעצר, רק לרצף של 7 ימים ומעלה. לא כשקלי כבר שלחה הודעה יזומה היום. נספר בתקרה היומית. רק כשהדגל enable_streak_pushes דולק.',
    vars: ['@שם', '@שיא'],
    conditions: [TONE_CONDITION],
    deepLinks: ['home'],
    defaults: [
      { title: T('streak_broken.0.title'), body: T('streak_broken.0.body'), conditions: { tone: ['personal'] } },
      { title: T('streak_broken.1.title'), body: T('streak_broken.1.body') },
      { title: T('streak_broken.2.title'), body: T('streak_broken.2.body'), conditions: { tone: ['cute'] } },
      { title: T('streak_broken.3.title'), body: T('streak_broken.3.body'), gender: 'male', audience: CASUAL_AGES, conditions: { tone: ['friendly'] }, pair: 'broken_il' },
      { title: T('streak_broken.4.title'), body: T('streak_broken.4.body'), gender: 'female', audience: CASUAL_AGES, conditions: { tone: ['friendly'] }, pair: 'broken_il' },
    ],
  },
  {
    pushType: 'streak_milestone',
    label: 'אבן דרך ברצף',
    lever: 'streak',
    channel: 'progression',
    sender: 'streakRescueScheduler',
    description: 'הרצף הגיע היום ל-3, 7, 14, 30, 50, 100 או 365 ימים. החגיגה היא בתוך האפליקציה. הפוש רק למי שלא ראה אותה.',
    whenSent:
      'ב-20:00, רק אם החגיגה באפליקציה לא נראתה היום. פעם אחת לכל אבן דרך. לא כשקלי כבר שלחה הודעה יזומה היום. נספר בתקרה היומית. רק כשהדגל enable_streak_pushes דולק.',
    vars: ['@שם', '@רצף'],
    conditions: [
      {
        key: 'milestone',
        label: 'אבן דרך',
        options: ['3', '7', '14', '30', '50', '100', '365'].map((v) => ({ value: v, label: `${v} ימים` })),
      },
      TONE_CONDITION,
    ],
    deepLinks: ['progression', 'home'],
    defaults: [
      { title: T('streak_milestone.0.title'), body: T('streak_milestone.0.body') },
      { title: T('streak_milestone.1.title'), body: T('streak_milestone.1.body'), conditions: { milestone: ['3'] } },
      { title: T('streak_milestone.2.title'), body: T('streak_milestone.2.body'), conditions: { milestone: ['7'] } },
      { title: T('streak_milestone.3.title'), body: T('streak_milestone.3.body'), conditions: { milestone: ['14'] } },
      { title: T('streak_milestone.4.title'), body: T('streak_milestone.4.body'), conditions: { milestone: ['30'] } },
      { title: T('streak_milestone.5.title'), body: T('streak_milestone.5.body'), gender: 'male', audience: CASUAL_AGES, conditions: { milestone: ['30'], tone: ['friendly'] }, pair: 'm30_il' },
      { title: T('streak_milestone.6.title'), body: T('streak_milestone.6.body'), gender: 'female', audience: CASUAL_AGES, conditions: { milestone: ['30'], tone: ['friendly'] }, pair: 'm30_il' },
      { title: T('streak_milestone.7.title'), body: T('streak_milestone.7.body'), conditions: { milestone: ['50'] } },
      { title: T('streak_milestone.8.title'), body: T('streak_milestone.8.body'), conditions: { milestone: ['100'] } },
      { title: T('streak_milestone.9.title'), body: T('streak_milestone.9.body'), conditions: { milestone: ['365'] } },
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
      { title: T('partner_plan.0.title'), body: T('partner_plan.0.body'), conditions: { activity: ['running'] } },
      { title: T('partner_plan.1.title'), body: T('partner_plan.1.body'), conditions: { activity: ['running'] } },
      { title: T('partner_plan.2.title'), body: T('partner_plan.2.body'), conditions: { activity: ['strength'] } },
      { title: T('partner_plan.3.title'), body: T('partner_plan.3.body'), conditions: { activity: ['strength'] } },
      { title: T('partner_plan.4.title'), body: T('partner_plan.4.body'), conditions: { activity: ['walking'] } },
      { title: T('partner_plan.5.title'), body: T('partner_plan.5.body'), conditions: { activity: ['walking'] } },
      { title: T('partner_plan.6.title'), body: T('partner_plan.6.body') },
      { title: T('partner_plan.7.title'), body: T('partner_plan.7.body'), fallbackOnly: true },
      { title: T('partner_plan.8.title'), body: T('partner_plan.8.body'), fallbackOnly: true },
      // Gendered pairs (who planned the session). Appended, so the neutral rows keep their ids.
      { title: T('partner_plan.9.title'), body: T('partner_plan.9.body'), subjectGender: 'male', conditions: { activity: ['running'] }, pair: 'run_name' },
      { title: T('partner_plan.10.title'), body: T('partner_plan.10.body'), subjectGender: 'female', conditions: { activity: ['running'] }, pair: 'run_name' },
      { title: T('partner_plan.11.title'), body: T('partner_plan.11.body'), subjectGender: 'male', conditions: { activity: ['running'] }, pair: 'run' },
      { title: T('partner_plan.12.title'), body: T('partner_plan.12.body'), subjectGender: 'female', conditions: { activity: ['running'] }, pair: 'run' },
      { title: T('partner_plan.13.title'), body: T('partner_plan.13.body'), subjectGender: 'male', conditions: { activity: ['walking'] }, pair: 'walk_name' },
      { title: T('partner_plan.14.title'), body: T('partner_plan.14.body'), subjectGender: 'female', conditions: { activity: ['walking'] }, pair: 'walk_name' },
      { title: T('partner_plan.15.title'), body: T('partner_plan.15.body'), subjectGender: 'male', conditions: { activity: ['walking'] }, pair: 'walk' },
      { title: T('partner_plan.16.title'), body: T('partner_plan.16.body'), subjectGender: 'female', conditions: { activity: ['walking'] }, pair: 'walk' },
      { title: T('partner_plan.17.title'), body: T('partner_plan.17.body'), subjectGender: 'male', conditions: { activity: ['strength'] }, pair: 'strength_name' },
      { title: T('partner_plan.18.title'), body: T('partner_plan.18.body'), subjectGender: 'female', conditions: { activity: ['strength'] }, pair: 'strength_name' },
      { title: T('partner_plan.19.title'), body: T('partner_plan.19.body'), subjectGender: 'male', conditions: { activity: ['strength'] }, pair: 'strength' },
      { title: T('partner_plan.20.title'), body: T('partner_plan.20.body'), subjectGender: 'female', conditions: { activity: ['strength'] }, pair: 'strength' },
      { title: T('partner_plan.21.title'), body: T('partner_plan.21.body'), subjectGender: 'male', pair: 'any' },
      { title: T('partner_plan.22.title'), body: T('partner_plan.22.body'), subjectGender: 'female', pair: 'any' },
    ],
  },
  // ─── push-copy-v2 (owner-approved 21.10.2026) ──────────────────────────────
  {
    pushType: 'first_week',
    label: 'השבוע הראשון (עד האימון הראשון)',
    lever: 'routine',
    channel: 'retention',
    sender: 'firstWorkoutScheduler (firstWeekSequenceEnabled)',
    description:
      'סדרת השבוע הראשון: יום 1 שגרה, יום 2 רף נמוך, יום 3 חברתי, יום 4 צעדים, יום 5 ערב, יום 7 התחלה חדשה. נעצרת באימון הראשון. ימים 0 ו-6 הם כרטיס בבית בלבד.',
    whenSent:
      'בדיקה כל שעה. פוש אחד לכל היותר ביום, ביום ובשעה של השלב (יום 1 בשעה שהמשתמש בחר, אחרת 18:00; 17:00; 17:00; 18:00; 20:00; יום 7 ב-10:00). יום 3 רק עם גינה ומספר אמיתיים ורק לבגירים. יום 4 רק עם מספר צעדים אמיתי. לא כשקלי כבר כתבה למשתמש באותו יום. הטון מוגרל מתוך הטונים שמתאימים למשתמש.',
    vars: ['@שם', '@שעה', '@מקום', '@אנשים', '@צעדים_שנותרו'],
    conditions: [
      {
        key: 'day',
        label: 'יום בשבוע הראשון',
        options: [
          { value: 'd1', label: 'יום 1 (שגרה)' },
          { value: 'd2', label: 'יום 2 (רף נמוך)' },
          { value: 'd3', label: 'יום 3 (חברתי)' },
          { value: 'd4', label: 'יום 4 (צעדים)' },
          { value: 'd5', label: 'יום 5 (ערב)' },
          { value: 'd7', label: 'יום 7 (התחלה חדשה)' },
        ],
      },
      TONE_CONDITION,
      { key: 'nearby', label: 'מה ידוע ליד הבית', options: [{ value: 'group', label: 'קבוצה פעילה' }] },
    ],
    deepLinks: ['home', 'map_walk', 'map', 'activity_steps'],
    defaults: [
      { title: T('first_week.0.title'), body: T('first_week.0.body'), conditions: { day: ['d1'], tone: ['cute'] } },
      { title: T('first_week.1.title'), body: T('first_week.1.body'), conditions: { day: ['d1'], tone: ['personal'] } },
      { title: T('first_week.2.title'), body: T('first_week.2.body'), conditions: { day: ['d1'], tone: ['curious'] } },
      { title: T('first_week.3.title'), body: T('first_week.3.body'), gender: 'male', pair: 'f_d1', audience: CASUAL_AGES, conditions: { day: ['d1'], tone: ['friendly'] } },
      { title: T('first_week.4.title'), body: T('first_week.4.body'), gender: 'female', pair: 'f_d1', audience: CASUAL_AGES, conditions: { day: ['d1'], tone: ['friendly'] } },
      { title: T('first_week.5.title'), body: T('first_week.5.body'), deepLink: 'map_walk', conditions: { day: ['d2'], tone: ['cute'] } },
      { title: T('first_week.6.title'), body: T('first_week.6.body'), deepLink: 'map_walk', conditions: { day: ['d2'], tone: ['personal'] } },
      { title: T('first_week.7.title'), body: T('first_week.7.body'), deepLink: 'map_walk', conditions: { day: ['d2'], tone: ['curious'] } },
      { title: T('first_week.8.title'), body: T('first_week.8.body'), deepLink: 'map_walk', gender: 'male', pair: 'f_d2', audience: CASUAL_AGES, conditions: { day: ['d2'], tone: ['friendly'] } },
      { title: T('first_week.9.title'), body: T('first_week.9.body'), deepLink: 'map_walk', gender: 'female', pair: 'f_d2', audience: CASUAL_AGES, conditions: { day: ['d2'], tone: ['friendly'] } },
      { title: T('first_week.10.title'), body: T('first_week.10.body'), deepLink: 'map', conditions: { day: ['d3'], tone: ['cute'] } },
      { title: T('first_week.11.title'), body: T('first_week.11.body'), deepLink: 'map', conditions: { day: ['d3'], tone: ['curious'] } },
      // Claims a real group: only when the sender knows one (conditions.nearby = 'group').
      { title: T('first_week.12.title'), body: T('first_week.12.body'), deepLink: 'map', conditions: { day: ['d3'], tone: ['personal'], nearby: ['group'] } },
      { title: T('first_week.13.title'), body: T('first_week.13.body'), deepLink: 'map', gender: 'male', pair: 'f_d3', audience: CASUAL_AGES, conditions: { day: ['d3'], tone: ['friendly'] } },
      { title: T('first_week.14.title'), body: T('first_week.14.body'), deepLink: 'map', gender: 'female', pair: 'f_d3', audience: CASUAL_AGES, conditions: { day: ['d3'], tone: ['friendly'] } },
      { title: T('first_week.15.title'), body: T('first_week.15.body'), deepLink: 'activity_steps', conditions: { day: ['d4'], tone: ['cute'] } },
      { title: T('first_week.16.title'), body: T('first_week.16.body'), deepLink: 'activity_steps', conditions: { day: ['d4'], tone: ['curious'] } },
      { title: T('first_week.17.title'), body: T('first_week.17.body'), conditions: { day: ['d5'], tone: ['personal'] } },
      { title: T('first_week.18.title'), body: T('first_week.18.body'), conditions: { day: ['d5'], tone: ['cute'] } },
      { title: T('first_week.19.title'), body: T('first_week.19.body'), gender: 'male', pair: 'f_d5', audience: CASUAL_AGES, conditions: { day: ['d5'], tone: ['friendly'] } },
      { title: T('first_week.20.title'), body: T('first_week.20.body'), gender: 'female', pair: 'f_d5', audience: CASUAL_AGES, conditions: { day: ['d5'], tone: ['friendly'] } },
      { title: T('first_week.21.title'), body: T('first_week.21.body'), conditions: { day: ['d7'], tone: ['personal'] } },
      { title: T('first_week.22.title'), body: T('first_week.22.body'), conditions: { day: ['d7'], tone: ['curious'] } },
    ],
  },
  {
    pushType: 'second_workout',
    label: 'האימון השני',
    lever: 'progress',
    channel: 'retention',
    sender: 'firstWorkoutScheduler (firstWeekSequenceEnabled)',
    description: 'עשו אימון ראשון אחד בלבד. הזמנה לאימון השני, שהוא מה שהופך סקרנות להרגל.',
    whenSent: 'כל יום ב-18:00, למי שהאימון הראשון והיחיד שלו היה לפני 24 עד 48 שעות. פעם אחת. לא כשקלי כבר כתבה למשתמש באותו יום.',
    vars: ['@שם'],
    conditions: [TONE_CONDITION],
    deepLinks: ['home', 'map'],
    defaults: [
      { title: T('second_workout.0.title'), body: T('second_workout.0.body'), conditions: { tone: ['personal'] } },
      { title: T('second_workout.1.title'), body: T('second_workout.1.body'), conditions: { tone: ['cute'] } },
      { title: T('second_workout.2.title'), body: T('second_workout.2.body'), fallbackOnly: true },
    ],
  },
  // ── Group sessions (22.10.2026, loose-ends batch F). Senders: functions/src/sessionPushes/*, behind
  //    app_config/feature_flags.enableSessionPushes. Friendly tone, gendered for known under-60 recipients;
  //    the neutral row serves unknown gender / 60+. ──
  {
    pushType: 'session_reminder',
    label: 'תזכורת 15 דקות לפני מפגש קבוצתי',
    lever: 'social',
    channel: 'training_reminder',
    sender: 'sessionReminderScheduler',
    description: 'המשתמש נרשם למפגש קבוצתי. התזכורת יוצאת רבע שעה לפני שהוא מתחיל.',
    whenSent:
      'סריקה כל 5 דקות. נשלח 15 דקות לפני שעת המפגש, פעם אחת לכל נרשם. כפוף לשעות שקט ולמדיניות הפושים. רק כשהדגל enableSessionPushes דולק.',
    pending: 'השולח נכתב ועוד לא נפרס',
    vars: ['@שם', '@קבוצה', '@שעה'],
    deepLinks: ['community_group', 'community'],
    defaults: [
      { title: T('session_reminder.0.title'), body: T('session_reminder.0.body') },
      { title: T('session_reminder.1.title'), body: T('session_reminder.1.body'), gender: 'male', pair: 'friendly', audience: CASUAL_AGES },
      { title: T('session_reminder.2.title'), body: T('session_reminder.2.body'), gender: 'female', pair: 'friendly', audience: CASUAL_AGES },
    ],
  },
  {
    pushType: 'session_cancelled',
    label: 'מפגש קבוצתי בוטל',
    lever: 'social',
    channel: 'social',
    sender: 'onSessionCancelled',
    description: 'מי שהמארגן ביטל את המפגש שלו, הרשומים וגם הממתינים מקבלים הודעה.',
    whenSent: 'מיד כשהמפגש מסומן כמבוטל (cancelled על מסמך הנוכחות). פעם אחת לכל נרשם. רק כשהדגל enableSessionPushes דולק.',
    pending: 'השולח נכתב ועוד לא נפרס',
    vars: ['@שם', '@קבוצה', '@שעה'],
    deepLinks: ['community_group', 'community'],
    defaults: [
      { title: T('session_cancelled.0.title'), body: T('session_cancelled.0.body') },
      { title: T('session_cancelled.1.title'), body: T('session_cancelled.1.body'), audience: CASUAL_AGES },
    ],
  },
  {
    pushType: 'session_waitlist_promoted',
    label: 'התפנה מקום במפגש (מרשימת המתנה)',
    lever: 'social',
    channel: 'social',
    sender: 'onSessionWaitlistPromoted',
    description: 'מי שחיכה ברשימת ההמתנה למפגש מלא ועכשיו התפנה לו מקום.',
    whenSent: 'מיד כשהוא עובר מרשימת ההמתנה לרשומים. פעם אחת לכל מעבר. רק כשהדגל enableSessionPushes דולק.',
    pending: 'השולח נכתב ועוד לא נפרס',
    vars: ['@שם', '@קבוצה', '@שעה'],
    deepLinks: ['community_group', 'community'],
    defaults: [
      { title: T('session_waitlist_promoted.0.title'), body: T('session_waitlist_promoted.0.body') },
      { title: T('session_waitlist_promoted.1.title'), body: T('session_waitlist_promoted.1.body'), gender: 'male', pair: 'friendly', audience: CASUAL_AGES },
      { title: T('session_waitlist_promoted.2.title'), body: T('session_waitlist_promoted.2.body'), gender: 'female', pair: 'friendly', audience: CASUAL_AGES },
    ],
  },
  {
    pushType: 'friend_joined',
    label: 'חבר הצטרף',
    lever: 'social',
    channel: 'social',
    sender: '(אין עדיין)',
    description: 'מישהו שהמשתמש מכיר הצטרף לאפליקציה.',
    whenSent: 'עוד לא נשלח. הטקסטים מוכנים לשולח שייבנה.',
    pending: 'אין שולח עדיין',
    vars: ['@שם', '@מצטרף'],
    subject: { label: 'מי שהצטרף', var: '@מצטרף' },
    deepLinks: ['community'],
    defaults: [
      { title: T('friend_joined.0.title'), body: T('friend_joined.0.body'), subjectGender: 'male', pair: 'joined' },
      { title: T('friend_joined.1.title'), body: T('friend_joined.1.body'), subjectGender: 'female', pair: 'joined' },
    ],
  },
  {
    pushType: 'league_overtaken',
    label: 'עקפו אותך בטבלה',
    lever: 'competition',
    channel: 'community',
    sender: '(אין עדיין)',
    description: 'מישהו עקף את המשתמש בליגה השכונתית.',
    whenSent: 'עוד לא נשלח. הטקסטים מוכנים לשולח שייבנה. בטון הישראלי: הפועל בכותרת לפי מי שעקף, הגוף לפי המקבל.',
    pending: 'אין שולח עדיין',
    vars: ['@שם', '@מתחרה', '@דירוג'],
    subject: { label: 'מי שעקף', var: '@מתחרה' },
    dualGender: true,
    conditions: [TONE_CONDITION],
    deepLinks: ['community'],
    defaults: [
      { title: T('league_overtaken.0.title'), body: T('league_overtaken.0.body'), conditions: { tone: ['curious'] } },
      { title: T('league_overtaken.1.title'), body: T('league_overtaken.1.body'), subjectGender: 'male', pair: 'cute', conditions: { tone: ['cute'] } },
      { title: T('league_overtaken.2.title'), body: T('league_overtaken.2.body'), subjectGender: 'female', pair: 'cute', conditions: { tone: ['cute'] } },
      { title: T('league_overtaken.3.title'), body: T('league_overtaken.3.body'), gender: 'male', subjectGender: 'male', pair: 'friendly_m', audience: CASUAL_AGES, conditions: { tone: ['friendly'] } },
      { title: T('league_overtaken.4.title'), body: T('league_overtaken.4.body'), gender: 'male', subjectGender: 'female', pair: 'friendly_m', audience: CASUAL_AGES, conditions: { tone: ['friendly'] } },
      { title: T('league_overtaken.5.title'), body: T('league_overtaken.5.body'), gender: 'female', subjectGender: 'male', pair: 'friendly_f', audience: CASUAL_AGES, conditions: { tone: ['friendly'] } },
      { title: T('league_overtaken.6.title'), body: T('league_overtaken.6.body'), gender: 'female', subjectGender: 'female', pair: 'friendly_f', audience: CASUAL_AGES, conditions: { tone: ['friendly'] } },
    ],
  },
  {
    pushType: 'unit_league',
    label: 'היחידה בליגה (מילואים)',
    lever: 'competition',
    channel: 'community',
    sender: '(אין עדיין)',
    description: 'היחידה של המשתמש קרובה למקום הראשון בליגת המילואים.',
    whenSent: 'עוד לא נשלח. הטקסט מוכן לשולח שייבנה.',
    pending: 'אין שולח עדיין',
    vars: ['@שם'],
    deepLinks: ['community'],
    defaults: [{ title: T('unit_league.0.title'), body: T('unit_league.0.body') }],
  },
  {
    pushType: 'steps_connect',
    label: 'חיבור צעדים',
    lever: 'progress',
    channel: 'health_milestone',
    sender: '(אין עדיין)',
    description: 'המשתמש עוד לא חיבר את הצעדים מהטלפון.',
    whenSent: 'עוד לא נשלח. הטקסט מוכן לשולח שייבנה.',
    pending: 'אין שולח עדיין',
    vars: ['@שם'],
    deepLinks: ['activity_steps', 'home'],
    defaults: [{ title: T('steps_connect.0.title'), body: T('steps_connect.0.body') }],
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

export function defaultRowsFor(pushType: string, locale: string = 'he'): PushCopyRow[] {
  const entry = PUSH_CATALOG_BY_TYPE[pushType];
  if (!entry) return [];
  // Hebrew is the static catalog; another locale reads the same keys from its own catalog
  // (missing keys fall back to Hebrew inside the shared core). Wave 5B passes the user's locale.
  const tl = locale === 'he' ? null : pushCopyT(locale);
  return entry.defaults.map((d, i) => ({
    id: defaultRowId(pushType, i),
    pushType,
    title: tl ? tl(`${pushType}.${i}.title`) : d.title,
    body: tl ? tl(`${pushType}.${i}.body`) : d.body,
    deepLink: d.deepLink && entry.deepLinks.includes(d.deepLink) ? d.deepLink : entry.deepLinks[0],
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
  /** Locale of the code defaults (wave 5B passes the user's). Default 'he'. */
  locale?: string;
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
  /** The chosen row's conditions (e.g. { tone: ['cute'] }) — the sender records the tone it really got. */
  conditions?: Record<string, string[]> | null;
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
    conditions: chosen.row.conditions ?? null,
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
    pickFromRows(entry, defaultRowsFor(pushType, ctx.locale), ctx, 'default')
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
  if (g !== 'both' && sg !== 'any' && !entry?.dualGender) {
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
