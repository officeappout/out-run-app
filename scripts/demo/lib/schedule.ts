/**
 * A persona's week, built with the REAL engines (pure, no Firebase):
 *   - strength / running / hybrid personas: schedule engine v2 `buildWeek` on the persona's
 *     schedule-combos fixture input (the same fixture → input mapping the engine's own
 *     fixture tests use, fixtureHarness.toEngineInput) as a base week — one-week events
 *     (travel / illness exceptions, "add a session") are stripped;
 *   - walking personas: the walking plan `recommendWalkPlan`, and each planned walk is the
 *     app's own schedule entry (walkSchedule.walkEntryFor).
 * The result is a 7-day layout plus the userSchedule entries the app itself would store.
 */
import fixtures from '@/features/schedule/engine-v2/__tests__/fixtures/schedule-combos.fixtures.json';
import { toEngineInput } from '@/features/schedule/engine-v2/__tests__/fixtureHarness';
import { buildWeek } from '@/features/schedule/engine-v2';
import type { PlacedSession, ScheduleEngineInput, TimeWindow } from '@/features/schedule/engine-v2/types';
import { profileOf } from '@/features/schedule/engine-v2/programProfiles';
import { RUNNING_SLOT_NAME_HE } from '@/features/schedule/engine/runningRules';
import { classifyStrengthId, SCHEDULE_ID_NAME_HE } from '@/features/schedule/engine/strengthVocabulary';
import { RUN_TIME_PRESETS } from '@/features/schedule/utils/runWeekRecommendation';
import { recommendWalkPlan } from '@/features/schedule/walking/walkPlan';
import { walkEntryFor } from '@/features/schedule/walking/walkSchedule';
import type { PlannedWalk } from '@/features/schedule/walking/walkPlan.types';
import type { UserScheduleEntry } from '@/features/user/scheduling/types/schedule.types';
import type { Persona } from './personas';

export interface DemoSession {
  kind: 'strength' | 'run' | 'walk' | 'mobility';
  slug?: string;
  slot?: PlacedSession['slot'];
  minutes: number;
  window: TimeWindow;
  /** Walking personas: the plan's walk (target, long flag). */
  walk?: PlannedWalk;
  optional?: boolean;
}

export interface DemoWeek {
  /** index = day of week (0 = Sunday). */
  days: DemoSession[][];
  /** Where the week came from: 'engine-v2:S04' | 'walk-plan'. */
  source: string;
  /** Strength program slugs (for the profile). */
  strengthSlugs: string[];
  running: { targetDistance: string; level: string; days: number[] } | null;
  walkTargetWeeklyMinutes?: number;
}

const STRENGTH_NAME_FALLBACK_HE: Record<string, string> = {
  push: 'דחיפה',
  pull: 'משיכה',
  legs: 'רגליים',
  core: 'ליבה',
  full_body: 'כל הגוף',
  upper_body: 'פלג גוף עליון',
  lower_body: 'פלג גוף תחתון',
};

export function strengthNameHe(slug: string): string {
  const id = classifyStrengthId(slug).scheduleId;
  return (id && SCHEDULE_ID_NAME_HE[id as keyof typeof SCHEDULE_ID_NAME_HE]) || STRENGTH_NAME_FALLBACK_HE[slug] || 'אימון כוח';
}

const RUN_MINUTES: Record<string, number> = { quality_primary: 45, quality_secondary: 40, long_run: 70, easy_run: 35, recovery: 25 };

type Fixture = { id: string; input: Record<string, unknown> };
const SCENARIOS = (fixtures as unknown as { scenarios: Fixture[] }).scenarios;

export function scenarioInput(id: string): ScheduleEngineInput {
  const f = SCENARIOS.find((s) => s.id === id);
  if (!f) throw new Error(`no schedule-combos scenario ${id}`);
  const input = toEngineInput(f);
  // A base week: no one-off exceptions, no "existing week" to keep, no history.
  return {
    ...input,
    availability: { ...input.availability, exceptions: [] },
    existing: null,
    history: null,
    running: input.running ? { ...input.running, isDeloadWeek: false } : null,
  };
}

function windowOf(input: ScheduleEngineInput, dow: number, s: PlacedSession): TimeWindow {
  if (s.window) return s.window;
  const w = input.availability.windows;
  return (w?.[String(dow)]?.[0] ?? w?.['*']?.[0] ?? 'evening') as TimeWindow;
}

