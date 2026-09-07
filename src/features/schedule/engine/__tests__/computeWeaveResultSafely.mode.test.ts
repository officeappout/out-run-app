import { describe, it, expect } from 'vitest';
import { computeWeaveResultSafely } from '../computeWeaveResultSafely';
import type { WeaverInputProfile } from '../weaverInput';

/**
 * Real integration tests — nothing mocked here, unlike
 * computeWeaveResultSafely.test.ts (which is narrowly about the crash-
 * protection contract and mocks buildWeaverInput/weaveWeek on purpose to
 * guarantee a deterministic throw). This file proves the actual mode
 * behavior end to end: buildWeaverInput's domain-zeroing, weaveWeek's real
 * search succeeding through the normal path (not the total-failure
 * fallback), and the coach-note injection — using the real modules.
 */

const ASOF = new Date('2026-09-10T00:00:00Z');
const START_DATE = new Date('2026-09-06T00:00:00Z');

function dualOwningProfile(): WeaverInputProfile {
  return {
    progression: {
      domains: { PLANCHE: { currentLevel: 3 } },
      activePrograms: [{ name: 'Upper Body', templateId: 'upper_body' }],
    },
    lifestyle: { recurringTemplate: { א: ['PLANCHE'], ג: ['PLANCHE'], ה: ['PLANCHE'] } },
    running: {
      isUnlocked: true,
      scheduleDays: ['ב', 'ד'],
      activeProgram: {
        startDate: START_DATE,
        schedule: [
          { week: 1, day: 1, category: 'tempo', isQualityWorkout: true, slotType: 'quality_primary' },
          { week: 1, day: 2, category: 'easy_run' },
        ],
      },
    },
  };
}

function runningOnlyProfile(): WeaverInputProfile {
  const { running } = dualOwningProfile();
  return { running };
}

function strengthOnlyProfile(): WeaverInputProfile {
  const { progression, lifestyle } = dualOwningProfile();
  return { progression, lifestyle };
}

describe('computeWeaveResultSafely — mode, real integration (no mocks)', () => {
  it('mode="running": strength is genuinely empty, running is fully built, and the result did not fall through to the total-failure fallback', () => {
    const result = computeWeaveResultSafely(dualOwningProfile(), 'running', 100, 3, ASOF);
    expect(result).not.toBeNull();
    expect(result!.week.strength.every((d) => d.sessions.length === 0)).toBe(true);
    expect(result!.week.running.filter((d) => d.category !== null).length).toBe(2);
    expect(result!.reductions).toEqual([]);
    expect(result!.notes.some((n) => n.includes('לא נמצא שילוב חוקי'))).toBe(false);
  });

  it('mode="running" adds the coach note when the user actually owns a strength track', () => {
    const result = computeWeaveResultSafely(dualOwningProfile(), 'running', 100, 3, ASOF);
    expect(result!.notes[0]).toBe('לא נבנו אימוני כוח השבוע — כי זה מה שבחרת (טאב ריצה).');
  });

  it('mode="running" adds NO coach note when the user never owned a strength track — there is nothing choice-driven to explain', () => {
    const result = computeWeaveResultSafely(runningOnlyProfile(), 'running', 100, 3, ASOF);
    expect(result).not.toBeNull();
    expect(result!.notes.some((n) => n.includes('לא נבנו אימוני כוח'))).toBe(false);
  });

  it('mode="strength": running is genuinely empty, strength is fully built, and the result did not fall through to the total-failure fallback', () => {
    const result = computeWeaveResultSafely(dualOwningProfile(), 'strength', 0, 3, ASOF);
    expect(result).not.toBeNull();
    expect(result!.week.running.every((d) => d.category === null)).toBe(true);
    expect(result!.week.strength.filter((d) => d.sessions.length > 0).length).toBeGreaterThan(0);
    expect(result!.reductions).toEqual([]);
  });

  it('mode="strength" adds the symmetric coach note when the user actually owns a running track', () => {
    const result = computeWeaveResultSafely(dualOwningProfile(), 'strength', 0, 3, ASOF);
    expect(result!.notes[0]).toBe('לא נבנו אימוני ריצה השבוע — כי זה מה שבחרת (טאב כוח).');
  });

  it('mode="strength" adds NO coach note when the user never owned a running track — there is nothing choice-driven to explain', () => {
    const result = computeWeaveResultSafely(strengthOnlyProfile(), 'strength', 0, 3, ASOF);
    expect(result).not.toBeNull();
    expect(result!.notes.some((n) => n.includes('לא נבנו אימוני ריצה'))).toBe(false);
  });

  it('mode="mixed": both domains present, no coach note ever added in this mode', () => {
    const result = computeWeaveResultSafely(dualOwningProfile(), 'mixed', 50, 5, ASOF);
    expect(result).not.toBeNull();
    expect(result!.week.strength.some((d) => d.sessions.length > 0)).toBe(true);
    expect(result!.week.running.some((d) => d.category !== null)).toBe(true);
    expect(result!.notes.some((n) => n.includes('לא נבנו אימוני כוח'))).toBe(false);
    expect(result!.notes.some((n) => n.includes('לא נבנו אימוני ריצה'))).toBe(false);
  });
});
