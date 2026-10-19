/**
 * Engine v2 reasons — typed codes + ONE Hebrew renderer, in the same style as
 * engine/reasons.ts (which stays the renderer for every code it already knows: v2 reuses
 * those codes and delegates to renderScheduleReasonHe, so the two never drift).
 * Never emits an internal id ("easy_run", "UPPER_BODY") into user text.
 */
import {
  renderScheduleReasonHe,
  type KeyRun,
  type ScheduleReason,
} from '../engine/reasons';
import { RUNNING_SLOT_NAME_HE } from '../engine/runningRules';
import type { RunSlot } from './types';

export type V2OnlyReason =
  // ── per day ──
  | { code: 'LONG_RUN_PREFERRED_DAY'; day: number }
  | { code: 'LONG_RUN_LAST_FREE_DAY'; day: number }
  | { code: 'UPPER_ONLY_BEFORE_KEY_RUN'; run: KeyRun }
  | { code: 'FULL_BODY_NO_LEGS'; run: KeyRun }
  | { code: 'STRENGTH_OWN_DAY' }
  | { code: 'DOUBLE_ON_QUALITY_DAY'; day: number }
  | { code: 'EASY_DOUBLE_STRENGTH_FIRST'; day: number }
  | { code: 'COMBINED_SESSION' }
  | { code: 'OAPU_RECOVERY_SESSION' }
  | { code: 'HANDSTAND_FREE_SLOT' }
  | { code: 'MOBILITY_AFTER_RUN' }
  | { code: 'WALK_REST_DAY' }
  | { code: 'NOT_AVAILABLE' }
  | { code: 'TRAVEL_DAY_OPTIONAL' }
  | { code: 'GROUP_RUN_FILLS_SLOT'; slot: RunSlot; time?: string }
  | { code: 'MOVED_FOR_MAKEUP' }
  | { code: 'RUN_OWN_DAY'; slot: RunSlot }
  // ── per week ──
  | { code: 'STRENGTH_FLOOR_UNMET_AVAILABILITY'; days: number; floor: number }
  | { code: 'OPTIONAL_MIDWEEK_MICRO_SESSION' }
  | { code: 'DAYS_BELOW_SKILL_MIN'; skills: number; required: number; available: number }
  | { code: 'LONG_TRAINING_STREAK'; days: number }
  | { code: 'STRENGTH_REDUCED_LONG_RUN_PROTECTED' }
  | { code: 'STRENGTH_MERGED' }
  | { code: 'Q2_TO_EASY' }
  | { code: 'DELOAD_WEEK'; strength: boolean; running: boolean }
  | { code: 'TRAVEL_WEEK' }
  | { code: 'STEPS_DAILY'; goal: number }
  | { code: 'RUN_WEEK_REPEATED' }
  | { code: 'RE_ENTRY' }
  | { code: 'MAKEUP_DROPPED'; kind: 'strength' | 'run'; why: 'too_old' | 'no_room' | 'easy_run' | 'week_limit' }
  | { code: 'LONG_RUN_NEXT_CAP' }
  | { code: 'SEARCH_TRUNCATED' };

export type V2Reason = ScheduleReason | V2OnlyReason;
export type V2ReasonCode = V2Reason['code'];

const DAY_NAME_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'] as const;
export const dayNameHe = (day: number): string => DAY_NAME_HE[((day % 7) + 7) % 7];
const dayHe = (day: number) => `יום ${dayNameHe(day)}`;
const keyRunHe = (run: KeyRun) => (run === 'long' ? 'הריצה הארוכה' : 'אימון האיכות');

const V2_ONLY_CODES = new Set<string>([
  'LONG_RUN_PREFERRED_DAY', 'LONG_RUN_LAST_FREE_DAY', 'UPPER_ONLY_BEFORE_KEY_RUN', 'FULL_BODY_NO_LEGS',
  'STRENGTH_OWN_DAY', 'DOUBLE_ON_QUALITY_DAY', 'EASY_DOUBLE_STRENGTH_FIRST', 'COMBINED_SESSION',
  'OAPU_RECOVERY_SESSION', 'HANDSTAND_FREE_SLOT', 'MOBILITY_AFTER_RUN', 'WALK_REST_DAY', 'NOT_AVAILABLE',
  'TRAVEL_DAY_OPTIONAL', 'GROUP_RUN_FILLS_SLOT', 'MOVED_FOR_MAKEUP', 'RUN_OWN_DAY', 'STRENGTH_FLOOR_UNMET_AVAILABILITY',
  'OPTIONAL_MIDWEEK_MICRO_SESSION', 'DAYS_BELOW_SKILL_MIN', 'LONG_TRAINING_STREAK',
  'STRENGTH_REDUCED_LONG_RUN_PROTECTED', 'STRENGTH_MERGED', 'Q2_TO_EASY', 'DELOAD_WEEK', 'TRAVEL_WEEK',
  'STEPS_DAILY', 'RUN_WEEK_REPEATED', 'RE_ENTRY', 'MAKEUP_DROPPED', 'LONG_RUN_NEXT_CAP', 'SEARCH_TRUNCATED',
]);

function isV2Only(r: V2Reason): r is V2OnlyReason {
  return V2_ONLY_CODES.has(r.code);
}

