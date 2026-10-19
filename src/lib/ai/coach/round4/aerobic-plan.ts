/**
 * Kelly round 4 — plan_aerobic_session's decision. Pure (facts in, card + model result out).
 *
 * Never invents a pace: a run is either TODAY's run from the user's running program (the
 * map's planned-run flow materializes it with the user's own pace profile) or an easy run by
 * feel (talk test). Without a running program / pace profile the result tells Kelly to offer
 * the running questionnaire. A walk is a time or distance goal.
 *
 * The card opens the app's existing free run / walk drawer on the map pre-filled
 * (lib/planned-run.ts: goal + route extras + the run/walk + strength split), which also
 * suggests loop routes from the user's real position; a program run opens the planned-run
 * overview instead (resolved on the device, round4-actions.ts).
 *
 * Calm return: back after RETURN_DAYS+ days away → easy and short, never a "you missed" line.
 */
import type { AerobicCardView, AerobicKind } from './types';
import type { PlanAerobicInputT } from './tool-specs';

/** Same threshold as calm return's first lightened tier (lib/calm-return/policy.ts, 4 days). */
export const RETURN_DAYS = 4;
export const DEFAULT_WALK_MIN = 30;
export const DEFAULT_RUN_MIN = 25;
export const RETURN_RUN_MAX_MIN = 20;
export const RETURN_WALK_MAX_MIN = 30;
/** Only to size a walking loop (never shown as a pace): about 5 km/h. */
const WALK_KM_PER_MIN = 5 / 60;
/** The map's run/walk + strength split when strength stops are on (aerobic share). */
export const STRENGTH_STOPS_AEROBIC_SHARE = 0.6;

export interface AerobicFacts {
  /** profile.running: an active program with a schedule. */
  hasRunningProgram: boolean;
  /** profile.running.paceProfile.basePace > 0. */
  hasPaceProfile: boolean;
  /** The sheet's today has a running (cardio) session that is not completed. */
  plannedRunToday: boolean;
  /** Whole days since the last real workout (calm-return getDaysAway), null = unknown. */
  daysAway: number | null;
}

export interface AerobicPlan {
  kind: AerobicKind;
  activity: 'running' | 'walking';
  minutes: number | null;
  distanceKm: number | null;
  goal: { type: 'time' | 'distance'; value: number };
  cue: string;
  title: string;
  strengthStops: boolean;
  /** Loop length to look for (km), null = don't look (no length to size it by). */
  routeTargetKm: number | null;
  returning: boolean;
  offerQuestionnaire: boolean;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export const EASY_RUN_CUE = 'קצב שיחה: אפשר לדבר במשפטים מלאים';
export const WALK_CUE = 'הליכה נמרצת בקצב נוח';
export const PROGRAM_RUN_CUE = 'לפי הקצבים של תוכנית הריצה שלך';

function titleOf(kind: AerobicKind, minutes: number | null, km: number | null, stops: boolean): string {
  const amount = km ? `${km} ק״מ` : minutes ? `${minutes} דקות` : '';
  const base =
    kind === 'program_run' ? 'הריצה של היום מהתוכנית' : kind === 'walk' ? `הליכה${amount ? ` של ${amount}` : ''}` : `ריצה קלה${amount ? ` של ${amount}` : ''}`;
  return stops ? `${base} עם תחנות כוח` : base;
}

export function planAerobic(input: PlanAerobicInputT, facts: AerobicFacts): AerobicPlan {
  const returning = facts.daysAway !== null && facts.daysAway >= RETURN_DAYS;
  const walk = input.activity === 'walk';
  const named = input.durationMin !== undefined || input.distanceKm !== undefined;
  const kind: AerobicKind = walk
    ? 'walk'
    : facts.hasRunningProgram && facts.hasPaceProfile && facts.plannedRunToday && !named && !input.strengthStops && !returning
      ? 'program_run'
      : 'easy_run';

  let minutes: number | null = null;
  let distanceKm: number | null = null;
  if (kind !== 'program_run') {
    if (input.distanceKm !== undefined) distanceKm = round1(input.distanceKm);
    else minutes = input.durationMin ?? (walk ? DEFAULT_WALK_MIN : DEFAULT_RUN_MIN);
    if (returning && minutes !== null) minutes = Math.min(minutes, walk ? RETURN_WALK_MAX_MIN : RETURN_RUN_MAX_MIN);
  }
  const goal: AerobicPlan['goal'] =
    distanceKm !== null ? { type: 'distance', value: distanceKm } : { type: 'time', value: minutes ?? DEFAULT_RUN_MIN };
  const routeTargetKm = distanceKm ?? (walk && minutes ? round1(Math.max(1, minutes * WALK_KM_PER_MIN)) : null);
  return {
    kind,
    activity: walk ? 'walking' : 'running',
    minutes,
    distanceKm,
    goal,
    cue: kind === 'walk' ? WALK_CUE : kind === 'program_run' ? PROGRAM_RUN_CUE : EASY_RUN_CUE,
    title: titleOf(kind, minutes, distanceKm, input.strengthStops),
    strengthStops: input.strengthStops,
    routeTargetKm: input.withRoute ? routeTargetKm : null,
    returning,
    offerQuestionnaire: !walk && !(facts.hasRunningProgram && facts.hasPaceProfile),
  };
}

export interface RouteOutcome {
  status: 'found' | 'map';
  distanceKm?: number;
}

export function aerobicCard(plan: AerobicPlan, route: RouteOutcome, id: string): AerobicCardView {
  return {
    id,
    kind: plan.kind,
    title: plan.title,
    minutes: plan.minutes,
    distanceKm: plan.distanceKm,
    cue: plan.cue,
    strengthStops: plan.strengthStops,
    route: route.status === 'found' && route.distanceKm ? { status: 'found', distanceKm: round1(route.distanceKm) } : { status: 'map' },
    goal: plan.goal,
  };
}

/** What the model reads back (the card is already shown). */
export function aerobicToolResult(plan: AerobicPlan, card: AerobicCardView): Record<string, unknown> {
  const notes: string[] = [];
  if (plan.kind === 'program_run') {
    notes.push("This card opens today's run from the user's running program; its paces come from their own pace profile. Say it is today's run from their program. Never state a pace, minutes or distance for it.");
  }
  if (plan.kind === 'easy_run') {
    notes.push(`An easy run by feel: the user should be able to talk in full sentences (about 3 to 4 out of 10). Never state a pace.`);
  }
  if (plan.offerQuestionnaire) {
    notes.push('The user has no running program with a pace profile yet. In one short sentence offer the short running questionnaire for a personal plan with paces: a button under your reply starts it.');
  }
  if (plan.returning) {
    notes.push('The user is back after a few days off: keep it easy and short and welcome them back warmly. Never mention missed workouts.');
  }
  if (plan.strengthStops) {
    notes.push('Strength stations along the way: the map plans the route with stops at outdoor gyms.');
  }
  if (card.route.status === 'found') {
    notes.push(`A loop of about ${card.route.distanceKm} km was found near the user's area. When they open the card, the map shows loop routes to pick from.`);
  } else {
    notes.push('No route is attached: when they open the card they can pick a route on the map (a button under your reply too).');
  }
  return {
    shownToUserAsCard: true,
    kind: card.kind,
    title: card.title,
    minutes: card.minutes,
    distanceKm: card.distanceKm,
    effortCue: card.cue,
    strengthStops: card.strengthStops,
    route: card.route,
    notesForCoach: notes,
  };
}
