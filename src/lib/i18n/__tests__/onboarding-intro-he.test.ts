/**
 * Namespace `onboarding`, keys `intro.*` / `landing.*` (batch ak): every Hebrew key returns exactly what
 * the code held before the extraction. The `old` side is the original literals of
 * src/features/user/onboarding/intro/intro-copy.ts and src/app/page.tsx (origin/main @ 5807c589).
 */
import { describe, expect, it } from 'vitest';
import he from '@/messages/he/onboarding.json';
import { onboarding } from '@/messages/ns/onboarding';
import { makeT } from '../t';
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
    expect([...used].sort()).toEqual(keysWith('intro.').sort());
  });
});
