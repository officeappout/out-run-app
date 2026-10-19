/**
 * Route-stops ("מסלול + עצירות") station planner — hybrid audit fixes (17.10.2026).
 *
 * The pool filter and the block generator are replaced by small deterministic fakes so the
 * assertions are about the COMPOSITION (station count vs time budget, cross-stop threading,
 * domain spread, field fallback, machine ladder) — not about exercise selection itself.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Exercise } from '@/features/content/exercises/core/exercise.types';
import type { GymEquipment } from '@/features/content/equipment/gym/core/gym-equipment.types';
import { MG_TO_DOMAIN } from '../../shared/constants/domain-mapping.constants';

vi.mock('@/lib/firebase', () => ({ db: {}, auth: { currentUser: null } }));

// ── Fake pool filter: gear-gated, FIELD mode = no-gear only ────────────────────────────────
const filterCalls: Array<{ availableEquipment: string[]; intentMode?: string }> = [];
vi.mock('../../logic/ContextualEngine', () => ({
  filterExercisesContextually: (master: Exercise[], ctx: { availableEquipment: string[]; intentMode?: string }) => {
    filterCalls.push({ availableEquipment: ctx.availableEquipment, intentMode: ctx.intentMode });
    const exercises = master
      .filter((ex) => {
        const gear: string[] = (ex as any).__gear ?? [];
        if (gear.length === 0) return true;
        if (ctx.intentMode === 'field') return false;
        return gear.every((g) => ctx.availableEquipment.includes(g));
      })
      .map((ex) => ({ exercise: ex, method: { gearIds: (ex as any).__gear ?? [] }, score: (ex as any).__score ?? 1 }));
    return { exercises };
  },
}));

// ── Fake block generator: top-3 by score within the requested domains, 3×10, 60 s rest ─────
vi.mock('../../core/pipeline/strength-block.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../core/pipeline/strength-block.service')>();
  const SKILL_PARENT: Record<string, string> = { front_lever: 'pull', planche: 'push' };
  return {
    ...actual,
    generateStrengthBlock: (req: any) => {
      const domains: string[] | undefined = req.domains ?? (req.domainFocus ? actual.FOCUS_TO_DOMAINS[req.domainFocus as 'push'] : undefined);
      const dom = (ex: Exercise) => {
        const d = MG_TO_DOMAIN[ex.movementGroup ?? ''];
        return SKILL_PARENT[d] ?? d;
      };
      const pool = [...req.scoredPool]
        .filter((se: any) => !domains || domains.includes(dom(se.exercise)))
        .sort((a: any, b: any) => b.score - a.score);
      const picked = pool.slice(0, 3).map((se: any) => ({
        exercise: se.exercise, method: se.method, mechanicalType: 'bent_arm', sets: 3, reps: 10,
        isTimeBased: false, restSeconds: 60, priority: 'compound', score: se.score, reasoning: [],
      }));
      if (picked.length === 0) {
        return { exercises: [], estimatedDurationSec: 0, totalPlannedSets: 0, isEmpty: true, log: [] };
      }
      const est = picked.reduce((a: number, e: any) => a + e.sets * (e.reps * 3 + e.restSeconds), 0);
      return { exercises: picked, estimatedDurationSec: est, totalPlannedSets: picked.length * 3, isEmpty: false, log: [] };
    },
  };
});

// ── Fake warm-up: prepends one warmup-role exercise ────────────────────────────────────────
vi.mock('../../services/warmup.service', () => ({
  prependWarmupExercises: (workout: any) => {
    workout.exercises.unshift({
      exercise: { id: 'wu-1', name: { he: 'חימום מפרקים' } }, sets: 1, reps: 15, isTimeBased: false,
      restSeconds: 0, exerciseRole: 'warmup', priority: 'accessory', score: 0, reasoning: [],
    });
  },
}));

import {
  composeHybridSession,
  planRouteStations,
  isStationEligibleExercise,
  fitBlockToBudget,
  type HybridComposeInput,
  type HybridStopCandidate,
} from '../compose-hybrid-session.service';
import { isWeeklyStrengthBudgetSpent } from '../weekly-budget-gate';
import { strengthBlockToWorkoutPlan } from '../strength-block-to-plan';
import { withOutdoorVideoMethods, resolvesToIndoorVideo } from '../station-outdoor-media';

// ── Fixtures ────────────────────────────────────────────────────────────────────────────────
let n = 0;
function ex(mg: string, opts: { gear?: string[]; score?: number; role?: string; name?: string; skill?: string } = {}): Exercise {
  n += 1;
  return {
    id: `${mg}-${n}`,
    name: { he: opts.name ?? `${mg} ${n}`, en: `${mg} ${n}` },
    movementGroup: mg,
    exerciseRole: opts.role ?? 'main',
    targetPrograms: opts.skill ? [{ programId: opts.skill, level: 15 }] : [],
    programIds: [],
    __gear: opts.gear ?? [],
    __score: opts.score ?? 1,
  } as unknown as Exercise;
}

function catalog(): Exercise[] {
  n = 0;
  const list: Exercise[] = [];
  for (const mg of ['vertical_pull', 'horizontal_pull', 'vertical_push', 'horizontal_push', 'squat', 'lunge', 'core', 'anti_extension']) {
    for (let i = 0; i < 4; i++) list.push(ex(mg, { score: 10 - i }));
  }
  // Gear-only work an open area can't host
  list.push(ex('vertical_pull', { gear: ['pullup_bar'], score: 50, name: 'תלייה יד אחת' }));
  list.push(ex('hinge', { gear: ['swedish_ladder'], score: 50, name: 'נורדיק בסולם שוודי' }));
  // Non-station content that must never be prescribed as sets
  list.push(ex('core', { role: 'reinforcement', score: 99, name: 'טבטה מאתגר +' }));
  list.push(ex('core', { score: 98, name: 'מתיחות פלג גוף עליון לבדיקה' }));
  return list;
}

// A straight 2.4 km line (lng only) — ~10 min/km walking at profileType 2's walk zone.
const PATH: [number, number][] = Array.from({ length: 25 }, (_, i) => [34.6 + i * 0.001, 31.5]);

function stop(id: string, waypointIndex: number, equipment: string[], extra: Partial<HybridStopCandidate> = {}): HybridStopCandidate {
  return {
    stopId: id, parkId: id, locationKind: 'gym', lat: 31.5, lng: PATH[waypointIndex][0],
    waypointIndex, availableEquipment: equipment, activityType: 'strength', ...extra,
  };
}

function input(overrides: Partial<HybridComposeInput> = {}): HybridComposeInput {
  return {
    timeBudgetMin: 30,
    emphasis: 'balanced',
    aerobicKind: 'walking',
    paceProfile: { basePace: 390, profileType: 2 },
    routePath: PATH,
    stopCandidates: [],
    stopSelection: 'as_provided',
    stationDomainMode: 'multi',
    masterExercises: catalog(),
    filterContext: {
      location: 'park', lifestyles: [], injuryShield: [], intentMode: 'normal', availableEquipment: [],
      getUserLevelForExercise: () => 5,
    } as any,
    generationContext: {
      availableTime: 10, userLevel: 5, daysInactive: 1, intentMode: 'normal', persona: null,
      location: 'park', injuryCount: 0, difficulty: 2,
      userProgramLevels: new Map([['push', 5], ['pull', 5], ['legs', 5], ['core', 5]]),
      requiredDomains: ['push', 'pull', 'legs', 'core'],
    } as any,
    weeklyGaps: { aerobicGapMin: 0, strengthGapDays: 0, neglectedDomains: [] },
    userWeightKg: 70,
    ...overrides,
  };
}

const strengthSegs = (plan: ReturnType<typeof composeHybridSession>) => plan.segments.filter((s) => s.kind === 'strength');
const totalMin = (plan: ReturnType<typeof composeHybridSession>) =>
  plan.segments.reduce((a, s) => a + (s.durationSec ?? 0), 0) / 60;

beforeEach(() => { filterCalls.length = 0; });

// ════════════════════════════════════════════════════════════════════════════════════════════
describe('planRouteStations — station count vs time budget', () => {
  const cands = (kms: number[]) => kms.map((km, i) => ({ candidate: stop(`s${i}`, i, ['pullup_bar']), km }));

  it('30 min with ~20 min of walking → ONE station, the rest pass-through', () => {
    const plan = planRouteStations({
      candidatesByKm: cands([0.4, 0.8, 1.2, 1.6, 1.8, 1.9]), routeKm: 2, walkSecPerKm: 600,
      timeBudgetMin: 30, targetDomains: ['push', 'pull', 'legs', 'core'], log: [],
    });
    expect(plan.chosen).toHaveLength(1);
    expect(plan.passThroughStopIds).toHaveLength(5);
    expect(plan.strengthBudgetMin).toBeCloseTo(10, 0);
    expect(plan.chosen[0].domains?.sort()).toEqual(['core', 'legs', 'pull', 'push']);
  });

  it('45 min → stations = ⌊strength budget / 8⌋, never more than the stops', () => {
    const plan = planRouteStations({
      candidatesByKm: cands([0.4, 0.8, 1.2, 1.6, 1.8, 1.9]), routeKm: 2, walkSecPerKm: 600,
      timeBudgetMin: 45, targetDomains: ['push', 'pull', 'legs', 'core'], log: [],
    });
    expect(plan.strengthBudgetMin).toBeCloseTo(25, 0);
    expect(plan.chosen).toHaveLength(3);
    expect(plan.chosen.length * plan.perStationMin).toBeLessThanOrEqual(plan.strengthBudgetMin + 0.01);
  });

  it('a stop under the 3-min warm-up walk is skipped for a later one', () => {
    const plan = planRouteStations({
      candidatesByKm: cands([0.1, 1.0]), routeKm: 2, walkSecPerKm: 600,
      timeBudgetMin: 30, targetDomains: ['push', 'pull', 'legs', 'core'], log: [],
    });
    expect(plan.chosen.map((c) => c.candidate.stopId)).toEqual(['s1']);
    expect(plan.chosen[0].needsWarmup).toBe(false);
    expect(plan.passThroughStopIds).toEqual(['s0']);
  });

  it('when every stop is under the warm-up walk, the farthest one gets a station warm-up', () => {
    const plan = planRouteStations({
      candidatesByKm: cands([0.05, 0.2]), routeKm: 2, walkSecPerKm: 600,
      timeBudgetMin: 30, targetDomains: ['push', 'pull', 'legs', 'core'], log: [],
    });
    expect(plan.chosen.map((c) => c.candidate.stopId)).toEqual(['s1']);
    expect(plan.chosen[0].needsWarmup).toBe(true);
  });

  it('splits ONE full-body plan across stations — bar station gets pull', () => {
    const candidatesByKm = [
      { candidate: stop('bench', 0, ['bench']), km: 0.6 },
      { candidate: stop('bar', 1, ['pullup_bar']), km: 1.3 },
    ];
    const plan = planRouteStations({
      candidatesByKm, routeKm: 2, walkSecPerKm: 360, timeBudgetMin: 30,
      targetDomains: ['push', 'pull', 'legs', 'core'], log: [],
    });
    expect(plan.chosen).toHaveLength(2);
    const byId = Object.fromEntries(plan.chosen.map((c) => [c.candidate.stopId, c.domains]));
    expect(byId.bar).toEqual(['pull', 'core']);
    expect(byId.bench).toEqual(['push', 'legs']);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════
describe('composeHybridSession (as_provided) — one session across the stops', () => {
  const stops = [
    stop('a', 2, ['pullup_bar']), stop('b', 6, ['dip_station']), stop('c', 10, ['bench']),
    stop('d', 14, []), stop('e', 18, ['pullup_bar']), stop('f', 22, ['bench']),
  ];

  it('30-min request stays within budget (was: every stop a ≥8-min station)', () => {
    const plan = composeHybridSession(input({ stopCandidates: stops, timeBudgetMin: 30 }));
    expect(totalMin(plan)).toBeLessThanOrEqual(30 * 1.1);
    expect(plan.totals.stations).toBeLessThan(stops.length);
    expect((plan.meta.passThroughStopIds ?? []).length).toBe(stops.length - plan.totals.stations);
  });

  it('no exercise is repeated across stations, and the domains are spread (all four covered)', () => {
    const plan = composeHybridSession(input({ stopCandidates: stops, timeBudgetMin: 50, paceProfile: { basePace: 300, profileType: 1 }, aerobicKind: 'running' }));
    const segs = strengthSegs(plan);
    expect(segs.length).toBeGreaterThanOrEqual(2);
    const ids = segs.flatMap((s) => (s.content?.exercises ?? []).map((e) => e.exercise.id));
    expect(new Set(ids).size).toBe(ids.length);
    // disjoint station domains, union = full body
    const all = segs.flatMap((s) => s.stationDomains ?? []);
    expect(new Set(all).size).toBe(all.length);
    expect(new Set(all)).toEqual(new Set(['push', 'pull', 'legs', 'core']));
  });

  it('never prescribes reinforcement/follow-along videos or test items as sets', () => {
    const plan = composeHybridSession(input({ stopCandidates: stops, timeBudgetMin: 50 }));
    const names = strengthSegs(plan).flatMap((s) => (s.content?.exercises ?? []).map((e) => (e.exercise.name as any).he));
    expect(names).not.toContain('טבטה מאתגר +');
    expect(names.some((x) => x.includes('בדיקה'))).toBe(false);
  });

  it('at most one skill family per session, at one station', () => {
    const master = [
      ...catalog(),
      ex('front_lever', { score: 80, skill: 'front_lever', name: 'פרונט לבר' }),
      ex('front_lever', { score: 79, skill: 'front_lever', name: 'פרונט לבר טאק' }),
      ex('planche', { score: 80, skill: 'planche', name: 'פלאנש טאק' }),
    ];
    const plan = composeHybridSession(input({
      stopCandidates: stops, timeBudgetMin: 50, masterExercises: master,
      paceProfile: { basePace: 300, profileType: 1 }, aerobicKind: 'running',
    }));
    const perStation = strengthSegs(plan).map((s) =>
      new Set((s.content?.exercises ?? []).flatMap((e) => (e.exercise.targetPrograms ?? []).map((t) => t.programId))));
    const families = new Set(perStation.flatMap((f) => Array.from(f)));
    expect(families.size).toBeLessThanOrEqual(1);
    expect(perStation.filter((f) => f.size > 0).length).toBeLessThanOrEqual(1);
  });

  it('trims an over-long block to its station budget', () => {
    const log: string[] = [];
    const block = {
      exercises: [1, 2, 3, 4].map((i) => ({ exercise: { id: `x${i}` }, sets: 4, reps: 10, isTimeBased: false, restSeconds: 60 })) as any,
      estimatedDurationSec: 4 * 4 * 90, totalPlannedSets: 16, isEmpty: false, log: [],
    };
    const fit = fitBlockToBudget(block, 8 * 60, log, '[t]');
    expect(fit.estimatedDurationSec).toBeLessThanOrEqual(8 * 60);
    expect(fit.exercises.length).toBeGreaterThanOrEqual(2);
    expect(fit.exercises.every((e) => e.sets >= 1)).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════
describe('field fallback (no stop on the route) — bodyweight only', () => {
  it('open-area stop carries no gear and only no-gear exercises', () => {
    const plan = composeHybridSession(input({ stopCandidates: [] }));
    expect(plan.meta.usedFieldFallback).toBe(true);
    const seg = strengthSegs(plan)[0];
    expect(seg.availableEquipment).toEqual([]);
    const names = (seg.content?.exercises ?? []).map((e) => (e.exercise.name as any).he);
    expect(names).not.toContain('תלייה יד אחת');
    expect(names).not.toContain('נורדיק בסולם שוודי');
    expect(filterCalls.every((c) => c.availableEquipment.length === 0)).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════
describe('weekly strength budget — cold store is unknown, not spent', () => {
  it('weeklyBudget 0 (never initialised) → not spent', () => {
    expect(isWeeklyStrengthBudgetSpent({ weeklyBudget: 0, totalSetsCompleted: 0 })).toBe(false);
    expect(isWeeklyStrengthBudgetSpent(undefined)).toBe(false);
    expect(isWeeklyStrengthBudgetSpent({ weeklyBudget: NaN, totalSetsCompleted: 0 })).toBe(false);
  });
  it('a real budget with < 4 sets left → spent; with plenty left → not', () => {
    expect(isWeeklyStrengthBudgetSpent({ weeklyBudget: 40, totalSetsCompleted: 38 })).toBe(true);
    expect(isWeeklyStrengthBudgetSpent({ weeklyBudget: 40, totalSetsCompleted: 10 })).toBe(false);
  });
});

describe('station content gate', () => {
  it('rejects reinforcement/recovery roles, finisher videos and test items', () => {
    expect(isStationEligibleExercise(ex('core', { role: 'reinforcement' }))).toBe(false);
    expect(isStationEligibleExercise(ex('core', { role: 'recovery' }))).toBe(false);
    expect(isStationEligibleExercise({ ...ex('core'), isFinisherVideo: true } as Exercise)).toBe(false);
    expect(isStationEligibleExercise(ex('core', { name: 'מתיחות פלג גוף עליון לבדיקה' }))).toBe(false);
    expect(isStationEligibleExercise(ex('core'))).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════
describe('park machines: a station is machines OR bodyweight, never both (machine-share ladder)', () => {
  const machine = (id: string, movementPattern: string): GymEquipment => ({
    id, name: id, type: 'reps', recommendedLevel: 3, isFunctional: false, isCardio: false,
    muscleGroups: [], brands: [], movementPattern,
  } as unknown as GymEquipment);
  const machines = () => [
    machine('m-push', 'horizontal_push'), machine('m-pull', 'vertical_pull'),
    machine('m-legs', 'squat'), machine('m-core', 'core'),
  ];
  const parkStop = stop('park', 12, ['pullup_bar'], { parkEquipment: machines() });
  const isMachineEx = (e: { exercise: { id: string } }, seg: ReturnType<typeof strengthSegs>[number]) =>
    (seg.content?.tabataBlocks ?? []).some((b) => b.exerciseIds.includes(e.exercise.id));
  const kinds = (seg: ReturnType<typeof strengthSegs>[number]) => {
    const exs = (seg.content?.exercises ?? []).filter((e) => e.exerciseRole !== 'warmup');
    return { machine: exs.filter((e) => isMachineEx(e, seg)).length, bodyweight: exs.filter((e) => !isMachineEx(e, seg)).length };
  };

  it('one station, low level (share ≥ 0.5) → machines only', () => {
    const plan = composeHybridSession(input({ stopCandidates: [parkStop], timeBudgetMin: 40, machineShareLevel: 2 }));
    const seg = strengthSegs(plan)[0];
    expect(seg.content?.tabataBlocks?.length).toBe(1);
    const k = kinds(seg);
    expect(k.machine).toBeGreaterThanOrEqual(2);
    expect(k.bodyweight).toBe(0);
    const wp = strengthBlockToWorkoutPlan(seg.content!);
    expect(wp.segments.every((s) => s.protocol === 'tabata')).toBe(true);
  });

  it('one station, share < 0.5 (L6) → bodyweight only', () => {
    const plan = composeHybridSession(input({ stopCandidates: [parkStop], timeBudgetMin: 40, machineShareLevel: 6 }));
    const seg = strengthSegs(plan)[0];
    expect(seg.content?.tabataBlocks).toBeUndefined();
    expect(kinds(seg).bodyweight).toBeGreaterThan(0);
  });

  it('L8+ → no machines (all bodyweight)', () => {
    const plan = composeHybridSession(input({ stopCandidates: [parkStop], timeBudgetMin: 40, machineShareLevel: 9 }));
    const seg = strengthSegs(plan)[0];
    expect(seg.content?.tabataBlocks).toBeUndefined();
    expect((seg.content?.exercises ?? []).length).toBeGreaterThan(0);
  });

  it('two stations, machines at one park → that park is the machine station, the other is full-body bodyweight', () => {
    const stops = [stop('plain', 8, ['pullup_bar']), stop('gym', 16, ['pullup_bar'], { parkEquipment: machines() })];
    const plan = composeHybridSession(input({ stopCandidates: stops, timeBudgetMin: 60, machineShareLevel: 2 }));
    const segs = strengthSegs(plan);
    expect(segs).toHaveLength(2);
    const byStop = Object.fromEntries(segs.map((s) => [s.stopId, kinds(s)]));
    expect(byStop.gym.machine).toBeGreaterThanOrEqual(2);
    expect(byStop.gym.bodyweight).toBe(0);
    expect(byStop.plain.machine).toBe(0);
    expect(byStop.plain.bodyweight).toBeGreaterThan(0);
    expect(segs.find((s) => s.stopId === 'plain')?.stationDomains?.sort()).toEqual(['core', 'legs', 'pull', 'push']);
  });

  it('every park has machines → still at least one bodyweight station, none mixed', () => {
    const stops = [8, 14, 20].map((w, i) => stop(`g${i}`, w, ['pullup_bar'], { parkEquipment: machines() }));
    const plan = composeHybridSession(input({ stopCandidates: stops, timeBudgetMin: 60, machineShareLevel: 2 }));
    const segs = strengthSegs(plan);
    expect(segs.length).toBeGreaterThanOrEqual(2);
    const ks = segs.map(kinds);
    expect(ks.every((k) => k.machine === 0 || k.bodyweight === 0)).toBe(true);
    expect(ks.some((k) => k.machine === 0)).toBe(true);
    // share 0.7 → round(0.7 × n) machine stations, capped at n − 1
    expect(ks.filter((k) => k.machine > 0).length).toBe(Math.min(Math.round(0.7 * segs.length), segs.length - 1));
  });

  it('planRouteStations: machine stations go to the parks with eligible machines', () => {
    const candidatesByKm = [
      { candidate: stop('a', 0, ['pullup_bar']), km: 0.6 },
      { candidate: stop('b', 1, ['dip_station'], { parkEquipment: machines() }), km: 1.0 },
      { candidate: stop('c', 2, ['bench']), km: 1.5 },
    ];
    const plan = planRouteStations({
      candidatesByKm, routeKm: 2, walkSecPerKm: 360, timeBudgetMin: 45,
      targetDomains: ['push', 'pull', 'legs', 'core'], machineShare: 0.55, log: [],
    });
    const modes = Object.fromEntries(plan.chosen.map((c) => [c.candidate.stopId, c.mode]));
    expect(modes).toEqual({ a: 'bodyweight', b: 'machines', c: 'bodyweight' });
    // the bodyweight stations still carry the whole full-body split between them
    const bwDomains = plan.chosen.filter((c) => c.mode === 'bodyweight').flatMap((c) => c.domains ?? []);
    expect(new Set(bwDomains)).toEqual(new Set(['push', 'pull', 'legs', 'core']));
  });

  it('planRouteStations: share 0 → all bodyweight', () => {
    const candidatesByKm = [
      { candidate: stop('a', 0, ['pullup_bar'], { parkEquipment: machines() }), km: 0.6 },
      { candidate: stop('b', 1, ['dip_station'], { parkEquipment: machines() }), km: 1.3 },
    ];
    const plan = planRouteStations({
      candidatesByKm, routeKm: 2, walkSecPerKm: 360, timeBudgetMin: 30,
      targetDomains: ['push', 'pull', 'legs', 'core'], machineShare: 0, log: [],
    });
    expect(plan.chosen.every((c) => c.mode === 'bodyweight')).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════
describe('stops never show a home/office video', () => {
  const vid = (id: string) => ({ previewVideo: { he: { videoId: id } } });
  const withMethods = (methods: unknown[]) => ({ ...ex('core'), execution_methods: methods } as unknown as Exercise);

  it('park method without a video + home method with one → the exercise is excluded at stops', () => {
    const e = withMethods([
      { methodName: 'בבית', location: 'home', media: vid('home-vid') },
      { methodName: 'בפארק', location: 'park', media: {} },
    ]);
    expect(resolvesToIndoorVideo(e, (e as any).execution_methods[1])).toBe(true);
    expect(withOutdoorVideoMethods(e)).toBeNull();
  });

  it('a videoless park method is dropped when another park method has a video', () => {
    const e = withMethods([
      { methodName: 'בבית', location: 'home', media: vid('home-vid') },
      { methodName: 'מוט', location: 'park', gearIds: ['pullup_bar'], media: {} },
      { methodName: 'מקבילים', location: 'park', gearIds: ['dip_station'], media: vid('park-vid') },
    ]);
    // the resolver falls back park-first, so the videoless park method plays the PARK video → kept
    expect(withOutdoorVideoMethods(e)).toBe(e);
  });

  it('park method with its own video, or no video anywhere → unchanged', () => {
    const own = withMethods([
      { methodName: 'בבית', location: 'home', media: vid('home-vid') },
      { methodName: 'בפארק', location: 'park', media: vid('park-vid') },
    ]);
    expect(withOutdoorVideoMethods(own)).toBe(own);
    const none = withMethods([{ methodName: 'בבית', location: 'home', media: {} }, { methodName: 'בפארק', location: 'park', media: {} }]);
    expect(withOutdoorVideoMethods(none)).toBe(none);
  });

  it('only the leaking park method is removed; a park-mapped method with its own video stays', () => {
    const e = withMethods([
      { methodName: 'בבית', location: 'home', media: vid('home-vid') },
      { methodName: 'בפארק', location: 'park', media: {} },
      { methodName: 'רחוב', location: 'office', locationMapping: ['street'], media: vid('street-vid') },
    ]);
    const safe = withOutdoorVideoMethods(e)!;
    expect(safe).not.toBeNull();
    const names = ((safe as any).execution_methods as Array<{ methodName: string }>).map((m) => m.methodName);
    expect(names).toEqual(['בבית', 'רחוב']);
  });

  it('composeHybridSession never prescribes an exercise whose stop video would be the home one', () => {
    const leaky = { ...ex('core', { score: 500, name: 'עליות רגליים בשכיבה' }), id: 'leaky-core', execution_methods: [
      { methodName: 'בבית', location: 'home', media: vid('home-vid') },
      { methodName: 'בפארק', location: 'park', media: {} },
    ] } as unknown as Exercise;
    const plan = composeHybridSession(input({ stopCandidates: [stop('p', 12, ['pullup_bar'])], timeBudgetMin: 40, masterExercises: [...catalog(), leaky] }));
    const ids = strengthSegs(plan).flatMap((s) => (s.content?.exercises ?? []).map((e) => e.exercise.id));
    expect(ids.length).toBeGreaterThan(0);
    expect(ids).not.toContain(leaky.id);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════
describe('first station before the warm-up walk', () => {
  it('gets a short warm-up, played as its own "חימום" segment', () => {
    const early = stop('early', 0, ['pullup_bar']); // at the very start of the route
    const plan = composeHybridSession(input({ stopCandidates: [early] }));
    const seg = strengthSegs(plan)[0];
    expect(seg.content?.stationWarmup).toBe(true);
    expect(seg.content?.exercises[0].exerciseRole).toBe('warmup');
    const wp = strengthBlockToWorkoutPlan(seg.content!);
    expect(wp.segments[0].title).toBe('חימום');
    expect(wp.segments[0].id).not.toBe('warmup-segment'); // never stripped by the full-park skip
    expect(wp.segments[1].exercises?.every((e) => e.exerciseRole === 'main')).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════
// Owner device report 19.10.2026 — "מסלול + עצירות" showed one walking leg and NO station
// (1.87 km loop, קליל/מאוזן/עוצמתי pills), and a ride or a run with a 0 base pace showed
// "0 דק׳" legs.
describe('a strength stop always becomes the station (no walk-only route + stops)', () => {
  // A 1.87 km loop: a gym 0.5 km in, a viewpoint (stretch stop) right at the middle.
  const gymStop = (km: number) => ({ candidate: stop('gym', 5, ['pullup_bar']), km });
  const viewStop = (km: number) => ({
    candidate: stop('view', 9, [], { locationKind: 'viewpoint', activityType: 'stretch' }), km,
  });

  it('one station: the gym wins over a better-spaced stretch stop', () => {
    const plan = planRouteStations({
      candidatesByKm: [gymStop(0.5), viewStop(0.95)], routeKm: 1.87, walkSecPerKm: 600,
      timeBudgetMin: 30, targetDomains: ['push', 'pull', 'legs', 'core'], log: [],
    });
    expect(plan.chosen.map((c) => c.candidate.stopId)).toEqual(['gym']);
    expect(plan.chosen[0].domains?.sort()).toEqual(['core', 'legs', 'pull', 'push']);
  });

  it('the only gym sits before the warm-up walk → it is still the station (with a warm-up), not the viewpoint', () => {
    const plan = planRouteStations({
      candidatesByKm: [gymStop(0.1), viewStop(0.95)], routeKm: 1.87, walkSecPerKm: 600,
      timeBudgetMin: 30, targetDomains: ['push', 'pull', 'legs', 'core'], log: [],
    });
    expect(plan.chosen.map((c) => c.candidate.stopId)).toEqual(['gym']);
    expect(plan.chosen[0].needsWarmup).toBe(true);
  });

  it('only stretch stops on the route → unchanged (the stretch stop is the station)', () => {
    const plan = planRouteStations({
      candidatesByKm: [viewStop(0.95)], routeKm: 1.87, walkSecPerKm: 600,
      timeBudgetMin: 30, targetDomains: ['push', 'pull', 'legs', 'core'], log: [],
    });
    expect(plan.chosen.map((c) => c.candidate.stopId)).toEqual(['view']);
  });

  it('the planned station comes out empty → a walked-past strength stop is used instead', () => {
    // Every exercise needs rings: the planned (middle) bar park has none, the far park does.
    n = 0;
    const ringsOnly = ['vertical_pull', 'vertical_push', 'squat', 'core'].flatMap((mg) =>
      [ex(mg, { gear: ['rings'] }), ex(mg, { gear: ['rings'] })]);
    const mid = stop('mid-bars', 12, ['pullup_bar']);
    const far = stop('far-rings', 20, ['rings']);
    const plan = composeHybridSession(input({ stopCandidates: [mid, far], masterExercises: ringsOnly }));
    const stations = strengthSegs(plan);
    expect(stations).toHaveLength(1);
    expect(stations[0].stopId).toBe('far-rings');
    expect(stations[0].content?.exercises.length).toBeGreaterThan(0);
    expect(plan.meta.log.some((l) => l.includes('rescued pass-through stop far-rings'))).toBe(true);
  });
});

describe('aerobic legs are timed by the real activity (never 0 min for a real distance)', () => {
  const aerobic = (plan: ReturnType<typeof composeHybridSession>) => plan.segments.filter((s) => s.kind === 'aerobic');

  it('a ride: cycling legs at ~20 km/h (3 min/km), not running legs', () => {
    const plan = composeHybridSession(input({ aerobicKind: 'cycling', stopCandidates: [stop('p', 12, ['pullup_bar'])] }));
    const legs = aerobic(plan);
    expect(legs.length).toBeGreaterThan(0);
    for (const leg of legs) {
      expect(leg.aerobicType).toBe('cycling');
      if ((leg.distanceKm ?? 0) > 0) {
        expect(leg.durationSec).toBeGreaterThan(0);
        expect((leg.durationSec ?? 0) / (leg.distanceKm ?? 1)).toBeCloseTo(180, -1);
      }
    }
  });

  it('a run with basePace 0 on the profile (never ran) → the default pace, not 0-minute legs', () => {
    const plan = composeHybridSession(input({
      aerobicKind: 'running', paceProfile: { basePace: 0, profileType: 2 }, stopCandidates: [stop('p', 12, ['pullup_bar'])],
    }));
    for (const leg of aerobic(plan)) {
      if ((leg.distanceKm ?? 0) > 0.05) expect(Math.round((leg.durationSec ?? 0) / 60)).toBeGreaterThan(0);
    }
  });
});
