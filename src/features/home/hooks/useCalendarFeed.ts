'use client';

/**
 * Calendar subscription (SEC-04 token feed) — the "סנכרון ליומן" action,
 * shared by the home schedule (classic) and Settings (home v2 moved it there,
 * owner's review 17.10.2026). Extracted from SmartWeeklySchedule unchanged.
 *
 * The token path is fetched once per user up front so the tap handler stays
 * synchronous — an await before window.open / location.href loses the user
 * gesture on iOS Safari. null (action disabled) while loading or on
 * 401/403/503/network failure.
 */
import { useEffect, useState } from 'react';
import { APP_CONFIG_LINKS } from '@/lib/config/app-urls';
import { auth } from '@/lib/firebase';

export function useCalendarFeedPath(userId: string | null | undefined): string | null {
  const [path, setPath] = useState<string | null>(null);
  useEffect(() => {
    setPath(null);
    if (!userId) return;
    let cancelled = false;
    const RETRY_DELAYS_MS = [1000, 3000]; // 3 attempts total
    (async () => {
      try {
        await auth.authStateReady();
      } catch {
        return;
      }
      for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
        if (cancelled) return;
        try {
          const idToken = await auth.currentUser?.getIdToken();
          if (!idToken) return;
          const res = await fetch('/api/calendar/token', { method: 'POST', headers: { Authorization: `Bearer ${idToken}` } });
          if (res.ok) {
            const data = (await res.json()) as { path?: unknown };
            if (!cancelled && typeof data.path === 'string' && data.path.startsWith('/api/calendar/t/')) setPath(data.path);
            return;
          }
          // 4xx and 503 are final; only transient 500/502/504 is retried.
          if (![500, 502, 504].includes(res.status)) return;
        } catch {
          // network failure — retry
        }
        if (attempt < RETRY_DELAYS_MS.length) await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);
  return path;
}

/** Open the subscription in the platform's calendar (synchronous — keep it in the tap). */
export function openCalendarSubscription(feedPath: string): void {
  const w = window as unknown as { Capacitor?: { getPlatform?: () => string } };
  const platform = w.Capacitor?.getPlatform?.() ?? 'web';
  const feedHost = platform !== 'web' ? APP_CONFIG_LINKS.WEB_BASE_URL.replace('https://', '') : window.location.host;
  const webcalUrl = `webcal://${feedHost}${feedPath}`;
  if (platform === 'android') {
    window.open(`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalUrl)}`, '_system');
  } else if (platform === 'ios') {
    window.open(webcalUrl, '_system');
  } else {
    window.location.href = webcalUrl;
  }
}
