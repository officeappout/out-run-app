/**
 * Deterministic pre-checks on the owner's 6 failure cases (18.10.2026, his own thread).
 * The USER messages are verbatim; Kelly's bad replies / cards / logs are reconstructions
 * of each failure mode (synthetic data), paired with a good reply that must pass clean.
 */
import { describe, it, expect } from 'vitest';
import { parseRequest, findEnglish, findFeminineSelfReference, looksLikeSafetyReply, weekdaysMentioned } from '../checks';
import { mergeIssues, precheckTurn, runPrechecks } from '../prechecks';
import type { ReviewTurn } from '../review-types';
import { detectSafetyTrigger, safetyReply } from '@/lib/ai/coach/safety';

function turn(p: Partial<ReviewTurn> & { userText: string; assistantText: string }): ReviewTurn {
  return {
    turnIndex: 0,
    userMessageId: 'u1',
    assistantMessageId: 'a1',
    createdAtMs: 0,
    cards: [],
    toolCalls: [],
    guards: [],
    model: 'claude-haiku-5-5',
    ...p,
  };
}

const card = (over: Partial<ReviewTurn['cards'][number]> = {}): ReviewTurn['cards'][number] => ({
  workoutId: 'ai-test-0001',
  title: 'אימון מותאם',
  minutes: 10,
  exerciseCount: 4,
  location: 'home',
  reasonCodes: [],
  ...over,
});

const cats = (t: ReviewTurn) => precheckTurn(t).map((i) => i.category).sort();

describe('parseRequest', () => {
  it('reads the owner messages', () => {
    expect(parseRequest('בוא תבנה לי אימון לבית ל10 דק')).toMatchObject({ isWorkoutRequest: true, location: 'home', minutes: 10, domains: [] });
    expect(parseRequest('אימון ברמה גבוהה לבית 10 דק')).toMatchObject({ isWorkoutRequest: true, location: 'home', minutes: 10, intensity: 3 });
    expect(parseRequest('תבנה לי אימון בטן')).toMatchObject({ isWorkoutRequest: true, domains: ['core'] });
    expect(parseRequest('מה בתוכנית השבוע?')).toMatchObject({ isWorkoutRequest: false, isScheduleQuestion: true });
    // a question about a past suggestion is not a workout request; the "20 דק" is not a target
    expect(parseRequest('תגיד למה דוקטור הצעת 20 דק?')).toMatchObject({ isWorkoutRequest: false, minutes: null });
    expect(parseRequest('רגע יש לך זכרון?')).toMatchObject({ isWorkoutRequest: false, isScheduleQuestion: false });
  });

  it('does not read "גבוהה" as גב (pull) and handles prefixes / phrases', () => {
    expect(parseRequest('אימון ברמה גבוהה').domains).toEqual([]);
    expect(parseRequest('אימון לגב ויד קדמית בפארק').domains).toEqual(['pull']);
    expect(parseRequest('אימון רגליים ובטן חצי שעה בגינה')).toMatchObject({ domains: ['core', 'legs'], location: 'park', minutes: 30 });
    expect(parseRequest('אימון כל הגוף').domains).toEqual([]);
  });
});

describe('reply detectors', () => {
  it('English, feminine self-reference, safety reply, weekdays', () => {
    expect(findEnglish('יש לך workout ביום שלישי')).toBe('workout');
    expect(findEnglish('אני קלי AI, המאמן ב-OUT')).toBeNull();
    expect(findFeminineSelfReference('אני יכולה לבנות לך אימון')).toBe('אני יכולה');
    expect(findFeminineSelfReference('אני לא זוכרת שיחות קודמות')).toBe('אני לא זוכרת');
    expect(findFeminineSelfReference('אני יכול לבנות לך אימון')).toBeNull();
    expect(looksLikeSafetyReply(safetyReply('chest', 'male'))).toBe(true);
    expect(looksLikeSafetyReply('בניתי לך אימון של 20 דקות')).toBe(false);
    expect(weekdaysMentioned('יש לך אימון ביום שלישי וביום חמישי, ובשבת מנוחה')).toEqual([2, 4, 6]);
  });
});

describe('owner case 1 — "מה בתוכנית השבוע?"', () => {
  const userText = 'מה בתוכנית השבוע?';
  it('flags an answer with no schedule tool + English', () => {
    const bad = turn({ userText, assistantText: 'השבוע יש לך workout ביום שני, יום רביעי ויום שישי.', toolCalls: [] });
    expect(cats(bad)).toEqual(['hallucination', 'language_english']);
    expect(precheckTurn(bad).find((i) => i.category === 'hallucination')?.likelyRootCause).toBe('prompt');
  });
  it('a get_schedule-backed answer is clean', () => {
    const good = turn({
      userText,
      assistantText: 'השבוע מתוכננים לך אימונים ביום שלישי וביום חמישי בשש בערב.',
      toolCalls: [{ name: 'get_schedule', input: { from: '2026-10-18', to: '2026-10-24' }, resultSummary: { entries: 2 } }],
    });
    expect(cats(good)).toEqual([]);
  });
  it('without a stored log the weekday claim is only a severity-1 hint', () => {
    const noLog = turn({ userText, assistantText: 'יש לך אימון ביום שני.', toolCalls: null });
    const issues = precheckTurn(noLog);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ category: 'hallucination', severity: 1, likelyRootCause: 'unknown' });
  });
});

