/**
 * Kelly phase 3 — one user's ProactiveUserState from Firestore (Admin SDK, read-only).
 *
 * Always read: users/{uid}, push_rate/{uid}, ai_coach_proactive/{uid} (ledger), the day's
 * proactive message doc (exists = already sent today), and the entitlement when AI is not
 * open to everyone. The user sheet (today's plan, level gaps) only when a sheet trigger is
 * due; the week only on the weekly slot; the weather only on the morning slot with the
 * weather feature on for this user.
 */
import 'server-only';
import type { Firestore } from 'firebase-admin/firestore';
import { getIsraelDateKey, getIsraelDayOfWeek, getIsraelHour } from '@/lib/israelTime';
import { getDaysAway } from '@/lib/calm-return/days-away';
import { canUseAi } from '@/lib/ai/ai-entitlement';
import { aiFlagsFrom, getAiEntitlement, type ServerFeatureFlags } from '@/lib/ai/entitlement.server';
import { isWeatherOnFor } from '@/features/weather/core/weather-access';
import { coachGenderOf, firstNameOf } from '../persona';
import { weekKeys, type UserContextSheet } from '../context-sheet';
import { loadUserContextSheet } from '../server-tools.server';
import { AI_COACH_THREADS } from '../thread-store.server';
import { dailyCapFor, dailyCountFor, isOptedOut } from './policy';
import { isRestWindow } from './rest-window';
import {
  PROACTIVE_LEDGER,
  loadCachedWeather,
  loadWeekSummary,
  parseLedger,
  proactiveMessageId,
} from './loaders.server';
import type { IsraelClock, ProactiveTrigger, ProactiveUserState, RecentWorkout, TodayPlan } from './types';
import { runsByTypeFor } from '@/features/schedule/utils/runsByTypeGate';
import { isDemoUser } from '@/lib/demo';

export function israelClock(now: Date): IsraelClock {
  const minute = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', minute: 'numeric' }).format(now)) || 0;
  return { dateKey: getIsraelDateKey(now), hour: getIsraelHour(now), minute, dow: getIsraelDayOfWeek(now), ms: now.getTime() };
}

const KIND_LABEL: Record<string, string> = { strength: 'אימון כוח', cardio: 'ריצה', walking: 'הליכה', maintenance: 'אימון קל' };

/** Today's plan from the sheet (first training entry; done when every training entry is). */
export function todayPlanOf(sheet: Pick<UserContextSheet, 'today' | 'lastWorkouts'> | null, todayKey: string): TodayPlan {
  const training = (sheet?.today ?? []).filter((e) => e.type === 'training');
  const open = training.find((e) => !e.completed) ?? null;
  const trainedToday = (sheet?.lastWorkouts ?? []).some((w) => w.date === todayKey);
  const e = open ?? training[0] ?? null;
  const done = training.length > 0 && (!open || (trainedToday && (open.kind === null || open.kind === 'strength')));
  return {
    training: training.length > 0,
    done,
    kind: e?.kind ?? null,
    label: e ? (KIND_LABEL[e.kind ?? ''] ?? 'אימון') : null,
    startTime: e?.startTime ?? null,
    minutes: e?.plannedMinutes ?? e?.buildNow?.durationMin ?? null,
    buildable: !!open?.buildNow && !done,
  };
}

function hourOf(v: unknown): number | null {
  const m = typeof v === 'string' ? v.match(/^(\d{1,2}):(\d{2})$/) : null;
  if (!m) return null;
  const h = Number(m[1]);
  return h >= 0 && h <= 23 ? h : null;
}

export interface BuildStateInput {
  db: Firestore;
  uid: string;
  now: Date;
  flags: ServerFeatureFlags;
  /** Triggers due in this run (decides the optional reads). */
  due: readonly ProactiveTrigger[];
  /** The newest saved workout, from the run's candidate query (post_workout). */
  recentWorkout?: RecentWorkout | null;
  /** demo_kelly on: demo users are evaluated like anyone else (state.demo = true). Default off. */
  allowDemo?: boolean;
  /** Called when a demo user (core.demo / `demo_` uid) is skipped (allowDemo off) — no state, no LLM. */
  onDemo?: () => void;
}

const SHEET_TRIGGERS: readonly ProactiveTrigger[] = ['morning', 'weather', 'assessment'];

