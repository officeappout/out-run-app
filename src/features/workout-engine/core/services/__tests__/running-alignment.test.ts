import { describe, it, expect } from 'vitest';
import { buildRolledBackSchedule, resolveProgramAlignment } from '../running-alignment';
import type { ActiveRunningProgram } from '../../types/running.types';

const START = new Date('2026-09-06T00:00:00'); // local Sunday
type Entry = ActiveRunningProgram['schedule'][number];

const schedule: Entry[] = [
  { week: 1, day: 1, workoutId: 'w1', status: 'completed', category: 'tempo', workoutName: 'טמפו', isQualityWorkout: true, priority: 1, slotType: 'quality_primary', actualPerformance: { avgPace: 300, completionRate: 1 } },
  { week: 1, day: 2, workoutId: 'w2', status: 'skipped', category: 'easy_run', workoutName: 'קלה', isQualityWorkout: false, priority: 3, slotType: 'easy_run' },
  { week: 2, day: 1, workoutId: 'w3', status: 'skipped', category: 'long_intervals', isQualityWorkout: true, slotType: 'quality_primary' },
  { week: 2, day: 2, workoutId: 'w4', status: 'pending', category: 'long_run', slotType: 'long_run' },
];

describe('bug #7 — buildRolledBackSchedule keeps the rules fields', () => {
  it('the repeated week keeps category / workoutName / slotType / isQualityWorkout / priority, reset to pending, no results', () => {
    const out = buildRolledBackSchedule(schedule, 2)!;
    const week2 = out.filter((e) => e.week === 2);
    expect(week2).toEqual([
      { week: 2, day: 1, workoutId: 'w1', status: 'pending', category: 'tempo', workoutName: 'טמפו', isQualityWorkout: true, priority: 1, slotType: 'quality_primary' },
      { week: 2, day: 2, workoutId: 'w2', status: 'pending', category: 'easy_run', workoutName: 'קלה', isQualityWorkout: false, priority: 3, slotType: 'easy_run' },
    ]);
    expect(out.filter((e) => e.week === 1)).toEqual(schedule.filter((e) => e.week === 1));
  });

  it('flag off (preserveFields=false) is the legacy workoutId-only copy, byte for byte', () => {
    const out = buildRolledBackSchedule(schedule, 2, false)!;
    expect(out.filter((e) => e.week === 2)).toEqual([
      { week: 2, day: 1, workoutId: 'w1', status: 'pending' },
      { week: 2, day: 2, workoutId: 'w2', status: 'pending' },
    ]);
  });

  it('nothing to roll back to in week 1', () => {
    expect(buildRolledBackSchedule(schedule, 1)).toBeNull();
  });
});

describe('bug #12 — resolveProgramAlignment is pure (asOf in, no clock)', () => {
  const program = { startDate: START, schedule };
  it('2 skipped in this + last week → quality_makeup', () => {
    expect(resolveProgramAlignment(program, '2026-09-15', new Date('2026-09-16T10:00:00'))).toEqual({ type: 'quality_makeup', missedCount: 2 });
  });
  it('7-20 day gap → plan_realign; 21+ → rebuild; no last workout → none', () => {
    expect(resolveProgramAlignment(program, '2026-09-01', new Date('2026-09-10T10:00:00'))).toEqual({ type: 'plan_realign', daysSinceLastWorkout: 9 });
    expect(resolveProgramAlignment(program, '2026-08-01', new Date('2026-09-10T10:00:00'))).toMatchObject({ type: 'rebuild' });
    expect(resolveProgramAlignment(program, null, new Date('2026-09-10T10:00:00'))).toEqual({ type: 'none' });
  });
  it('same input, same answer — whatever the real date is', () => {
    const a = resolveProgramAlignment(program, '2026-09-15', new Date('2026-09-16T10:00:00'));
    const b = resolveProgramAlignment(program, '2026-09-15', new Date('2026-09-16T10:00:00'));
    expect(a).toEqual(b);
  });
});
