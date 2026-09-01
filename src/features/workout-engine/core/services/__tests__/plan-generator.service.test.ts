import { describe, it, expect } from 'vitest';
import { buildRunningPlan, resolveBuildStartDate } from '../plan-generator.service';
import { calculateCurrentWeek } from '../workout-completion.service';
import { DEFAULT_PACE_MAP_CONFIG } from '../../config/pace-map-config';
import type { RunWorkoutTemplate } from '../../types/running.types';

// buildRunningPlan's startDate/currentWeek commit (idempotent-booping-sunrise.md,
// 01.09.2026 -- second review round). Uses the REAL calculateCurrentWeek
// throughout (never a hand-duplicated copy of its formula) so a future change
// to that function's arithmetic breaks these tests instead of leaving them
// silently green (David, 01.09.2026: "אם היא תשתנה מתישהו, אני רוצה שהטסט ייפול").

const WORKOUT_TEMPLATES: RunWorkoutTemplate[] = [
  { id: 'tpl_easy_1', name: 'Easy Run', category: 'easy_run', isQualityWorkout: false, targetProfileTypes: [3], blocks: [] },
];

const BASE_INPUT = {
  goal: 'couch_to_5k' as const,
  basePace: 400,
  targetDistance: '5k' as const,
  frequency: 3 as const,
  totalWeeks: 8,
  workoutTemplates: WORKOUT_TEMPLATES,
  paceMapConfig: DEFAULT_PACE_MAP_CONFIG,
};

describe('resolveBuildStartDate', () => {
  const TODAY = new Date('2026-09-01T00:00:00.000Z');

  it('first-time build (no existingStartDate), default preservedWeek=1 -- returns asOfDate unchanged', () => {
    const result = resolveBuildStartDate(undefined, 1, TODAY);
    expect(result).toBe(TODAY.toISOString());
  });

  it('no existingStartDate but an explicit preservedWeek > 1 -- still honored, not silently dropped to week 1 (the gap the round-trip test caught)', () => {
    const result = resolveBuildStartDate(undefined, 6, TODAY);
    expect(calculateCurrentWeek(result, TODAY)).toBe(6);
  });

  it('rebuild, existingStartDate already computes to preservedWeek -- returned UNCHANGED, no formula applied', () => {
    // A start date exactly 5 weeks + 3 days ago is mid-week-6 -- calculateCurrentWeek
    // should already return 6 for it as-of TODAY.
    const midWeek6Start = new Date(TODAY.getTime() - (5 * 7 + 3) * 24 * 60 * 60 * 1000);
    const week = calculateCurrentWeek(midWeek6Start, TODAY);
    expect(week).toBe(6);
    const result = resolveBuildStartDate(midWeek6Start.toISOString(), 6, TODAY);
    expect(result).toBe(midWeek6Start.toISOString());
  });

  it('rebuild, preservedWeek diverges from what existingStartDate computes -- ONLY THEN a new date is computed via the formula', () => {
    const startDateForWeek3 = new Date(TODAY.getTime() - 2 * 7 * 24 * 60 * 60 * 1000);
    expect(calculateCurrentWeek(startDateForWeek3, TODAY)).toBe(3);
    // 1b says preservedWeek=6, but the existing startDate only computes to week 3 --
    // divergence triggers the exceptional formula path.
    const result = resolveBuildStartDate(startDateForWeek3.toISOString(), 6, TODAY);
    expect(result).not.toBe(startDateForWeek3.toISOString());
    expect(calculateCurrentWeek(result, TODAY)).toBe(6);
  });
});

describe('buildRunningPlan -- startDate/currentWeek round-trip (David, 01.09.2026: promise-in-a-comment is not a promise)', () => {
  it.each([1, 2, 6, 12])(
    'first-time build (no existingStartDate): calculateCurrentWeek(result.startDate) === preservedWeek=%i',
    (n) => {
      const result = buildRunningPlan({ ...BASE_INPUT, totalWeeks: 12, preservedWeek: n, asOfDate: new Date('2026-09-01T00:00:00.000Z') });
      expect(result.activeProgram.currentWeek).toBe(n);
      expect(calculateCurrentWeek(result.activeProgram.startDate, new Date('2026-09-01T00:00:00.000Z'))).toBe(n);
    },
  );

  it.each([1, 2, 6, 12])(
    'rebuild path (existingStartDate present, diverging from preservedWeek=%i): still round-trips correctly',
    (n) => {
      const asOfDate = new Date('2026-09-01T00:00:00.000Z');
      // A deliberately-wrong existing start date (always week 1) so every case
      // except n=1 exercises the divergence/formula path, not the keep-as-is path.
      const existingStartDate = asOfDate.toISOString();
      const result = buildRunningPlan({ ...BASE_INPUT, totalWeeks: 12, preservedWeek: n, existingStartDate, asOfDate });
      expect(result.activeProgram.currentWeek).toBe(n);
      expect(calculateCurrentWeek(result.activeProgram.startDate, asOfDate)).toBe(n);
    },
  );

  it('rebuild path, existingStartDate already correct for preservedWeek: startDate is preserved unchanged end-to-end', () => {
    const asOfDate = new Date('2026-09-01T00:00:00.000Z');
    // Mid-week-6 relative to a FIXED asOfDate, not real "now" -- keeps this
    // test deterministic regardless of when it actually runs.
    const midWeek6Start = new Date(asOfDate.getTime() - (5 * 7 + 2) * 24 * 60 * 60 * 1000);
    const week = calculateCurrentWeek(midWeek6Start, asOfDate);
    const result = buildRunningPlan({
      ...BASE_INPUT,
      totalWeeks: 12,
      preservedWeek: week,
      existingStartDate: midWeek6Start.toISOString(),
      asOfDate,
    });
    expect(result.activeProgram.startDate).toBe(midWeek6Start.toISOString());
  });
});

describe('buildRunningPlan -- other invariants', () => {
  it('totalWeeks is always exactly what the caller passes -- never recomputed (David, 01.09.2026: plan length is preserved on a day-count change)', () => {
    const result = buildRunningPlan({ ...BASE_INPUT, totalWeeks: 12 });
    expect(result.template.canonicalWeeks).toBe(12);
  });

  it('canonicalFrequency on the generated template matches the requested frequency', () => {
    const result = buildRunningPlan({ ...BASE_INPUT, frequency: 4 });
    expect(result.template.canonicalFrequency).toBe(4);
  });

  it('defaults preservedWeek to 1 and currentWeek to 1 when omitted (first-time build)', () => {
    const result = buildRunningPlan(BASE_INPUT);
    expect(result.activeProgram.currentWeek).toBe(1);
  });

  it('produces a non-empty schedule for a normal 8-week/3x input', () => {
    const result = buildRunningPlan(BASE_INPUT);
    expect(result.activeProgram.schedule.length).toBeGreaterThan(0);
  });

  it('programId on activeProgram matches the generated template id', () => {
    const result = buildRunningPlan(BASE_INPUT);
    expect(result.activeProgram.programId).toBe(result.template.id);
  });
});
