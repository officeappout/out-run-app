/**
 * Namespace `map`, batch ah (caloriesChip.* / mapLoading.* / routeLoader.* / workoutPrefs.*): every Hebrew key
 * returns exactly what the component rendered before the extraction (old literals copied verbatim from
 * origin/main). Covers what the static parity snapshots can't reach: the loader's later steps and the modal's
 * labels. Own file so parallel map batches don't conflict.
 */
import { describe, expect, it } from 'vitest';
import he from '@/messages/he/map.json';
import { map } from '@/messages/ns/map';
import { makeT } from '../t';

const t = makeT('he', map);
type Key = keyof typeof he;

describe('map (he) — batch ah, byte-identical to the pre-extraction literals', () => {
  it('plain strings', () => {
    const cases: Array<[Key, string]> = [
      ['caloriesChip.nudge', 'לחצו לדיוק'],
      ['mapLoading.ariaLabel', 'טוען מפה'],
      ['mapLoading.caption', 'מנתח את הסביבה'],
      ['routeLoader.step.terrain', 'מנתח את השטח...'],
      ['routeLoader.step.poi', 'מחפש נקודות עניין...'],
      ['routeLoader.step.distances', 'מחשב מרחקים וגבהים...'],
      ['routeLoader.step.profile', 'מתאים את המסלול לפרופיל שלך...'],
      ['routeLoader.step.almost', 'כמעט סיימנו...'],
      ['routeLoader.subtitle', 'ה-AI שלנו בונה לך מסלול מושלם'],
      ['workoutPrefs.title', 'בניית אימון'],
      ['workoutPrefs.duration.question', 'כמה זמן יש לך?'],
      ['workoutPrefs.duration.unit', 'דק׳'],
      ['workoutPrefs.activity.question', 'מה בא לך לעשות?'],
      ['workoutPrefs.activity.walking', 'הליכה'],
      ['workoutPrefs.activity.running', 'ריצה'],
      ['workoutPrefs.activity.cycling', 'רכיבה'],
      ['workoutPrefs.intensity.label', 'רמת מאמץ'],
      ['workoutPrefs.intensity.easy', 'איזי'],
      ['workoutPrefs.intensity.medium', 'רגיל'],
      ['workoutPrefs.intensity.hard', 'טורבו'],
      ['workoutPrefs.strength.title', 'שילוב מתקני כושר'],
      ['workoutPrefs.strength.subtitle', 'נחפש מסלול עם תחנות כוח'],
      ['workoutPrefs.footer.coins', 'צפי מטבעות'],
      ['workoutPrefs.footer.calories', 'שריפת קלוריות'],
      ['workoutPrefs.cta', 'מצא מסלול מתאים 🚀'],
    ];
    for (const [key, old] of cases) expect(t(key)).toBe(old);
  });

  it('calories template (counts >= 1000 stay unformatted)', () => {
    for (const calories of [0, 312, 1234, 12345]) {
      expect(t('caloriesChip.label', { calories: String(calories) })).toBe(`${calories} קלוריות`);
    }
  });

  it('key counts per prefix (this batch)', () => {
    const count = (prefix: string) => Object.keys(he).filter((k) => k.startsWith(prefix)).length;
    expect(count('caloriesChip.')).toBe(2);
    expect(count('mapLoading.')).toBe(2);
    expect(count('routeLoader.')).toBe(6);
    expect(count('workoutPrefs.')).toBe(16);
  });
});
