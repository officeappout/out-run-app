/**
 * Kelly phase 2 — propose_schedule_change, decided purely (no Firebase, no clock of its
 * own). Uses the schedule advisor (adviseWeek: the user's real week, the running week and
 * the same rule families the schedule builder uses) and the builder's save PLANNER
 * (planScheduleSave), so what "אשר" writes is exactly what the builder's own approve button
 * would write for the same week.
 *
 * Scope of a chat change (deliberately narrow; anything else → the schedule builder):
 *   moves         move a strength day to another weekday (a swap when that day has one)
 *   strengthDays  FEWER strength days a week (the advisor picks which stay, by the rules)
 * Running is never changed here (controls.mode = 'strength': the planner leaves running
 * days and the running plan alone), and a strength day never lands on the long-run day.
 *
 * The plan is verified against the change it is meant to make (per weekday strength ids)
 * before it is offered; a mismatch is refused rather than written.
 */
import { adviseWeek } from '@/features/schedule/advisor/advisor';
import { dayOfWeekOfKey, keyToDate, weekKeysOf } from '@/features/schedule/advisor/planned';
import type { AdvisorInput } from '@/features/schedule/advisor/types';
import { buildWeaverInput, type WeaveControls } from '@/features/schedule/engine/weaverInput';
import { isLongRunDay } from '@/features/schedule/engine/runningRules';
import { classifyStrengthId, isStrengthTemplateId, scheduleIdNameHe } from '@/features/schedule/engine/strengthVocabulary';
import { mergeDayItems } from '@/features/schedule/services/mergeDayItems';
import { planScheduleSave, type SchedulePlan } from '@/features/schedule/services/scheduleBuilderSave.plan';
import { DAY_LETTERS, type ScheduleDay } from '@/features/schedule/types/smartSchedule.types';
import { WEEKDAY_NAMES_HE } from '../context-sheet';
import { WEEKDAYS_EN, type ProposeScheduleChangeInputT } from './types';

export type ProposalRefusal =
  | 'no_strength'
  | 'no_strength_on_day'
  | 'past_day'
  | 'long_run_day'
  | 'more_days'
  | 'no_change'
  | 'unsupported';

export interface BuiltProposal {
  scope: SchedulePlan['scope'];
  title: string;
  lines: string[];
  plan: SchedulePlan;
}

export type ProposalBuild = { ok: true; proposal: BuiltProposal } | { ok: false; reason: ProposalRefusal; day?: string };

const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x) => b.includes(x));
const dayHe = (dow: number) => `יום ${WEEKDAY_NAMES_HE[dow]}`;

function ddmm(key: string): string {
  const [, m, d] = key.split('-');
  return `${Number(d)}.${Number(m)}`;
}

function contentHe(ids: string[], resolveSlug: AdvisorInput['resolveSlug']): string {
  const names = Array.from(
    new Set(
      ids
        .map((id) => classifyStrengthId(id, resolveSlug).scheduleId)
        .filter((x): x is NonNullable<typeof x> => !!x)
        .map(scheduleIdNameHe),
    ),
  );
  return names.length ? names.join(' + ') : 'כוח';
}

