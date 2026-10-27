/**
 * S3 (pilot wave 2) — the photo a swap option shows, filmed at the workout's location.
 *
 * resolveExerciseMedia's cross-method fallback is park-first, so a home workout whose home
 * method has no stored photo showed the PARK photo. Here every method tagged for the location
 * (the chosen one first) is tried before that: its stored photo, then its Bunny video's frame.
 * Only when no method at this location has either does it fall back to any media. PURE.
 */
import {
  IMAGE_URL_VIDEO_PATTERNS,
  methodBunnyId,
  resolveExerciseMedia,
} from '@/features/workout-engine/shared/utils/media-resolution.utils';
import { buildBunnyThumbnailUrl } from '@/lib/bunny/bunny.config';

interface MethodLike {
  location?: string | null;
  locationMapping?: readonly string[] | null;
  media?: Record<string, unknown> | null;
}

const methodsOf = (ex: Record<string, unknown>): MethodLike[] =>
  ((ex.execution_methods ?? ex.executionMethods ?? []) as MethodLike[]).filter(Boolean);

export function methodAtLocation(m: MethodLike | null | undefined, location: string | null | undefined): boolean {
  if (!m || !location) return false;
  return m.location === location || (m.locationMapping?.includes(location) ?? false);
}

function storedPhoto(m: MethodLike): string | undefined {
  const url = m.media?.imageUrl;
  return typeof url === 'string' && url.trim() && !IMAGE_URL_VIDEO_PATTERNS.test(url) ? url : undefined;
}

function videoFrame(m: MethodLike): string | undefined {
  const id = methodBunnyId(m.media as Record<string, unknown> | undefined);
  return id ? buildBunnyThumbnailUrl(id) : undefined;
}

export function resolveSwapOptionImage(
  exercise: Record<string, unknown>,
  method: MethodLike | null | undefined,
  location: string | null | undefined,
): string | undefined {
  const atLocation = [method, ...methodsOf(exercise)].filter(
    (m, i, all): m is MethodLike => methodAtLocation(m, location) && all.indexOf(m) === i,
  );
  for (const pick of [storedPhoto, videoFrame]) {
    for (const m of atLocation) {
      const url = pick(m);
      if (url) return url;
    }
  }
  return resolveExerciseMedia(exercise, method as Record<string, unknown> | null).imageUrl;
}
