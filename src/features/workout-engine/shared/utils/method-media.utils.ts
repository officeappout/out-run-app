/**
 * method-media.util — media presence for one execution method (enable_location_gate_v1). PURE.
 *
 * Owner rule (23.10): a method with a video OR an image has media. A missing image next to a video is
 * NOT empty — a poster is derived from the video (resolveMethodPoster) instead of a placeholder.
 */
import {
  resolvePreviewForLang,
  resolveTutorialForLang,
  type ExecutionMethod,
} from '@/features/content/exercises/core/exercise.types';
import { buildBunnyThumbnailUrl } from '@/lib/bunny/bunny.config';
import { IMAGE_URL_VIDEO_PATTERNS, methodBunnyId } from './media-resolution.utils';

type Loose = Record<string, any> | null | undefined;

const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';

export function methodHasVideoMedia(m: ExecutionMethod | null | undefined): boolean {
  const media = (m as Loose)?.media as Loose;
  if (!media) return false;
  return !!(
    nonEmpty(media.mainVideoUrl) ||
    nonEmpty(media.videoUrl) ||
    nonEmpty(media.bunnyVideoId_mainVideoUrl) ||
    resolvePreviewForLang(media as any, 'he')?.videoId ||
    resolveTutorialForLang(media as any, 'he')?.videoId
  );
}

export function methodHasImageMedia(m: ExecutionMethod | null | undefined): boolean {
  return nonEmpty(((m as Loose)?.media as Loose)?.imageUrl);
}

/** Video OR image — the gate's definition of "has media". */
export function methodHasAnyMedia(m: ExecutionMethod | null | undefined): boolean {
  return methodHasVideoMedia(m) || methodHasImageMedia(m);
}

/**
 * The still to show for ONE method, from that method alone (never another method's image):
 * its own clean image, else the poster frame of its own Bunny video. Undefined when neither exists
 * (e.g. a raw non-Bunny video file — no still can be produced without a <video> element).
 */
export function resolveMethodPoster(m: Loose): string | undefined {
  const media = (m?.media ?? null) as Loose;
  if (!media) return undefined;
  const own = media.imageUrl;
  if (nonEmpty(own) && !IMAGE_URL_VIDEO_PATTERNS.test(own)) return own;
  const explicit = resolvePreviewForLang(media as any)?.thumbnailUrl;
  if (nonEmpty(explicit)) return explicit;
  const id = methodBunnyId(media);
  return id ? buildBunnyThumbnailUrl(id) : undefined;
}
