/**
 * focus-floor.utils — a thin focus pool still reaches the H3 minimum (enable_home_v2 day
 * focus, generator QA #591: pull day at home without a bar, L16–20 → 1–3 exercises).
 */
import { describe, it, expect } from 'vitest';
import { focusFloorAreas, topUpFocusDayReserve } from '../focus-floor.utils';
import type { NeverEmptyOptions } from '../never-empty.utils';
import type { GeneratedWorkout, WorkoutExercise } from '../workout-generator.types';

const homeMethod = { location: 'home', locationMapping: ['home'], requiredGearType: 'improvised', gearIds: [], equipmentIds: [], media: {} };
const barMethod = { location: 'home', locationMapping: ['home'], requiredGearType: 'user_gear', gearIds: ['pullup_bar'], equipmentIds: [], media: {} };
const prog = (mg?: string) => (mg?.includes('pull') ? 'pull' : mg?.includes('push') ? 'push' : mg === 'squat' ? 'legs' : 'core');
const ex = (id: string, movementGroup: string, level = 16, method: object = homeMethod) =>
  ({ id, name: { he: id, en: id }, movementGroup, execution_methods: [method], targetPrograms: [{ programId: prog(movementGroup), level }] }) as any;
const we = (e: any) => ({ exercise: e, method: e.execution_methods[0], sets: 3, reps: 8, exerciseRole: 'main' }) as unknown as WorkoutExercise;
const workout = (exercises: WorkoutExercise[]) => ({ exercises, difficulty: 2, pipelineLog: [] }) as unknown as GeneratedWorkout;
const levels = new Map([['push', 16], ['pull', 16], ['core', 16], ['legs', 16]]);
const opts = (o: Partial<NeverEmptyOptions> = {}): NeverEmptyOptions => ({
  pool: [], allExercises: [], location: 'home', availableEquipment: [], userProgramLevels: levels, minMain: 4, difficulty: 2 as any, ...o,
});

const rows = [ex('row1', 'horizontal_pull', 15), ex('row2', 'horizontal_pull', 16)];
const cores = [ex('lsit', 'core', 15), ex('dragon', 'core', 16)];
const pushes = [ex('hspu', 'vertical_push', 16), ex('planche', 'horizontal_push', 17)];
const ids = (w: GeneratedWorkout) => (w.reserveExercises ?? []).map((e) => e.exercise.id);

describe('focusFloorAreas', () => {
  it('a pull day without pull gear may take core; with a bar it stays pull', () => {
    expect(focusFloorAreas(['pull'], [])).toEqual(['pull', 'core']);
    expect(focusFloorAreas(['pull'], ['pullup_bar'])).toEqual(['pull']);
    expect(focusFloorAreas(['push'], [])).toEqual(['push']);
    expect(focusFloorAreas(['legs', 'core'], [])).toEqual(['legs', 'core']);
  });
});

describe('topUpFocusDayReserve', () => {
  it('BUG repro: 2 gear-free rows on a pull day at home → topped up to 4 with core, never push', () => {
    const w = workout(rows.map(we));
    const n = topUpFocusDayReserve(w, opts({ pool: [...rows, ...cores, ...pushes], allExercises: [...rows, ...cores, ...pushes] }), ['pull']);
    expect(n).toBe(2);
    expect(ids(w).sort()).toEqual(['dragon', 'lsit']);
    expect(w.pipelineLog?.some((l) => l.startsWith('focus_floor'))).toBe(true);
  });

  it('lower-level gear-free pull variations from the catalog join, bar pulls never', () => {
    const easyRow = ex('row_60', 'horizontal_pull', 6);
    const barPull = ex('pullup', 'vertical_pull', 10, barMethod);
    const w = workout(rows.map(we));
    topUpFocusDayReserve(w, opts({ minMain: 5, pool: [...rows, cores[0]], allExercises: [...rows, cores[0], easyRow, barPull] }), ['pull']);
    expect(ids(w)).toContain('row_60');
    expect(ids(w)).toContain('lsit');
    expect(ids(w)).not.toContain('pullup');
  });

  it('a L20 push day at home: gear-free push progressions (catalog, ≤ user level), no core', () => {
    const lv = new Map([['push', 20], ['core', 20]]);
    const w = workout([we(ex('a', 'vertical_push', 20)), we(ex('b', 'horizontal_push', 20)), we(ex('c', 'vertical_push', 19))]);
    const pike = ex('pike', 'vertical_push', 12);
    topUpFocusDayReserve(w, opts({ userProgramLevels: lv, allExercises: [pike, ...cores] }), ['push']);
    expect(ids(w)).toEqual(['pike']);
  });

  it('nothing to do when the floor is already reachable, or the block is empty (rescue owns it)', () => {
    const full = workout([...rows, ...cores].map(we));
    expect(topUpFocusDayReserve(full, opts({ pool: pushes }), ['pull'])).toBe(0);
    expect(topUpFocusDayReserve(workout([]), opts({ pool: rows }), ['pull'])).toBe(0);
  });

  it('never adds above user level +1 from the pool or above the user level from the catalog', () => {
    const w = workout(rows.map(we));
    topUpFocusDayReserve(w, opts({ pool: [ex('hard_row', 'horizontal_pull', 18)], allExercises: [ex('elite', 'core', 19)] }), ['pull']);
    expect(ids(w)).toEqual([]);
  });
});
