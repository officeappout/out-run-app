/**
 * Strength questionnaire v3 intro (namespace `onboarding`, keys quizV3.welcome.* / quizV3.main.*): the
 * Hebrew of the owner-approved boards Bodyweight + Main (26.10.2026), per gender (neutral for unknown).
 */
import { describe, expect, it } from 'vitest';
import he from '@/messages/he/onboarding.json';
import { onboarding } from '@/messages/ns/onboarding';
import { makeT } from '../t';

const t = makeT('he', onboarding);
const count = (prefix: string) => Object.keys(he).filter((k) => k.startsWith(prefix)).length;

describe('onboarding (he): strength quiz v3 intro', () => {
  it('plain strings', () => {
    const cases: Array<[keyof typeof he, string]> = [
      ['quizV3.welcome.lemurAlt', 'הלמור'],
      ['quizV3.welcome.title', 'מה זה קליסטניקס?'],
      ['quizV3.welcome.body', 'בחדר כושר מוסיפים משקל. אצלנו משנים את התרגיל: זווית, מנוף, יד אחת במקום שתיים. לשריר זה אותו עומס, והגוף לא יודע להבדיל.'],
      ['quizV3.welcome.ladder.label', 'שלושה תרגילי דחיפה, מהקל לקשה'],
      ['quizV3.welcome.ladder.incline45', 'שכיבות סמיכה ב-45°'],
      ['quizV3.welcome.ladder.pushUps', 'שכיבות סמיכה'],
      ['quizV3.welcome.ladder.decline', 'שכיבות סמיכה שיפוע שלילי'],
      ['quizV3.welcome.ladder.homeAndPark', 'לכל תרגיל יש גרסה לבית ולגינה'],
      ['quizV3.welcome.ladder.easy', 'קל'],
      ['quizV3.welcome.ladder.hard', 'קשה'],
      ['quizV3.welcome.cta', 'יאללה, למבדק הקצר'],
      ['quizV3.main.title', 'מבדק רמה קצר, בלי להזיע'],
      ['quizV3.main.cta', 'יאללה, מתחילים'],
    ];
    for (const [key, text] of cases) expect(t(key), key).toBe(text);
    expect(count('quizV3.welcome.') + count('quizV3.main.')).toBe(cases.length + 8);
  });

  it('values and rich text', () => {
    for (const level of [2, 5, 10]) {
      expect(t('quizV3.welcome.ladder.chip', { level: String(level) })).toBe(`דחיפה · רמה ${level}`);
    }
    const b = (c: unknown) => `[${String(c)}]`;
    expect(t.rich('quizV3.welcome.skills', { b }).join('')).toBe(
      '[מיומנויות מיוחדות (סקילים)] כמו פלאנץ׳ ועמידת ידיים הן השלב המתקדם של קליסטניקס.',
    );
    expect(t.rich('quizV3.main.step3', { b }).join('')).toBe(
      '[זה בסדר שיש פערים] בין קבוצות שרירים. בדיוק בגלל זה בודקים כל אחת בנפרד.',
    );
  });

  it('gendered: male / female / neutral for unknown', () => {
    const b = (c: unknown) => `[${String(c)}]`;
    const g = (key: Parameters<typeof t>[0], gender: string) => t.rich(key, { gender, b }).join('');
    expect(g('quizV3.welcome.bubble', 'male')).toMatch(/^ברוך הבא ל-OUT!/);
    expect(g('quizV3.welcome.bubble', 'female')).toMatch(/^ברוכה הבאה ל-OUT!/);
    expect(g('quizV3.welcome.bubble', 'other')).toMatch(/^ברוכים הבאים ל-OUT!/);
    expect(g('quizV3.welcome.bubble', 'male')).toBe(
      'ברוך הבא ל-OUT! אנחנו מתאמנים בחוץ, בגינות ובפארקים, ובעיקר במשקל הגוף. קוראים לזה קליסטניקס.',
    );
    expect(g('quizV3.main.step1', 'male')).toBe('[לכל קבוצת שרירים] תראה כמה תרגילים, מהקל לקשה.');
    expect(g('quizV3.main.step1', 'female')).toBe('[לכל קבוצת שרירים] תראי כמה תרגילים, מהקל לקשה.');
    expect(g('quizV3.main.step1', 'other')).toBe('[לכל קבוצת שרירים] תראו כמה תרגילים, מהקל לקשה.');
    expect(g('quizV3.main.step2', 'male')).toBe('[גלול לצדדים] עד התרגיל הכי קשה שאתה בטוח שתצליח.');
    expect(g('quizV3.main.step2', 'female')).toBe('[גללי לצדדים] עד התרגיל הכי קשה שאת בטוחה שתצליחי.');
    expect(g('quizV3.main.step2', 'other')).toBe('[גללו לצדדים] עד התרגיל הכי קשה שאתם בטוחים שתצליחו.');
    expect(g('quizV3.main.reassure', 'male')).toBe('לא מכיר תרגיל? לא בטוח? בחר בערך. המערכת תדייק לפי האימונים הראשונים שלך.');
    expect(g('quizV3.main.reassure', 'female')).toBe('לא מכירה תרגיל? לא בטוחה? בחרי בערך. המערכת תדייק לפי האימונים הראשונים שלך.');
    expect(g('quizV3.main.reassure', 'other')).toBe('לא מכירים תרגיל? לא בטוחים? בחרו בערך. המערכת תדייק לפי האימונים הראשונים.');
    expect(g('quizV3.main.videoLink', 'male')).toBe('לא הבנת מה צריך לעשות? סרטון הסבר קצר');
    expect(g('quizV3.main.videoLink', 'other')).toBe('לא הבנתם מה צריך לעשות? סרטון הסבר קצר');
  });
});
