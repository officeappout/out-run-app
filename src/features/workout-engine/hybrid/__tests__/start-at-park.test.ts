import { describe, it, expect } from 'vitest';
import { nextLeftRadius, shouldStartAtPark, startAtParkRadiusM, type StartAtParkInput } from '../start-at-park';

const base: StartAtParkInput = {
  phase: 'aerobic', isFinalLeg: false, nextStationNumber: 1, aerobicType: 'walking',
  distanceM: 30, accuracyM: 10, leftRadius: false,
};

describe('shouldStartAtPark (pilot M5)', () => {
  it('uses the existing approach radius', () => {
    expect(startAtParkRadiusM('walking')).toBe(56);
    expect(startAtParkRadiusM('running')).toBe(120);
  });

  it('already at the first park → start at the stations', () => {
    expect(shouldStartAtPark(base)).toBe(true);
    expect(shouldStartAtPark({ ...base, distanceM: 56 })).toBe(true);
    expect(shouldStartAtPark({ ...base, aerobicType: 'running', distanceM: 110 })).toBe(true);
  });

  it('far from the park → walk first', () => {
    expect(shouldStartAtPark({ ...base, distanceM: 57 })).toBe(false);
  });

  it('only the first leg toward station 1, never after leaving the radius', () => {
    expect(shouldStartAtPark({ ...base, nextStationNumber: 2 })).toBe(false);
    expect(shouldStartAtPark({ ...base, isFinalLeg: true })).toBe(false);
    expect(shouldStartAtPark({ ...base, phase: 'station' })).toBe(false);
    expect(shouldStartAtPark({ ...base, leftRadius: true })).toBe(false);
  });

  it('needs a real, accurate fix', () => {
    expect(shouldStartAtPark({ ...base, distanceM: null })).toBe(false);
    expect(shouldStartAtPark({ ...base, accuracyM: 80 })).toBe(false);
    expect(shouldStartAtPark({ ...base, accuracyM: null })).toBe(true);
  });
});

describe('nextLeftRadius', () => {
  it('latches on the first accurate fix outside the radius', () => {
    expect(nextLeftRadius(false, 200, 10, 'walking')).toBe(true);
    expect(nextLeftRadius(false, 200, 90, 'walking')).toBe(false);
    expect(nextLeftRadius(false, 40, 10, 'walking')).toBe(false);
    expect(nextLeftRadius(false, null, 10, 'walking')).toBe(false);
    expect(nextLeftRadius(true, 10, 10, 'walking')).toBe(true);
  });
});