export function buildScheduleProposal(input: AdvisorInput, req: ProposeScheduleChangeInputT): ProposalBuild {
  const profile = input.profile;
  const resolveSlug = input.resolveSlug;
  const isStrength = (id: string) => isStrengthTemplateId(id, resolveSlug);
  const template = profile.lifestyle?.recurringTemplate ?? {};
  const before = new Map<number, string[]>();
  DAY_LETTERS.forEach((l, dow) => {
    const ids = (template[l] ?? []).filter(isStrength);
    if (ids.length) before.set(dow, ids);
  });
  const advice = adviseWeek(input);
  if (!advice || before.size === 0) return { ok: false, reason: 'no_strength' };

  const todayDow = dayOfWeekOfKey(input.todayKey);
  const weekKeys = weekKeysOf(input.todayKey);
  const longRunDows = new Set(advice.week.running.filter((d) => isLongRunDay(d)).map((d) => d.dayOfWeek));
  const controls: WeaveControls = { ...advice.controls, mode: 'strength' };

  let week: ScheduleDay[];
  let expected: Map<number, string[]>;
  const lines: string[] = [];
  const label = (dow: number) => (req.scope === 'this_week' ? `${dayHe(dow)} (${ddmm(weekKeys[dow])})` : dayHe(dow));

  if (req.moves?.length) {
    const after = new Map(before);
    for (const m of req.moves) {
      const f = WEEKDAYS_EN.indexOf(m.from);
      const t = WEEKDAYS_EN.indexOf(m.to);
      if (req.scope === 'this_week' && (f < todayDow || t < todayDow)) return { ok: false, reason: 'past_day', day: WEEKDAY_NAMES_HE[f < todayDow ? f : t] };
      const fIds = after.get(f);
      if (!fIds) return { ok: false, reason: 'no_strength_on_day', day: WEEKDAY_NAMES_HE[f] };
      const tIds = after.get(t);
      after.delete(f);
      after.delete(t);
      after.set(t, fIds);
      if (tIds) after.set(f, tIds);
      lines.push(
        tIds
          ? `האימון של ${label(f)} (${contentHe(fIds, resolveSlug)}) מתחלף עם ${label(t)} (${contentHe(tIds, resolveSlug)})`
          : `האימון של ${label(f)} (${contentHe(fIds, resolveSlug)}) עובר ל${label(t)}`,
      );
    }
    for (const [dow, ids] of Array.from(after)) {
      if (longRunDows.has(dow) && !sameSet(ids, before.get(dow) ?? [])) return { ok: false, reason: 'long_run_day', day: WEEKDAY_NAMES_HE[dow] };
    }
    const moved: Record<string, string[]> = {};
    DAY_LETTERS.forEach((l, dow) => {
      const ids = mergeDayItems(template[l] ?? [], after.get(dow) ?? [], 'strength', isStrength);
      if (ids.length) moved[l] = ids;
    });
    const wi = buildWeaverInput(
      { ...profile, lifestyle: { ...profile.lifestyle, recurringTemplate: moved } },
      'strength',
      controls.focus,
      controls.availableDayCount,
      keyToDate(input.todayKey),
      { resolveSlug },
    );
    if (!wi) return { ok: false, reason: 'unsupported' };
    week = wi.strength.existingWeek;
    expected = after;
  } else {
    const n = req.strengthDays!;
    if (n >= before.size) return { ok: false, reason: 'more_days' };
    const fewer = adviseWeek({ ...input, controls: { mode: 'strength', availableDayCount: n } });
    if (!fewer) return { ok: false, reason: 'unsupported' };
    week = fewer.week.strength;
    const kept = week.filter((d) => d.sessions.length > 0).map((d) => d.dayOfWeek);
    if (kept.length !== n) return { ok: false, reason: 'unsupported' };
    const hit = kept.find((d) => longRunDows.has(d) && !before.has(d));
    if (hit !== undefined) return { ok: false, reason: 'long_run_day', day: WEEKDAY_NAMES_HE[hit] };
    expected = new Map(); // filled from the plan below (the advisor chose the days)
    const keptHe = kept.map((d) => WEEKDAY_NAMES_HE[d]).join(', ');
    const wasHe = Array.from(before.keys()).sort().map((d) => WEEKDAY_NAMES_HE[d]).join(', ');
    lines.push(`${n} ימי כוח: ${keptHe}`, `במקום: ${wasHe}`);
  }

  const plan = planScheduleSave({ profile, week: { strength: week, running: [] }, controls, scope: req.scope, todayKey: input.todayKey, resolveSlug });
  if (plan.runningScheduleDays !== null || plan.runningFrequency !== null) return { ok: false, reason: 'unsupported' };

  // ── Verify the plan does exactly the change (never write a surprise) ──
  const planAfter = (dow: number): string[] | null => {
    if (plan.scope === 'from_now') return (plan.recurringTemplate?.[DAY_LETTERS[dow]] ?? []).filter(isStrength);
    const o = plan.dayOverrides.find((x) => x.date === weekKeys[dow]);
    return o ? (o.strengthProgramIds ?? []) : null; // null = this day is not touched
  };
  if (req.moves?.length) {
    for (let dow = 0; dow < 7; dow++) {
      const want = expected.get(dow) ?? [];
      const got = planAfter(dow);
      if (plan.scope === 'this_week') {
        if (dow < todayDow) {
          if (got !== null) return { ok: false, reason: 'unsupported' };
          continue;
        }
        const unchanged = sameSet(want, before.get(dow) ?? []);
        if (unchanged ? got !== null && !sameSet(got, want) : got === null || !sameSet(got, want)) return { ok: false, reason: 'unsupported' };
      } else if (!sameSet(got ?? [], want)) {
        return { ok: false, reason: 'unsupported' };
      }
    }
    if (plan.scope === 'from_now') {
      // The other domain's ids (running) stay exactly where they were.
      for (const l of DAY_LETTERS) {
        const keep = (template[l] ?? []).filter((id) => !isStrength(id));
        const now = (plan.recurringTemplate?.[l] ?? []).filter((id) => !isStrength(id));
        if (!sameSet(keep, now)) return { ok: false, reason: 'unsupported' };
      }
    }
  } else {
    const days = plan.scope === 'from_now' ? DAY_LETTERS.filter((_, dow) => (planAfter(dow) ?? []).length > 0).length : null;
    if (days !== null && days !== req.strengthDays) return { ok: false, reason: 'unsupported' };
  }
  if (plan.scope === 'from_now' ? DAY_LETTERS.every((_, dow) => sameSet(planAfter(dow) ?? [], before.get(dow) ?? [])) : plan.dayOverrides.length === 0) {
    return { ok: false, reason: 'no_change' };
  }

  return {
    ok: true,
    proposal: {
      scope: plan.scope,
      title: plan.scope === 'this_week' ? 'שינוי בלו״ז, רק השבוע' : 'שינוי בלו״ז, מעכשיו והלאה',
      lines,
      plan,
    },
  };
}

