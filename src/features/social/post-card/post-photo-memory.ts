/**
 * The photo of a workout post, remembered on this device (board PostPhotoCompact): the feed post
 * has no link to its workout, so after a post with a photo goes up we keep { url, category, day }
 * and the home "done" slide of the same day and category shows it. Best-effort localStorage.
 */
const KEY = 'out-post-photos-v1';
const KEEP = 10;

export interface PostPhotoMemo {
  url: string;
  category: string;
  /** Local day 'YYYY-MM-DD'. */
  day: string;
  atMs: number;
}

export function localDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function read(): PostPhotoMemo[] {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(KEY) : null;
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? (list as PostPhotoMemo[]).filter((m) => m && typeof m.url === 'string') : [];
  } catch {
    return [];
  }
}

export function rememberPostPhoto(url: string, category: string, now: Date = new Date()): void {
  if (!/^https:\/\//.test(url)) return;
  const next = [{ url, category, day: localDay(now), atMs: now.getTime() }, ...read()].slice(0, KEEP);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch { /* storage full or blocked: no photo on home */ }
}

/** The latest photo posted today for this category, or null. */
export function pickPostPhoto(list: readonly PostPhotoMemo[], category: string, day: string): string | null {
  return list.find((m) => m.category === category && m.day === day)?.url ?? null;
}

export function recallPostPhoto(category: string, now: Date = new Date()): string | null {
  return pickPostPhoto(read(), category, localDay(now));
}
