/**
 * Which `lastActivityDate` the routine streak write (useActivityStore.syncToServer) sends.
 *
 * streaks/{uid}.lastActivityDate is the last day that COUNTED, and the streaks rule
 * (firestore.rules, 12.10.2026 clamp) accepts only four shapes: unchanged, +1 advance, gap reset
 * to 1, and the same-day undo. The sync used to send `today` on every write, so the first sync
 * of a new day — before anything counted — moved the date forward with the count unchanged:
 * no shape matches, the write is denied ("[ActivityStore] Error syncing to Firestore:
 * permission-denied", 21.10.2026 — seen on the AI testers, but every real user with a live
 * streak hits it on their first sync of the day) and the rest of the sync (the users-doc streak
 * mirror) is skipped.
 *
 * Fix: when the count and the record are what the server already has, nothing counted since —
 * keep the server's date (the "unchanged" shape). Every other case sends today, as before.
 */
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

export interface StreakDocSnapshot {
  currentStreak?: unknown;
  longestStreak?: unknown;
  lastActivityDate?: unknown;
}

export function streakWriteDate(
  local: { currentStreak: number; longestStreak: number; todayDate: string },
  server: StreakDocSnapshot | null | undefined,
): string {
  if (
    server &&
    server.currentStreak === local.currentStreak &&
    server.longestStreak === local.longestStreak &&
    typeof server.lastActivityDate === 'string' &&
    DAY_KEY.test(server.lastActivityDate)
  ) {
    return server.lastActivityDate;
  }
  return local.todayDate;
}
