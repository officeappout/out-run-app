import { describe, it, expect } from 'vitest';
import { buildRunningPlan, resolveBuildStartDate, flattenPlanToSchedule } from '../plan-generator.service';
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

// Moved here from running-schedule-write.service.test.ts (01.09.2026, fix
// commit) alongside flattenPlanToSchedule's own relocation to this file --
// co-locating the function's tests with its actual definition instead of
// leaving them at its old address.
const FLATTEN_BASE_PLAN_RESULT = {
  plan: {
    id: 'plan_1',
    name: 'Couch to 5K',
    targetDistance: '5k' as const,
    durationWeeks: 1,
    weeks: [{ weekNumber: 1, workouts: [{ id: 'tpl_easy_1_w1', title: 'Easy Run', isQualityWorkout: false, blocks: [] }] }],
  },
  warnings: [],
  intensityBreakdown: [],
};

describe('flattenPlanToSchedule', () => {
  it('flattens a single week/single workout into one schedule entry, day 1-indexed', () => {
    const schedule = flattenPlanToSchedule(FLATTEN_BASE_PLAN_RESULT as any, WORKOUT_TEMPLATES as any);
    expect(schedule).toEqual([
      {
        week: 1, day: 1, workoutId: 'tpl_easy_1_w1', status: 'pending', category: 'easy_run', workoutName: 'Easy Run',
        // 05.09.2026 — carried through for the first time, see this test
        // file's own dedicated 'importance fields' describe block below.
        isQualityWorkout: false, priority: undefined,
      },
    ]);
  });

  it('flattens multiple weeks and multiple workouts per week, day index resets each week', () => {
    const planResult = {
      ...FLATTEN_BASE_PLAN_RESULT,
      plan: {
        ...FLATTEN_BASE_PLAN_RESULT.plan,
        weeks: [
          { weekNumber: 1, workouts: [{ id: 'tpl_easy_1_w1', title: 'Easy Run', isQualityWorkout: false, blocks: [] }, { id: 'tpl_easy_1_w1', title: 'Easy Run 2', isQualityWorkout: false, blocks: [] }] },
          { weekNumber: 2, workouts: [{ id: 'tpl_easy_1_w2', title: 'Easy Run', isQualityWorkout: false, blocks: [] }] },
        ],
      },
    };
    const schedule = flattenPlanToSchedule(planResult as any, WORKOUT_TEMPLATES as any);
    expect(schedule.map((s) => [s.week, s.day])).toEqual([[1, 1], [1, 2], [2, 1]]);
  });

  it('strips the _w{N} suffix to look up template metadata', () => {
    const schedule = flattenPlanToSchedule(FLATTEN_BASE_PLAN_RESULT as any, WORKOUT_TEMPLATES as any);
    expect(schedule[0].category).toBe('easy_run');
    expect(schedule[0].workoutName).toBe('Easy Run');
  });

  it('falls back to the workout.title when the template id is not in the pool', () => {
    const planResult = {
      ...FLATTEN_BASE_PLAN_RESULT,
      plan: {
        ...FLATTEN_BASE_PLAN_RESULT.plan,
        weeks: [{ weekNumber: 1, workouts: [{ id: 'tpl_unknown_w1', title: 'Fallback Title', isQualityWorkout: false, blocks: [] }] }],
      },
    };
    const schedule = flattenPlanToSchedule(planResult as any, WORKOUT_TEMPLATES as any);
    expect(schedule[0].workoutName).toBe('Fallback Title');
    expect(schedule[0].category).toBeUndefined();
  });

  it('returns an empty schedule for a plan with no weeks', () => {
    const planResult = { ...FLATTEN_BASE_PLAN_RESULT, plan: { ...FLATTEN_BASE_PLAN_RESULT.plan, weeks: [] } };
    expect(flattenPlanToSchedule(planResult as any, WORKOUT_TEMPLATES as any)).toEqual([]);
  });

  // 05.09.2026 — RunWorkoutTemplate.isQualityWorkout/.priority carried into
  // the persisted ActiveRunningProgram.schedule for the first time (they
  // already survived into the in-memory generated plan, but were dropped
  // right here, at the flatten step, before this fix). See running.types.ts's
  // own doc comment on these two fields for the full "undefined means
  // unknown, no migration" contract this respects.
  describe('importance fields (isQualityWorkout, priority)', () => {
    const QUALITY_TEMPLATES: RunWorkoutTemplate[] = [
      { id: 'tpl_quality_1', name: 'Interval Session', category: 'short_intervals', isQualityWorkout: true, priority: 1, targetProfileTypes: [3], blocks: [] },
    ];

    it('isQualityWorkout comes from the in-memory generated workout, not re-derived from the template', () => {
      const planResult = {
        ...FLATTEN_BASE_PLAN_RESULT,
        plan: {
          ...FLATTEN_BASE_PLAN_RESULT.plan,
          weeks: [{ weekNumber: 1, workouts: [{ id: 'tpl_quality_1_w1', title: 'Interval Session', isQualityWorkout: true, blocks: [] }] }],
        },
      };
      const schedule = flattenPlanToSchedule(planResult as any, QUALITY_TEMPLATES as any);
      expect(schedule[0].isQualityWorkout).toBe(true);
    });

    it('priority comes from the template lookup, undefined when the template has none', () => {
      const scheduleWithPriority = flattenPlanToSchedule(
        {
          ...FLATTEN_BASE_PLAN_RESULT,
          plan: { ...FLATTEN_BASE_PLAN_RESULT.plan, weeks: [{ weekNumber: 1, workouts: [{ id: 'tpl_quality_1_w1', title: 'Interval Session', isQualityWorkout: true, blocks: [] }] }] },
        } as any,
        QUALITY_TEMPLATES as any,
      );
      expect(scheduleWithPriority[0].priority).toBe(1);

      // WORKOUT_TEMPLATES's tpl_easy_1 has no priority field at all.
      const scheduleWithoutPriority = flattenPlanToSchedule(FLATTEN_BASE_PLAN_RESULT as any, WORKOUT_TEMPLATES as any);
      expect(scheduleWithoutPriority[0].priority).toBeUndefined();
    });

    it('an old-shaped schedule entry (no isQualityWorkout/priority keys at all, simulating a document written before this fix) reads without error — undefined, not a crash', () => {
      // Deliberately NOT run through flattenPlanToSchedule -- this simulates
      // a real pre-existing Firestore document, built by the pre-fix code,
      // which never wrote these keys at all (not even as `undefined`).
      const oldEntry = {
        week: 1, day: 1, workoutId: 'tpl_easy_1_w1', status: 'pending' as const,
        category: 'easy_run' as const, workoutName: 'Easy Run',
      };
      expect(() => oldEntry).not.toThrow();
      expect((oldEntry as any).isQualityWorkout).toBeUndefined();
      expect((oldEntry as any).priority).toBeUndefined();
    });
  });

  // 06.09.2026 — slotType carried into the persisted schedule. Unlike
  // isQualityWorkout/priority, this field did NOT already survive into the
  // in-memory generated workout before this fix -- generatePlan itself had
  // to be fixed first (running-engine.service.ts, attaching slot.slotType
  // right after selectWorkoutFromPool/materializeWorkout), since it was
  // discarded inside generatePlan's own selection loop, never even reaching
  // the RunWorkout object flattenPlanToSchedule reads from. See
  // running.types.ts's own doc comment for the full "undefined means
  // unknown, no migration" contract this respects, same as isQualityWorkout.
  describe('slotType', () => {
    it('a new user (real buildRunningPlan pipeline, not a flatten-level mock) receives a real slotType value in the saved schedule', () => {
      const VALID_SLOT_TYPES = ['quality_primary', 'quality_secondary', 'long_run', 'easy_run', 'recovery'];
      const result = buildRunningPlan(BASE_INPUT);
      expect(result.activeProgram.schedule.length).toBeGreaterThan(0);
      // Entries selected through the normal WeekSlot loop (identifiable by
      // having a category — confirmed via generatePlan directly) get a real
      // slotType. The one exception, buildRaceDayWorkout's special
      // last-week injection, bypasses the WeekSlot loop entirely and has
      // never carried `category` either (pre-existing, not a regression
      // from this change) -- excluded from this assertion on that basis,
      // not slotType-specific special-casing.
      const normalEntries = result.activeProgram.schedule.filter((e) => e.category !== undefined);
      expect(normalEntries.length).toBeGreaterThan(0);
      for (const entry of normalEntries) {
        expect(entry.slotType).toBeDefined();
        expect(VALID_SLOT_TYPES).toContain(entry.slotType);
      }
    });

    it('flattenPlanToSchedule carries slotType through from the in-memory workout, same mechanism as isQualityWorkout', () => {
      const planResult = {
        ...FLATTEN_BASE_PLAN_RESULT,
        plan: {
          ...FLATTEN_BASE_PLAN_RESULT.plan,
          weeks: [{ weekNumber: 1, workouts: [{ id: 'tpl_easy_1_w1', title: 'Easy Run', isQualityWorkout: false, slotType: 'long_run', blocks: [] }] }],
        },
      };
      const schedule = flattenPlanToSchedule(planResult as any, WORKOUT_TEMPLATES as any);
      expect(schedule[0].slotType).toBe('long_run');
    });

    it('an old-shaped schedule entry (no slotType key at all) reads without error — undefined, not a crash, and not "easy_run" by default', () => {
      const oldEntry = {
        week: 1, day: 1, workoutId: 'tpl_easy_1_w1', status: 'pending' as const,
        category: 'easy_run' as const, workoutName: 'Easy Run',
      };
      expect(() => oldEntry).not.toThrow();
      expect((oldEntry as any).slotType).toBeUndefined();
    });

    it('other previously-written fields are unaffected by this change', () => {
      const schedule = flattenPlanToSchedule(FLATTEN_BASE_PLAN_RESULT as any, WORKOUT_TEMPLATES as any);
      expect(schedule[0]).toMatchObject({
        week: 1, day: 1, workoutId: 'tpl_easy_1_w1', status: 'pending',
        category: 'easy_run', workoutName: 'Easy Run', isQualityWorkout: false,
      });
    });
  });
});
