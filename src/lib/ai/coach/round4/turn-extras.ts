/**
 * Kelly round 4 — the chips a finished turn adds (flag ai_coach_round4). Pure, deterministic
 * (decided from the turn, never by the model), like action-chips.ts.
 *
 *   running_questionnaire  an easy run for a user with no running program / pace profile
 *   pick_route_run|walk    no route attached to the aerobic card
 *   tour_* + open_help     start_tutorial ran (the tour of that chapter, or the help hub)
 *   show_how               an app-help answer (get_app_help) without a tutorial this turn
 *   find_parks             a home workout came back below the user's level or short of
 *                          exercises, and the parks were not looked up this turn
 *   open_builder           "rebuild my week" (the schedule builder does it; Kelly never writes)
 */
import type { CoachActionId } from '../action-chips';
import type { Round4TurnState } from './types';
import type { ReplayableTour } from '@/features/user/onboarding/services/tour-replay';

/** "תבנה לי מחדש את השבוע", "לו״ז חדש", "תסדר מחדש את התוכנית". */
const REBUILD_WEEK = /(?:מחדש[^.?!\n]{0,25}(?:לו["״׳']?ז|שבוע|תוכנית|תכנית)|(?:לו["״׳']?ז|שבוע|תוכנית|תכנית)[^.?!\n]{0,25}מחדש|(?:לו["״׳']?ז|שבוע)\s+חדש)/;

export function isRebuildWeekRequest(text: string): boolean {
  return REBUILD_WEEK.test((text ?? '').normalize('NFC'));
}

/** Help chapter (start_tutorial topic) → its tour chip. Running → the route tour (a preview). */
const TOUR_CHIP: Record<string, CoachActionId> = {
  map: 'tour_map', workouts: 'tour_workouts', schedule: 'tour_schedule', running: 'tour_route',
};

/** Every tour chip, by tour (each replayable tour has one — unit-tested). */
export const TOUR_CHIP_BY_TOUR: Record<ReplayableTour, CoachActionId> = {
  home: 'tour_workouts',
  plan: 'tour_plan',
  map: 'tour_map',
  route: 'tour_route',
  'route-player': 'tour_route_player',
  player: 'tour_player',
  station: 'tour_station',
  community: 'tour_community',
};
const MAX_CHIPS = 4;

export interface Round4TurnInput {
  state: Round4TurnState | null;
  toolNames: string[];
  userText: string;
  /** The workout built this turn: where, and whether the engine flagged a content gap. */
  workout?: { location?: string; levelCeiling?: boolean; shortOfMinimum?: boolean } | null;
  actions: CoachActionId[];
}

export function round4TurnActions(i: Round4TurnInput): CoachActionId[] {
  const out = [...i.actions];
  const add = (id: CoachActionId) => {
    if (!out.includes(id) && out.length < MAX_CHIPS) out.push(id);
  };
  const st = i.state;
  if (st?.offerQuestionnaire) add('running_questionnaire');
  if (st?.pickRoute) add(st.pickRoute === 'walking' ? 'pick_route_walk' : 'pick_route_run');
  if (st?.tutorial) {
    const tour = TOUR_CHIP[st.tutorial];
    if (tour) add(tour);
    add('open_help');
  } else if (i.toolNames.includes('get_app_help')) {
    add('show_how');
  }
  const w = i.workout;
  const gap = !!w && (w.levelCeiling === true || w.shortOfMinimum === true) && (w.location === 'home' || w.location === 'office');
  if (gap && !i.toolNames.includes('find_nearby_parks')) add('find_parks');
  if (isRebuildWeekRequest(i.userText) && !i.toolNames.includes('propose_schedule_change')) add('open_builder');
  return out;
}
