/**
 * Client (web SDK) access to authorities/{id}/crm_private/main.
 * See ./authority-crm.ts for the read/write contract.
 *
 * Only isAdmin() may read these docs. For everyone else a denied read is
 * the expected answer and resolves to "no CRM data" — it never throws.
 */
import {
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  type DocumentReference,
  type Firestore,
  type QueryDocumentSnapshot,
  type WriteBatch,
} from 'firebase/firestore';
import { CRM_PRIVATE_DOC_ID, CRM_PRIVATE_SUBCOLLECTION, type AuthorityCrmField } from './authority-crm';

type Data = Record<string, unknown>;

export function crmPrivateRef(db: Firestore, authorityId: string): DocumentReference {
  return doc(db, 'authorities', authorityId, CRM_PRIVATE_SUBCOLLECTION, CRM_PRIVATE_DOC_ID);
}

function isPermissionDenied(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === 'permission-denied';
}

function warnUnlessDenied(where: string, err: unknown) {
  if (!isPermissionDenied(err)) console.warn(`[authority-crm] ${where} failed`, err);
}

/** authorities/{authorityId}/crm_private/main → authorityId (null for any other path). */
function authorityIdOf(snap: QueryDocumentSnapshot): string | null {
  if (snap.id !== CRM_PRIVATE_DOC_ID) return null;
  const parentDoc = snap.ref.parent.parent;
  return parentDoc && parentDoc.parent.id === 'authorities' ? parentDoc.id : null;
}

function toMap(docs: QueryDocumentSnapshot[]): Map<string, Data> {
  const out = new Map<string, Data>();
  for (const d of docs) {
    const id = authorityIdOf(d);
    if (id) out.set(id, d.data() as Data);
  }
  return out;
}

/** One authority's private CRM doc, or null (missing / not an admin / read failed). */
export async function readCrmPrivate(db: Firestore, authorityId: string): Promise<Data | null> {
  try {
    const snap = await getDoc(crmPrivateRef(db, authorityId));
    return snap.exists() ? (snap.data() as Data) : null;
  } catch (err) {
    warnUnlessDenied('readCrmPrivate', err);
    return null;
  }
}

/** Every authority's private CRM doc in ONE collection-group read, keyed by authority id. Empty for non-admins. */
export async function readAllCrmPrivate(db: Firestore): Promise<Map<string, Data>> {
  try {
    const snap = await getDocs(collectionGroup(db, CRM_PRIVATE_SUBCOLLECTION));
    return toMap(snap.docs);
  } catch (err) {
    warnUnlessDenied('readAllCrmPrivate', err);
    return new Map();
  }
}

/** Live version of readAllCrmPrivate. A denied listener reports an empty map once and stops. */
export function subscribeAllCrmPrivate(db: Firestore, onChange: (byAuthority: Map<string, Data>) => void): () => void {
  return onSnapshot(
    collectionGroup(db, CRM_PRIVATE_SUBCOLLECTION),
    (snap) => onChange(toMap(snap.docs)),
    (err) => {
      warnUnlessDenied('subscribeAllCrmPrivate', err);
      onChange(new Map());
    },
  );
}

/** Queue a merge-write of CRM fields (full values) into crm_private/main on a batch. */
export function setCrmFieldsInBatch(
  batch: WriteBatch,
  db: Firestore,
  authorityId: string,
  fields: Partial<Record<AuthorityCrmField, unknown>>,
): void {
  batch.set(crmPrivateRef(db, authorityId), fields, { merge: true });
}
