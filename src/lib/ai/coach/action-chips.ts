/**
 * AI coach — action chips under a Kelly reply. Pure.
 *
 * Owner thread after #434: "מה מצפה לי השבוע? איך אני יודע מה יש לי באימונים" got only
 * counts and no way to SEE the week. A schedule answer now carries a chip that opens the
 * schedule screen (the training planner on /home), and, when today's planned session can
 * be built, a chip that asks Kelly to build it.
 *
 * Chips are decided by the server from the turn (deterministic, not by the model) and
 * stored on the assistant message as ids only; the app maps ids to label + target here, so
 * a stored message can never carry an arbitrary link.
 */
import type { UserContextSheet } from './context-sheet';
import { inferScheduleQuestion } from './intent';

export type CoachActionId = 'open_schedule' | 'build_today';

export const COACH_ACTION_IDS: readonly CoachActionId[] = ['open_schedule', 'build_today'];

/** The schedule screen: /home opens the full-screen training planner on this param. */
export const SCHEDULE_DEEP_LINK = '/home?openPlanner=true';

export interface CoachActionSpec {
  label: string;
  /** In-app route the chip navigates to. */
  href?: string;
  /** Or: the message the chip sends to Kelly. */
  message?: string;
}

export const COACH_ACTIONS: Record<CoachActionId, CoachActionSpec> = {
  open_schedule: { label: 'פתח את הלו״ז', href: SCHEDULE_DEEP_LINK },
  build_today: { label: 'בנה את האימון של היום', message: 'תבנה לי את האימון של היום' },
};

/** Every in-app link a chip can open (checked against src/app by a test). */
export const AI_COACH_CHIP_LINKS: readonly string[] = Object.values(COACH_ACTIONS)
  .map((a) => a.href)
  .filter((h): h is string => !!h);

export function isCoachActionId(v: unknown): v is CoachActionId {
  return typeof v === 'string' && (COACH_ACTION_IDS as readonly string[]).includes(v);
}

export interface ChipInput {
  /** The user message this turn answers. */
  userText: string;
  /** Tools called in this turn. */
  toolNames: string[];
  sheet: Pick<UserContextSheet, 'today'> | null;
}

/** The chips for a finished turn (none for a turn that built a workout: the card is the action). */
export function chipsForTurn(i: ChipInput): CoachActionId[] {
  if (i.toolNames.includes('generate_workout')) return [];
  const aboutSchedule = inferScheduleQuestion(i.userText) || i.toolNames.includes('get_schedule');
  if (!aboutSchedule) return [];
  const out: CoachActionId[] = ['open_schedule'];
  if ((i.sheet?.today ?? []).some((e) => e.buildNow && !e.completed)) out.push('build_today');
  return out;
}
