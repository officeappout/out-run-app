/**
 * Kelly in the week builder (enable_week_builder_v1, owner 22.10) — propose_schedule_change in
 * BUILDER MODE, decided purely. The week is the DRAFT on screen (builder-context.ts), not the
 * saved schedule: each requested move is resolved to the builder session on its `from` day and
 * checked with the builder's own move logic (moveSession: layout → engine-v2 hard rules, the
 * same check a drag gets), one after the other. Invalid moves are skipped with the drag's own
 * Hebrew reason. Every track moves (strength, run, walk). Nothing is planned or written: the
 * proposal carries raw moves that the app applies to the week on screen.
 */
import { moveSession } from '@/features/schedule/week-builder/moveSession';
import { findSession } from '@/features/schedule/week-builder/layout';
import type { WbTrack, WbWeek } from '@/features/schedule/week-builder/types';
import type { SchedulePlan } from '@/features/schedule/services/scheduleBuilderSave.plan';
import { WEEKDAY_NAMES_HE } from '../context-sheet';
import { builderWeekOf, type BuilderContext, type BuilderMove } from './builder-context';
import { WEEKDAYS_EN, type ProposeScheduleChangeInputT } from './types';

export type BuilderSkipCode = 'no_session_on_day' | 'which_session' | 'refused';

export interface BuilderSkip {
  from: number;
  to: number;
  code: BuilderSkipCode;
  /** Hebrew, short: the drag's own reason for 'refused'. */
  reasonHe: string;
}

export type BuilderProposalBuild =
  | { ok: true; title: string; lines: string[]; moves: BuilderMove[]; skipped: BuilderSkip[] }
  | { ok: false; reason: 'use_days_picker' | 'nothing_valid'; skipped: BuilderSkip[] };

/** A builder proposal's plan: writes nothing (and lifecycle never releases it anyway). */
export const EMPTY_BUILDER_PLAN: SchedulePlan = {
  scope: 'this_week',
  recurringTemplate: null,
  lifestyleScheduleDays: null,
  runningScheduleDays: null,
  runningFrequency: null,
  runningSkipped: null,
  dayOverrides: [],
  prefs: { availableDayCount: 0, focus: 0 },
};

const dayHe = (dow: number) => `יום ${WEEKDAY_NAMES_HE[dow]}`;

function pickSession(week: WbWeek, dow: number, track: WbTrack | undefined): { id: string; titleHe: string } | BuilderSkipCode {
  const movable = week.days[dow].sessions.filter((s) => !s.locked && (!track || s.track === track));
  if (movable.length === 0) return 'no_session_on_day';
  if (movable.length > 1) return 'which_session';
  return { id: movable[0].id, titleHe: movable[0].titleHe };
}

export function buildBuilderProposal(ctx: BuilderContext, req: ProposeScheduleChangeInputT): BuilderProposalBuild {
  if (!req.moves?.length) return { ok: false, reason: 'use_days_picker', skipped: [] };
  const { week: start, rules } = builderWeekOf(ctx);
  let week = start;
  const moves: BuilderMove[] = [];
  const lines: string[] = [];
  const skipped: BuilderSkip[] = [];

  for (const m of req.moves) {
    const from = WEEKDAYS_EN.indexOf(m.from);
    const to = WEEKDAYS_EN.indexOf(m.to);
    const picked = pickSession(week, from, m.track);
    if (typeof picked === 'string') {
      skipped.push({ from, to, code: picked, reasonHe: picked === 'no_session_on_day' ? `אין אימון שאפשר להזיז ב${dayHe(from)}` : `יש שני אימונים ב${dayHe(from)}` });
      continue;
    }
    const r = moveSession(week, { sessionId: picked.id, toDow: to }, rules);
    if (!r.ok) {
      skipped.push({ from, to, code: 'refused', reasonHe: r.reasonHe });
      continue;
    }
    const swapped = r.swappedWith ? findSession(week, r.swappedWith)?.session.titleHe : null;
    lines.push(
      swapped
        ? `${picked.titleHe} של ${dayHe(from)} מתחלף עם ${swapped} של ${dayHe(to)}`
        : `${picked.titleHe} עובר מ${dayHe(from)} ל${dayHe(to)}`,
    );
    moves.push({ from, to, sessionId: picked.id });
    week = r.week;
  }

  if (moves.length === 0) return { ok: false, reason: 'nothing_valid', skipped };
  return { ok: true, title: 'שינוי בשבוע שעל המסך', lines, moves, skipped };
}

/** What the model reads back in builder mode. English instructions; Hebrew facts. */
export function builderToolResult(b: BuilderProposalBuild): Record<string, unknown> {
  const skipped = b.skipped.map((s) => ({ from: WEEKDAYS_EN[s.from], to: WEEKDAYS_EN[s.to], code: s.code, reasonHe: s.reasonHe }));
  if (b.ok) {
    return {
      proposalOnly: true,
      savedNothing: true,
      weekOnScreen: true,
      changes: b.lines,
      ...(skipped.length ? { skipped } : {}),
      noteForCoach:
        'Nothing was changed yet. A card under your reply lets the user update the week ON SCREEN with one tap; the week is saved only when they then tap "אישור השבוע". In one or two short sentences say what will change on the card' +
        (skipped.length ? ' and, briefly, why the skipped moves could not be made (use reasonHe).' : '.') +
        ' Never say you changed, moved or saved anything.',
    };
  }
  const note =
    b.reason === 'use_days_picker'
      ? 'How many days a week is changed with the days picker at the top of the week on screen, not here. Say so in one short sentence.'
      : 'None of these moves can be made in the week on screen. Say why in one short sentence (use reasonHe; for which_session ask whether they meant the strength, run or walk session) and offer another day.';
  return { proposalOnly: true, created: false, reason: b.reason, ...(skipped.length ? { skipped } : {}), noteForCoach: note };
}
