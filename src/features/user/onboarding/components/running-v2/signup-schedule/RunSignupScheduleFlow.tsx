'use client';

/**
 * Run signup end — days → week → reminders (enable_home_v2, journey 2:
 * boards jr/J2-06..J2-09). Replaces the silent default the running step
 * writes today; flag off never mounts this.
 *
 * Owns the selection state; the recommendation is engine v2 over the plan's
 * real week-1 slots (run-signup-slots + runWeekRecommendation). Writes go
 * through the same onboarding store fields the running step always wrote
 * (synced by onboarding-sync), plus the reminder opt-in (shared step).
 * `sub` lives in the page so its header back button can step back here.
 */
import { useEffect, useMemo, useState } from 'react';
import { auth } from '@/lib/firebase';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { Analytics } from '@/features/analytics/AnalyticsService';
import { useOnboardingStore } from '../../../store/useOnboardingStore';
import { resolveDefaultRunningSchedule, strengthDayIndicesFromProfile } from '@/lib/running-schedule-defaults';
import { pickRunDaysAvoidingStrength } from '@/lib/running-schedule-smart-defaults';
import { clampRunningFrequency } from '@/lib/running-frequency-bounds';
import { SATURDAY_DOW, saturdayMarked } from '@/features/schedule/engine-v2';
import { addOnsLineHe, buildPolicySignals, resolveRecommendation } from '@/features/schedule/recommendation-policy';
import { readPolicyInputs, type PolicyProfileSlice, type PolicyStoreSlice } from '../../../utils/policy-inputs';
import type { TimeWindow } from '@/features/schedule/engine-v2/types';
import {
  DAY_LETTERS_HE,
  buildRunScheduleWrite,
  daysForFrequency,
  dayLettersLine,
  recommendRunWeek,
  recommendationTitle,
  runSessionTimes,
  runSlotNameHe,
  toggleRunDay,
  RUN_TIME_PRESETS,
} from '@/features/schedule/utils/runWeekRecommendation';
import { isReminderAlreadyActive, reminderSlotsFor } from '@/features/schedule/utils/reminderOptIn';
import {
  getPushPermissionState,
  requestReminderPermission,
  saveReminderOptIn,
} from '@/features/schedule/services/reminderOptIn.service';
import ReminderOptInStep from '@/features/schedule/components/ReminderOptInStep';
import { firstWeekRunSlots, readRunningAnswers, runLevelFromAnswers, runTargetDistance } from '../../../utils/run-signup-slots';
import RunCountStep from './RunCountStep';
import RunDaysStep from './RunDaysStep';
import RunWeekStep from './RunWeekStep';

export const RUN_SIGNUP_SUBSTEPS = 4;

const DIST_LABEL: Record<string, string> = { '2k': '2 ק״מ', '3k': '3 ק״מ', '5k': '5 ק״מ', '10k': '10 ק״מ' };

function planName(answers: Record<string, unknown>): string {
  const d = String(answers.targetDistance ?? '5k');
  return d === 'maintenance' ? 'תוכנית לשמירה על כושר' : `תוכנית ${DIST_LABEL[d] ?? DIST_LABEL['5k']}`;
}

/** Day-of-month for Sunday..Saturday of the current week (display only). */
function currentWeekDates(now = new Date()): number[] {
  const start = new Date(now);
  start.setDate(now.getDate() - now.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d.getDate();
  });
}

export interface RunSignupScheduleFlowProps {
  sub: number;
  setSub: (n: number) => void;
  onDone: () => void;
}

