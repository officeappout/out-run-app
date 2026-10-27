/** i18n batch av: values the parity snapshots do not reach (service errors, progression labels, ICU branches). */
import { describe, expect, it } from 'vitest';
import { onboarding } from '@/messages/ns/onboarding';
import { profile } from '@/messages/ns/profile';
import { makeT } from '../t';

const o = makeT('he', onboarding);
const p = makeT('he', profile);

describe('batch av — onboarding', () => {
  it('unit declaration errors (old literals)', () => {
    expect(o('unitDeclaration.error.notSignedIn')).toBe('משתמש לא מחובר. רעננו את הדף ונסו שוב.');
    expect(o('unitDeclaration.error.network')).toBe('בעיית תקשורת. בדקו את החיבור לאינטרנט ונסו שוב.');
    expect(o('unitDeclaration.error.generic')).toBe('שמירת ההצהרה נכשלה. נסו שוב.');
  });

  it('what-now route copy values', () => {
    expect(o('whatNowSvc.inPark.named', { name: 'גינת סוטין' })).toBe('בגינת סוטין');
    expect(o('whatNowSvc.route.stops.many', { n: String(1234) })).toBe('עם 1234 עצירות כוח');
    expect(o('whatNowSvc.route.title', { min: String(1234) })).toBe('מסלול בשכונה שלך · 1234 דק׳');
  });

  it('goal-note examples: every gender branch is explicit, unknown falls to the masculine form', () => {
    const g = (gender: string, m: string, f: string) => (gender === 'female' ? f : m);
    for (const gender of ['female', 'male', 'other'])
      expect(o('goalNote.example.under18.1', { gender })).toBe(g(gender, 'להיות חזק יותר בספורט שלי', 'להיות חזקה יותר בספורט שלי'));
  });

  it('run plan recovery list and reminder subtitle', () => {
    expect(o('runPlan.recovery.list.few', { head: '4, 7', last: '9' })).toBe('שבועות 4, 7 ו-9');
    expect(o('runPlan.recovery.list.many', { count: String(1234) })).toBe('1234 שבועות לאורך התוכנית');
    expect(o('reminderPlan.subtitle.runs', { count: 1, days: 'ב׳' })).toBe('ריצה אחת בשבוע · ב׳');
    expect(o('reminderPlan.subtitle.runs', { count: 3, days: 'א׳ ג׳ ה׳' })).toBe('3 ריצות בשבוע · א׳ ג׳ ה׳');
  });
});

describe('batch av — profile (progression)', () => {
  it('achievement labels', () => {
    expect(p('achievements.badges.more', { count: String(1234) })).toBe('+1234 הישגים נוספים');
    expect(p('achievements.sheet.progress', { unlocked: '3', total: String(1234) })).toBe('3 מתוך 1234 נפתחו');
    expect(p('achievements.sheet.unlockedXp', { xp: '100' })).toBe('נפתח! +100 XP');
    expect(p('achievements.sheet.reachedTier', { tier: 'כסף', xp: '150' })).toBe('השגת: כסף +150 XP');
    expect(p('identity.stage', { level: '3' })).toBe('שלב 3');
  });

  it('level stage names: female / male / other (other = the masculine title, as before)', () => {
    expect(p('levelStage.9', { gender: 'female' })).toBe('מלכת הפארק');
    expect(p('levelStage.9', { gender: 'male' })).toBe('מלך הפארק');
    expect(p('levelStage.9', { gender: 'other' })).toBe('מלך הפארק');
    expect(p('stageTitle.fallback', { stage: '11' })).toBe('שלב 11');
  });
});
