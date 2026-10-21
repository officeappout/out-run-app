/**
 * Namespace `onboarding` (i18n wave 2): every Hebrew key returns exactly what the code rendered
 * before the extraction. The `old` side of each case is the original literal / template /
 * ternary, copied verbatim from the component (origin/main @ fea3d25b).
 *
 * quiz.* = the strength quiz (src/features/user/onboarding/components/visual-assessment). Its
 * markup parity snapshots cover the keys in context; this test also pins every select / gender
 * branch, every category / area name, counts and reps ≥ 1000, and the BlurredWhyStep matrix
 * against a verbatim copy of the old lookup (fixtures/onboarding-why-matrix.old.ts).
 */
import { describe, expect, it } from 'vitest';
import he from '@/messages/he/onboarding.json';
import { onboarding } from '@/messages/ns/onboarding';
import { makeT } from '../t';
import { getOnboardingIntroText } from '@/features/user/onboarding/components/visual-assessment/BlurredWhyStep';
import { coachCopy } from '@/features/user/onboarding/components/visual-assessment/strip-hint';
import { getOnboardingIntroTextOld } from './fixtures/onboarding-why-matrix.old';

type Key = keyof typeof he;
const t = makeT('he', onboarding);
// `other` (unknown gender) is neutral since gender batch 3 — pinned in onboarding-gender-batch3.test.ts.
const GENDERS = [
  ['female', true],
  ['male', false],
] as const;

/**
 * Owner copy fixes (21.10.2026) on top of the verbatim old lookup: "פרונט לבר" is spelled "פרונט ליבר"
 * like the rest of the app. Male / female only — an unknown gender gets the neutral (plural) copy
 * since gender batch 3 (onboarding-gender-batch3.test.ts).
 */
function expectedIntro(...args: Parameters<typeof getOnboardingIntroTextOld>) {
  const [gender, ...rest] = args;
  const old = getOnboardingIntroTextOld(gender === 'female' ? 'female' : 'male', ...rest);
  return JSON.parse(JSON.stringify(old).replaceAll('פרונט לבר', 'פרונט ליבר'));
}

