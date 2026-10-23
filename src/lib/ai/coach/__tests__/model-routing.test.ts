/**
 * Kelly model routing (model-routing.ts): the per-turn classifier on the owner's real
 * messages, the audience gate, the per-tier request options and the usage label.
 */
import { describe, it, expect } from 'vitest';
import {
  COACH_FAST_THINKING_MAX_TOKENS,
  COACH_SMART_MAX_TOKENS,
  classifyCoachTurn,
  coachModelOptions,
  coachModelRoutingFor,
  coachUsageFeature,
} from '../model-routing';

const tierOf = (text: string, previousTurnSmart = false) => classifyCoachTurn({ text, previousTurnSmart }).tier;

describe('classifyCoachTurn — smart', () => {
  it.each([
    // building / changing workouts (owner threads)
    ['תבנה לי אימון בטן', 'workout_build'],
    ['בוא תבנה לי אימון לבית ל10 דק', 'workout_build'],
    ['אימון ברמה גבוהה לבית 10 דק', 'workout_build'],
    ['תבנה לי את האימון של היום', 'workout_build'],
    ['תחליף את השכיבות במשהו אחר', 'workout_build'],
    ['תוסיף עוד תרגיל לגב', 'workout_build'],
    ['תן לי אימון', 'workout_build'],
    // combos
    ['מתח ופלאנץ׳', 'workout_combo'],
    ['ריצה ובסוף בטן', 'workout_combo'],
    ['חזה וגב', 'workout_combo'],
    // intensity / format
    ['טבטה', 'workout_format'],
    ['משהו EMOM של 12 דקות', 'workout_format'],
    ['AMRAP', 'workout_format'],
    ['בא לי משהו עצים', 'workout_format'],
    ['משהו קצר', 'workout_format'],
    ['אפשר יותר קשה?', 'workout_format'],
    // week / schedule planning
    ['תבנה לי מחדש את השבוע', 'schedule_planning'],
    ['תתכנן לי שבוע', 'schedule_planning'],
    ['תזיז את האימון של שלישי לרביעי', 'schedule_planning'],
    ['אפשר לשנות את הלו״ז?', 'schedule_planning'],
    // complaints / corrections
    ['לא קשור', 'complaint'],
    ['למה?', 'complaint'],
    ['תגיד למה דוקטור הצעת 20 דק?', 'complaint'],
    ['טעית, ביקשתי בטן', 'complaint'],
    ['זה לא מה שביקשתי', 'complaint'],
    // long / multi-request
    ['אתה זוכר מה דיברנו? אתה משתפר?', 'long_message'],
    [
      'היום הייתי עייף כל היום בעבודה ובקושי ישנתי בלילה אז אני לא בטוח מה לעשות עם עצמי הערב בכלל ואם כדאי לי לנוח או לצאת קצת להתאוורר',
      'long_message',
    ],
  ])('%s → smart (%s)', (text, reason) => {
    expect(classifyCoachTurn({ text })).toEqual({ tier: 'smart', reason });
  });
});

describe('classifyCoachTurn — fast', () => {
  it.each([
    ['מה יש לי היום', 'factual_lookup'],
    ['מה יש לי היום?', 'factual_lookup'],
    ['מה הרמה שלי', 'factual_lookup'],
    ['מה בתוכנית השבוע?', 'factual_lookup'],
    ['ומה בשבוע הבא?', 'factual_lookup'],
    ['היי', 'acknowledgement'],
    ['בוקר טוב', 'acknowledgement'],
    ['תודה רבה!', 'acknowledgement'],
    ['סבבה', 'acknowledgement'],
    ['👍', 'acknowledgement'],
    ['כן', 'short_default'],
    ['ריצה', 'short_default'],
    ['כואבים לי השרירים מאתמול', 'short_default'],
    ['תוכנית שלמה', 'short_default'], // "שלמה" contains "למה" but is not a complaint
  ])('%s → fast (%s)', (text, reason) => {
    expect(classifyCoachTurn({ text })).toEqual({ tier: 'fast', reason });
  });
});

