/**
 * Browser read of published site_content through the cached public API (GET /api/content).
 * In-memory cache per type+locale (5 min) with in-flight dedupe. Never throws: null = the API
 * was unreachable (callers fall back), [] = reachable but nothing published.
 */
import type { ContentLocale, ContentType, PublicContentItem } from './types';

const TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; items: PublicContentItem[] }>();
const inflight = new Map<string, Promise<PublicContentItem[] | null>>();

export async function fetchPublishedContent(type: ContentType, locale: ContentLocale = 'he'): Promise<PublicContentItem[] | null> {
  if (typeof window === 'undefined') return null;
  const key = `${type}:${locale}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.items;
  const pending = inflight.get(key);
  if (pending) return pending;
  const p = (async () => {
    try {
      const res = await fetch(`/api/content?type=${type}&locale=${locale}`);
      if (!res.ok) return hit?.items ?? null;
      const body = (await res.json()) as { items?: unknown };
      const items = Array.isArray(body.items) ? (body.items as PublicContentItem[]) : [];
      cache.set(key, { at: Date.now(), items });
      return items;
    } catch {
      return hit?.items ?? null;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

/** Tests only. */
export function __resetContentCache(): void {
  cache.clear();
  inflight.clear();
}
