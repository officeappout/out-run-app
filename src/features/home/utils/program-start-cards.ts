/**
 * Home v2 (enable_home_v2) — which "start a program" / "add a track" slide the
 * daily carousel shows, and in which order (canvas "שאלון לו״ז" row 7,
 * boards S-7b / S-7c / S-7d / S-6d). Pure: the caller passes the
 * already-resolved track state, the running-intent signal and the local
 * dismissals — no reads here.
 *
 * Rules:
 *  - No track at all → ONE slide with two equal start cards (strength +
 *    running). Strength first by default; running first when the user arrived
 *    with a running intent (see hasRunningIntent).
 *  - Exactly one track → the other track's "רוצה להוסיף …?" card, unless the
 *    user tapped "לא עכשיו" within the last 14 days (stored locally).
 *  - Both tracks → nothing.
 *  - Flag off → nothing (home keeps today's AddStrengthProgramCard path).
 *
 * placeProgramSlide then puts the slide in the carousel: a start pair leads
 * (it IS the new user's day); an add card goes second, right after the day's
 * first card (S-6d: "שקופית שנייה, אחרי האימון של היום").
 */

export type ProgramTrack = 'strength' | 'running';

export type ProgramSlidePlan =
  | { mode: 'none' }
  | { mode: 'start'; order: readonly [ProgramTrack, ProgramTrack] }
  | { mode: 'add'; track: ProgramTrack };

export interface ResolveProgramSlideInput {
  enabled: boolean;
  hasStrength: boolean;
  hasRunning: boolean;
  /** The user arrived with a running intent (see hasRunningIntent). */
  runningIntent: boolean;
  /** "לא עכשיו" is still active for that track's add card. */
  addDismissed?: Partial<Record<ProgramTrack, boolean>>;
}

export const ADD_TRACK_DISMISS_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

export function resolveProgramSlide(input: ResolveProgramSlideInput): ProgramSlidePlan {
  const { enabled, hasStrength, hasRunning, runningIntent, addDismissed = {} } = input;
  if (!enabled) return { mode: 'none' };
  if (!hasStrength && !hasRunning) {
    return { mode: 'start', order: runningIntent ? ['running', 'strength'] : ['strength', 'running'] };
  }
  if (hasStrength && hasRunning) return { mode: 'none' };
  const missing: ProgramTrack = hasStrength ? 'running' : 'strength';
  return addDismissed[missing] ? { mode: 'none' } : { mode: 'add', track: missing };
}

/**
 * Running intent from signals that already exist — no new fields:
 *  - lifestyle.primaryTrack 'run' (persona-derived track),
 *  - lifestyle.dashboardMode 'RUNNING' (explicit dashboard override),
 *  - the local `gateway_track` onboarding pref still reading 'RUNNING'
 *    (the gateway's "ריצה" choice, before the flow consumed it).
 * The profile holds no campaign / utm field and the map's activity mode is not
 * persisted, so those can't be read here.
 */
export function hasRunningIntent(
  profile: { lifestyle?: { primaryTrack?: unknown; dashboardMode?: unknown } | null } | null | undefined,
  gatewayTrackPref?: string | null,
): boolean {
  const lifestyle = profile?.lifestyle;
  return (
    lifestyle?.primaryTrack === 'run'
    || lifestyle?.dashboardMode === 'RUNNING'
    || gatewayTrackPref === 'RUNNING'
  );
}

/** "לא עכשיו" was tapped less than 14 days ago. A bad / future stamp counts as not dismissed. */
export function isAddDismissActive(dismissedAtMs: number | null | undefined, nowMs: number): boolean {
  if (dismissedAtMs == null || !Number.isFinite(dismissedAtMs)) return false;
  const age = nowMs - dismissedAtMs;
  return age >= 0 && age < ADD_TRACK_DISMISS_DAYS * DAY_MS;
}

/** Inserts the program slide into the carousel's items per the plan (unchanged for 'none'). */
export function placeProgramSlide<T>(items: readonly T[], slide: T, plan: ProgramSlidePlan): T[] {
  if (plan.mode === 'none') return [...items];
  if (plan.mode === 'start' || items.length === 0) return [slide, ...items];
  return [items[0], slide, ...items.slice(1)];
}
