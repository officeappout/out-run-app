import { describe, expect, it } from 'vitest';
import { resolveStripSchedule, type StripScheduleInput } from '../strip-schedule';

const base: StripScheduleInput = {
  lifestyleScheduleDays: ['א', 'ג', 'ה'],
  runningScheduleDays: ['ב', 'ד'],
  dashboardMode: 'PERFORMANCE',
  v2: false,
  hasStrengthProgram: true,
  hasRunningPlan: true,
  primaryTrack: 'strength',
  todayIndex: 2,
};

describe('resolveStripSchedule', () => {
  it('flag off: the strength days, no overlay, no run-only strip (home as before)', () => {
    const s = resolveStripSchedule(base);
    expect(s.isRunningMode).toBe(false);
    expect(s.userScheduleDays).toEqual(['א', 'ג', 'ה']);
    expect(s.hasSchedule).toBe(true);
    expect(s.runStripOnly).toBe(false);
    expect(s.runOverlayDays).toBeUndefined();
    expect(s.currentTrack).toBe('wellness');
    expect(s.scheduleDays).toEqual(['א', 'ג', 'ה']);
    expect(s.schedule.map((d) => d.status)).toEqual(['scheduled', 'rest', 'today', 'rest', 'scheduled', 'rest', 'rest']);
    expect(s.schedule[0]).toEqual({ day: 'א', date: 1, status: 'scheduled' });
  });

  it('running mode uses the running days', () => {
    const s = resolveStripSchedule({ ...base, dashboardMode: 'HYBRID' });
    expect(s.isRunningMode).toBe(true);
    expect(s.userScheduleDays).toEqual(['ב', 'ד']);
    expect(s.currentTrack).toBe('running');
  });

  it('v2 dual-track outside running mode overlays the run days', () => {
    const s = resolveStripSchedule({ ...base, v2: true });
    expect(s.runOverlayDays).toEqual(['ב', 'ד']);
    expect(s.runStripOnly).toBe(false);
  });

  it('v2 running-only user gets the run strip', () => {
    const s = resolveStripSchedule({ ...base, v2: true, hasStrengthProgram: false, lifestyleScheduleDays: [] });
    expect(s.runStripOnly).toBe(true);
    expect(s.currentTrack).toBe('running');
    expect(s.scheduleDays).toEqual(['ב', 'ד']);
    expect(s.runOverlayDays).toBeUndefined();
  });

  it('performance primary track keeps its track label', () => {
    expect(resolveStripSchedule({ ...base, primaryTrack: 'performance' }).currentTrack).toBe('performance');
  });
});
