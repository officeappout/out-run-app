/**
 * The source set for a loop request: the map's cached official routes, plus —
 * when the request has a city — that city's published corridors through the
 * caller-supplied reader (route-generator.service's fetchPublishedCorridorsForCity).
 */
import type { ActivityType } from '../../types/route.types';
import { mapOfficialRoutesFetcher, mapOfficialRoutesFetcherFor, toOurRouteLines, type OurRoutesFetcher } from './our-routes-source';

type CityCorridorReader = (cityName: string) => Promise<Array<{ id: string; name?: string; path: [number, number][]; activityType?: ActivityType; activityTypes?: ActivityType[] }>>;

export function ourRoutesSources(
  cityName: string | undefined,
  cityCorridors?: CityCorridorReader,
  /** cycling-fixes-v1: set only while enable_cycling_fixes_v1 is on — keeps our routes to this activity. */
  activity?: ActivityType,
): Record<string, OurRoutesFetcher> {
  // Activity-filtered sources get their own cache keys so filtered / unfiltered reads never mix.
  const suffix = activity ? `:${activity}` : '';
  const sources: Record<string, OurRoutesFetcher> = {
    [`official:map${suffix}`]: activity ? mapOfficialRoutesFetcherFor(activity) : mapOfficialRoutesFetcher,
  };
  const city = cityName?.trim();
  if (city && cityCorridors) {
    sources[`official:city:${city}${suffix}`] = async () => toOurRouteLines(await cityCorridors(city), 'official', activity);
  }
  return sources;
}
