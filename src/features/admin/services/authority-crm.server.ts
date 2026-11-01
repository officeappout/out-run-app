/**
 * Admin SDK access to authorities/{id}/crm_private/main.
 * See ./authority-crm.ts for the read/write contract (private wins per field,
 * legacy main-doc copy is the pre-migration fallback; writes always land in
 * the private doc as full values).
 */
import 'server-only';
import { FieldValue, type DocumentReference, type Firestore, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
import {
  CRM_PRIVATE_DOC_ID,
  CRM_PRIVATE_SUBCOLLECTION,
  mergeCrmFields,
  type AuthorityCrmField,
} from './authority-crm';

type Data = Record<string, unknown>;

export function authorityRef(db: Firestore, authorityId: string): DocumentReference {
  return db.collection('authorities').doc(authorityId);
}

export function crmPrivateRefAdmin(db: Firestore, authorityId: string): DocumentReference {
  return authorityRef(db, authorityId).collection(CRM_PRIVATE_SUBCOLLECTION).doc(CRM_PRIVATE_DOC_ID);
}

/** Main doc merged with its private CRM doc, or null when the authority does not exist. */
export async function readAuthorityWithCrm(db: Firestore, authorityId: string): Promise<Data | null> {
  const [main, priv] = await Promise.all([
    authorityRef(db, authorityId).get(),
    crmPrivateRefAdmin(db, authorityId).get(),
  ]);
  if (!main.exists) return null;
  return mergeCrmFields((main.data() ?? {}) as Data, priv.exists ? ((priv.data() ?? {}) as Data) : null);
}

/** authorities/{authorityId}/crm_private/main → authorityId (null for any other path). */
export function authorityIdOfCrmDoc(snap: QueryDocumentSnapshot): string | null {
  if (snap.id !== CRM_PRIVATE_DOC_ID) return null;
  const parentDoc = snap.ref.parent.parent;
  return parentDoc && parentDoc.parent.id === 'authorities' ? parentDoc.id : null;
}

/** Every private CRM doc in one collection-group read, keyed by authority id. */
export async function readAllCrmPrivateAdmin(db: Firestore): Promise<Map<string, Data>> {
  const snap = await db.collectionGroup(CRM_PRIVATE_SUBCOLLECTION).get();
  const out = new Map<string, Data>();
  for (const d of snap.docs) {
    const id = authorityIdOfCrmDoc(d);
    if (id) out.set(id, (d.data() ?? {}) as Data);
  }
  return out;
}

/**
 * Write CRM fields (full values) to crm_private/main and any public fields to
 * the main doc, atomically. The main doc's updatedAt is always bumped.
 */
export async function writeAuthorityCrm(
  db: Firestore,
  authorityId: string,
  crmFields: Partial<Record<AuthorityCrmField, unknown>>,
  publicFields: Data = {},
): Promise<void> {
  const batch = db.batch();
  if (Object.keys(crmFields).length > 0) {
    batch.set(crmPrivateRefAdmin(db, authorityId), crmFields, { merge: true });
  }
  batch.update(authorityRef(db, authorityId), { ...publicFields, updatedAt: FieldValue.serverTimestamp() });
  await batch.commit();
}

/**
 * Append items to a CRM array field (replaces FieldValue.arrayUnion on the
 * main doc). Runs in a transaction on the merged view, so before the
 * migration the private copy starts from the legacy entries instead of
 * hiding them. Throws when the authority does not exist (like update() did).
 */
export async function appendAuthorityCrmArray(
  db: Firestore,
  authorityId: string,
  field: Exclude<AuthorityCrmField, 'financials'>,
  items: unknown[],
  publicFields: Data = {},
): Promise<void> {
  if (items.length === 0 && Object.keys(publicFields).length === 0) return;
  const mainRef = authorityRef(db, authorityId);
  const privRef = crmPrivateRefAdmin(db, authorityId);
  await db.runTransaction(async (tx) => {
    const [main, priv] = await tx.getAll(mainRef, privRef);
    if (!main.exists) throw new Error(`Authority ${authorityId} not found`);
    const merged = mergeCrmFields((main.data() ?? {}) as Data, priv.exists ? ((priv.data() ?? {}) as Data) : null);
    const current = Array.isArray(merged[field]) ? (merged[field] as unknown[]) : [];
    if (items.length > 0) tx.set(privRef, { [field]: [...current, ...items] }, { merge: true });
    tx.update(mainRef, { ...publicFields, updatedAt: FieldValue.serverTimestamp() });
  });
}
