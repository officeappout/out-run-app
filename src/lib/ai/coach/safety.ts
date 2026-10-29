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
import { coachT, type CoachLocale } from './coach-locale';

export type SafetyTrigger = 'chest' | 'breath' | 'dizziness' | 'pregnancy' | 'injury';

/** A negation right before the symptom, allowing one word in between ("אין לי שום כאב"). */
const NEG = /(?:אין\s+לי|בלי|ללא|לא\s+(?:היה|היתה|הייתה|היו|מרגיש|מרגישה|הרגשתי)(?:\s+לי)?)\s+(?:[^\s]+\s+)?$/;

const OTHER_PERSON = /(?:אשתי|אישתי|בת\s+הזוג\s+שלי|בת\s+זוגי|זוגתי|חברה\s+שלי|אחותי|אמא\s+שלי|אימא\s+שלי|הבת\s+שלי|השכנה|מישהי)\s+(?:[^\s]+\s+){0,2}$/;

// English (Kelly server locale): negation and "someone else" before a symptom. They only ever match Latin
// words, so Hebrew text is judged exactly as before.
const NEG_EN = /\b(?:no|not|never|without|(?:do(?:n['’]?t| not)|did(?:n['’]?t| not)|have(?:n['’]?t| not)|never)\s+(?:have|had|feel|felt|get|got|having|experienc\w*))\s+(?:[\w'’-]+\s+){0,2}$/i;
const OTHER_PERSON_EN = /\b(?:wife|husband|partner|girlfriend|boyfriend|fianc[eé]e?|friend|son|daughter|mom|mum|mother|dad|father|sister|brother|neighbou?r|colleague|coworker|kid|child|grand(?:ma|pa|mother|father)|client|cousin|she|he|they)(?:['’]s)?\s+(?:[\w'’-]+\s+){0,2}$/i;

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
    re: /סחרחור|מסוחרר|סחרור|התעלפ|עילפון|מתעלפ|איבדתי\s+הכרה/gi,
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
  // English phrasings (Hebrew rules above run first and are unchanged).
  {
    trigger: 'chest',
    re: /\b(?:chest\s+(?:hurts?|is\s+(?:hurting|tight|aching)|feels?\s+tight|tightness|pressure|discomfort)|tight\s+chest|tight\s+in\s+(?:my\s+|the\s+)?chest|chest\s+(?:feels?|is|gets?|felt)\s+(?:so\s+|very\s+|really\s+)?(?:heavy|squeezed|constricted)|(?:heaviness|squeezing)\s+in\s+(?:my\s+|the\s+)?chest|(?:pain|pressure|tightness)\s+in\s+(?:my\s+|the\s+)?chest|(?:left\s+)?arm\s+(?:is\s+)?(?:numb|tingling)|(?:numb|tingling)\s+(?:in\s+)?(?:my\s+|the\s+)?(?:left\s+)?arm|numbness\s+in\s+(?:my\s+)?arm)/gi,
    unless: (t, s) => /chest\s+muscles?|\bpecs?\b/i.test(t.slice(s, s + 30)),
  },
  {
    trigger: 'breath',
    re: /\b(?:can['’]?t\s+(?:catch\s+(?:my\s+)?)?breath(?:e)?|cannot\s+breathe|(?:hard|difficult)\s+to\s+breathe|(?:trouble|difficulty)\s+breathing|struggling\s+to\s+breathe|gasping\s+for\s+(?:air|breath))/gi,
  },
  {
    trigger: 'dizziness',
    re: /\b(?:light-?headed|dizzy|dizziness|faint(?:ed|ing)?|(?:passed|passing|pass|blacked|blacking|black)\s+out|collapsed|lost\s+consciousness)\b/gi,
  },
  {
    trigger: 'pregnancy',
    re: /\b(?:pregnan(?:t|cy)|expecting\s+a\s+baby|my\s+due\s+date)\b/gi,
  },
  {
    trigger: 'injury',
    re: /\b(?:(?:broke|broken|fractured|tore|torn|sprained|dislocated|ruptured)\s+(?:my\s+|a\s+|the\s+)?(?:\w+\s+){0,2}(?:ankle|wrist|knee|arm|leg|foot|toe|finger|hand|shoulder|elbow|hip|ribs?|back|neck|collarbone|hamstring|calf|achilles|acl|mcl|meniscus|bone|ligament|tendon)(?!\s+(?:squats?|extensions?|raises?|day|workout|pr|prs|record|press|lifts?|rows?|bridge))|(?:ankle|wrist|knee|arm|leg|foot|toe|finger|hand|shoulder|elbow|hip|ribs?|collarbone|bone)\s+(?:is|was|feels?|might\s+be)\s+(?:broken|fractured|dislocated)|sharp\s+pain|stabbing\s+pain|severe\s+pain|swollen|swelling|injured|new\s+injury|acute\s+injury)\b/gi,
  },
];

/** First matching trigger (most specific first), or null. */
export function detectSafetyTrigger(text: string): SafetyTrigger | null {
  const t = (text ?? '').normalize('NFC');
  for (const r of RULES) {
    for (const m of Array.from(t.matchAll(r.re))) {
      const start = m.index ?? 0;
      if (r.unless?.(t, start, m[0])) continue;
      if (NEG_EN.test(before(t, start)) || OTHER_PERSON_EN.test(before(t, start, 40))) continue;
      return r.trigger;
    }
  }
  return null;
}

/**
 * The fixed reply. No emoji, no dashes, no English, the user addressed by core.gender.
 * Kelly speaks in masculine first person (product decision 18.10.2026).
 */
export function safetyReply(trigger: SafetyTrigger, gender: CoachGender, locale: CoachLocale = 'he'): string {
  const t = coachT(locale);
  const opener = t(trigger === 'pregnancy' ? 'safety.opener.pregnancy' : trigger === 'injury' ? 'safety.opener.injury' : 'safety.opener.chest');
  return t('safety.reply', { opener, stop: t('safety.stop', { gender }), call: t('safety.call', { gender }), gender });
}
