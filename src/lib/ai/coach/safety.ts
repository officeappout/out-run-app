/**
 * AI coach — deterministic safety gate. Pure.
 *
 * Runs on every user message BEFORE the model is called. A match answers with a fixed
 * reply (stop, see a doctor, 101 in an emergency) and the model is never called for that
 * message: the reply can't be talked out of, and it costs nothing. The system prompt
 * carries the same rule for paraphrases this list misses.
 *
 * Narrow on purpose (owner review 18.10.2026): the fixed reply is for GENUINE symptoms
 * only: chest pain or pressure, shortness of breath, dizziness, fainting, pregnancy, and
 * an acute injury. It must NOT fire on:
 *   - muscle soreness ("כואבים לי השרירים", "יש לי כאבי שרירים מאתמול"), which the model
 *     answers like a coach (lighter session, recovery),
 *   - "דוקטור" / "רופא" used as a nickname or a joke ("תגיד דוקטור, למה 20 דק׳?"),
 *   - negations ("אין לי כאבים בחזה", "בלי סחרחורת"),
 *   - someone else's pregnancy ("אשתי בהריון").
 * Plain joint or back pain without an injury ("כואב לי קצת הגב") is also left to the
 * model, whose prompt says not to load the painful area and to see a professional if it
 * persists.
 */
import type { CoachGender } from './persona';

export type SafetyTrigger = 'chest' | 'breath' | 'dizziness' | 'pregnancy' | 'injury';

/** A negation right before the symptom, allowing one word in between ("אין לי שום כאב"). */
const NEG = /(?:אין\s+לי|בלי|ללא|לא\s+(?:היה|היתה|הייתה|היו|מרגיש|מרגישה|הרגשתי)(?:\s+לי)?)\s+(?:[^\s]+\s+)?$/;

const OTHER_PERSON = /(?:אשתי|אישתי|בת\s+הזוג\s+שלי|בת\s+זוגי|זוגתי|חברה\s+שלי|אחותי|אמא\s+שלי|אימא\s+שלי|הבת\s+שלי|השכנה|מישהי)\s+(?:[^\s]+\s+){0,2}$/;

const before = (t: string, start: number, n = 24) => t.slice(Math.max(0, start - n), start);
const negated = (t: string, start: number) => NEG.test(before(t, start));

interface Rule {
  trigger: SafetyTrigger;
  re: RegExp;
  /** The match is ignored when this returns true. */
  unless?: (text: string, start: number, match: string) => boolean;
}

const RULES: Rule[] = [
  {
    trigger: 'chest',
    re: /(?:כאב|כאבים|כואב(?:ת)?\s+לי|לחץ|לחצים|דקירה|דקירות|צריבה|מועקה)\s+(?:חזק(?:ה)?\s+)?(?:ב|של\s+ה|באזור\s+ה|ה)?חזה|chest\s*(?:pain|pressure|tight)/gi,
    // "שרירי החזה" = the chest MUSCLES (soreness after push-ups), not chest pain.
    unless: (t, s) => negated(t, s) || /שרירי\s+ה?חזה/.test(t),
  },
  {
    trigger: 'breath',
    re: /קוצר\s+נשימה|קשה\s+לי\s+לנשום|לא\s+מצליח(?:ה)?\s+לנשום|אין\s+לי\s+אוויר|short(?:ness)?\s+of\s+breath|can'?t\s+breathe/gi,
    unless: (t, s) => negated(t, s),
  },
  {
    trigger: 'dizziness',
    re: /סחרחור|מסוחרר|סחרור|התעלפ|עילפון|מתעלפ|איבדתי\s+הכרה|dizz|faint/gi,
    unless: (t, s) => negated(t, s),
  },
  {
    trigger: 'pregnancy',
    re: /בהריון|בהיריון|הריון|היריון|הרייון|pregnan/gi,
    unless: (t, s) => negated(t, s) || OTHER_PERSON.test(before(t, s, 40)),
  },
  {
    trigger: 'injury',
    re: /נפצעתי|נקעתי|נקע\s+ב|שברתי|שבר\s+ב|נקרע|קרע\s+ב|התנפח|נפיחות|כאב\s+חד|כאב\s+חזק|כאבים\s+חזקים|כואב\s+לי\s+(?:מאוד|נורא|חזק)|פציעה\s+(?:חדשה|כואבת|מהיום|מאתמול)|\binjur|\bsprain/gi,
    unless: (t, s) => negated(t, s),
  },
];

/** First matching trigger (most specific first), or null. */
export function detectSafetyTrigger(text: string): SafetyTrigger | null {
  const t = (text ?? '').normalize('NFC');
  for (const r of RULES) {
    for (const m of Array.from(t.matchAll(r.re))) {
      const start = m.index ?? 0;
      if (r.unless?.(t, start, m[0])) continue;
      return r.trigger;
    }
  }
  return null;
}

const CALL: Record<CoachGender, string> = {
  male: 'התקשר מיד למד״א בטלפון 101',
  female: 'התקשרי מיד למד״א בטלפון 101',
  other: 'צריך להתקשר מיד למד״א בטלפון 101',
};

const STOP: Record<CoachGender, string> = {
  male: 'כדאי לעצור את האימון ולהתייעץ עם רופא לפני שממשיכים.',
  female: 'כדאי לעצור את האימון ולהתייעץ עם רופאה או רופא לפני שממשיכים.',
  other: 'כדאי לעצור את האימון ולהתייעץ עם רופא לפני שממשיכים.',
};

/**
 * The fixed reply. No emoji, no dashes, no English, the user addressed by core.gender.
 * Kelly speaks in masculine first person (product decision 18.10.2026).
 */
export function safetyReply(trigger: SafetyTrigger, gender: CoachGender): string {
  const opener =
    trigger === 'pregnancy'
      ? 'בהריון מתאמנים רק לפי הנחיה של רופא, ואני לא יכול לבנות אימון במצב הזה.'
      : trigger === 'injury'
        ? 'אני עוצר כאן רגע. אני לא רופא, ופציעה או כאב חד הם סיבה לעצור ולא לאמן את האזור הזה.'
        : 'אני עוצר כאן רגע. אני לא רופא, ולחץ או כאב בחזה, סחרחורת, עילפון או קוצר נשימה הם סיבה לעצור.';
  return `${opener} ${STOP[gender]} אם יש עכשיו כאב או לחץ בחזה, קוצר נשימה או סחרחורת חזקה, ${CALL[gender]}.`;
}
