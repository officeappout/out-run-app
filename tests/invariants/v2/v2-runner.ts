/**
 * v2-runner.ts — drives one v2 scenario (v2-scenarios.ts) through the REAL generator
 * entry point with the production option shape, flag ON (enable_home_v2):
 *   day groups   generateHomeWorkoutTrio({ splitDayFocus: true, selectedDate, … })
 *   topup        buildPartialCompletionWorkout(profile, domain)  (#541 "אימון משלים")
 *   hybrid       dispatchStopContent at a real park, stationDomainMode 'multi' (#545)
 *   route_stops  composeHybridPlan route_stops with the v2 switch on (#545)
 * Runs must happen behind the hermetic Firestore stub (no prod, no network, no writes).
 */
import type { GeneratedWorkout, WorkoutExercise } from '@/features/workout-engine/logic/workout-generator.types';
import { generateHomeWorkoutTrio } from '@/features/workout-engine/services/home-workout.service';
import { resolveParkEquipmentIds } from '@/features/workout-engine/services/park-equipment-resolver';
import { buildMockProfile } from '@/features/workout-engine/shared/utils/mock-profile.utils';
import { whyLineOfWorkout } from '@/features/workout-engine/services/split-decision/why-this-workout';
import { setSplitDayFocusActive } from '@/features/workout-engine/services/split-decision/day-focus.switch';
import { hasPullGear } from '@/features/workout-engine/logic/pull-gap.utils';
import { HEBREW_DAYS } from '@/features/user/scheduling/utils/dateUtils';
import { HOME_BAR_BAND, PARK_TYPICAL_ID } from '../entry-points';
import type { HardContext } from '../hard-invariants';
import { oracleFocus, oracleSplit, type OracleGoal } from './v2-oracle';
import { mainAreas, type V2Context } from './v2-invariants';
import type { V2Loc, V2Scenario } from './v2-scenarios';

export const DOOR_BAR_ID = HOME_BAR_BAND[0];
/** Sunday of the generated week (any week works — the focus is by weekday). */
const WEEK_SUNDAY = '2026-10-18';

const RAW_GOAL: Record<OracleGoal, string> = {
  health: 'routine', muscle: 'mass_building', performance: 'performance', skills: 'skills', fat_loss: 'fat_loss',
};
const POOL: Record<string, string[]> = {
  full_body: ['push', 'pull', 'legs', 'core'], upper_body: ['push', 'pull'], lower_body: ['legs', 'core'],
};
const HOME_GEAR: Record<V2Loc, string[]> = { 'home-nogear': [], 'home-doorbar': [DOOR_BAR_ID], 'park-typical': [], gym: [] };
const PLACE: Record<V2Loc, 'home' | 'park' | 'gym'> = { 'home-nogear': 'home', 'home-doorbar': 'home', 'park-typical': 'park', gym: 'gym' };

export interface V2Run {
  scenario: V2Scenario;
  bolt: number;
  workout: GeneratedWorkout;
  hardCtx: HardContext;
  /** Day groups only (H6–H8 apply). */
  v2Ctx: V2Context | null;
  meta: Record<string, unknown>;
}

export const poolDomainsOf = (programs: string[]) => Array.from(new Set(programs.flatMap((p) => POOL[p] ?? [p])));
export const dateOf = (dow: number) => `2026-10-${String(18 + dow).padStart(2, '0')}`;

export function v2ProfileOf(s: V2Scenario) {
  const L = s.level;
  const profile = buildMockProfile({
    level: L, persona: '', injuries: [], domainLevels: { push: L, pull: L, legs: L, core: L }, coldStart: false,
    gear: HOME_GEAR[s.loc], activePrograms: s.programs.map((id) => ({ id, name: id, level: L })),
  }) as ReturnType<typeof buildMockProfile> & { selectedGoals?: string[] };
  (profile.lifestyle as { scheduleDays?: string[] }).scheduleDays = s.days.map((d) => HEBREW_DAYS[d]);
  profile.core.mainGoal = 'healthy_lifestyle' as never; // the sync default — ignored by the policy
  profile.selectedGoals = s.goals.map((g) => RAW_GOAL[g]);
  return profile;
}

async function gearOf(s: V2Scenario, profile: ReturnType<typeof v2ProfileOf>) {
  if (s.loc === 'park-typical') {
    const ids = await resolveParkEquipmentIds(profile, { selectedParkId: PARK_TYPICAL_ID });
    return { parkIds: ids.length ? ids : undefined, available: ids, pullGear: hasPullGear(ids) };
  }
  // Oracle, not the engine: the door bar IS pull gear; a gym has a bar.
  return { parkIds: undefined, available: HOME_GEAR[s.loc], pullGear: s.loc !== 'home-nogear' };
}

