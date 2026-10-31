import { describe, expect, it } from 'vitest';
import type { WorkoutSegment } from '@/features/parks/core/types/route.types';
import { timedSpecFromSegment } from '../../../engines/timed/timed-spec';
import { amrapComboConfig, emomComboConfig } from '../combo-blocks';

/** The combo configs run through the REAL timed engine's segment reader (no new player). */
const exercises = [
  { id: 'pushup', name: 'Push-ups', reps: '10' },
  { id: 'squat', name: 'Squats', reps: '15' },
] as unknown as WorkoutSegment['exercises'];
const members = [{ exerciseId: 'pushup', targetReps: 10 }, { exerciseId: 'squat', targetReps: 15 }];

describe('combo blocks through timedSpecFromSegment', () => {
  it('AMRAP: a run item then the two exercises, every round', () => {
    const seg = { id: 'seg-combo', title: 'AMRAP', type: 'strength', protocol: 'amrap', protocolConfig: amrapComboConfig({ legMeters: 400, members, minutes: 16 }), exercises } as unknown as WorkoutSegment;
    const spec = timedSpecFromSegment(seg)!;
    expect(spec.format).toBe('amrap');
    expect(spec.items.map((i) => i.kind)).toEqual(['aerobic_leg', 'exercise', 'exercise']);
  });
  it('EMOM: run / member alternate', () => {
    const seg = { id: 'seg-combo', title: 'EMOM', type: 'strength', protocol: 'emom', protocolConfig: emomComboConfig({ legMeters: 200, members, minutes: 10 }), exercises } as unknown as WorkoutSegment;
    const spec = timedSpecFromSegment(seg)!;
    expect(spec.format).toBe('emom');
    expect(spec.items.map((i) => i.kind)).toEqual(['aerobic_leg', 'exercise', 'aerobic_leg', 'exercise']);
  });
});
