/**
 * Namespace `player`, keys `swapModal.*` — ExerciseReplacementModal's strings, byte-identical
 * to the literals the modal rendered before the extraction.
 */
import { describe, expect, it } from 'vitest';
import he from '@/messages/he/player.json';
import { player } from '@/messages/ns/player';
import { makeT } from '../t';

const t = makeT('he', player);
type Key = keyof typeof he;

describe('player (he) swap modal — byte-identical to the pre-extraction literals', () => {
  it('owns exactly these keys', () => {
    expect(Object.keys(he).filter((k) => k.startsWith('swapModal.')).length).toBe(19);
  });

  it('plain strings', () => {
    const cases: Array<[Key, string]> = [
      ['swapModal.reason.tooHard', 'קשה מדי'],
      ['swapModal.reason.tooEasy', 'קל מדי'],
      ['swapModal.reason.noEquipment', 'אין לי את הציוד'],
      ['swapModal.reason.dislike', 'פחות מתאים לי'],
      ['swapModal.reason.pain', 'כואב'],
      ['swapModal.header', 'החלפת תרגיל'],
      ['swapModal.closeAria', 'סגור'],
      ['swapModal.tab.adaptation', 'התאמת התרגיל'],
      ['swapModal.tab.alternative', 'תרגיל חלופי'],
      ['swapModal.hint.adaptation', 'גרסאות של אותו תרגיל, ברמות קושי שונות'],
      ['swapModal.hint.alternative', 'תרגילים שונים לאותה קבוצת השרירים'],
      ['swapModal.empty.title', 'לא נמצאו תרגילים חלופיים'],
      ['swapModal.reason.prompt', 'למה מחליפים? (לא חובה)'],
      ['swapModal.reason.painNote', 'כאב הוא סימן לעצור. אם הוא לא עובר — כדאי להתייעץ עם איש מקצוע.'],
      ['swapModal.cta', 'החליפו תרגיל'],
      ['strengthSummary.swappedTag', 'הוחלף'],
    ];
    for (const [k, v] of cases) expect([k, t(k)]).toEqual([k, v]);
  });

  it('interpolated strings', () => {
    expect(t('swapModal.level', { level: 7 })).toBe('רמה 7');
    expect(t('swapModal.empty.tryTab', { tab: t('swapModal.empty.tabAlternative') })).toBe('נסו לעבור ללשונית "תרגיל חלופי"');
    expect(t('swapModal.empty.tryTab', { tab: t('swapModal.empty.tabAdaptation') })).toBe('נסו לעבור ללשונית "התאמת התרגיל"');
  });
});
