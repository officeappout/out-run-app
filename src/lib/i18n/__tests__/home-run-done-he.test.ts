/**
 * Namespace `home` — run-done state keys (23.10.2026): the Hebrew the catalog renders, ICU shape
 * (no baked text; nothing addresses the user by gender), and that the moved hard-coded Hebrew is unchanged.
 */
import { describe, expect, it } from 'vitest';
import he from '@/messages/he/home.json';
import { home } from '@/messages/ns/home';
import { makeT } from '../t';

const t = makeT('he', home);
const KEYS = Object.keys(he).filter((k) => /^(runCard\.(partial|covered|dayHint)|runSlot\.|runWeek\.|nextHeader\.|doneToday\.(sets|runPlan))/.test(k));

describe('home (he) — run-done state', () => {
  it('has exactly the keys the components use', () => {
    expect([...KEYS].sort()).toEqual([
      'doneToday.runPlan', 'doneToday.sets',
      'nextHeader.continue', 'nextHeader.rest.done', 'nextHeader.run.planned', 'nextHeader.run.week',
      'nextHeader.strength.planned', 'nextHeader.strength.topup', 'nextHeader.strength.week',
      'nextHeader.walk.planned', 'nextHeader.walk.steps',
      'runCard.covered.meta', 'runCard.dayHint.inDays', 'runCard.dayHint.next', 'runCard.dayHint.tomorrow',
      'runCard.partial.cta', 'runCard.partial.note',
      'runSlot.reason', 'runWeek.summary',
    ]);
  });
  it('renders the copy; no "missed" wording on the partial card', () => {
    expect(t('runCard.partial.note')).toBe('הריצה הקצרה של היום עוד לא נספרת בתוכנית. הריצה המלאה עדיין פתוחה.');
    expect(t('runCard.partial.cta')).toBe('לריצה המלאה');
    expect(t('runCard.covered.meta')).toBe('נספרה כריצת היום');
    expect(`${t('runCard.partial.note')}${t('runCard.partial.cta')}${t('runCard.covered.meta')}`).not.toMatch(/פספס|הוחמץ|דילג/);
  });
  it('the moved strings keep their Hebrew', () => {
    expect(t('runCard.dayHint.inDays', { n: 3 })).toBe('בעוד 3 ימים');
    expect(t('doneToday.sets', { n: 18 })).toBe('18 סטים');
    expect(t('runWeek.summary', { done: 1, total: 3 })).toBe('1 מתוך 3 בוצע');
    expect(t('runSlot.reason', { type: 'ריצה קלה' })).toBe('ריצה קלה בתוכנית שלך — נמצא לה מסלול מתאים');
    expect(t('doneToday.runPlan', { week: 2, total: 8, n: 1, target: 3 })).toBe('שבוע 2 מתוך 8 · ריצה 1 מתוך 3');
  });
  it('gender-neutral: the catalog has no gender select for these keys (nothing addresses the user)', () => {
    for (const k of KEYS) expect((he as Record<string, string>)[k]).not.toContain('gender');
  });
});
