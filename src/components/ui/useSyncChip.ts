'use client';

/**
 * useSyncChip — drives OfflineBanner's "syncing a large backfill" chip from the
 * real flush lifecycle (see src/lib/outbox/sync-chip-policy.ts for the rules
 * and for why the chip used to stay stuck).
 */
import { useCallback, useEffect, useState } from 'react';
import { OutboxFlusher } from '@/lib/outbox/OutboxFlusher';
import {
  shouldShowSyncChip,
  SYNC_CHIP_LAST_SHOWN_KEY,
  SYNC_CHIP_MAX_VISIBLE_MS,
} from '@/lib/outbox/sync-chip-policy';

function readLastShown(): number | null {
  try {
    const v = Number(window.localStorage.getItem(SYNC_CHIP_LAST_SHOWN_KEY));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

function writeLastShown(at: number): void {
  try {
    window.localStorage.setItem(SYNC_CHIP_LAST_SHOWN_KEY, String(at));
  } catch {
    /* private mode / blocked storage — the in-memory state still hides it */
  }
}

export function useSyncChip(queued: number, isOffline: boolean): { visible: boolean; dismiss: () => void } {
  const [running, setRunning] = useState(false);
  const [showingSince, setShowingSince] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    return OutboxFlusher.onStatusChange((s) => setRunning(s.phase === 'running'));
  }, []);

  // A finished (or failed) flush ends this sync: next time starts clean, and
  // the persisted "last shown" keeps it to once per sync.
  useEffect(() => {
    if (running) return;
    setShowingSince(null);
    setDismissed(false);
    setTimedOut(false);
  }, [running]);

  const visible =
    !isOffline &&
    !timedOut &&
    typeof window !== 'undefined' &&
    shouldShowSyncChip({
      running,
      queued,
      now: Date.now(),
      showingSince,
      lastShownAt: showingSince == null ? readLastShown() : null,
      dismissed,
    });

  useEffect(() => {
    if (!visible || showingSince != null) return;
    const now = Date.now();
    setShowingSince(now);
    writeLastShown(now);
  }, [visible, showingSince]);

  useEffect(() => {
    if (showingSince == null) return;
    const left = Math.max(0, showingSince + SYNC_CHIP_MAX_VISIBLE_MS - Date.now());
    const id = window.setTimeout(() => setTimedOut(true), left);
    return () => window.clearTimeout(id);
  }, [showingSince]);

  const dismiss = useCallback(() => setDismissed(true), []);
  return { visible, dismiss };
}
