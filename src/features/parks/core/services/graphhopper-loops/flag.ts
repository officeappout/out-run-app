/**
 * GraphHopper routes (panel flag enable_graphhopper_routes, default OFF).
 * An explicit boolean (admin A/B page, tests) wins; otherwise the device's
 * last-known live flag.
 */
import { readLiveFlag } from '@/lib/feature-flag-live';

export function resolveGraphhopperRoutes(override: boolean | undefined): boolean {
  return typeof override === 'boolean' ? override : readLiveFlag('enableGraphhopperRoutes');
}
