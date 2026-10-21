/**
 * Fetches the caller's demo viewer world once per uid (in-flight dedupe +
 * localStorage cache, viewer-world.cache.ts). Any failure ⇒ null (the real app).
 */
import { auth } from '@/lib/firebase';
import { parseViewerWorld, readCachedWorld, writeCachedWorld, type StorageLike } from './viewer-world.cache';
import type { DemoViewerWorld } from './viewer-world.types';

const inflight = new Map<string, Promise<DemoViewerWorld | null>>();

function storage(): StorageLike | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** Synchronous cached answer (undefined = unknown yet). */
export function peekDemoViewerWorld(uid: string): DemoViewerWorld | null | undefined {
  return readCachedWorld(storage(), uid);
}

export function getDemoViewerWorld(uid: string): Promise<DemoViewerWorld | null> {
  const cached = readCachedWorld(storage(), uid);
  if (cached !== undefined) return Promise.resolve(cached);
  const running = inflight.get(uid);
  if (running) return running;
  const p = (async () => {
    try {
      const user = auth.currentUser;
      if (!user || user.uid !== uid) return null;
      const token = await user.getIdToken();
      const res = await fetch('/api/demo/viewer-world', { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return null; // not cached — a transient error retries next mount
      const world = parseViewerWorld(await res.json());
      writeCachedWorld(storage(), uid, world);
      return world;
    } catch {
      return null;
    }
  })().finally(() => inflight.delete(uid));
  inflight.set(uid, p);
  return p;
}
