/* eslint-disable @typescript-eslint/no-explicit-any -- test fakes */
/**
 * Tiny in-memory Admin-SDK Firestore for route/service unit tests (demo
 * world PR 2). Paths are full slash paths ('users/u1'). Supports
 * doc().get(), collection().doc().collection(), where('==' | 'in' | '>=' |
 * '<=' | 'array-contains') on dotted fields (Timestamps compared by millis),
 * chained where, limit() / orderBy() (no-ops), get(), count().get(), getAll(). Counts every read so
 * tests can pin "no extra read for a real tenant".
 */
type Data = Record<string, unknown>;

function field(data: Data | undefined, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Data)[k] : undefined), data);
}

function cmp(v: unknown): number | string {
  if (v && typeof v === 'object' && typeof (v as { toMillis?: unknown }).toMillis === 'function') return (v as { toMillis: () => number }).toMillis();
  if (v instanceof Date) return v.getTime();
  return v as number | string;
}

export function makeFakeAdminDb(seed: Record<string, Data> = {}) {
  const store = new Map<string, Data>(Object.entries(seed));
  const reads: string[] = [];

  const snapOf = (path: string) => {
    const data = store.get(path);
    return { id: path.split('/').pop()!, exists: data !== undefined, data: () => data };
  };
  const docRef = (path: string): any => ({
    id: path.split('/').pop(),
    path,
    get: async () => { reads.push(path); return snapOf(path); },
    collection: (name: string) => collRef(`${path}/${name}`),
  });
  const collRef = (path: string, filters: Array<[string, string, unknown]> = []): any => {
    const depth = path.split('/').length + 1;
    const docs = () =>
      Array.from(store.keys())
        .filter((k) => k.startsWith(`${path}/`) && k.split('/').length === depth)
        .map(snapOf)
        .filter((s) => filters.every(([f, op, v]) => {
          const x = field(s.data(), f);
          if (op === 'in') return (v as unknown[]).includes(x);
          if (op === 'array-contains') return Array.isArray(x) && x.includes(v);
          if (op === '>=') return x !== undefined && cmp(x) >= cmp(v);
          if (op === '<=') return x !== undefined && cmp(x) <= cmp(v);
          return x === v;
        }));
    return {
      doc: (id: string) => docRef(`${path}/${id}`),
      where: (f: string, op: string, v: unknown) => collRef(path, [...filters, [f, op, v]]),
      limit: () => collRef(path, filters),
      orderBy: () => collRef(path, filters),
      get: async () => { reads.push(`${path}?`); const d = docs(); return { docs: d, size: d.length, empty: !d.length, forEach: (fn: any) => d.forEach(fn) }; },
      count: () => ({ get: async () => ({ data: () => ({ count: docs().length }) }) }),
    };
  };

  const db: any = {
    doc: (path: string) => docRef(path),
    collection: (name: string) => collRef(name),
    getAll: async (...refs: any[]) => Promise.all(refs.map((r) => r.get())),
  };
  return { db, store, reads };
}
