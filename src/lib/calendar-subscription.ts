'use client';

/**
 * Calendar subscription (SEC-04 token feed) — the "סנכרון ליומן" action,
 * shared by the home schedule (classic) and Settings (home v2 moved it there,
 * owner's review 17.10.2026), and the signup schedule switches (pilot P17).
 * Extracted from SmartWeeklySchedule; lives in lib because onboarding uses it too.
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
  return useCalendarFeed(userId).path;
}

/**
 * The same fetch with its outcome (AH31): `failed` once every attempt is over without a path, so
 * a screen can stop showing "loading" forever (no token, 4xx / 503, or the retries ran out).
 */
export function useCalendarFeed(userId: string | null | undefined): { path: string | null; failed: boolean } {
  const [path, setPath] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setPath(null);
    setFailed(false);
    if (!userId) return;
    let cancelled = false;
    const RETRY_DELAYS_MS = [1000, 3000]; // 3 attempts total
    (async () => {
      const fail = () => { if (!cancelled) setFailed(true); };
      try {
        await auth.authStateReady();
      } catch {
        return fail();
      }
      for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
        if (cancelled) return;
        try {
          const idToken = await auth.currentUser?.getIdToken();
          if (!idToken) return fail();
          const res = await fetch('/api/calendar/token', { method: 'POST', headers: { Authorization: `Bearer ${idToken}` } });
          if (res.ok) {
            const data = (await res.json()) as { path?: unknown };
            if (!cancelled && typeof data.path === 'string' && data.path.startsWith('/api/calendar/t/')) setPath(data.path);
            else fail();
            return;
          }
          // 4xx and 503 are final; only transient 500/502/504 is retried.
          if (![500, 502, 504].includes(res.status)) return fail();
        } catch {
          // network failure — retry
        }
        if (attempt < RETRY_DELAYS_MS.length) await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
      }
      fail();
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);
  return { path, failed };
}

export type CalendarPlatform = 'ios' | 'android' | 'web';

/**
 * Where the subscription opens: iOS takes webcal:// natively, Android has no webcal
 * handler (Google Calendar's subscribe URL instead), the web navigates to webcal://.
 */
export function calendarSubscriptionUrl(platform: CalendarPlatform, feedHost: string, feedPath: string): string {
  const webcalUrl = `webcal://${feedHost}${feedPath}`;
  return platform === 'android'
    ? `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalUrl)}`
    : webcalUrl;
}

/** Open the subscription in the platform's calendar (synchronous — keep it in the tap). */
export function openCalendarSubscription(feedPath: string): void {
  const w = window as unknown as { Capacitor?: { getPlatform?: () => string } };
  const raw = w.Capacitor?.getPlatform?.() ?? 'web';
  const platform: CalendarPlatform = raw === 'ios' || raw === 'android' ? raw : 'web';
  const feedHost = platform !== 'web' ? APP_CONFIG_LINKS.WEB_BASE_URL.replace('https://', '') : window.location.host;
  const url = calendarSubscriptionUrl(platform, feedHost, feedPath);
  if (platform === 'web') window.location.href = url;
  else window.open(url, '_system');
}

/**
 * A "sync to calendar" switch (pilot P17): turning it ON opens the subscription right in
 * the tap, so the switch does what it says instead of only saving a preference. Returns
 * whether it opened (false while the feed path is still loading, or when turning OFF).
 */
export function openCalendarOnSwitchOn(nextOn: boolean, feedPath: string | null, open: (path: string) => void = openCalendarSubscription): boolean {
  if (!nextOn || !feedPath) return false;
  open(feedPath);
  return true;
}
