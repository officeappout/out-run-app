import { describe, expect, it } from 'vitest';
import {
  expandTriadCategories,
  isTriadAssessmentCategory,
  mergeTriadNoRegression,
  splitTriadLevels,
} from '../triad-assessment';

describe('handstand triad assessment', () => {
  it('flag off → categories unchanged; on → handstand becomes three sliders in place', () => {
    expect(expandTriadCategories(['handstand', 'core'], false)).toEqual(['handstand', 'core']);
    expect(expandTriadCategories(['planche', 'handstand', 'core'], true)).toEqual([
      'planche', 'handstand_strength', 'handstand_balance', 'handstand_mobility', 'core',
    ]);
    expect(isTriadAssessmentCategory('handstand_balance')).toBe(true);
    expect(isTriadAssessmentCategory('handstand')).toBe(false);
  });
  it('answers collapse to handstand = round(avg) + triad; no handstand_* keys left', () => {
    const r = splitTriadLevels({ handstand_strength: 12, handstand_balance: 4, handstand_mobility: 7, core: 6 });
    expect(r.levels).toEqual({ core: 6, handstand: 8 });
    expect(r.triad).toEqual({ strength: 12, balance: 4, mobility: 7 });
  });
  it('no triad answers → levels untouched, triad null', () => {
    const levels = { handstand: 5, core: 3 };
    expect(splitTriadLevels(levels)).toEqual({ levels, triad: null });
  });
  it('clamps to 1-15', () => {
    expect(splitTriadLevels({ handstand_strength: 25, handstand_balance: 0, handstand_mobility: 9 }).triad).toEqual({
      strength: 15, balance: 1, mobility: 9,
    });
  });
  it('re-test never lowers an axis, keeps axes not re-tested', () => {
    expect(mergeTriadNoRegression({ strength: 10, balance: 6, mobility: 4 }, { strength: 8, balance: 9 })).toEqual({
      strength: 10, balance: 9, mobility: 4,
    });
    expect(mergeTriadNoRegression(undefined, { mobility: 5 })).toEqual({ mobility: 5 });
  });
});
