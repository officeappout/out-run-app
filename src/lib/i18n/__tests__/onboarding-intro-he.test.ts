/**
 * Namespace `onboarding`, keys `intro.*` / `landing.*` (batch ak): every Hebrew key returns exactly what
 * the code held before the extraction. The `old` side is the original literals of
 * src/features/user/onboarding/intro/intro-copy.ts and src/app/page.tsx (origin/main @ 5807c589).
 */
import { describe, expect, it } from 'vitest';
import he from '@/messages/he/onboarding.json';
import { onboarding } from '@/messages/ns/onboarding';
import { makeT } from '../t';
import {
  abilityCopy, abilityExperienceHe, resolveRunningGoalVisual, runningGoalSubtitle,
} from '@/features/user/onboarding/constants/running-goal-visuals';
import { barrierLabels, barrierStories, bridgeCopy, introUi, landingCopy } from '@/features/user/onboarding/intro/intro-copy';

type Key = keyof typeof he;
const t = makeT('he', onboarding);
const keysWith = (prefix: string) => (Object.keys(he) as Key[]).filter((k) => k.startsWith(prefix));

describe('intro copy', () => {
  it('landing', () => {
    expect(landingCopy(t)).toEqual({
      titlePre: 'ברוכים הבאים ל-',
      sub: 'יחד הופכים את כל העיר לחדר כושר.',
      cityAlt: 'איור של העיר: מגדלים, שדרה, שביל אופניים, עגלות, רצים וגינת כושר',
      cta: 'הרשמה מהירה',
      login: 'התחברות',
    });
  });
  it('bridge', () => {
    expect(bridgeCopy(t)).toEqual({
      eyebrow: 'למה קשה להתמיד?',
      titleLines: ['זו לא אשמתכם', 'שקשה להתמיד.'],
      lead: 'יש לזה חמש סיבות עיקריות.',
      closingLines: ['וכל אחד מהם אפשר להסיר.', 'בואו נראה איך OUT עושה את זה.'],
      cta: 'בואו נראה',
    });
  });
  it('UI words; "i of total" with a count that never gets a separator', () => {
    const ui = introUi(t);
    expect([ui.next, ui.skip, ui.pushApp, ui.pushNow]).toEqual(['הבא', 'דלג', 'OUT', 'עכשיו']);
    const old = (i: number, total: number) => `${i} מתוך ${total}`;
    for (const [i, n] of [[1, 5], [5, 5], [1234, 5678]] as const) expect(ui.of(i, n)).toBe(old(i, n));
  });
  it('stories: labels and spot-checks (the full tree is pinned by the parity snapshot)', () => {
    expect(barrierLabels(t)).toEqual(['זמן', 'קהילה', 'נגישות', 'כסף', 'ידע']);
    const s = barrierStories(t);
    expect(s[0].thought).toBe('„אין לי זמן להתאמן. אני בעבודה כל היום.”');
    expect(s[0].titleLines).toEqual(['אין זמן?', 'בדרך לעבודה']);
    expect(s[3].person).toBe('עומר, 22 · סטודנט');
    expect(s[4].titleLines[1]).toBe('שגם ההורים שלך יסתדרו');
  });
  it('every intro key is read by the builders', () => {
    const used = new Set<string>();
    const spy = ((key: string) => { used.add(key); return key; }) as Parameters<typeof landingCopy>[0];
    landingCopy(spy); bridgeCopy(spy); introUi(spy).of(1, 5); barrierStories(spy);
    expect(Array.from(used).sort()).toEqual(keysWith('intro.').sort());
  });
});

describe('root page (landing.*)', () => {
  it('plain strings', () => {
    const cases: Array<[Key, string]> = [
      ['landing.tagline.1', 'עכשיו אפשר להתאמן בכל מקום, מתי שנוח לכם'],
      ['landing.tagline.2', 'מסלולי הליכה בפארק ותוכניות אימונים'],
      ['landing.tagline.3', 'מתאים אימונים לכל אחת ואחד'],
      ['landing.cta.quickSignup', 'הרשמה מהירה'],
      ['landing.cta.login', 'התחברות'],
      ['landing.login.title', 'התחברות'],
      ['landing.login.subtitle', 'היכנס עם החשבון שלך כדי להמשיך'],
      ['landing.login.loading', 'מתחבר...'],
      ['landing.login.google', 'המשך עם Google'],
      ['landing.login.apple', 'המשך עם Apple'],
      ['landing.toast.connectFailed', 'החיבור לא הצליח. נסו שוב.'],
      ['landing.toast.google', 'החיבור ל-Google לא הצליח. נסו שוב.'],
      ['landing.toast.apple', 'החיבור ל-Apple לא הצליח. נסו שוב.'],
    ];
    for (const [key, old] of cases) expect(t(key)).toBe(old);
    expect(cases.map(([k]) => k).sort()).toEqual(keysWith('landing.').sort());
  });
});

