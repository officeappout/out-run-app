'use client';

/**
 * The push soft-ask for the map-only signup (owner 30.10.2026). A "גלו את
 * המפה" user goes gateway → /explorer → /map and never meets LifestyleWizard
 * or home, and the native auth bridge stays silent for an anonymous user who
 * has not finished onboarding, so nobody ever asked them (about half of new
 * signups, none with a token). Not behind enable_home_v2.
 *
 *   const pushAsk = useMapOnlyPushAsk();
 *   onExplorerDismiss: pushAsk.thenGo(() => router.push(url));
 *   {pushAsk.screen}
 *
 * thenGo() decides (bounded by DECIDE_CAP_MS) whether to show
 * EarlyPushSoftAskScreen first: same once-per-device 'signup_start' moment as
 * EarlyPushSoftAskGate, so a device that already saw the early ask is not
 * asked twice. Accept / defer then run the navigation.
 */
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { auth } from '@/lib/firebase';
import { isIOSDevice, isNativePlatform, isStandalonePWA } from '@/lib/native/push';
import {
  enableRemindersFromReAsk,
  getPushPermissionState,
  markReAskShown,
  readReAskShownAt,
  recordReminderDeferral,
} from '@/features/schedule/services/reminderOptIn.service';
import { shouldShowPushReAsk } from '@/features/schedule/utils/pushReAsk';
import EarlyPushSoftAskScreen from './EarlyPushSoftAskScreen';

/** Never hold the map longer than this while deciding. */
const DECIDE_CAP_MS = 2500;

async function shouldAsk(): Promise<boolean> {
  if (!auth.currentUser?.uid) return false;
  const [permission, shownAt] = await Promise.all([getPushPermissionState(), readReAskShownAt('signup_start')]);
  const iosWebBlocked = !isNativePlatform() && isIOSDevice() && !isStandalonePWA();
  return shouldShowPushReAsk({ moment: 'signup_start', permission, shownAt, iosWebBlocked });
}

export function useMapOnlyPushAsk(): { thenGo: (go: () => void) => Promise<void>; screen: ReactNode } {
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  const goRef = useRef<(() => void) | null>(null);

  const thenGo = useCallback(async (go: () => void) => {
    const ask = await Promise.race([
      shouldAsk().catch(() => false),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), DECIDE_CAP_MS)),
    ]);
    if (!ask) {
      go();
      return;
    }
    goRef.current = go;
    setPending(true);
  }, []);

  const finish = () => {
    setPending(false);
    goRef.current?.();
    goRef.current = null;
  };

  const accept = async () => {
    const uid = auth.currentUser?.uid;
    if (busy) return;
    setBusy(true);
    markReAskShown('signup_start');
    try {
      // OS prompt first — enableRemindersFromReAsk's first await.
      if (uid) await enableRemindersFromReAsk(uid);
    } finally {
      setBusy(false);
      finish();
    }
  };

  const defer = () => {
    if (busy) return;
    markReAskShown('signup_start');
    recordReminderDeferral();
    finish();
  };

  const screen = pending ? (
    <div className="fixed inset-0 z-[200] bg-v2-surface">
      <EarlyPushSoftAskScreen busy={busy} onAccept={() => void accept()} onDefer={defer} />
    </div>
  ) : null;

  return { thenGo, screen };
}
