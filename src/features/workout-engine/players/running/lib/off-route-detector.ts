/**
 * off-route-detector — mid-run "you left the route" state machine for a
 * guided route run (home v2, enable_home_v2; boards R3-prop-route-off).
 *
 * Pure: one step per accepted GPS fix, fed the cross-track distance from
 * geoUtils.crossTrackDistanceMeters (the same measurement the legacy
 * sample-count detector in useRunningPlayer uses) and the fix time.
 *
 * Time-based hysteresis instead of a sample count, so a slow GPS cadence
 * can't trip it early and a 1 Hz one doesn't need 40 noisy samples:
 *   • enter: farther than `enterM` continuously for at least `enterMs`
 *   • exit:  closer than `exitM` (a lower bar than enter — no flapping
 *            while the user runs along the edge of the band)
 *   • never before the user has JOINED the route (been within `enterM`
 *     once) — the walk TO the route is NavBannerV2's approach mode, not
 *     "off route".
 *
 * No alerts, no re-routing here — the UI decides what to show (the owner's
 * 24.09.2026 rule: never recompute the route on deviation; the user picks
 * "navigate back" or "continue free" themselves).
 */

export type OffRoutePhase = 'unjoined' | 'on' | 'pending' | 'off';

export interface OffRouteState {
  phase: OffRoutePhase;
  /** When the current >enterM stretch began (ms); set only in 'pending'. */
  pendingSinceMs: number | null;
  /** Last finite cross-track distance seen (m). */
  distanceM: number | null;
}

export interface OffRouteConfig {
  enterM: number;
  enterMs: number;
  exitM: number;
}

export const OFF_ROUTE_DEFAULTS: OffRouteConfig = { enterM: 40, enterMs: 10_000, exitM: 20 };

export const INITIAL_OFF_ROUTE_STATE: OffRouteState = {
  phase: 'unjoined',
  pendingSinceMs: null,
  distanceM: null,
};

export function stepOffRoute(
  state: OffRouteState,
  distanceM: number,
  nowMs: number,
  cfg: OffRouteConfig = OFF_ROUTE_DEFAULTS,
): OffRouteState {
  // No comparable route / bad fix → hold the current state (fail open).
  if (!Number.isFinite(distanceM) || distanceM < 0 || !Number.isFinite(nowMs)) return state;
  const d = distanceM;
  switch (state.phase) {
    case 'unjoined':
      return d <= cfg.enterM
        ? { phase: 'on', pendingSinceMs: null, distanceM: d }
        : { ...state, distanceM: d };
    case 'on':
      return d > cfg.enterM
        ? { phase: 'pending', pendingSinceMs: nowMs, distanceM: d }
        : { ...state, distanceM: d };
    case 'pending': {
      if (d <= cfg.enterM) return { phase: 'on', pendingSinceMs: null, distanceM: d };
      const since = state.pendingSinceMs ?? nowMs;
      return nowMs - since >= cfg.enterMs
        ? { phase: 'off', pendingSinceMs: null, distanceM: d }
        : { phase: 'pending', pendingSinceMs: since, distanceM: d };
    }
    case 'off':
      return d < cfg.exitM
        ? { phase: 'on', pendingSinceMs: null, distanceM: d }
        : { ...state, distanceM: d };
    default:
      return state;
  }
}

/**
 * A pause must not carry a half-finished "pending" stretch over: resuming
 * 3 minutes later shouldn't trip instantly. 'off' stays off (the user is
 * still wherever they paused).
 */
export function pauseOffRoute(state: OffRouteState): OffRouteState {
  return state.phase === 'pending' ? { ...state, phase: 'on', pendingSinceMs: null } : state;
}

export const isOffRoutePhase = (s: OffRouteState): boolean => s.phase === 'off';
