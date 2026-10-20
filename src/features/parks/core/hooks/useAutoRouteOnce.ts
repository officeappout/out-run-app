'use client';

/**
 * Fire the free-run drawer's "עם מסלול" once, on its own (enable_home_v2 walking
 * track, owner 20.10.2026): a planned walk opens with a route that fits its goal
 * already generated — the drawer's own handleStartWithRoute (goal → player, then
 * the existing route generation by target km). Waits until the drawer is `ready`
 * (prefilled goal applied, user position known); `onHandled` tells the parent so a
 * remount (back from the routes to the drawer → "התחל חופשי") never fires again.
 */
import { useEffect, useRef } from 'react';

export function shouldFireAutoRoute(enabled: boolean, ready: boolean, fired: boolean): boolean {
  return enabled && ready && !fired;
}

export function useAutoRouteOnce(opts: {
  enabled: boolean;
  ready: boolean;
  fire: () => void | Promise<void>;
  onHandled?: () => void;
}): void {
  const firedRef = useRef(false);
  const { enabled, ready } = opts;
  const latest = useRef(opts);
  latest.current = opts;
  useEffect(() => {
    if (!shouldFireAutoRoute(enabled, ready, firedRef.current)) return;
    firedRef.current = true;
    latest.current.onHandled?.();
    void latest.current.fire();
  }, [enabled, ready]);
}
