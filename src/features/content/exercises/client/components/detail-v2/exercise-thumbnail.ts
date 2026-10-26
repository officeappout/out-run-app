/**
 * An exercise's best thumbnail (pure) — the progression strip's resolver,
 * moved verbatim out of MasterExerciseView so the equipment drawer's levels
 * strip resolves exercise pictures the same way.
 */

import {
  type Exercise,
  type ExecutionMethod,
  findMethodForLocation,
  resolvePreviewForLang,
  resolveTutorialForLang,
} from '../../../core/exercise.types';
import { buildBunnyThumbnailUrl } from '@/lib/bunny/bunny.config';
import { DETAIL_IMAGE_PLACEHOLDER } from './detail-v2-tokens';

/**
 * Extract a Bunny CDN video UUID from any CDN URL.
 * Matches paths like: /{uuid}/play_360p.mp4, /{uuid}/playlist.m3u8, /{uuid}/thumbnail.jpg
 */
function extractBunnyVideoId(url: string): string | null {
  const m = url.match(
    /\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\//i,
  );
  return m ? m[1] : null;
}

/**
 * Resolve the best thumbnail for a chain node (prev / current / next).
 *
 * Resolution waterfall for a single method:
 *   a) method.media.imageUrl                                   (explicit stored image)
 *   b) buildBunnyThumbnailUrl(uuid from mainVideoUrl)          (video-derived poster)
 *   c) buildBunnyThumbnailUrl(previewVideo.he.videoId)         (preview Bunny ID)
 *   d) buildBunnyThumbnailUrl(tutorialVideo.he.videoId)        (tutorial Bunny ID)
 *
 * Method priority:
 *   1. Method matching `preferredLocation` — exact context match
 *   2. First method with ANY resolvable thumbnail — graceful sibling fallback
 *   3. Root-level exercise.media.imageUrl                      (legacy cover, last resort)
 *   4. DETAIL_IMAGE_PLACEHOLDER
 */
export function resolveExerciseThumbnail(ex: Exercise, preferredLocation: string | null): string {
  const methods = (ex.execution_methods ?? ex.executionMethods ?? []) as ExecutionMethod[];

  /** Best thumbnail from a single method, trying all video-ID paths. */
  function methodThumb(m: ExecutionMethod): string | null {
    const media = m?.media as Record<string, any> | undefined;
    if (!media) return null;

    // a) Explicit stored imageUrl.
    if (media.imageUrl) return media.imageUrl as string;

    // b) Derive thumbnail from mainVideoUrl Bunny CDN path.
    const mainUrl: string | undefined = media.mainVideoUrl;
    if (mainUrl) {
      const vid = extractBunnyVideoId(mainUrl);
      if (vid) return buildBunnyThumbnailUrl(vid);
    }

    // c) Bunny preview videoId (e.g. previewVideo.he.videoId).
    const preview = resolvePreviewForLang(media as any, 'he');
    if (preview?.videoId) return buildBunnyThumbnailUrl(preview.videoId);

    // d) Bunny tutorial videoId.
    const tutorial = resolveTutorialForLang(media as any, 'he');
    if (tutorial?.videoId) return buildBunnyThumbnailUrl(tutorial.videoId);

    return null;
  }

  // 1. Location-matched method.
  if (preferredLocation) {
    const matched = findMethodForLocation(ex, preferredLocation);
    if (matched) {
      const thumb = methodThumb(matched);
      if (thumb) return thumb;
    }
  }

  // 2. First method with any resolvable thumbnail (sibling exercise fallback).
  for (const m of methods) {
    const thumb = methodThumb(m);
    if (thumb) return thumb;
  }

  // 3. Root-level cover image (last resort).
  const rootImage =
    (ex as any).media?.imageUrl as string | undefined ??
    (ex as any).imageUrl as string | undefined;
  if (rootImage) return rootImage;

  return DETAIL_IMAGE_PLACEHOLDER;
}
