/**
 * Kelly phase 2 — runs a proposal transition on ai_coach_threads/{uid}/messages/{messageId}
 * inside a transaction (lifecycle.ts decides). The uid always comes from the verified token,
 * so a user can only ever touch proposals in their own thread. Writes only the `proposal`
 * status fields of that one message — never a schedule (the device's existing save executor
 * does that, after a successful confirm).
 */
import 'server-only';
import type { Firestore } from 'firebase-admin/firestore';
import { getIsraelDateKey } from '@/lib/israelTime';
import { AI_COACH_THREADS } from '../thread-store.server';
import { scheduleFingerprint } from './fingerprint';
import { decideTransition, type ProposalAction, type TransitionResult } from './lifecycle';
import type { StoredProposal } from './types';

export async function runProposalTransition(
  db: Firestore,
  uid: string,
  messageId: string,
  proposalId: string,
  action: ProposalAction,
  now = new Date(),
): Promise<TransitionResult> {
  const msgRef = db.collection(AI_COACH_THREADS).doc(uid).collection('messages').doc(messageId);
  const userRef = db.collection('users').doc(uid);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(msgRef);
    const data = snap.exists ? snap.data() : null;
    const stored = data && data.role === 'assistant' && data.proposal && typeof data.proposal === 'object' ? (data.proposal as StoredProposal) : null;
    let fingerprint: string | undefined;
    if (action === 'confirm' && stored?.status !== 'applied') {
      const u = await tx.get(userRef);
      fingerprint = scheduleFingerprint(u.exists ? (u.data() ?? null) : null);
    }
    const r = decideTransition(stored, proposalId, action, { nowMs: now.getTime(), todayKey: getIsraelDateKey(now), fingerprint });
    if (r.ok && r.patch) {
      const fields = Object.fromEntries(Object.entries(r.patch).map(([k, v]) => [`proposal.${k}`, v]));
      tx.update(msgRef, fields);
    }
    return r;
  });
}
