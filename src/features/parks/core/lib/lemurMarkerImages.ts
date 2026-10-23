/**
 * Map-marker-sized lemur images + an in-memory preload cache.
 *
 * Why this exists (map-tab lemur delay, 23.10.2026): the user's own map marker
 * rendered the full-size persona artwork (king-lemur.png 2.7 MB / lemur-avatar.png
 * 1.3 MB, both 1587x2245) at 52 px. The <img> was only created when the zoom
 * crossed 10 (below that the marker is a CSS pulse dot), so on map entry the dot
 * showed instantly while the lemur waited for a multi-MB download plus a ~3.5 MP
 * decode. The marker variants below are the same artwork, centre-square cropped
 * (exactly what `object-cover` showed in the round marker) at 156 px (3x of the
 * 52 px marker), ~20-35 KB each. Filenames are versioned (-v1) so they can be
 * served `immutable` (see next.config.mjs headers) — change the art ⇒ bump to -v2.
 */
import { PERSONA_IMAGES, DEFAULT_LEMUR_IMAGE } from '@/features/parks/core/hooks/useGroupPresence';

export const LEMUR_MARKER_IMAGES: Record<string, string> = {
  '/assets/lemur/king-lemur.png': '/assets/lemur/marker/king-lemur-156-v1.png',
  '/assets/lemur/lemur-avatar.png': '/assets/lemur/marker/lemur-avatar-156-v1.png',
};

/** Marker-sized image for a persona; same character choice as `resolvePersonaImage`. */
export function resolvePersonaMarkerImage(personaId?: string | null): string {
  const full = (personaId && PERSONA_IMAGES[personaId]) || DEFAULT_LEMUR_IMAGE;
  return LEMUR_MARKER_IMAGES[full] ?? full;
}

// Module-level (memory) cache: one HTMLImageElement per URL for the app session.
// Holding the element keeps the decoded bitmap warm and guarantees we never kick
// off a second request for the same URL from here, however often the map mounts.
const cache = new Map<string, HTMLImageElement>();

/** Fetch + decode the marker images ahead of time. Idempotent, SSR-safe. */
export function preloadLemurMarkerImages(): void {
  if (typeof window === 'undefined' || typeof Image === 'undefined') return;
  for (const src of new Set(Object.values(LEMUR_MARKER_IMAGES))) {
    if (cache.has(src)) continue;
    const img = new Image();
    img.decoding = 'async';
    img.src = src;
    cache.set(src, img);
    // decode() warms the bitmap so the first paint of the marker is instant.
    img.decode?.().catch(() => { /* non-fatal: the <img> will still load it */ });
  }
}

/** True when the preloaded image for `src` has finished loading (decoded or cached). */
export function isLemurMarkerImageReady(src: string): boolean {
  const img = cache.get(src);
  return !!img && img.complete && img.naturalWidth > 0;
}

/** Test-only: reset the memory cache. */
export function __resetLemurMarkerCacheForTests(): void {
  cache.clear();
}

export function __lemurMarkerCacheSizeForTests(): number {
  return cache.size;
}
