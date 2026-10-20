/**
 * AI coach — the schedule advisor's tool results and sheet section, as the model reads
 * them. Pure (no Firebase): the server adapter (schedule-advisor.server.ts) builds the
 * AdvisorInput, the advisor decides, this file only shapes the answer.
 *
 * Read-only by design: recommend_week / recommend_today return a PROPOSAL (reason codes +
 * Hebrew text + what the app would build); nothing here or in the tools writes a schedule.
 * Applying a proposal is the user's own action in the builder drawer (the "open_builder"
 * chip opens it). Names only — never a program id, a schedule id or a slot code.
 */
import { PROGRAM_NAME_HE } from '@/features/workout-engine/services/coach-note';
import { scheduleIdNameHe } from '@/features/schedule/engine/strengthVocabulary';
import { RUNNING_SLOT_NAME_HE, isLongRunDay, isQualityDay } from '@/features/schedule/engine/runningRules';
import type { TodayAdvice, WeekAdvice, AdvisedDay, PlannedKind } from '@/features/schedule/advisor/types';
import { WEEKDAY_NAMES_HE } from './context-sheet';

const RUN_KIND_HE = (run: NonNullable<AdvisedDay['run']>): string => {
  if (run.slotType) return RUNNING_SLOT_NAME_HE[run.slotType];
  const day = { dayOfWeek: 0, category: run.category };
  if (isLongRunDay(day)) return 'ריצה ארוכה';
  if (isQualityDay(day)) return 'אימון איכות';
  return 'ריצה קלה';
};

/** Generator domain / slug → Hebrew (push → דחיפה). Unknown → dropped (never an id in text). */
function domainNamesHe(domains: string[]): string[] {
  return domains.map((d) => PROGRAM_NAME_HE[d]).filter((x): x is string => !!x);
}

export interface WeekToolDay {
  weekday: string;
  strength: string[];
  run: string | null;
  order: 'ריצה קודם' | 'כוח קודם' | null;
}

export interface WeekToolResult {
  proposalOnly: true;
  days: WeekToolDay[];
  reasons: string[];
  text: string[];
  periodization: { strengthWeek: number | null; runningWeek: number | null; runningPhase: string | null };
}

export function weekToolResult(advice: WeekAdvice | null): WeekToolResult | { proposalOnly: true; note: string } {
  if (!advice) return { proposalOnly: true, note: 'No strength or running program yet, so there is no week to recommend.' };
  return {
    proposalOnly: true,
    days: advice.days.map((d) => ({
      weekday: WEEKDAY_NAMES_HE[d.dayOfWeek],
      strength: Array.from(new Set(d.strength.map(scheduleIdNameHe))),
      run: d.run ? RUN_KIND_HE(d.run) : null,
      order: d.order === 'running-first' ? 'ריצה קודם' : d.order === 'strength-first' ? 'כוח קודם' : null,
    })),
    reasons: advice.reasons.map((r) => r.code),
    text: advice.notes,
    periodization: {
      strengthWeek: advice.periodization.strengthWeek,
      runningWeek: advice.periodization.runningWeek,
      runningPhase: advice.periodization.runningPhase,
    },
  };
}

const RECOMMENDATION_HE: Record<TodayAdvice['recommendation'], string> = {
  strength: 'אימון כוח',
  run: 'ריצה',
  combined: 'כוח וריצה',
  walk: 'הליכה קלה',
  rest: 'מנוחה',
};

export interface TodayToolResult {
  proposalOnly: true;
  mode: TodayAdvice['mode'];
  recommendation: TodayAdvice['recommendation'];
  recommendationHe: string;
  /** generate_workout settings when the recommendation is strength / combined. */
  buildNow: { domains: string[]; difficulty: 1 | 2 | 3; durationMin: number | null; areasHe: string[] } | null;
  run: { name: string | null; kind: string | null } | null;
  /**
   * Only when the walk recommended is a PLANNED walk (today's, or the makeup): its Hebrew
   * name ("הליכה של 30 דקות"). Absent otherwise — never a run, never a run make-up.
   */
  walk?: { name: string | null };
  doneToday: TodayAdvice['doneToday'];
  reasons: string[];
  text: string[];
}

export function todayToolResult(advice: TodayAdvice, allowedDomains: readonly string[]): TodayToolResult {
  const p = advice.generateParams;
  const domains = p ? p.domains.filter((d) => allowedDomains.includes(d)) : [];
  const plannedRun = advice.runEntryRef
    ? advice.today.find((t) => t.kind === 'run') ?? advice.makeup ?? null
    : null;
  const plannedWalk =
    advice.recommendation === 'walk'
      ? advice.today.find((t) => t.kind === 'walk' && t.status !== 'done') ?? (advice.makeup?.kind === 'walk' ? advice.makeup : null)
      : null;
  return {
    proposalOnly: true,
    mode: advice.mode,
    recommendation: advice.recommendation,
    recommendationHe: RECOMMENDATION_HE[advice.recommendation],
    buildNow: p ? { domains, difficulty: p.difficulty, durationMin: p.durationMin, areasHe: domainNamesHe(domains) } : null,
    run:
      advice.recommendation === 'run' || advice.recommendation === 'combined'
        ? { name: plannedRun?.runName ?? null, kind: plannedRun?.runDay ? RUN_KIND_HE({ ...plannedRun.runDay, category: plannedRun.runDay.category!, programId: null }) : null }
        : null,
    ...(plannedWalk ? { walk: { name: plannedWalk.runName } } : {}),
    doneToday: advice.doneToday,
    reasons: advice.reasons.map((r) => r.code),
    text: advice.notes,
  };
}

// ── The sheet's plan section (pre-loaded every turn when the flag is on) ─────

export interface SheetPlan {
  /** Weekdays the recurring template trains strength (Hebrew names). */
  strengthDays: string[];
  /** The running plan's current week, when there is one. */
  runningWeek: { week: number; of: number | null; phase: string | null } | null;
  /** Today's mode (on_track / makeup / welcome_back / fresh_start). Never a list of misses. */
  todayMode: TodayAdvice['mode'];
  /** The one makeup on offer (≤2 days old), else null. */
  makeup: { weekday: string; kind: PlannedKind } | null;
  doneToday: TodayAdvice['doneToday'];
  /** WHO weekly targets vs this week so far. */
  who: { strengthDays: number; strengthTarget: number; aerobicMinutes: number; aerobicTarget: number };
}

export function sheetPlanOf(today: TodayAdvice, week: WeekAdvice | null, templateStrengthDows: number[]): SheetPlan {
  return {
    strengthDays: templateStrengthDows.map((d) => WEEKDAY_NAMES_HE[d]),
    runningWeek:
      week?.periodization.runningWeek != null
        ? { week: week.periodization.runningWeek, of: week.periodization.runningTotalWeeks, phase: week.periodization.runningPhase }
        : null,
    todayMode: today.mode,
    makeup: today.makeup ? { weekday: WEEKDAY_NAMES_HE[today.makeup.dayOfWeek], kind: today.makeup.kind } : null,
    doneToday: today.doneToday,
    who: {
      strengthDays: today.weeklyLoad.strengthDaysDone,
      strengthTarget: today.weeklyLoad.strengthTarget,
      aerobicMinutes: today.weeklyLoad.aerobicModerateMin,
      aerobicTarget: today.weeklyLoad.aerobicTarget,
    },
  };
}