/** What the model reads back. English instructions; Hebrew facts. */
export function proposalToolResult(b: ProposalBuild): Record<string, unknown> {
  if (b.ok) {
    return {
      proposalOnly: true,
      savedNothing: true,
      scope: b.proposal.scope,
      changes: b.proposal.lines,
      noteForCoach:
        'Nothing was changed yet. The app shows a confirm card under your reply with "אשר" and "בטל". In one or two short sentences say what will change and that it is saved only after the user taps אשר on the card. Never say you changed, moved or saved anything.',
    };
  }
  const why: Record<ProposalRefusal, string> = {
    no_strength: 'The user has no strength days in a fixed weekly schedule, so there is nothing to move here. Offer the schedule builder (a button under your reply).',
    no_strength_on_day: `There is no strength workout on ${b.day ?? 'that day'} in the user's schedule. Say so briefly and ask which day they meant.`,
    past_day: `${b.day ?? 'That day'} already passed this week. Offer to change it from now on instead, or another day this week.`,
    long_run_day: `${b.day ?? 'That day'} is the long run day; the schedule rules keep strength off it. Offer another day.`,
    more_days: 'Adding strength days is done in the schedule builder (a button under your reply). Offer it.',
    no_change: 'This is already how the schedule looks. Say so briefly.',
    unsupported: 'This change can not be made from the chat. Offer the schedule builder (a button under your reply).',
  };
  return { proposalOnly: true, created: false, reason: b.reason, noteForCoach: why[b.reason] };
}