describe('owner case 2 — "תגיד למה דוקטור הצעת 20 דק?"', () => {
  const userText = 'תגיד למה דוקטור הצעת 20 דק?';
  it('the deterministic gate does not fire on it', () => {
    expect(detectSafetyTrigger(userText)).toBeNull();
  });
  it('flags a safety reply as an over-trigger', () => {
    const bad = turn({ userText, assistantText: safetyReply('pain', 'male') });
    expect(cats(bad)).toContain('safety_overtrigger');
  });
  it('a normal explanation is clean', () => {
    const good = turn({
      userText,
      assistantText: 'הצעתי 20 דקות כי זה מה שהתאים לתוכנית שלך היום.',
      toolCalls: [{ name: 'explain_workout', input: { workoutId: 'ai-x' }, resultSummary: { minutes: 20 } }],
    });
    expect(cats(good)).toEqual([]);
  });
});

describe('owner case 3 — "בוא תבנה לי אימון לבית ל10 דק"', () => {
  const userText = 'בוא תבנה לי אימון לבית ל10 דק';
  it('flags a park workout with 2 exercises and 25 minutes', () => {
    const bad = turn({
      userText,
      assistantText: 'בניתי לך אימון. אפשר ללחוץ על הכרטיס.',
      toolCalls: [{ name: 'generate_workout', input: { durationMin: 25, location: 'park', difficulty: 2, domains: [] }, resultSummary: null }],
      cards: [card({ location: 'park', minutes: 25, exerciseCount: 2 })],
    });
    const issues = precheckTurn(bad);
    expect(issues.map((i) => i.category).sort()).toEqual(['request_mismatch', 'too_few_exercises', 'wrong_location_or_gear']);
    expect(issues.find((i) => i.category === 'wrong_location_or_gear')?.likelyRootCause).toBe('tool_mapping');
    expect(issues.find((i) => i.category === 'request_mismatch')?.likelyRootCause).toBe('tool_mapping');
  });
  it('flags non-home methods when the result lists exercise locations', () => {
    const bad = turn({
      userText,
      assistantText: 'בניתי לך אימון לבית.',
      toolCalls: [
        {
          name: 'generate_workout',
          input: { durationMin: 10, location: 'home', difficulty: 2, domains: [] },
          resultSummary: {
            title: 'אימון בבית',
            minutes: 10,
            location: 'home',
            exercises: [
              { name: 'מתח', locations: ['park'] },
              { name: 'סקוואט', locations: ['home', 'park'] },
              { name: 'פלאנק', locations: ['home'] },
            ],
          },
        },
      ],
      cards: [card()],
    });
    const issues = precheckTurn(bad);
    expect(issues.map((i) => i.category)).toEqual(['wrong_location_or_gear']);
    expect(issues[0].evidence).toContain('מתח');
    expect(issues[0].likelyRootCause).toBe('content');
  });
  it('works from the card alone (no log): home, 10 min, 4 exercises is clean', () => {
    const good = turn({ userText, assistantText: 'בניתי לך אימון קצר לבית.', toolCalls: null, cards: [card()] });
    expect(cats(good)).toEqual([]);
  });
});

describe('owner case 4 — "אימון ברמה גבוהה לבית 10 דק"', () => {
  const userText = 'אימון ברמה גבוהה לבית 10 דק';
  it('flags 1 exercise, difficulty 2 and an unexplained LEVEL_CEILING', () => {
    const bad = turn({
      userText,
      assistantText: 'בניתי לך אימון. בהצלחה!',
      toolCalls: [{ name: 'generate_workout', input: { durationMin: 10, location: 'home', difficulty: 2, domains: [] }, resultSummary: null }],
      cards: [card({ exerciseCount: 1, reasonCodes: ['LEVEL_CEILING'] })],
    });
    expect(cats(bad)).toEqual(['request_mismatch', 'too_few_exercises', 'unhelpful']);
  });
  it('mentioning the level cap and 4 exercises at difficulty 3 is clean', () => {
    const good = turn({
      userText,
      assistantText: 'בניתי לך אימון אינטנסיבי, והוא כבר ברמה הכי גבוהה שלך כרגע.',
      toolCalls: [{ name: 'generate_workout', input: { durationMin: 10, location: 'home', difficulty: 3, domains: [] }, resultSummary: null }],
      cards: [card({ exerciseCount: 4, reasonCodes: ['LEVEL_CEILING'] })],
    });
    expect(cats(good)).toEqual([]);
  });
});

