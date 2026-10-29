import { describe, it, expect } from 'vitest';
import { buildMethodInfo, demoPhases, pyramidPeakIndex, type MethodSource } from '../method-info.model';
import { methodCopy } from '../../../../components/method-info/method-info.copy';
import { makeT } from '@/lib/i18n/t';
import { player } from '@/messages/ns/player';
import type { PyramidStep } from '../../../../logic/workout-generator.types';

const t = makeT('he', player, { gender: 'male' });
const tf = makeT('he', player, { gender: 'female' });

const src = (over: Partial<MethodSource> = {}): MethodSource => ({
  key: 'a',
  name: 'מתח אוסטרלי',
  imageUrl: 'https://img/a.jpg',
  sets: 3,
  restSec: 90,
  line: '3 × 8',
  ...over,
});

const step = (setIndex: number, level: number, targetReps: number, name = `שלב ${setIndex}`): PyramidStep => ({
  setIndex,
  exerciseId: `e${setIndex}`,
  name,
  level,
  targetReps,
  imageUrl: `https://img/${setIndex}.jpg`,
});

describe('method info model — every value from the block', () => {
  it('straight sets: the first exercise, its own sets and rest', () => {
    const m = buildMethodInfo({ kind: 'straight', label: 'עיקרי', sources: [src(), src({ key: 'b', name: 'שכיבות' })] })!;
    expect(m.kind).toBe('straight');
    expect(m.items.map((i) => i.name)).toEqual(['מתח אוסטרלי']);
    expect(m.sets).toBe(3);
    expect(m.restSec).toBe(90);
    const c = methodCopy(m, t);
    expect(c.steps[1]).toContain('90 שניות');
    expect(c.steps[2]).toContain('3 סטים');
    expect(c.chips[0]).toContain('90 שניות');
  });

  it('superset: the real pair, the engine micro-rest between, the pair rest after', () => {
    const m = buildMethodInfo({
      kind: 'superset',
      label: 'סופר סט (2 תרגילים)',
      sources: [src({ name: 'שכיבות סמיכה', restSec: 60 }), src({ key: 'b', name: 'מתח אוסטרלי', restSec: 75 })],
    })!;
    expect(m.items.map((i) => i.name)).toEqual(['שכיבות סמיכה', 'מתח אוסטרלי']);
    expect(m.shortRestSec).toBe(10); // SUPERSET_TRANSITION_REST
    expect(m.restSec).toBe(75);
    const c = methodCopy(m, t);
    expect(c.steps[1]).toContain('10 שניות');
    expect(c.steps[2]).toContain('75 שניות');
    expect(demoPhases(m)).toEqual([
      { card: 0, rest: null },
      { card: null, rest: 0 },
      { card: 1, rest: null },
      { card: null, rest: 1 },
    ]);
  });

  it('superset needs two exercises', () => {
    expect(buildMethodInfo({ kind: 'superset', label: 'x', sources: [src()] })).toBeNull();
  });

  it('pyramid wave: label from pyramidLabel, cards up to the peak, the way back as a tail', () => {
    const seq = [step(0, 3, 8, '60°'), step(1, 4, 5, '45°'), step(2, 5, 3, '30°'), step(3, 4, 5, '45°'), step(4, 3, 8, '60°')];
    expect(pyramidPeakIndex(seq)).toBe(2);
    const m = buildMethodInfo({ kind: 'pyramid', label: 'ignored', sources: [src({ pyramidSequence: seq, restSec: 60 })] })!;
    expect(m.kind).toBe('pyramidWave');
    expect(m.label).toBe('פירמידה עולה-יורדת');
    expect(m.items.map((i) => i.name)).toEqual(['60°', '45°', '30°']);
    expect(m.items.map((i) => i.imageUrl)).toEqual(['https://img/0.jpg', 'https://img/1.jpg', 'https://img/2.jpg']);
    expect(m.pyramidTail).toEqual([5, 8]);
    const c = methodCopy(m, t);
    expect(c.title).toBe('פירמידה עולה-יורדת');
    expect(c.tail).toBe('ואז 5 ו-8 בדרך חזרה');
  });

  it('pyramid peak: "סט שיא", the last step is the peak and its reps go in the copy', () => {
    const seq = [step(0, 3, 6), step(1, 4, 3), step(2, 5, 1)];
    const m = buildMethodInfo({ kind: 'pyramid', label: 'x', sources: [src({ pyramidSequence: seq })] })!;
    expect(m.kind).toBe('pyramidPeak');
    expect(m.label).toBe('סט שיא');
    expect(m.items).toHaveLength(3);
    expect(m.peakTarget).toBe(1);
    const c = methodCopy(m, t);
    expect(c.steps[2]).toContain('1 חזרה');
    expect(c.chips[0]).toContain('1 חזרה');
    expect(c.tail).toBeUndefined();
  });

  it('tabata: the block clock, members and total from the real config', () => {
    const members = ['פלאנק', 'כפיפות בטן', 'מטפס הרים', 'פלאנק נגיעות בכתפיים'].map((name, i) =>
      src({ key: `m${i}`, name }),
    );
    const m = buildMethodInfo({
      kind: 'tabata',
      label: 'טבטה',
      sources: members,
      tabata: { workSec: 20, restSec: 10, rounds: 8 },
    })!;
    expect(m.tabata).toEqual({ workSec: 20, restSec: 10, rounds: 8, members: 4, cycles: 2, totalSec: 240 });
    const c = methodCopy(m, t);
    expect(c.lead).toContain('20 שניות');
    expect(c.lead).toContain('10 שניות');
    expect(c.steps[2]).toContain('2 סבבים');
    expect(c.steps[2]).toContain('4 דקות');
    expect(c.chips[1]).toContain('מחזיק');
    expect(methodCopy(m, tf).chips[1]).toContain('מחזיקה');
  });

  it('tabata: a unilateral member costs two intervals; an uneven split falls back to intervals', () => {
    const m = buildMethodInfo({
      kind: 'tabata',
      label: 'טבטה',
      sources: [src({ isUnilateral: true }), src({ key: 'b' })],
      tabata: { workSec: 30, restSec: 15, rounds: 8 },
    })!;
    expect(m.tabata?.cycles).toBeNull();
    expect(methodCopy(m, t).steps[2]).toContain('8 אינטרוולים');
  });

  it('no copy uses the long dash', () => {
    const models = [
      buildMethodInfo({ kind: 'straight', label: 'a', sources: [src()] })!,
      buildMethodInfo({ kind: 'superset', label: 'a', sources: [src(), src({ key: 'b' })] })!,
      buildMethodInfo({ kind: 'tabata', label: 'a', sources: [src()], tabata: { workSec: 20, restSec: 10, rounds: 8 } })!,
    ];
    for (const m of models) {
      const c = methodCopy(m, t);
      expect([c.title, c.lead, ...c.steps, ...c.chips].join(' ')).not.toContain('—');
    }
  });
});
