/**
 * What "אישור השבוע" writes on top of the lifestyle wizard's completion write (Part C): the
 * per-day times, the session length and the runner's choices, as one dotted update of
 * users/{uid}. Pure (__tests__/tutorialSave.test.ts).
 *
 * Fields (all optional, additive; a user without them behaves as before):
 * - lifestyle.recurringTemplate: the week's strength items per day letter. Strength ids on other
 *   days are dropped, running ids are kept (mergeDayItems), an explicit rest day ([]) stays.
 * - lifestyle.trainingTime: the dominant window's time (the existing week step's rule).
 * - lifestyle.reminders.strengthTimesByDay: 'HH:MM' per strength day (exact time or the window's
 *   preset; the evening slot after a run). Template hydration stamps it on the day's entries.
 * - lifestyle.sessionMinutes: "כמה זמן לאימון?" (the choice; the ramp is applied when read).
 * - runners: running.longRunDay (existing field) and lifestyle.allowTwoPerDay.
 */
import { mergeDayItems } from '@/features/schedule/services/mergeDayItems';
import { isStrengthTemplateId } from '@/features/schedule/engine/strengthVocabulary';
import { DAY_LETTERS_HE } from '@/features/schedule/utils/runWeekRecommendation';
import type { TutorialWeek } from './tutorialWeek';

export type TemplateLike = Partial<Record<string, readonly string[] | null | undefined>>;

export interface TutorialSaveInput {
  week: Pick<TutorialWeek, 'days'>;
  /** The stored lifestyle.recurringTemplate (read fresh before the write). */
  existingTemplate: TemplateLike | null | undefined;
  trainingTime: string;
  /** The user's choice ("כמה זמן לאימון?"). */
  sessionMinutes: number;
  running: { longRunDay: number | null; twoPerDay: boolean } | null;
}

const isStrength = (id: string) => isStrengthTemplateId(id);

export function mergedStrengthTemplate(existing: TemplateLike | null | undefined, week: Pick<TutorialWeek, 'days'>): Record<string, string[]> {
  const byDow = new Map(week.days.map((d) => [d.dow, d]));
  const out: Record<string, string[]> = {};
  for (let dow = 0; dow <= 6; dow++) {
    const letter = DAY_LETTERS_HE[dow];
    const raw = existing?.[letter];
    const had = Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string' && x.length > 0) : null;
    const next = [...(byDow.get(dow)?.strength?.items ?? [])];
    const merged = mergeDayItems(had ?? [], next, 'strength', isStrength);
    if (merged.length > 0) out[letter] = merged;
    else if (Array.isArray(raw) && raw.length === 0) out[letter] = []; // the user's explicit rest day
  }
  return out;
}

export function strengthTimesByDay(week: Pick<TutorialWeek, 'days'>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const d of week.days) if (d.strength) out[DAY_LETTERS_HE[d.dow]] = d.strength.time;
  return out;
}

export function tutorialSaveFields(i: TutorialSaveInput): Record<string, unknown> {
  const out: Record<string, unknown> = {
    'lifestyle.recurringTemplate': mergedStrengthTemplate(i.existingTemplate, i.week),
    'lifestyle.trainingTime': i.trainingTime,
    'lifestyle.reminders.strengthTimesByDay': strengthTimesByDay(i.week),
    'lifestyle.sessionMinutes': i.sessionMinutes,
  };
  if (i.running) {
    out['lifestyle.allowTwoPerDay'] = i.running.twoPerDay;
    if (i.running.longRunDay != null) out['running.longRunDay'] = i.running.longRunDay;
  }
  return out;
}
