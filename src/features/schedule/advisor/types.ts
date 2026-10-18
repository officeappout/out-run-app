/**
 * Schedule advisor — input / output types. Pure: no Firebase, no clock, no React.
 *
 * The advisor is the ONE place that answers "what should this week look like" and "what
 * should I do today" from the same rule families the builder drawer uses (strength /
 * running / cross-domain, src/features/schedule/engine). Two adapters build its input:
 *   - client  (adapters/client.ts) — from the app's stores (the drawer)
 *   - server  (src/lib/ai/coach/schedule-advisor.server.ts) — from Admin SDK reads (Kelly)
 * Whatever the server cannot know (device-local domain sets) is `null` = unknown, never 0.
 */
import type { WorkoutCategory } from '@/features/workout-engine/core/types/running.types';
import type { RunningDayRole, RunningWeekDay } from '../engine/runningRules';
import type { ScheduleDay, ScheduleItemId } from '../types/smartSchedule.types';
import type { WeaveControls, WeaverInputProfile } from '../engine/weaverInput';
import type { ResolveSlug } from '../engine/strengthVocabulary';
import type { DoubleDayOrder } from '../engine/crossDomainRules';
import type { ScheduleReason, TodayKind } from '../engine/reasons';

/** A finished workout, already reduced to what the advisor needs. `date` = local YYYY-MM-DD. */
export interface AdvisorWorkout {
  date: string;
  kind: 'strength' | 'run' | 'hybrid' | 'walk' | 'other';
  minutes: number;
}

/** One userSchedule day document's entries (the override layer over the recurring template). */
export interface AdvisorScheduleDay {
  date: string;
  entries: Array<{
    type?: unknown;
    programIds?: unknown;
    completed?: unknown;
    override?: unknown;
    source?: unknown;
    scheduledCategories?: unknown;
    plannedRun?: unknown;
  }>;
}

/** The narrow, structurally-typed profile the advisor reads (the weaver's, which already carries every advisor field). */
export type AdvisorProfile = WeaverInputProfile;

export interface AdvisorInput {
  /** The local calendar day the advice is for (Israel time on the server, device-local on the client). */
  todayKey: string;
  profile: AdvisorProfile;
  /** Drawer controls; missing fields fall back to defaultWeaveControls (bug #2). */
  controls?: Partial<WeaveControls>;
  /** Finished workouts of (at least) the last 14 days. */
  workouts: AdvisorWorkout[];
  /** userSchedule day docs for the window; null = not read (template only). */
  scheduleDays: AdvisorScheduleDay[] | null;
  resolveSlug?: ResolveSlug;
  /** Device-local per-domain sets this week (useWeeklyVolumeStore). null = unknown (server). */
  weeklyDomainSets?: Record<string, number> | null;
}

// ── Planned entries (virtual materialization) ────────────────────────────────

export type PlannedKind = 'strength' | 'run';

export interface PlannedEntry {
  date: string;
  dayOfWeek: number;
  kind: PlannedKind;
  /** 'override' = a userSchedule doc; 'template' = recurringTemplate; 'running_plan' = activeProgram.schedule. */
  source: 'override' | 'template' | 'running_plan';
  /** Strength: generator slugs (push / legs / planche …) of the day, when known. */
  strengthSlugs: string[];
  /** Strength: schedule taxonomy ids of the day. */
  strengthIds: ScheduleItemId[];
  /** Run: the plan entry this is (week + 1-based slot), for the run player. */
  runRef: { week: number; day: number; workoutId?: string } | null;
  runDay: RunningWeekDay | null;
  runName: string | null;
  /** Marked done at the source (userSchedule.completed / running status 'completed'). */
  completedAtSource: boolean;
}

export type PlannedStatus = 'done' | 'missed' | 'today' | 'upcoming';

export interface PlannedWithStatus extends PlannedEntry {
  status: PlannedStatus;
}

// ── Outputs ─────────────────────────────────────────────────────────────────

export type RunningPhase = 'base' | 'build' | 'peak' | 'taper' | 'maintenance';

export interface PeriodizationView {
  /** Strength 5-week cycle week (1-5), null without a dated active program. */
  strengthWeek: number | null;
  /** Running plan week (1-based), null without an active plan covering today. */
  runningWeek: number | null;
  runningTotalWeeks: number | null;
  runningPhase: RunningPhase | null;
  /** 'hold_build' = strength would peak in a running peak week → train it as a build week. */
  strengthAdjustment: 'none' | 'hold_build';
}

export interface AdvisedDay {
  dayOfWeek: number;
  strength: ScheduleItemId[];
  /**
   * Which of the user's programs this strength day comes from — the user's own stored ids
   * (a program slug like 'legs', or a Firestore program id), never an invented one. The UI
   * resolves them to names. Empty on a rest day.
   */
  strengthProgramIds: string[];
  run: { category: WorkoutCategory; slotType?: RunningDayRole; programId: string | null } | null;
  order: DoubleDayOrder | null;
}

export interface WeekAdvice {
  controls: WeaveControls;
  week: { strength: ScheduleDay[]; running: RunningWeekDay[] };
  days: AdvisedDay[];
  sharedDays: Array<{ dayOfWeek: number; order: DoubleDayOrder }>;
  reductions: Array<{ domainId: 'strength' | 'running'; removed: string[] }>;
  periodization: PeriodizationView;
  reasons: ScheduleReason[];
  /** reasons rendered by the one Hebrew renderer. */
  notes: string[];
}

export interface GenerateParams {
  /** Generator domains (push / pull / legs / core / skill slugs). [] = full body / engine decides. */
  domains: string[];
  /** 1 easy, 2 balanced, 3 intense. */
  difficulty: 1 | 2 | 3;
  durationMin: number | null;
}

export interface WeeklyLoadView {
  strengthDaysDone: number;
  strengthTarget: number;
  aerobicModerateMin: number;
  aerobicTarget: number;
  /** Device-local only; null on the server. */
  neglectedDomains: string[] | null;
}

/**
 * How today relates to the plan (owner policy, 18.10.2026 — misses never pile up):
 *   on_track      — nothing to catch up (older misses are dropped silently, never counted)
 *   makeup        — the single most recent miss, ≤2 days old, fits today without breaking
 *                   a recovery rule
 *   welcome_back  — 2+ planned sessions missed in a row, or 4-6 days without a workout:
 *                   one light session today, the rest of the week re-planned from today
 *   fresh_start   — 7+ days without a workout: a new, lighter week starting today
 */
export type TodayMode = 'on_track' | 'makeup' | 'welcome_back' | 'fresh_start';

export interface PlannedDay {
  date: string;
  dayOfWeek: number;
  strength: ScheduleItemId[];
  strengthProgramIds: string[];
  run: AdvisedDay['run'];
  /** fresh_start's first week (and welcome_back's today): reduced volume. */
  light: boolean;
}

export interface TodayAdvice {
  mode: TodayMode;
  recommendation: TodayKind;
  generateParams: GenerateParams | null;
  runEntryRef: { week: number; day: number; workoutId?: string } | null;
  /** Today's planned entries with their derived status. */
  today: PlannedWithStatus[];
  /** A matching workout exists today (planned or not) — the derived "done" (bug #8). */
  doneToday: { strength: boolean; run: boolean };
  /** The one session offered as a makeup (mode 'makeup'), else null. Never a list. */
  makeup: PlannedWithStatus | null;
  /** welcome_back: today → Saturday; fresh_start: today + 6 days. Empty otherwise. */
  replan: PlannedDay[];
  weeklyLoad: WeeklyLoadView;
  reasons: ScheduleReason[];
  notes: string[];
}
