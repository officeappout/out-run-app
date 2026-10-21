'use client';

/**
 * Settings › התראות — the push re-ask card (enable_home_v2; mounted by
 * SettingsModal's notifications screen under its v2 flag).
 *
 * Shows while the OS permission is still 'prompt', or it is granted but push /
 * training reminders are off (utils/pushReAsk, moment 'settings'). "כן,
 * תזכירו לי" runs the OS prompt FIRST (web gesture rule), then turns push +
 * training reminders on only if the OS allowed it, and mirrors that into the
 * settings store so the toggles below update. Denied / unsupported → hidden
 * (the existing permission row already links to the OS settings).
 */
import { useState } from 'react';
import { Bell } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { SoftAskCard } from '@/components/ui/v2';
import { useSettingsStore } from '@/features/home/store/useSettingsStore';
import { usePushPermission } from '../../hooks/usePushPermission';
import { enableRemindersFromReAsk } from '../../services/reminderOptIn.service';
import { PUSH_SOFT_ASK_COPY, shouldShowPushReAsk } from '../../utils/pushReAsk';

export default function PushReAskSettingsCard() {
  const isLoaded = useSettingsStore((s) => s.isLoaded);
  const pushEnabled = useSettingsStore((s) => s.pushEnabled);
  const trainingReminder = useSettingsStore((s) => s.trainingReminderNotif);
  const patch = useSettingsStore((s) => s.patch);
  const { permission, refresh } = usePushPermission();
  const [busy, setBusy] = useState(false);

  if (!isLoaded || permission == null) return null;
  if (!shouldShowPushReAsk({ moment: 'settings', permission, pushEnabled, trainingReminder, shownAt: null })) return null;

  const accept = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid || busy) return;
    setBusy(true);
    try {
      // OS prompt first — enableRemindersFromReAsk's first await.
      const granted = await enableRemindersFromReAsk(uid);
      if (granted) patch({ pushEnabled: true, trainingReminderNotif: true });
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <SoftAskCard
      className="mb-4"
      icon={Bell}
      title={PUSH_SOFT_ASK_COPY.title}
      body={PUSH_SOFT_ASK_COPY.body}
      primaryLabel={PUSH_SOFT_ASK_COPY.accept}
      onPrimary={() => void accept()}
      busy={busy}
    />
  );
}
