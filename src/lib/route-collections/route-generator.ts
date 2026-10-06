/**
 * Classifies which of scripts/geo-discovery-routes.ts's five generators
 * produced a route, from fields every persisted official_routes doc already
 * carries — written ONCE here so the write-time field (Route.generator,
 * set in buildRouteDoc) and any later read (the shape-review chip, a
 * future query) agree by construction instead of re-deriving the same
 * five-way guess in two different places.
 *
 * The five generators: marked-trail OSM relations, standalone paths/loops/
 * bridge-connectors, road bike lanes, park-perimeter "הקפת X" loops, and
 * Mapbox round-trip loops. Before Route.generator existed (06.10.2026),
 * the only way to tell them apart from an already-written doc was exactly
 * this externalId-prefix + activityType + name-prefix heuristic — kept
 * here as the FALLBACK for every route written before that date, which has
 * no generator field at all. A route written after this fix carries its
 * own field and should read that directly; this function exists for the
 * routes that don't.
 */
export type RouteGenerator = 'trail-relation' | 'standalone-path' | 'bike-lane' | 'park-perimeter' | 'roundtrip' | 'unknown';

export const ROUTE_GENERATOR_LABELS: Record<RouteGenerator, string> = {
  'trail-relation': 'יחס-שביל (OSM)',
  'standalone-path': 'שביל/לולאה עצמאית',
  'bike-lane': 'שביל אופניים',
  'park-perimeter': 'הקפת פארק',
  roundtrip: 'Round-trip (Mapbox)',
  unknown: 'לא ידוע',
};

export function classifyRouteGenerator(route: {
  sourceExternalId?: string | null;
  activityType?: string | null;
  name?: string | null;
}): RouteGenerator {
  const externalId = route.sourceExternalId ?? '';
  if (externalId.startsWith('mapbox:roundtrip/')) return 'roundtrip';
  if (route.name?.startsWith('הקפת')) return 'park-perimeter';
  if (route.activityType === 'cycling') return 'bike-lane';
  if (externalId.startsWith('osm:rel/')) return 'trail-relation';
  if (externalId.startsWith('osm:way/') || externalId.startsWith('osm:stitched/')) return 'standalone-path';
  return 'unknown';
}
