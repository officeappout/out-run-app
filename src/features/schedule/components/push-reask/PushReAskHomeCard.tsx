'use client';

/**
 * Home — the push re-ask card for users who never allowed push (owner
 * 30.10.2026). Rules: utils/pushReAsk homeReAskAction (every 3 days, at most
 * 5 shows per device). Not behind enable_home_v2: every user who reaches home.
 *
 *  - permission 'prompt': "כן, תזכירו לי" → the OS prompt FIRST (web gesture
 *    rule), then push + training reminders on only if allowed.
 *  - permission 'denied' (native): "מעבר להגדרות" → the OS app settings; the
 *    card re-reads the permission when the app becomes visible again.
 *  - "לא עכשיו" → hidden until the next cooldown.
 * A show is stamped when the card first renders, so the cooldown counts
 * impressions, not taps. Renders nothing while deciding.
 */
import { useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { SoftAskCard } from '@/components/ui/v2';
import { useT } from '@/hooks/useT';
import { schedule } from '@/messages/ns/schedule';
import { isIOSDevice, isNativePlatform, isStandalonePWA } from '@/lib/native/push';
import { usePushPermission } from '../../hooks/usePushPermission';
import {
  enableRemindersFromReAsk,
  markHomeReAskShown,
  readHomeReAskCount,
  readReAskShownAt,
} from '../../services/reminderOptIn.service';
import { homeReAskAction, type HomeReAskAction } from '../../utils/pushReAsk';

function openNativeAppSettings(): void {
  try {
    // Capacitor routes this scheme to the app's page in the OS settings.
    window.open('app-settings:', '_system');
  } catch {
    // Not supported on this platform — nothing to do.
  }
}

export default function PushReAskHomeCard({ className = '' }: { className?: string }) {
  const t = useT(schedule);
  const { permission, refresh } = usePushPermission();
  const [action, setAction] = useState<HomeReAskAction | 'pending'>('pending');
  const [busy, setBusy] = useState(false);
  const stamped = useRef(false);

  // Decide once per mount, from the first known permission.
  useEffect(() => {
    if (permission == null || action !== 'pending') return;
    let alive = true;
    void Promise.all([readReAskShownAt('home'), readHomeReAskCount()]).then(([shownAt, shownCount]) => {
      if (!alive) return;
      const isNative = isNativePlatform();
      const next = auth.currentUser?.uid
        ? homeReAskAction({
            permission,
            shownAt,
            shownCount,
            now: Date.now(),
            isNative,
            iosWebBlocked: !isNative && isIOSDevice() && !isStandalonePWA(),
          })
        : null;
      if (next && !stamped.current) {
        stamped.current = true;
        markHomeReAskShown(shownCount);
      }
      setAction(next);
    });
    return () => {
      alive = false;
    };
  }, [permission, action]);

  // Back from the OS settings (or a grant elsewhere): hide once allowed.
  useEffect(() => {
    if (permission === 'granted' && action !== 'pending' && action !== null) setAction(null);
  }, [permission, action]);

  if (action === 'pending' || action === null) return null;

  const accept = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid || busy) return;
    setBusy(true);
    try {
      // OS prompt first — enableRemindersFromReAsk's first await.
      await enableRemindersFromReAsk(uid);
      await refresh();
    } finally {
      setBusy(false);
      setAction(null);
    }
  };

  const denied = action === 'open_settings';
  return (
    <div className={className}>
      <SoftAskCard
        icon={Bell}
        title={t(denied ? 'pushReAsk.home.deniedTitle' : 'pushReAsk.home.title')}
        body={t(denied ? 'pushReAsk.home.deniedBody' : 'pushReAsk.home.body')}
        primaryLabel={t(denied ? 'pushReAsk.home.openSettings' : 'pushReAsk.home.accept')}
        onPrimary={denied ? openNativeAppSettings : () => void accept()}
        secondaryLabel={t('pushReAsk.home.defer')}
        onSecondary={() => setAction(null)}
        busy={busy}
        primaryTone="tint"
      />
    </div>
  );
}
