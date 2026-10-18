import { describe, it, expect } from 'vitest';
import { averageScore, deltaForReview, sumDeltas, topEntries, trend } from '../stats';
import { filterRows, flattenFlagged, type ReviewForList } from '../review-list';
import { messagesToTurns, parseMessageLog, redactPii } from '../transcript';
import type { ReviewIssue } from '../review-types';

const issue = (p: Partial<ReviewIssue>): ReviewIssue => ({
  id: 'precheck-0',
  source: 'precheck',
  turnIndex: 0,
  category: 'hallucination',
  severity: 2,
  evidence: 'e',
  expected: 'x',
  likelyRootCause: 'prompt',
  suggestedFix: 'f',
  ...p,
});

describe('stats aggregation', () => {
  const reviewA = {
    turns: [{}, {}, {}] as never[],
    issues: [
      issue({ turnIndex: 0, category: 'hallucination', likelyRootCause: 'prompt', severity: 3 }),
      issue({ turnIndex: 0, category: 'language_english', likelyRootCause: 'prompt', severity: 2 }),
      issue({ turnIndex: 2, category: 'too_few_exercises', likelyRootCause: 'generator', severity: 2 }),
    ],
    score: 2,
    costUsd: 0.02,
    graderError: null,
  };
  const reviewB = { turns: [{}] as never[], issues: [], score: 5, costUsd: 0.01, graderError: null };
  const reviewC = { turns: [{}] as never[], issues: [issue({ category: 'tone_gender', likelyRootCause: 'prompt', severity: 1 })], score: null, costUsd: 0, graderError: 'review_budget' };

  it('one review → its delta', () => {
    const d = deltaForReview(reviewA);
    expect(d).toMatchObject({ reviews: 1, turns: 3, issues: 3, flaggedTurns: 2, scoreSum: 2, scoreCount: 1, costUsd: 0.02, graderErrors: 0 });
    expect(d.byCategory).toEqual({ hallucination: 1, language_english: 1, too_few_exercises: 1 });
    expect(d.byRootCause).toEqual({ prompt: 2, generator: 1 });
    expect(d.bySeverity).toEqual({ '3': 1, '2': 2 });
  });

  it('sums deltas / stored day docs; an ungraded review adds no score', () => {
    const s = sumDeltas([deltaForReview(reviewA), deltaForReview(reviewB), deltaForReview(reviewC), null, { reviews: 'x' as never }]);
    expect(s).toMatchObject({ reviews: 3, turns: 5, issues: 4, scoreSum: 7, scoreCount: 2, graderErrors: 1 });
    expect(s.costUsd).toBeCloseTo(0.03);
    expect(averageScore(s)).toBe(3.5);
    expect(topEntries(s.byRootCause)).toEqual([
      { key: 'prompt', count: 3 },
      { key: 'generator', count: 1 },
    ]);
    expect(topEntries(s.byCategory, 2).map((e) => e.key)).toEqual(['hallucination', 'language_english']);
    expect(averageScore({ scoreSum: 0, scoreCount: 0 })).toBeNull();
  });

  it('trend is oldest first with per-day averages', () => {
    const t = trend([
      { day: '2026-10-18', ...deltaForReview(reviewB) },
      { day: '2026-10-17', ...deltaForReview(reviewA) },
    ]);
    expect(t.map((p) => [p.day, p.avgScore, p.issues])).toEqual([
      ['2026-10-17', 2, 3],
      ['2026-10-18', 5, 0],
    ]);
  });
});

