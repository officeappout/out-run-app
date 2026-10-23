import { describe, it, expect } from 'vitest';
import {
  shouldShowSyncChip,
  SYNC_CHIP_COOLDOWN_MS,
  SYNC_CHIP_MAX_VISIBLE_MS,
  SYNC_CHIP_THRESHOLD,
  type SyncChipInput,
} from '../sync-chip-policy';

const NOW = 1_800_000_000_000;
const base: SyncChipInput = {
  running: true,
  queued: SYNC_CHIP_THRESHOLD,
  now: NOW,
  showingSince: null,
  lastShownAt: null,
  dismissed: false,
};

describe('sync chip policy (stuck "syncing" chip, Android 23.10.2026)', () => {
  it('shows for a large backlog while a flush is running', () => {
    expect(shouldShowSyncChip(base)).toBe(true);
  });

  it('never shows for a routine (small) sync', () => {
    expect(shouldShowSyncChip({ ...base, queued: SYNC_CHIP_THRESHOLD - 1 })).toBe(false);
  });

  it('hides once the flush settles — even a FAILED one with the queue still large (the stuck case)', () => {
    expect(shouldShowSyncChip({ ...base, running: false, queued: 5000, showingSince: NOW - 1000 })).toBe(false);
  });

  it('hides when the queue drains below the threshold', () => {
    expect(shouldShowSyncChip({ ...base, queued: 3, showingSince: NOW - 1000 })).toBe(false);
  });

  it('hides after the max visible time even if the flush is still running', () => {
    expect(shouldShowSyncChip({ ...base, showingSince: NOW - SYNC_CHIP_MAX_VISIBLE_MS + 1 })).toBe(true);
    expect(shouldShowSyncChip({ ...base, showingSince: NOW - SYNC_CHIP_MAX_VISIBLE_MS })).toBe(false);
  });

  it('the user can dismiss it', () => {
    expect(shouldShowSyncChip({ ...base, showingSince: NOW - 1000, dismissed: true })).toBe(false);
  });

  it('at most once per sync: a new sync inside the cooldown stays silent', () => {
    expect(shouldShowSyncChip({ ...base, lastShownAt: NOW - 60_000 })).toBe(false);
    expect(shouldShowSyncChip({ ...base, lastShownAt: NOW - SYNC_CHIP_COOLDOWN_MS })).toBe(true);
  });

  it('a chip already showing in this sync is not cut off by its own lastShownAt', () => {
    expect(shouldShowSyncChip({ ...base, showingSince: NOW - 5000, lastShownAt: NOW - 5000 })).toBe(true);
  });
});
