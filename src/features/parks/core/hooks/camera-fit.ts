/**
 * PURE camera-fit helpers for useCameraController (G1.2 — route map load time + initial zoom).
 * No React, no Mapbox — plain functions so they can be unit-tested in node.
 */

export type LngLatPair = [number, number];
export type Bounds = [number, number, number, number]; // [minLng, minLat, maxLng, maxLat]

/** Trailing debounce for the focused-route preview fit (absorbs fast carousel swipes). */
export const PREVIEW_FIT_DEBOUNCE_MS = 600;

/**
 * Delay before the focused-route preview fit runs.
 *
 * Before G1.2 every fit waited the full 600 ms, even the FIRST one after the route appeared —
 * so opening a route (curated discover, or a hybrid suggestion once its compose landed) showed
 * the line on a camera that only started moving 600 ms later. Now the debounce is leading-edge:
 * at rest (no fit pending, last focus change > 600 ms ago) the fit runs at once; a burst of
 * focus changes (fast swipes) still collapses into one trailing fit.
 */
export function previewFitDelayMs(hasPendingFit: boolean, msSinceLastSchedule: number): number {
  if (hasPendingFit) return PREVIEW_FIT_DEBOUNCE_MS;
  return msSinceLastSchedule > PREVIEW_FIT_DEBOUNCE_MS ? 0 : PREVIEW_FIT_DEBOUNCE_MS;
}

function isFinitePair(c: unknown): c is LngLatPair {
  return Array.isArray(c) && c.length === 2 && Number.isFinite(c[0]) && Number.isFinite(c[1]);
}

/** Line coordinates of every LineString feature in a FeatureCollection (others ignored). */
function lineCoords(fc: GeoJSON.FeatureCollection | null | undefined): unknown[] {
  if (!fc || !Array.isArray(fc.features)) return [];
  const out: unknown[] = [];
  for (const f of fc.features) {
    const g = f?.geometry;
    if (g && g.type === 'LineString' && Array.isArray(g.coordinates)) out.push(...g.coordinates);
  }
  return out;
}

/**
 * Bounds of everything the hybrid overview DRAWS: the route itself plus the round-trip walk
 * legs (user → route entry, route end → user — dashed lines published by HybridOverviewScreen).
 * Before G1.2 the fit used the route path only, so whenever the route started away from the
 * user the walk legs and the user's own position were cut off the frame. Null when < 2 valid
 * route points (caller skips the fit, exactly as before).
 */
export function overviewFitBounds(
  routePath: readonly unknown[] | null | undefined,
  walkLegs: GeoJSON.FeatureCollection | null | undefined,
): Bounds | null {
  const route = (routePath ?? []).filter(isFinitePair);
  if (route.length < 2) return null;
  const all = [...route, ...lineCoords(walkLegs).filter(isFinitePair)];
  return all.reduce<Bounds>(
    (b, [lng, lat]) => [Math.min(b[0], lng), Math.min(b[1], lat), Math.max(b[2], lng), Math.max(b[3], lat)],
    [all[0][0], all[0][1], all[0][0], all[0][1]],
  );
}

/**
 * Breathing room (px) between the fitted route and the overview drawer's top edge. Before G1.2
 * the bottom padding was exactly the drawer height, so the southern-most part of the route (and
 * the start marker/arrow) sat flush against — and partly under — the drawer's rounded edge.
 */
export const OVERVIEW_DRAWER_MARGIN_PX = 48;

export function overviewFitPadding(
  sheetHeightPx: number,
  topPad: number,
  sidePad: number,
): { top: number; bottom: number; left: number; right: number } {
  return { top: topPad, bottom: sheetHeightPx + OVERVIEW_DRAWER_MARGIN_PX, left: sidePad, right: sidePad };
}
