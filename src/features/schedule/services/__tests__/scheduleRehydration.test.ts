import { describe, it, expect } from 'vitest';
import { rehydrateScheduleGrid } from '../scheduleRehydration';
import { buildDefaultTemplate } from '@/features/schedule/engine/scheduleRules';
import type { ProgramId, PrioritizedSkill } from '@/features/schedule/types/smartSchedule.types';

// Pins the extraction from ScheduleStep.tsx's inline `useState<ScheduleDay[]>
// (() => {...})` lazy initializer (30.08.2026) — a straight relocation, no
// new branches. Cascade: scheduleGridSessions (len 7) -> scheduleDayIndices
// (non-empty) -> buildDefaultTemplate fallback.

const seedPrograms: ProgramId[] = ['UPPER_BODY'];
const seedSkills: PrioritizedSkill[] = [];

describe('rehydrateScheduleGrid', () => {
  it('scheduleGridSessions (len 7) wins over scheduleDayIndices when both present', () => {
    const scheduleGridSessions = Array.from({ length: 7 }, (_, dow) => ({
      dayOfWeek: dow,
      skillIds: dow === 0 ? ['PLANCHE'] : [],
    }));
    const result = rehydrateScheduleGrid({
      scheduleGridSessions,
      scheduleDayIndices: [1, 2, 3],
      seedPrograms,
      seedSkills,
      frequency: 3,
    });
    expect(result[0].sessions.map((s) => s.skillId)).toEqual(['PLANCHE']);
    expect(result[0].isRestDay).toBe(false);
    expect(result[1].isRestDay).toBe(true); // scheduleDayIndices ignored, not this branch
  });

  it('scheduleGridSessions present but len !== 7 falls through (malformed-data guard)', () => {
    const scheduleGridSessions = [{ dayOfWeek: 0, skillIds: ['PLANCHE'] }]; // only 1 entry
    const result = rehydrateScheduleGrid({
      scheduleGridSessions,
      scheduleDayIndices: [0],
      seedPrograms,
      seedSkills,
      frequency: 1,
    });
    // Falls to scheduleDayIndices branch, not the malformed scheduleGridSessions.
    expect(result[0].sessions.map((s) => s.skillId)).toEqual(['UPPER_BODY']);
  });

  it('scheduleDayIndices non-empty -> UPPER_BODY/FULL session on each picked day, correct isRestDay', () => {
    const result = rehydrateScheduleGrid({
      scheduleDayIndices: [0, 3],
      seedPrograms,
      seedSkills,
      frequency: 2,
    });
    expect(result[0].isRestDay).toBe(false);
    expect(result[0].sessions).toEqual([{ skillId: 'UPPER_BODY', volumePercent: 100, sessionType: 'FULL' }]);
    expect(result[3].isRestDay).toBe(false);
    expect(result[1].isRestDay).toBe(true);
    expect(result[1].sessions).toEqual([]);
  });

  it('scheduleDayIndices: [] is treated the same as absent (the .length > 0 check) and falls through to buildDefaultTemplate', () => {
    const result = rehydrateScheduleGrid({
      scheduleDayIndices: [],
      seedPrograms,
      seedSkills,
      frequency: 3,
    });
    const expected = buildDefaultTemplate(seedPrograms, seedSkills, 3);
    expect(result).toEqual(expected);
  });

  it('neither scheduleGridSessions nor scheduleDayIndices present -> equals a direct buildDefaultTemplate call', () => {
    const result = rehydrateScheduleGrid({
      seedPrograms,
      seedSkills,
      frequency: 4,
    });
    const expected = buildDefaultTemplate(seedPrograms, seedSkills, 4);
    expect(result).toEqual(expected);
  });

  it('a scheduleGridSessions entry with skillIds: [] produces isRestDay: true, sessions: []', () => {
    const scheduleGridSessions = Array.from({ length: 7 }, (_, dow) => ({ dayOfWeek: dow, skillIds: [] as string[] }));
    const result = rehydrateScheduleGrid({
      scheduleGridSessions,
      seedPrograms,
      seedSkills,
      frequency: 0,
    });
    expect(result.every((d) => d.isRestDay === true && d.sessions.length === 0)).toBe(true);
  });
});
