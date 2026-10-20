/**
 * Hebrew sentence banks for the demo world's chat life (pure data). Picked by the persona's
 * tone (its persona kind) with a seeded roll — the default, zero-cost text source. The LLM
 * (demo_life_llm) only replaces a line when it is on, under the caps, and passes moderation;
 * on any failure the bank line is used.
 */
import type { Tone } from './persona';
import { pick, rngFrom } from './rng';

/** Spontaneous group-chat lines, by tone. */
export const GROUP_LINES: Record<Tone, readonly string[]> = {
  parent: [
    'מי מגיע מחר בבוקר? אני יכולה רק עד שמונה',
    'הצלחתי להתאמן לפני שהילדים קמו',
    'השבוע עמוס, אבל לא מוותרת על האימון',
    'מישהו בא להליכה אחרי איסוף מהגן?',
    'כל הכבוד לכולם על השבוע',
  ],
  vatikim: [
    'בוקר טוב לכולם, מחר באותה שעה?',
    'היה נעים היום, הלכנו יפה',
    'שומרים על הקצב, לאט וטוב',
    'מי שרוצה, נפגשים ליד הספסלים',
    'תודה על החברה, נתראה מחר',
  ],
  student: [
    'מישהו בא לאימון אחרי ההרצאה?',
    'עשיתי היום שיא אישי במתח!',
    'בתקופת מבחנים אבל האימון מנקה את הראש',
    'מי בא לפארק בערב?',
    'היה אימון מטורף היום',
  ],
  office_worker: [
    'אחרי יום עבודה ארוך, האימון הזה הציל אותי',
    'מישהו בא לריצה בשבע?',
    'הצלחתי להכניס אימון בהפסקת הצהריים',
    'מחר מנוחה, נתראה ביום ראשון',
    'המסלול של אתמול היה מעולה',
  ],
  military: [
    'סיימנו אימון, כל הכבוד לכולם',
    'מחר ריצה בחמש וחצי, מי בא?',
    'מי שבבית בסופ״ש, ממשיכים להתאמן',
    'שיפרתי זמן בריצה, מרגישים את ההתקדמות',
    'שומרים על כושר גם בסבב הזה',
  ],
};

/** Short replies when someone (a viewer / a tester) wrote in a demo chat, by tone. */
export const REPLY_LINES: Record<Tone, readonly string[]> = {
  parent: ['איזה כיף, אני בפנים!', 'נשמע מעולה, אשתדל להגיע', 'תודה ששיתפת!', 'אני איתך, בהצלחה'],
  vatikim: ['יופי, נשמע טוב', 'תודה רבה, נתראה', 'כל הכבוד!', 'בשמחה, אני מגיע'],
  student: ['סגור, אני בא', 'אחלה, מתי?', 'וואו, כל הכבוד!', 'יאללה, אני בפנים'],
  office_worker: ['נשמע טוב, אני בעניין', 'כל הכבוד!', 'תעדכן מתי, אשתדל להגיע', 'מעולה, תודה'],
  military: ['קיבלתי, אני שם', 'כל הכבוד, ממשיכים', 'סגור', 'יאללה, נתראה באימון'],
};

/** After a shared workout, the persona sometimes tells the group. {title} = the session name. */
export const DONE_LINES: readonly string[] = ['סיימתי {title}, היה טוב', 'עוד {title} בכיס', 'עשיתי היום {title}, מרגיש מעולה', '{title} הושלם!'];

/** Park and app feedback when the LLM is off (or fails moderation). {park} = park name. */
export const PARK_FEEDBACK_LINES: readonly string[] = [
  'המתקנים ב{park} במצב טוב, היה נוח להתאמן',
  'ב{park} חסר צל בשעות הצהריים',
  'מתח אחד ב{park} קצת רופף, כדאי לבדוק',
  'ב{park} נקי ונעים, מומלץ בבוקר',
];
export const APP_FEEDBACK_LINES: readonly string[] = [
  'הייתי שמח לראות את הקצב שלי לאורך כל החודש',
  'התזכורת לאימון עזרה לי השבוע',
  'הייתי רוצה לבחור שעה אחרת לתזכורת בסופ״ש',
  'האימון היה קצת ארוך מדי בשבילי היום',
];

export function bankLine(lines: readonly string[], seed: string, vars: Record<string, string> = {}): string {
  const line = pick(rngFrom(seed), lines);
  return line.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '');
}