const asWorkout = (exercises: WorkoutExercise[], title: string) => ({ exercises, title } as unknown as GeneratedWorkout);

export async function runV2Scenario(s: V2Scenario): Promise<V2Run[]> {
  const profile = v2ProfileOf(s);
  const { parkIds, available, pullGear } = await gearOf(s, profile);
  const place = PLACE[s.loc];
  const hardBase: HardContext = { location: place, availableGear: available, requestedMinutes: s.minutes };

  if (s.group === 'topup') return runTopUp(s, profile, hardBase);
  if (s.group === 'hybrid') return runSingleStation(s, profile, available);
  if (s.group === 'route_stops') return runRouteStops(s, profile);

  const dow = s.days[s.dayIndex];
  const trio = await generateHomeWorkoutTrio({
    userProfile: profile, location: place, testLocation: place, availableTime: s.minutes,
    parkEquipmentIds: parkIds, scheduledProgramIds: s.programs, skipCycleRestart: true, budgetLightEnabled: false,
    selectedDate: dateOf(dow), splitDayFocus: true,
  } as unknown as Parameters<typeof generateHomeWorkoutTrio>[0]);
  const split = oracleSplit(s.level, s.days.length, s.goals);
  const expectedFocus = oracleFocus(split, s.dayIndex, poolDomainsOf(s.programs));
  const CAP = [30, 45, 60];
  return trio.options.filter((o) => o.result?.workout).map((o, i) => {
    const w = o.result.workout;
    const whyLine = whyLineOfWorkout({ workout: w, profile, location: place, now: new Date(`${WEEK_SUNDAY}T08:00:00+03:00`) });
    return {
      scenario: s, bolt: w.difficulty ?? i + 1, workout: w,
      hardCtx: { ...hardBase, countMinutes: Math.min(s.minutes, CAP[i] ?? s.minutes) },
      v2Ctx: { expectedFocus, expectedSplit: split, strengthDays: s.days.length, pullGear, atHome: place === 'home', whyLine },
      meta: { dow, split, expectedFocus, dayFocus: w.dayFocus ?? null, pullGap: w.pullGap ?? null, whyLine },
    };
  });
}

async function runTopUp(s: V2Scenario, profile: ReturnType<typeof v2ProfileOf>, hardBase: HardContext): Promise<V2Run[]> {
  const { buildPartialCompletionWorkout } = await import('@/features/workout-engine/core/generators/partial-completion.generator');
  setSplitDayFocusActive(true); // the home page sets it under enable_home_v2
  let w: Awaited<ReturnType<typeof buildPartialCompletionWorkout>>;
  try { w = await buildPartialCompletionWorkout(profile, s.domain as 'push'); } finally { setSplitDayFocusActive(false); }
  const workout = w ?? asWorkout([], '');
  return [{
    scenario: s, bolt: 2, workout,
    hardCtx: { ...hardBase, strictDomains: [s.domain!], skipCount: true },
    v2Ctx: null, meta: { empty: !w, title: w?.title ?? null },
  }];
}

