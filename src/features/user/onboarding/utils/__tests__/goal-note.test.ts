import { describe, it, expect } from 'vitest';
import {
  GOAL_NOTE_MAX_LENGTH,
  ageBracketFor,
  ageFromBirthDate,
  goalNoteExamples,
  parseGoalNoteHandoff,
  parseIsoDay,
  sanitizeGoalNote,
  type AgeBracket,
} from '../goal-note';

describe('age bracket', () => {
  it('maps ages to brackets at the edges', () => {
    expect(ageBracketFor(14)).toBe('under_18');
    expect(ageBracketFor(17)).toBe('under_18');
    expect(ageBracketFor(18)).toBe('18_29');
    expect(ageBracketFor(29)).toBe('18_29');
    expect(ageBracketFor(30)).toBe('30_44');
    expect(ageBracketFor(44)).toBe('30_44');
    expect(ageBracketFor(45)).toBe('45_59');
    expect(ageBracketFor(59)).toBe('45_59');
    expect(ageBracketFor(60)).toBe('60_plus');
    expect(ageBracketFor(null)).toBeNull();
  });

  it('computes whole years from the onboarding_personal_dob day', () => {
    const now = new Date(2026, 9, 17);
    expect(ageFromBirthDate(parseIsoDay('2008-10-17'), now)).toBe(18);
    expect(ageFromBirthDate(parseIsoDay('2008-10-18'), now)).toBe(17);
    expect(ageFromBirthDate(parseIsoDay('not-a-date'), now)).toBeNull();
  });
});

describe('goalNoteExamples', () => {
  const brackets: AgeBracket[] = ['under_18', '18_29', '30_44', '45_59', '60_plus'];
  const DATING = /להכיר מישה|זוגיות|דייט/;

  it('every bracket × gender has at least 3 examples', () => {
    for (const b of brackets) {
      for (const g of ['male', 'female']) expect(goalNoteExamples(b, g).length).toBeGreaterThanOrEqual(3);
    }
  });

  it('minors never get dating / relationship examples', () => {
    for (const g of ['male', 'female', null]) {
      expect(goalNoteExamples('under_18', g).some((e) => DATING.test(e))).toBe(false);
    }
    // ...while 18–29 does (the gendered form)
    expect(goalNoteExamples('18_29', 'male')).toContain('להכיר מישהי דרך הספורט');
    expect(goalNoteExamples('18_29', 'female')).toContain('להכיר מישהו דרך הספורט');
  });

  it('uses the gendered forms', () => {
    expect(goalNoteExamples('under_18', 'male')).toContain('להיות חזק יותר בספורט שלי');
    expect(goalNoteExamples('under_18', 'female')).toContain('להיות חזקה יותר בספורט שלי');
    expect(goalNoteExamples('30_44', 'male')).toContain('להיות אבא חזק');
    expect(goalNoteExamples('30_44', 'female')).toContain('להיות אמא חזקה');
    expect(goalNoteExamples('60_plus', 'female')).toContain('להישאר חזקה ועצמאית');
    expect(goalNoteExamples('60_plus', 'male')).toContain('להישאר חזק ועצמאי');
  });

  it('female-only examples stay female-only', () => {
    expect(goalNoteExamples('30_44', 'female')).toContain('לחזור לכושר אחרי לידה');
    expect(goalNoteExamples('30_44', 'male')).not.toContain('לחזור לכושר אחרי לידה');
  });

  it("'other' / unknown gender gets the masculine forms; unknown age a neutral set", () => {
    expect(goalNoteExamples('30_44', 'other')).toEqual(goalNoteExamples('30_44', 'male'));
    const neutral = goalNoteExamples(null, 'female');
    expect(neutral.length).toBeGreaterThan(0);
    expect(neutral.some((e) => DATING.test(e))).toBe(false);
  });
});

describe('sanitizeGoalNote', () => {
  it('trims and returns null for empty / non-strings', () => {
    expect(sanitizeGoalNote('  לעשות מתח  ')).toBe('לעשות מתח');
    expect(sanitizeGoalNote('   \n  ')).toBeNull();
    expect(sanitizeGoalNote(undefined)).toBeNull();
    expect(sanitizeGoalNote(42)).toBeNull();
  });

  it(`caps at ${GOAL_NOTE_MAX_LENGTH} characters without splitting an emoji`, () => {
    expect(Array.from(sanitizeGoalNote('א'.repeat(500))!).length).toBe(GOAL_NOTE_MAX_LENGTH);
    const emojis = '💪'.repeat(400);
    const out = sanitizeGoalNote(emojis)!;
    expect(Array.from(out).length).toBe(GOAL_NOTE_MAX_LENGTH);
    expect(out).toBe('💪'.repeat(GOAL_NOTE_MAX_LENGTH));
  });

  it('strips control / zero-width characters and collapses blank lines and spaces', () => {
    expect(sanitizeGoalNote('a\u0000b​c')).toBe('abc');
    expect(sanitizeGoalNote('שורה 1\r\n\r\n\r\n\r\nשורה 2')).toBe('שורה 1\n\nשורה 2');
    expect(sanitizeGoalNote('a    b\t\tc')).toBe('a b c');
  });
});

describe('parseGoalNoteHandoff', () => {
  it('round-trips a valid hand-off and re-sanitises the text', () => {
    const raw = JSON.stringify({ text: '  להתכונן לגיוס ', goal: 'skills', ageBracket: '18_29', gender: 'male' });
    expect(parseGoalNoteHandoff(raw)).toEqual({ text: 'להתכונן לגיוס', goal: 'skills', ageBracket: '18_29', gender: 'male' });
  });
  it('drops unknown context values and rejects empty text / bad JSON', () => {
    expect(parseGoalNoteHandoff(JSON.stringify({ text: 'x', goal: 'nope', ageBracket: '99', gender: 'x' }))).toEqual({
      text: 'x', goal: null, ageBracket: null, gender: null,
    });
    expect(parseGoalNoteHandoff(JSON.stringify({ text: '   ' }))).toBeNull();
    expect(parseGoalNoteHandoff('{oops')).toBeNull();
    expect(parseGoalNoteHandoff(null)).toBeNull();
  });
});
