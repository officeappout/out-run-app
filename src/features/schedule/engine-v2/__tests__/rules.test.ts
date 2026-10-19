import { describe, expect, it } from 'vitest';
import { breaksH3, breaksH6, breaksH7, emptyGrid } from '../rules';
import { makeRunUnit, makeStrengthUnit } from '../units';
import { validateLayout } from '../validate';
import { renderV2ReasonHe } from '../reasonsV2';
import type { PlacedSession } from '../types';

const S = (slug: string) => makeStrengthUnit(slug);

describe('hard rules', () => {
  it('H3: heavy legs never the day before a key run, Saturday → Sunday included', () => {
    const g = emptyGrid();
    g.run[0] = makeRunUnit('quality_primary');
    expect(breaksH3(S('legs'), 6, g)).toBe(true);
    expect(breaksH3(S('full_body'), 6, g)).toBe(false); // moderate legs: soft (S7)
    expect(breaksH3(S('legs'), 5, g)).toBe(false);
  });

  it('H6 is pattern-aware: planche and the push program share the push pattern', () => {
    expect(breaksH6(S('planche'), 0, S('push'), 1)).toBe(true);
    expect(breaksH6(S('planche'), 0, S('push'), 2)).toBe(false);
    expect(breaksH6(S('front_lever'), 0, S('pull'), 1)).toBe(true);
    expect(breaksH6(S('planche'), 1, S('front_lever'), 2)).toBe(false); // straight-arm alone is soft (S07)
  });

  it('FIX-01: any pull ≥72h after a one-arm pull-up', () => {
    expect(breaksH6(S('one_arm_pullup'), 2, S('front_lever'), 4)).toBe(true);
    expect(breaksH6(S('one_arm_pullup'), 2, S('front_lever'), 5)).toBe(false);
  });

  it('H7: no cns skill within 48h after a muscle-up (handstand is free)', () => {
    expect(breaksH7(S('muscle_up'), 0, S('planche'), 2)).toBe(true);
    expect(breaksH7(S('muscle_up'), 0, S('planche'), 3)).toBe(false);
    expect(breaksH7(S('muscle_up'), 0, S('handstand'), 1)).toBe(false);
  });

  it('validateLayout flags strength before a quality run (H5) and strength on the long-run day (H2)', () => {
    const layout: PlacedSession[][] = [
      [{ kind: 'strength', slug: 'push' }, { kind: 'run', slot: 'quality_primary' }],
      [],
      [],
      [],
      [],
      [{ kind: 'run', slot: 'long_run' }, { kind: 'strength', slug: 'pull' }],
      [],
    ];
    const v = validateLayout(layout, { open: Array(7).fill(true), maxPerDay: 2 }, 'intermediate');
    expect(v.map((x) => x.rule).sort()).toEqual(['H2', 'H5']);
  });
});

describe('reasons', () => {
  it('renders Hebrew, never an internal id', () => {
    const texts = [
      renderV2ReasonHe({ code: 'LONG_RUN_LAST_FREE_DAY', day: 4 }),
      renderV2ReasonHe({ code: 'QUALITY_RUN_FIRST', day: 0 }),
      renderV2ReasonHe({ code: 'GROUP_RUN_FILLS_SLOT', slot: 'quality_primary', time: '19:00' }),
      renderV2ReasonHe({ code: 'RUN_OWN_DAY', slot: 'easy_run' }),
    ];
    for (const t of texts) {
      expect(t).toMatch(/[֐-׿]/);
      expect(t).not.toMatch(/quality_|long_run|easy_run|UPPER_BODY/);
    }
  });
});
