import { describe, expect, it } from 'vitest';
import { WALK_PLAN_CONFIG } from '../walkPlan.config';
import {
  activityLevelFromStepGoal,
  buildWalkWeek,
  distanceForMinutes,
  longWalkDay,
  pickWalkDays,
  recommendWalkPlan,
  stepGapWalk,
  targetWeeklyMinutes,
  walkFrequency,
  walkTargetLabelHe,
  weeklyMinutesRamp,
} from '../walkPlan';
import type { WalkPlanInput } from '../walkPlan.types';

const base: WalkPlanInput = {
  goal: 'health',
  comfort: 'medium',
  stepGoal: 8000,
  availableDays: [0, 1, 2, 3, 4, 5],
  audience: 'general',
};

describe('activity level from the adaptive step goal', () => {
  it('maps the goal back to the median and bands it', () => {
    expect(activityLevelFromStepGoal(4400)).toBe('sedentary'); // median 4,000
    expect(activityLevelFromStepGoal(6600)).toBe('low'); // 6,000
    expect(activityLevelFromStepGoal(9900)).toBe('moderate'); // 9,000
    expect(activityLevelFromStepGoal(12000)).toBe('active'); // ~10,900
  });
  it('no step data → low', () => {
    expect(activityLevelFromStepGoal(null)).toBe('low');
    expect(activityLevelFromStepGoal(0)).toBe('low');
  });
});

describe('WHO target', () => {
  it('stays inside 150–300 per goal', () => {
    for (const g of ['weight_loss', 'health', 'steps', 'belly'] as const) {
      const t = targetWeeklyMinutes(g, 'general');
      expect(t).toBeGreaterThanOrEqual(150);
      expect(t).toBeLessThanOrEqual(300);
    }
    expect(targetWeeklyMinutes('weight_loss', 'general')).toBeGreaterThan(targetWeeklyMinutes('health', 'general'));
  });
  it('older adults: the WHO minimum', () => {
    expect(targetWeeklyMinutes('weight_loss', 'senior')).toBe(150);
  });
});

describe('weekly ramp', () => {
  it('never grows more than 10% a week and never passes the target', () => {
    const r = weeklyMinutesRamp(60, 150, 30, 0.1);
    expect(r[0]).toBe(60);
    for (let i = 1; i < r.length; i++) {
      expect(r[i]).toBeGreaterThanOrEqual(r[i - 1]);
      expect(r[i]).toBeLessThanOrEqual(r[i - 1] * 1.1 + 1e-9);
      expect(r[i]).toBeLessThanOrEqual(150);
    }
    expect(r[r.length - 1]).toBe(150);
  });
  it('a start above the target is the target', () => {
    expect(weeklyMinutesRamp(200, 150, 3, 0.1)).toEqual([150, 150, 150]);
  });
});

describe('frequency and days', () => {
  it('3–5 walks, never more than the free days', () => {
    expect(walkFrequency(60, 30, 6)).toBe(3);
    expect(walkFrequency(200, 30, 6)).toBe(5);
    expect(walkFrequency(200, 30, 2)).toBe(2);
  });
  it('spreads the days', () => {
    expect(pickWalkDays(3, [0, 1, 2, 3, 4, 5])).toEqual([0, 2, 4]);
    expect(pickWalkDays(4, [0, 1, 2, 3, 4, 5])).toEqual([0, 1, 3, 4]);
    expect(pickWalkDays(5, [1, 3])).toEqual([1, 3]);
  });
  it('the long walk: Friday when chosen, else the last day', () => {
    expect(longWalkDay([0, 2, 5])).toBe(5);
    expect(longWalkDay([0, 1, 3, 4])).toBe(4);
    expect(longWalkDay([3])).toBeNull();
  });
});

describe('one week', () => {
  it('every walk 20–45′, one longer walk (distance), the rest timed', () => {
    const w = buildWalkWeek(0, 120, [0, 1, 3, 4], 'health');
    expect(w.walks).toHaveLength(4);
    for (const x of w.walks) {
      expect(x.minutes).toBeGreaterThanOrEqual(WALK_PLAN_CONFIG.session.min);
      expect(x.minutes).toBeLessThanOrEqual(WALK_PLAN_CONFIG.session.max);
    }
    const long = w.walks.filter((x) => x.isLong);
    expect(long).toHaveLength(1);
    expect(long[0].dow).toBe(4);
    expect(long[0].target.type).toBe('distance');
    expect(long[0].minutes).toBeGreaterThan(w.walks[0].minutes);
    expect(w.walks.filter((x) => !x.isLong).every((x) => x.target.type === 'time')).toBe(true);
  });
  it('the steps goal walks by distance', () => {
    const w = buildWalkWeek(0, 90, [0, 2, 4], 'steps');
    expect(w.walks.every((x) => x.target.type === 'distance')).toBe(true);
  });
  it('steps estimate ≈ 110 a minute', () => {
    const w = buildWalkWeek(0, 90, [0, 2, 4], 'health');
    expect(w.walks[0].estSteps).toBe(Math.round((w.walks[0].minutes * 110) / 100) * 100);
  });
  it('distance rounds to half a km, at least 1 km', () => {
    expect(distanceForMinutes(30)).toBe(2.5);
    expect(distanceForMinutes(5)).toBe(1);
  });
});

