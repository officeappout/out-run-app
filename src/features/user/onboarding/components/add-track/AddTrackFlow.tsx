'use client';

/**
 * Add track — the end of the SECOND track's signup (enable_home_v2; journeys J3 / J4):
 * the combined week (engine v2, add-track mode over the user's existing week) → the shared
 * reminders step ("already active" variant when reminders are on) → onDone.
 *
 * Saving happens on "אשר את השבוע החדש" (services/add-track-save.service: merge, never
 * clobber). Nothing here asks what the user already answered: no days count, no time,
 * no persona, no identity — the week is built from what is stored.
 */
import { useEffect, useMemo, useState } from 'react';
import { auth } from '@/lib/firebase';
import { useT } from '@/hooks/useT';
import { onboarding, type OnboardingKey } from '@/messages/ns/onboarding';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { Analytics } from '@/features/analytics/AnalyticsService';
import ReminderOptInStep from '@/features/schedule/components/ReminderOptInStep';
import { isReminderAlreadyActive, reminderSlotsFor } from '@/features/schedule/utils/reminderOptIn';
import {
  getPushPermissionState,
  recordReminderDeferral,
  requestReminderPermission,
  saveReminderOptIn,
} from '@/features/schedule/services/reminderOptIn.service';
import type { AddedTrack } from '@/features/schedule/add-track/addTrackProfile';
import {
  buildAddTrackWeek,
  presetPriority,
  priorityFromShare,
  shareOfPriority,
} from '@/features/schedule/add-track/addTrackWeek';
import { comingDayOfMonthByDow } from '@/features/schedule/utils/comingWeekDates';
import type { AddTrackSavePlan } from '@/features/schedule/add-track/addTrackSave';
import { useOnboardingStore } from '../../store/useOnboardingStore';
import { useAddTrackContext } from '../../hooks/useAddTrackContext';
import { saveAddTrackCalendarSync, saveAddTrackWeek } from '../../services/add-track-save.service';
import AddTrackWeekStep from './AddTrackWeekStep';

export const ADD_TRACK_SUBSTEPS = 2;

export interface AddTrackFlowProps {
  added: AddedTrack;
  sub: number;
  setSub: (n: number) => void;
  onDone: () => void;
}

export default function AddTrackFlow({ added, sub, setSub, onDone }: AddTrackFlowProps) {
  const t = useT(onboarding);
  const ctx = useAddTrackContext(added);
  const profile = useUserStore((s) => s.profile);
  const updateData = useOnboardingStore((s) => s.updateData);
  const dates = useMemo(() => comingDayOfMonthByDow(new Date()), []);

  const [share, setShare] = useState(() => shareOfPriority(presetPriority(added)));
  const [keepOnly, setKeepOnly] = useState(false);
  const [error, setError] = useState<OnboardingKey | null>(null);
  const [saved, setSaved] = useState<AddTrackSavePlan | null>(null);
  const priority = priorityFromShare(share);

  const recommended = useMemo(() => {
    if (!ctx) return null;
    try {
      return buildAddTrackWeek(ctx.input, priority, false);
    } catch (err) {
      console.error('[AddTrack] engine failed', err);
      return null;
    }
  }, [ctx, priority]);
  const keepWeek = useMemo(() => {
    if (!ctx || !recommended || recommended.movedCount === 0) return null;
    try {
      return buildAddTrackWeek(ctx.input, priority, true);
    } catch {
      return null;
    }
  }, [ctx, recommended, priority]);
  const week = keepOnly && keepWeek ? keepWeek : recommended;

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

  if (!ctx || !week) {
    return <div className="flex-1 bg-v2-surface" aria-busy="true" />;
  }

  const confirm = async () => {
    const uid = auth.currentUser?.uid;
    setError(null);
    if (!uid) {
      setError('signup.addTrack.error.noAccount');
      throw new Error('no uid');
    }
    const outcome = await saveAddTrackWeek(
      uid,
      {
        added,
        days: week.days,
        existingStrengthIds: ctx.existingStrengthIds,
        newStrengthIds: ctx.newStrengthIds,
        isStrengthId: ctx.isStrengthId,
        times: ctx.times,
      },
      { longRunDow: week.days.find((d) => d.sessions.some((s) => s.slot === 'long_run'))?.dow ?? null },
    );
    if (!outcome.ok || !outcome.plan) {
      setError('signup.addTrack.error.save');
      throw new Error('save failed');
    }
    setSaved(outcome.plan);
    await Analytics.logOnboardingStepComplete('SCHEDULE', 0);
    setSub(1);
  };

  if (sub === 0 || !saved) {
    return (
      <AddTrackWeekStep
        added={added}
        week={week}
        dates={dates}
        times={ctx.times}
        priority={priority}
        share={share}
        onShare={setShare}
        keepOnly={keepOnly && !!keepWeek}
        onToggleKeepOnly={keepWeek ? () => setKeepOnly((v) => !v) : null}
        error={error ? t(error) : null}
        onConfirm={confirm}
      />
    );
  }

  const sessions = saved.sessions;
  const first = week.days.flatMap((d) => d.sessions).find((s) => s.status === 'new') ?? week.days.flatMap((d) => d.sessions)[0];
  const firstTime = first?.kind === 'run' ? ctx.times.run : ctx.times.strength;

  const finish = async (calendarSync: boolean, notifications: boolean) => {
    const uid = auth.currentUser?.uid;
    // A new running track goes through the store (the signup's sync carries it); a new
    // strength track never touches the store — its signup was already synced.
    if (added === 'running') updateData({ runningNotificationsEnabled: notifications, calendarSyncEnabled: calendarSync } as never);
    else if (uid) await saveAddTrackCalendarSync(uid, calendarSync);
    onDone();
  };

  return (
    <ReminderOptInStep
      subtitle={t('signup.addTrack.reminder.subtitle', { count: String(sessions.length), added })}
      sampleWorkoutName={first?.nameHe ?? t('signup.addTrack.reminder.sampleFallback')}
      sampleTime={firstTime}
      alreadyActive={alreadyActive}
      initialCalendarSync={(useOnboardingStore.getState().data as { calendarSyncEnabled?: boolean }).calendarSyncEnabled === true}
      onAccept={async ({ leadMinutes, calendarSync }) => {
        const uid = auth.currentUser?.uid;
        // The OS prompt must be the first await (web user-gesture rule).
        // Saved only when the OS allows it (an earlier answer never re-prompts).
        if (uid && (await requestReminderPermission(uid))) await saveReminderOptIn(uid, reminderSlotsFor(sessions, leadMinutes));
        await finish(calendarSync, true);
      }}
      onSkip={({ calendarSync }) => {
        recordReminderDeferral();
        return finish(calendarSync, false);
      }}
    />
  );
}
