/**
 * Calm return — the owner-approved policy for a user who comes back after missing
 * workouts (CALM_RETURN_V1, panel flag enable_calm_return_v1, default OFF).
 *
 * Most users aren't pros: a return should cost them as little attention as possible.
 * Days since the last real workout (getDaysAway — one source of truth):
 *
 *   0–3   on_track      nothing changes (at most a makeup offer for the latest missed
 *                       session ≤2 days old, as today's card — never a banner/popup).
 *   4–6   welcome_back  only the workout card's title/subtitle changes. Strength sets
 *                       −20%, no difficulty 3; running: easy run only.
 *   7–27  fresh_start   a silent fresh week from today (no backlog, program position
 *                       kept) + ONE card on the first open. Week 1: strength −30%,
 *                       difficulty ≤2; running −20% volume, intervals → easy.
 *   28+   re_entry      the same single card + an optional "רוצה לבדוק רמה?" link; a
 *                       2-week re-entry: strength −40% week 1, −20% week 2. Never an
 *                       automatic trip to the level questionnaire / onboarding.
 *
 * Thresholds match the schedule advisor (#440: MAKEUP_MAX_AGE_DAYS 2,
 * WELCOME_BACK_GAP_DAYS 4, FRESH_START_GAP_DAYS 7) so both read the same day as the same
 * mode. Pure: no Firebase, no clock — `now` is passed in.
 */
import { daysBetweenLocalDays, localDayKey, toDateOrNull } from './days-away';

export type ReturnTier = 'on_track' | 'welcome_back' | 'fresh_start' | 're_entry';

export const MAKEUP_MAX_AGE_DAYS = 2;
export const WELCOME_BACK_GAP_DAYS = 4;
export const FRESH_START_GAP_DAYS = 7;
export const RE_ENTRY_GAP_DAYS = 28;

/** Weeks of lighter load an episode lasts, by the tier that started it. */
export const EPISODE_WEEKS: Record<'fresh_start' | 're_entry', number> = {
  fresh_start: 1,
  re_entry: 2,
};

/**
 * A return "episode" — written once to users/{uid}.calmReturn by the first app open after
 * a 7+ day gap. It is what makes the lighter week last a week (after the first workout
 * back, daysAway is 0 again) and what keeps the fresh-week card to ONE open.
 */
export interface CalmReturnEpisode {
  /** Local calendar day the fresh week started, 'YYYY-MM-DD'. */
  startDate: string;
  tier: 'fresh_start' | 're_entry';
  v: 1;
}

export interface CalmLoad {
  /** Fraction of strength sets removed (0 = unchanged). */
  strengthVolumeReduction: number;
  /** Highest strength difficulty offered (3 = unchanged). */
  strengthMaxDifficulty: 1 | 2 | 3;
  /** Fraction of running volume removed (0 = unchanged). */
  runVolumeReduction: number;
  /** Quality runs (intervals, tempo, hills, fartlek) become an easy run. */
  runEasyOnly: boolean;
}

export const NO_CHANGE_LOAD: CalmLoad = Object.freeze({
  strengthVolumeReduction: 0,
  strengthMaxDifficulty: 3,
  runVolumeReduction: 0,
  runEasyOnly: false,
}) as CalmLoad;

/** The load table, per tier and week of the episode. */
export const CALM_LOADS = {
  welcome_back: { strengthVolumeReduction: 0.2, strengthMaxDifficulty: 2, runVolumeReduction: 0, runEasyOnly: true },
  fresh_start_w1: { strengthVolumeReduction: 0.3, strengthMaxDifficulty: 2, runVolumeReduction: 0.2, runEasyOnly: true },
  re_entry_w1: { strengthVolumeReduction: 0.4, strengthMaxDifficulty: 2, runVolumeReduction: 0.2, runEasyOnly: true },
  // Week 2 of a 28+ return: the owner set strength −20%; running is not specified, so it
  // matches the 4–6 day tier (easy runs, full volume) — the gentlest step back up.
  re_entry_w2: { strengthVolumeReduction: 0.2, strengthMaxDifficulty: 2, runVolumeReduction: 0, runEasyOnly: true },
} as const satisfies Record<string, CalmLoad>;

export function tierForDaysAway(daysAway: number | null | undefined): ReturnTier {
  if (daysAway == null || daysAway < WELCOME_BACK_GAP_DAYS) return 'on_track';
  if (daysAway < FRESH_START_GAP_DAYS) return 'welcome_back';
  if (daysAway < RE_ENTRY_GAP_DAYS) return 'fresh_start';
  return 're_entry';
}