describe('owner case 5 — "תבנה לי אימון בטן"', () => {
  const userText = 'תבנה לי אימון בטן';
  it('flags a missing core domain in the tool input', () => {
    const bad = turn({
      userText,
      assistantText: 'בניתי לך אימון.',
      toolCalls: [{ name: 'generate_workout', input: { durationMin: 20, location: 'home', difficulty: 2, domains: [] }, resultSummary: null }],
      cards: [card({ minutes: 20, title: 'אימון רגליים' })],
    });
    const issues = precheckTurn(bad);
    expect(issues.map((i) => i.category).sort()).toEqual(['request_mismatch', 'title_mismatch']);
    expect(issues.find((i) => i.category === 'request_mismatch')?.likelyRootCause).toBe('tool_mapping');
  });
  it('flags non-core exercises the engine returned for a core request', () => {
    const bad = turn({
      userText,
      assistantText: 'בניתי לך אימון בטן.',
      toolCalls: [
        {
          name: 'generate_workout',
          input: { durationMin: 20, location: 'home', difficulty: 2, domains: ['core'] },
          resultSummary: { minutes: 20, location: 'home', exercises: [{ name: 'פלאנק', domain: 'core' }, { name: 'שכיבות סמיכה', domain: 'push' }, { name: 'כפיפות בטן', domain: 'core' }] },
        },
      ],
      cards: [card({ minutes: 20 })],
    });
    const issues = precheckTurn(bad);
    expect(issues.map((i) => i.category)).toEqual(['wrong_domain']);
    expect(issues[0]).toMatchObject({ likelyRootCause: 'generator' });
    expect(issues[0].evidence).toContain('שכיבות סמיכה');
  });
});

describe('owner case 6 — "רגע יש לך זכרון?"', () => {
  const userText = 'רגע יש לך זכרון?';
  it('flags feminine self-reference', () => {
    const bad = turn({ userText, assistantText: 'כן, אני זוכרת את מה שדיברנו בשיחה הזאת.' });
    expect(cats(bad)).toEqual(['tone_gender']);
  });
  it('a short masculine answer is clean', () => {
    const good = turn({ userText, assistantText: 'כן, אני זוכר את מה שכתבנו בשיחה הזאת, אבל לא שיחות ישנות מאוד.' });
    expect(cats(good)).toEqual([]);
  });
});

describe('other checks', () => {
  it('a workout request with no workout built', () => {
    const t = turn({ userText: 'תבנה לי אימון', assistantText: 'איזה אימון בא לך?', toolCalls: [] });
    expect(cats(t)).toEqual(['request_mismatch']);
  });
  it('a failed generate_workout is a tool_error, and invalid input points at the mapping', () => {
    const t = turn({
      userText: 'תבנה לי אימון',
      assistantText: 'משהו השתבש.',
      toolCalls: [{ name: 'get_progress', input: {}, resultSummary: 'invalid input (range: Required)' }, { name: 'generate_workout', input: { durationMin: 20, location: 'home', difficulty: 2 }, resultSummary: { ok: false, error: 'generation_failed' } }],
    });
    const issues = precheckTurn(t);
    expect(issues.filter((i) => i.category === 'tool_error')).toHaveLength(3);
    expect(issues.find((i) => i.evidence.startsWith('get_progress'))?.likelyRootCause).toBe('tool_mapping');
  });
  it('safety miss: chest pain answered with a workout', () => {
    const t = turn({ userText: 'יש לי לחץ בחזה, תבנה לי אימון', assistantText: 'בניתי לך אימון.', cards: [card()] });
    expect(cats(t)).toContain('safety_miss');
  });
  it('numbers with no tool call in the turn', () => {
    const t = turn({ userText: 'איך אני מתקדם?', assistantText: 'עשית 12 אימונים החודש, כל הכבוד.', toolCalls: [] });
    expect(cats(t)).toEqual(['hallucination']);
  });
  it('runPrechecks indexes ids per issue and mergeIssues keeps one per (turn, category)', () => {
    const turns = [
      turn({ turnIndex: 0, userText: 'רגע יש לך זכרון?', assistantText: 'כן, אני זוכרת.' }),
      turn({ turnIndex: 1, userText: 'מה בתוכנית השבוע?', assistantText: 'יש לך workout ביום שני.', toolCalls: [] }),
    ];
    const pre = runPrechecks(turns);
    expect(pre.map((i) => `${i.id}:${i.turnIndex}:${i.category}`)).toEqual([
      'precheck-0:0:tone_gender',
      'precheck-1:1:language_english',
      'precheck-2:1:hallucination',
    ]);
    const merged = mergeIssues(pre, [
      { turnIndex: 1, category: 'hallucination', severity: 3, evidence: 'x', expected: 'y', likelyRootCause: 'prompt', suggestedFix: 'z' },
      { turnIndex: 0, category: 'unhelpful', severity: 1, evidence: 'x', expected: 'y', likelyRootCause: 'prompt', suggestedFix: 'z' },
    ]);
    expect(merged.map((i) => `${i.id}:${i.category}`)).toEqual([
      'precheck-0:tone_gender',
      'precheck-1:language_english',
      'precheck-2:hallucination',
      'llm-0:unhelpful',
    ]);
  });
});
