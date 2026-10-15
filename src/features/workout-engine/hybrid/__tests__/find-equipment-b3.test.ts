import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import type { WorkoutExercise, GeneratedWorkout } from '../../logic/workout-generator.types';
import type { StrengthBlockResult } from '../../core/pipeline/strength-block.service';
import type { HybridPlannedSegment } from '../compose-hybrid-session.service';
import { composeParkWorkoutPlan, type ParkWorkoutComposeInput } from '../compose-park-workout.service';
import { strengthBlockToWorkoutPlan } from '../strength-block-to-plan';
import { computeStationContext, swapExerciseInStationContent } from '../station-flow';
import { findEquipmentScreen, idsToMarkFound, scopedFoundStore, type FindInput } from '../../players/strength/logic/find-equipment';
import { filterAlternativesByEquipment, pickFittingParkMethod } from '../../players/strength/logic/equipment-filter';
import { createDemoSeenStore } from '../../players/strength/logic/demo-gate';
import { normalizeGearId } from '../../shared/utils/gear-mapping.utils';

/** PR-B3 — guided find-the-equipment + station-limited exercise swaps. */

const we = (id: string, method: Record<string, unknown> = {}, extra: Partial<WorkoutExercise> = {}): WorkoutExercise =>
  ({
    exercise: { id, name: id },
    method,
    mechanicalType: 'none', sets: 3, reps: 8, isTimeBased: false, restSeconds: 60,
    priority: 'compound', score: 0, reasoning: [], tier: 'match', exerciseRole: 'main',
    ...extra,
  } as unknown as WorkoutExercise);
const block = (exercises: WorkoutExercise[]): StrengthBlockResult =>
  ({ exercises, estimatedDurationSec: 600, totalPlannedSets: 9, isEmpty: false, log: [] } as StrengthBlockResult);

describe('data pass-through (additive)', () => {
  it('full-park composer: the station segment carries the park\'s availableEquipment', () => {
    const input: ParkWorkoutComposeInput = {
      routePath: [[34.0, 32.0], [34.01, 32.0], [34.0, 32.0]],
      station: { stopId: 'park:T', parkId: 'p1', locationKind: 'gym', lat: 32, lng: 34.01, waypointIndex: 1, availableEquipment: ['pullup_bar', 'parallel_bars'] },
      workout: { title: 'w', exercises: [we('a')], estimatedDuration: 20, totalPlannedSets: 3 } as unknown as GeneratedWorkout,
      aerobicKind: 'walking', paceProfile: { basePace: 600, profileType: 2 }, userWeightKg: 70,
    };
    const seg = composeParkWorkoutPlan(input).segments.find((s) => s.kind === 'strength')!;
    expect(seg.availableEquipment).toEqual(['pullup_bar', 'parallel_bars']);
    const { availableEquipment: _omit, ...noEquip } = input.station;
    const seg2 = composeParkWorkoutPlan({ ...input, station: noEquip }).segments.find((s) => s.kind === 'strength')!;
    expect(Object.prototype.hasOwnProperty.call(seg2, 'availableEquipment')).toBe(false); // unchanged when absent
  });

  it('route-stops composer copies the stop candidate\'s availableEquipment onto the station segment', () => {
    const src = readFileSync(fileURLToPath(new URL('../compose-hybrid-session.service.ts', import.meta.url)), 'utf8');
    expect(src).toContain('...(stop.candidate.equipmentUnknown ? {} : { availableEquipment: stop.candidate.availableEquipment }),');
  });

  it('failed equipment lookup → "unknown", not "none": the segment omits availableEquipment → no filter', () => {
    // The lookup marks the stop unknown on every failure path (no park id, park not found, read throws);
    // a successful read keeps the translated list ([] only when the park genuinely has none).
    const start = readFileSync(fileURLToPath(new URL('../start-hybrid-session.ts', import.meta.url)), 'utf8');
    const lookup = start.slice(start.indexOf("await tm.time('getPark'"), start.indexOf('const equippedStops'));
    expect(lookup).toContain("if (!s.parkId) { s.equipmentUnknown = true; return; }");
    expect(lookup).toContain('if (!fullPark) s.equipmentUnknown = true;');
    expect(lookup.slice(lookup.indexOf('} catch {'))).toContain('s.equipmentUnknown = true;');
    // …and a station segment built that way (no key) → context null → today's full list.
    const seg = { index: 1, kind: 'strength', parkId: 'p1', durationSec: 600, estCalories: 0 } as HybridPlannedSegment;
    const allowed = computeStationContext([seg], 0).availableEquipment;
    expect(allowed).toBeNull();
    const options = [
      { exercise: { id: 'rows-on-bar', execution_methods: [{ location: 'park', equipmentIds: ['pullup_bar'] }] } },
      { exercise: { id: 'home-only', execution_methods: [{ location: 'home' }] } },
    ];
    expect(filterAlternativesByEquipment(options, allowed).map((o) => o.exercise.id)).toEqual(['rows-on-bar', 'home-only']);
    // Contrast: a park that genuinely has no equipment ([]) → bodyweight park methods only.
    expect(filterAlternativesByEquipment(options, []).map((o) => o.exercise.id)).toEqual([]);
  });

  it('plan adapter: each exercise\'s equipment survives (normalized); bodyweight stays without the key', () => {
    const plan = strengthBlockToWorkoutPlan(block([
      we('pullups', { equipmentIds: ['pullup_bar'] }),
      we('pushups', {}),
    ]));
    const [machine, bw] = plan.segments[0].exercises!;
    expect(machine.equipment).toEqual([normalizeGearId('pullup_bar')]);
    expect(Object.prototype.hasOwnProperty.call(bw, 'equipment')).toBe(false);
  });

  it('station context exposes the station\'s availableEquipment', () => {
    const seg = { index: 1, kind: 'strength', parkId: 'p1', availableEquipment: ['pullup_bar'], durationSec: 600, estCalories: 0 } as HybridPlannedSegment;
    expect(computeStationContext([seg], 0).availableEquipment).toEqual(['pullup_bar']);
  });

  it('missing equipment data (key absent) → context null → the swap list is today\'s full list, unfiltered', () => {
    const seg = { index: 1, kind: 'strength', parkId: 'p1', durationSec: 600, estCalories: 0 } as HybridPlannedSegment;
    const allowed = computeStationContext([seg], 0).availableEquipment;
    expect(allowed).toBeNull();
    const options = [
      { exercise: { id: 'rows-on-bar', execution_methods: [{ location: 'park', equipmentIds: ['pullup_bar'] }] } },
      { exercise: { id: 'home-only', execution_methods: [{ location: 'home' }] } },
    ];
    expect(filterAlternativesByEquipment(options, allowed).map((o) => o.exercise.id)).toEqual(['rows-on-bar', 'home-only']);
    expect(filterAlternativesByEquipment(options, undefined).map((o) => o.exercise.id)).toEqual(['rows-on-bar', 'home-only']);
  });
});

