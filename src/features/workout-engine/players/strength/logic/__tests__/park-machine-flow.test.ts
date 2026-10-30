import { describe, expect, it } from 'vitest';
import { isMachineFirstInterval, parkMachineFindScreen, parkMachineNeedsWatch, parkStepHolds } from '../park-machine-flow';

const seen = (ids: string[]) => new Set(ids);

describe('park machine flow (M15 / M16)', () => {
  it('a machine starts at its own first interval, not the left side or a later round', () => {
    expect(isMachineFirstInterval({ parkMachine: true, currentRound: 1, currentSide: null })).toBe(true);
    expect(isMachineFirstInterval({ parkMachine: true, currentRound: 2, currentSide: null })).toBe(false);
    expect(isMachineFirstInterval({ parkMachine: true, currentRound: 1, currentSide: 'left' })).toBe(false);
    expect(isMachineFirstInterval({ parkMachine: false, currentRound: 1, currentSide: null })).toBe(false);
  });
  it('find: one popup per machine with its photo, until found', () => {
    const base = { enabled: true, workoutState: 'ACTIVE', firstInterval: true, exIdx: 1, exercise: { id: 'm2', name: 'Chest press', imageUrl: 'p.jpg' } };
    expect(parkMachineFindScreen({ ...base, seen: seen([]) })).toEqual({
      kind: 'single',
      items: [{ exIdx: 1, exerciseId: 'm2', exerciseName: 'Chest press', equipmentIds: [], imageUrl: 'p.jpg' }],
    });
    expect(parkMachineFindScreen({ ...base, seen: seen(['m2']) })).toBe(null);
    expect(parkMachineFindScreen({ ...base, seen: seen([]), firstInterval: false })).toBe(null);
    expect(parkMachineFindScreen({ ...base, seen: seen([]), workoutState: 'RESTING' })).toBe(null);
    expect(parkMachineFindScreen({ ...base, seen: null })).toBe(null);
  });
  it('watch: due once per machine', () => {
    const base = { enabled: true, workoutState: 'PREPARING', firstInterval: true, exerciseId: 'm1' };
    expect(parkMachineNeedsWatch({ ...base, seen: seen([]) })).toBe(true);
    expect(parkMachineNeedsWatch({ ...base, seen: seen(['m1']) })).toBe(false);
    expect(parkMachineNeedsWatch({ ...base, seen: seen([]), firstInterval: false })).toBe(false);
  });
  it('the ready / countdown step holds only its own interval until done', () => {
    expect(parkStepHolds({ key: 'k', step: 'ready' }, 'k')).toBe(true);
    expect(parkStepHolds({ key: 'k', step: 'count' }, 'k')).toBe(true);
    expect(parkStepHolds({ key: 'k', step: 'done' }, 'k')).toBe(false);
    expect(parkStepHolds({ key: 'k', step: 'ready' }, 'other')).toBe(false);
    expect(parkStepHolds(null, 'k')).toBe(false);
  });
});
