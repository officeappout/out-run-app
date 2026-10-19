/**
 * Recent searches — stored locally, per user (one key per uid), newest first, max 8. The list
 * logic is pure; the storage wrapper never throws (private mode / quota → empty list).
 */
import { norm } from './text';

export const MAX_RECENTS = 8;
const KEY_PREFIX = 'out_search_recents_v1:';

export const recentsKey = (uid: string | null | undefined) => `${KEY_PREFIX}${uid || 'anon'}`;

export function addRecent(list: readonly string[], query: string, max = MAX_RECENTS): string[] {
  const q = query.trim().replace(/\s+/g, ' ').slice(0, 80);
  if (norm(q).length < 2) return [...list];
  const key = norm(q);
  return [q, ...list.filter((x) => norm(x) !== key)].slice(0, max);
}

export function removeRecent(list: readonly string[], query: string): string[] {
  const key = norm(query);
  return list.filter((x) => norm(x) !== key);
}

export function readRecents(uid: string | null | undefined): string[] {
  try {
    const raw = window.localStorage.getItem(recentsKey(uid));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string').slice(0, MAX_RECENTS) : [];
  } catch {
    return [];
  }
}

export function writeRecents(uid: string | null | undefined, list: readonly string[]): void {
  try {
    if (list.length) window.localStorage.setItem(recentsKey(uid), JSON.stringify(list));
    else window.localStorage.removeItem(recentsKey(uid));
  } catch {
    /* private mode / quota — recents are a convenience */
  }
}
