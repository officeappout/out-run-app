/**
 * The header avatar's notification dot (home v2).
 *
 * Why this exists (David, 17.10.2026 — "a red dot on my profile"): the dot
 * counted activity/{uid}/feed items with `read: false`, but nothing ever sets
 * `read` — the panel never marks items, and firestore.rules only lets an
 * admin update feed docs. On top of that the one client writer of a user's
 * own feed is joinEvent (community.service.ts), which logs the user's OWN
 * "you joined …" entry there with `read: false`. So anyone who ever joined an
 * event carried a dot that could never go away.
 *
 * v2 counts only items from someone else, newer than the last time this
 * device opened the activity panel. "Seen" is per device (localStorage) —
 * the Firestore `read` field stays untouched (no rules change needed).
 */

export interface SeenCheckItem {
  fromUid?: string;
  createdAt: Date;
  read: boolean;
}

export const ACTIVITY_SEEN_EVENT = 'out-activity-seen';

function seenKey(uid: string): string {
  return `out-activity-seen-v1:${uid}`;
}

/**
 * Items that should light the dot: unread, not the user's own action, newer
 * than lastSeenMs. Items with no sender (system/badge events) still count.
 */
export function countUnseenActivity(
  items: readonly SeenCheckItem[],
  myUid: string | null,
  lastSeenMs: number,
): number {
  return items.filter(
    (i) =>
      !i.read
      && !(myUid && i.fromUid === myUid)
      && i.createdAt.getTime() > lastSeenMs,
  ).length;
}

/** Last time this device opened the activity panel for this user (ms), 0 if never. */
export function readActivitySeenAt(uid: string | null): number {
  if (!uid || typeof window === 'undefined') return 0;
  try {
    const n = Number(window.localStorage.getItem(seenKey(uid)));
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

/** Called when the activity panel opens: everything up to now counts as seen. */
export function markActivitySeen(uid: string | null): void {
  if (!uid || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(seenKey(uid), String(Date.now()));
  } catch {
    /* private mode / quota — the dot just stays until next time */
  }
  window.dispatchEvent(new Event(ACTIVITY_SEEN_EVENT));
}
