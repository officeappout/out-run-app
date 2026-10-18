/**
 * Schedule builder — what an approved proposal WRITES, decided purely (no Firebase, no
 * clock). scheduleBuilderSave.ts executes the plan through the existing writers, and only
 * behind SCHEDULE_BUILDER_SAVE_V1.
 *
 * Two scopes (schedule-builder-drawer-spec.md "סולם השינוי" + the contract's §2):
 *   from_now   — the fixed schedule: lifestyle.recurringTemplate (merged per day with
 *                mergeDayItems, so the other domain's ids are never clobbered),
 *                lifestyle.scheduleDays (strength ∪ running letters, the field's existing
 *                union meaning), running.scheduleDays via completeRunningScheduleFirstChoice
 *                (which rebuilds the plan with mergePreservedHistory — history is kept).
 *   this_week  — only the rest of the current week: userSchedule day overrides for the
 *                strength days that move (a training entry on a new day, a rest override
 *                on a vacated one). The running plan has no per-week day override, so a
 *                run move is NOT applied in this scope (runningNotAppliedThisWeek).
 *
 * The drawer relabels the user's OWN strength content, never invents it: each new strength
 * day gets the stored ids of an existing strength day with the same content (a legs day
 * stays a legs day, with the user's own program id / slug), in order.
 */
import { DAY_LETTERS, type ScheduleDay } from '../types/smartSchedule.types';
import { isStrengthTemplateId, type ResolveSlug } from '../engine/strengthVocabulary';
import { strengthIdsForNewDays } from '../advisor/programTags';
import type { RunningWeekDay } from '../engine/runningRules';
import { mergeDayItems } from './mergeDayItems';
import type { WeaveControls, WeaverInputProfile } from '../engine/weaverInput';

export type SaveScope = 'this_week' | 'from_now';

export interface DayOverridePlan {
  date: string;
  /** Strength program ids to train that day; null = vacated (rest override). */
  strengthProgramIds: string[] | null;
}

export interface SchedulePlan {
  scope: SaveScope;
  /** from_now: the full next template (every letter that has ids). */
  recurringTemplate: Record<string, string[]> | null;
  /** from_now: strength ∪ running letters. */
  lifestyleScheduleDays: string[] | null;
  /** from_now: new running letters, or null when running is unchanged / not saved. */
  runningScheduleDays: string[] | null;
  runningFrequency: number | null;
  /** Why running was not saved even though it changed (null when it was / didn't change). */
  runningSkipped: 'single_run' | 'this_week_scope' | null;
  /** this_week: per-date strength overrides from today to Saturday. */
  dayOverrides: DayOverridePlan[];
  prefs: { availableDayCount: number; focus: number };
}

export interface PlanInput {
  profile: WeaverInputProfile;
  week: { strength: ScheduleDay[]; running: RunningWeekDay[] };
  controls: WeaveControls;
  scope: SaveScope;
  /** Local YYYY-MM-DD of today (the week containing it is "this week"). */
  todayKey: string;
  resolveSlug?: ResolveSlug;
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

function addDays(key: string, n: number): string {
  return new Date(Date.parse(`${key}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}


export function planScheduleSave(i: PlanInput): SchedulePlan {
  const isStrength = (id: string) => isStrengthTemplateId(id, i.resolveSlug);
  const prefs = { availableDayCount: i.controls.availableDayCount, focus: i.controls.focus };
  const template = i.profile.lifestyle?.recurringTemplate ?? {};
  // The running tab builds no strength (it is excluded, not removed): strength stays as stored.
  const newStrength =
    i.controls.mode === 'running'
      ? new Map(DAY_LETTERS.map((l, dow) => [dow, (template[l] ?? []).filter(isStrength)] as [number, string[]]).filter(([, ids]) => ids.length))
      : strengthIdsForNewDays(i.profile, i.week.strength, i.resolveSlug);
  const newRunLetters = i.week.running.filter((d) => d.category !== null).map((d) => DAY_LETTERS[d.dayOfWeek]);
  const oldRunLetters = i.profile.running?.scheduleDays ?? [];
  const runningOwned = !!i.profile.running?.isUnlocked;
  const runningChanged = runningOwned && i.controls.mode !== 'strength' && !sameSet(newRunLetters, oldRunLetters);

  if (i.scope === 'this_week') {
    const weekStart = addDays(i.todayKey, -new Date(`${i.todayKey}T12:00:00Z`).getUTCDay());
    const dayOverrides: DayOverridePlan[] = [];
    for (let dow = 0; dow < 7; dow++) {
      const date = addDays(weekStart, dow);
      if (date < i.todayKey) continue; // the past is not rewritten
      const before = (template[DAY_LETTERS[dow]] ?? []).filter(isStrength);
      const after = newStrength.get(dow) ?? [];
      if (sameSet(before, after)) continue;
      dayOverrides.push({ date, strengthProgramIds: after.length ? after : null });
    }
    return {
      scope: 'this_week',
      recurringTemplate: null,
      lifestyleScheduleDays: null,
      runningScheduleDays: null,
      runningFrequency: null,
      runningSkipped: runningChanged ? 'this_week_scope' : null,
      dayOverrides,
      prefs,
    };
  }

  // from_now — merge every letter with mergeDayItems (strength replaced, running kept),
  // and move the running ids with the running days when those change.
  const runningIds = Array.from(new Set(Object.values(template).flatMap((ids) => (ids ?? []).filter((id) => !isStrength(id)))));
  const singleRun = runningChanged && newRunLetters.length === 1;
  const saveRunning = runningChanged && !singleRun;
  const next: Record<string, string[]> = {};
  DAY_LETTERS.forEach((letter, dow) => {
    let ids = mergeDayItems(template[letter] ?? [], newStrength.get(dow) ?? [], 'strength', isStrength);
    if (saveRunning && runningIds.length) {
      ids = mergeDayItems(ids, newRunLetters.includes(letter) ? runningIds : [], 'running', isStrength);
    }
    if (ids.length) next[letter] = ids;
  });

  const strengthLetters = DAY_LETTERS.filter((_, dow) => (newStrength.get(dow) ?? []).length > 0);
  const runLettersFinal = saveRunning ? newRunLetters : runningOwned ? oldRunLetters : [];
  const lifestyleScheduleDays = DAY_LETTERS.filter((l) => strengthLetters.includes(l) || runLettersFinal.includes(l));

  return {
    scope: 'from_now',
    recurringTemplate: next,
    lifestyleScheduleDays,
    runningScheduleDays: saveRunning ? newRunLetters : null,
    runningFrequency: saveRunning ? newRunLetters.length : null,
    runningSkipped: singleRun ? 'single_run' : null,
    dayOverrides: [],
    prefs,
  };
}