describe('onboarding · quiz (he) — byte-identical to the pre-extraction literals', () => {
  it('plain strings', () => {
    const cases: Array<[Key, string]> = [
      ['quiz.tier.title', 'מה הרמה שלך?'],
      ['quiz.tier.levelBadge', 'רמה'],
      ['quiz.slider.back', 'חזרה'],
      // escapeAria is gendered since the owner copy fix (21.10.2026) — pinned in the select test below.
      ['quiz.slider.easierAria', 'תרגיל קל יותר'],
      ['quiz.slider.easier', 'קל יותר'],
      ['quiz.slider.myLevel', 'הרמה שלי'],
      ['quiz.slider.harderAria', 'תרגיל קשה יותר'],
      ['quiz.slider.harder', 'קשה יותר'],
      ['quiz.slider.cta.myLevel', 'זו הרמה שלי'],
      ['quiz.slider.cta.next', 'הבא'],
      ['quiz.slider.cta.finish', 'סיום הערכה'],
      ['quiz.hint.easy', 'קל'],
      ['quiz.hint.hard', 'קשה'],
      ['quiz.hint.intro.sub', 'הסרטון מתחלף לתרגיל שבחרת'],
      ['quiz.why.back', 'חזרה'],
    ];
    for (const [key, old] of cases) expect(t(key)).toBe(old);
  });

  it('gendered (isFemale ? female : male) — female and male keep the old copy', () => {
    const cases: Array<[Key, string, string]> = [
      ['quiz.tier.subtitle', 'בחר נקודת התחלה — נעדן את זה ביחד בשלב הבא', 'בחרי נקודת התחלה — נעדן את זה ביחד בשלב הבא'],
      ['quiz.tier.footer', 'אל דאגה — תוכל לכוונן כל קטגוריה בנפרד בשלב הבא', 'אל דאגה — תוכלי לכוונן כל קטגוריה בנפרד בשלב הבא'],
      ['quiz.slider.tutorial.drag', 'גרור כדי לשנות את הקושי והתרגיל', 'גררי כדי לשנות את הקושי והתרגיל'],
      ['quiz.slider.tutorial.checkMin', 'בדוק את המינימום: הזמן והחזרות יופיעו כאן', 'בדקי את המינימום: הזמן והחזרות יופיעו כאן'],
      [
        'quiz.slider.tutorial.notSure',
        'לא בטוח ב-100%? לא מצליח? תבחר בערך, המערכת תלמד אותך ותתקן בהמשך',
        'לא בטוחה ב-100%? לא מצליחה? תבחרי בערך, המערכת תלמד אותך ותתקן בהמשך',
      ],
      ['quiz.slider.escape', 'עוד לא מצליח?', 'עוד לא מצליחה?'],
      ['quiz.slider.instruction', 'עצור על התרגיל הכי קשה שאתה בטוח שתבצע', 'עצרי על התרגיל הכי קשה שאת בטוחה שתבצעי'],
      ['quiz.slider.notSure', 'לא בטוח? בחר בערך — נדייק תוך כמה אימונים', 'לא בטוחה? בחרי בערך — נדייק תוך כמה אימונים'],
      ['quiz.hint.intro.title', 'גרור את התמונות לצדדים', 'גררי את התמונות לצדדים'],
      ['quiz.hint.after.title', 'יפה. עכשיו עצור על הכי קשה שאתה בטוח שתבצע', 'יפה. עכשיו עצרי על הכי קשה שאת בטוחה שתבצעי'],
      ['quiz.hint.after.sub', 'ולחץ למטה', 'ולחצי למטה'],
      ['quiz.why.title', 'בוא נכיר קצת יותר.', 'בואי נכיר קצת יותר.'],
    ];
    for (const [key, male, female] of cases)
      for (const [gender, isFemale] of GENDERS) expect(t(key, { gender })).toBe(isFemale ? female : male);
  });

  it('tier cards (old TIER_V2 [male, female] pairs, picked by isFemale)', () => {
    const TIER_V2 = {
      beginner: {
        label: ['מתחילים', 'מתחילות'],
        description: ['חדש באימונים או חוזר אחרי הפסקה ארוכה', 'חדשה באימונים או חוזרת אחרי הפסקה ארוכה'],
        experience: ['מתאמן פחות מחצי שנה? כנראה מתחיל', 'מתאמנת פחות מחצי שנה? כנראה מתחילה'],
      },
      intermediate: {
        label: ['בינוניים', 'בינוניות'],
        description: ['מתאמן באופן קבוע ומכיר את הבסיס', 'מתאמנת באופן קבוע ומכירה את הבסיס'],
        experience: ['מתאמן כבר שנה+ / חוזר אחרי הפסקה קצרה? כנראה בינוני', 'מתאמנת כבר שנה+ / חוזרת אחרי הפסקה קצרה? כנראה בינונית'],
      },
      advanced: {
        label: ['מתקדמים', 'מתקדמות'],
        description: ['ניסיון רב, מחפש אתגר אמיתי', 'ניסיון רב, מחפשת אתגר אמיתי'],
        experience: ['מתאמן כבר כמה שנים ברצף? כנראה מתקדם', 'מתאמנת כבר כמה שנים ברצף? כנראה מתקדמת'],
      },
    } as const;
    for (const id of ['beginner', 'intermediate', 'advanced'] as const)
      for (const field of ['label', 'description', 'experience'] as const)
        for (const [gender, isFemale] of GENDERS)
          expect(t(`quiz.tier.${id}.${field}`, { gender })).toBe(TIER_V2[id][field][isFemale ? 1 : 0]);
  });

  it('max reps / seconds (old `מקסימום: ${targetReps} ${unitWord}`), reps ≥ 1000 unformatted', () => {
    for (const targetReps of ['8', '30', '1234', '10-12'])
      for (const unitType of ['reps', 'seconds'] as const) {
        const unitWord = unitType === 'seconds' ? 'שנ׳' : 'חזרות';
        expect(t('quiz.slider.maxReps', { reps: targetReps, unit: unitType })).toBe(`מקסימום: ${targetReps} ${unitWord}`);
      }
  });

  it('category name (old CATEGORY_META[c] ?? CATEGORY_META[c.toLowerCase()] ?? c)', () => {
    const CATEGORY_META: Record<string, { he: string }> = {
      push: { he: 'דחיפה' },
      pull: { he: 'משיכה' },
      legs: { he: 'פלג גוף תחתון' },
      core: { he: 'ליבה' },
      handstand: { he: 'עמידת ידיים' },
      skills: { he: 'מיומנויות' },
      oap: { he: 'מתח יד אחת' },
      pull_up_pro: { he: 'מתח יד אחת' },
      one_arm_pullup: { he: 'מתח יד אחת' },
      muscle_up: { he: 'עליית כוח' },
      muscleup: { he: 'עליית כוח' },
      planche: { he: 'פלאנץ׳' },
      front_lever: { he: 'פרונט ליבר' },
      handstand_pushup: { he: 'שכיבות סמיכה בעמידת ידיים' },
      hspu: { he: 'שכיבות סמיכה בעמידת ידיים' },
    };
    const old = (category: string) => (CATEGORY_META[category] ?? CATEGORY_META[category.toLowerCase()] ?? { he: category }).he;
    for (const category of [...Object.keys(CATEGORY_META), 'Push', 'FRONT_LEVER', 'mystery_move', 'Mystery Move'])
      expect(t('quiz.slider.category', { category: category.toLowerCase(), name: category })).toBe(old(category));
  });

  it('strip tile aria (old `רמה ${level}`)', () => {
    for (const level of [1, 20, 1234]) expect(t('quiz.strip.levelAria', { level: String(level) })).toBe(`רמה ${level}`);
  });

  it('coach pill keys', () => {
    expect(coachCopy('intro')).toEqual({ title: 'quiz.hint.intro.title', sub: 'quiz.hint.intro.sub' });
    expect(coachCopy('after')).toEqual({ title: 'quiz.hint.after.title', sub: 'quiz.hint.after.sub' });
  });

  it('BlurredWhyStep intro: every age group × goal × gender × area × count equals the old matrix lookup', () => {
    const ages = ['14-18', '18-21', '21-26', '26-50', '50+', '99', ''];
    const goals = ['health', 'muscle', 'body_focus', 'skills', null, 'running'];
    // male / female keep the old matrix; unknown gender is neutral (onboarding-gender-batch3.test.ts).
    const genders = ['male', 'female'] as Array<'male' | 'female'>;
    const areas = [
      'push', 'pull', 'legs', 'core', 'handstand', 'skills', 'muscle_up', 'muscleup', 'planche', 'front_lever',
      'back_lever', 'handstand_pushup', 'hspu', 'one_arm_pullup', 'oap', 'pull_up_pro', 'pull_up', 'push_up',
      'l_sit', 'human_flag', 'chest', 'back', 'shoulders', 'biceps', 'triceps', 'full_body', 'abs', 'glutes',
      'arms', ' Planche ', 'nonsense', '', null,
    ];
    let checked = 0;
    for (const age of ages)
      for (const goal of goals)
        for (const gender of genders)
          for (const area of areas)
            for (const count of [1, 2, 7]) {
              expect(getOnboardingIntroText(t, gender, age, goal, area, count)).toEqual(
                expectedIntro(gender, age, goal, area, count),
              );
              checked++;
            }
    expect(checked).toBe(7 * 6 * 2 * 33 * 3);
  });
});

describe('owner copy fixes (21.10.2026)', () => {
  it('escape aria label follows the gender', () => {
    expect(t('quiz.slider.escapeAria', { gender: 'female' })).toBe('עדיין לא מצליחה את התרגיל?');
    expect(t('quiz.slider.escapeAria', { gender: 'male' })).toBe('עדיין לא מצליח את התרגיל?');
    expect(t('quiz.slider.escapeAria', { gender: 'other' })).toBe('עדיין לא מצליחים את התרגיל?');
  });
});
