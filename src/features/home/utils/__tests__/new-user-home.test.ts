import { describe, expect, it } from 'vitest';
import { INACTIVE_NEW_USER_HOME, resolveNewUserHome, type NewUserHomeInput } from '../new-user-home';

const base: NewUserHomeInput = {
  v2: true, programPlanMode: 'start', isWalker: false, workoutCount: 0, weekSessions: 0, todayWorkouts: 0, healthConnected: false,
};

describe('resolveNewUserHome', () => {
  it('flag off / any plan / walker → inactive (home as before)', () => {
    expect(resolveNewUserHome({ ...base, v2: false })).toEqual(INACTIVE_NEW_USER_HOME);
    expect(resolveNewUserHome({ ...base, programPlanMode: 'add' })).toEqual(INACTIVE_NEW_USER_HOME);
    expect(resolveNewUserHome({ ...base, programPlanMode: 'none' })).toEqual(INACTIVE_NEW_USER_HOME);
    expect(resolveNewUserHome({ ...base, isWalker: true })).toEqual(INACTIVE_NEW_USER_HOME);
  });
  it('no plan, never trained, no health data → only the start slides, widgets hidden', () => {
    expect(resolveNewUserHome(base)).toEqual({ active: true, startOnly: true, widgets: 'none' });
  });
  it('no plan, never trained, steps granted → only the steps card', () => {
    expect(resolveNewUserHome({ ...base, healthConnected: true }).widgets).toBe('steps');
  });
  it('the first workout brings the widgets back (lifetime, this week or today)', () => {
    expect(resolveNewUserHome({ ...base, workoutCount: 1 }).widgets).toBe('all');
    expect(resolveNewUserHome({ ...base, weekSessions: 1 }).widgets).toBe('all');
    expect(resolveNewUserHome({ ...base, todayWorkouts: 1 }).widgets).toBe('all');
  });
  it('the first workout brings the generated workouts back (start slides stay while there is no plan)', () => {
    expect(resolveNewUserHome({ ...base, workoutCount: 1 })).toEqual({ active: true, startOnly: false, widgets: 'all' });
  });
});
