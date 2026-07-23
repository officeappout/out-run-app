/**
 * Canonical park cover-photo resolver.
 *
 * Park docs carry the image in up to three fields, written by two different,
 * uncoordinated pipelines:
 *   - `imageUrl`  → the NEW, real park photo (migrate-park-photos.ts → Bunny CDN)
 *   - `image`     → LEGACY single photo (park-import CSV → Firebase Storage;
 *                   sometimes back-filled with a generic *equipment* shot)
 *   - `images[0]` → LEGACY multi-image cover (same Firebase-Storage origin)
 *
 * The correct current photo lives in `imageUrl`. Any reader that consults
 * `image`/`images[0]` first renders the stale (often wrong) picture. This helper
 * is the single source of truth for that priority, so every surface agrees.
 *
 * The result is wrapped in `bunnyImg()` so Bunny Optimizer resize (`?width=W`)
 * fires when — and only when — the resolved URL is on Bunny (`b-cdn.net`); for a
 * legacy Firebase-Storage URL it is a silent passthrough (no resize available).
 *
 * Returns `''` when no image field is present — callers keep their own final
 * fallback (placeholder / emoji / brand icon).
 */
import { bunnyImg } from './bunny-image';

export interface ParkImageFields {
  imageUrl?: string | null;
  image?: string | null;
  images?: string[] | null;
}

export function resolveParkImage(
  park: ParkImageFields | null | undefined,
  width: number,
): string {
  if (!park) return '';
  const raw = park.imageUrl || park.image || park.images?.[0] || '';
  return bunnyImg(raw, width);
}
