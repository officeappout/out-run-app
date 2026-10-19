/** Recorded GraphHopper responses (tlv-dizengoff, 19.10.2026 experiment) + a fake client. */
import fixture from './fixtures/gh-tlv-dizengoff.json';
import { mapGhPath, type GhRouteRequest, type GhRouteResponse, type GraphHopperClient, type RoutedPath } from '../graphhopper';

export const GH = fixture as unknown as {
  start: { lat: number; lng: number };
  passing5km: GhRouteResponse;
  passing5kmB: GhRouteResponse;
  spurry5km: GhRouteResponse;
  sliver3km: GhRouteResponse;
  error400: GhRouteResponse;
};

export const routed = (r: GhRouteResponse): RoutedPath => mapGhPath(r.paths![0]);

/** A client that answers from a function of the request; records every body. */
export function fakeClient(answer: (body: GhRouteRequest, n: number) => GhRouteResponse | Error | null): GraphHopperClient & { bodies: GhRouteRequest[] } {
  const bodies: GhRouteRequest[] = [];
  return {
    bodies,
    async route(body) {
      bodies.push(body);
      const a = answer(body, bodies.length);
      if (a instanceof Error) throw a;
      return a?.paths?.length ? mapGhPath(a.paths[0]) : null;
    },
  };
}