export default function RunSignupScheduleFlow({ sub, setSub, onDone }: RunSignupScheduleFlowProps) {
  const { data, updateData } = useOnboardingStore();
  const profile = useUserStore((s) => s.profile);

  const answers = useMemo(() => readRunningAnswers(), []);
  const level = useMemo(() => runLevelFromAnswers(answers), [answers]);
  const targetDistance = runTargetDistance(answers);
  const weeks = typeof answers.runningPlanWeeks === 'number' ? answers.runningPlanWeeks : null;
  const dates = useMemo(() => currentWeekDates(), []);

  const strengthDays = useMemo(() => strengthDayIndicesFromProfile(profile), [profile]);
  // Shabbat (owner 20.10.2026): Saturday is pre-marked only when the user already marked it.
  const avoidDays = useMemo(
    () => (saturdayMarked(data.runningScheduleDayIndices) ? [] : [SATURDAY_DOW]),
    // Decided once per step: tapping Saturday later is the user's own choice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Recommendation policy (owner 20.10.2026): running ability × goals × persona —
  // replaces the same-3-for-everyone default. Falls back to it if the policy throws.
  const policy = useMemo(() => {
    try {
      const inputs = readPolicyInputs(data as PolicyStoreSlice, profile as unknown as PolicyProfileSlice);
      return resolveRecommendation(
        buildPolicySignals({
          tracks: 'running',
          strengthLevel: null,
          run: answers,
          goalIds: inputs.goalIds,
          personaIds: inputs.personaIds,
          age: inputs.age,
          targetDistance,
        }),
      );
    } catch (err) {
      console.error('[RunSignup] recommendation policy failed', err);
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers]);

  const recommended = useMemo(() => {
    if (!policy?.running) return resolveDefaultRunningSchedule(profile);
    const frequency = clampRunningFrequency(policy.running.frequency);
    return { frequency, dayIndices: pickRunDaysAvoidingStrength(frequency, strengthDays, avoidDays) };
  }, [policy, profile, strengthDays, avoidDays]);

  const [frequency, setFrequency] = useState<number>(() => {
    const stored = data.runningScheduleDayIndices;
    return Array.isArray(stored) && stored.length >= 2 && stored.length <= 4 ? stored.length : recommended.frequency;
  });
  const [days, setDays] = useState<number[]>(() => {
    const stored = data.runningScheduleDayIndices;
    return Array.isArray(stored) && stored.length === frequency ? stored : recommended.dayIndices;
  });
  const [windows, setWindows] = useState<Partial<Record<number, TimeWindow>>>(() => data.runningScheduleDayWindows ?? {});
  const [longRunDay, setLongRunDay] = useState<number | null>(() => data.runningLongRunDay ?? null);

  const slots = useMemo(() => {
    try {
      return firstWeekRunSlots(answers, frequency);
    } catch {
      return [];
    }
  }, [answers, frequency]);

  const week = useMemo(
    () => recommendRunWeek({ slots, days, windows, preferredLongRunDay: longRunDay, level, targetDistance }),
    [slots, days, windows, longRunDay, level, targetDistance],
  );

  // Reminders already on? (compact variant) — read once, no prompt.
  const [permission, setPermission] = useState<Awaited<ReturnType<typeof getPushPermissionState>>>('unsupported');
  useEffect(() => {
    let alive = true;
    getPushPermissionState().then((s) => alive && setPermission(s));
    return () => {
      alive = false;
    };
  }, []);
  const settings = (profile as { settings?: { pushEnabled?: unknown; notificationPrefs?: { training_reminder?: unknown } } } | null)?.settings;
  const alreadyActive = isReminderAlreadyActive({
    permission,
    pushEnabled: settings?.pushEnabled,
    trainingReminder: settings?.notificationPrefs?.training_reminder,
  });

  const handleFrequency = (n: number) => {
    setFrequency(n);
    setDays((cur) => daysForFrequency(cur, n, strengthDays, avoidDays));
    setLongRunDay(null);
  };

  const handleToggleDay = (dow: number) => {
    setDays((cur) => toggleRunDay(cur, dow, frequency));
    if (longRunDay === dow) setLongRunDay(null);
  };

  const confirmWeek = async () => {
    const strengthLetters = strengthDays.map((i) => DAY_LETTERS_HE[i]);
    updateData({
      ...buildRunScheduleWrite({ days, windows, strengthDayLetters: strengthLetters }),
      runningScheduleDayWindows: windows,
      runningLongRunDay: week.longRunDow,
    });
    await Analytics.logOnboardingStepComplete('SCHEDULE', 0);
    setSub(3);
  };

  const sessions = runSessionTimes(days, windows);

  const acceptReminders = async ({ leadMinutes, calendarSync }: { leadMinutes: 15 | 30 | 60; calendarSync: boolean }) => {
    const uid = auth.currentUser?.uid;
    // The OS prompt must be the first await (web user-gesture rule).
    if (uid) await requestReminderPermission(uid);
    if (uid) await saveReminderOptIn(uid, reminderSlotsFor(sessions, leadMinutes));
    updateData({ runningNotificationsEnabled: true, calendarSyncEnabled: calendarSync } as never);
    onDone();
  };

  const skipReminders = ({ calendarSync }: { calendarSync: boolean }) => {
    updateData({ runningNotificationsEnabled: false, calendarSyncEnabled: calendarSync } as never);
    onDone();
  };

  const planLine = [planName(answers), weeks ? `${weeks} שבועות` : null].filter(Boolean).join(' · ');

  if (sub === 0) {
    return (
      <RunCountStep
        recommendationTitle={recommendationTitle(week)}
        planLine={planLine}
        notes={policy ? [...policy.reasonsHe, addOnsLineHe(policy.addOns)].filter((x): x is string => !!x) : []}
        recommendedFrequency={recommended.frequency}
        frequency={frequency}
        onFrequency={handleFrequency}
        onNext={() => setSub(1)}
      />
    );
  }
  if (sub === 1) {
    return (
      <RunDaysStep
        frequency={frequency}
        days={days}
        windows={windows}
        dates={dates}
        onToggleDay={handleToggleDay}
        onWindow={(dow, w) => setWindows((cur) => ({ ...cur, [dow]: w }))}
        onNext={() => setSub(2)}
      />
    );
  }
  if (sub === 2) {
    return (
      <RunWeekStep
        subtitle={`ריצה · ${planName(answers)} · מוכן לאישור`}
        week={week}
        days={days}
        dates={dates}
        onLongRunDay={setLongRunDay}
        onConfirm={confirmWeek}
      />
    );
  }
  const first = week.days[0];
  return (
    <ReminderOptInStep
      subtitle={`${days.length} ריצות בשבוע · ${dayLettersLine(days)}`}
      sampleWorkoutName={first ? runSlotNameHe(first.slot) : 'ריצה'}
      sampleTime={first ? RUN_TIME_PRESETS[first.window].time : RUN_TIME_PRESETS.morning.time}
      alreadyActive={alreadyActive}
      initialCalendarSync={(data as { calendarSyncEnabled?: boolean }).calendarSyncEnabled === true}
      onAccept={acceptReminders}
      onSkip={skipReminders}
    />
  );
}
