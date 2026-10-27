/**
 * Namespace `schedule`, keys `tutorial.*` / `dayCards.*` (schedule tutorial v1, boards ל1 to ל5 +
 * WeekPlan). New copy, so the reference is the approved board text (male = the board's wording),
 * plus every gender / plural / select branch.
 */
import { describe, expect, it } from 'vitest';
import { schedule } from '@/messages/ns/schedule';
import { makeT } from '../t';

const t = makeT('he', schedule);
const tg = (gender: 'male' | 'female' | 'other') => makeT('he', schedule, { gender });

describe('schedule tutorial copy', () => {
  it('board text, verbatim', () => {
    expect(t('tutorial.home.title')).toBe('עכשיו הלו״ז שלך');
    expect(tg('male')('tutorial.home.text')).toBe('ספר לי מתי נוח לך להתאמן, ואבנה לך שבוע שמתאים לחיים שלך.');
    expect(t('tutorial.home.cta')).toBe('למילוי הלו״ז');
    expect(t('tutorial.progress', { step: 1, total: 3 })).toBe('הלו״ז שלי · 1 מתוך 3');
    expect(t('tutorial.days.title')).toBe('באילו ימים?');
    expect(tg('male')('tutorial.days.tapHint')).toBe('הקש על יום כדי לסמן שאתה פנוי');
    expect(t('tutorial.days.durationTitle')).toBe('כמה זמן לאימון?');
    expect(t('tutorial.days.twoPerDay')).toBe('שני אימונים באותו יום, בסדר');
    expect(t('tutorial.days.longRunLast', { day: 'ה׳' })).toBe('ה׳ · היום הפנוי האחרון');
    expect(t('tutorial.week.title')).toBe('השבוע שלך מוכן!');
    expect(t('tutorial.week.confirm')).toBe('אישור השבוע');
    expect(t('tutorial.flames.title')).toBe('כל יום פעיל מדליק להבה');
    expect(t('tutorial.flames.cta')).toBe('יאללה, להדליק את הראשונה');
  });

  it('gender branches: unknown is neutral', () => {
    expect(tg('female')('tutorial.home.skip')).toBe('דלגי');
    expect(tg('male')('tutorial.home.skip')).toBe('דלג');
    expect(tg('other')('tutorial.home.skip')).toBe('דילוג');
    expect(tg('other')('tutorial.home.text')).toBe('ספרו לי מתי נוח לכם להתאמן, ואבנה לכם שבוע שמתאים לחיים שלכם.');
    expect(tg('female')('tutorial.days.tapHint')).toBe('הקישי על יום כדי לסמן שאת פנויה');
  });

  it('smart notes and summaries (plural / select)', () => {
    const rich = (key: 'tutorial.days.note.simple' | 'tutorial.days.note.complex', v: Record<string, unknown>) =>
      tg('male').rich<string>(key, { ...v, b: (c: unknown) => `[${String(c)}]` } as never).join('');
    expect(rich('tutorial.days.note.simple', { days: 5, strength: 3, movement: 2 })).toBe(
      'סימנת 5 ימים, יופי. בתחילת הדרך נשלב [3 ימי כוח ו-2 ימי תנועה] (הליכה, מוביליטי או בטן). תראה את זה בשבוע שנבנה לך.',
    );
    expect(rich('tutorial.days.note.simple', { days: 1, strength: 1, movement: 0 })).toBe(
      'סימנת יום אחד, יופי. נשלב [יום כוח אחד]. תראה את זה בשבוע שנבנה לך.',
    );
    expect(rich('tutorial.days.note.complex', { days: 5, programs: 'פלאנץ׳, פרונט לבר, רגליים ו-3 ריצות', runs: 'yes' })).toBe(
      'סימנת 5 ימים. יש לך [פלאנץ׳, פרונט לבר, רגליים ו-3 ריצות]: כל תוכנית ביום אחר, דחיפה ומשיכה לא צמודות, ואת הכפול נשים ביום הריצה הקשה.',
    );
    expect(rich('tutorial.days.note.complex', { days: 3, programs: 'פלאנץ׳', runs: 'no' })).toBe(
      'סימנת 3 ימים. יש לך [פלאנץ׳]: כל תוכנית ביום אחר, דחיפה ומשיכה לא צמודות.',
    );
    expect(t('tutorial.week.summary.simple', { strength: 3, movement: 2 })).toBe(
      '3 אימוני כוח, 2 ימי תנועה ויעד צעדים בכל יום. ככה סוגרים את יעד הפעילות השבועי.',
    );
    expect(t('tutorial.week.summary.simple', { strength: 1, movement: 0 })).toBe(
      'אימון כוח אחד ויעד צעדים בכל יום. ככה סוגרים את יעד הפעילות השבועי.',
    );
    expect(t('tutorial.days.runs', { n: 3 })).toBe('3 ריצות');
    expect(t('tutorial.days.runs', { n: 1 })).toBe('ריצה אחת');
  });

  it('day cards', () => {
    expect(t('dayCards.strength.fullBody', { focus: t('dayCards.group.push') })).toBe('כל הגוף · דחיפה');
    expect(t('dayCards.strength.skill', { family: t('dayCards.group.pull'), skill: t('dayCards.skillShort.FRONT_LEVER') })).toBe('משיכה · דגש פרונט');
    expect(t('dayCards.strength.subtitle', { min: '45 דק׳', note: 'skill' })).toBe('45 דק׳ · רוב האימון סקיל');
    expect(t('dayCards.strength.subtitle', { min: '30 דק׳', note: 'afterRun' })).toBe('30 דק׳ · אחרי הריצה');
    expect(t('dayCards.strength.subtitle', { min: '30 דק׳', note: 'none' })).toBe('30 דק׳');
    expect(t('dayCards.run.title', { slot: 'quality_primary' })).toBe('ריצת איכות');
    expect(t('dayCards.run.title', { slot: 'long_run' })).toBe('ריצה ארוכה');
    expect(t('dayCards.run.subtitle', { slot: 'quality_primary', min: '40 דק׳' })).toBe('אינטרוולים · 40 דק׳');
    expect(t('dayCards.run.subtitle', { slot: 'long_run', min: '55 דק׳' })).toBe('55 דק׳');
    expect(t('dayCards.optional.title', { kind: 'core_tabata', n: 8 })).toBe('בטן טבטה 8′');
    expect(t('dayCards.optional.title', { kind: 'mobility', n: 10 })).toBe('מוביליטי 10′');
    expect(t('dayCards.optional.role', { role: 'recovery' })).toBe('התאוששות');
    expect(t('dayCards.optional.role', { role: 'optional' })).toBe('רשות');
    expect(t('dayCards.steps.soFar', { n: '2,400' })).toBe('2,400 עד עכשיו');
  });
});
