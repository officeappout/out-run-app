/**
 * ViaRouter (src/lib/park-loops) on the existing GraphHopper client:
 * buildViaRequest (pass_through) + preferParks = the park polygon.
 * `ghViaRouterFromEnv` returns null when GRAPHHOPPER_URL / the invoker key is
 * not configured, so an offline run reports inner loops as blocked instead of
 * inventing them; the nationwide runner passes its own budgeted client.
 */
import type { ViaRouter } from '../../../src/lib/park-loops';
import { buildViaRequest, DEFAULT_TAGS, getServerGraphHopperClient, type GhProfile, type GraphHopperClient } from '../../../src/lib/routing/graphhopper';

export function ghViaRouter(client: GraphHopperClient): ViaRouter {
  return {
    async route(points, opts) {
      const body = buildViaRequest(points.map(([lng, lat]) => ({ lng, lat })), opts.profile as GhProfile, {
        ...DEFAULT_TAGS,
        preferParks: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [opts.preferPolygon] } }],
      });
      const res = await client.route(body);
      return res ? { coords: res.path } : null;
    },
  };
}

export function ghViaRouterFromEnv(): ViaRouter | null {
  const client = getServerGraphHopperClient();
  return client ? ghViaRouter(client) : null;
}
