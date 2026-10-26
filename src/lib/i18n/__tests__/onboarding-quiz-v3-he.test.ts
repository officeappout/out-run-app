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

// ── Part C: after the assessment (boards SkillUnlock / Done / Explain1..3) ──────────────

describe('onboarding · quizV3 after the assessment (he)', () => {
  const g = (key: Parameters<typeof t>[0], values: Record<string, unknown> = {}) =>
    GENDERS.map((gender) => t(key, { gender, ...values }));

  it('skills screen (board SkillUnlock) x gender', () => {
    expect(g('quizV3.skills.title')).toEqual([
      'וואו, זיהינו שאתה מוכן למיומנויות מיוחדות',
      'וואו, זיהינו שאת מוכנה למיומנויות מיוחדות',
      'וואו, זיהינו מוכנות למיומנויות מיוחדות',
    ]);
    expect(t('quizV3.skills.body', { gender: 'male', count: 2 })).toBe(
      'לפי הרמה שלך בדחיפה ובמשיכה, נפתחו לך סקילים. אם תוסיף, האימונים יכללו חלק קבוע לסקיל, לצד הבסיס.',
    );
    expect(t('quizV3.skills.body', { gender: 'female', count: 1 })).toBe(
      'לפי הרמה שלך בדחיפה ובמשיכה, נפתח לך סקיל. אם תוסיפי, האימונים יכללו חלק קבוע לסקיל, לצד הבסיס.',
    );
    expect(g('quizV3.skills.here')).toEqual(['אתה כאן', 'את כאן', 'השלב הנוכחי']);
    expect(t('quizV3.skills.estimate', { level: 5, source: 'push' })).toBe('רמה משוערת 5 · לפי הדחיפה שלך');
    expect(t('quizV3.skills.estimate', { level: 6, source: 'pull' })).toBe('רמה משוערת 6 · לפי המשיכה שלך');
    expect(t('quizV3.skills.name', { skill: 'planche' })).toBe('פלאנץ׳');
    expect(t('quizV3.skills.goalName', { skill: 'front_lever' })).toBe('פרונט לבר מלא');
    expect(t('quizV3.skills.refine')).toBe('לדייק את הרמה בשאלון קצר');
    expect(t('quizV3.skills.add')).toBe('להוסיף לתוכנית שלי');
    expect(t('quizV3.skills.later')).toBe('אולי אחר כך');
  });

  it('summary (board Done)', () => {
    expect(t('quizV3.done.title')).toBe('התוכנית שלך מוכנה');
    expect(t('quizV3.done.level', { level: 6 })).toBe('רמה 6');
    expect(t('quizV3.done.masterNote', { count: 4 })).toBe('ממוצע של 4 קבוצות השרירים');
    expect(t('quizV3.done.percent', { percent: 5 })).toBe('5%');
    expect(t('quizV3.done.cta')).toBe('מה זה אומר?');
    expect(t('quizV3.done.fact', { gender: 'male', group: 'push', percentile: 70 })).toBe('בדחיפה אתה ברמה גבוהה מ-70% מהגברים בגילך.');
    expect(t('quizV3.done.fact', { gender: 'female', group: 'pull', percentile: 40 })).toBe('במשיכה את ברמה גבוהה מ-40% מהנשים בגילך.');
  });

  it('explainers x gender (boards Explain1..3)', () => {
    expect(t('quizV3.explain1.bubble', { level: 6, group: 'push' })).toBe('רגע, אבל מה זה אומר "רמה 6 בדחיפה"?');
    expect(t('quizV3.explain1.body', { group: 'push' })).toBe('כל רמה היא קבוצת תרגילים באותו קושי. ככה נראית מפת הדחיפה שלך:');
    expect(g('quizV3.explain1.here', { level: 6 })).toEqual(['רמה 6 · אתה כאן', 'רמה 6 · את כאן', 'רמה 6 · השלב הנוכחי']);
    expect(g('quizV3.explain1.footer')).toEqual([
      'את המפה המלאה של כל קבוצה תמצא בטאב ההתקדמות.',
      'את המפה המלאה של כל קבוצה תמצאי בטאב ההתקדמות.',
      'את המפה המלאה של כל קבוצה אפשר למצוא בטאב ההתקדמות.',
    ]);
    expect(t('quizV3.explain2.title')).toBe('כל אימון ממלא את הטבעת');
    expect(g('quizV3.explain2.bullet1')[0]).toBe('כל אימון מוסיף אחוזים לפי מה שביצעת בפועל.');
    expect(t('quizV3.explain2.bullet2')).toBe('ב־100% עולים רמה ומקבלים תרגילים מתקדמים יותר.');
    expect(g('quizV3.explain2.bullet3')[0]).toBe('המערכת לומדת אותך, אז תמיד יש אתגר, לא קל מדי ולא קשה מדי.');
    expect(t('quizV3.explain3.title')).toBe('האימונים יתאימו ללו״ז שלך');
    expect(g('quizV3.explain3.body')[0]).toBe('בדף הבית ממלאים מתי נוח לך להתאמן, והמערכת משלבת את האימונים לפי הרמה וההתקדמות שלך.');
    expect(g('quizV3.explain3.lemur')).toEqual([
      'ואני אעקוב אחריך. כשתהיה מוכן, אציע לך מתי להוסיף תוכנית נוספת.',
      'ואני אעקוב אחרייך. כשתהיי מוכנה, אציע לך מתי להוסיף תוכנית נוספת.',
      'ואני אעקוב אחרי ההתקדמות. כשיגיע הזמן, אציע מתי להוסיף תוכנית נוספת.',
    ]);
    expect(t('quizV3.explain3.cta')).toBe('להצהרת הבריאות');
    expect(t('quizV3.explain3.ctaWeek')).toBe('ממשיכים לשבוע שלי');
    expect(t('quizV3.explain.skip')).toBe('דלג');
  });

  it('every gendered part C key has three distinct-or-neutral branches, none empty', () => {
    const keys = Object.keys(he).filter((k) => /^quizV3\.(skills|done|explain)/.test(k));
    for (const k of keys) {
      for (const gender of GENDERS) {
        expect(t(k as Parameters<typeof t>[0], { gender, group: 'push', skill: 'planche', source: 'push', level: 3, count: 2, percent: 5, percentile: 50, name: 'x', current: 1, total: 3 }), k).not.toBe('');
      }
    }
  });
});
