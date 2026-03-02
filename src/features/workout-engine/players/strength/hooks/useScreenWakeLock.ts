'use client';

import { useEffect, useRef, useCallback } from 'react';

/**
 * useScreenWakeLock — keeps the screen awake during active workout states.
 *
 * Acquires a WakeLock when `active` is true, releases it when false or on unmount.
 * Re-acquires automatically when the tab becomes visible again (handles iOS/Android
 * backgrounding where the lock is auto-released).
 *
 * Safe fallback: no-ops silently on browsers that don't support the Wake Lock API.
 */
export function useScreenWakeLock(active: boolean) {
  const sentinelRef = useRef<WakeLockSentinel | null>(null);
  const activeRef = useRef(active);
  activeRef.current = active;

  const acquire = useCallback(async () => {
    if (!activeRef.current) return;
    if (sentinelRef.current && !sentinelRef.current.released) return;
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;

    try {
      sentinelRef.current = await navigator.wakeLock.request('screen');
      console.log('[WakeLock] Acquired');
      sentinelRef.current.addEventListener('release', () => {
        console.log('[WakeLock] Released by system');
      });
    } catch (err) {
      console.warn('[WakeLock] Failed to acquire:', (err as Error).message);
    }
  }, []);

  const release = useCallback(async () => {
    if (sentinelRef.current && !sentinelRef.current.released) {
      try {
        await sentinelRef.current.release();
        console.log('[WakeLock] Released manually');
      } catch {
        // already released
      }
      sentinelRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (active) {
      acquire();
    } else {
      release();
    }
    return () => { release(); };
  }, [active, acquire, release]);

  // Re-acquire when tab becomes visible (OS releases lock on background)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && activeRef.current) {
        acquire();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [acquire]);
}
