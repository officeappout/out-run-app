import { describe, it, expect } from 'vitest';
import type { TimedBlockSpec } from '@/features/workout-engine/engines/timed/timed.types';
import { timedPlaylistModel } from '../logic/timed-playlist';

const spec: TimedBlockSpec = {
  format: 'amrap',
  config: { capSec: 600, roundItems: [] },
  items: [
    { kind: 'exercise', key: 'a', exerciseId: 'a', name: 'סקוואט', targetReps: 12 },
    { kind: 'exercise', key: 'p', exerciseId: 'p', name: 'פלאנק', targetHoldSec: 30 },
  ],
};

describe('timed block in the classic list (consistent before / after)', () => {
  it('upcoming: plan targets + the format rule', () => {
    const m = timedPlaylistModel(spec, 'upcoming', [], null);
    expect(m.title).toBe('AMRAP 10′');
    expect(m.line).toBe('כמה שיותר סבבים');
    expect(m.rows.map((r) => [r.detail, r.done])).toEqual([['12 חזרות · בכל סבב', false], ['30 שנ׳ · בכל סבב', false]]);
  });

  it('done: totals per item, never per-set pills', () => {
    const log = [
      { exerciseId: 'a', exerciseName: 'a', segmentId: 's', confirmedReps: [12, 12, 7], targetReps: 12, repsSource: ['default', 'default', 'edited'] as never },
      { exerciseId: 'p', exerciseName: 'p', segmentId: 's', confirmedReps: [30, 30, 0], targetReps: 30, repsSource: ['timer', 'timer', 'timer'] as never },
    ];
    const m = timedPlaylistModel(spec, 'done', log, null);
    expect(m.rows.map((r) => r.detail)).toEqual(['31 חזרות · ×3', '1:00 · ×2']);
    expect(m.line).toBe('31 חזרות');
  });
});
