/**
 * enable_loops_prefer_marked_trails — the app-side decision. Pure.
 *
 * "Outside a dense city" has no density notion in the codebase; the closest existing list is the 13
 * big cities that have a Technion shade layer (src/lib/shade/technion-layers). A start with no resolved
 * city, or in a city that is NOT on that list (regional councils, small towns, open country), may prefer
 * trails; the big cities keep today's recipe. Running / walking only.
 */
import { technionCityForName } from '@/lib/shade/loader';

export function shouldPreferTrails(activity: string, cityName: string | null | undefined): boolean {
  if (activity !== 'running' && activity !== 'walking') return false;
  return technionCityForName(cityName) == null;
}