function engineWeek(p: Persona): DemoWeek {
  const input = scenarioInput(p.scenario);
  const plan = buildWeek(input);
  const days: DemoSession[][] = plan.days.map((d) =>
    d.sessions
      .filter((s) => s.kind !== 'mobility' || !s.optional)
      .map((s): DemoSession => {
        const window = windowOf(input, d.dow, s);
        if (s.kind === 'strength') {
          const base = profileOf(s.slug ?? 'full_body').sessionMinutes;
          return { kind: 'strength', slug: s.slug, minutes: Math.round(base * (s.volumePct ?? 100) / 100), window, optional: s.optional };
        }
        if (s.kind === 'run') return { kind: 'run', slot: s.slot, minutes: s.minutes ?? RUN_MINUTES[s.slot ?? 'easy_run'] ?? 35, window, optional: s.optional };
        if (s.kind === 'walk') return { kind: 'walk', minutes: s.minutes ?? 30, window, optional: s.optional };
        return { kind: 'mobility', minutes: s.minutes ?? 15, window, optional: s.optional };
      }),
  );
  const runDays = days.flatMap((ss, dow) => (ss.some((s) => s.kind === 'run') ? [dow] : []));
  return {
    days,
    source: `engine-v2:${p.scenario}`,
    strengthSlugs: input.strength.map((s) => s.slug),
    running: input.running ? { targetDistance: input.running.targetDistance, level: input.running.level, days: runDays } : null,
  };
}

function walkWeek(p: Persona): DemoWeek {
  const w = p.walk!;
  const plan = recommendWalkPlan({ goal: w.goal, comfort: w.comfort, stepGoal: p.stepGoal, availableDays: w.days, audience: w.audience });
  const week = plan.weeks[plan.weeks.length - 1] ?? plan.weeks[0];
  const days: DemoSession[][] = Array.from({ length: 7 }, () => []);
  for (const walk of week.walks) days[walk.dow].push({ kind: 'walk', minutes: walk.minutes, window: w.window, walk });
  return { days, source: 'walk-plan', strengthSlugs: [], running: null, walkTargetWeeklyMinutes: plan.targetWeeklyMinutes };
}

export function weekFor(p: Persona): DemoWeek {
  return p.scenario === 'WR' ? walkWeek(p) : engineWeek(p);
}

export const startTimeOf = (w: TimeWindow) => RUN_TIME_PRESETS[w].time;

/** The userSchedule entries of one date (the app's own entry shapes). */
export function scheduleEntriesFor(
  uid: string,
  date: string,
  sessions: DemoSession[],
  done: Array<{ completed: boolean; workoutId?: string }>,
): UserScheduleEntry[] {
  return sessions.map((s, i) => {
    const status = done[i] ?? { completed: false };
    const base = {
      userId: uid,
      date,
      type: 'training' as const,
      source: 'auto' as const,
      completed: status.completed,
      ...(status.workoutId ? { completedWorkoutId: status.workoutId } : {}),
      startTime: startTimeOf(s.window),
    };
    if (s.kind === 'walk' && s.walk) {
      return { ...walkEntryFor(date, s.walk, s.window, uid), completed: status.completed, ...(status.workoutId ? { completedWorkoutId: status.workoutId } : {}) };
    }
    if (s.kind === 'strength') {
      return { ...base, entryId: `demo_strength_${date}_${i}`, programIds: [s.slug ?? 'full_body'], scheduledCategories: ['strength'], title: strengthNameHe(s.slug ?? 'full_body') };
    }
    if (s.kind === 'run') {
      return { ...base, entryId: `demo_run_${date}_${i}`, programIds: [], scheduledCategories: ['cardio'], title: RUNNING_SLOT_NAME_HE[s.slot ?? 'easy_run'] };
    }
    if (s.kind === 'walk') {
      return { ...base, entryId: `demo_walk_${date}_${i}`, programIds: [], scheduledCategories: ['walking'], title: 'הליכה' };
    }
    return { ...base, entryId: `demo_mobility_${date}_${i}`, programIds: [], scheduledCategories: ['maintenance'], title: 'גמישות' };
  });
}
