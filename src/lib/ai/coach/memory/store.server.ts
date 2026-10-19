/**
 * Kelly phase 3 — ai_coach_memory/{uid} reads and writes (Admin SDK only).
 */
import 'server-only';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { parseStoredFacts } from './merge';
import { MEMORY_COLLECTION, type MemoryFact } from './types';

export interface MemoryDoc {
  facts: MemoryFact[];
  /** Epoch ms of the newest user message already extracted. */
  extractedUntil: number;
}

const ref = (db: Firestore, uid: string) => db.collection(MEMORY_COLLECTION).doc(uid);

export async function loadMemory(db: Firestore, uid: string): Promise<MemoryDoc> {
  const snap = await ref(db, uid).get();
  const d = snap.exists ? (snap.data() as Record<string, unknown>) : {};
  return { facts: parseStoredFacts(d.facts), extractedUntil: typeof d.extractedUntil === 'number' ? d.extractedUntil : 0 };
}

export async function saveMemory(db: Firestore, uid: string, doc: MemoryDoc): Promise<void> {
  await ref(db, uid).set({ facts: doc.facts.map((f) => ({ ...f })), extractedUntil: doc.extractedUntil, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}

/** Deletes one fact (true when it existed). Transaction: a concurrent extraction can't resurrect it. */
export async function deleteMemoryFact(db: Firestore, uid: string, factId: string): Promise<boolean> {
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref(db, uid));
    const facts = parseStoredFacts(snap.exists ? snap.get('facts') : []);
    const next = facts.filter((f) => f.id !== factId);
    if (next.length === facts.length) return false;
    tx.set(ref(db, uid), { facts: next, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return true;
  });
}

/**
 * "מחק הכל": every fact goes; extractedUntil stays, so older messages are not re-read into
 * memory (the user asked Kelly to forget them).
 */
export async function deleteAllMemory(db: Firestore, uid: string, nowMs = Date.now()): Promise<void> {
  await ref(db, uid).set({ facts: [], extractedUntil: nowMs, clearedAt: nowMs, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}