async function runSingleStation(s: V2Scenario, profile: ReturnType<typeof v2ProfileOf>, parkGear: string[]): Promise<V2Run[]> {
  const [{ dispatchStopContent }, { resolveHybridUserLevels }, { getAllExercisesCached }, { withoutTestExercises }] = await Promise.all([
    import('@/features/workout-engine/hybrid/compose-hybrid-session.service'),
    import('@/features/workout-engine/hybrid/hybrid-context.util'),
    import('@/features/content/exercises/core/exercise.service'),
    import('@/features/workout-engine/shared/utils/test-exercise.utils'),
  ]);
  const { userProgramLevels, baseUserLevel, resolveUserLevelForExercise } = await resolveHybridUserLevels(profile, '[v2-qa]');
  const masterExercises = withoutTestExercises(await getAllExercisesCached());
  const input = (mode: 'per_station' | 'multi') => ({
    timeBudgetMin: 30, emphasis: 'balanced', aerobicKind: 'walking', paceProfile: { basePace: 420, profileType: 2 },
    routePath: [], stopCandidates: [], masterExercises,
    filterContext: { location: 'park', lifestyles: [], injuryShield: [], intentMode: 'normal', availableEquipment: [], getUserLevelForExercise: resolveUserLevelForExercise },
    generationContext: { availableTime: 10, userLevel: baseUserLevel, daysInactive: 1, intentMode: 'normal', persona: null, location: 'park', injuryCount: 0, difficulty: 2, userWeight: 75, userProgramLevels },
    // The bug's trigger: hybrid sessions never write weekly counts → push "neglected" first.
    weeklyGaps: { neglectedDomains: ['push', 'pull', 'legs', 'core'] },
    userWeightKg: 75, stationDomainMode: mode,
  }) as unknown as Parameters<typeof dispatchStopContent>[3];
  const stop = { stopId: 'qa-park', parkId: PARK_TYPICAL_ID, locationKind: 'park', lat: 0, lng: 0, waypointIndex: 0, availableEquipment: parkGear, activityType: 'strength' } as unknown as Parameters<typeof dispatchStopContent>[0];
  const on = dispatchStopContent(stop, 'push', s.minutes, input('multi'), []);
  const off = dispatchStopContent(stop, 'push', s.minutes, input('per_station'), []);
  const offAreas = (off?.exercises ?? []).map((e) => e.exercise?.movementGroup).join(',');
  return [{
    scenario: s, bolt: 2, workout: asWorkout(on?.exercises ?? [], 'station'),
    hardCtx: { location: 'park', availableGear: parkGear, requestedMinutes: s.minutes, skipCount: true },
    v2Ctx: null, meta: { hybrid: true, empty: !on || on.isEmpty, flagOffGroups: offAreas, pullGear: hasPullGear(parkGear) },
  }];
}

async function runRouteStops(s: V2Scenario, profile: ReturnType<typeof v2ProfileOf>): Promise<V2Run[]> {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const g = globalThis as Record<string, unknown>;
  if (!g.self) g.self = globalThis; // the map stack references `self` at import
  const [{ composeHybridPlan }, { useUserStore }] = await Promise.all([
    import('@/features/workout-engine/hybrid/start-hybrid-session'),
    import('@/features/user/identity/store/useUserStore'),
  ]);
  const routes: { id: string; published?: boolean; path: { lng: number; lat: number }[] }[] =
    JSON.parse(fs.readFileSync(path.join(process.env.HERMETIC_CORPUS_DIR || 'tests/invariants/hermetic/corpus', 'official_routes.json'), 'utf8'));
  const route = routes.find((r) => r.id === 'ki7wFmd6uxLarPyd1pcw') ?? routes.find((r) => r.published);
  (useUserStore as unknown as { setState: (p: unknown) => void }).setState({ profile });
  setSplitDayFocusActive(true);
  try {
    const p0 = route!.path[0];
    const composed = await composeHybridPlan(
      { timeBudgetMin: s.minutes, aerobicShare: 0.55, emphasis: 'balanced', aerobicKind: 'walking', difficulty: 2, mode: 'route_stops' } as Parameters<typeof composeHybridPlan>[0],
      { userPosition: { lat: p0.lat, lng: p0.lng }, startRun: () => {} } as Parameters<typeof composeHybridPlan>[1],
    );
    const segs = (composed?.plan?.segments ?? []) as unknown as { kind: string; availableEquipment?: string[]; content?: { exercises: WorkoutExercise[]; isEmpty?: boolean } }[];
    const stops = segs.filter((x) => x.kind === 'strength' && x.content && !x.content.isEmpty);
    const targets = poolDomainsOf(s.programs);
    const union = new Set(stops.flatMap((seg) => Array.from(mainAreas(asWorkout(seg.content!.exercises, '')))));
    const unionMissing = targets.filter((d) => !union.has(d));
    if (!stops.length) return [{ scenario: s, bolt: 2, workout: asWorkout([], ''), hardCtx: { location: 'park', availableGear: [], requestedMinutes: s.minutes, skipCount: true }, v2Ctx: null, meta: { hybrid: true, empty: true, targets } }];
    return stops.map((seg, i) => ({
      scenario: { ...s, id: `${s.id}/stop${i + 1}` }, bolt: 2, workout: asWorkout(seg.content!.exercises, 'route stop'),
      hardCtx: { location: 'park', availableGear: seg.availableEquipment ?? [], requestedMinutes: s.minutes, skipCount: true },
      v2Ctx: null, meta: { hybrid: true, stop: i + 1, targets, unionMissing: i === 0 ? unionMissing : [], pullGear: hasPullGear(seg.availableEquipment ?? []) },
    }));
  } finally {
    setSplitDayFocusActive(false);
  }
}
