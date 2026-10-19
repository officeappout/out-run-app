/**
 * Kelly phase 2 — building the quick-reply situation. Pure.
 *
 *   situationFromSheet    server: the user sheet pre-loaded into the turn (today, plan, gaps)
 *   situationFromProfile  app: the profile only (first open, before any request), + weather
 *   lastTurnFrom          server: what the finished turn was about (tools, card, user text)
 *
 * "Days away" is calm return's getDaysAway (one source for the whole app).
 */
import { getDaysAway, type DaysAwayProfile } from '@/lib/calm-return/days-away';
import { DAY_LETTERS } from '@/features/schedule/types/smartSchedule.types';
import type { WeatherFlag } from '@/features/weather/core/weather.types';
import type { UserContextSheet } from '../context-sheet';
import { deriveAssessmentGaps } from '../assessment-gaps';
import { inferProgressQuestion, inferScheduleQuestion } from '../intent';
import type { CoachGender } from '../persona';
import { COACH_LOCATIONS, type CoachLocation } from '../tools';
import type { ChipSituation, LastTurn, WeatherHint } from './types';

export function weatherHintOf(flag: WeatherFlag | null | undefined): WeatherHint {
  return flag === 'rain' || flag === 'heat' || flag === 'cold' ? flag : null;
}

export interface SheetSituationInput {
  sheet: Pick<UserContextSheet, 'today' | 'lastWorkouts' | 'assessmentGaps' | 'plan'> | null;
  gender: CoachGender;
  hour: number;
  todayKey: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw Firestore profile, read through field guards
  profile: Record<string, any> | null;
  now: Date;
}

export function situationFromSheet(i: SheetSituationInput): ChipSituation {
  const today = (i.sheet?.today ?? []).filter((e) => e.type !== 'rest');
  const daysAway = getDaysAway(i.profile as DaysAwayProfile | null, i.now);
  const trainedToday = (i.sheet?.lastWorkouts ?? []).some((w) => w.date === i.todayKey);
  const doneToday = i.sheet?.plan?.doneToday.strength === true || trainedToday || daysAway === 0;
  return {
    gender: i.gender,
    hour: i.hour,
    trainingDayToday: i.sheet ? today.length > 0 : null,
    buildableToday: today.some((e) => !!e.buildNow && !e.completed) && !doneToday,
    doneToday,
    daysAway,
    newUser: daysAway === null && (i.sheet?.lastWorkouts ?? []).length === 0,
    gapName: i.sheet?.assessmentGaps?.[0]?.name ?? null,
    weather: null,
  };
}

export interface ProfileSituationInput {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the app's profile, read through field guards
  profile: Record<string, any> | null;
  gender: CoachGender;
  hour: number;
  /** 0 = Sunday (Israel). */
  dayOfWeek: number;
  now: Date;
  weather?: WeatherFlag | null;
}

export function situationFromProfile(i: ProfileSituationInput): ChipSituation {
  const daysAway = getDaysAway(i.profile as DaysAwayProfile | null, i.now);
  const letter = DAY_LETTERS[i.dayOfWeek];
  const template = i.profile?.lifestyle?.recurringTemplate;
  const hasTemplate = !!template && typeof template === 'object' && Object.keys(template).length > 0;
  const todayIds = hasTemplate && Array.isArray(template[letter]) ? (template[letter] as unknown[]) : [];
  const scheduleDays = Array.isArray(i.profile?.lifestyle?.scheduleDays) ? (i.profile!.lifestyle.scheduleDays as unknown[]) : null;
  const trainingDayToday = hasTemplate ? todayIds.length > 0 : scheduleDays ? scheduleDays.includes(letter) : null;
  let gapName: string | null = null;
  try {
    gapName = i.profile ? (deriveAssessmentGaps({ profile: i.profile })[0]?.name ?? null) : null;
  } catch {
    gapName = null;
  }
  const doneToday = daysAway === 0;
  return {
    gender: i.gender,
    hour: i.hour,
    trainingDayToday,
    buildableToday: trainingDayToday === true && !doneToday,
    doneToday,
    daysAway,
    newUser: daysAway === null,
    gapName,
    weather: weatherHintOf(i.weather),
  };
}

export interface LastTurnInput {
  userText: string;
  toolNames: string[];
  /** The workout built this turn (generate_workout input), if any. */
  workout?: { location?: unknown; durationMin?: unknown; domains?: unknown } | null;
  /** The turn ended with a schedule proposal card. */
  proposal?: boolean;
  /** The fixed safety reply answered (no model call). */
  safety?: boolean;
}

export function lastTurnFrom(i: LastTurnInput): LastTurn {
  if (i.safety) return { kind: 'safety' };
  if (i.proposal || i.toolNames.includes('propose_schedule_change')) return { kind: 'proposal' };
  if (i.toolNames.includes('handoff_to_human')) return { kind: 'handoff' };
  if (i.workout) {
    const loc = (COACH_LOCATIONS as readonly string[]).includes(String(i.workout.location)) ? (i.workout.location as CoachLocation) : null;
    const minutes = typeof i.workout.durationMin === 'number' ? i.workout.durationMin : null;
    const domains = Array.isArray(i.workout.domains) ? i.workout.domains.filter((d): d is string => typeof d === 'string') : [];
    return { kind: 'workout', location: loc, minutes, domains };
  }
  if (i.toolNames.includes('get_app_help')) return { kind: 'app_help' };
  const t = i.toolNames;
  if (t.includes('get_schedule') || t.includes('recommend_week') || t.includes('recommend_today') || inferScheduleQuestion(i.userText)) return { kind: 'schedule' };
  if (t.includes('get_progress') || inferProgressQuestion(i.userText)) return { kind: 'progress' };
  return { kind: 'other' };
}
