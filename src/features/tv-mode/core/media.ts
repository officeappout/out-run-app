import type { TvMedia } from './types';

/** A URL the TV may load: public https only, bounded (it travels inside the session doc). */
export const TV_MEDIA_URL_MAX = 600;

export function tvSafeUrl(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const url = raw.trim();
  if (!url || url.length > TV_MEDIA_URL_MAX || !/^https:\/\//i.test(url)) return undefined; // no blob:, data:, http:, relative
  try {
    return new URL(url).protocol === 'https:' ? url : undefined;
  } catch {
    return undefined;
  }
}

export function sameMedia(a: TvMedia | undefined, b: TvMedia | undefined): boolean {
  return a?.videoUrl === b?.videoUrl && a?.imageUrl === b?.imageUrl;
}

/**
 * What the host embeds for one exercise. A Bunny clip becomes its public CDN mp4 (`bunnyMp4`); a legacy
 * stored URL is used as is when it is https. Nothing resolvable → undefined (the TV shows a calm backdrop).
 */
export function buildTvMedia(src: { videoUrl?: string | null; bunnyVideoId?: string | null; imageUrl?: string | null }, bunnyMp4: (id: string) => string): TvMedia | undefined {
  const videoUrl = tvSafeUrl(src.bunnyVideoId ? bunnyMp4(src.bunnyVideoId) : src.videoUrl);
  const imageUrl = tvSafeUrl(src.imageUrl);
  if (!videoUrl && !imageUrl) return undefined;
  return { ...(videoUrl ? { videoUrl } : {}), ...(imageUrl ? { imageUrl } : {}) };
}
