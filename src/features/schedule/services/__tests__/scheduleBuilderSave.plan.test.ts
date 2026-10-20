import { describe, it, expect } from 'vitest';
import { longRunDayOf, planScheduleSave } from '../scheduleBuilderSave.plan';
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
      scheduleDaysSource: 'user-chosen',
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
  it('ships default ON (owner, #441 a6c3fba2)', () => {
    expect(SCHEDULE_BUILDER_SAVE_V1).toBe(true);
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

  // ── Second track (a strength user who just added running): running.scheduleDays is the
  // system's smart default; approving the drawer is the user's first real choice. ──
  function strengthUserAddedRunning(): WeaverInputProfile {
    const p = hybrid();
    p.running = { ...p.running!, scheduleDaysSource: 'system-default' };
    return p;
  }

  it('second track, from_now: unconfirmed running days are saved even when the letters do not change', () => {
    const profile = strengthUserAddedRunning();
    const advice = advise(profile);
    const plan = planScheduleSave({ profile, week: advice.week, controls: advice.controls, scope: 'from_now', todayKey: THU });
    const proposedRuns = advice.week.running.filter((d) => d.category !== null).length;
    expect(plan.runningScheduleDays).not.toBeNull();
    expect(plan.runningScheduleDays!.length).toBe(proposedRuns);
    expect(plan.runningFrequency).toBe(proposedRuns);
    expect(plan.runningSkipped).toBeNull();
    // Strength is saved in the same plan (one approval writes both halves).
    const strengthIds = Object.values(plan.recurringTemplate!).flat().filter((id) => ['push', 'pull', 'legs'].includes(id));
    expect(strengthIds.sort()).toEqual(['legs', 'pull', 'push']);
    // lifestyle.scheduleDays = strength ∪ running.
    for (const l of plan.runningScheduleDays!) expect(plan.lifestyleScheduleDays).toContain(l);
  });

  it('second track, missing scheduleDaysSource (a pre-field runner) counts as unconfirmed too', () => {
    const profile = hybrid();
    delete (profile.running as { scheduleDaysSource?: unknown }).scheduleDaysSource;
    const advice = advise(profile);
    const plan = planScheduleSave({ profile, week: advice.week, controls: advice.controls, scope: 'from_now', todayKey: THU });
    expect(plan.runningScheduleDays).not.toBeNull();
  });

  it('second track, this_week: runs are still never written in this scope', () => {
    const profile = strengthUserAddedRunning();
    const advice = advise(profile);
    const plan = planScheduleSave({ profile, week: advice.week, controls: advice.controls, scope: 'this_week', todayKey: THU });
    expect(plan.runningScheduleDays).toBeNull();
    expect(plan.runningFrequency).toBeNull();
  });

  it('the strength tab never writes running, confirmed or not', () => {
    const profile = strengthUserAddedRunning();
    const advice = adviseWeek({ todayKey: THU, profile, workouts: [], scheduleDays: null, controls: { mode: 'strength', availableDayCount: 3, focus: 50 } })!;
    const plan = planScheduleSave({ profile, week: advice.week, controls: advice.controls, scope: 'from_now', todayKey: THU });
    expect(plan.runningScheduleDays).toBeNull();
  });

  it('a runner who added strength (no strength id in the template yet) gets strength days from the active programs', () => {
    const profile = hybrid();
    profile.lifestyle = { ...profile.lifestyle, recurringTemplate: { ב: ['run_plan_10k'], ד: ['run_plan_10k'], ש: ['run_plan_10k'] }, scheduleDays: ['ב', 'ד', 'ש'] };
    // Legacy (option omitted): the template's 0 strength days → an all-rest strength week.
    expect(advise(profile).week.strength.every((d) => d.sessions.length === 0)).toBe(true);
    // The drawer (SCHEDULE_BUILDER_SAVE_V1) proposes the WHO minimum instead.
    const advice = adviseWeek({ todayKey: THU, profile, workouts: [], scheduleDays: null, unarrangedStrengthDays: 2, controls: { mode: 'mixed', availableDayCount: 5, focus: 50 } })!;
    expect(advice.week.strength.filter((d) => d.sessions.length > 0).length).toBe(2);
    const plan = planScheduleSave({ profile, week: advice.week, controls: advice.controls, scope: 'from_now', todayKey: THU });
    const strengthDays = Object.values(plan.recurringTemplate!).filter((ids) => ids.includes('push'));
    expect(strengthDays.length).toBe(2);
    // The running ids stay on the running days.
    for (const l of ['ב', 'ד', 'ש']) expect(plan.recurringTemplate![l] ?? []).toContain('run_plan_10k');
  });
});

describe('schedule builder save plan — the long-run day (enable_home_v2)', () => {
  const saved = (runsByType: boolean) => {
    const profile = { ...hybrid(), running: { ...hybrid().running!, scheduleDaysSource: undefined } } as WeaverInputProfile;
    const advice = advise(profile);
    return { advice, plan: planScheduleSave({ profile, week: advice.week, controls: advice.controls, scope: 'from_now', todayKey: THU, runsByType }) };
  };

  it('runsByType + running days saved → the week\'s long-run day', () => {
    const { advice, plan } = saved(true);
    expect(plan.runningScheduleDays).not.toBeNull();
    expect(plan.runningLongRunDay).toBe(longRunDayOf(advice.week.running));
    expect(plan.runningLongRunDay).not.toBeNull();
  });

  it('flag off → null (nothing written)', () => {
    expect(saved(false).plan.runningLongRunDay).toBeNull();
  });

  it('running days not saved → null', () => {
    const profile = hybrid();
    const advice = advise(profile);
    const plan = planScheduleSave({ profile, week: advice.week, controls: advice.controls, scope: 'from_now', todayKey: THU, runsByType: true });
    expect(plan.runningScheduleDays).toBeNull();
    expect(plan.runningLongRunDay).toBeNull();
  });

  it('longRunDayOf: the long run\'s day, null without one', () => {
    expect(longRunDayOf([{ dayOfWeek: 2, category: 'tempo' }, { dayOfWeek: 6, category: 'long_run' }])).toBe(6);
    expect(longRunDayOf([{ dayOfWeek: 2, category: 'tempo' }])).toBeNull();
  });
});
