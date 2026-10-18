/**
 * STUB of 'firebase/firestore' — READ-ONLY, OFFLINE replay of a frozen corpus.
 *
 * Reads of a collection are answered from `<corpus>/<path with / → __>.json`
 * (raw documents: `{ id, ...fields }`, timestamps as ISO strings — the shape
 * scripts/audit/dump-engine-corpus.ts writes). A collection with no file reads as
 * empty. EVERY write is a logged no-op: nothing ever leaves the process.
 *
 * Corpus dir: $HERMETIC_CORPUS_DIR, else tests/invariants/hermetic/corpus (cwd = repo root).
 * Reads/blocked writes are recorded on globalThis.__HERMETIC_FS_LOG for the runners'
 * "0 writes" assertion.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const CORPUS = process.env.HERMETIC_CORPUS_DIR || join(process.cwd(), 'tests/invariants/hermetic/corpus');
const cache: Record<string, any[]> = {};
function rows(col: string): any[] {
  if (cache[col]) return cache[col];
  const p = join(CORPUS, `${col.split('/').join('__')}.json`);
  cache[col] = existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : [];
  return cache[col];
}

export const FS_LOG: { op: string; path: string }[] = [];
(globalThis as any).__HERMETIC_FS_LOG = FS_LOG;
const log = (op: string, path: string) => { FS_LOG.push({ op, path }); };

export class Timestamp {
  constructor(public seconds: number, public nanoseconds: number) {}
  static now() { return Timestamp.fromMillis(Date.now()); }
  static fromDate(d: Date) { return Timestamp.fromMillis(d.getTime()); }
  static fromMillis(ms: number) { return new Timestamp(Math.floor(ms / 1000), (ms % 1000) * 1e6); }
  toDate() { return new Date(this.toMillis()); }
  toMillis() { return this.seconds * 1000 + Math.floor(this.nanoseconds / 1e6); }
}
export class GeoPoint { constructor(public latitude: number, public longitude: number) {} }
export class FieldPath { constructor(..._p: string[]) {} }
export class FirestoreError extends Error { code = 'unavailable'; }
export const getFirestore = () => ({ __stub: 'firestore' });
export const initializeFirestore = getFirestore;
export const persistentLocalCache = () => ({});
export const persistentMultipleTabManager = () => ({});
export const memoryLocalCache = () => ({});
export const connectFirestoreEmulator = () => {};
export const enableIndexedDbPersistence = async () => {};
export const enableNetwork = async () => {};
export const disableNetwork = async () => {};
export const terminate = async () => {};

const joinPath = (parts: any[]) => parts.filter(p => typeof p === 'string').join('/');
export function collection(base: any, ...segs: string[]) {
  return { type: 'collection', path: joinPath(base && base.path ? [base.path, ...segs] : segs) };
}
export const collectionGroup = (_db: any, id: string) => ({ type: 'collection', path: id });
export function doc(a: any, ...segs: string[]) {
  const parts = a && a.path ? [a.path, ...segs] : segs;
  if (a && a.type === 'collection' && segs.length === 0) parts.push(`stub_${Math.floor(Math.random() * 1e9)}`);
  const path = joinPath(parts);
  return { type: 'doc', path, id: path.split('/').pop() };
}
export const where = (field: any, op: string, value: any) => ({ kind: 'where', field: String(field), op, value });
export const orderBy = (field: any, dir = 'asc') => ({ kind: 'orderBy', field: String(field), dir });
export const limit = (n: number) => ({ kind: 'limit', n });
export const limitToLast = limit;
export const startAt = (..._a: any[]) => ({ kind: 'noop' });
export const startAfter = startAt; export const endAt = startAt; export const endBefore = startAt;
export const documentId = () => '__name__';
export const and = (...c: any[]) => ({ kind: 'noop', c }); export const or = and;
export function query(ref: any, ...cons: any[]) { return { ...ref, type: 'query', cons: [...(ref.cons ?? []), ...cons] }; }

const get = (o: any, f: string) => f.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
function match(r: any, c: any) {
  const v = c.field === '__name__' ? r.id : get(r, c.field);
  switch (c.op) {
    case '==': return v === c.value;
    case '!=': return v !== c.value;
    case 'in': return c.value.includes(v);
    case 'not-in': return !c.value.includes(v);
    case 'array-contains': return Array.isArray(v) && v.includes(c.value);
    case 'array-contains-any': return Array.isArray(v) && v.some((x: any) => c.value.includes(x));
    case '>=': return v >= c.value; case '<=': return v <= c.value;
    case '>': return v > c.value; case '<': return v < c.value;
    default: return true;
  }
}
const snapOf = (r: any, path: string) => ({
  id: r?.id ?? path.split('/').pop(), ref: { path, id: path.split('/').pop() },
  exists: () => !!r, data: () => (r ? (({ id: _id, ...d }) => d)(r) : undefined),
  get: (f: string) => (r ? get(r, f) : undefined), metadata: { fromCache: false, hasPendingWrites: false },
});
export async function getDocs(q: any) {
  log('read', q.path);
  let out = q.path.split('/').length % 2 === 1 ? [...rows(q.path)] : [];
  for (const c of q.cons ?? []) if (c.kind === 'where') out = out.filter(r => match(r, c));
  for (const c of [...(q.cons ?? [])].reverse()) if (c.kind === 'orderBy') {
    const s = c.dir === 'desc' ? -1 : 1;
    out.sort((a, b) => { const x = get(a, c.field), y = get(b, c.field); return x === y ? 0 : x == null ? 1 : y == null ? -1 : x < y ? -s : s; });
  }
  const lim = (q.cons ?? []).find((c: any) => c.kind === 'limit');
  if (lim) out = out.slice(0, lim.n);
  const docs = out.map(r => snapOf(r, `${q.path}/${r.id}`));
  return { docs, empty: docs.length === 0, size: docs.length, forEach: (fn: any) => docs.forEach(fn), docChanges: () => [], metadata: { fromCache: false } };
}
export const getDocsFromServer = getDocs; export const getDocsFromCache = getDocs;
export async function getDoc(ref: any) {
  log('read', ref.path);
  const segs = ref.path.split('/');
  const r = segs.length % 2 === 0 ? rows(segs.slice(0, -1).join('/')).find(x => x.id === segs[segs.length - 1]) : undefined;
  return snapOf(r, ref.path);
}
export const getDocFromServer = getDoc; export const getDocFromCache = getDoc;
export async function getCountFromServer(q: any) { const s = await getDocs(q); return { data: () => ({ count: s.size }) }; }
export async function getAggregateFromServer(q: any) { const s = await getDocs(q); return { data: () => ({ count: s.size }) }; }
export const count = () => ({}); export const sum = () => ({}); export const average = () => ({});
export function onSnapshot(_r: any, ..._a: any[]) { return () => {}; }
// ── WRITES: logged no-ops ───────────────────────────────────────────────
export async function setDoc(ref: any) { log('WRITE(set) BLOCKED', ref.path); }
export async function updateDoc(ref: any) { log('WRITE(update) BLOCKED', ref.path); }
export async function deleteDoc(ref: any) { log('WRITE(delete) BLOCKED', ref.path); }
export async function addDoc(ref: any) { log('WRITE(add) BLOCKED', ref.path); return { id: 'stub', path: `${ref.path}/stub` }; }
export function writeBatch() {
  return {
    set: (r: any) => log('WRITE(batch.set) BLOCKED', r.path), update: (r: any) => log('WRITE(batch.update) BLOCKED', r.path),
    delete: (r: any) => log('WRITE(batch.delete) BLOCKED', r.path), commit: async () => {},
  };
}
export async function runTransaction(_db: any, fn: any) {
  log('WRITE(tx) BLOCKED', '?');
  return fn({ get: getDoc, set: (r: any) => log('WRITE(tx.set) BLOCKED', r.path), update: (r: any) => log('WRITE(tx.update) BLOCKED', r.path), delete: () => {} });
}
export const serverTimestamp = () => Timestamp.now();
export const increment = (n: number) => n;
export const arrayUnion = (...a: any[]) => a; export const arrayRemove = (...a: any[]) => a;
export const deleteField = () => undefined;
export type Firestore = any; export type DocumentData = any; export type QueryConstraint = any; export type Query<T = any> = T;
export type Unsubscribe = () => void; export type WriteBatch = any; export type FieldValue = any; export type QueryFieldFilterConstraint = any;
export type DocumentReference<T = any> = T; export type DocumentSnapshot<T = any> = T; export type QuerySnapshot<T = any> = T;
export type CollectionReference<T = any> = T; export type QueryDocumentSnapshot<T = any> = T; export type SetOptions = any;
export type Transaction = any; export type UpdateData<T = any> = T; export type WithFieldValue<T = any> = T; export type QueryConstraintType = any;
export type SnapshotOptions = any; export type FirestoreDataConverter<T = any> = T; export type OrderByDirection = 'asc' | 'desc'; export type WhereFilterOp = string;
