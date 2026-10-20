/**
 * Run signup route order.
 *
 *  flag off (today):        dynamic → running-schedule → running-plan-length → running-summary
 *  enable_home_v2 (J2-03..J2-10): dynamic → running-plan-length → running-schedule → running-summary
 *
 * v2 asks the plan length first so the days step can recommend the plan's
 * real week (boards jr/J2-05 → J2-06); the reminders step lives inside the
 * running-schedule route, right before the summary (J2-09 → J2-10).
 */
import { addTrackWeekRoute } from './add-track-routing';

export const RUN_SIGNUP_ROUTES = {
  schedule: '/onboarding-new/running-schedule',
  planLength: '/onboarding-new/running-plan-length',
  summary: '/onboarding-new/running-summary',
} as const;

export type RunSignupScreen = 'dynamic' | 'running-schedule' | 'running-plan-length';

export function runSignupNextRoute(from: RunSignupScreen, v2: boolean): string {
  if (from === 'dynamic') return v2 ? RUN_SIGNUP_ROUTES.planLength : RUN_SIGNUP_ROUTES.schedule;
  if (from === 'running-plan-length') return v2 ? RUN_SIGNUP_ROUTES.schedule : RUN_SIGNUP_ROUTES.summary;
  return v2 ? RUN_SIGNUP_ROUTES.summary : RUN_SIGNUP_ROUTES.planLength;
}

/**
 * Journeys J3 / S-6b — a runner who ALREADY trains strength (runScheduleStepMode →
 * 'add_track') gets the combined strength + run week, not the run-only days step: the
 * running-schedule page hands those users off (router.replace) to this route.
 */
export const ADD_TRACK_COMBINED_WEEK_ROUTE: string | null = addTrackWeekRoute('running');
