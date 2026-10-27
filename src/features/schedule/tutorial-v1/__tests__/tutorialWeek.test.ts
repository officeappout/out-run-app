import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, app: {} }));

import type { PrioritizedSkill } from '@/features/schedule/types/smartSchedule.types';
import { buildStrengthScheduleWrite } from '@/features/schedule/utils/strengthWeekRecommendation';
import { initialDays, toggleDay } from '../model/days';
import { buildTutorialWeek, programLabels, MOVEMENT_DAY_EXTRA_STEPS, type TutorialWeekInput } from '../model/tutorialWeek';
import { runSlotsFor } from '../model/profileInputs';

const skill = (id: PrioritizedSkill['id'], priority: number): PrioritizedSkill => ({
  id, priority, movementType: id === 'FRONT_LEVER' ? 'PULL' : 'PUSH', isFreeSlot: false, minRestHours: 48, countsTowardCap: true,
});

const base = (over: Partial<TutorialWeekInput> = {}): TutorialWeekInput => ({
  seed: { programs: ['FULL_BODY'], skills: [] },
  levels: { push: 3, pull: 3, legs: 3 },
  engineLevel: 'beginner',
  days: initialDays([0, 1, 2, 3, 4], 'evening'),
  minutes: 30,
  running: null,
  twoPerDay: false,
  longRunDay: null,
  stepsGoal: 8000,
  ...over,
});

describe('buildTutorialWeek', () => {
  it('beginner, 5 free days: 3 full-body days (push / pull / legs emphasis) + 2 movement days', () => {
    const w = buildTutorialWeek(base());
    expect(w.complex).toBe(false);
    expect(w.strengthCount).toBe(3);
    expect(w.movementCount).toBe(2);
    const labels = w.days.flatMap((d) => (d.strength ? [d.strength.label] : []));
    expect(labels).toEqual([
      { kind: 'full_body', emphasis: 'push' },
      { kind: 'full_body', emphasis: 'pull' },
      { kind: 'full_body', emphasis: 'legs' },
    ]);
    expect(w.minutes.strength).toBe(90);
    expect(w.chips).toEqual([
      { type: 'group', group: 'push', count: 3 },
      { type: 'group', group: 'pull', count: 3 },
      { type: 'group', group: 'legs', count: 3 },
      { type: 'group', group: 'core', count: 3 },
    ]);
    // Every day has a steps goal; rest days have no optional session without running.
    for (const d of w.days) expect(d.stepsGoal).toBeGreaterThanOrEqual(8000);
    expect(w.days.filter((d) => !d.free).every((d) => d.optional.length === 0)).toBe(true);
    // Movement days carry an optional short session; a walking one raises the steps goal.
    for (const d of w.days.filter((x) => x.movement)) {
      expect(d.optional.length).toBe(1);
      if (d.movement === 'walk') expect(d.stepsGoal).toBe(8000 + MOVEMENT_DAY_EXTRA_STEPS);
    }
  });

  it('the saved week is the existing step write shape (strength days only, chosen windows)', () => {
    const w = buildTutorialWeek(base());
    const write = buildStrengthScheduleWrite({ week: w.strengthWeek });
    expect(write.trainingDays).toBe(3);
    expect(write.scheduleDayIndices).toEqual(w.days.filter((d) => d.strength).map((d) => d.dow).sort((a, b) => a - b));
    expect(write.trainingTime).toBe('19:00');
  });

  it('no free day = an empty, all-rest week', () => {
    const w = buildTutorialWeek(base({ days: {} }));
    expect(w.strengthCount).toBe(0);
    expect(w.days).toHaveLength(7);
    expect(w.days.every((d) => !d.free && d.optional.length === 0)).toBe(true);
  });

  it('display order follows `order`', () => {
    const w = buildTutorialWeek(base({ order: [2, 3, 4, 5, 6, 0, 1] }));
    expect(w.days.map((d) => d.dow)).toEqual([2, 3, 4, 5, 6, 0, 1]);
  });

  it('skills + runs: complex, skill days are push / pull with a focus, never skill-only; runs placed', () => {
    const w = buildTutorialWeek(base({
      seed: { programs: ['FULL_BODY'], skills: [skill('PLANCHE', 1), skill('FRONT_LEVER', 2)] },
      levels: { push: 16, pull: 15, legs: 12 },
      engineLevel: 'intermediate',
      days: toggleDay(initialDays([0, 1, 2, 3], 'morning'), 4, 'morning'),
      minutes: 45,
      running: { slots: runSlotsFor(3), level: 'intermediate' },
      twoPerDay: true,
      longRunDay: 4,
    }));
    expect(w.complex).toBe(true);
    expect(w.runCount).toBeGreaterThan(0);
    for (const d of w.days) {
      if (d.strength?.label.kind === 'skill') {
        expect(['push', 'pull']).toContain(d.strength.label.family);
        expect(d.strength.skillLed).toBe(true);
      }
      if (d.strength && d.runs.length) expect(d.strength.afterRun).toBe(true);
    }
    expect(w.chips.at(-1)).toEqual({ type: 'run', count: w.runCount });
    expect(w.minutes.run).toBeGreaterThan(0);
    expect(programLabels(w).every((l) => l.kind === 'skill' || l.kind !== 'full_body')).toBe(true);
    // Rest days of a runner get an optional mobility session.
    for (const d of w.days.filter((x) => !x.free)) expect(d.optional.map((o) => o.kind)).toEqual(['mobility']);
  });
});
