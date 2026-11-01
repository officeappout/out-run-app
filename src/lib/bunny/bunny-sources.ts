/**
 * The order BunnyVideoPlayer tries a Bunny Stream video's sources in (pilot AJ8), PURE.
 *
 * The pull zone refuses requests without a Referer (403). On iOS the <video> plays HLS
 * natively through AVFoundation, which fetches the variant playlists and segments itself,
 * so a machine's demo video (always HLS) stayed a black box, while exercise videos, which
 * are progressive MP4 on the same pull zone, play. So where HLS is native (iOS / Safari)
 * the MP4 renditions go first and HLS is the last try; elsewhere hls.js (its own requests,
 * with a Referer) plays HLS and the MP4s are the fallback. When every source fails, the
 * player shows the poster photo (or a plain placeholder), never a black box.
 */
import { buildBunnyHlsUrl, buildBunnyStreamUrl } from './bunny.config';

/** The direct-src chain for a <video> element (hls.js, when used, comes before it). */
export function bunnySourceChain(videoId: string, nativeHls: boolean): string[] {
  const mp4 = [buildBunnyStreamUrl(videoId, 720), buildBunnyStreamUrl(videoId, 360)];
  return nativeHls ? [...mp4, buildBunnyHlsUrl(videoId)] : mp4;
}

/** The next source to try after `current` failed, or null when the chain is used up. */
export function nextBunnySource(chain: readonly string[], current: string | null | undefined): string | null {
  if (!current) return chain[0] ?? null;
  const i = chain.indexOf(current);
  return i >= 0 && i + 1 < chain.length ? chain[i + 1] : null;
}
