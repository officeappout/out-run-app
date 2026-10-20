/**
 * Add-track routing (enable_home_v2, journeys J3 / J4 — boards jr/J3-*, J4-*).
 *
 *  J3  strength user adds running:  … running-plan-length → running-schedule (hand-off,
 *      ADD_TRACK_COMBINED_WEEK_ROUTE) → add-track-week?added=running (combined week →
 *      reminders) → health (already accepted → silent skip + the COMPLETED sync that builds
 *      the run plan from the saved days) → home.
 *  J4  runner adds strength:  program-path → assessment-visual (result accepted, synced) →
 *      add-track-week?added=strength (combined week → reminders) → home.
 *
 * Flag off never reaches any of this: every caller passes v2 = false → today's routes.
 */
import type { AddedTrack } from '@/features/schedule/add-track/addTrackProfile';

export const ADD_TRACK_WEEK_PATH = '/onboarding-new/add-track-week';
export const HEALTH_ROUTE = '/onboarding-new/health';
export const HOME_ROUTE = '/home';

export function addTrackWeekRoute(added: AddedTrack): string {
  return `${ADD_TRACK_WEEK_PATH}?added=${added}`;
}

export function parseAddedTrack(value: string | null | undefined): AddedTrack | null {
  return value === 'running' || value === 'strength' ? value : null;
}

/**
 * Where the strength signup goes after the result is accepted. Today: the health page.
 * v2 + the user already runs + the health declaration is already signed → the combined
 * week (the declaration is never asked twice; an unsigned one still goes to health first).
 */
export function strengthResultNextRoute(input: { v2: boolean; hasRunningTrack: boolean; healthAccepted: boolean }): string {
  return input.v2 && input.hasRunningTrack && input.healthAccepted ? addTrackWeekRoute('strength') : HEALTH_ROUTE;
}

/**
 * After the reminders step. A new RUNNING track still needs the signup's COMPLETED sync
 * (it builds the run plan from the saved days) — the health page runs it and, the
 * declaration being signed already, skips itself on the way home. A new strength track
 * was synced when its result was accepted, so it goes straight home.
 */
export function addTrackDoneRoute(added: AddedTrack): string {
  return added === 'running' ? HEALTH_ROUTE : HOME_ROUTE;
}
