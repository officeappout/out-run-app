/**
 * Kelly phase 2 — question-topic tagging for the daily review (flag ai_coach_phase2). Pure.
 *
 * A small fixed Hebrew taxonomy of what users ASK Kelly about (not what went wrong — that is
 * ISSUE_CATEGORIES). The grader tags each turn in the same call (GRADER_TOPICS_SECTION +
 * a `topics` array in the JSON schema); a deterministic keyword tagger fills any turn the
 * grader did not tag (or every turn when the grader failed / the budget ran out). Stored on
 * the review doc as `topics` and counted per day as `byTopic` in ai_coach_review_stats.
 * The panel ("נושאים מובילים") shows top topics + a few anonymized example questions.
 */
import { redactPii } from './transcript';

export const QUESTION_TOPICS = ['today_workout', 'schedule', 'level', 'technique', 'pain', 'app', 'nutrition', 'motivation', 'other'] as const;
export type QuestionTopic = (typeof QUESTION_TOPICS)[number];

export const TOPIC_LABEL_HE: Record<QuestionTopic, string> = {
  today_workout: 'אימון היום',
  schedule: 'לו״ז',
  level: 'רמה/שאלון',
  technique: 'תרגיל/טכניקה',
  pain: 'כאב/פציעה',
  app: 'אפליקציה/תקלה',
  nutrition: 'תזונה',
  motivation: 'מוטיבציה',
  other: 'אחר',
};

export function isQuestionTopic(v: unknown): v is QuestionTopic {
  return typeof v === 'string' && (QUESTION_TOPICS as readonly string[]).includes(v);
}

export interface TurnTopic {
  turnIndex: number;
  topic: QuestionTopic;
}

/** For the grader prompt (appended to GRADER_SYSTEM_PROMPT only while the flag is on). */
export const GRADER_TOPICS_SECTION = `
Question topics
- Also tag EVERY turn with the topic of the user's message (topics: one entry per turn index, in order). Topics:
- today_workout: asks for a workout now or about today's session (build me a workout, shorter, at home)
- schedule: the week, days, moving or skipping sessions, what is planned
- level: their level, level checks, questionnaires, progress and levels
- technique: how to do an exercise, form, which exercise, sets and reps
- pain: pain, injury, soreness, medical worries
- app: how to use the app, settings, steps, notifications, bugs and errors
- nutrition: food, diet, protein, weight
- motivation: tired, no time, lost motivation, coming back after a break
- other: anything else (greetings, small talk, questions about Kelly)`;

/** The extra JSON-schema property (merged into GRADER_JSON_SCHEMA while the flag is on). */
export const TOPICS_JSON_SCHEMA_PROPERTY = {
  type: 'array',
  description: 'One entry per turn: the topic of the user message',
  items: {
    type: 'object',
    additionalProperties: false,
    required: ['turnIndex', 'topic'],
    properties: { turnIndex: { type: 'integer' }, topic: { type: 'string', enum: [...QUESTION_TOPICS] } },
  },
};

const RULES: Array<[QuestionTopic, RegExp]> = [
  ['pain', /כואב|כאב|פציע|נקע|דלקת|רופא|סחרחורת|כאבים|נפצעתי|ברך|גב תחתון/],
  ['app', /אפליקציה|הגדרות|התראות|צעדים|לא עובד|תקלה|באג|נתקע|להתחבר|חשבון|למחוק|מפה|סנכרון|שעון/],
  ['nutrition', /אוכל|תזונה|חלבון|דיאטה|לאכול|קלוריות|ארוחה|משקל/],
  ['level', /רמה|שאלון|מבדק|בדיקת רמה|מתקדם|מתקדמת|התקדמות|השתפרתי/],
  ['schedule', /לו״ז|לוז|לו"ז|השבוע|מחר|להזיז|להעביר|ימים|יום ראשון|יום שני|יום שלישי|יום רביעי|יום חמישי|יום שישי|לדלג|מתוכנן/],
  ['technique', /איך עושים|טכניקה|תרגיל|סטים|חזרות|מתח|שכיבות|סקוואט|פלאנק|נכון/],
  ['motivation', /עייף|עייפה|אין לי כוח|מוטיבציה|אין לי זמן|חזרתי|הפסקה|לא בא לי|קשה לי/],
  ['today_workout', /אימון|תבנה|בנה לי|תן לי|היום|קצר יותר|ארוך יותר|בבית|בפארק/],
];

/** Deterministic fallback: the first matching rule, else 'other'. */
export function topicForQuestion(text: string): QuestionTopic {
  const t = (text ?? '').normalize('NFC');
  for (const [topic, re] of RULES) if (re.test(t)) return topic;
  return 'other';
}

/** Grader tags (validated) + the fallback for every untagged turn. One topic per turn. */
export function mergeTurnTopics(turns: Array<{ turnIndex: number; userText: string }>, graded: unknown): TurnTopic[] {
  const byTurn = new Map<number, QuestionTopic>();
  if (Array.isArray(graded)) {
    for (const g of graded) {
      const r = g as { turnIndex?: unknown; topic?: unknown };
      if (typeof r?.turnIndex === 'number' && isQuestionTopic(r.topic) && !byTurn.has(r.turnIndex)) byTurn.set(r.turnIndex, r.topic);
    }
  }
  return turns
    .filter((t) => (t.userText ?? '').trim())
    .map((t) => ({ turnIndex: t.turnIndex, topic: byTurn.get(t.turnIndex) ?? topicForQuestion(t.userText) }));
}

export function topicCounts(topics: TurnTopic[]): Partial<Record<QuestionTopic, number>> {
  const out: Partial<Record<QuestionTopic, number>> = {};
  for (const t of topics) out[t.topic] = (out[t.topic] ?? 0) + 1;
  return out;
}

/** An example question as the panel shows it: PII masked, long digit runs dropped, short. */
export function anonymizeQuestion(text: string, max = 140): string {
  const t = redactPii(text ?? '')
    .replace(/\d{5,}/g, '…')
    .replace(/\s+/g, ' ')
    .trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

export interface TopicSummaryRow {
  topic: QuestionTopic;
  label: string;
  count: number;
  examples: string[];
}

/** Review docs (topics + turns) → top topics with up to `maxExamples` distinct examples each. */
export function topicSummary(
  reviews: Array<{ topics?: unknown; turns?: Array<{ turnIndex: number; userText?: string }> }>,
  maxExamples = 3,
): { total: number; rows: TopicSummaryRow[] } {
  const counts = new Map<QuestionTopic, number>();
  const examples = new Map<QuestionTopic, string[]>();
  let total = 0;
  for (const r of reviews) {
    if (!Array.isArray(r.topics)) continue;
    const text = new Map((r.turns ?? []).map((t) => [t.turnIndex, t.userText ?? '']));
    for (const raw of r.topics) {
      const t = raw as { turnIndex?: unknown; topic?: unknown };
      if (typeof t?.turnIndex !== 'number' || !isQuestionTopic(t.topic)) continue;
      total++;
      counts.set(t.topic, (counts.get(t.topic) ?? 0) + 1);
      const ex = anonymizeQuestion(text.get(t.turnIndex) ?? '');
      const list = examples.get(t.topic) ?? [];
      if (ex && list.length < maxExamples && !list.includes(ex)) list.push(ex);
      examples.set(t.topic, list);
    }
  }
  const rows = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([topic, count]) => ({ topic, label: TOPIC_LABEL_HE[topic], count, examples: examples.get(topic) ?? [] }));
  return { total, rows };
}
