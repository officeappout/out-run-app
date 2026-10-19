/**
 * site_content + content_suggestions — Admin SDK reads / writes (the API routes and Kelly's
 * help priming). Server only; firestore.rules lets no client write either collection.
 */
import 'server-only';
import { FieldValue, type Firestore, type Query } from 'firebase-admin/firestore';
import { contentItemFromDoc, type ContentInput } from './schema';
import {
  CONTENT_ITEMS_COLLECTION,
  CONTENT_SUGGESTIONS_COLLECTION,
  type ContentItem,
  type ContentLocale,
  type ContentStatus,
  type ContentSuggestion,
  type ContentType,
} from './types';

export interface ContentFilter {
  type?: ContentType;
  locale?: ContentLocale;
  status?: ContentStatus;
}

function sortItems(items: ContentItem[]): ContentItem[] {
  return items.sort((a, b) => a.type.localeCompare(b.type) || a.topic.localeCompare(b.topic) || a.order - b.order || a.id.localeCompare(b.id));
}

/** Small collection (≈ 100 docs): one read, filtered in memory — no composite indexes needed. */
export async function listContentItems(db: Firestore, f: ContentFilter = {}): Promise<ContentItem[]> {
  let q: Query = db.collection(CONTENT_ITEMS_COLLECTION);
  if (f.status) q = q.where('status', '==', f.status);
  const snap = await q.get();
  const out: ContentItem[] = [];
  for (const d of snap.docs) {
    const item = contentItemFromDoc(d.id, d.data());
    if (!item) continue;
    if (f.type && item.type !== f.type) continue;
    if (f.locale && item.locale !== f.locale) continue;
    out.push(item);
  }
  return sortItems(out);
}

export async function getContentItem(db: Firestore, id: string): Promise<ContentItem | null> {
  const snap = await db.collection(CONTENT_ITEMS_COLLECTION).doc(id).get();
  return snap.exists ? contentItemFromDoc(snap.id, snap.data()) : null;
}

/** Create or replace an item from the editor (full replace, so no seedHash survives). updatedBy = the
 *  admin → the seed never overwrites it again. */
export async function saveContentItem(db: Firestore, id: string, input: ContentInput, uid: string): Promise<void> {
  await db.collection(CONTENT_ITEMS_COLLECTION).doc(id).set({
    ...input,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: uid,
  });
}

export async function setContentStatus(db: Firestore, id: string, status: ContentStatus, uid: string): Promise<boolean> {
  const ref = db.collection(CONTENT_ITEMS_COLLECTION).doc(id);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return false;
    tx.update(ref, { status, updatedAt: FieldValue.serverTimestamp(), updatedBy: uid });
    return true;
  });
}

// ── Suggestions ("הצע להוסיף" from search with no results) ──────────────────

export async function addContentSuggestion(db: Firestore, id: string, s: { uid: string; query: string; category: string }): Promise<'created' | 'exists'> {
  const ref = db.collection(CONTENT_SUGGESTIONS_COLLECTION).doc(id);
  try {
    await ref.create({ ...s, status: 'new', createdAt: FieldValue.serverTimestamp() });
    return 'created';
  } catch (err) {
    // ALREADY_EXISTS (gRPC 6): the same user already suggested the same thing
    if ((err as { code?: number }).code === 6) return 'exists';
    throw err;
  }
}

export async function listContentSuggestions(db: Firestore, limit = 200): Promise<ContentSuggestion[]> {
  const snap = await db.collection(CONTENT_SUGGESTIONS_COLLECTION).orderBy('createdAt', 'desc').limit(limit).get();
  return snap.docs.map((d) => {
    const x = d.data() ?? {};
    const ts = x.createdAt as { toMillis?: () => number } | undefined;
    return {
      id: d.id,
      uid: typeof x.uid === 'string' ? x.uid : '',
      query: typeof x.query === 'string' ? x.query : '',
      category: typeof x.category === 'string' ? x.category : 'all',
      status: x.status === 'handled' ? 'handled' : 'new',
      createdAt: typeof ts?.toMillis === 'function' ? ts.toMillis() : 0,
    };
  });
}

export async function markSuggestionHandled(db: Firestore, id: string, handled: boolean): Promise<void> {
  await db.collection(CONTENT_SUGGESTIONS_COLLECTION).doc(id).update({ status: handled ? 'handled' : 'new' });
}
