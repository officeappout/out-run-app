import { describe, it, expect } from 'vitest';
import { timedMainBlock, timedMainFormat, withTimedMainBlock } from '../timed.block';
import { timedSpecFromSegment } from '../../../engines/timed/timed-spec';

const ex = (id: string, sets = 3, extra: Record<string, unknown> = {}) => ({ exercise: { id }, sets, exerciseRole: 'main', ...extra });
const gw = (over: Record<string, unknown>) => ({ structure: 'standard', blastMode: undefined, exercises: [ex('a'), ex('b'), ex('w', 1, { exerciseRole: 'warmup' })], ...over }) as never;

describe('timed.block (generator choice → timed main block)', () => {
  it('classic workouts stay classic', () => {
    expect(timedMainFormat(gw({}))).toBeNull();
    expect(timedMainBlock(gw({}))).toBeNull();
    const segs = [{ id: 'seg-main' }];
    expect(withTimedMainBlock(segs, gw({}))).toBe(segs);
  });

  it('admin EMOM: one minute per main set, clamped', () => {
    const b = timedMainBlock(gw({ structure: 'emom' }))!;
    expect(b).toMatchObject({ protocol: 'emom', minutes: 6, title: 'EMOM 6′', config: { intervalSec: 60, totalIntervals: 6 } });
    const big = timedMainBlock(gw({ structure: 'emom', exercises: Array.from({ length: 9 }, (_, i) => ex(`e${i}`, 3)) }))!;
    expect(big.minutes).toBe(20);
  });

  it('blast AMRAP: capped by the builder duration; tabata members excluded', () => {
    const b = timedMainBlock(gw({
      structure: 'amrap',
      blastMode: { type: 'amrap', durationMinutes: 8 },
      exercises: [ex('a', 4), ex('b', 4), ex('c', 4), ex('t', 3, { protocolBlock: 'tabata' })],
    }))!;
    expect(b).toMatchObject({ protocol: 'amrap', minutes: 8, config: { capSec: 480, roundItems: [] } });
  });

  it('seg-main becomes a valid block segment the player recognises', () => {
    const segs = [
      { id: 'seg-warmup', title: 'חימום' },
      { id: 'seg-main', title: 'אימון', restBetweenExercises: 10, exercises: [{ id: 'a', name: 'a', reps: '12' }] },
    ];
    const out = withTimedMainBlock(segs, gw({ structure: 'amrap' }));
    expect(out[0]).toBe(segs[0]);
    expect(out[1]).toMatchObject({ title: 'AMRAP 6′', protocol: 'amrap', restBetweenExercises: 0 });
    const spec = timedSpecFromSegment(out[1] as never)!;
    expect(spec.format).toBe('amrap');
    expect(spec.items[0]).toMatchObject({ key: 'a', targetReps: 12 });
  });
});
