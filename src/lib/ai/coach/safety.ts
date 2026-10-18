/**
 * AI coach — deterministic safety gate. Pure.
 *
 * Runs on every user message BEFORE the model is called. A match answers with a fixed
 * reply (stop, see a doctor, 101 in an emergency) and the model is never called for that
 * message: the reply can't be talked out of, and it costs nothing. The system prompt
 * carries the same rule for paraphrases this list misses.
 *
 * Deliberately broad (any "כאב" counts, muscle soreness included): a false positive costs
 * one polite reply; a false negative could be a workout built for someone with chest pain.
 */
import type { CoachGender } from './persona';

export type SafetyTrigger = 'chest' | 'breath' | 'dizziness' | 'pregnancy' | 'pain';

const RULES: Array<{ trigger: SafetyTrigger; re: RegExp }> = [
  { trigger: 'chest', re: /(כאב|כאבים|לחץ|לחצים|דקירה|דקירות)\s+(ב|של\s+ה|באזור\s+ה)?חזה|chest\s*(pain|pressure|tight)/i },
  { trigger: 'breath', re: /קוצר\s+נשימה|קשה\s+לי\s+לנשום|לא\s+מצליח(ה)?\s+לנשום|short(ness)?\s+of\s+breath/i },
  { trigger: 'dizziness', re: /סחרחור|מסוחרר|סחרור|התעלפ|עילפון|מתעלפ|dizz|faint/i },
  { trigger: 'pregnancy', re: /הריון|היריון|הרייון|בהריון|בהיריון|pregnan/i },
  { trigger: 'pain', re: /כאב|כואב|כאוב|כאבים|נפצעתי|פציעה\s+כואבת|\bpain\b|\bhurts?\b/i },
];

/** First matching trigger (most specific first), or null. */
export function detectSafetyTrigger(text: string): SafetyTrigger | null {
  const t = (text ?? '').normalize('NFC');
  for (const r of RULES) if (r.re.test(t)) return r.trigger;
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

/** The fixed reply. No emoji, no dashes, no English, gendered by core.gender. */
export function safetyReply(trigger: SafetyTrigger, gender: CoachGender): string {
  const opener =
    trigger === 'pregnancy'
      ? 'בהריון מתאמנים רק לפי הנחיה של רופא, ואני לא יכולה לבנות אימון במצב הזה.'
      : 'אני עוצרת כאן רגע. אני לא רופאה, וכאב, לחץ בחזה, סחרחורת או קוצר נשימה הם סיבה לעצור.';
  return `${opener} ${STOP[gender]} אם יש עכשיו כאב או לחץ בחזה, קוצר נשימה או סחרחורת חזקה, ${CALL[gender]}.`;
}
