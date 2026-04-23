'use client';

import { useState, useEffect, useRef } from 'react';
import { getMediaBlob } from '../services/favorites-db';

/**
 * Given an original network URL, attempt to resolve it from IndexedDB cache.
 * Returns the blob: URL if cached, otherwise falls back to the original URL.
 * Automatically revokes the object URL on unmount / URL change.
 */
export function useCachedMediaUrl(originalUrl: string | null | undefined): string | null {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(originalUrl ?? null);
  const blobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!originalUrl) {
      setResolvedUrl(null);
      return;
    }

    let cancelled = false;

    getMediaBlob(originalUrl)
      .then((blob) => {
        if (cancelled) return;
        if (blob) {
          const filename = originalUrl.split('/').pop()?.split('?')[0] || originalUrl.slice(-40);
          console.log(`[useCachedMediaUrl] 🎯 Serving from cache: ${filename} (${(blob.size / 1024).toFixed(0)} KB)`);
          const objectUrl = URL.createObjectURL(blob);
          blobUrlRef.current = objectUrl;
          setResolvedUrl(objectUrl);
        } else {
          setResolvedUrl(originalUrl);
        }
      })
      .catch(() => {
        if (!cancelled) setResolvedUrl(originalUrl);
      });

    return () => {
      cancelled = true;
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [originalUrl]);

  return resolvedUrl;
}

/**
 * Batch-resolve multiple media URLs from IndexedDB cache.
 * Returns a Map<originalUrl, resolvedUrl> where resolved is either
 * a blob: URL (if cached) or the original network URL.
 * Revokes all blob URLs on unmount / input change.
 */
export function useCachedMediaMap(urls: (string | null | undefined)[]): Map<string, string> {
  const [urlMap, setUrlMap] = useState<Map<string, string>>(new Map());
  const blobUrlsRef = useRef<string[]>([]);

  const key = urls.filter(Boolean).sort().join('|');

  useEffect(() => {
    let cancelled = false;
    const validUrls = urls.filter((u): u is string => !!u);

    if (validUrls.length === 0) {
      setUrlMap(new Map());
      return;
    }

    const newBlobUrls: string[] = [];

    Promise.all(
      validUrls.map(async (url) => {
        try {
          const blob = await getMediaBlob(url);
          if (blob) {
            const filename = url.split('/').pop()?.split('?')[0] || url.slice(-40);
            console.log(`[useCachedMediaMap] 🎯 Serving from cache: ${filename} (${(blob.size / 1024).toFixed(0)} KB)`);
            const objectUrl = URL.createObjectURL(blob);
            newBlobUrls.push(objectUrl);
            return [url, objectUrl] as const;
          }
        } catch { /* fall through */ }
        return [url, url] as const;
      }),
    ).then((entries) => {
      if (cancelled) {
        newBlobUrls.forEach((u) => URL.revokeObjectURL(u));
        return;
      }
      blobUrlsRef.current = newBlobUrls;
      setUrlMap(new Map(entries));
    });

    return () => {
      cancelled = true;
      blobUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
      blobUrlsRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return urlMap;
}
