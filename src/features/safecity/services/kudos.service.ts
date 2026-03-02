/**
 * Kudos Service — Live High-Five interaction between map viewers and active trainees.
 *
 * Firestore schema:
 *   kudos/{recipientUid}/inbox/{kudoId} = {
 *     fromUid:   string,
 *     fromName:  string,
 *     type:      'high_five',
 *     sentAt:    serverTimestamp,
 *     read:      boolean,
 *   }
 */

import {
  collection,
  addDoc,
  query,
  where,
  onSnapshot,
  updateDoc,
  doc,
  serverTimestamp,
  orderBy,
  limit,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

// ── Types ───────────────────────────────────────────────────────────────────

export type KudoType = 'high_five';

export interface KudoDoc {
  id: string;
  fromUid: string;
  fromName: string;
  type: KudoType;
  sentAt: Date;
  read: boolean;
}

// ── Write ───────────────────────────────────────────────────────────────────

export async function sendKudo(
  recipientUid: string,
  fromUid: string,
  fromName: string,
  type: KudoType = 'high_five',
): Promise<void> {
  const inboxRef = collection(db, 'kudos', recipientUid, 'inbox');
  await addDoc(inboxRef, {
    fromUid,
    fromName,
    type,
    sentAt: serverTimestamp(),
    read: false,
  });
}

// ── Real-time listener (for the receiver) ───────────────────────────────────

export function subscribeToKudos(
  myUid: string,
  onKudo: (kudo: KudoDoc) => void,
): () => void {
  const inboxRef = collection(db, 'kudos', myUid, 'inbox');
  const q = query(
    inboxRef,
    where('read', '==', false),
    orderBy('sentAt', 'desc'),
    limit(5),
  );

  return onSnapshot(q, (snap) => {
    snap.docChanges().forEach((change) => {
      if (change.type === 'added') {
        const data = change.doc.data();
        const sentAt =
          data.sentAt instanceof Timestamp
            ? data.sentAt.toDate()
            : new Date();

        onKudo({
          id: change.doc.id,
          fromUid: data.fromUid as string,
          fromName: data.fromName as string,
          type: data.type as KudoType,
          sentAt,
          read: false,
        });
      }
    });
  });
}

// ── Mark as read ────────────────────────────────────────────────────────────

export async function markKudoRead(myUid: string, kudoId: string): Promise<void> {
  const kudoRef = doc(db, 'kudos', myUid, 'inbox', kudoId);
  await updateDoc(kudoRef, { read: true }).catch(() => {});
}
