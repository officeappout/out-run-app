import { describe, it, expect } from 'vitest';
import { resolveContentTags, resolveNotificationText, dropSentencesWithTag } from '../branding.utils';

/**
 * Phone test AB2 (28.10): the preview said "המטרה: הרמה הבאה. 0% מעיד שאת/ה בדרך הנכונה".
 * A missing / zero progress value drops its sentence, and unknown gender reads the neutral
 * plural (gender-copy.ts rule), never a slash form.
 */
const ROW = 'המטרה: @רמה_הבאה. @אחוז_התקדמות מעיד ש@את/ה בדרך הנכונה.';

describe('AB2: progress sentences', () => {
  it('no progress: the "0%" sentence is dropped, the rest stays', () => {
    const out = resolveContentTags(ROW, { userGender: 'male', targetLevel: 4 });
    expect(out).not.toContain('0%');
    expect(out).not.toContain('בדרך הנכונה');
    expect(out.startsWith('המטרה:')).toBe(true);
  });
  it('zero progress counts as missing', () => {
    expect(resolveContentTags(ROW, { userGender: 'male', targetLevel: 4, programProgress: 0 })).not.toContain('%');
  });
  it('real progress renders', () => {
    expect(resolveContentTags(ROW, { userGender: 'male', targetLevel: 4, programProgress: 35 })).toContain('35% מעיד שאתה בדרך הנכונה.');
  });
  it('dropSentencesWithTag keeps sentences without the tag', () => {
    expect(dropSentencesWithTag('א. ב @x! ג?', '@x')).toBe('א. ג?');
    expect(dropSentencesWithTag('אין תגית', '@x')).toBe('אין תגית');
  });
});

describe('AB2: unknown gender is neutral plural, never a slash', () => {
  const tags = '@את/ה @מוכן/ה? @בוא/י @תוכל/י @תרצה/י';
  for (const userGender of ['other', undefined] as const) {
    it(`description, gender=${String(userGender)}`, () => {
      const out = resolveContentTags(tags, { userGender });
      expect(out).toBe('אתם מוכנים? בואו תוכלו תרצו');
      expect(out).not.toContain('/');
    });
    it(`notification, gender=${String(userGender)}`, () => {
      expect(resolveNotificationText(tags, { userGender } as never)).not.toContain('/');
    });
  }
  it('male / female unchanged', () => {
    expect(resolveContentTags('@את/ה @מוכן/ה', { userGender: 'male' })).toBe('אתה מוכן');
    expect(resolveContentTags('@את/ה @מוכן/ה', { userGender: 'female' })).toBe('את מוכנה');
  });
});