describe('admin list filtering', () => {
  const reviews: ReviewForList[] = [
    {
      id: 'u1_2026-10-18-a',
      day: '2026-10-18',
      createdAtMs: 2000,
      firstName: 'דוד',
      score: 2,
      turns: [
        { turnIndex: 0, userText: 'מה בתוכנית השבוע?', assistantText: 'יש workout', cards: [], toolCalls: [] },
        { turnIndex: 1, userText: 'תבנה לי אימון בטן', assistantText: 'בניתי', cards: [], toolCalls: null },
      ],
      issues: [
        issue({ id: 'precheck-0', turnIndex: 0, category: 'hallucination', severity: 2, likelyRootCause: 'prompt' }),
        issue({ id: 'precheck-1', turnIndex: 0, category: 'language_english', severity: 2, likelyRootCause: 'prompt' }),
        issue({ id: 'llm-0', source: 'llm', turnIndex: 1, category: 'wrong_domain', severity: 3, likelyRootCause: 'generator' }),
      ],
      issueStatus: { 'precheck-1': { status: 'fixed' }, 'llm-0': { status: 'converted', caseId: 'rv-x' } },
    },
    {
      id: 'u2_2026-10-17-b',
      day: '2026-10-17',
      createdAtMs: 1000,
      firstName: 'נועה',
      score: 4,
      turns: [{ turnIndex: 0, userText: 'רגע יש לך זכרון?', assistantText: 'אני זוכרת', cards: [], toolCalls: [] }],
      issues: [issue({ id: 'precheck-0', turnIndex: 0, category: 'tone_gender', severity: 1, likelyRootCause: 'prompt' })],
    },
  ];
  const rows = flattenFlagged(reviews);

  it('one row per issue, joined with its turn and status', () => {
    expect(rows).toHaveLength(4);
    const conv = rows.find((r) => r.issue.id === 'llm-0')!;
    expect(conv).toMatchObject({ key: 'u1_2026-10-18-a:llm-0', status: 'converted', caseId: 'rv-x', userText: 'תבנה לי אימון בטן', toolCalls: null });
    expect(rows.find((r) => r.key === 'u2_2026-10-17-b:precheck-0')?.status).toBe('open');
  });

  it('filters by category, severity, root cause, status, source; sorts by severity then newest', () => {
    expect(filterRows(rows, {}).map((r) => r.key)).toEqual([
      'u1_2026-10-18-a:llm-0',
      'u1_2026-10-18-a:precheck-0',
      'u1_2026-10-18-a:precheck-1',
      'u2_2026-10-17-b:precheck-0',
    ]);
    expect(filterRows(rows, { category: 'tone_gender' }).map((r) => r.firstName)).toEqual(['נועה']);
    expect(filterRows(rows, { minSeverity: 2 })).toHaveLength(3);
    expect(filterRows(rows, { minSeverity: 3 }).map((r) => r.issue.category)).toEqual(['wrong_domain']);
    expect(filterRows(rows, { rootCause: 'generator' })).toHaveLength(1);
    expect(filterRows(rows, { status: 'not_fixed' })).toHaveLength(3);
    expect(filterRows(rows, { status: 'fixed' }).map((r) => r.issue.category)).toEqual(['language_english']);
    expect(filterRows(rows, { source: 'llm' })).toHaveLength(1);
    expect(filterRows(rows, { category: 'all', rootCause: 'all', status: 'all', source: 'all' })).toHaveLength(4);
  });
});

describe('transcript building', () => {
  const ts = (ms: number) => ({ toMillis: () => ms });
  it('groups messages into turns, reads the optional log and cards', () => {
    const turns = messagesToTurns([
      { id: 'm1', data: { role: 'user', text: 'תבנה לי אימון בטן', createdAt: ts(1) } },
      {
        id: 'm2',
        data: {
          role: 'assistant',
          text: 'בניתי לך אימון.',
          createdAt: ts(2),
          cards: [{ workoutId: 'ai-1', title: 'בטן', minutes: 20, exerciseCount: 5, location: 'home', decisionRecord: { reasons: [{ code: 'LEVEL_CEILING' }] } }],
          log: {
            model: 'claude-haiku-5-5',
            usage: { in: 10, out: 5, cacheRead: 0 },
            toolCalls: [{ name: 'generate_workout', input: { domains: ['core'] }, resultSummary: { minutes: 20 } }, { bogus: true }],
            guards: [{ type: 'english', action: 'stripped' }],
          },
        },
      },
      { id: 'm3', data: { role: 'user', text: 'תודה', createdAt: ts(3) } },
      { id: 'm4', data: { role: 'assistant', text: 'בכיף', createdAt: ts(4) } },
    ]);
    expect(turns).toHaveLength(2);
    expect(turns[0]).toMatchObject({ turnIndex: 0, userText: 'תבנה לי אימון בטן', assistantMessageId: 'm2', model: 'claude-haiku-5-5' });
    expect(turns[0].cards[0]).toMatchObject({ minutes: 20, reasonCodes: ['LEVEL_CEILING'] });
    expect(turns[0].toolCalls).toEqual([{ name: 'generate_workout', input: { domains: ['core'] }, resultSummary: { minutes: 20 } }]);
    expect(turns[0].guards).toEqual([{ type: 'english', action: 'stripped' }]);
    // no log → toolCalls null (unknown), not []
    expect(turns[1].toolCalls).toBeNull();
  });

  it('parseMessageLog is field-guarded', () => {
    expect(parseMessageLog(undefined)).toBeNull();
    expect(parseMessageLog('x')).toBeNull();
    expect(parseMessageLog({})).toEqual({ model: null, toolCalls: [], guards: [] });
  });

  it('redacts emails and phone numbers, keeps short numbers', () => {
    expect(redactPii('כתבו לי ל-dave@out.co.il או 050-123-4567, אימון של 20 דק')).toBe('כתבו לי ל[email] או [phone], אימון של 20 דק');
    expect(redactPii('+972 54 765 4321')).toBe('[phone]');
  });
});
