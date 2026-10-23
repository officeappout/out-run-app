/**
 * When the "syncing — 1-2 minutes to load 3 months of data" chip may show
 * (OfflineBanner). Pure, no React — unit-tested in __tests__/sync-chip-policy.test.ts.
 *
 * Why it used to get stuck (Android field report 23.10.2026): the chip was
 * driven ONLY by the outbox depth (≥ 100 queued samples). Depth is re-read
 * after every flush, including FAILED ones — so when the drain kept failing
 * (an App Check rejection, which never consumes retry attempts and keeps the
 * records counted for an hour, or any repeated server error) the queue stayed
 * large, the chip kept claiming "syncing" on every screen while nothing was
 * syncing, and nothing ever hid it. Now it shows only while a flush is really
 * running, at most once per sync, never longer than SYNC_CHIP_MAX_VISIBLE_MS,
 * and the user can dismiss it.
 */

/** Only a genuinely large backfill earns a chip (routine syncs queue a handful). */
export const SYNC_CHIP_THRESHOLD = 100;
/** The copy promises 1-2 minutes; never hold the chip longer than this. */
export const SYNC_CHIP_MAX_VISIBLE_MS = 3 * 60_000;
/** After a chip was shown, later syncs stay silent for this long ("once per sync"). */
export const SYNC_CHIP_COOLDOWN_MS = 12 * 60 * 60_000;
/** localStorage key for the last time the chip was shown. */
export const SYNC_CHIP_LAST_SHOWN_KEY = 'outrun.syncChip.lastShownAt';

export interface SyncChipInput {
  /** A flush is running right now (OutboxFlusher status 'running'). */
  running: boolean;
  /** Queued samples + workouts. */
  queued: number;
  now: number;
  /** When the chip appeared in THIS sync, or null if it has not yet. */
  showingSince: number | null;
  /** Persisted: when a chip was last shown (any sync), or null. */
  lastShownAt: number | null;
  /** The user closed it during this sync. */
  dismissed: boolean;
}

export function shouldShowSyncChip(i: SyncChipInput): boolean {
  if (i.dismissed || !i.running) return false;
  if (i.queued < SYNC_CHIP_THRESHOLD) return false;
  if (i.showingSince != null) return i.now - i.showingSince < SYNC_CHIP_MAX_VISIBLE_MS;
  return i.lastShownAt == null || i.now - i.lastShownAt >= SYNC_CHIP_COOLDOWN_MS;
}
