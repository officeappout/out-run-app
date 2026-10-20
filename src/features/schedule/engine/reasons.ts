/**
 * Schedule reasons — WHY the schedule engine / advisor recommends what it does, as typed
 * scalars (the same pattern as the workout engine's DecisionReason, decision-record.ts).
 * Pure: no Firebase, no clock, no React.
 *
 * One Hebrew renderer (renderScheduleReasonHe) is the ONLY place reasons become user text,
 * so no surface (the builder drawer, Kelly's tools) can leak an internal code ("R7:",
 * "easy_run", "UPPER_BODY") into what the user reads. Codes stay for machines (tests, the
 * AI tools' `reasons` arrays, analytics); the Hebrew is for people.
 *
 * Day numbers are 0 = Sunday … 6 = Saturday. Hebrew is impersonal on purpose (it is
 * shown to men and women alike, and Kelly re-voices it by the user's gender anyway).
 */
import type { RunningDayRole } from './runningRules';

export type ScheduleDomain = 'strength' | 'running';
export type KeyRun = 'quality' | 'long';
export type TodayKind = 'strength' | 'run' | 'combined' | 'walk' | 'rest';
/** A single planned session's kind in today's reasons. */
export type TodaySessionKind = 'strength' | 'run' | 'walk';

export type ScheduleReason =
  // ── weave (the week) — only reasons that bind on the FINAL week ──
  | { code: 'LONG_RUN_PROTECTED' }
  | { code: 'LEGS_BEFORE_KEY_RUN'; run: KeyRun; soft: boolean; day?: number }
  | { code: 'QUALITY_RUN_FIRST'; day: number }
  | { code: 'ONE_SHARED_DAY_MAX' }
  | { code: 'STRENGTH_FLOOR'; floor: number }
  | { code: 'RUN_SPACING' }
  | { code: 'RUN_STREAK_CAP'; max: number }
  | { code: 'EASY_DAY_DOUBLED'; day: number }
  | { code: 'SATURDAY_USED' }
  | { code: 'RUNNING_REDUCED'; from: number; to: number; dropped: RunningDayRole[] }
  | { code: 'STRENGTH_REDUCED'; from: number; to: number }
  | { code: 'AVAILABILITY_SHORT'; available: number; requested: number }
  | { code: 'DOMAIN_EXCLUDED_BY_TAB'; domain: ScheduleDomain }
  | { code: 'NO_VALID_WEEK' }
  // ── periodization coordination ──
  | { code: 'STRENGTH_PEAK_IN_RUN_PEAK'; strengthWeek: number; runWeek: number }
  | { code: 'STRENGTH_DELOAD_WEEK' }
  | { code: 'RUN_PEAK_WEEK'; runWeek: number }
  | { code: 'RUN_TAPER_WEEK'; runWeek: number }
  // ── today ──
  // 'walk' = a planned walk (enable_home_v2 walking track), never phrased as a run.
  | { code: 'TODAY_DONE'; kind: TodaySessionKind }
  | { code: 'TODAY_PLANNED'; kind: TodaySessionKind }
  | { code: 'MAKEUP_MISSED'; kind: TodaySessionKind; day: number }
  // Strength is recommended and a planned walk is also on today (secondary mention).
  | { code: 'WALK_ALSO_TODAY' }
  | { code: 'KEY_RUN_TOMORROW'; run: KeyRun }
  | { code: 'HARD_DAY_YESTERDAY' }
  | { code: 'WHO_STRENGTH_GAP'; done: number; target: number }
  | { code: 'WELCOME_BACK' }
  | { code: 'FRESH_START' }
  | { code: 'REST_DAY' };

export type ScheduleReasonCode = ScheduleReason['code'];

