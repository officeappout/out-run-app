/**
 * A tiny in-memory Admin SDK fake for the generation-review server tests: doc get / set /
 * update (dotted paths, increment, arrayUnion), transactions, batches, and the one query shape
 * the run uses (where == … orderBy … limit). Synthetic data only.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export const store = new Map<string, Record<string, any>>();

function setPath(obj: Record<string, any>, key: string, v: any) {
  const parts = key.split('.');
  let cur = obj;
  for (const p of parts.slice(0, -1)) cur = (cur[p] = { ...(cur[p] ?? {}) });
  const last = parts[parts.length - 1];
  if (v && typeof v === 'object' && '__inc' in v) cur[last] = (cur[last] ?? 0) + v.__inc;
  else if (v && typeof v === 'object' && '__union' in v) cur[last] = [...(cur[last] ?? []), ...v.__union];
  else cur[last] = v;
}

function mergeDeep(target: Record<string, any>, data: Record<string, any>) {
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && !('__inc' in v) && !('__union' in v) && !('__ms' in v) && !('__ts' in v)) {
      target[k] = mergeDeep({ ...(target[k] ?? {}) }, v);
    } else setPath(target, k, v);
  }
  return target;
}

export function write(path: string, data: Record<string, any>, mode: 'set' | 'merge' | 'update') {
  if (mode === 'update') {
    const cur = { ...(store.get(path) ?? {}) };
    for (const [k, v] of Object.entries(data)) setPath(cur, k, v);
    store.set(path, cur);
    return;
  }
  store.set(path, mode === 'merge' ? mergeDeep({ ...(store.get(path) ?? {}) }, data) : mergeDeep({}, data));
}

const snapOf = (path: string) => {
  const d = store.get(path);
  return { id: path.split('/').pop()!, exists: d !== undefined, data: () => d, ref: ref(path) };
};

export const ref = (path: string): any => ({
  id: path.split('/').pop(),
  __path: path,
  get: async () => snapOf(path),
  set: async (d: any, o?: { merge?: boolean }) => write(path, d, o?.merge ? 'merge' : 'set'),
  update: async (d: any) => write(path, d, 'update'),
});

const query = (path: string, filters: Array<[string, any]>, order: string | null, lim: number): any => ({
  where: (f: string, _op: string, v: any) => query(path, [...filters, [f, v]], order, lim),
  orderBy: (f: string) => query(path, filters, f, lim),
  limit: (n: number) => query(path, filters, order, n),
  get: async () => {
    let docs = Array.from(store.entries())
      .filter(([p]) => p.startsWith(`${path}/`) && !p.slice(path.length + 1).includes('/'))
      .filter(([, d]) => filters.every(([f, v]) => d[f] === v));
    if (order) docs = docs.sort((a, b) => (a[1][order]?.__ms ?? 0) - (b[1][order]?.__ms ?? 0));
    docs = docs.slice(0, lim);
    const out = docs.map(([p]) => snapOf(p));
    return { size: out.length, docs: out };
  },
});

export const col = (path: string): any => ({ doc: (id: string) => ref(`${path}/${id}`), ...query(path, [], null, 1e9) });

export const db: any = {
  collection: col,
  getAll: async (...refs: any[]) => refs.map((r) => snapOf(r.__path)),
  runTransaction: async (fn: (tx: any) => Promise<unknown>) =>
    fn({
      get: (r: any) => r.get(),
      set: (r: any, d: any, o?: any) => write(r.__path, d, o?.merge ? 'merge' : 'set'),
      update: (r: any, d: any) => write(r.__path, d, 'update'),
    }),
  batch: () => {
    const ops: Array<() => void> = [];
    return {
      set: (r: any, d: any, o?: any) => ops.push(() => write(r.__path, d, o?.merge ? 'merge' : 'set')),
      update: (r: any, d: any) => ops.push(() => write(r.__path, d, 'update')),
      commit: async () => ops.forEach((o) => o()),
    };
  },
};

export const firestoreMock = {
  Timestamp: { fromMillis: (ms: number) => ({ __ms: ms, toMillis: () => ms }) },
  FieldValue: {
    increment: (n: number) => ({ __inc: n }),
    serverTimestamp: () => ({ __ts: true }),
    arrayUnion: (...v: any[]) => ({ __union: v }),
    delete: () => undefined,
  },
};
