/**
 * Add-second-track week (S-6b / S-6c; engine v2 via add-track/addTrackWeek) ⇄ week builder.
 *
 * Every session remembers where it sat in the user's saved week (homeDow): kept sessions on
 * their own day, moved ones on the day the engine moved them from, new ones nowhere. After
 * the user's own moves the status is re-derived from that (same day = נשאר, other day = הוזז,
 * no home = חדש), which is exactly what the add-track save reads (planAddTrackSave: a moved
 * strength session takes its stored ids along). Pure.
 */
import type { ScheduleEngineInput, TimeWindow } from '../../engine-v2/types';
import { windowOfTime } from '../../utils/runWeekRecommendation';
import type { AddTrackDayView, AddTrackSessionView, AddTrackWeekView } from '../../add-track/addTrackWeek';
import { explainWeek } from '../explain';
import type { WbRules, WbSession, WbWeek } from '../types';
import { detailLineHe, emptyWeek, runMinutes } from './shared';

export interface AddTrackWbData {
  kind: 'run' | 'strength';
}

export interface AddTrackWbContext {
  /** Days the combined week may use (addTrackOpenDays). */
  openDays: readonly number[];
  times: { run: string; strength: string };
}

/** The caps the combined week is validated by — the very ones the engine built it with. */
export function addTrackRules(input: ScheduleEngineInput): WbRules {
  return {
    maxPerDay: input.availability.maxSessionsPerDay,
    maxTrainingDays: input.availability.maxTrainingDays,
    runLevel: input.levels.running,
  };
}

const homeOf = (s: AddTrackSessionView, dow: number): number | null =>
  s.status === 'kept' ? dow : s.status === 'moved' ? s.fromDow ?? null : null;

export function addTrackWeekToWb(view: AddTrackWeekView, ctx: AddTrackWbContext, rules: WbRules): WbWeek<AddTrackWbData> {
  const strengthWindow: TimeWindow = windowOfTime(ctx.times.strength) ?? 'evening';
  const runWindow: TimeWindow = windowOfTime(ctx.times.run) ?? 'morning';
  const week = emptyWeek<AddTrackWbData>(ctx.openDays, {}, strengthWindow);
  const seen = new Map<string, number>();
  for (const day of view.days) {
    if (day.sessions.some((s) => s.kind === 'run')) week.days[day.dow].window = runWindow;
    // A day the engine used is a day the user trains (it may be outside the open pool, e.g. Saturday marked earlier).
    if (day.sessions.length) week.days[day.dow].open = true;
    for (const s of day.sessions) {
      const key = s.kind === 'run' ? `run-${s.slot}` : `strength-${s.slug}`;
      const n = seen.get(key) ?? 0;
      seen.set(key, n + 1);
      const minutes = s.kind === 'run' && s.slot ? runMinutes(s.slot) : undefined;
      const session: WbSession<AddTrackWbData> = {
        id: `${key}-${n}`,
        track: s.kind,
        slot: s.slot,
        slug: s.slug,
        titleHe: s.nameHe,
        detailHe: detailLineHe(minutes, s.kind === 'run' ? runWindow : strengthWindow),
        minutes,
        homeDow: homeOf(s, day.dow),
        isNew: s.status === 'new',
        data: { kind: s.kind },
      };
      week.days[day.dow].sessions.push(session);
    }
  }
  week.warningsHe = [...view.warningsHe];
  const longRun = view.days.find((d) => d.sessions.some((s) => s.slot === 'long_run'))?.dow ?? null;
  const explained = explainWeek(week, { ...rules, preferredLongRunDay: rules.preferredLongRunDay ?? longRun });
  // Keep the engine's own diff notes ("הוזז: … · כי …") on the days it moved something.
  explained.days.forEach((day) => {
    const moved = view.days[day.dow]?.sessions.find((s) => s.status === 'moved' && s.noteHe);
    if (moved) day.whyHe = moved.noteHe;
  });
  return explained;
}

/** Status after the user's edits: from the session's home day. */
export function sessionStatus(s: Pick<WbSession, 'homeDow'>, dow: number): AddTrackSessionView['status'] {
  if (s.homeDow == null) return 'new';
  return s.homeDow === dow ? 'kept' : 'moved';
}

/** The edited week back to the rows planAddTrackSave reads. */
export function wbToAddTrackDays(week: WbWeek<AddTrackWbData>): AddTrackDayView[] {
  return week.days.map((day) => ({
    dow: day.dow,
    sessions: day.sessions.map((s): AddTrackSessionView => {
      const status = sessionStatus(s, day.dow);
      return {
        kind: s.track === 'run' ? 'run' : 'strength',
        slot: s.slot,
        slug: s.slug,
        nameHe: s.titleHe,
        status,
        fromDow: status === 'moved' ? s.homeDow ?? undefined : undefined,
        noteHe: status === 'kept' ? 'נשאר כמו שהיה' : day.whyHe,
      };
    }),
  }));
}