/** Every code, in display priority (index 0 = shown first). */
export const SCHEDULE_REASON_RANK: readonly ScheduleReasonCode[] = [
  'NO_VALID_WEEK',
  'TODAY_DONE',
  'FRESH_START',
  'WELCOME_BACK',
  'MAKEUP_MISSED',
  'TODAY_PLANNED',
  'WALK_ALSO_TODAY',
  'KEY_RUN_TOMORROW',
  'HARD_DAY_YESTERDAY',
  'REST_DAY',
  'DOMAIN_EXCLUDED_BY_TAB',
  'AVAILABILITY_SHORT',
  'RUNNING_REDUCED',
  'STRENGTH_REDUCED',
  'STRENGTH_FLOOR',
  'LONG_RUN_PROTECTED',
  'LEGS_BEFORE_KEY_RUN',
  'QUALITY_RUN_FIRST',
  'ONE_SHARED_DAY_MAX',
  'RUN_SPACING',
  'RUN_STREAK_CAP',
  'EASY_DAY_DOUBLED',
  'SATURDAY_USED',
  'STRENGTH_PEAK_IN_RUN_PEAK',
  'STRENGTH_DELOAD_WEEK',
  'RUN_PEAK_WEEK',
  'RUN_TAPER_WEEK',
  'WHO_STRENGTH_GAP',
];

export function sortScheduleReasons<T extends ScheduleReason>(reasons: readonly T[]): T[] {
  const rank = (r: ScheduleReason) => SCHEDULE_REASON_RANK.indexOf(r.code);
  return [...reasons].sort((a, b) => rank(a) - rank(b));
}

const DAY_NAME_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'] as const;
const dayHe = (day: number) => `יום ${DAY_NAME_HE[day] ?? ''}`.trim();

const SLOT_HE: Record<RunningDayRole, string> = {
  quality_primary: 'אימון איכות',
  quality_secondary: 'אימון איכות משני',
  long_run: 'ריצה ארוכה',
  easy_run: 'ריצה קלה',
  recovery: 'ריצת התאוששות',
};

