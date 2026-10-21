'use client';

/**
 * LifestyleWizard's reminders step under enable_home_v2 — the shared
 * ReminderOptInStep (#523) instead of the wizard's own notifications card
 * (boards jr/J1-10, J1-11). Flag off keeps the old step.
 *
 * "כן, תזכיר לי": the OS prompt first (requestReminderPermission — must be
 * the first await, web user-gesture rule), then push + training reminders on
 * and one "X minutes before" slot per workout (reminderOptIn.service). iOS
 * Safari outside an installed PWA cannot prompt at all → the wizard shows its
 * "add to home screen" sheet instead. Push failures never block: the wizard's
 * final submit always runs.
 */
import { useEffect, useState } from 'react';
import { auth } from '@/lib/firebase';
import { isIOSDevice, isNativePlatform, isStandalonePWA } from '@/lib/native/push';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import ReminderOptInStep, { type ReminderOptInResult } from '@/features/schedule/components/ReminderOptInStep';
import { isReminderAlreadyActive, reminderSlotsFor, type PushPermissionState } from '@/features/schedule/utils/reminderOptIn';
import {
  getPushPermissionState,
  recordReminderDeferral,
  requestReminderPermission,
  saveReminderOptIn,
} from '@/features/schedule/services/reminderOptIn.service';
import type { WizardReminderPlan } from '../../utils/wizard-reminder-plan';

export interface WizardRemindersStepV2Props {
  plan: WizardReminderPlan;
  initialCalendarSync: boolean;
  /** Runs the wizard's final submit with the calendar answer. */
  onFinish: (calendarSync: boolean) => Promise<unknown>;
  /** iOS Safari (not installed): show the add-to-home-screen instructions. */
  onIOSBlocked: (calendarSync: boolean) => void;
}

export default function WizardRemindersStepV2({ plan, initialCalendarSync, onFinish, onIOSBlocked }: WizardRemindersStepV2Props) {
  const profile = useUserStore((s) => s.profile);
  const [permission, setPermission] = useState<PushPermissionState>('unsupported');
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

  const accept = async ({ leadMinutes, calendarSync }: ReminderOptInResult) => {
    if (!alreadyActive && !isNativePlatform() && isIOSDevice() && !isStandalonePWA()) {
      onIOSBlocked(calendarSync);
      return;
    }
    const uid = auth.currentUser?.uid;
    if (uid) {
      // Saved only when the OS allows it (an earlier answer never re-prompts).
      if (await requestReminderPermission(uid)) await saveReminderOptIn(uid, reminderSlotsFor(plan.sessions, leadMinutes));
    }
    await onFinish(calendarSync);
  };

  return (
    <ReminderOptInStep
      subtitle={plan.subtitle}
      sampleWorkoutName={plan.sampleWorkoutName}
      sampleTime={plan.sampleTime}
      alreadyActive={alreadyActive}
      initialCalendarSync={initialCalendarSync}
      onAccept={accept}
      onSkip={async ({ calendarSync }) => {
        // "לא עכשיו": no OS prompt and no Firestore write — remember it on the device.
        recordReminderDeferral();
        await onFinish(calendarSync);
      }}
    />
  );
}