describe('recommendWalkPlan', () => {
  it('a sedentary beginner: short walks, gentle start, ramps up', () => {
    const p = recommendWalkPlan({ ...base, stepGoal: 4400, comfort: 'short' });
    expect(p.level).toBe('sedentary');
    expect(p.frequency).toBe(4);
    expect(p.days).toEqual([0, 1, 3, 4]);
    expect(p.weeks[0].walks.every((w) => w.minutes <= 30)).toBe(true);
    expect(p.weeks).toHaveLength(WALK_PLAN_CONFIG.horizonWeeks);
    expect(p.weeks[0].totalMinutes).toBeLessThan(p.targetWeeklyMinutes);
    for (let i = 1; i < p.weeks.length; i++) expect(p.weeks[i].totalMinutes).toBeGreaterThanOrEqual(p.weeks[i - 1].totalMinutes);
  });
  it('an active user losing weight: more walks', () => {
    const p = recommendWalkPlan({ ...base, goal: 'weight_loss', stepGoal: 12000 });
    expect(p.level).toBe('active');
    expect(p.frequency).toBeGreaterThanOrEqual(4);
    expect(p.days.includes(6)).toBe(false); // Saturday off by default
  });
  it('the user\'s own days win', () => {
    const p = recommendWalkPlan(base, WALK_PLAN_CONFIG, [1, 3, 6]);
    expect(p.days).toEqual([1, 3, 6]);
    expect(p.weeks[0].walks.map((w) => w.dow)).toEqual([1, 3, 6]);
  });
  it('older adults get the balance note', () => {
    const p = recommendWalkPlan({ ...base, audience: 'senior' });
    expect(p.reasonsHe.some((r) => r.includes('שיווי משקל'))).toBe(true);
  });
  it('no free days → the default Sun–Fri pool', () => {
    expect(recommendWalkPlan({ ...base, availableDays: [] }).days.every((d) => d <= 5)).toBe(true);
  });
});

describe('closing the step gap', () => {
  it('suggests a short walk for the missing steps', () => {
    expect(stepGapWalk(5600, 8000)).toEqual({ missingSteps: 2400, minutes: 25 });
    expect(stepGapWalk(7900, 8000)).toEqual({ missingSteps: 100, minutes: 10 });
    expect(stepGapWalk(1000, 12000)?.minutes).toBe(30);
  });
  it('goal met / unknown → nothing', () => {
    expect(stepGapWalk(9000, 8000)).toBeNull();
    expect(stepGapWalk(100, null)).toBeNull();
  });
});

describe('labels', () => {
  it('time / distance', () => {
    expect(walkTargetLabelHe({ type: 'time', minutes: 30 })).toBe('30 דק׳');
    expect(walkTargetLabelHe({ type: 'distance', km: 2.5 })).toBe('2.5 ק״מ');
  });
});

describe('one long walk up to 60′ (owner 20.10.2026)', () => {
  it('3 walks reach the WHO 150′: 45 + 45 + 60', () => {
    const w = buildWalkWeek(0, 150, [0, 2, 5], 'health');
    expect(w.totalMinutes).toBe(150);
    const long = w.walks.filter((x) => x.isLong);
    expect(long).toHaveLength(1);
    expect(long[0].minutes).toBe(WALK_PLAN_CONFIG.longWalkMax);
    for (const x of w.walks.filter((x) => !x.isLong)) expect(x.minutes).toBeLessThanOrEqual(WALK_PLAN_CONFIG.session.max);
  });

  it('a higher target with 3 walks: the long walk never passes 60′, the others never 45′', () => {
    const w = buildWalkWeek(0, 250, [0, 2, 5], 'weight_loss');
    expect(Math.max(...w.walks.map((x) => x.minutes))).toBe(60);
    expect(w.walks.filter((x) => x.minutes > WALK_PLAN_CONFIG.session.max)).toHaveLength(1);
    expect(w.totalMinutes).toBe(150);
  });

  it('the long walk takes the rounding remainder (4 walks, 150′ → still 150′)', () => {
    const w = buildWalkWeek(0, 150, [0, 1, 3, 5], 'health');
    expect(w.totalMinutes).toBe(150);
    expect(w.walks.find((x) => x.isLong)!.minutes).toBeLessThanOrEqual(60);
  });

  it('small weeks are unchanged', () => {
    const w = buildWalkWeek(0, 60, [0, 2, 4], 'health');
    for (const x of w.walks) expect(x.minutes).toBeLessThanOrEqual(WALK_PLAN_CONFIG.session.max);
  });
});
