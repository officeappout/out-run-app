/**
 * Reset of ONE tester account (Admin SDK) — every Firestore doc that belongs to it, found with
 * the demo purge's own per-user target lists (scripts/demo/lib/purge-targets.ts, which mirror
 * the GDPR purgeUserData). The Firebase Auth record stays (the next sign-in is a fresh account).
 *
 * Fences: demo_qa_* uid only; a doc is deleted only when its own id is the uid / starts with
 * `${uid}_`, or the field the query matched really equals the uid. Shared demo docs are never
 * touched: chats (demo group chats hold everyone) and community_groups the tester created are
 * left alone (missions never create groups or send messages) — they are listed as `skipped`.
 */
import { FieldPath, type DocumentReference, type Firestore } from 'firebase-admin/firestore';
import { isTesterUid } from '../../../demo/lib/config';
import { PER_USER_DOCS, PER_USER_ID_PREFIX, PER_USER_QUERIES } from '../../../demo/lib/purge-targets';

/** Shared with other demo users — never deleted by a tester reset. */
const SHARED = new Set(['community_groups']);

export interface ResetPlan {
  uid: string;
  deletes: string[];
  skipped: string[];
}

async function addTree(ref: DocumentReference, out: Set<string>, exists?: boolean): Promise<void> {
  if (exists ?? (await ref.get()).exists) out.add(ref.path);
  for (const col of await ref.listCollections()) {
    for (const child of await col.listDocuments()) await addTree(child, out);
  }
}

export async function planTesterReset(db: Firestore, uid: string): Promise<ResetPlan> {
  if (!isTesterUid(uid)) throw new Error(`refusing to reset a non-tester uid: ${uid}`);
  const out = new Set<string>();
  const skipped: string[] = [];

  for (const t of PER_USER_DOCS) {
    const ref = db.collection(t.collection).doc(uid);
    if (t.recursive) await addTree(ref, out);
    else if ((await ref.get()).exists) out.add(ref.path);
  }
  for (const t of PER_USER_ID_PREFIX) {
    const snap = await db.collection(t.collection).where(FieldPath.documentId(), '>=', `${uid}_`).where(FieldPath.documentId(), '<', `${uid}_`).get();
    for (const d of snap.docs) if (d.id.startsWith(`${uid}_`)) await addTree(d.ref, out, true);
  }
  for (const t of PER_USER_QUERIES) {
    const snap = await db.collection(t.collection).where(t.field, '==', uid).get();
    for (const d of snap.docs) {
      if (d.get(t.field) !== uid) continue;
      if (SHARED.has(t.collection)) {
        skipped.push(d.ref.path);
        continue;
      }
      if (t.recursive) await addTree(d.ref, out, true);
      else out.add(d.ref.path);
    }
  }
  return { uid, deletes: Array.from(out), skipped };
}

export async function executeTesterReset(db: Firestore, plan: ResetPlan): Promise<number> {
  if (!isTesterUid(plan.uid)) throw new Error(`refusing to reset a non-tester uid: ${plan.uid}`);
  // Deepest first, so a subcollection doc never outlives its parent mid-run.
  const paths = [...plan.deletes].sort((a, b) => b.split('/').length - a.split('/').length);
  for (let i = 0; i < paths.length; i += 400) {
    const batch = db.batch();
    paths.slice(i, i + 400).forEach((p) => batch.delete(db.doc(p)));
    await batch.commit();
  }
  return paths.length;
}