/** The stronger of two loads, field by field. */
export function strongerLoad(a: CalmLoad, b: CalmLoad): CalmLoad {
  return {
    strengthVolumeReduction: Math.max(a.strengthVolumeReduction, b.strengthVolumeReduction),
    strengthMaxDifficulty: Math.min(a.strengthMaxDifficulty, b.strengthMaxDifficulty) as CalmLoad['strengthMaxDifficulty'],
    runVolumeReduction: Math.max(a.runVolumeReduction, b.runVolumeReduction),
    runEasyOnly: a.runEasyOnly || b.runEasyOnly,
  };
}

function loadForEpisodeWeek(tier: CalmReturnEpisode['tier'], week: number): CalmLoad {
  if (tier === 're_entry') return week <= 1 ? CALM_LOADS.re_entry_w1 : CALM_LOADS.re_entry_w2;
  return CALM_LOADS.fresh_start_w1;
}

export interface CalmReturnState {
  daysAway: number | null;
  tier: ReturnTier;
  /** The episode in force (the stored one, or the one this open should start), else null. */
  episode: CalmReturnEpisode | null;
  /** 1-based week of `episode` as of `now`, else null. */
  episodeWeek: number | null;
  /** True when this open must write a NEW episode (and show the one fresh-week card). */
  shouldStartEpisode: boolean;
  load: CalmLoad;
  /** load differs from NO_CHANGE_LOAD. */
  isLightened: boolean;
}

function isEpisode(value: unknown): value is CalmReturnEpisode {
  const v = value as CalmReturnEpisode | null | undefined;
  return !!v && typeof v.startDate === 'string' && (v.tier === 'fresh_start' || v.tier === 're_entry');
}

/**
 * Everything calm return decides for one moment, from the gap and the stored episode.
 *
 * An episode "covers" the current gap when it started after the last workout — then this
 * open is NOT a new return (no second card, even if the user still hasn't trained). A gap
 * of 7+ days that no episode covers starts a new one, today.
 */
export function resolveCalmReturn(input: {
  daysAway: number | null;
  episode: unknown;
  now: Date;
}): CalmReturnState {
  const { daysAway, now } = input;
  const tier = tierForDaysAway(daysAway);
  const stored = isEpisode(input.episode) ? input.episode : null;
  const storedStart = stored ? toDateOrNull(stored.startDate) : null;
  const sinceStart = storedStart ? daysBetweenLocalDays(storedStart, now) : null;

  // Day of the last workout, in "days before now" — an episode covers this gap when it
  // started on a later day.
  const coversGap =
    stored != null && sinceStart != null && sinceStart >= 0 && daysAway != null && sinceStart < daysAway;

  let episode: CalmReturnEpisode | null = null;
  let episodeWeek: number | null = null;
  let shouldStartEpisode = false;

  if (tier === 'fresh_start' || tier === 're_entry') {
    if (coversGap) {
      episode = stored;
      episodeWeek = Math.floor(sinceStart! / 7) + 1;
    } else {
      episode = { startDate: localDayKey(now), tier, v: 1 };
      episodeWeek = 1;
      shouldStartEpisode = true;
    }
  } else if (stored && sinceStart != null && sinceStart >= 0) {
    const week = Math.floor(sinceStart / 7) + 1;
    if (week <= EPISODE_WEEKS[stored.tier]) {
      episode = stored;
      episodeWeek = week;
    }
  }

  let load: CalmLoad = NO_CHANGE_LOAD;
  if (tier === 'welcome_back') load = CALM_LOADS.welcome_back;
  if (tier === 'fresh_start') load = CALM_LOADS.fresh_start_w1;
  if (tier === 're_entry') load = CALM_LOADS.re_entry_w1;
  // Still away (7+ days, no workout since the episode began): week 1 of the tier above.
  // Back and training: the episode's own week decides.
  if (episode && episodeWeek != null && tier !== 'fresh_start' && tier !== 're_entry') {
    load = strongerLoad(load, loadForEpisodeWeek(episode.tier, episodeWeek));
  }

  const isLightened =
    load.strengthVolumeReduction > 0 ||
    load.strengthMaxDifficulty < 3 ||
    load.runVolumeReduction > 0 ||
    load.runEasyOnly;

  return { daysAway, tier, episode, episodeWeek, shouldStartEpisode, load, isLightened };
}
