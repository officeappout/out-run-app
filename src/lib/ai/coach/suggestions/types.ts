/**
 * Kelly phase 2 — context-aware quick replies: the shared vocabulary. Pure.
 *
 * A "situation" is what Kelly knows about the user's moment (hour, today's plan, a break,
 * a level gap, the weather). The server builds it from the user sheet every turn
 * (situationFromSheet), the app builds it from the profile for the first open
 * (situationFromProfile). suggestChips / placeholderHints read only this, so both sides
 * pick from the same rules (flag ai_coach_phase2).
 */
import type { CoachGender } from '../persona';
import type { CoachLocation } from '../tools';

export type WeatherHint = 'rain' | 'heat' | 'cold' | null;

export interface ChipSituation {
  gender: CoachGender;
  /** Israel hour 0-23. */
  hour: number;
  /** A training session is planned today (null = not known). */
  trainingDayToday: boolean | null;
  /** Today's planned strength session can be built now and is not done. */
  buildableToday: boolean;
  /** The user already trained today. */
  doneToday: boolean;
  /** Whole days since the last real workout; null = never trained. */
  daysAway: number | null;
  /** Never trained (or signed up just now). */
  newUser: boolean;
  /** Hebrew name of the first program without a level check, or null. */
  gapName: string | null;
  /** Rain / heat / cold now, when the weather feature is on for this user. */
  weather: WeatherHint;
}

/** What the last Kelly turn was about (decides the follow-up chips). */
export type LastTurn =
  | { kind: 'opening' }
  | { kind: 'workout'; location: CoachLocation | null; minutes: number | null; domains: string[] }
  | { kind: 'schedule' }
  | { kind: 'progress' }
  | { kind: 'app_help' }
  | { kind: 'proposal' }
  | { kind: 'handoff' }
  | { kind: 'safety' }
  | { kind: 'other' };

/**
 * One quick reply. `message` is what the chip sends to Kelly (the label when absent);
 * `openCard` opens the newest workout card instead of sending anything.
 */
export interface SuggestionChip {
  /** Stable id (tests, analytics); never shown. */
  id: string;
  label: string;
  message?: string;
  openCard?: true;
}

/** A calm-return break: this many days away or more. Same scale as calm return's first tier. */
export const RETURN_AFTER_DAYS = 4;
/** Chips per row. */
export const MAX_SUGGESTIONS = 3;
export const SUGGESTION_LABEL_MAX = 40;
export const SUGGESTION_MESSAGE_MAX = 120;
