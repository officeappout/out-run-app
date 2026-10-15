import { describe, it, expect } from 'vitest';
import {
  aggregateRetentionDrivers,
  driverFlags,
  isRetained,
  MIN_SAMPLE,
  type DriverUser,
  type DriverWorkout,
} from '../journey-retention-drivers';

const SIGNUP = new Date('2026-08-01T10:00:00Z');
const dayAfter = (n: number) => new Date(SIGNUP.getTime() + n * 24 * 60 * 60 * 1000);
const w = (day: number, p: Partial<DriverWorkout> = {}): DriverWorkout => ({ at: dayAfter(day), parkId: null, groupId: null, setsCompleted: null, setsPlanned: null, ...p });

const user = (uid: string, p: Partial<DriverUser> = {}): DriverUser => ({
  uid,
  createdAt: SIGNUP,
  workouts: [],
  reminderSetAt: [],
  plannedSessionAt: [],
  inGroup: false,
  pushEnabled: false,
  invited: false,
  hasProgram: false,
  runningUnlocked: false,
  ...p,
});

describe('isRetained — a real workout between day 14 and day 28', () => {
  it('day 14 and 28 count; day 13 and 29 do not', () => {
    expect(isRetained(user('a', { workouts: [w(14)] }))).toBe(true);
    expect(isRetained(user('a', { workouts: [w(28)] }))).toBe(true);
    expect(isRetained(user('a', { workouts: [w(13), w(29)] }))).toBe(false);
  });
});

describe('driverFlags — first-week behaviours', () => {
  it('park, group, 2+, full completion, reminder, plan — only inside the first 7 days', () => {
    const f = driverFlags(user('a', {
      workouts: [w(1, { parkId: 'p1', setsCompleted: 4, setsPlanned: 4 }), w(3, { groupId: 'g1' }), w(10, { parkId: 'p2' })],
      reminderSetAt: [dayAfter(2)],
      plannedSessionAt: [dayAfter(9)],
    }));
    expect(f).toMatchObject({ trainedInPark: true, trainedWithGroup: true, twoPlusWorkouts: true, fullCompletion: true, setReminder: true, plannedSession: false });
  });
  it('a partial workout is not a full completion; one workout is not 2+', () => {
    const f = driverFlags(user('a', { workouts: [w(1, { setsCompleted: 2, setsPlanned: 4 })] }));
    expect(f.fullCompletion).toBe(false);
    expect(f.twoPlusWorkouts).toBe(false);
  });
});

describe('aggregateRetentionDrivers', () => {
  // MIN_SAMPLE users in a park group (retained 60%), MIN_SAMPLE without (retained 20%)
  const park = Array.from({ length: MIN_SAMPLE }, (_, i) =>
    user(`p${i}`, { workouts: [w(2, { parkId: 'park' }), ...(i < MIN_SAMPLE * 0.6 ? [w(20)] : [])] }),
  );
  const noPark = Array.from({ length: MIN_SAMPLE }, (_, i) =>
    user(`n${i}`, { workouts: [w(2), ...(i < MIN_SAMPLE * 0.2 ? [w(20)] : [])] }),
  );
  const r = aggregateRetentionDrivers([...park, ...noPark], { from: dayAfter(-30), to: dayAfter(0) });

  it('cohort size and overall retention', () => {
    expect(r.cohortSize).toBe(MIN_SAMPLE * 2);
    expect(r.retainedPct).toBe(40);
  });

  it('computes with/without retention and the lift, strongest first', () => {
    const parkRow = r.drivers.find((d) => d.key === 'trainedInPark')!;
    expect(parkRow).toMatchObject({ withCount: MIN_SAMPLE, withoutCount: MIN_SAMPLE, withPct: 60, withoutPct: 20, lift: 3, enoughData: true });
    expect(r.drivers[0].key).toBe('trainedInPark');
  });

  it('a behaviour nobody (or everybody) has is shown without numbers, at the bottom', () => {
    const reminder = r.drivers.find((d) => d.key === 'setReminder')!;
    expect(reminder).toMatchObject({ withCount: 0, enoughData: false, withPct: null, lift: null });
    expect(r.drivers[r.drivers.length - 1].enoughData).toBe(false);
  });

  it('an empty cohort has no retention %, not 0', () => {
    expect(aggregateRetentionDrivers([], { from: SIGNUP, to: SIGNUP }).retainedPct).toBeNull();
  });
});
