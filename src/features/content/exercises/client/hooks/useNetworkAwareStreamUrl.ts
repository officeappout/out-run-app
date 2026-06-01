'use client';

/**
 * useNetworkAwareStreamUrl — Cache-first, network-aware Bunny stream resolver.
 *
 * Decision flow (runs once per videoId, never re-renders during playback):
 *
 *   1. IndexedDB cache lookup at the 720p URL (the offline-download cache key).
 *      Hit  → return a `blob:` URL, mark `fromCache: true`.
 *   2. Miss → call `@capacitor/network` `Network.getStatus()` for connectionType.
 *      Fall back to `navigator.connection.effectiveType` for cellular sub-type.
 *   3. Pick a resolution and return the Bunny CDN MP4 URL.
 *
 * Resolution policy:
 *   wifi                                  → 1080p
 *   cellular + effectiveType === '4g'     → 720p
 *   cellular + 3g / 2g / slow-2g          → 360p
 *   cellular (sub-type unknown)           → 720p
 *   disconnected / unknown / SSR          → 360p (safe default)
 *
 * Format is intentionally kept as a single whole-file MP4 so the existing
 * IndexedDB blob-cache (`useCachedMediaUrl` / `getMediaBlob`) keeps working.
 */

import { useEffect, useRef, useState } from 'react';
import { buildBunnyStreamUrl } from '@/lib/bunny/bunny.config';
import { getMediaBlob } from '@/features/favorites/services/favorites-db';

type BunnyResolution = 240 | 360 | 480 | 720 | 1080;

export interface NetworkAwareStreamResult {
  /** The URL to feed into <video src>. `null` while the async resolution is in flight. */
  streamUrl: string | null;
  /** True when the URL is a `blob:` served from the IndexedDB cache. */
  fromCache: boolean;
  /** Resolved resolution — useful for logging/debugging. */
  resolution: BunnyResolution | null;
}

interface NavigatorConnection {
  effectiveType?: 'slow-2g' | '2g' | '3g' | '4g';
}

/**
 * Pick a streaming resolution based on the current connection.
 * Pure function so it's trivial to unit-test in isolation.
 */
function pickResolution(
  connectionType: string | undefined,
  effectiveType: string | undefined,
): BunnyResolution {
  if (connectionType === 'wifi') return 1080;

  if (connectionType === 'cellular') {
    if (effectiveType === '4g') return 720;
    if (effectiveType === '3g' || effectiveType === '2g' || effectiveType === 'slow-2g') return 360;
    return 720;
  }

  // 'none' / 'unknown' / undefined — be conservative.
  return 360;
}

export function useNetworkAwareStreamUrl(
  videoId: string | null | undefined,
): NetworkAwareStreamResult {
  const [result, setResult] = useState<NetworkAwareStreamResult>({
    streamUrl: null,
    fromCache: false,
    resolution: null,
  });

  // Track the live blob: URL so we can revoke it on unmount / videoId change.
  const blobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    // Reset for the new videoId
    setResult({ streamUrl: null, fromCache: false, resolution: null });

    if (!videoId) return;

    let cancelled = false;

    // The 720p URL is the cache key used by the offline-download system.
    const cacheKeyUrl = buildBunnyStreamUrl(videoId, 720);

    const resolve = async () => {
      // ── Step 1: IndexedDB cache lookup ───────────────────────────────────
      try {
        const blob = await getMediaBlob(cacheKeyUrl);
        if (cancelled) return;
        if (blob) {
          const objectUrl = URL.createObjectURL(blob);
          blobUrlRef.current = objectUrl;
          console.log('🎯 [SmartPlayer] Serving from Local Cache (720p blob) for videoId:', videoId);
          setResult({ streamUrl: objectUrl, fromCache: true, resolution: 720 });
          return;
        }
      } catch {
        // IndexedDB failure — fall through to network detection.
      }

      // ── Step 2: Network detection ────────────────────────────────────────
      let connectionType: string | undefined;
      try {
        const { Network } = await import('@capacitor/network');
        const status = await Network.getStatus();
        if (cancelled) return;
        connectionType = status.connected ? status.connectionType : 'none';
      } catch {
        // @capacitor/network not available (e.g. SSR / web preview) — degrade gracefully.
        connectionType = typeof navigator !== 'undefined' && navigator.onLine === false
          ? 'none'
          : undefined;
      }

      // Cellular sub-type (4G vs 3G) — only the WebView's connection info knows this.
      const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & { connection?: NavigatorConnection }) : null;
      const effectiveType = nav?.connection?.effectiveType;

      const resolution = pickResolution(connectionType, effectiveType);
      const streamUrl  = buildBunnyStreamUrl(videoId, resolution);

      console.log(`🌐 [SmartPlayer] Network Status: ${connectionType} | Effective Type: ${effectiveType ?? 'n/a'} | 🎯 Chosen Resolution: ${resolution}p for videoId:`, videoId);

      if (cancelled) return;
      setResult({ streamUrl, fromCache: false, resolution });
    };

    resolve();

    return () => {
      cancelled = true;
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [videoId]);

  return result;
}
