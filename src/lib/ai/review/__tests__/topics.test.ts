/**
 * Kelly phase 2 — question-topic tagging: the fallback tagger, grader tags + fallback merge,
 * the stats counters (only when topics exist: off = the old delta), the grader params
 * (off = byte-identical) and the panel summary (anonymized examples).
 */
import { describe, it, expect } from 'vitest';
import { anonymizeQuestion, mergeTurnTopics, topicForQuestion, topicSummary, TOPIC_LABEL_HE, QUESTION_TOPICS } from '../topics';
import { deltaForReview, sumDeltas } from '../stats';
import { buildGraderParams, GRADER_SYSTEM_PROMPT, GRADER_SYSTEM_PROMPT_WITH_TOPICS } from '../grader';
import { GRADER_JSON_SCHEMA, parseGraderOutput } from '../review-types';

describe('topicForQuestion (fallback)', () => {
  it.each([
    ['תבנה לי אימון בטן של 15 דק׳', 'today_workout'],
    ['מה בתוכנית השבוע?', 'schedule'],
    ['איך עושים בדיקת רמה?', 'level'],
    ['כואבת לי הברך אחרי סקוואט', 'pain'],
    ['איך מחברים את הצעדים?', 'app'],
    ['כמה חלבון לאכול?', 'nutrition'],
    ['אין לי כוח היום', 'motivation'],
    ['איך עושים מתח נכון?', 'technique'],
    ['היי', 'other'],
  ])('%s → %s', (q, t) => expect(topicForQuestion(q)).toBe(t));
  it('Hebrew labels for every topic', () => {
    expect(QUESTION_TOPICS.every((t) => /[א-ת]/.test(TOPIC_LABEL_HE[t]))).toBe(true);
    expect(TOPIC_LABEL_HE.schedule).toBe('לו״ז');
  });
});

describe('mergeTurnTopics', () => {
  it('grader tags win, invalid ones are ignored, untagged turns get the fallback', () => {
    const turns = [
      { turnIndex: 0, userText: 'תבנה לי אימון' },
      { turnIndex: 1, userText: 'כואב לי הגב' },
      { turnIndex: 2, userText: '' },
    ];
    const r = mergeTurnTopics(turns, [{ turnIndex: 0, topic: 'motivation' }, { turnIndex: 1, topic: 'bogus' }]);
    expect(r).toEqual([
      { turnIndex: 0, topic: 'motivation' },
      { turnIndex: 1, topic: 'pain' },
    ]);
    expect(mergeTurnTopics(turns, null)[0].topic).toBe('today_workout');
  });
});

describe('stats + grader params', () => {
  const base = { turns: [], issues: [], score: 4, costUsd: 0.01, graderError: null };
  it('no topics → no byTopic key (the old delta); topics → counted and summed', () => {
    expect('byTopic' in deltaForReview(base)).toBe(false);
    const d = deltaForReview({ ...base, topics: [{ turnIndex: 0, topic: 'app' }, { turnIndex: 1, topic: 'app' }] });
    expect(d.byTopic).toEqual({ app: 2 });
    expect(sumDeltas([d, { byTopic: { app: 1, pain: 1 } }]).byTopic).toEqual({ app: 3, pain: 1 });
    expect(sumDeltas([deltaForReview(base)]).byTopic).toBeUndefined();
  });
  it('off: params byte-identical to before; on: topics required in the schema + the prompt section', () => {
    const sys = [{ type: 'text' as const, text: GRADER_SYSTEM_PROMPT }];
    const off = buildGraderParams('m', sys, 'u');
    expect(JSON.stringify(off)).toBe(JSON.stringify(buildGraderParams('m', sys, 'u', {})));
    expect((off.output_config as { format: { schema: unknown } }).format.schema).toBe(GRADER_JSON_SCHEMA);
    const on = buildGraderParams('m', sys, 'u', { withTopics: true });
    const schema = (on.output_config as { format: { schema: { required: string[] } } }).format.schema;
    expect(schema.required).toContain('topics');
    expect(GRADER_SYSTEM_PROMPT_WITH_TOPICS.startsWith(GRADER_SYSTEM_PROMPT)).toBe(true);
    expect(GRADER_SYSTEM_PROMPT_WITH_TOPICS).toContain('today_workout');
  });
  it('grader output with topics parses', () => {
    const r = parseGraderOutput(JSON.stringify({ issues: [], score: 5, summary: 'ok', topics: [{ turnIndex: 0, topic: 'app' }] }), 1);
    expect(r.ok && r.output.topics).toEqual([{ turnIndex: 0, topic: 'app' }]);
  });
});

describe('topicSummary (panel)', () => {
  it('counts, orders, keeps ≤3 distinct anonymized examples, skips reviews without topics', () => {
    const reviews = [
      {
        topics: [
          { turnIndex: 0, topic: 'app' },
          { turnIndex: 1, topic: 'app' },
          { turnIndex: 2, topic: 'pain' },
        ],
        turns: [
          { turnIndex: 0, userText: 'איך מחברים צעדים? המייל שלי a@b.co' },
          { turnIndex: 1, userText: 'תתקשרו 050-1234567' },
          { turnIndex: 2, userText: 'כואב לי' },
        ],
      },
      { turns: [{ turnIndex: 0, userText: 'x' }] },
    ];
    const s = topicSummary(reviews);
    expect(s.total).toBe(3);
    expect(s.rows.map((r) => r.topic)).toEqual(['app', 'pain']);
    expect(s.rows[0].label).toBe('אפליקציה/תקלה');
    expect(s.rows[0].examples.join(' ')).not.toMatch(/a@b\.co|1234567/);
  });
  it('anonymizeQuestion masks and shortens', () => {
    expect(anonymizeQuestion('x'.repeat(300)).length).toBeLessThanOrEqual(141);
    expect(anonymizeQuestion('תעודת זהות 123456789')).not.toMatch(/123456789/);
  });
});
