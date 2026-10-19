'use client';

/**
 * OffRouteChoiceCard — "סטית מהמסלול" + the two choices (board
 * R3-prop-route-off): "נווט חזרה" (walking directions to the nearest point on
 * the route) and "המשך חופשי" (drop guidance, keep recording).
 *
 * Presentational — the caller owns the actions. `ConnectedOffRouteChoice`
 * (below) wires it to useRouteRunV2Store + the Directions service, for any
 * live layout to slot in: today NavBannerV2 renders it under its amber top
 * row; the continuous-run player sheet can mount it instead.
 */

import React, { useCallback } from 'react';
import { Navigation, Route as RouteIcon } from 'lucide-react';
import { useRouteRunV2Store, type NavBackStatus } from '../../../store/useRouteRunV2Store';
import { fetchNavBackPath } from '../../../services/route-nav-back.service';

export interface OffRouteChoiceCardProps {
  status: NavBackStatus;
  onNavigateBack: () => void;
  onContinueFree: () => void;
  className?: string;
}

export function OffRouteChoiceCard({ status, onNavigateBack, onContinueFree, className = '' }: OffRouteChoiceCardProps) {
  const loading = status === 'loading';
  return (
    <div dir="rtl" className={className}>
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-[#fef3c7] text-[#b45309]" aria-hidden>
          <RouteIcon size={22} strokeWidth={2.3} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[16px] font-black text-v2-ink">סטית מהמסלול</p>
          <p className="truncate text-[12.5px] font-bold text-v2-muted">
            {status === 'error' ? 'לא הצלחנו לחשב דרך חזרה, אפשר לנסות שוב' : 'נחזיר אותך לנקודה הקרובה, בלי להתחיל מחדש'}
          </p>
        </div>
      </div>
      <div className="mt-3.5 flex gap-2.5">
        <button
          type="button"
          onClick={onNavigateBack}
          disabled={loading}
          className="flex h-12 flex-[1.3] items-center justify-center gap-2 whitespace-nowrap rounded-full bg-v2-cta text-[16px] font-extrabold text-v2-on-cta shadow-v2-cta transition-transform duration-150 ease-v2 active:scale-[0.97] disabled:opacity-60"
        >
          <Navigation size={17} strokeWidth={2.6} aria-hidden />
          {loading ? 'מחשב דרך…' : 'נווט חזרה'}
        </button>
        <button
          type="button"
          onClick={onContinueFree}
          className="h-12 flex-1 whitespace-nowrap rounded-full bg-white px-4 text-[14px] font-extrabold text-v2-ink-2 shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.97]"
        >
          המשך חופשי
        </button>
      </div>
    </div>
  );
}

/** Store-connected choice; collapses to just "המשך חופשי" once the navigate-back line is on the map. */
export function ConnectedOffRouteChoice({
  currentLocation,
  className,
}: {
  currentLocation: { lat: number; lng: number } | null | undefined;
  className?: string;
}) {
  const offRoute = useRouteRunV2Store((s) => s.offRoute);
  const status = useRouteRunV2Store((s) => s.navBackStatus);

  const onNavigateBack = useCallback(async () => {
    const store = useRouteRunV2Store.getState();
    const target = store.rejoinPoint;
    if (!target || !currentLocation) return;
    store.setNavBack('loading');
    const path = await fetchNavBackPath(currentLocation, target);
    // Back on the route (or guidance dropped) while the request was in flight → drop it.
    const now = useRouteRunV2Store.getState();
    if (!now.offRoute) return;
    now.setNavBack(path ? 'ready' : 'error', path);
  }, [currentLocation]);

  const onContinueFree = useCallback(() => useRouteRunV2Store.getState().dropGuidance(), []);

  if (!offRoute) return null;
  if (status === 'ready') {
    // Line is on the map — keep only the way out.
    return (
      <div dir="rtl" className={`flex items-center justify-between gap-3 ${className ?? ''}`}>
        <p className="min-w-0 truncate text-[12.5px] font-bold text-v2-muted">רוצים לוותר על המסלול?</p>
        <button
          type="button"
          onClick={onContinueFree}
          className="h-9 shrink-0 whitespace-nowrap rounded-full bg-white px-4 text-[13px] font-extrabold text-v2-ink-2 shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.97]"
        >
          המשך חופשי
        </button>
      </div>
    );
  }
  return (
    <OffRouteChoiceCard
      status={status}
      onNavigateBack={onNavigateBack}
      onContinueFree={onContinueFree}
      className={className}
    />
  );
}
