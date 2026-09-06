import { describe, it, expect } from 'vitest';
import { buildWeaverInput, type WeaverInputProfile } from '../weaverInput';
import type { WorkoutCategory } from '@/features/workout-engine/core/types/running.types';
import type { RunningDayRole } from '../runningRules';

const ASOF = new Date('2026-09-10T00:00:00Z'); // a Thursday — irrelevant to the math, just a fixed, deterministic anchor.
const START_DATE = new Date('2026-09-06T00:00:00Z'); // Sunday, 4 days before ASOF — week 1.

interface ScheduleEntryFixture {
  week: number;
  day: number;
  category?: WorkoutCategory;
  isQualityWorkout?: boolean;
  slotType?: RunningDayRole;
}

function strengthOwningProfile(recurringTemplate: Record<string, string[]>): Pick<WeaverInputProfile, 'progression' | 'lifestyle'> {
  return {
    progression: {
      domains: { PLANCHE: { currentLevel: 3 } },
      activePrograms: [{ name: 'Upper Body', templateId: 'upper_body' }],
    },
    lifestyle: { recurringTemplate },
  };
}

function runningOwningProfile(scheduleDays: string[], schedule: ScheduleEntryFixture[]): Pick<WeaverInputProfile, 'running'> {
  return {
    running: {
      isUnlocked: true,
      scheduleDays,
      activeProgram: { startDate: START_DATE, schedule },
    },
  };
}

describe('buildWeaverInput', () => {
  it('a profile with full slotType data carries it through onto the right calendar days', () => {
    const profile: WeaverInputProfile = {
      ...strengthOwningProfile({ א: ['PLANCHE'], ג: ['PLANCHE'] }),
      ...runningOwningProfile(
        ['ב', 'ד', 'ו'], // Mon, Wed, Fri — trainingDayIndices = [1,3,5]
        [
          { week: 1, day: 1, category: 'tempo', isQualityWorkout: true, slotType: 'quality_primary' },
          { week: 1, day: 2, category: 'easy_run', isQualityWorkout: false, slotType: 'easy_run' },
          { week: 1, day: 3, category: 'long_run', isQualityWorkout: false, slotType: 'long_run' },
        ],
      ),
    };

    const result = buildWeaverInput(profile, 50, 5, ASOF);
    expect(result).not.toBeNull();

    const runningDays = result!.running.existingWeek;
    expect(runningDays.find((d) => d.dayOfWeek === 1)).toMatchObject({ category: 'tempo', slotType: 'quality_primary', isQualityWorkout: true });
    expect(runningDays.find((d) => d.dayOfWeek === 3)).toMatchObject({ category: 'easy_run', slotType: 'easy_run', isQualityWorkout: false });
    expect(runningDays.find((d) => d.dayOfWeek === 5)).toMatchObject({ category: 'long_run', slotType: 'long_run', isQualityWorkout: false });
    expect(result!.running.requestedCount).toBe(3);

    expect(result!.strength.requestedCount).toBe(2);
    const strengthDays = result!.strength.existingWeek.filter((d) => d.sessions.length > 0).map((d) => d.dayOfWeek);
    expect(strengthDays.length).toBe(2);
  });

  it('a veteran profile with no slotType at all still builds — category/isQualityWorkout carry through, slotType stays undefined (never coerced to false)', () => {
    const profile: WeaverInputProfile = {
      ...strengthOwningProfile({ א: ['PLANCHE'], ג: ['PLANCHE'] }),
      ...runningOwningProfile(
        ['ב', 'ד'],
        [
          { week: 1, day: 1, category: 'tempo' }, // no isQualityWorkout, no slotType — pre-migration shape
          { week: 1, day: 2, category: 'easy_run' },
        ],
      ),
    };

    const result = buildWeaverInput(profile, 50, 5, ASOF);
    expect(result).not.toBeNull();

    const qualityDay = result!.running.existingWeek.find((d) => d.category === 'tempo');
    expect(qualityDay?.slotType).toBeUndefined();
    expect(qualityDay?.isQualityWorkout).toBeUndefined();
    expect(result!.running.requestedCount).toBe(2);
  });

  it('a profile with strength but no running program at all still builds — running side is empty (requestedCount 0), not null', () => {
    const profile: WeaverInputProfile = {
      ...strengthOwningProfile({ א: ['PLANCHE'], ג: ['PLANCHE'], ה: ['PLANCHE'] }),
    };

    const result = buildWeaverInput(profile, 0, 5, ASOF);
    expect(result).not.toBeNull();
    expect(result!.running.requestedCount).toBe(0);
    expect(result!.running.existingWeek.every((d) => d.category === null)).toBe(true);
    expect(result!.strength.requestedCount).toBe(3);
  });

  it('an empty profile (neither track owned at all) returns null, not a partial object', () => {
    const profile: WeaverInputProfile = {};
    expect(buildWeaverInput(profile, 50, 5, ASOF)).toBeNull();
    expect(buildWeaverInput(null, 50, 5, ASOF)).toBeNull();
    expect(buildWeaverInput(undefined, 50, 5, ASOF)).toBeNull();
  });

  it('asOfDate before the running program\'s startDate does not report a false week 1 with real workouts — the 2647b7f0 bug, previously reproduced here by a local copy of calculateCurrentWeek missing the isDateWithinRunningPlan guard', () => {
    const laterStart = new Date('2026-10-01T00:00:00Z'); // program starts AFTER the preview's asOfDate
    const previewAsOf = new Date('2026-09-10T00:00:00Z'); // before laterStart
    const profile: WeaverInputProfile = {
      ...strengthOwningProfile({ א: ['PLANCHE'] }),
      running: {
        isUnlocked: true,
        scheduleDays: ['א', 'ג'],
        activeProgram: {
          startDate: laterStart,
          // Week 1 entries exist — the bug would make buildWeaverInput
          // treat previewAsOf as week 1 (Math.max(1,...) clamp) and surface
          // these as the "current" running days, even though previewAsOf
          // is before the program even started.
          schedule: [
            { week: 1, day: 1, category: 'tempo', isQualityWorkout: true, slotType: 'quality_primary' },
            { week: 1, day: 2, category: 'easy_run' },
          ],
        },
      },
    };

    const result = buildWeaverInput(profile, 50, 5, previewAsOf);
    expect(result).not.toBeNull();
    expect(result!.running.requestedCount).toBe(0);
    expect(result!.running.existingWeek.every((d) => d.category === null)).toBe(true);
  });
});
