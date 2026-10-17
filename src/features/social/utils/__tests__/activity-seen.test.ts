import { afterEach, describe, expect, it, vi } from 'vitest';
import { countUnseenActivity, markActivitySeen, readActivitySeenAt } from '../activity-seen';

const at = (iso: string) => new Date(iso);

describe('countUnseenActivity', () => {
  const me = 'u1';
  const items = [
    { fromUid: 'u1', createdAt: at('2026-10-10T10:00:00Z'), read: false }, // my own "joined event" entry
    { fromUid: 'u2', createdAt: at('2026-10-12T10:00:00Z'), read: false }, // a high five from someone
    { fromUid: 'u3', createdAt: at('2026-10-13T10:00:00Z'), read: true },
    { createdAt: at('2026-10-14T10:00:00Z'), read: false }, // system item, no sender
  ];

  it("never counts the user's own entries (the dot that could not go away)", () => {
    expect(countUnseenActivity([items[0]], me, 0)).toBe(0);
  });

  it('counts unread items from others and sender-less items', () => {
    expect(countUnseenActivity(items, me, 0)).toBe(2);
  });

  it('only items newer than the last panel open', () => {
    expect(countUnseenActivity(items, me, at('2026-10-13T00:00:00Z').getTime())).toBe(1);
    expect(countUnseenActivity(items, me, at('2026-10-15T00:00:00Z').getTime())).toBe(0);
  });

  it('no uid → nothing is "mine", unread items still count', () => {
    expect(countUnseenActivity([items[0]], null, 0)).toBe(1);
  });
});

describe('seen timestamp storage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('round-trips per user and fires the change event', () => {
    const store = new Map<string, string>();
    const dispatchEvent = vi.fn();
    vi.stubGlobal('window', {
      localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) },
      dispatchEvent,
    });
    expect(readActivitySeenAt('u1')).toBe(0);
    markActivitySeen('u1');
    expect(readActivitySeenAt('u1')).toBeGreaterThan(0);
    expect(readActivitySeenAt('u2')).toBe(0);
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
  });

  it('no window / no uid → 0, no throw', () => {
    expect(readActivitySeenAt('u1')).toBe(0);
    expect(readActivitySeenAt(null)).toBe(0);
    expect(() => markActivitySeen(null)).not.toThrow();
  });
});