describe('classifyCoachTurn — follow-ups of a smart turn', () => {
  it('a short follow-up stays smart', () => {
    expect(classifyCoachTurn({ text: 'כן', previousTurnSmart: true })).toEqual({ tier: 'smart', reason: 'follow_up' });
    expect(tierOf('ובלי קפיצות', true)).toBe('smart');
  });
  it('thanks / greetings and plain lookups drop back to fast', () => {
    expect(tierOf('תודה!', true)).toBe('fast');
    expect(tierOf('מה הרמה שלי', true)).toBe('fast');
    expect(tierOf('מה יש לי היום', true)).toBe('fast');
  });
  it('without a smart previous turn the same text is fast', () => {
    expect(tierOf('כן', false)).toBe('fast');
  });
});

describe('coachModelRoutingFor — audience gate', () => {
  const on = { aiCoachSmartRouting: true, aiCoachFastThinking: true };
  it('flags off → nothing, even for a super admin', () => {
    expect(coachModelRoutingFor({}, true)).toEqual({ smartRouting: false, fastThinking: false });
    expect(coachModelRoutingFor(undefined, true)).toEqual({ smartRouting: false, fastThinking: false });
  });
  it('flags on, all-users off → super admins only', () => {
    expect(coachModelRoutingFor(on, true)).toEqual({ smartRouting: true, fastThinking: true });
    expect(coachModelRoutingFor(on, false)).toEqual({ smartRouting: false, fastThinking: false });
    expect(coachModelRoutingFor(on, undefined)).toEqual({ smartRouting: false, fastThinking: false });
  });
  it('all-users on → everyone, per flag', () => {
    expect(coachModelRoutingFor({ ...on, aiCoachModelRoutingAllUsers: true }, false)).toEqual({ smartRouting: true, fastThinking: true });
    expect(coachModelRoutingFor({ aiCoachSmartRouting: true, aiCoachModelRoutingAllUsers: true }, false)).toEqual({ smartRouting: true, fastThinking: false });
  });
});

describe('coachModelOptions / coachUsageFeature', () => {
  const off = { smartRouting: false, fastThinking: false };
  it('routing off → null options (the engine defaults) and the legacy label', () => {
    expect(coachModelOptions('fast', off)).toBeNull();
    expect(coachModelOptions('smart', off)).toBeNull();
    expect(coachUsageFeature('fast', off)).toBe('ai_coach_chat');
  });
  it('smart tier: adaptive thinking (Sonnet 5.5 rejects disabled), effort medium, room for thinking', () => {
    const o = coachModelOptions('smart', { smartRouting: true, fastThinking: false });
    expect(o).toEqual({ thinking: { type: 'adaptive' }, effort: 'medium', maxTokens: COACH_SMART_MAX_TOKENS });
    expect(COACH_SMART_MAX_TOKENS).toBeGreaterThan(600 * 4);
  });
  it('fast tier: thinking only with ai_coach_fast_thinking', () => {
    expect(coachModelOptions('fast', { smartRouting: true, fastThinking: false })).toBeNull();
    expect(coachModelOptions('fast', { smartRouting: false, fastThinking: true })).toEqual({
      thinking: { type: 'adaptive' },
      effort: 'medium',
      maxTokens: COACH_FAST_THINKING_MAX_TOKENS,
    });
  });
  it('per-tier usage label while routing is live', () => {
    expect(coachUsageFeature('fast', { smartRouting: true, fastThinking: false })).toBe('ai_coach_chat_fast');
    expect(coachUsageFeature('smart', { smartRouting: true, fastThinking: false })).toBe('ai_coach_chat_smart');
    expect(coachUsageFeature('fast', { smartRouting: false, fastThinking: true })).toBe('ai_coach_chat_fast');
  });
});
