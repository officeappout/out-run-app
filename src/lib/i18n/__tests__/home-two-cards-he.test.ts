/**
 * Namespace `home` — enable_home_two_cards_v1 keys (canvas WR-1b aerobic card + WR-6 "מוכן לנסות לרוץ?"):
 * the Hebrew the catalog renders, key count, and that the other locales fall back to it.
 */
import { describe, expect, it } from 'vitest';
import he from '@/messages/he/home.json';
import { home } from '@/messages/ns/home';
import { makeT } from '../t';

const t = makeT('he', home);
const KEYS = Object.keys(he).filter((k) => k.startsWith('tryRun.') || k.startsWith('programStart.aerobic.'));

describe('home (he) — two start cards + try-running nudge', () => {
  it('has exactly the 9 keys the components use', () => {
    expect([...KEYS].sort()).toEqual([
      'programStart.aerobic.title', 'programStart.aerobic.valueLine',
      'tryRun.body', 'tryRun.cta', 'tryRun.dismiss', 'tryRun.kicker', 'tryRun.stat.walks', 'tryRun.stat.weeks', 'tryRun.title',
    ]);
  });
  it('renders the canvas copy', () => {
    expect(t('programStart.aerobic.title')).toBe('הליכה וריצה');
    expect(t('programStart.aerobic.valueLine')).toBe('מהליכה מהירה ועד 10 ק״מ, נתאים לך מסלול');
    expect(t('tryRun.title')).toBe('מוכן לנסות ריצה קלה?');
    expect(t('tryRun.kicker', { weeks: '4' })).toBe('4 שבועות של הליכה, כל הכבוד');
    expect(t('tryRun.cta')).toBe('בוא ננסה · שבוע ראשון');
    expect(t('tryRun.dismiss')).toBe('לא עכשיו, ממשיך ללכת');
  });
  it('the other locales do not need the keys yet (they fall back to Hebrew)', () => {
    for (const k of KEYS) expect(typeof he[k as keyof typeof he]).toBe('string');
  });
});
