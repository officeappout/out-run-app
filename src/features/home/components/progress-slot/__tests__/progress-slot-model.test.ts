/**
 * Home progress slot (enable_home_progress_slot_v1) — pure decisions + the shared
 * steps/walking orange token + the flag definition.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase', () => ({ db: {}, auth: { currentUser: null }, app: {}, storage: {} }));

import {
  PROGRESS_RUN_HREF,
  PROGRESS_STRENGTH_HREF,
  planPercent,
  resolvePlanSlide,
  strengthCardHref,
  walkPercent,
} from '@/features/home/utils/progress-slot';
import { pageFromScroll } from '@/components/ui/v2/paged-carousel';
import { STEPS_WALK_COLORS, TRACK_COLORS } from '@/components/ui/v2/track-colors';
import { FLAG_DEFS } from '@/hooks/feature-flag-defs';

const runPlan = {
  activeProgram: {
    currentWeek: 3,
    schedule: [
      { week: 1, status: 'completed' },
      { week: 1, status: 'completed' },
      { week: 2, status: 'completed' },
      { week: 2, status: 'pending' },
      { week: 3, status: 'pending' },
      { week: 8, status: 'pending' },
    ],
  },
  generatedProgramTemplate: { targetDistance: '5k', canonicalWeeks: 8 },
};
const walkingGoal = { goal: 'health', targetWeeklyMinutes: 150 };

describe('resolvePlanSlide', () => {
  it('a running plan wins, with its week and plan %', () => {
    const s = resolvePlanSlide({ running: runPlan, lifestyle: { walkingGoal } });
    expect(s?.kind).toBe('run');
    if (s?.kind !== 'run') return;
    expect(s.plan.currentWeek).toBe(3);
    expect(s.plan.weeks).toBe(8);
    expect(s.pct).toBe(50); // 3 of 6 sessions
  });
  it('no running plan + a stored walking goal → the walking variant', () => {
    expect(resolvePlanSlide({ running: null, lifestyle: { walkingGoal } })).toEqual({ kind: 'walk', targetWeeklyMinutes: 150 });
  });
  it('neither → null (the strength card alone, no empty slide)', () => {
    expect(resolvePlanSlide({ running: { activeProgram: { schedule: [] } }, lifestyle: {} })).toBeNull();
    expect(resolvePlanSlide({ lifestyle: { walkingGoal: { goal: 'junk', targetWeeklyMinutes: 0 } } })).toBeNull();
    expect(resolvePlanSlide(null)).toBeNull();
  });
});

describe('percents', () => {
  it('plan % = completed / all sessions, clamped', () => {
    expect(planPercent({ done: 7, total: 24 })).toBe(29);
    expect(planPercent({ done: 0, total: 0 })).toBe(0);
    expect(planPercent({ done: 30, total: 24 })).toBe(100);
  });
  it('walk % = this week minutes / weekly target', () => {
    expect(walkPercent(75, 150)).toBe(50);
    expect(walkPercent(400, 150)).toBe(100);
    expect(walkPercent(10, 0)).toBe(0);
  });
});

describe('card destinations', () => {
  it('strength → its progression map when it has one, else the hub strength page', () => {
    expect(strengthCardHref('mFcuYlNgKXLqWVUFo0zt')).toBe('/progression-map/mFcuYlNgKXLqWVUFo0zt');
    expect(strengthCardHref('full_body')).toBe(PROGRESS_STRENGTH_HREF);
    expect(strengthCardHref(null)).toBe(PROGRESS_STRENGTH_HREF);
  });
  it('running deeper page', () => {
    expect(PROGRESS_RUN_HREF).toBe('/progress/run');
  });
});

describe('pageFromScroll', () => {
  it('reads the magnitude (RTL scrollLeft is negative)', () => {
    expect(pageFromScroll(0, 230, 2)).toBe(0);
    expect(pageFromScroll(-230, 230, 2)).toBe(1);
    expect(pageFromScroll(-140, 230, 2)).toBe(1);
    expect(pageFromScroll(-90, 230, 2)).toBe(0);
    expect(pageFromScroll(230, 230, 2)).toBe(1);
    expect(pageFromScroll(-999, 230, 2)).toBe(1);
    expect(pageFromScroll(-230, 0, 2)).toBe(0);
  });
});

describe('colour tokens', () => {
  it('steps + walking share one orange; running stays green; flag-off amber untouched', () => {
    expect(STEPS_WALK_COLORS).toEqual({ fill: '#f97316', text: '#c2410c', rgb: '249,115,22' });
    expect(TRACK_COLORS.run).toBe('#84cc16');
    expect(TRACK_COLORS.walk).toBe('#f59e0b');
  });
});

describe('flag', () => {
  it('enable_home_progress_slot_v1: off by default, super admins preview', () => {
    const def = FLAG_DEFS.find((d) => d.firestoreKey === 'enable_home_progress_slot_v1');
    expect(def).toMatchObject({ key: 'enableHomeProgressSlotV1', defaultValue: false, superAdminValue: true });
  });
});