function renderV2OnlyHe(r: V2OnlyReason): string {
  switch (r.code) {
    case 'LONG_RUN_PREFERRED_DAY':
      return `הריצה הארוכה ב${dayHe(r.day)}, היום שבחרת לה.`;
    case 'LONG_RUN_LAST_FREE_DAY':
      return `הריצה הארוכה ב${dayHe(r.day)}, היום הפנוי האחרון בשבוע.`;
    case 'UPPER_ONLY_BEFORE_KEY_RUN':
      return `רק פלג גוף עליון — מחר ${keyRunHe(r.run)}.`;
    case 'FULL_BODY_NO_LEGS':
      return `כל הגוף הפך לפלג גוף עליון, כי מחר ${keyRunHe(r.run)}.`;
    case 'STRENGTH_OWN_DAY':
      return 'כוח ביום בלי ריצה.';
    case 'DOUBLE_ON_QUALITY_DAY':
      return `ב${dayHe(r.day)} יום כפול על יום האיכות: קודם הריצה, אחר כך הכוח.`;
    case 'EASY_DOUBLE_STRENGTH_FIRST':
      return `ב${dayHe(r.day)} קודם כוח, אחריו ריצה קלה.`;
    case 'COMBINED_SESSION':
      return 'שתי תוכניות באימון אחד משולב, כל אחת בנפח מופחת.';
    case 'OAPU_RECOVERY_SESSION':
      return 'אימון התאוששות קל — פחות משלושה ימים אחרי מתח ביד אחת.';
    case 'HANDSTAND_FREE_SLOT':
      return 'עמידת ידיים קצרה בתחילת האימון.';
    case 'MOBILITY_AFTER_RUN':
      return 'עשר דקות מוביליטי, לא נחשב כיום כוח.';
    case 'WALK_REST_DAY':
      return 'יום מנוחה מאימון: הליכה של חצי שעה.';
    case 'NOT_AVAILABLE':
      return 'לא פנוי.';
    case 'TRAVEL_DAY_OPTIONAL':
      return 'יום נסיעה: אימון קצר בלי ציוד, רק אם מתאים.';
    case 'GROUP_RUN_FILLS_SLOT':
      return `ריצת הקבוצה${r.time ? ` ב-${r.time}` : ''} היא ה${RUNNING_SLOT_NAME_HE[r.slot]} של השבוע.`;
    case 'RUN_OWN_DAY':
      return `${RUNNING_SLOT_NAME_HE[r.slot]} ביום משלה.`;
    case 'MOVED_FOR_MAKEUP':
      return 'הוזז כדי לפנות מקום להשלמה.';
    case 'STRENGTH_FLOOR_UNMET_AVAILABILITY':
      return `בימים הפנויים נכנסים רק ${r.days === 1 ? 'יום כוח אחד' : `${r.days} ימי כוח`}. המומלץ הוא ${r.floor} — אם אפשר, הוסיפו יום.`;
    case 'OPTIONAL_MIDWEEK_MICRO_SESSION':
      return 'אפשר להוסיף באמצע השבוע אימון בית קצר של רבע שעה, פלג עליון וליבה.';
    case 'DAYS_BELOW_SKILL_MIN':
      return `ל-${r.skills} מיומנויות מומלצים ${r.required} ימי אימון, ויש ${r.available}.`;
    case 'LONG_TRAINING_STREAK':
      return `${r.days} ימי אימון ברצף. אפשר, אבל שימו לב להתאוששות.`;
    case 'STRENGTH_REDUCED_LONG_RUN_PROTECTED':
      return 'אימון כוח אחד ירד השבוע, כדי שהריצה הארוכה תקבל יום משלה.';
    case 'STRENGTH_MERGED':
      return 'שתי תוכניות כוח אוחדו לאימון אחד, כדי שהשבוע ייכנס בימים שיש.';
    case 'Q2_TO_EASY':
      return 'אימון האיכות השני הפך לריצה קלה, כדי שהכוח יקבל ימים טריים.';
    case 'DELOAD_WEEK':
      return r.strength && r.running
        ? 'שבוע הקלה: פחות נפח בכוח ובריצה, אותם ימים.'
        : r.strength
          ? 'שבוע הקלה בכוח: חצי נפח, אותם ימים.'
          : 'שבוע הקלה בריצה: פחות נפח, אותם ימים.';
    case 'TRAVEL_WEEK':
      return 'שבוע נסיעה: הריצה הארוכה ואימון האיכות נשמרים, השאר לפי מה שמתאפשר.';
    case 'STEPS_DAILY':
      return `יעד צעדים יומי: ${r.goal.toLocaleString('en-US')}.`;
    case 'RUN_WEEK_REPEATED':
      return 'שבוע הריצה חוזר על עצמו, ושתי ריצות האיכות הראשונות יהיו קלות.';
    case 'RE_ENTRY':
      return 'חוזרים בהדרגה: שבועיים קלים יותר. אפשר גם לבדוק רמה מחדש.';
    case 'MAKEUP_DROPPED':
      return r.why === 'easy_run'
        ? 'ריצה קלה שהוחמצה לא מושלמת — ממשיכים מהשבוע.'
        : r.why === 'too_old'
          ? 'האימון שהוחמץ ישן מדי להשלמה — ממשיכים מהיום.'
          : r.why === 'week_limit'
            ? 'כבר הייתה השלמה אחת השבוע — ממשיכים מהתוכנית.'
            : 'אין יום מתאים להשלמה בלי להעמיס — ממשיכים מהתוכנית.';
    case 'LONG_RUN_NEXT_CAP':
      return 'הריצה הארוכה הבאה לא תהיה ארוכה ביותר מ-10% מהאחרונה שהושלמה.';
    case 'SEARCH_TRUNCATED':
      return 'השבוע נבנה מהר ככל האפשר; ייתכן שיש סידור טוב מעט יותר.';
  }
}

export function renderV2ReasonHe(r: V2Reason): string {
  return isV2Only(r) ? renderV2OnlyHe(r) : renderScheduleReasonHe(r);
}

export function renderV2ReasonsHe(reasons: readonly V2Reason[]): string[] {
  const out: string[] = [];
  for (const r of reasons) {
    const t = renderV2ReasonHe(r);
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}
