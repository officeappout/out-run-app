import { describe, expect, it } from 'vitest';
import { defaultRunSlots, existingRunDays, existingStrengthDays, knownTimes } from '../addTrackProfile';

describe('add track · the existing week from the profile', () => {
  it('strength days come from the template; running ids are not strength', () => {
    const days = existingStrengthDays({
      lifestyle: { recurringTemplate: { א: ['push'], ג: ['run-tpl'], ה: ['LOWER_BODY', 'run-tpl'] } },
    });
    expect(days).toEqual([
      { dow: 0, slug: 'push', ids: ['push'] },
      { dow: 4, slug: 'lower_body', ids: ['LOWER_BODY'] },
    ]);
  });

  it('no strength id in the template → scheduleDays minus run days, with the active program', () => {
    const profile = {
      lifestyle: { recurringTemplate: { ב: ['run-tpl'] }, scheduleDays: ['א', 'ב', 'ד'] },
      running: { scheduleDays: ['ב'] },
      progression: { activePrograms: [{ id: 'full_body' }] },
    };
    expect(existingStrengthDays(profile).map((d) => [d.dow, d.slug, d.ids])).toEqual([
      [0, 'full_body', ['full_body']],
      [3, 'full_body', ['full_body']],
    ]);
    // A runner adding strength: template only (their scheduleDays are run days).
    expect(existingStrengthDays(profile, undefined, false)).toEqual([]);
  });

  it('run days: the plan’s current week, slot by slot', () => {
    const start = new Date(2026, 9, 18); // a Sunday
    const runs = existingRunDays(
      {
        running: {
          isUnlocked: true,
          scheduleDays: ['א', 'ג', 'ו'],
          activeProgram: {
            startDate: start,
            schedule: [
              { week: 1, day: 1, category: 'short_intervals', slotType: 'quality_primary' },
              { week: 1, day: 2, category: 'easy_run' },
              { week: 1, day: 3, category: 'long_run' },
            ],
          },
        },
      },
      new Date(2026, 9, 20),
    );
    expect(runs).toEqual([
      { dow: 0, slot: 'quality_primary' },
      { dow: 2, slot: 'easy_run' },
      { dow: 5, slot: 'long_run' },
    ]);
  });

  it('no plan week yet → the stored run days with the usual slot mix', () => {
    const runs = existingRunDays({ running: { isUnlocked: true, scheduleDays: ['א', 'ג', 'ו'] } }, new Date(2026, 9, 20));
    expect(runs.map((r) => r.dow)).toEqual([0, 2, 5]);
    expect(runs.find((r) => r.dow === 5)?.slot).toBe('long_run');
    expect(defaultRunSlots(2)).toEqual(['quality_primary', 'long_run']);
  });

  it('not a runner → no run days', () => {
    expect(existingRunDays({ running: { scheduleDays: ['א'] } }, new Date())).toEqual([]);
  });

  it('times the user already gave; each falls back to the other, then 07:00', () => {
    expect(knownTimes({ lifestyle: { trainingTime: '18:30', reminders: { runningTime: '06:30' } } })).toEqual({ run: '06:30', strength: '18:30' });
    expect(knownTimes({ lifestyle: { trainingTime: '18:30' } })).toEqual({ run: '18:30', strength: '18:30' });
    expect(knownTimes(null)).toEqual({ run: '07:00', strength: '07:00' });
  });
});
