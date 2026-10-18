/* eslint-disable */
// Offline, READ-ONLY stand-in for 'firebase/firestore' used by ai-generator-offline.test.ts
// (copied from the generator audit harness). Public collections are replayed from a REST
// dump in $OUT_GENERATOR_RAW_DIR; every write is a logged no-op; nothing leaves the process.
import { readFileSync, existsSync } from 'node:fs';
const RAW = process.env.OUT_GENERATOR_RAW_DIR ?? "";
const cache: Record<string, any[]> = {};
function rows(col: string): any[] {
  if (cache[col]) return cache[col];
  const p = `${RAW}/${col.replaceAll('/', '__')}.json`;
  cache[col] = existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : [];
  return cache[col];
}
export const FS_LOG: { op: string; path: string }[] = [];
(globalThis as any).__FS_LOG = FS_LOG;
const log = (op: string, path: string) => { FS_LOG.push({ op, path }); };

export class Timestamp {
  constructor(public seconds: number, public nanoseconds: number) {}
  static now() { return Timestamp.fromMillis(Date.now()); }
  static fromDate(d: Date) { return Timestamp.fromMillis(d.getTime()); }
  static fromMillis(ms: number) { return new Timestamp(Math.floor(ms / 1000), (ms % 1000) * 1e6); }
  toDate() { return new Date(this.toMillis()); }
  toMillis() { return this.seconds * 1000 + Math.floor(this.nanoseconds / 1e6); }
}
export class FieldPath { constructor(...p: string[]) {} }
export const getFirestore = () => ({ __stub: 'firestore' });
export const initializeFirestore = getFirestore;
export const persistentLocalCache = () => ({});
export const persistentMultipleTabManager = () => ({});
export const memoryLocalCache = () => ({});
export const connectFirestoreEmulator = () => {};

function joinPath(parts: any[]): string {
  return parts.filter(p => typeof p === 'string').join('/');
}
export function collection(_db: any, ...segs: string[]) {
  const base = _db && _db.path ? [_db.path, ...segs] : segs;
  return { type: 'collection', path: joinPath(base) };
}
export const collectionGroup = (_db: any, id: string) => ({ type: 'collection', path: id });
export function doc(a: any, ...segs: string[]) {
  const base = a && a.path ? [a.path, ...segs] : segs;
  const path = joinPath(base);
  return { type: 'doc', path, id: path.split('/').pop() };
}
export const where = (field: string, op: string, value: any) => ({ kind: 'where', field, op, value });
export const orderBy = (field: string, dir = 'asc') => ({ kind: 'orderBy', field, dir });
export const limit = (n: number) => ({ kind: 'limit', n });
export const startAt = (..._a: any[]) => ({ kind: 'noop' });
export const startAfter = startAt; export const endAt = startAt; export const endBefore = startAt;
export const documentId = () => '__name__';
export const and = (...c: any[]) => ({ kind: 'noop', c }); export const or = and;
export function query(ref: any, ...cons: any[]) { return { ...ref, type: 'query', cons: [...(ref.cons ?? []), ...cons] }; }

function get(o: any, f: string) { return f.split('.').reduce((a, k) => (a == null ? a : a[k]), o); }
function match(r: any, c: any) {
  const v = c.field === '__name__' ? r.id : get(r, c.field);
  switch (c.op) {
    case '==': return v === c.value;
    case '!=': return v !== c.value;
    case 'in': return c.value.includes(v);
    case 'array-contains': return Array.isArray(v) && v.includes(c.value);
    case 'array-contains-any': return Array.isArray(v) && v.some((x: any) => c.value.includes(x));
    case '>=': return v >= c.value; case '<=': return v <= c.value;
    case '>': return v > c.value; case '<': return v < c.value;
    default: return true;
  }
}
const snapOf = (r: any, path: string) => ({ id: r?.id ?? path.split('/').pop(), ref: { path }, exists: () => !!r, data: () => (r ? (({ id, ...d }) => d)(r) : undefined), get: (f: string) => (r ? get(r, f) : undefined) });
export async function getDocs(q: any) {
  const segs = q.path.split('/');
  log('read', q.path);
  let out = segs.length % 2 === 1 ? rows(q.path) : [];
  for (const c of q.cons ?? []) if (c.kind === 'where') out = out.filter(r => match(r, c));
  const lim = (q.cons ?? []).find((c: any) => c.kind === 'limit');
  if (lim) out = out.slice(0, lim.n);
  const docs = out.map(r => snapOf(r, `${q.path}/${r.id}`));
  return { docs, empty: docs.length === 0, size: docs.length, forEach: (fn: any) => docs.forEach(fn), docChanges: () => [] };
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
export function onSnapshot(_r: any, ..._a: any[]) { return () => {}; }
// ── WRITES: logged no-ops ───────────────────────────────────────────────
export async function setDoc(ref: any) { log('WRITE(set) BLOCKED', ref.path); }
export async function updateDoc(ref: any) { log('WRITE(update) BLOCKED', ref.path); }
export async function deleteDoc(ref: any) { log('WRITE(delete) BLOCKED', ref.path); }
export async function addDoc(ref: any) { log('WRITE(add) BLOCKED', ref.path); return { id: 'stub', path: ref.path + '/stub' }; }
export function writeBatch() { return { set: (r: any) => log('WRITE(batch.set) BLOCKED', r.path), update: (r: any) => log('WRITE(batch.update) BLOCKED', r.path), delete: (r: any) => log('WRITE(batch.delete) BLOCKED', r.path), commit: async () => {} }; }
export async function runTransaction(_db: any, fn: any) { log('WRITE(tx) BLOCKED', '?'); return fn({ get: getDoc, set: (r: any) => log('WRITE(tx.set) BLOCKED', r.path), update: (r: any) => log('WRITE(tx.update) BLOCKED', r.path), delete: () => {} }); }
export const serverTimestamp = () => Timestamp.now();
export const increment = (n: number) => n;
export const arrayUnion = (...a: any[]) => a; export const arrayRemove = (...a: any[]) => a;
export const deleteField = () => undefined;
export type Firestore = any; export type DocumentData = any; export type QueryConstraint = any; export type Query = any;
export type Unsubscribe = () => void; export type WriteBatch = any; export type FieldValue = any; export type QueryFieldFilterConstraint = any;
export type DocumentReference = any; export type DocumentSnapshot = any; export type QuerySnapshot = any; export type CollectionReference = any; export type QueryDocumentSnapshot = any;
