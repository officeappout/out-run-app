import { describe, it, expect } from 'vitest';
import { phaseCardFor, shouldArmEquipmentSheet, workoutEquipmentIds } from '../workout-tutorial';

describe('phaseCardFor', () => {
  it('warm-up at the start, main after the warm-up', () => {
    expect(phaseCardFor(undefined, 'warmup')).toBe('warmup');
    expect(phaseCardFor('warmup', 'warmup')).toBeNull();
    expect(phaseCardFor('warmup', 'main')).toBe('main');
  });
  it('no card for a workout that starts on main, or for main → main / cool-down', () => {
    expect(phaseCardFor(undefined, 'main')).toBeNull();
    expect(phaseCardFor('main', 'main')).toBeNull();
    expect(phaseCardFor('main', 'cooldown')).toBeNull();
  });
});

describe('workoutEquipmentIds', () => {
  it('unique main-exercise gear, warm-up / cool-down gear skipped', () => {
    const segs = [
      { exercises: [{ exerciseRole: 'warmup', equipment: ['mat'] }] },
      { exercises: [{ exerciseRole: 'main', equipment: ['pullup_bar', 'band'] }, { equipment: ['band'] }] },
      { exercises: [{ exerciseRole: 'cooldown', equipment: ['towel'] }] },
    ];
    expect(workoutEquipmentIds(segs)).toEqual(['pullup_bar', 'band']);
  });
});

describe('shouldArmEquipmentSheet', () => {
  const base = { enabled: true, hidden: false, gearCount: 2, workoutState: 'PREPARING', segmentIndex: 0, exerciseIndex: 0, resumed: false };
  it('first set of a fresh workout with gear', () => {
    expect(shouldArmEquipmentSheet(base)).toBe(true);
  });
  it('never when off, hidden for good, no gear, resumed or past the first set', () => {
    expect(shouldArmEquipmentSheet({ ...base, enabled: false })).toBe(false);
    expect(shouldArmEquipmentSheet({ ...base, hidden: true })).toBe(false);
    expect(shouldArmEquipmentSheet({ ...base, gearCount: 0 })).toBe(false);
    expect(shouldArmEquipmentSheet({ ...base, resumed: true })).toBe(false);
    expect(shouldArmEquipmentSheet({ ...base, exerciseIndex: 1 })).toBe(false);
    expect(shouldArmEquipmentSheet({ ...base, workoutState: 'ACTIVE' })).toBe(false);
  });
});