const seg = (exs: Array<{ id: string; equipment?: string[] }>) => ({ exercises: exs.map((e) => ({ ...e, name: e.id })) });
const findIn = (over: Partial<FindInput> = {}): FindInput => ({
  enabled: true,
  seen: createDemoSeenStore(),
  workoutState: 'ACTIVE',
  exerciseType: 'reps',
  segment: seg([{ id: 'pullups', equipment: ['pullup_bar'] }, { id: 'pushups' }]),
  exIdx: 0,
  isTabataBlock: false,
  isFirstTabataInterval: false,
  ...over,
});

describe('find-the-equipment screen', () => {
  it('guided only', () => {
    expect(findEquipmentScreen(findIn())).not.toBeNull();
    expect(findEquipmentScreen(findIn({ enabled: false }))).toBeNull();
    expect(findEquipmentScreen(findIn({ seen: undefined }))).toBeNull();
  });
  it('machine exercises only — bodyweight never', () => {
    expect(findEquipmentScreen(findIn({ exIdx: 1 }))).toBeNull();
  });
  it('once per exercise per station location: repeated sets at the same place don\'t show it again', () => {
    const session = createDemoSeenStore();
    const here = scopedFoundStore(session, 'park:p1');
    const screen = findEquipmentScreen(findIn({ seen: here }))!;
    expect(screen.kind).toBe('single');
    idsToMarkFound(screen).forEach((id) => here.add(id));
    expect(findEquipmentScreen(findIn({ seen: here }))).toBeNull(); // set 2, 3… same station
  });
  it('the same machine exercise at a LATER station (another park) shows the screen again', () => {
    const session = createDemoSeenStore();
    scopedFoundStore(session, 'park:p1').add('pullups');
    expect(findEquipmentScreen(findIn({ seen: scopedFoundStore(session, 'park:p2') }))).not.toBeNull();
  });
  it('several station segments in the SAME park are one location (full-park flow)', () => {
    const plan = [
      { index: 0, kind: 'strength', parkId: 'p1', stopId: 'park:A', durationSec: 600, estCalories: 0 },
      { index: 1, kind: 'aerobic', durationSec: 300, estCalories: 0 },
      { index: 2, kind: 'strength', parkId: 'p1', stopId: 'park:A', durationSec: 600, estCalories: 0 },
      { index: 3, kind: 'strength', parkId: 'p2', durationSec: 600, estCalories: 0 },
      { index: 4, kind: 'strength', stopId: 'street-1', durationSec: 600, estCalories: 0 },
    ] as HybridPlannedSegment[];
    const keys = [0, 2, 3, 4].map((c) => computeStationContext(plan, c).locationKey);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[2]).not.toBe(keys[0]);
    expect(keys[3]).toBe('stop:street-1'); // no park → the stop identity
    const session = createDemoSeenStore();
    scopedFoundStore(session, keys[0]).add('pullups');
    expect(findEquipmentScreen(findIn({ seen: scopedFoundStore(session, keys[1]) }))).toBeNull();
  });
  it('the demo gate stays once per session; only the find store is scoped per location', () => {
    const layer = readFileSync(fileURLToPath(new URL('../HybridStationLayer.tsx', import.meta.url)), 'utf8');
    expect(layer).toContain('demoGate={guided ? hybridDemoSeen : undefined}');
    expect(layer).toContain('scopedFoundStore(hybridEquipmentFound, stationContext.locationKey)');
    expect(layer).toContain('findEquipment={guided && foundAtThisLocation ? foundAtThisLocation : undefined}');
  });
  it('tabata: ONE combined screen before the first interval listing the block\'s machines, never mid-block', () => {
    const block2 = seg([{ id: 'm1', equipment: ['a'] }, { id: 'bw' }, { id: 'm2', equipment: ['b'] }]);
    const screen = findEquipmentScreen(findIn({ segment: block2, isTabataBlock: true, isFirstTabataInterval: true }))!;
    expect(screen.kind).toBe('tabata');
    expect(screen.items.map((i) => [i.exerciseId, i.exIdx])).toEqual([['m1', 0], ['m2', 2]]); // each gets its own swap
    expect(findEquipmentScreen(findIn({ segment: block2, isTabataBlock: true, isFirstTabataInterval: false }))).toBeNull();
  });
});

