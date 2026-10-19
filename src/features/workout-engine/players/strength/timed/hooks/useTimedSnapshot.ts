'use client';

/** Subscribe a screen to the timed block's live snapshot (re-renders per tick). */
import { useSyncExternalStore } from 'react';
import type { TimedSnapshot, TimedStore } from '../state/timed-store';

export function useTimedSnapshot(store: TimedStore): TimedSnapshot | null {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
