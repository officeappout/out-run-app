/**
 * pull-gap.utils — an upper day is never push-only silently (enable_home_v2 day focus,
 * owner bug 20.10.2026). End-to-end repro: day-focus.hermetic.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { balanceFocusAreas, hasPullGear, widenFocusForPullGap, findAreaCandidate } from '../pull-gap.utils';
import { UNTAGGED_GEAR_FREE_PULLS, type NeverEmptyOptions } from '../never-empty.utils';
import type { GeneratedWorkout, WorkoutExercise } from '../workout-generator.types';

const homeMethod = { location: 'home', locationMapping: ['home'], requiredGearType: 'improvised', gearIds: [], equipmentIds: [], media: {} };
const barMethod = { location: 'home', locationMapping: ['home'], requiredGearType: 'user_gear', gearIds: ['pullup_bar'], equipmentIds: [], media: {} };
const ex = (id: string, movementGroup: string | undefined, method: object = homeMethod, level = 5) =>
  ({ id, name: { he: id, en: id }, movementGroup, execution_methods: [method], targetPrograms: [{ programId: movementGroup?.includes('pull') ? 'pull' : movementGroup?.includes('push') ? 'push' : 'core', level }] }) as any;
const we = (e: any, extra: Partial<WorkoutExercise> = {}) =>
  ({ exercise: e, method: e.execution_methods[0], sets: 3, reps: 10, exerciseRole: 'main', ...extra }) as unknown as WorkoutExercise;
const workout = (exercises: WorkoutExercise[]) => ({ exercises, difficulty: 2, pipelineLog: [] }) as unknown as GeneratedWorkout;

const pushes = [ex('p1', 'horizontal_push'), ex('p2', 'vertical_push'), ex('p3', 'horizontal_push'), ex('p4', 'vertical_push')];
const barPull = ex('pullup', 'vertical_pull', barMethod);
const core = ex('plank', 'core');
const levels = new Map([['push', 5], ['pull', 5], ['core', 5], ['legs', 5]]);
const opts = (o: Partial<NeverEmptyOptions> = {}): NeverEmptyOptions => ({
  pool: [], allExercises: [], location: 'home', availableEquipment: [], userProgramLevels: levels,
  minMain: 4, difficulty: 2 as any, ...o,
});

describe('hasPullGear', () => {
  it('bar / rings / TRX / band = pull gear; nothing / a chair = none', () => {
    expect(hasPullGear([])).toBe(false);
    expect(hasPullGear(['chair', 'door', 'towel'])).toBe(false);
    expect(hasPullGear(['pullup_bar'])).toBe(true);
    expect(hasPullGear(['rings'])).toBe(true);
    expect(hasPullGear(['trx'])).toBe(true);
    expect(hasPullGear(['resistance_band'])).toBe(true);
  });
});

describe('widenFocusForPullGap (pipeline step)', () => {
  it('upper day, pool has no pull → core joins the strict focus', () => {
    const r = widenFocusForPullGap({ domains: ['push', 'pull'], focusDomains: ['push', 'pull'] }, [...pushes, core].map((exercise) => ({ exercise })));
    expect(r).toEqual({ domains: ['push', 'pull', 'core'], gap: true });
  });
  it('pool has a pull → unchanged', () => {
    const r = widenFocusForPullGap({ domains: ['push', 'pull'], focusDomains: ['push', 'pull'] }, [...pushes, barPull].map((exercise) => ({ exercise })));
    expect(r).toEqual({ domains: ['push', 'pull'], gap: false });
  });
  it('a lower day never changes', () => {
    expect(widenFocusForPullGap({ domains: ['legs', 'core'], focusDomains: ['legs', 'core'] }, [])).toEqual({ domains: ['legs', 'core'], gap: false });
  });
  it('the pool already is the focus (domains null) and has no core → gap, nothing to widen', () => {
    expect(widenFocusForPullGap({ domains: null, focusDomains: ['push', 'pull'] }, pushes.map((exercise) => ({ exercise })))).toEqual({ domains: null, gap: true });
  });
});

describe('balanceFocusAreas (per option)', () => {
  it('BUG repro: 4 push on an upper day at home, a gear-free row exists → one push swapped for the row', () => {
    const row = ex('table_row', 'horizontal_pull');
    const w = workout(pushes.map((p) => we(p)));
    const mode = balanceFocusAreas(w, opts({ pool: [row, barPull] }), ['push', 'pull']);
    const ids = w.exercises.map((e) => e.exercise.id);
    expect(ids).toContain('table_row');
    expect(ids).not.toContain('pullup'); // needs a bar this home doesn't have
    expect(ids.length).toBe(4);          // swapped, not added — the duration stays
    expect(mode).toBe('bodyweight_pull');
    expect(w.pullGap).toBe('bodyweight_pull');
  });

  it('no tagged gear-free pull anywhere → the catalog-gap stopgap (towel pulldown / table row)', () => {
    const [towelId] = Object.keys(UNTAGGED_GEAR_FREE_PULLS);
    const towel = { ...ex(towelId, undefined), targetPrograms: [{ programId: 'pull', level: 2 }] };
    const w = workout(pushes.map((p) => we(p)));
    const mode = balanceFocusAreas(w, opts({ pool: [barPull], allExercises: [barPull, towel] }), ['push', 'pull']);
    const added = w.exercises.find((e) => e.exercise.id === towelId);
    expect(added?.exercise.movementGroup).toBe(UNTAGGED_GEAR_FREE_PULLS[towelId]);
    expect(mode).toBe('bodyweight_pull');
  });

  it('no pull possible at all → balanced with core and stamped "core", never silently push-only', () => {
    const w = workout(pushes.map((p) => we(p)));
    const mode = balanceFocusAreas(w, opts({ pool: [core, barPull], allExercises: [barPull] }), ['push', 'pull', 'core']);
    expect(w.exercises.map((e) => e.exercise.id)).toContain('plank');
    expect(mode).toBe('core');
  });

  it('nothing but push exists → stamped push_only (the overview says why)', () => {
    const w = workout(pushes.map((p) => we(p)));
    expect(balanceFocusAreas(w, opts(), ['push', 'pull'])).toBe('push_only');
    expect(w.pullGap).toBe('push_only');
  });

  it('with a pull-up bar: the bar pull fills the gap and no pullGap is stamped', () => {
    const w = workout(pushes.map((p) => we(p)));
    expect(balanceFocusAreas(w, opts({ pool: [barPull], availableEquipment: ['pullup_bar'] }), ['push', 'pull'])).toBeNull();
    expect(w.exercises.map((e) => e.exercise.id)).toContain('pullup');
    expect(w.pullGap).toBeUndefined();
  });

  it('an all-pull upper session gets a push back (both directions)', () => {
    const pulls = [ex('r1', 'horizontal_pull'), ex('r2', 'vertical_pull'), ex('r3', 'horizontal_pull')];
    const w = workout(pulls.map((p) => we(p)));
    balanceFocusAreas(w, opts({ pool: [pushes[0]], availableEquipment: ['pullup_bar'] }), ['push', 'pull']);
    expect(w.exercises.map((e) => e.exercise.movementGroup)).toContain('horizontal_push');
  });

  it('never swaps a protocol-block or paired member; an empty main block is left to the never-empty rescue', () => {
    const w = workout([we(pushes[0], { protocolBlock: 'tabata' }), we(pushes[1], { pairedWith: 'x' })]);
    balanceFocusAreas(w, opts({ pool: [ex('row', 'horizontal_pull')] }), ['push', 'pull']);
    expect(w.exercises.map((e) => e.exercise.id)).toEqual(['p1', 'p2', 'row']);
    const empty = workout([]);
    expect(balanceFocusAreas(empty, opts({ pool: [ex('row', 'horizontal_pull')] }), ['push', 'pull'])).toBeNull();
    expect(empty.exercises).toEqual([]);
  });

  it('candidates above the user level are skipped in the catalog step', () => {
    const hard = ex('archer_row', 'horizontal_pull', homeMethod, 12);
    expect(findAreaCandidate(workout([]), opts({ allExercises: [hard] }), 'pull')).toBeNull();
  });
});