export async function buildProactiveState(i: BuildStateInput): Promise<ProactiveUserState | null> {
  const { db, uid, now, flags } = i;
  const clock = israelClock(now);
  const [userSnap, rateSnap, ledgerSnap, msgSnap] = await Promise.all([
    db.collection('users').doc(uid).get(),
    db.collection('push_rate').doc(uid).get(),
    db.collection(PROACTIVE_LEDGER).doc(uid).get(),
    db.collection(AI_COACH_THREADS).doc(uid).collection('messages').doc(proactiveMessageId(clock.dateKey)).get(),
  ]);
  if (!userSnap.exists) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw Firestore document data, read through field guards
  const profile = (userSnap.data() ?? {}) as Record<string, any>;
  // Demo world: no proactive message (and no LLM call) for a simulated user unless demo_kelly is on.
  const demo = isDemoUser(uid, profile.core);
  if (demo && i.allowDemo !== true) {
    i.onDemo?.();
    return null;
  }
  const settings = (profile.settings ?? {}) as Record<string, unknown>;
  const rate = rateSnap.exists ? (rateSnap.data() as Record<string, unknown>) : undefined;

  const adult = profile.core?.ageGroup === 'adult';
  let hasAi = false;
  if (adult) {
    const entitlement = flags.aiCoachFreeForAll ? null : await getAiEntitlement(uid, db).catch(() => null);
    hasAi = canUseAi({ flags: aiFlagsFrom(flags), entitlement, now: now.getTime() });
  }

  const needsSheet = i.due.some((t) => SHEET_TRIGGERS.includes(t));
  let sheet: UserContextSheet | null = null;
  if (needsSheet && hasAi) {
    sheet = await loadUserContextSheet({ db, uid, profile, now, knownCards: new Map(), turn: { handoffDone: false }, scheduleAdvisor: flags.aiCoachScheduleAdvisor === true, ...(runsByTypeFor(flags, profile.core?.isSuperAdmin === true) ? { runsByType: true } : {}) }).catch((err) => {
      console.warn('[kelly-proactive] sheet unavailable', err);
      return null;
    });
  }

  const weatherOn = isWeatherOnFor(flags, profile.core?.isSuperAdmin === true);
  const wantsWeather = hasAi && weatherOn && i.due.includes('weather');
  const wantsWeek = hasAi && i.due.includes('weekly');
  const dow = clock.dow;
  const week = weekKeys(clock.dateKey, dow).slice(0, dow + 1);
  const weekStartMs = Date.parse(`${week[0]}T00:00:00+03:00`); // Sunday 00:00 Israel summer time (winter: an hour early, harmless)
  const streak = typeof profile.progression?.currentStreak === 'number' ? profile.progression.currentStreak : null;

  const [weather, weekSummary] = await Promise.all([
    wantsWeather ? loadCachedWeather(db, profile, now).catch(() => null) : Promise.resolve(null),
    wantsWeek ? loadWeekSummary(db, uid, weekStartMs, week, streak).catch(() => null) : Promise.resolve(null),
  ]);

  const life = (profile.lifestyle ?? {}) as Record<string, unknown>;
  const reminders = (life.reminders ?? {}) as Record<string, unknown>;
  const retentionLast = rate?.retention_lastSentAt as { toMillis?: () => number } | undefined;
  const retentionMs = typeof retentionLast?.toMillis === 'function' ? retentionLast.toMillis() : null;

  return {
    uid,
    ...(demo ? { demo: true } : {}),
    gender: coachGenderOf(profile.core?.gender),
    firstName: firstNameOf(profile.core?.name),
    clock,
    hasAi,
    pushEnabled: settings.pushEnabled !== false,
    optedOut: isOptedOut(settings),
    shabbatObserver: settings.shabbatObserver === true,
    inRestWindow: isRestWindow(now),
    dailyCap: dailyCapFor(settings.notificationFrequency),
    dailyCountToday: dailyCountFor(rate, clock.dateKey),
    retentionSentToday: retentionMs !== null && getIsraelDateKey(new Date(retentionMs)) === clock.dateKey,
    trainingReminderToday: rate?.trainingReminderSentDate === clock.dateKey,
    daysAway: getDaysAway(profile, now),
    sentToday: msgSnap.exists,
    preferredHour: hourOf(life.trainingTime) ?? hourOf(reminders.strengthTime) ?? hourOf(reminders.runningTime),
    today: todayPlanOf(sheet, clock.dateKey),
    weather,
    week: weekSummary,
    gaps: (sheet?.assessmentGaps ?? []).map((g) => ({ slug: g.slug, name: g.name })),
    recentWorkout: i.recentWorkout ?? null,
    ledger: parseLedger(ledgerSnap.exists ? (ledgerSnap.data() as Record<string, unknown>) : undefined),
  };
}
