import type { PresenceAdapter, PresenceEntry, PresenceStatus, SessionRef, Unsubscribe } from '../core/types';

/**
 * In-memory PresenceAdapter — the same contract as the Firestore one, for unit
 * tests and for developing the UI against without a backend. The "server
 * clock" is injectable so countdown / staleness tests are deterministic.
 */
export function createMemoryPresenceAdapter(opts: { serverNow?: () => number } = {}): PresenceAdapter & {
  writes: Array<{ ref: SessionRef; status: PresenceStatus; atMs: number }>;
} {
  const serverNow = opts.serverNow ?? (() => Date.now());
  const docs = new Map<string, Map<string, PresenceEntry>>();
  const subs = new Map<string, Set<(e: PresenceEntry[]) => void>>();
  const writes: Array<{ ref: SessionRef; status: PresenceStatus; atMs: number }> = [];
  const key = (r: SessionRef) => `${r.groupId}/${r.attendanceId}`;

  const emit = (k: string) => {
    const list = Array.from(docs.get(k)?.values() ?? []);
    subs.get(k)?.forEach((cb) => cb(list));
  };

  return {
    writes,
    async publish(ref, status) {
      const k = key(ref);
      const atMs = serverNow();
      writes.push({ ref, status, atMs });
      const map = docs.get(k) ?? new Map<string, PresenceEntry>();
      const prev = map.get(status.uid);
      // A stale (lower seq) write never replaces a newer one — same as the app's reader rule.
      if (prev && prev.seq > status.seq) return;
      map.set(status.uid, { ...status, serverMs: atMs });
      docs.set(k, map);
      emit(k);
    },
    subscribe(ref, onEntries): Unsubscribe {
      const k = key(ref);
      const set = subs.get(k) ?? new Set();
      set.add(onEntries);
      subs.set(k, set);
      onEntries(Array.from(docs.get(k)?.values() ?? []));
      return () => { set.delete(onEntries); };
    },
  };
}
