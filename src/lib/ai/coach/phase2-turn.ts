/**
 * Kelly phase 2 — what a finished turn adds under Kelly's reply (flag ai_coach_phase2). Pure.
 *
 *   suggestions  2-3 context-aware quick replies (suggestions/suggest-chips.ts)
 *   actions      + "סדר לי את השבוע" (open_builder) when propose_schedule_change could not
 *                prepare the change from the chat (its note tells Kelly to offer the builder)
 *
 * Off (the route never calls this) = the turn's actions exactly as before, no suggestions.
 */
import type { CoachActionId } from './action-chips';
import type { UserContextSheet } from './context-sheet';
import type { CoachGender } from './persona';
import { PROPOSE_TOOL } from './schedule-proposal/claims';
import { lastTurnFrom, situationFromSheet, suggestChips, type SuggestionChip } from './suggestions';

export interface Phase2TurnInput {
  sheet: UserContextSheet | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw Firestore profile, read through field guards
  profile: Record<string, any> | null;
  gender: CoachGender;
  now: Date;
  todayKey: string;
  hour: number;
  userText: string;
  toolNames: string[];
  /** generate_workout input of this turn (when a workout card was built). */
  workoutInput?: { location?: unknown; durationMin?: unknown; domains?: unknown } | null;
  /** A proposal card was prepared this turn. */
  proposalCreated: boolean;
  /** The turn's action chips so far (chipsForTurn). */
  actions: CoachActionId[];
}

export function phase2TurnExtras(i: Phase2TurnInput): { actions: CoachActionId[]; suggestions: SuggestionChip[] } {
  const actions = [...i.actions];
  if (i.toolNames.includes(PROPOSE_TOOL) && !i.proposalCreated && !actions.includes('open_builder')) actions.push('open_builder');
  const situation = situationFromSheet({ sheet: i.sheet, gender: i.gender, hour: i.hour, todayKey: i.todayKey, profile: i.profile, now: i.now });
  const last = lastTurnFrom({ userText: i.userText, toolNames: i.toolNames, workout: i.workoutInput ?? null, proposal: i.proposalCreated });
  return { actions, suggestions: suggestChips(situation, last, { lastUserText: i.userText, actions }) };
}
