/**
 * Bunny.net Stream — Configuration & URL Builders.
 *
 * SAFE TO IMPORT FROM CLIENT (no secrets here).
 * The API key lives only on the server (`bunny.service.ts`).
 *
 * Env vars (see `.env.local`):
 *   BUNNY_API_KEY         — server-side admin API key (NEVER exposed to browser)
 *   BUNNY_LIBRARY_ID      — library/zone ID; readable by the client builders
 *   BUNNY_CDN_HOSTNAME    — pull-zone hostname, e.g. "out-run.b-cdn.net"
 *
 * For client-side URL building we mirror the public-safe values via
 * NEXT_PUBLIC_* counterparts. Secrets stay server-only.
 */

// Fallback hostname — safe to commit, it's a public CDN pull-zone address.
// The canonical source of truth is NEXT_PUBLIC_BUNNY_CDN_HOSTNAME (Vercel env).
// Without this fallback, a missing env var produces `https:///…` URLs on iOS
// because NEXT_PUBLIC_* vars are baked into the bundle at build time and
// BUNNY_CDN_HOSTNAME (server-only) is not available in the browser/WKWebView.
const BUNNY_CDN_HOSTNAME_FALLBACK = 'vz-b17872ab-7a7.b-cdn.net';
const BUNNY_LIBRARY_ID_FALLBACK   = '640043';

export const BUNNY_PUBLIC_CONFIG = {
  libraryId:
    process.env.NEXT_PUBLIC_BUNNY_LIBRARY_ID ??
    process.env.BUNNY_LIBRARY_ID ??
    BUNNY_LIBRARY_ID_FALLBACK,
  cdnHostname:
    process.env.NEXT_PUBLIC_BUNNY_CDN_HOSTNAME ??
    process.env.BUNNY_CDN_HOSTNAME ??
    BUNNY_CDN_HOSTNAME_FALLBACK,
} as const;

if (
  typeof window !== 'undefined' &&
  process.env.NODE_ENV === 'development' &&
  !process.env.NEXT_PUBLIC_BUNNY_CDN_HOSTNAME
) {
  console.warn(
    '[bunny] NEXT_PUBLIC_BUNNY_CDN_HOSTNAME is not set — falling back to hardcoded hostname.',
    'Set this variable in your Vercel project environment settings to silence this warning.',
  );
}

export const BUNNY_API_BASE_URL = 'https://video.bunnycdn.com';
export const BUNNY_TUS_ENDPOINT = 'https://video.bunnycdn.com/tusupload';

/** Direct iframe player (Bunny-hosted UI, full controls). */
export function buildBunnyEmbedUrl(videoId: string, libraryId?: string): string {
  const lib = libraryId || BUNNY_PUBLIC_CONFIG.libraryId;
  return `https://iframe.mediadelivery.net/embed/${lib}/${videoId}`;
}

/** Direct CDN MP4 — used for muted preview loops in the library list. */
export function buildBunnyStreamUrl(
  videoId: string,
  resolution: 240 | 360 | 480 | 720 | 1080 = 360,
  cdnHostname?: string,
): string {
  const host = cdnHostname || BUNNY_PUBLIC_CONFIG.cdnHostname;
  return `https://${host}/${videoId}/play_${resolution}p.mp4`;
}

/** Direct HLS playlist — used for adaptive playback in the tutorial player. */
export function buildBunnyHlsUrl(videoId: string, cdnHostname?: string): string {
  const host = cdnHostname || BUNNY_PUBLIC_CONFIG.cdnHostname;
  return `https://${host}/${videoId}/playlist.m3u8`;
}

/** Auto-generated thumbnail (Bunny renders one after encoding). */
export function buildBunnyThumbnailUrl(videoId: string, cdnHostname?: string): string {
  const host = cdnHostname || BUNNY_PUBLIC_CONFIG.cdnHostname;
  return `https://${host}/${videoId}/thumbnail.jpg`;
}

/**
 * Did the operator finish wiring real Bunny credentials?
 * UI can use this to disable upload buttons until env vars are set.
 */
export function isBunnyConfigured(): boolean {
  return Boolean(
    BUNNY_PUBLIC_CONFIG.libraryId && BUNNY_PUBLIC_CONFIG.cdnHostname,
  );
}
