'use client';

/**
 * AppSessionBootstrap — root-level, renders nothing. Feeds the app-session signal
 * (enable_app_session_signal, default OFF — src/features/analytics/app-session.ts):
 *   - first auth resolution with a user (cold start) → recordAppForeground()
 *   - visibilitychange → hidden: noteAppHidden(); visible: recordAppForeground()
 * Every handler checks the flag first, so with it off nothing is stored or written.
 */
import { useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { noteAppHidden, recordAppForeground } from '@/features/analytics/app-session';

export default function AppSessionBootstrap() {
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) void recordAppForeground();
    });
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') noteAppHidden();
      else if (document.visibilityState === 'visible') void recordAppForeground();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      unsubscribe();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);
  return null;
}
