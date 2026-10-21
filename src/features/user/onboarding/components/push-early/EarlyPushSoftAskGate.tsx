'use client';

/**
 * EarlyPushSoftAskGate — the early push ask (enable_home_v2, owner 21.10.2026):
 * right after the track pick (gateway → /onboarding-new/profile), BEFORE the
 * identity step and the long questionnaire, so a drop-off still has a token
 * for the "continue?" push.
 *
 *   <EarlyPushSoftAskGate context={ctx}><IdentityProfileScreen … /></EarlyPushSoftAskGate>
 *
 * Shows EarlyPushSoftAskScreen once per device, only on the plain signup path
 * (no ?context=), only while the OS can still prompt (permission 'prompt', not
 * iOS Safari outside a PWA) — utils/pushReAsk, moment 'signup_start'.
 * Otherwise, and always with the flag off, renders `children` untouched.
 *  - "כן, תזכירו לי" → the OS prompt FIRST, then push + training reminders on
 *    only if allowed (enableRemindersFromReAsk).
 *  - "לא עכשיו" → no OS prompt; recordReminderDeferral() (→ the native auth
 *    bridge stays silent: no cold OS dialog on the next launch).
 * The later schedule-step ReminderOptInStep still appears for the lead time;
 * once the OS has answered it never prompts again.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { auth } from '@/lib/firebase';
import { isIOSDevice, isNativePlatform, isStandalonePWA } from '@/lib/native/push';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import {
  enableRemindersFromReAsk,
  getPushPermissionState,
  markReAskShown,
  readReAskShownAt,
  recordReminderDeferral,
} from '@/features/schedule/services/reminderOptIn.service';
import { shouldShowPushReAsk } from '@/features/schedule/utils/pushReAsk';
import EarlyPushSoftAskScreen from './EarlyPushSoftAskScreen';

/** Never hold the identity step longer than this while deciding. */
const DECIDE_CAP_MS = 2500;

export default function EarlyPushSoftAskGate({ context, children }: { context?: string | null; children: ReactNode }) {
  const isSuperAdmin = useUserStore((st) => !!(st.profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin);
  const { flags, ready } = useFeatureFlags(isSuperAdmin);
  const v2 = flags.enableHomeV2;
  const eligibleContext = !context;
  const [decision, setDecision] = useState<'pending' | 'ask' | 'pass'>('pending');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (decision !== 'pending' || !eligibleContext || !ready || !v2) return;
    let alive = true;
    const cap = window.setTimeout(() => alive && setDecision((d) => (d === 'pending' ? 'pass' : d)), DECIDE_CAP_MS);
    void Promise.all([getPushPermissionState(), readReAskShownAt('signup_start')]).then(([permission, shownAt]) => {
      if (!alive) return;
      const iosWebBlocked = !isNativePlatform() && isIOSDevice() && !isStandalonePWA();
      const show = !!auth.currentUser?.uid && shouldShowPushReAsk({ moment: 'signup_start', permission, shownAt, iosWebBlocked });
      setDecision((d) => (d === 'pending' ? (show ? 'ask' : 'pass') : d));
    });
    return () => {
      alive = false;
      window.clearTimeout(cap);
    };
  }, [decision, eligibleContext, ready, v2]);

  // Flag off / other contexts: exactly today's screen, no wait.
  if (!eligibleContext || (ready && !v2) || decision === 'pass') return <>{children}</>;
  if (decision === 'pending') return <div className="min-h-[100dvh] bg-v2-surface" aria-busy />;

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
      setDecision('pass');
    }
  };
  const defer = () => {
    if (busy) return;
    markReAskShown('signup_start');
    recordReminderDeferral();
    setDecision('pass');
  };

  return <EarlyPushSoftAskScreen busy={busy} onAccept={() => void accept()} onDefer={defer} />;
}
