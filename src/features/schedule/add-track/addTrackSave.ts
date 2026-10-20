/**
 * Add track — what "אשר את השבוע החדש" writes, decided purely (enable_home_v2, J3 / J4).
 * addTrackSave.service.ts executes it through the existing fields only:
 *
 *  - lifestyle.recurringTemplate: every day merged with mergeDayItems, so the other
 *    domain's ids are never clobbered. Strength ids follow their session (a moved legs day
 *    keeps the user's own legs id); a new strength day gets the new program's id. Running
 *    ids move with the run days only when the runs moved (J4).
 *  - lifestyle.scheduleDays: strength ∪ run letters (the field's union meaning).
 *  - running days (letters / indices) for the run writers (J3: the onboarding store →
 *    the signup's COMPLETED sync builds the plan; J4: completeRunningScheduleFirstChoice).
 *
 * Guard (the #517 rule — never clobber): a week with no strength day at all is not a
 * choice, so the template / scheduleDays are not written (null) instead of being emptied.
 */
import { DAY_LETTERS } from '../types/smartSchedule.types';
import { mergeDayItems } from '../services/mergeDayItems';
import type { AddedTrack } from './addTrackProfile';
import type { AddTrackDayView } from './addTrackWeek';

export interface AddTrackSavePlan {
  /** Full next template, or null = leave the stored one untouched. */
  recurringTemplate: Record<string, string[]> | null;
  /** strength ∪ run letters in week order, or null = leave untouched. */
  lifestyleScheduleDays: string[] | null;
  strengthDays: number[];
  runDays: number[];
  runLetters: string[];
  /** The run days differ from the stored ones (always true for a new running track). */
  runsChanged: boolean;
  /** One entry per session, for the reminder slots. */
  sessions: Array<{ dow: number; kind: 'run' | 'strength'; time: string }>;
}

export interface AddTrackSaveInput {
  added: AddedTrack;
  days: AddTrackDayView[];
  /** The stored template (read fresh right before saving). */
  template: Partial<Record<string, string[]>>;
  /** Stored strength ids per existing strength day (by day of week). */
  existingStrengthIds: Partial<Record<number, string[]>>;
  /** Ids for a NEW strength day (J4: the new program's id). */
  newStrengthIds: string[];
  /** Stored run letters (running.scheduleDays). */
  storedRunLetters: string[];
  isStrengthId: (id: string) => boolean;
  times: { run: string; strength: string };
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

export function planAddTrackSave(i: AddTrackSaveInput): AddTrackSavePlan {
  const strengthIds = new Map<number, string[]>();
  const runDays: number[] = [];
  const sessions: AddTrackSavePlan['sessions'] = [];

  for (const day of i.days) {
    for (const s of day.sessions) {
      sessions.push({ dow: day.dow, kind: s.kind, time: s.kind === 'run' ? i.times.run : i.times.strength });
      if (s.kind === 'run') {
        if (!runDays.includes(day.dow)) runDays.push(day.dow);
        continue;
      }
      const from = s.status === 'moved' ? s.fromDow : s.status === 'kept' ? day.dow : undefined;
      const stored = from !== undefined ? i.existingStrengthIds[from] : undefined;
      const ids = stored && stored.length ? stored : i.newStrengthIds;
      const cur = strengthIds.get(day.dow) ?? [];
      strengthIds.set(day.dow, Array.from(new Set([...cur, ...ids])));
    }
  }
  runDays.sort((a, b) => a - b);
  const runLetters = runDays.map((d) => DAY_LETTERS[d]);
  const runsChanged = i.added === 'running' || !sameSet(runLetters, i.storedRunLetters);
  const strengthDays = Array.from(strengthIds.keys()).filter((d) => (strengthIds.get(d) ?? []).length > 0).sort((a, b) => a - b);

  if (strengthDays.length === 0) {
    return { recurringTemplate: null, lifestyleScheduleDays: null, strengthDays, runDays, runLetters, runsChanged, sessions };
  }

  // Running ids move with the runs only when an existing running track's days changed (J4).
  const runningIds =
    i.added === 'strength' && runsChanged
      ? Array.from(new Set(Object.values(i.template).flatMap((ids) => (ids ?? []).filter((id) => !i.isStrengthId(id)))))
      : [];

  const next: Record<string, string[]> = {};
  DAY_LETTERS.forEach((letter, dow) => {
    let ids = mergeDayItems(i.template[letter] ?? [], strengthIds.get(dow) ?? [], 'strength', i.isStrengthId);
    if (runningIds.length) ids = mergeDayItems(ids, runDays.includes(dow) ? runningIds : [], 'running', i.isStrengthId);
    if (ids.length) next[letter] = ids;
  });

  const lifestyleScheduleDays = DAY_LETTERS.filter((_, dow) => strengthDays.includes(dow) || runDays.includes(dow));
  return { recurringTemplate: next, lifestyleScheduleDays, strengthDays, runDays, runLetters, runsChanged, sessions };
}
