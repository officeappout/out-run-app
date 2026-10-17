/**
 * nav-banner — pure display math for the home-v2 combined navigation banner
 * (next turn + route progress in one glass card; TurnCarousel → NavBannerV2,
 * behind enable_home_v2).
 *
 * Progress comes from route-progress.ts's advanceRouteProgress (metres ALONG
 * the route — monotonic, windowed, ignores fixes far from the line), not from
 * the session's total distance: the walk TO the route must not count as route
 * progress. `alongM === null` means no fix has matched the route yet — the
 * user is still walking to it (approach mode).
 */

export interface NavBannerProgress {
  /** False until the first GPS fix lands on the route line. */
  joined: boolean;
  /** 0–100, rounded to an integer. 0 while not joined. */
  pct: number;
  /** Metres of route still ahead (the full route while not joined). */
  remainingM: number;
}

export function navBannerProgress(alongM: number | null, totalM: number): NavBannerProgress {
  const total = Number.isFinite(totalM) && totalM > 0 ? totalM : 0;
  if (alongM == null || !Number.isFinite(alongM) || total === 0) {
    return { joined: alongM != null && Number.isFinite(alongM), pct: 0, remainingM: total };
  }
  const along = Math.max(0, Math.min(total, alongM));
  return {
    joined: true,
    pct: Math.round((along / total) * 100),
    remainingM: Math.max(0, total - along),
  };
}

/** Hebrew short distance: "80 מ׳", "120 מ׳" (10 m steps), "1.4 ק״מ". */
export function formatBannerDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return '—';
  if (meters < 100) return `${Math.round(meters)} מ׳`;
  if (meters < 1000) return `${Math.round(meters / 10) * 10} מ׳`;
  return `${(meters / 1000).toFixed(1)} ק״מ`;
}

/**
 * Approach mode: show "walk to the route" instead of the route's own next
 * turn while the user is still clearly off the line and hasn't joined it yet.
 * Same 40 m as route-progress's maxCrossTrackM default.
 */
export const APPROACH_OFF_ROUTE_M = 40;

export function isApproaching(joined: boolean, crossTrackM: number): boolean {
  return !joined && Number.isFinite(crossTrackM) && crossTrackM > APPROACH_OFF_ROUTE_M;
}
