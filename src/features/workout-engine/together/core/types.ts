/**
 * Together layer — shared types (enable_together_layer_v1).
 *
 * One participant's live status lives in the existing per-session doc
 *   community_groups/{groupId}/attendance/{attendanceId}/member_statuses/{uid}
 * under the `together` map (firestore.rules already let every signed-in user
 * read that sub-collection and each member write only their own doc — no rules
 * change). Everything here is plain data so it can be unit-tested without
 * Firestore.
 */

/** What the together session is. `run` covers run / walk / bike. */
export type TogetherKind = 'run' | 'strength' | 'amrap' | 'emom';

export type TogetherState = 'active' | 'paused' | 'done';

/** The tiny status a participant publishes. Optional fields depend on `kind`. */
export interface PresenceStatus {
  uid: string;
  name: string;
  photoURL?: string;
  kind: TogetherKind;
  state: TogetherState;
  /** run: metres-accurate km so far */
  distanceKm?: number;
  /** run: current average pace, seconds per km (0/undefined = unknown) */
  paceSecPerKm?: number;
  /** strength: 1-based set / exercise counters */
  set?: number;
  totalSets?: number;
  /** amrap: completed rounds · emom: current minute (1-based) */
  round?: number;
  minute?: number;
  /** Finished rounds so far (AMRAP) — drives the "X finished a round!" toast. */
  roundsDone?: number;
  /** Client clock (ms) when this was produced. */
  clientMs: number;
  /** Monotonic per-publisher counter, so a late snapshot never wins. */
  seq: number;
  /** Cheers this participant sent: recipient uid → count (cumulative). */
  cheersSent?: Record<string, number>;
}

/** What a reader gets: the status plus the server clock of the last write. */
export interface PresenceEntry extends PresenceStatus {
  /** Server timestamp (ms) of the last write; null while it is still pending. */
  serverMs: number | null;
}

/** Where a together session lives. */
export interface SessionRef {
  groupId: string;
  attendanceId: string;
}

export type Unsubscribe = () => void;

/** Storage seam: Firestore in the app, in-memory in tests / the emulator. */
export interface PresenceAdapter {
  publish(ref: SessionRef, status: PresenceStatus): Promise<void>;
  subscribe(ref: SessionRef, onEntries: (entries: PresenceEntry[]) => void, onError?: (err: unknown) => void): Unsubscribe;
}
