/**
 * Loops prefer our routes (panel flag enable_loops_prefer_official, default OFF).
 * An explicit boolean (admin A/B page, measurement script) wins; otherwise the
 * device's last-known live flag. Flag off = the generator is byte-identical.
 */
import { readLiveFlag } from '@/lib/feature-flag-live';

export function resolveLoopsPreferOfficial(override: boolean | undefined): boolean {
  return typeof override === 'boolean' ? override : readLiveFlag('enableLoopsPreferOfficial');
}
