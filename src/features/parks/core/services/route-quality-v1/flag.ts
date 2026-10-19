/**
 * Route quality v1 (panel flag enable_route_quality_v1, default OFF).
 * An explicit boolean (admin A/B page, measurement script) wins; otherwise
 * the device's last-known live flag. Flag off = the generator is
 * byte-identical to before this module existed.
 */
import { readLiveFlag } from '@/lib/feature-flag-live';

export function resolveRouteQualityV1(override: boolean | undefined): boolean {
  return typeof override === 'boolean' ? override : readLiveFlag('enableRouteQualityV1');
}
