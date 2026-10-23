import { collection, doc, onSnapshot, serverTimestamp, setDoc, Timestamp, type DocumentData } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { presenceCollectionPath, stripUndefined } from '../core/session-key';
import type { PresenceAdapter, PresenceEntry, PresenceStatus, TogetherKind, TogetherState } from '../core/types';

/**
 * PresenceAdapter on the existing per-session sub-collection
 * `community_groups/{g}/attendance/{a}/member_statuses/{uid}` — the rules
 * already allow any signed-in user to read it and each member to write only
 * their own doc, so there is NO rules change. The status lives under the
 * `together` map and is written with merge, so the member's RSVP fields
 * (`status`, `lateMinutes`, `personalGoal`) are never touched.
 */

const KINDS: TogetherKind[] = ['run', 'strength', 'amrap', 'emom'];
const STATES: TogetherState[] = ['active', 'paused', 'done'];

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/** Defensive parse — a doc without a `together` map (a plain RSVP) is not a participant yet. */
export function parsePresenceDoc(uid: string, data: DocumentData): PresenceEntry | null {
  const t = data?.together as Record<string, unknown> | undefined;
  if (!t || typeof t !== 'object') return null;
  const kind = KINDS.includes(t.kind as TogetherKind) ? (t.kind as TogetherKind) : 'run';
  const state = STATES.includes(t.state as TogetherState) ? (t.state as TogetherState) : 'active';
  const sent: Record<string, number> = {};
  if (t.cheersSent && typeof t.cheersSent === 'object') {
    for (const [k, v] of Object.entries(t.cheersSent as Record<string, unknown>)) {
      const n = num(v);
      if (n && n > 0) sent[k] = n;
    }
  }
  const ts = t.serverTs;
  return {
    uid,
    name: typeof t.name === 'string' ? t.name : '',
    ...(typeof t.photoURL === 'string' ? { photoURL: t.photoURL } : {}),
    kind,
    state,
    ...(num(t.distanceKm) != null ? { distanceKm: num(t.distanceKm) } : {}),
    ...(num(t.paceSecPerKm) != null ? { paceSecPerKm: num(t.paceSecPerKm) } : {}),
    ...(num(t.set) != null ? { set: num(t.set) } : {}),
    ...(num(t.totalSets) != null ? { totalSets: num(t.totalSets) } : {}),
    ...(num(t.round) != null ? { round: num(t.round) } : {}),
    ...(num(t.minute) != null ? { minute: num(t.minute) } : {}),
    ...(num(t.roundsDone) != null ? { roundsDone: num(t.roundsDone) } : {}),
    ...(Object.keys(sent).length ? { cheersSent: sent } : {}),
    clientMs: num(t.clientMs) ?? 0,
    seq: num(t.seq) ?? 0,
    serverMs: ts instanceof Timestamp ? ts.toMillis() : null,
  };
}

export const firestorePresenceAdapter: PresenceAdapter = {
  async publish(ref, status: PresenceStatus) {
    const payload = stripUndefined({ ...status, serverTs: serverTimestamp() } as unknown as Record<string, unknown>);
    await setDoc(
      doc(db, presenceCollectionPath(ref), status.uid),
      { uid: status.uid, together: payload },
      { merge: true },
    );
  },
  subscribe(ref, onEntries, onError) {
    return onSnapshot(
      collection(db, presenceCollectionPath(ref)),
      // A pending serverTimestamp reads null (so `serverMs` is null for our own
      // in-flight write) and fills in when the server confirms — the clock-offset
      // sampling relies on never seeing an estimate.
      (snap) => {
        const entries: PresenceEntry[] = [];
        snap.forEach((d) => {
          const e = parsePresenceDoc(d.id, d.data());
          if (e) entries.push(e);
        });
        onEntries(entries);
      },
      onError,
    );
  },
};
