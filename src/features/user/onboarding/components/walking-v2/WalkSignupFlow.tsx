'use client';

/**
 * Walking signup (enable_home_v2, owner 20.10.2026; boards wr/WR-3a..3d):
 * goal → days (pre-filled from the algorithm) → the week → reminders.
 *
 * The plan is the pure walking algorithm (features/schedule/walking): recent steps
 * (the adaptive step goal, #414), the goal, the free days (Saturday off), the
 * audience (policy, #529) → a weekly-minutes target that ramps ≤ 10% a week.
 * "אישור השבוע" writes the walks to the schedule (walkSave.service — existing
 * userSchedule entry fields only) and the goal + weekly target to
 * lifestyle.walkingGoal (the weekly top-up grows toward it). Reminders: the shared step (#523).
 * `sub` lives in the page so its header back button can step back here.
 */
import { useMemo, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { useActivityStore } from '@/features/activity/store/useActivityStore';
import { hasRunningTrack, hasStrengthTrack } from '@/lib/track-ownership';
import type { TimeWindow } from '@/features/schedule/engine-v2/types';
import { dayLettersLine, runSessionTimes, toggleRunDay, RUN_TIME_PRESETS, DEFAULT_RUN_WINDOW } from '@/features/schedule/utils/runWeekRecommendation';
import { isReminderAlreadyActive, reminderSlotsFor } from '@/features/schedule/utils/reminderOptIn';
import { getPushPermissionState, requestReminderPermission, saveReminderOptIn } from '@/features/schedule/services/reminderOptIn.service';
import ReminderOptInStep from '@/features/schedule/components/ReminderOptInStep';
import {
  DEFAULT_WALK_DAYS,
  WALK_PLAN_CONFIG,
  recommendWalkPlan,
  walkAddOn,
  walkAudience,
  walkPieceTitle,
  walkingGroupHref,
  type WalkComfort,
  type WalkGoal,
} from '@/features/schedule/walking';
import { saveWalkPlan } from '@/features/schedule/walking/walkSave.service';
import { walkingGoalToStore } from '@/features/schedule/walking/walkingGoal';
import { useNearbyWalkingGroup } from '@/features/schedule/walking/useNearbyWalkingGroup';
import type { RecurringTemplate } from '@/features/user/scheduling/types/schedule.types';
import { useOnboardingStore } from '../../store/useOnboardingStore';
import { readPolicyInputs, type PolicyProfileSlice, type PolicyStoreSlice } from '../../utils/policy-inputs';
import RunDaysStep from '../running-v2/signup-schedule/RunDaysStep';
import WalkGoalStep from './WalkGoalStep';
import WalkWeekStep from './WalkWeekStep';

export const WALK_SIGNUP_SUBSTEPS = 4;

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

export interface WalkSignupFlowProps {
  sub: number;
  setSub: (n: number) => void;
  onDone: () => void;
}

export default function WalkSignupFlow({ sub, setSub, onDone }: WalkSignupFlowProps) {
  const router = useRouter();
  const { data } = useOnboardingStore();
  const profile = useUserStore((s) => s.profile);
  const resolvedStepGoal = useActivityStore((s) => s.resolvedStepGoal);
  const stepGoal = resolvedStepGoal ?? (profile as { goals?: { dailySteps?: number } } | null)?.goals?.dailySteps ?? null;

  const inputs = useMemo(
    () => readPolicyInputs(data as PolicyStoreSlice, profile as unknown as PolicyProfileSlice),
    // Read once per mount — the answers don't change inside this flow.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const audience = walkAudience(inputs.personaIds, inputs.age);

  const [goal, setGoal] = useState<WalkGoal | null>(null);
  const [comfort, setComfort] = useState<WalkComfort>('medium');
  const [addOnOn, setAddOnOn] = useState(true);
  const [pickedDays, setPickedDays] = useState<number[] | null>(null);
  const [windows, setWindows] = useState<Partial<Record<number, TimeWindow>>>({});
  const [error, setError] = useState<string | null>(null);
  const dates = useMemo(() => currentWeekDates(), []);

  const planInput = { goal: goal ?? 'health', comfort, stepGoal, availableDays: [...DEFAULT_WALK_DAYS], audience };
  const recommended = useMemo(() => recommendWalkPlan(planInput), [goal, comfort, stepGoal, audience]); // eslint-disable-line react-hooks/exhaustive-deps
  const days = pickedDays ?? recommended.days;
  const plan = useMemo(() => recommendWalkPlan(planInput, WALK_PLAN_CONFIG, days), [recommended, days]); // eslint-disable-line react-hooks/exhaustive-deps

  const policyAddOn = useMemo(() => (goal ? walkAddOn(goal, inputs.personaIds, inputs.age) : null), [goal, inputs]);
  const addOn = policyAddOn && addOnOn ? policyAddOn : null;
  const notAlone = useNearbyWalkingGroup(sub === 2);

  // Changing the goal / comfort re-recommends the days.
  const onGoal = (g: WalkGoal) => { setGoal(g); setPickedDays(null); };
  const onComfort = (c: WalkComfort) => { setComfort(c); setPickedDays(null); };

  // Reminders already on? (compact variant) — read once, no prompt.
  const [permission, setPermission] = useState<Awaited<ReturnType<typeof getPushPermissionState>>>('unsupported');
  useEffect(() => {
    let alive = true;
    getPushPermissionState().then((s) => alive && setPermission(s));
    return () => { alive = false; };
  }, []);
  const settings = (profile as { settings?: { pushEnabled?: unknown; notificationPrefs?: { training_reminder?: unknown } } } | null)?.settings;
  const alreadyActive = isReminderAlreadyActive({
    permission,
    pushEnabled: settings?.pushEnabled,
    trainingReminder: settings?.notificationPrefs?.training_reminder,
  });

  const confirmWeek = async () => {
    setError(null);
    try {
      const lifestyle = (profile?.lifestyle ?? {}) as { recurringTemplate?: RecurringTemplate; reminders?: { runningTime?: string; strengthTime?: string }; primaryTrack?: unknown };
      await saveWalkPlan({
        plan,
        windows,
        recurringTemplate: lifestyle.recurringTemplate ?? null,
        reminders: lifestyle.reminders,
        setHealthTrack: !hasStrengthTrack(profile) && !hasRunningTrack(profile) && !lifestyle.primaryTrack,
        walkingGoal: walkingGoalToStore(goal ?? 'health', plan),
      });
      setSub(3);
    } catch (err) {
      console.error('[WalkSignup] save failed', err);
      setError('לא הצלחנו לשמור את השבוע. נסו שוב.');
    }
  };

  const sessions = runSessionTimes(days, windows);
  const acceptReminders = async ({ leadMinutes }: { leadMinutes: 15 | 30 | 60; calendarSync: boolean }) => {
    const uid = auth.currentUser?.uid;
    // The OS prompt must be the first await (web user-gesture rule).
    if (uid) await requestReminderPermission(uid);
    if (uid) await saveReminderOptIn(uid, reminderSlotsFor(sessions, leadMinutes));
    onDone();
  };

  if (sub === 0) {
    return (
      <WalkGoalStep
        goal={goal}
        onGoal={onGoal}
        comfort={comfort}
        onComfort={onComfort}
        stepGoal={stepGoal}
        addOn={policyAddOn}
        addOnOn={addOnOn}
        onAddOn={setAddOnOn}
        onNext={() => setSub(1)}
      />
    );
  }
  if (sub === 1) {
    const usual = recommended.weeks[0]?.walks.find((w) => !w.isLong) ?? recommended.weeks[0]?.walks[0];
    return (
      <RunDaysStep
        title="מתי נצא להליכה?"
        subtitle={`ממליצים ${recommended.frequency} הליכות בשבוע${usual ? ` · ${usual.minutes} דק׳` : ''} · שבת חופשית`}
        frequency={recommended.frequency}
        days={days}
        windows={windows}
        dates={dates}
        onToggleDay={(dow) => setPickedDays(toggleRunDay(days, dow, recommended.frequency))}
        onWindow={(dow, w) => setWindows((cur) => ({ ...cur, [dow]: w }))}
        onNext={() => setSub(2)}
      />
    );
  }
  if (sub === 2) {
    return (
      <WalkWeekStep
        plan={plan}
        addOn={addOn}
        windows={windows}
        dates={dates}
        notAlone={notAlone}
        onOpenGroup={(id) => router.push(walkingGroupHref(id))}
        error={error}
        onConfirm={confirmWeek}
      />
    );
  }
  const first = plan.weeks[0]?.walks[0];
  const firstWindow = first ? windows[first.dow] ?? DEFAULT_RUN_WINDOW : DEFAULT_RUN_WINDOW;
  return (
    <ReminderOptInStep
      subtitle={`${days.length} הליכות בשבוע · ${dayLettersLine(days)}`}
      sampleWorkoutName={first ? walkPieceTitle(first) : 'הליכה מהירה'}
      sampleTime={RUN_TIME_PRESETS[firstWindow].time}
      sampleDetail={first ? `${first.minutes} דק׳ · ~${first.estSteps.toLocaleString('he-IL')} צעדים` : undefined}
      alreadyActive={alreadyActive}
      onAccept={acceptReminders}
      onSkip={() => onDone()}
    />
  );
}
