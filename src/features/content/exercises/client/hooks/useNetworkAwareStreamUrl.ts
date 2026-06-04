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
 *   iOS native (WKWebView)                → 360p (matches REST player; avoids
 *                                            1080p concurrent decode failures)
 *   wifi (non-native)                     → 1080p
 *   cellular + effectiveType === '4g'     → 720p
 *   cellular + 3g / 2g / slow-2g          → 360p
 *   cellular (sub-type unknown)           → 720p
 *   disconnected / unknown / SSR          → 360p (safe default)
 *
 * Format is intentionally kept as a single whole-file MP4 so the existing
 * IndexedDB blob-cache (`useCachedMediaUrl` / `getMediaBlob`) keeps working.
 *
 * Null-URL behaviour:
 *   The previous `streamUrl` is kept visible while the new videoId resolves,
 *   eliminating the flash-of-nothing between set remounts on iOS. The old
 *   blob: URL is revoked only after the new URL is ready (or on unmount).
 */

import { useEffect, useRef, useState } from 'react';
import { buildBunnyStreamUrl } from '@/lib/bunny/bunny.config';
import { getMediaBlob } from '@/features/favorites/services/favorites-db';

type BunnyResolution = 240 | 360 | 480 | 720 | 1080;

export interface NetworkAwareStreamResult {
  /** The URL to feed into <video src>. `null` only before first resolution or when videoId is null. */
  streamUrl: string | null;
  /** True when the URL is a `blob:` served from the IndexedDB cache. */
  fromCache: boolean;
  /** Resolved resolution — useful for logging/debugging. */
  resolution: BunnyResolution | null;
}

interface NavigatorConnection {
  effectiveType?: 'slow-2g' | '2g' | '3g' | '4g';
}

/** True when running inside Capacitor on iOS (WKWebView). Safe to call on server (returns false). */
function isIosNative(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    (window as unknown as { Capacitor?: { getPlatform?: () => string } })
      .Capacitor?.getPlatform?.() === 'ios'
  );
}

/**
 * Pick a streaming resolution based on the current connection.
 * Pure function so it's trivial to unit-test in isolation.
 */
function pickResolution(
  connectionType: string | undefined,
  effectiveType: string | undefined,
  iosNative: boolean,
): BunnyResolution {
  // iOS WKWebView: cap at 360p to match the REST player and avoid concurrent
  // decoder exhaustion when a second hidden <video> is also present.
  if (iosNative) return 360;

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

  // Tracks the active blob: URL so it can be revoked once superseded or on unmount.
  // Deliberately NOT revoked in the main effect cleanup — the previous URL stays
  // visible in the <video src> until the new one is ready, preventing a flash of
  // nothing between set remounts on iOS.
  const blobUrlRef = useRef<string | null>(null);

  // Revoke the final blob on component unmount only.
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!videoId) {
      // Explicit "no video" — revoke any lingering blob and clear immediately.
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
      setResult({ streamUrl: null, fromCache: false, resolution: null });
      return;
    }

    // NOTE: intentionally NOT resetting streamUrl to null here.
    // The previous URL stays rendered while the new one resolves, so there is
    // no empty-frame flash between set remounts on iOS WKWebView.

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
          // Revoke the superseded blob AFTER the new one is ready.
          if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
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

      const resolution = pickResolution(connectionType, effectiveType, isIosNative());
      const streamUrl  = buildBunnyStreamUrl(videoId, resolution);

      // We're switching to a network URL — revoke any blob that was active.
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }

      console.log(`🌐 [SmartPlayer] Network Status: ${connectionType} | Effective Type: ${effectiveType ?? 'n/a'} | isIosNative: ${isIosNative()} | 🎯 Chosen Resolution: ${resolution}p`);
      console.log(`🔗 [SmartPlayer] Final URL → ${streamUrl}`);

      if (cancelled) return;
      setResult({ streamUrl, fromCache: false, resolution });
    };

    resolve();

    return () => {
      cancelled = true;
      // Do NOT revoke blobUrlRef here — the next effect invocation will revoke it
      // once the new URL is ready. The unmount effect handles the final revoke.
    };
  }, [videoId]);

  return result;
}
