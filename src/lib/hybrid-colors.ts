/**
 * hybrid-colors — SINGLE SOURCE OF TRUTH for hybrid MODALITY colors (point 15).
 * Also the source for the standalone (non-hybrid) route line's modality color
 * (15.08.2026, route-styling batch) — AppMap.tsx's routes-active/-glow paints
 * use these same two constants, keyed off the focused route's activityType,
 * so a standalone strength route and a hybrid route's strength band render
 * identically.
 *
 * Lives in src/lib (not src/features/parks) because it's consumed across
 * domains — the map (parks) AND the planner card (home, 22.08.2026,
 * workout-completion-badge-audit decision 4) — per the domain-agnostic rule
 * (CLAUDE.md law 7: cross-domain imports go through src/lib, not directly
 * between features/*).
 *
 * Imported by the journey axis, the overview drawer, the map route (gradient
 * + standalone line), and the planner's hybrid schedule card. Do NOT redefine
 * #10B981 / #06B6D4 anywhere else — if these need to change, they change
 * here once and every surface follows.
 */

export const HYBRID_AER = '#10B981'; // walking / aerobic — green
// 15.08.2026: #00C9F2 → #06B6D4 (deeper cyan) — the lighter cyan washed out
// against the light Mapbox basemap; the deeper value keeps enough contrast
// for both the line itself and the white casing around it to read clearly.
export const HYBRID_STR = '#06B6D4'; // strength — deep cyan

/** Fraction of the route (each side of a station) that blends to the strength
 *  color. Big enough to read the station, small enough not to swallow the route. */
export const ROUTE_STATION_BAND = 0.06;

/**
 * Mapbox `line-gradient` expression for a hybrid route: a green (walking) base with
 * a blue band centered on each strength-station fraction (0..1 along the line) —
 * smooth green → blue → green, the map analog of the axis spine. Requires the
 * source to have `lineMetrics: true`.
 */
export function buildHybridRouteGradient(
  stationFracs: number[],
  band: number = ROUTE_STATION_BAND,
): unknown[] {
  const pts: Array<[number, string]> = [[0, HYBRID_AER]];
  for (const f of [...stationFracs].sort((a, b) => a - b)) {
    pts.push([f - band, HYBRID_AER]);
    pts.push([f, HYBRID_STR]);
    pts.push([f + band, HYBRID_AER]);
  }
  pts.push([1, HYBRID_AER]);

  // Mapbox requires strictly-ascending stops in [0,1]; clamp + drop collisions.
  const clean: Array<[number, string]> = [];
  for (const [p, c] of pts) {
    const cp = Math.min(1, Math.max(0, p));
    if (clean.length === 0 || cp > clean[clean.length - 1][0]) clean.push([cp, c]);
  }

  const expr: unknown[] = ['interpolate', ['linear'], ['line-progress']];
  for (const [p, c] of clean) expr.push(p, c);
  return expr;
}

/** Soft transition band (± percentage points) centered on the split, so the
 *  card doesn't read as a hard two-block edge. */
const CARD_GRADIENT_BAND_PCT = 8;

/**
 * CSS `linear-gradient` for a hybrid schedule card: the planner-card analog
 * of `buildHybridRouteGradient` — same two colors, same "single source of
 * truth" intent, but a plain two-stop split (not per-station bands) since a
 * card has no line-progress to place bands along, only an overall session
 * ratio (`UserScheduleEntry.aerobicShare`, written at hybrid-completion time
 * — see schedule.types.ts). Aerobic share is the GREEN portion's size, so a
 * 0.7 (aerobic-emphasis) session reads as "mostly green, a cyan wedge."
 */
export function buildHybridCardGradient(aerobicShare: number, angleDeg = 135): string {
  const share = Math.min(1, Math.max(0, aerobicShare));
  const splitPct = Math.round(share * 100);
  const lo = Math.max(0, splitPct - CARD_GRADIENT_BAND_PCT);
  const hi = Math.min(100, splitPct + CARD_GRADIENT_BAND_PCT);
  return `linear-gradient(${angleDeg}deg, ${HYBRID_AER} 0%, ${HYBRID_AER} ${lo}%, ${HYBRID_STR} ${hi}%, ${HYBRID_STR} 100%)`;
}
