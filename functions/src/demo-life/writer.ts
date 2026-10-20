/**
 * Every write of the live engine goes through here (design L5). Before a doc reaches a
 * batch it must pass BOTH:
 *   1. the shared allowlist (guard.ts — the same one the seed uses): demo paths only,
 *      demo / viewer uids only, demo scopes only, ageGroup 'demo' on public surfaces,
 *      presence in group mode with demo groups only;
 *   2. the registry: the persona, chat and group named by the path are ones the seed
 *      registered in demo_registry (a demo-looking id that the registry doesn't know is
 *      refused too).
 * A refusal throws — the tick stops (nothing after it is written) and logs the reason.
 */
import type { DocumentReference, Firestore, WriteBatch } from 'firebase-admin/firestore';
import { assertDemoDoc, assertDemoPath, DemoGuardError } from './guard';
import { DEMO_REGISTRY_COLLECTION } from '../lib/demo-world';

export interface RegistryView {
  personaUids: ReadonlySet<string>;
  viewerUids: ReadonlySet<string>;
  groupIds: ReadonlySet<string>;
  chatIds: ReadonlySet<string>;
}

const PER_USER = new Set(['users', 'streaks', 'presence', 'connections', 'user_memberships', 'military_declarations']);
const PER_USER_RECORD = new Set(['workouts', 'feed_posts', 'sessions', 'userSchedule', 'dailyActivity', 'dailyActivityPublic']);

export function assertInRegistry(path: string, reg: RegistryView): void {
  const segs = path.split('/');
  const refuse = (why: string): never => {
    throw new DemoGuardError(`[demo life] refusing to write ${path}: ${why}`);
  };
  const col = segs[0];
  if (col === DEMO_REGISTRY_COLLECTION) return;
  if (PER_USER.has(col)) {
    if (!reg.personaUids.has(segs[1])) refuse('not a registered demo persona');
    return;
  }
  if (PER_USER_RECORD.has(col)) {
    const id = segs[1];
    if (!Array.from(reg.personaUids).some((u) => id.startsWith(`${u}_`))) refuse('record id does not belong to a registered persona');
    return;
  }
  if (col === 'chats') {
    if (!reg.chatIds.has(segs[1])) refuse('chat is not in the registry');
    return;
  }
  if (col === 'community_groups') {
    if (!reg.groupIds.has(segs[1])) refuse('group is not in the registry');
    if (segs[2] === 'members' && !reg.personaUids.has(segs[3])) refuse('member is not a registered persona');
    return;
  }
  if (col === 'kudos') {
    if (!reg.personaUids.has(segs[1]) && !reg.viewerUids.has(segs[1])) refuse('kudos recipient is not a persona / viewer');
    return;
  }
  refuse('collection not handled by the life engine');
}

export type WriteKind = 'set' | 'merge' | 'update' | 'create' | 'delete';

/** Guard-checked batch builder that also counts writes (usage.firestoreWritesEst). */
export class GuardedWriter {
  writes = 0;

  constructor(
    readonly db: Firestore,
    readonly reg: RegistryView,
  ) {}

  check(path: string, data: Record<string, unknown> | null, partial: boolean): DocumentReference {
    if (data === null) assertDemoPath(path, this.reg.viewerUids);
    else assertDemoDoc(path, data, this.reg.viewerUids, { partial });
    assertInRegistry(path, this.reg);
    return this.db.doc(path);
  }

  /** Adds one op to `batch` after the checks. `data` for update/merge may hold FieldValues (checked separately by the caller). */
  add(batch: WriteBatch, kind: WriteKind, path: string, data: Record<string, unknown> = {}): void {
    const ref = this.check(path, kind === 'delete' ? null : data, kind === 'update' || kind === 'merge');
    if (kind === 'set') batch.set(ref, data);
    else if (kind === 'merge') batch.set(ref, data, { merge: true });
    else if (kind === 'update') batch.update(ref, data);
    else if (kind === 'create') batch.create(ref, data);
    else batch.delete(ref);
    this.writes++;
  }

  batch(): WriteBatch {
    return this.db.batch();
  }
}

/** Firestore ALREADY_EXISTS (a create of a doc a previous run already wrote). */
export const isAlreadyExists = (e: unknown) => (e as { code?: unknown })?.code === 6 || /already exists/i.test(String((e as Error)?.message));