describe('running goal visuals (runningGoals.*)', () => {
  /** The old gender helper: isFemale ? f : m. */
  const g = (isFemale: boolean, m: string, f: string) => (isFemale ? f : m);
  it('photo descriptions', () => {
    expect(resolveRunningGoalVisual({ id: 'x', metadata: { goalPath: 'improve_time' } }, t).alt).toBe('רצים בקו הזינוק של מרוץ');
    expect(resolveRunningGoalVisual({ id: 'x', metadata: { goalPath: 'maintain_fitness' } }, t).alt).toBe('רצה בשביל בפארק');
    expect(resolveRunningGoalVisual({ id: 'x', metadata: { goalPath: 'start_running' } }, t).alt).toBe('');
    expect(resolveRunningGoalVisual({ id: 'zzz' }, t).alt).toBe('');
  });
  it('goal subtitles, both genders (the profile gender must not leak in)', () => {
    for (const f of [false, true]) {
      expect(runningGoalSubtitle('start_running', f, t)).toBe('מאפס או אחרי הפסקה ארוכה — שילוב הליכה וריצה');
      expect(runningGoalSubtitle('improve_time', f, t)).toBe('3, 5 או 10 ק״מ מהר יותר — עם אינטרוולים וטמפו');
      expect(runningGoalSubtitle('maintain_fitness', f, t)).toBe(g(f, 'כבר רץ ורוצה להישאר עקבי ובריא', 'כבר רצה ורוצה להישאר עקבית ובריאה'));
      expect(runningGoalSubtitle(null, f, t)).toBeNull();
    }
  });
  it('ability copy and experience hints, both genders', () => {
    for (const f of [false, true]) {
      expect(abilityCopy('none', f, t)).toEqual({ title: 'הצעד הראשון', sub: g(f, 'עוד לא רץ בכלל — נתחיל בהליכה', 'עוד לא רצה בכלל — נתחיל בהליכה') });
      expect(abilityCopy('5_15', f, t)).toEqual({ title: null, sub: 'ריצה קצרה, עם הפסקות' });
      expect(abilityCopy('15_30', f, t)).toEqual({ title: null, sub: 'ריצה רציפה נוחה' });
      expect(abilityCopy('30_45', f, t)).toEqual({ title: null, sub: g(f, 'מוכן לבנות מרחק', 'מוכנה לבנות מרחק') });
      expect(abilityCopy('45_plus', f, t)).toEqual({ title: null, sub: 'בסיס סיבולת יציב' });
      expect(abilityExperienceHe('none', f, t)).toBeNull();
      expect(abilityExperienceHe('5_15', f, t)).toBe(g(f, 'מתחיל לרוץ או חוזר אחרי הפסקה ארוכה?', 'מתחילה לרוץ או חוזרת אחרי הפסקה ארוכה?'));
      expect(abilityExperienceHe('15_30', f, t)).toBe(g(f, 'רץ כבר כמה חודשים? כנראה כאן', 'רצה כבר כמה חודשים? כנראה כאן'));
      expect(abilityExperienceHe('30_45', f, t)).toBe(g(f, 'רץ בקביעות כבר שנה+? כנראה כאן', 'רצה בקביעות כבר שנה+? כנראה כאן'));
      expect(abilityExperienceHe('45_plus', f, t)).toBe(g(f, 'רץ כמה שנים, 10 ק״מ זה לא חדש לך', 'רצה כמה שנים, 10 ק״מ זה לא חדש לך'));
    }
  });
  it('the profile gender does not override the explicit one', () => {
    const tf = makeT('he', onboarding, { gender: 'female' });
    expect(runningGoalSubtitle('maintain_fitness', false, tf)).toBe('כבר רץ ורוצה להישאר עקבי ובריא');
  });
  it('every key is read by the functions', () => {
    const used = new Set<string>();
    const spy = ((key: string) => { used.add(key); return key; }) as Parameters<typeof abilityCopy>[2];
    for (const p of ['improve_time', 'maintain_fitness'] as const) resolveRunningGoalVisual({ id: 'x', metadata: { goalPath: p } }, spy);
    for (const p of ['start_running', 'improve_time', 'maintain_fitness'] as const) runningGoalSubtitle(p, true, spy);
    for (const tier of ['none', '5_15', '15_30', '30_45', '45_plus'] as const) { abilityCopy(tier, true, spy); abilityExperienceHe(tier, true, spy); }
    expect(Array.from(used).sort()).toEqual(keysWith('runningGoals.').sort());
  });
});