describe('order: find → gate → set', () => {
  it('the demo gate is only considered once no find screen is pending; both share the hold', () => {
    const runner = readFileSync(fileURLToPath(new URL('../../players/strength/StrengthRunner.tsx', import.meta.url)), 'utf8');
    expect(runner).toContain('const needsGate = !needsFind && shouldGateExercise(gateInput);');
    expect(runner).toContain('const needsHold = needsFind || needsGate;');
    const found = runner.slice(runner.indexOf('const handleEquipmentFound'), runner.indexOf('const handleGateStart'));
    expect(found).toContain('if (!gateNext && sm.isPaused) sm.togglePause();'); // stays held when the gate is next
  });
});

describe('replacement modal filtering — stations only', () => {
  const ex = (id: string, methods: Array<Record<string, unknown>>): { exercise: { id: string; execution_methods: Array<Record<string, unknown>> }; selectedExecutionMethod?: unknown } =>
    ({ exercise: { id, execution_methods: methods } });
  const options = [
    ex('rows-on-bar', [{ location: 'park', equipmentIds: ['pullup_bar'] }]),
    ex('ring-rows', [{ location: 'park', equipmentIds: ['rings'] }]),
    ex('squats', [{ location: 'park' }]),
    ex('home-only', [{ location: 'home' }]),
  ];
  it('not at a station (allowed = null) → unchanged', () => {
    expect(filterAlternativesByEquipment(options, null).map((o) => o.exercise.id)).toEqual(['rows-on-bar', 'ring-rows', 'squats', 'home-only']);
  });
  it('at a station → park equipment + bodyweight only, with the fitting method selected', () => {
    const kept = filterAlternativesByEquipment(options, ['pullup_bar']);
    expect(kept.map((o) => o.exercise.id)).toEqual(['rows-on-bar', 'squats']);
    expect(kept[0].selectedExecutionMethod).toMatchObject({ equipmentIds: ['pullup_bar'] });
  });
  it('prefers a method that uses the park equipment over a bodyweight one', () => {
    const m = pickFittingParkMethod({ execution_methods: [{ location: 'park' }, { location: 'park', equipmentIds: ['pullup_bar'] }] }, ['pullup_bar']);
    expect(m).toMatchObject({ equipmentIds: ['pullup_bar'] });
  });
  it('only the guided station passes the filter to the modal; the modal defaults to none', () => {
    const layer = readFileSync(fileURLToPath(new URL('../HybridStationLayer.tsx', import.meta.url)), 'utf8');
    expect(layer).toContain('allowedEquipmentIds={guided ? stationContext?.availableEquipment ?? null : null}');
    const modal = readFileSync(fileURLToPath(new URL('../../players/strength/components/ExerciseReplacementModal.tsx', import.meta.url)), 'utf8');
    expect(modal).toContain('allowedEquipmentIds = null,');
  });
});

describe('swap result is what the station plays and logs', () => {
  it('the swapped exercise (with its fitting method\'s equipment) replaces the original in the plan', () => {
    const content = block([we('pullups', { equipmentIds: ['pullup_bar'] }), we('dips', { equipmentIds: ['parallel_bars'] })]);
    const plan = strengthBlockToWorkoutPlan(content);
    const next = swapExerciseInStationContent(content, plan, 0, 1, { id: 'bench-dips', name: 'מקבילים על ספסל' }, { location: 'park' })!;
    const rebuilt = strengthBlockToWorkoutPlan(next);
    // useExerciseLog keys each logged set by the PLAN exercise's id/name → this is what's logged.
    expect(rebuilt.segments[0].exercises![1]).toMatchObject({ id: 'bench-dips', name: 'מקבילים על ספסל' });
    expect(Object.prototype.hasOwnProperty.call(rebuilt.segments[0].exercises![1], 'equipment')).toBe(false); // now bodyweight
  });
});
