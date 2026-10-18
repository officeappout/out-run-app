import { describe, it, expect } from 'vitest';
import { planScheduleSave } from '../scheduleBuilderSave.plan';
import { adviseWeek } from '../../advisor';
import type { WeaverInputProfile } from '../../engine/weaverInput';
import { SCHEDULE_BUILDER_SAVE_V1 } from '@/config/feature-flags';

const THU = '2026-10-15';

function hybrid(): WeaverInputProfile {
  return {
    progression: { domains: { push: { currentLevel: 3 } }, activePrograms: [{ templateId: 'push' }] },
    lifestyle: {
      // legs on Friday, the day before the Saturday long run → the advisor moves it.
      recurringTemplate: { א: ['push'], ג: ['pull'], ו: ['legs'], ב: ['run_plan_10k'], ד: ['run_plan_10k'], ש: ['run_plan_10k'] },
      scheduleDays: ['א', 'ב', 'ג', 'ד', 'ו', 'ש'],
    },
    running: {
      isUnlocked: true,
      scheduleDays: ['ב', 'ד', 'ש'],
      activeProgram: {
        startDate: '2026-10-11T00:00:00',
        programId: 'run_plan_10k',
        schedule: [
          { week: 1, day: 1, category: 'tempo', slotType: 'quality_primary' },
          { week: 1, day: 2, category: 'easy_run', slotType: 'easy_run' },
          { week: 1, day: 3, category: 'long_run', slotType: 'long_run' },
        ],
      },
    },
  };
}

function advise(profile: WeaverInputProfile) {
  return adviseWeek({ todayKey: THU, profile, workouts: [], scheduleDays: null, controls: { mode: 'mixed', availableDayCount: 6, focus: 50 } })!;
}

describe('schedule builder save plan (SCHEDULE_BUILDER_SAVE_V1)', () => {
  it('ships default OFF', () => {
    expect(SCHEDULE_BUILDER_SAVE_V1).toBe(false);
  });

  it('from_now: the user\'s own ids move with their content (legs stays legs), running ids are kept', () => {
    const profile = hybrid();
    const advice = advise(profile);
    const plan = planScheduleSave({ profile, week: advice.week, controls: advice.controls, scope: 'from_now', todayKey: THU });
    const t = plan.recurringTemplate!;
    const strengthDays = Object.entries(t).filter(([, ids]) => ids.some((id) => ['push', 'pull', 'legs'].includes(id)));
    expect(strengthDays.map(([, ids]) => ids.filter((x) => x !== 'run_plan_10k')).flat().sort()).toEqual(['legs', 'pull', 'push']);
    // legs is no longer on Friday (the day before the long run).
    expect(t['ו'] ?? []).not.toContain('legs');
    // Running ids untouched on the running days.
    for (const l of ['ב', 'ד', 'ש']) expect(t[l]).toContain('run_plan_10k');
    expect(plan.runningScheduleDays).toBeNull(); // running kept its days → no running write
    expect(plan.lifestyleScheduleDays!.length).toBe(6);
    expect(plan.prefs).toEqual({ availableDayCount: 6, focus: 50 });
  });

  it('this_week: only today → Saturday, strength overrides only; a moved run is reported, not written', () => {
    const profile = hybrid();
    const advice = advise(profile);
    const plan = planScheduleSave({ profile, week: advice.week, controls: advice.controls, scope: 'this_week', todayKey: THU });
    expect(plan.recurringTemplate).toBeNull();
    expect(plan.dayOverrides.every((o) => o.date >= THU && o.date <= '2026-10-17')).toBe(true);
    // Friday loses legs (rest override), Thursday gains it.
    expect(plan.dayOverrides).toContainEqual({ date: '2026-10-16', strengthProgramIds: null });
    expect(plan.dayOverrides).toContainEqual({ date: '2026-10-15', strengthProgramIds: ['legs'] });
  });

  it('the running tab never wipes strength from the template', () => {
    const profile = hybrid();
    const advice = adviseWeek({ todayKey: THU, profile, workouts: [], scheduleDays: null, controls: { mode: 'running', availableDayCount: 3, focus: 70 } })!;
    const plan = planScheduleSave({ profile, week: advice.week, controls: advice.controls, scope: 'from_now', todayKey: THU });
    expect(plan.recurringTemplate!['א']).toContain('push');
    expect(plan.recurringTemplate!['ו']).toContain('legs');
  });
});
