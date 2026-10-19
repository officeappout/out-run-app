/**
 * The source set for a loop request: the map's cached official routes, plus —
 * when the request has a city — that city's published corridors through the
 * caller-supplied reader (route-generator.service's fetchPublishedCorridorsForCity).
 */
import { mapOfficialRoutesFetcher, toOurRouteLines, type OurRoutesFetcher } from './our-routes-source';

type CityCorridorReader = (cityName: string) => Promise<Array<{ id: string; name?: string; path: [number, number][] }>>;

export function ourRoutesSources(cityName: string | undefined, cityCorridors?: CityCorridorReader): Record<string, OurRoutesFetcher> {
  const sources: Record<string, OurRoutesFetcher> = { 'official:map': mapOfficialRoutesFetcher };
  const city = cityName?.trim();
  if (city && cityCorridors) {
    sources[`official:city:${city}`] = async () => toOurRouteLines(await cityCorridors(city), 'official');
  }
  return sources;
}
