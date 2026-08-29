import { describe, it, expect } from 'vitest';
import { resolveScheduledProgram } from '../resolveScheduledProgram';
import type { UserScheduleEntry } from '@/features/user/scheduling/types/schedule.types';

// Pins the fix/schedule-entry-per-item StatsOverview fix: this decision logic
// used to pick ONE entry via .find() and read that entry's .programIds — under
// hydrateFromTemplate's one-entry-per-id change, that silently dropped every id
// but the first from what the workout-generation engine builds for "today,"
// a real regression (not cosmetic) caught in review before this shipped.

function trainingEntry(programId: string, overrides: Partial<UserScheduleEntry> = {}): UserScheduleEntry {
  return {
    entryId: `e-${programId}`,
    userId: 'u1',
    date: '2026-09-02',
    programIds: [programId],
    type: 'training',
    source: 'recurring',
    completed: false,
    ...overrides,
  } as UserScheduleEntry;
}

function restEntry(overrides: Partial<UserScheduleEntry> = {}): UserScheduleEntry {
  return {
    entryId: 'e-rest',
    userId: 'u1',
    date: '2026-09-02',
    programIds: [],
    type: 'rest',
    source: 'recurring',
    completed: false,
    ...overrides,
  } as UserScheduleEntry;
}

describe('resolveScheduledProgram', () => {
  it('a hydrated 2-item day: scheduledProgramIds contains both, in order, not a rest day', () => {
    const result = resolveScheduledProgram({
      rawEntries: [trainingEntry('FULL_BODY'), trainingEntry('PLANCHE')],
      hydrated: [],
      templateDayIds: undefined,
      hasScheduleConfigured: true,
      activeProgramId: 'FULL_BODY',
    });

    expect(result.isRestDay).toBe(false);
    expect(result.scheduledProgramIds).toEqual(['FULL_BODY', 'PLANCHE']);
  });

  it('the trap: a day that has NEVER been hydrated (rawEntries empty) — after hydration, both ids are collected from `hydrated`, not lost', () => {
    // rawEntries is empty precisely because the day was never hydrated —
    // that's what triggers the caller to call hydrateFromTemplate in the
    // first place. Ids must come from `hydrated`, never from `rawEntries` alone.
    const result = resolveScheduledProgram({
      rawEntries: [],
      hydrated: [trainingEntry('FULL_BODY'), trainingEntry('PLANCHE')],
      templateDayIds: ['FULL_BODY', 'PLANCHE'],
      hasScheduleConfigured: true,
      activeProgramId: undefined,
    });

    expect(result.isRestDay).toBe(false);
    expect(result.scheduledProgramIds).toEqual(['FULL_BODY', 'PLANCHE']);
  });

  it('an explicit rest entry (raw) is still correctly detected, with training entries present elsewhere ignored', () => {
    const result = resolveScheduledProgram({
      rawEntries: [restEntry()],
      hydrated: [],
      templateDayIds: ['FULL_BODY'],
      hasScheduleConfigured: true,
      activeProgramId: 'FULL_BODY',
    });

    expect(result.isRestDay).toBe(true);
    expect(result.scheduledProgramIds).toEqual([]);
  });

  it('a freshly-hydrated rest day (template day was empty) is still correctly detected as rest', () => {
    const result = resolveScheduledProgram({
      rawEntries: [],
      hydrated: [restEntry()],
      templateDayIds: [],
      hasScheduleConfigured: true,
      activeProgramId: 'FULL_BODY',
    });

    expect(result.isRestDay).toBe(true);
    expect(result.scheduledProgramIds).toEqual([]);
  });

  it('dedupes ids that appear more than once across rawEntries and hydrated', () => {
    const result = resolveScheduledProgram({
      rawEntries: [trainingEntry('FULL_BODY')],
      hydrated: [trainingEntry('FULL_BODY'), trainingEntry('PLANCHE')],
      templateDayIds: undefined,
      hasScheduleConfigured: true,
      activeProgramId: undefined,
    });

    expect(result.scheduledProgramIds).toEqual(['FULL_BODY', 'PLANCHE']);
  });

  it('community-only entry falls through to the template fallback ids', () => {
    const result = resolveScheduledProgram({
      rawEntries: [trainingEntry('COMMUNITY_RUN', { source: 'community' })],
      hydrated: [],
      templateDayIds: ['FULL_BODY', 'PLANCHE'],
      hasScheduleConfigured: true,
      activeProgramId: undefined,
    });

    expect(result.isRestDay).toBe(false);
    expect(result.scheduledProgramIds).toEqual(['FULL_BODY', 'PLANCHE']);
  });

  it('implicit off-day: nothing scheduled anywhere but the user has a configured schedule → rest, no activeProgram leak', () => {
    const result = resolveScheduledProgram({
      rawEntries: [],
      hydrated: [],
      templateDayIds: undefined,
      hasScheduleConfigured: true,
      activeProgramId: 'FULL_BODY',
    });

    expect(result.isRestDay).toBe(true);
    expect(result.scheduledProgramIds).toEqual([]);
  });

  it('no schedule configured at all: falls back to activeProgramId, not treated as rest', () => {
    const result = resolveScheduledProgram({
      rawEntries: [],
      hydrated: [],
      templateDayIds: undefined,
      hasScheduleConfigured: false,
      activeProgramId: 'FULL_BODY',
    });

    expect(result.isRestDay).toBe(false);
    expect(result.scheduledProgramIds).toEqual(['FULL_BODY']);
  });
});
