/**
 * A new user's home (enable_home_v2, owner 20.10.2026) — no strength program, no run
 * plan, no walk plan yet. PURE.
 *
 *  - the questionnaire start cards leave the carousel: full-width compact rows right
 *    under the week strip, the page's primary thing (startRows);
 *  - the generated-workout carousel stays, secondary, under them ("או אימון מהיר עכשיו");
 *  - before the first workout, the tabs block is noise: the strength tab and weekly
 *    activity / consistency are empty — only the steps card stays, and only with health
 *    data; without it the whole block hides (widgets). The first workout brings it back.
 * Users with any plan → inactive, everything as before.
 */
export type NewUserWidgets = 'all' | 'steps' | 'none';

export interface NewUserHomeInput {
  v2: boolean;
  /** The program slide plan's mode (resolveProgramSlide): 'start' = no track at all. */
  programPlanMode: 'none' | 'start' | 'add';
  isWalker: boolean;
  /** progression.workoutCount (lifetime). */
  workoutCount: number | null | undefined;
  /** Sessions in this week's activity summary (any category). */
  weekSessions: number;
  /** Workout docs today. */
  todayWorkouts: number;
  /** useHealthConnected(): true = steps permission granted. */
  healthConnected: boolean | null | undefined;
}

export interface NewUserHome {
  active: boolean;
  startRows: boolean;
  widgets: NewUserWidgets;
}

export const INACTIVE_NEW_USER_HOME: NewUserHome = { active: false, startRows: false, widgets: 'all' };

export function resolveNewUserHome(input: NewUserHomeInput): NewUserHome {
  const { v2, programPlanMode, isWalker, workoutCount, weekSessions, todayWorkouts, healthConnected } = input;
  if (!v2 || programPlanMode !== 'start' || isWalker) return INACTIVE_NEW_USER_HOME;
  const neverTrained = !(Number(workoutCount) > 0) && weekSessions <= 0 && todayWorkouts <= 0;
  return {
    active: true,
    startRows: true,
    widgets: !neverTrained ? 'all' : healthConnected === true ? 'steps' : 'none',
  };
}
