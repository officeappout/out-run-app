import { describe, expect, it } from 'vitest';
import {
  consumePendingWalkEntry,
  consumeWalkAutoRoute,
  markPendingWalkEntry,
  markWalkAutoRoute,
  WALK_PENDING_ENTRY_KEY,
  type KVStore,
} from '../walkHandoff';

function memStore(): KVStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

describe('walk auto-route marker', () => {
  it('is read once', () => {
    const s = memStore();
    markWalkAutoRoute(s, 1000);
    expect(consumeWalkAutoRoute(s, 2000)).toBe(true);
    expect(consumeWalkAutoRoute(s, 2000)).toBe(false);
  });
  it('expires after 10 minutes', () => {
    const s = memStore();
    markWalkAutoRoute(s, 0);
    expect(consumeWalkAutoRoute(s, 11 * 60 * 1000)).toBe(false);
  });
  it('no store / garbage → false', () => {
    expect(consumeWalkAutoRoute(null)).toBe(false);
    const s = memStore();
    s.setItem('pending_walk_auto_route', 'not json');
    expect(consumeWalkAutoRoute(s)).toBe(false);
  });
});

describe('pending planned-walk entry marker', () => {
  it('round-trips the entry once', () => {
    const s = memStore();
    expect(markPendingWalkEntry({ date: '2026-10-20', entryId: 'walkplan_2026-10-20' }, s, 0)).toBe(true);
    expect(consumePendingWalkEntry(s, 60_000)).toEqual({ date: '2026-10-20', entryId: 'walkplan_2026-10-20' });
    expect(consumePendingWalkEntry(s, 60_000)).toBeNull();
  });
  it('a start without an entry (short walk) clears an older marker', () => {
    const s = memStore();
    markPendingWalkEntry({ date: '2026-10-20', entryId: 'walkplan_2026-10-20' }, s, 0);
    expect(markPendingWalkEntry({}, s, 0)).toBe(false);
    expect(s.data.has(WALK_PENDING_ENTRY_KEY)).toBe(false);
  });
  it('expires after 6 hours', () => {
    const s = memStore();
    markPendingWalkEntry({ date: '2026-10-20', entryId: 'walkplan_2026-10-20' }, s, 0);
    expect(consumePendingWalkEntry(s, 7 * 60 * 60 * 1000)).toBeNull();
  });
});
