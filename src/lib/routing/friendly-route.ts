/**
 * A→B "friendly" route on GraphHopper: quiet streets + safe crossings (the
 * same tags as loops). Server-only; returns null when there is no route.
 */
import { DEFAULT_TAGS, buildViaRequest, profileForActivity, readFootProfile, type GraphHopperClient, type OutActivity, type RoutedPath, type RouteTags } from './graphhopper';
import type { LatLng } from './loops/geo';

export interface FriendlyRouteRequest {
  from: LatLng;
  to: LatLng;
  activity: OutActivity;
  tags?: RouteTags;
}

export function friendlyRoute(client: GraphHopperClient, req: FriendlyRouteRequest, signal?: AbortSignal): Promise<RoutedPath | null> {
  const profile = profileForActivity(req.activity, { foot: readFootProfile() });
  return client.route(buildViaRequest([req.from, req.to], profile, req.tags ?? DEFAULT_TAGS), signal);
}
