/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * An in-memory Admin-SDK stand-in that reproduces Firestore's READ-TIME type coercion (axiom
 * §31): every Date, Timestamp or serverTimestamp() written comes back as a Timestamp-shaped
 * value — `.toDate()` / `.toMillis()` present, `.getTime()` deliberately ABSENT — so a reader
 * that treats a stored time as a JS Date fails here exactly as it would in production.
 *
 * Use with:  vi.mock('firebase-admin/firestore', () => firestoreModuleMock)
 * Supports: collection(path).doc(id).{get,set(merge),update} (+ nested .collection()),
 * collection().orderBy(f, dir).limit(n).get(), batch().{set,update,commit},
 * runTransaction(tx.{get,set,update}), getAll. Synthetic data only.
 */
export class FakeTimestamp {
  constructor(private readonly ms: number) {}
  static fromMillis(ms: number) {
    return new FakeTimestamp(ms);
  }
  static fromDate(d: Date) {
    return new FakeTimestamp(d.getTime());
  }
  static now() {
    return new FakeTimestamp(Date.now());
  }
  toMillis() {
    return this.ms;
  }
  toDate() {
    return new Date(this.ms);
  }
}

const INC = Symbol('inc');
const SERVER_TS = Symbol('serverTimestamp');

export const firestoreModuleMock = {
  FieldValue: {
    increment: (n: number) => ({ [INC]: n }),
    serverTimestamp: () => ({ [SERVER_TS]: true }),
  },
  Timestamp: FakeTimestamp,
};

type Data = Record<string, any>;

function resolve(prev: any, next: any, nowMs: number): any {
  if (next && typeof next === 'object' && INC in next) return (typeof prev === 'number' ? prev : 0) + next[INC];
  if (next && typeof next === 'object' && SERVER_TS in next) return new FakeTimestamp(nowMs);
  if (next instanceof Date) return new FakeTimestamp(next.getTime());
  if (next instanceof FakeTimestamp) return next;
  if (Array.isArray(next)) return next.map((x) => resolve(undefined, x, nowMs));
  if (next && typeof next === 'object') {
    const base = prev && typeof prev === 'object' && !(prev instanceof FakeTimestamp) && !Array.isArray(prev) ? { ...prev } : {};
    for (const [k, v] of Object.entries(next)) base[k] = resolve(base[k], v, nowMs);
    return base;
  }
  return next;
}

export function createTimestampShapedDb(opts: { nowMs?: number } = {}) {
  const docs = new Map<string, Data>();
  let autoId = 0;
  const nowMs = () => opts.nowMs ?? Date.now();
  const write = (path: string, data: Data, merge: boolean) => {
    docs.set(path, resolve(merge ? docs.get(path) : undefined, data, nowMs()));
  };
  const snap = (path: string) => {
    const d = docs.get(path);
    return { id: path.split('/').pop()!, exists: d !== undefined, data: () => d, ref: docRef(path) };
  };
  function docRef(path: string): any {
    return {
      id: path.split('/').pop(),
      path,
      get: async () => snap(path),
      set: async (data: Data, o?: { merge?: boolean }) => write(path, data, !!o?.merge),
      update: async (data: Data) => {
        if (!docs.has(path)) throw new Error(`no document ${path}`);
        write(path, data, true);
      },
      collection: (name: string) => collRef(`${path}/${name}`),
    };
  }
  function collRef(path: string, order?: { field: string; dir: 'asc' | 'desc' }, lim?: number): any {
    return {
      doc: (id?: string) => docRef(`${path}/${id ?? `auto${++autoId}`}`),
      orderBy: (field: string, dir: 'asc' | 'desc' = 'asc') => collRef(path, { field, dir }, lim),
      limit: (n: number) => collRef(path, order, n),
      get: async () => {
        const depth = path.split('/').length + 1;
        let rows = Array.from(docs.keys())
          .filter((k) => k.startsWith(`${path}/`) && k.split('/').length === depth)
          .map(snap);
        if (order) {
          const v = (s: any) => {
            const x = s.data()?.[order.field];
            return x instanceof FakeTimestamp ? x.toMillis() : x;
          };
          rows.sort((a, b) => (v(a) < v(b) ? -1 : v(a) > v(b) ? 1 : 0) * (order.dir === 'desc' ? -1 : 1));
        }
        if (lim !== undefined) rows = rows.slice(0, lim);
        return { docs: rows, size: rows.length, empty: rows.length === 0 };
      },
    };
  }
  const db: any = {
    docs,
    collection: (name: string) => collRef(name),
    getAll: async (...refs: any[]) => Promise.all(refs.map((r) => r.get())),
    batch: () => {
      const ops: Array<() => void> = [];
      return {
        set: (ref: any, data: Data, o?: { merge?: boolean }) => ops.push(() => write(ref.path, data, !!o?.merge)),
        update: (ref: any, data: Data) => ops.push(() => write(ref.path, data, true)),
        commit: async () => ops.forEach((op) => op()),
      };
    },
    runTransaction: async (fn: (tx: any) => Promise<any>) =>
      fn({
        get: async (ref: any) => snap(ref.path),
        set: (ref: any, data: Data, o?: { merge?: boolean }) => write(ref.path, data, !!o?.merge),
        update: (ref: any, data: Data) => write(ref.path, data, true),
      }),
  };
  return db;
}

/** True when `v` looks like what the Admin SDK returns for a stored time. */
export function isTimestampShaped(v: unknown): boolean {
  return !!v && typeof (v as any).toMillis === 'function' && typeof (v as any).toDate === 'function' && typeof (v as any).getTime !== 'function';
}
