/**
 * Kelly phase 3 — proactive messages: the shared vocabulary. Pure.
 *
 * The engine (run.server.ts) loads one ProactiveUserState per candidate, every trigger
 * (triggers/*.ts) reads only that state and answers with a TriggerDecision, the policy
 * (policy.ts) applies the gates every trigger shares (caps, quiet hours, Shabbat, calm
 * return, opt-out), and select.ts picks at most ONE message for the day. Flag
 * ai_coach_proactive (default off).
 */
import type { CoachGender } from '../persona';
import type { WeatherHint } from '../suggestions/types';

export type ProactiveTrigger = 'post_workout' | 'weather' | 'morning' | 'weekly' | 'assessment';

/** Highest first: when several are due in one run, the first eligible one is sent. */
export const TRIGGER_PRIORITY: readonly ProactiveTrigger[] = ['post_workout', 'weather', 'morning', 'weekly', 'assessment'];

export function isProactiveTrigger(v: unknown): v is ProactiveTrigger {
  return typeof v === 'string' && (TRIGGER_PRIORITY as readonly string[]).includes(v);
}

/** Israel wall clock of the run. */
export interface IsraelClock {
  /** 'YYYY-MM-DD'. */
  dateKey: string;
  hour: number;
  minute: number;
  /** 0 = Sunday. */
  dow: number;
  ms: number;
}

export interface TodayPlan {
  /** An uncompleted training entry is planned today. */
  training: boolean;
  /** Today's planned training is already done (entry completed or a matching workout today). */
  done: boolean;
  /** 'strength' | 'cardio' | 'walking' | 'maintenance' | null. */
  kind: string | null;
  /** Hebrew name of the session ("אימון כוח", "ריצה"). */
  label: string | null;
  /** 'HH:MM' when planned. */
  startTime: string | null;
  /** Planned minutes when the entry has them. */
  minutes: number | null;
  /** generate_workout can build it now (strength-style, not done). */
  buildable: boolean;
}

export interface WeekSummary {
  workouts: number;
  activeDays: number;
  minutes: number;
  streakDays: number | null;
  /** Average daily steps on days with steps, null when none. */
  avgSteps: number | null;
}

export interface RecentWorkout {
  id: string;
  /** When it was saved (workouts.date). */
  endedAtMs: number;
  minutes: number;
}

export interface GapRef {
  slug: string;
  /** Hebrew program name ("ליבה"). */
  name: string;
}

/** Everything the triggers and the policy read about one user. Built by context.server.ts. */
export interface ProactiveUserState {
  uid: string;
  gender: CoachGender;
  firstName: string;
  clock: IsraelClock;
  /** The AI gate allows this user (adult + ai flags + entitlement). */
  hasAi: boolean;
  /** settings.pushEnabled !== false. */
  pushEnabled: boolean;
  /** settings.notificationPrefs.coach_proactive === false (or the whole 'coach' channel off). */
  optedOut: boolean;
  shabbatObserver: boolean;
  /** Now is inside the Shabbat / yom tov window (rest-window.ts). */
  inRestWindow: boolean;
  /** The user's daily engagement push cap (notificationFrequency) and today's count. */
  dailyCap: number;
  dailyCountToday: number;
  /** A retention push already went out today. */
  retentionSentToday: boolean;
  /** The once-a-day training reminder was already handled today (push_rate.trainingReminderSentDate). */
  trainingReminderToday: boolean;
  /** Whole days since the last real activity; null = unknown / never trained. */
  daysAway: number | null;
  /** A proactive Kelly message already exists for today. */
  sentToday: boolean;
  /** lifestyle.reminders.runningTime / trainingTime hour, when set. */
  preferredHour: number | null;
  today: TodayPlan;
  weather: WeatherHint | 'uv';
  /** This week so far (Sunday to now); null when not loaded (only on the weekly slot). */
  week: WeekSummary | null;
  /** Programs without a level check (assessment-gaps.ts), first = most relevant. */
  gaps: GapRef[];
  /** The newest saved workout, when one ended recently. */
  recentWorkout: RecentWorkout | null;
  ledger: ProactiveLedger;
}

/** ai_coach_proactive/{uid} (server only). */
export interface ProactiveLedger {
  /** 'YYYY-MM-DD' of the Friday a weekly summary went out. */
  weeklySentFor: string | null;
  /** slug → epoch ms of the last level-check nudge for that program. */
  assessmentNudges: Record<string, number>;
  /** Epoch ms of the last level-check nudge (any program). */
  lastAssessmentAt: number | null;
  /** Workouts already asked about ("איך היה?"), newest last, capped. */
  askedWorkoutIds: string[];
}

export const EMPTY_LEDGER: ProactiveLedger = { weeklySentFor: null, assessmentNudges: {}, lastAssessmentAt: null, askedWorkoutIds: [] };

export type TemplateKey =
  | 'morning'
  | 'morning_open'
  | 'weather_rain'
  | 'weather_heat'
  | 'weekly'
  | 'assessment'
  | 'post_workout';

export type TemplateVars = Record<string, string | number | null>;

export type TriggerDecision =
  | { trigger: ProactiveTrigger; shouldSend: true; templateKey: TemplateKey; vars: TemplateVars; why: string }
  | { trigger: ProactiveTrigger; shouldSend: false; reason: string };

export interface TriggerOptions {
  /** Admin preview: skip the time-of-day window (the "would it send at its hour" view). */
  ignoreSlotTime?: boolean;
}

export const skip = (trigger: ProactiveTrigger, reason: string): TriggerDecision => ({ trigger, shouldSend: false, reason });
