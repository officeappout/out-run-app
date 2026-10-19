/**
 * Deploy-rollover recovery shared by every App Router error boundary.
 *
 * A ChunkLoadError means the browser holds an old HTML page whose chunk
 * hashes no longer exist on the current deployment. `reset()` just retries
 * the same missing chunk, so the only real fix is one hard reload. The
 * session flag stops an infinite reload loop when the chunk is genuinely
 * unreachable (e.g. offline).
 *
 * Moved out of src/app/global-error.tsx unchanged so the route-level
 * `error.tsx` boundaries (which now catch these errors before the global one
 * would) keep exactly the same behaviour and share the same loop guard key.
 */
import { isChunkLoadError } from '@/lib/sentry-shared';

export const CHUNK_RELOAD_KEY = 'chunk_error_reload';

/** Hard-reloads once for a chunk-load error. Returns true when it reloaded. */
export function reloadOnceForChunkError(error: Pick<Error, 'name' | 'message'>): boolean {
  if (!isChunkLoadError(error)) return false;
  try {
    if (sessionStorage.getItem(CHUNK_RELOAD_KEY)) return false;
    sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

/** Clears the loop guard — call before a user-initiated retry. */
export function clearChunkReloadFlag(): void {
  try {
    sessionStorage.removeItem(CHUNK_RELOAD_KEY);
  } catch {
    /* private mode — ignore */
  }
}
