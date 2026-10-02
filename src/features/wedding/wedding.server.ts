import 'server-only';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase-admin';
import { WEDDING_COLLECTION, WEDDING_DOC_ID, initialWeddingState } from './wedding.config';
import { parseWeddingState } from './wedding.schema';
import type { WeddingDocument } from './wedding.types';

/**
 * Server-side storage for the wedding planner, used by the open-link
 * route (/api/public/wedding). One document, Admin SDK only —
 * firestore.rules never expose it. Not part of the admin panel.
 */

function docRef() {
  return getAdminDb().collection(WEDDING_COLLECTION).doc(WEDDING_DOC_ID);
}

function readStored(data: Record<string, unknown> | undefined): WeddingDocument {
  if (!data) return { state: initialWeddingState(), rev: 0 };
  const rev = Number(data.rev);
  return { state: parseWeddingState(data.state), rev: Number.isFinite(rev) ? rev : 0 };
}

export async function readWedding(): Promise<WeddingDocument> {
  const snap = await docRef().get();
  return readStored(snap.exists ? snap.data() : undefined);
}

export type WriteResult = { conflict: false; doc: WeddingDocument } | { conflict: true; doc: WeddingDocument };

/** Saves `body.state` if `body.rev` still matches the stored rev (transaction). */
export async function writeWedding(body: unknown, updatedBy: string): Promise<WriteResult | { error: string }> {
  const b = (body ?? null) as { state?: unknown; rev?: unknown } | null;
  if (!b || typeof b !== 'object' || b.state === undefined) return { error: 'state is required' };
  const baseRev = Number(b.rev);
  if (!Number.isInteger(baseRev) || baseRev < 0) return { error: 'rev must be a non-negative integer' };
  const state = parseWeddingState(b.state);

  return getAdminDb().runTransaction(async (tx) => {
    const ref = docRef();
    const snap = await tx.get(ref);
    const current = readStored(snap.exists ? snap.data() : undefined);
    if (current.rev !== baseRev) return { conflict: true as const, doc: current };
    const next: WeddingDocument = { state, rev: current.rev + 1 };
    tx.set(ref, { ...next, updatedAt: FieldValue.serverTimestamp(), updatedBy });
    return { conflict: false as const, doc: next };
  });
}
