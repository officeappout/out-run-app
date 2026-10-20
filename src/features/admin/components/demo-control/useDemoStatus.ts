'use client';
/**
 * Live status for /admin/demo: GET /api/admin/demo/status, re-polled every
 * POLL_MS while the tab is visible (paused when hidden, refreshed on return).
 * demo_registry is server-only, so a client onSnapshot isn't possible; one small
 * bounded request per tick is the live channel. Never overlaps two requests.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { DemoStatusPayload } from '@/lib/demo-control/status';
import { demoFetch, readError } from './demo-client';

export const POLL_MS = 15_000;

export function useDemoStatus(enabled: boolean) {
  const [data, setData] = useState<DemoStatusPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<number | null>(null);
  const inFlight = useRef(false);

  const reload = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await demoFetch('/api/admin/demo/status');
      if (!res.ok) throw new Error(await readError(res));
      setData((await res.json()) as DemoStatusPayload);
      setError(null);
      setLastFetchedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'הטעינה נכשלה');
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer) return;
      void reload();
      timer = setInterval(() => void reload(), POLL_MS);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => (document.hidden ? stop() : start());
    if (!document.hidden) start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [enabled, reload]);

  return { data, error, lastFetchedAt, reload, loading: enabled && !data && !error };
}
