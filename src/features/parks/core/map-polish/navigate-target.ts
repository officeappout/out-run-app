/**
 * The ONE "navigate there" entry (enable_map_polish_v1). Pure.
 *
 * Every navigate button — park card, park page, route sheets, a live user's
 * card — builds a DestinationTarget here and hands it to the v2 destination
 * flow: useMapStore.pendingCommute → DiscoverLayer's consumer → the commute
 * RouteCarousel → the player in commute mode. Off /map the caller also routes
 * to /map (Discover consumes the request on mount).
 */

export interface DestinationTarget {
  /** [lng, lat] — the same order as the commute flow / route paths. */
  coords: [number, number];
  label?: string;
}

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

function target(lng: unknown, lat: unknown, label?: string | null): DestinationTarget | null {
  if (!finite(lng) || !finite(lat)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  const name = typeof label === 'string' && label.trim() ? label.trim() : undefined;
  return name ? { coords: [lng, lat], label: name } : { coords: [lng, lat] };
}

/** A route's trailhead (its first path point). */
export function routeStartTarget(route: { path?: unknown; name?: string | null } | null | undefined): DestinationTarget | null {
  const first = Array.isArray(route?.path) ? (route!.path as unknown[])[0] : null;
  if (!Array.isArray(first)) return null;
  return target(first[0], first[1], route?.name);
}

/** A park's own location. */
export function parkTarget(
  park: { location?: { lat?: number | null; lng?: number | null } | null; name?: string | null } | null | undefined,
): DestinationTarget | null {
  if (!park?.location) return null;
  return target(park.location.lng, park.location.lat, park.name);
}

export interface LiveUserLocation {
  uid: string;
  name?: string | null;
  /** Present only when the user is live on the map with a shared position. */
  liveLocation?: { lat: number; lng: number } | null;
}

/**
 * A live user's position — only when they are live on the map and sharing it
 * (the presence feed already applies their privacy mode; a pin on the map is
 * the proof), live users are visible to the viewer, and it isn't the viewer.
 */
export function liveUserTarget(
  user: LiveUserLocation | null | undefined,
  ctx: { selfUid?: string | null; liveUsersVisible: boolean },
): DestinationTarget | null {
  if (!user?.liveLocation || !ctx.liveUsersVisible) return null;
  if (ctx.selfUid && ctx.selfUid === user.uid) return null;
  return target(user.liveLocation.lng, user.liveLocation.lat, user.name);
}

export type NavigationRequest =
  /** Queue pendingCommute; route to /map first when `goToMap`. */
  | { kind: 'commute'; goToMap: boolean }
  /** On /map with Discover down (a live workout …) — the request would sit until later. */
  | { kind: 'unavailable' };

/**
 * Where a navigate tap goes. `hostMounted` = Discover (the pendingCommute
 * consumer) is mounted — useMapStore.routeOverviewHostMounted.
 */
export function navigationRequest(ctx: { pathname: string | null | undefined; hostMounted: boolean }): NavigationRequest {
  const onMap = ctx.pathname === '/map';
  if (onMap && !ctx.hostMounted) return { kind: 'unavailable' };
  return { kind: 'commute', goToMap: !onMap };
}
