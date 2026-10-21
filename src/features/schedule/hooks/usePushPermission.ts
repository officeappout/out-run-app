'use client';

/**
 * The current OS push permission, read without prompting (null until known).
 * Re-reads when the app becomes visible again (the user may come back from
 * the OS settings); the listener is removed on unmount. `enabled: false`
 * skips everything (flag-off callers).
 */
import { useCallback, useEffect, useState } from 'react';
import { getPushPermissionState } from '../services/reminderOptIn.service';
import type { PushPermissionState } from '../utils/reminderOptIn';

export function usePushPermission(enabled = true): {
  permission: PushPermissionState | null;
  refresh: () => Promise<PushPermissionState>;
} {
  const [permission, setPermission] = useState<PushPermissionState | null>(null);

  const refresh = useCallback(async () => {
    const s = await getPushPermissionState();
    setPermission(s);
    return s;
  }, []);

  useEffect(() => {
    if (!enabled || typeof document === 'undefined') return;
    let alive = true;
    const read = () => {
      void getPushPermissionState().then((s) => {
        if (alive) setPermission(s);
      });
    };
    read();
    const onVisible = () => {
      if (document.visibilityState === 'visible') read();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled]);

  return { permission, refresh };
}