function listHe(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} ו${items[items.length - 1]}`;
}

/** The single Hebrew renderer. Never emits a code, an id or an English token. */
export function renderScheduleReasonHe(r: ScheduleReason): string {
  switch (r.code) {
    case 'LONG_RUN_PROTECTED':
      return 'הריצה הארוכה מקבלת יום משלה, בלי כוח באותו יום.';
    case 'LEGS_BEFORE_KEY_RUN':
      return r.soft
        ? `ב${dayHe(r.day ?? 0)} יש אימון כל הגוף יום לפני ${r.run === 'long' ? 'הריצה הארוכה' : 'אימון האיכות'}. כדאי לשמור על רגליים קלות בו.`
        : `אימון רגליים לא נכנס ליום שלפני ${r.run === 'long' ? 'הריצה הארוכה' : 'אימון האיכות בריצה'}, כדי שהרגליים יגיעו רעננות.`;
    case 'QUALITY_RUN_FIRST':
      return `ב${dayHe(r.day)} יש גם ריצת איכות וגם כוח: קודם הריצה, אחר כך הכוח.`;
    case 'ONE_SHARED_DAY_MAX':
      return 'כשיש עד 4 אימונים בשבוע, משלבים כוח וריצה ביום אחד לכל היותר.';
    case 'STRENGTH_FLOOR':
      return `נשמרו לפחות ${r.floor} ימי כוח בשבוע, המינימום המומלץ לבריאות.`;
    case 'RUN_SPACING':
      return 'בין שני אימוני איכות בריצה יש לפחות יומיים.';
    case 'RUN_STREAK_CAP':
      return `לא יותר מ-${r.max} ימי ריצה ברצף, כדי לתת לגוף להתאושש.`;
    case 'EASY_DAY_DOUBLED':
      return `ב${dayHe(r.day)} כוח וריצה קלה באותו יום. אפשר, אבל עדיף לחבר כוח ליום שכבר קשה.`;
    case 'SATURDAY_USED':
      return 'יש אימון גם בשבת. כדאי לוודא שזה מתאים לך.';
    case 'RUNNING_REDUCED': {
      const dropped = r.dropped.map((s) => SLOT_HE[s]);
      const what = dropped.length ? listHe(dropped) : 'ריצה אחת';
      return `אין מספיק ימים לכל הריצות, אז ויתרנו על ${what} (מ-${r.from} ל-${r.to} ריצות). הריצה הארוכה ואימון האיכות נשמרים כל עוד אפשר.`;
    }
    case 'STRENGTH_REDUCED':
      return `ימי הכוח ירדו מ-${r.from} ל-${r.to} כדי שהשבוע ייכנס בימים שיש.`;
    case 'AVAILABILITY_SHORT':
      return `ביקשת ${r.requested} אימונים ב-${r.available} ימים. השבוע נבנה לפי הימים שיש.`;
    case 'DOMAIN_EXCLUDED_BY_TAB':
      return r.domain === 'strength'
        ? 'לא נבנו אימוני כוח השבוע, כי זה מה שבחרת (טאב ריצה).'
        : 'לא נבנו אימוני ריצה השבוע, כי זה מה שבחרת (טאב כוח).';
    case 'NO_VALID_WEEK':
      return 'לא נמצא שבוע שמקיים את כל הכללים בימים האלה. נבנה השבוע הבטוח ביותר שאפשר.';
    case 'STRENGTH_PEAK_IN_RUN_PEAK':
      return 'זה שבוע שיא גם בריצה וגם בכוח. כדאי להוריד קצת עומס באימוני הכוח השבוע, כדי לא להגיע עייפים לריצות.';
    case 'STRENGTH_DELOAD_WEEK':
      return 'השבוע הוא שבוע התאוששות בכוח: פחות נפח, אותם ימים.';
    case 'RUN_PEAK_WEEK':
      return `שבוע ${r.runWeek} הוא מהשבועות הקשים בתוכנית הריצה.`;
    case 'RUN_TAPER_WEEK':
      return `שבוע ${r.runWeek} הוא שבוע ההורדה לפני היעד בריצה: פחות נפח, לשמור על רעננות.`;
    case 'TODAY_DONE':
      if (r.kind === 'walk') return 'ההליכה של היום כבר בוצעה.';
      return r.kind === 'strength' ? 'אימון הכוח של היום כבר בוצע.' : 'הריצה של היום כבר בוצעה.';
    case 'TODAY_PLANNED':
      if (r.kind === 'walk') return 'היום מתוכננת הליכה.';
      return `היום מתוכנן ${r.kind === 'strength' ? 'אימון כוח' : 'אימון ריצה'}.`;
    case 'MAKEUP_MISSED':
      return `אפשר להשלים היום את ${r.kind === 'strength' ? 'אימון הכוח' : r.kind === 'walk' ? 'ההליכה' : 'הריצה'} של ${dayHe(r.day)}.`;
    case 'WALK_ALSO_TODAY':
      return 'וגם הליכה מתוכננת היום.';
    case 'KEY_RUN_TOMORROW':
      return r.run === 'long'
        ? 'מחר הריצה הארוכה, אז היום בלי אימון רגליים.'
        : 'מחר אימון איכות בריצה, אז היום בלי אימון רגליים.';
    case 'HARD_DAY_YESTERDAY':
      return 'אתמול היה יום קשה, אז היום משהו קל.';
    case 'WHO_STRENGTH_GAP':
      return `השבוע ${r.done === 0 ? 'עוד לא היה אימון כוח' : `היה אימון כוח ${r.done === 1 ? 'אחד' : `${r.done} פעמים`}`}, והמינימום המומלץ הוא ${r.target}.`;
    case 'WELCOME_BACK':
      return 'טוב שחזרת. היום אימון קל, ואת שאר השבוע סידרנו מחדש מהיום.';
    case 'FRESH_START':
      return 'מתחילים שבוע חדש מהיום. השבוע הראשון קצת יותר קל.';
    case 'REST_DAY':
      return 'היום יום מנוחה.';
  }
}

export function renderScheduleReasonsHe(reasons: readonly ScheduleReason[]): string[] {
  const out: string[] = [];
  for (const r of sortScheduleReasons(reasons)) {
    const text = renderScheduleReasonHe(r);
    if (text && !out.includes(text)) out.push(text);
  }
  return out;
}
