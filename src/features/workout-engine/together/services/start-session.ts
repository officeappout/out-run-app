import { doc, getDoc, Timestamp, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { planStartAt } from '../core/countdown';
import type { SessionRef } from '../core/types';
import type { TogetherMode } from '../core/level-similarity';

/**
 * Host: "מתחילים יחד". ONE update to the attendance doc flips the phase to
 * `active` and stamps `togetherStartAt` (server-clock ms, from the host's
 * learnt offset + lead + 3 s) and `togetherMode`. Every device counts 3-2-1
 * to that instant (see core/countdown). Group-admin only — the rules already
 * allow an admin to write any shape on the attendance doc (no rules change).
 */
export async function startTogetherSession(ref: SessionRef, opts: { hostUid: string; clockOffsetMs: number; mode: TogetherMode }): Promise<number> {
  const startAt = planStartAt(Date.now() + opts.clockOffsetMs);
  await updateDoc(doc(db, 'community_groups', ref.groupId, 'attendance', ref.attendanceId), {
    sessionPhase: 'active',
    sessionPhaseUpdatedAt: Timestamp.now(),
    sessionPhaseUpdatedBy: opts.hostUid,
    togetherStartAt: Timestamp.fromMillis(startAt),
    togetherMode: opts.mode,
  });
  return startAt;
}

/** Read the start instant once (late joiners / reloads). */
export async function readTogetherStartAt(ref: SessionRef): Promise<number | null> {
  const snap = await getDoc(doc(db, 'community_groups', ref.groupId, 'attendance', ref.attendanceId));
  const ts = snap.data()?.togetherStartAt;
  return ts instanceof Timestamp ? ts.toMillis() : null;
}
