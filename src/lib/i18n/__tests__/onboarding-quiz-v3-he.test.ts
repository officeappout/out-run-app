/**
 * Namespace `onboarding`, keys `quizV3.*` (strength questionnaire v3, part B: inside the assessment).
 * Pins the Hebrew of the owner-approved boards (Push / Pull / Slider / SliderSkill, 26.10.2026) for
 * every group x gender branch.
 */
import { describe, expect, it } from 'vitest';
import he from '@/messages/he/onboarding.json';
import { onboarding } from '@/messages/ns/onboarding';
import { makeT } from '../t';

const t = makeT('he', onboarding);
const GROUPS = ['push', 'pull', 'legs', 'core'] as const;
const GENDERS = ['male', 'female', 'other'] as const;

describe('onboarding · quizV3 assessment keys (he)', () => {
  it('every quizV3 key has Hebrew', () => {
    const keys = Object.keys(he).filter((k) => k.startsWith('quizV3.'));
    expect(keys.length).toBeGreaterThan(20);
  });

  it('transition copy per group (board Push / Pull)', () => {
    expect(GROUPS.map((group) => t('quizV3.transition.title', { group }))).toEqual([
      'עכשיו: שרירי הדחיפה', 'עכשיו: שרירי המשיכה', 'עכשיו: שרירי הרגליים', 'עכשיו: שרירי הליבה',
    ]);
    expect(t('quizV3.transition.body', { group: 'push' })).toBe('התרגילים כאן עובדים על השרירים שדוחפים את הגוף מהקרקע: שכיבות סמיכה ומקבילים.');
    expect(t('quizV3.transition.body', { group: 'pull' })).toBe('השרירים שמושכים את הגוף למעלה: מתח, חתירות ותליות. כאן מותר שהרמה תהיה שונה מהדחיפה.');
    for (const group of GROUPS) expect(t('quizV3.transition.body', { group })).not.toBe('');
    expect(t('quizV3.transition.groupOf', { current: 2, total: 4 })).toBe('קבוצה 2 מתוך 4');
    expect(GROUPS.map((group) => t('quizV3.transition.saved', { group }))).toEqual([
      'דחיפה נשמרה', 'משיכה נשמרה', 'רגליים נשמרו', 'ליבה נשמרה',
    ]);
    expect(t('quizV3.transition.savedDetail', { exercise: 'שכיבות סמיכה', level: 6 })).toBe('שכיבות סמיכה · רמה 6');
    expect(t('quizV3.transition.ctaFirst')).toBe('בואו נבדוק');
    expect(t('quizV3.transition.ctaNext', { group: 'pull' })).toBe('ממשיכים למשיכה');
    expect(['chest', 'shoulders', 'triceps', 'back', 'biceps', 'quads', 'glutes', 'abs'].map((muscle) => t('quizV3.transition.muscle', { muscle }))).toEqual([
      'חזה', 'כתפיים', 'יד אחורית', 'גב', 'יד קדמית', 'ירך קדמית', 'ישבן', 'בטן',
    ]);
  });

  it('gendered lines: male = the board, female and neutral variants', () => {
    const cases: Array<[Parameters<typeof t>[0], [string, string, string]]> = [
      ['quizV3.transition.lemur', [
        'זכור: עוצרים על הכי קשה שאתה בטוח שתצליח.',
        'זכרי: עוצרים על הכי קשה שאת בטוחה שתצליחי.',
        'זכרו: עוצרים על הכי קשה שבטוח תצליחו.',
      ]],
      ['quizV3.slider.title', ['מה התרגיל הכי קשה שבטוח תצליח?', 'מה התרגיל הכי קשה שבטוח תצליחי?', 'מה התרגיל הכי קשה שבטוח תצליחו?']],
      ['quizV3.slider.swipeHint', ['גלול לצדדים לתרגיל קשה או קל יותר', 'גללי לצדדים לתרגיל קשה או קל יותר', 'גוללים לצדדים לתרגיל קשה או קל יותר']],
      ['quizV3.slider.notSure', [
        'לא בטוח? בחר בערך. נדייק אחרי האימונים הראשונים.',
        'לא בטוחה? בחרי בערך. נדייק אחרי האימונים הראשונים.',
        'לא בטוחים? בוחרים בערך. נדייק אחרי האימונים הראשונים.',
      ]],
      ['quizV3.slider.help', ['לא הבנת מה צריך לעשות? לחץ להסבר', 'לא הבנת מה צריך לעשות? לחצי להסבר', 'לא ברור מה צריך לעשות? לוחצים להסבר']],
      ['quizV3.skill.notYet', ['עוד לא מצליח', 'עוד לא מצליחה', 'עוד לא מצליחים']],
    ];
    for (const [key, expected] of cases) {
      expect(GENDERS.map((gender) => t(key, { gender }))).toEqual(expected);
    }
    expect(GENDERS.map((gender) => t('quizV3.skill.title', { gender, skill: 'פלאנץ׳' }))).toEqual([
      'איפה אתה בפלאנץ׳?', 'איפה את בפלאנץ׳?', 'איפה אתם בפלאנץ׳?',
    ]);
  });

  it('slider lines (board Slider)', () => {
    expect(t('quizV3.slider.subtitle', { group: 'push' })).toBe('דחיפה · חזה, כתפיים ויד אחורית');
    expect(t('quizV3.slider.levelWithMax', { level: 6, max: 'מקסימום: 12 חזרות' })).toBe('רמה 6 · מקסימום: 12 חזרות');
    expect(t('quizV3.slider.levelLine', { level: 6 })).toBe('רמה 6');
    expect(t('quizV3.skill.cta')).toBe('מתחילים מכאן');
    expect(t('quizV3.progress.item', { name: 'דחיפה', state: 'done' })).toBe('דחיפה: הושלם');
  });
});
