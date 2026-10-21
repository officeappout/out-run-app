/**
 * Minimal in-memory Firestore for trigger tests (demo world guards, 20.10.2026).
 * Paths are full slash paths ('community_groups/g/members/u'). Supports doc
 * get/set(merge)/update/delete, collection get / where('==') / count, batch,
 * runTransaction, getAll and the FieldValue sentinels the guarded triggers use.
 * Use from a vi.mock factory:
 *   vi.mock('firebase-admin', async () => (await import('./helpers/fake-firestore')).fakeAdminModule());
 */
export const store = new Map<string, Record<string, any>>();

export interface SentMessage {
  tokens: string[];
  notification?: { title?: string; body?: string };
  data?: Record<string, string>;
}
/** Every FCM multicast the code under test sent (clear it in beforeEach). */
export const sentMessages: SentMessage[] = [];

type Sentinel = { __fv: 'serverTimestamp' | 'delete' | 'arrayUnion' | 'arrayRemove' | 'increment'; items?: unknown[]; n?: number };

function applyValue(cur: any, v: any): any {
  if (v && typeof v === 'object' && '__fv' in v) {
    const s = v as Sentinel;
    if (s.__fv === 'serverTimestamp') return { __ts: true };
    if (s.__fv === 'increment') return (typeof cur === 'number' ? cur : 0) + (s.n ?? 0);
    if (s.__fv === 'arrayUnion') return Array.from(new Set([...(Array.isArray(cur) ? cur : []), ...(s.items ?? [])]));
    if (s.__fv === 'arrayRemove') return (Array.isArray(cur) ? cur : []).filter((x: unknown) => !(s.items ?? []).includes(x));
  }
  if (v && typeof v === 'object' && !Array.isArray(v) && !('__fv' in v)) {
    const base = cur && typeof cur === 'object' && !Array.isArray(cur) ? { ...cur } : {};
    for (const [k, x] of Object.entries(v)) {
      if (x && typeof x === 'object' && (x as Sentinel).__fv === 'delete') delete base[k];
      else base[k] = applyValue(base[k], x);
    }
    return base;
  }
  return v;
}

function write(path: string, data: Record<string, any>, merge: boolean) {
  const cur = merge ? store.get(path) : undefined;
  store.set(path, applyValue(cur ?? {}, data));
}

function snapOf(path: string) {
  const data = store.get(path);
  const id = path.split('/').pop()!;
  return { id, exists: data !== undefined, data: () => data, ref: docRef(path) };
}

export function docRef(path: string): any {
  return {
    id: path.split('/').pop(),
    path,
    get: async () => snapOf(path),
    set: async (data: Record<string, any>, opts?: { merge?: boolean }) => write(path, data, !!opts?.merge),
    update: async (data: Record<string, any>) => {
      if (!store.has(path)) throw new Error(`NOT_FOUND ${path}`);
      write(path, data, true);
    },
    delete: async () => { store.delete(path); },
    create: async (data: Record<string, any>) => {
      if (store.has(path)) throw Object.assign(new Error(`ALREADY_EXISTS ${path}`), { code: 6 });
      write(path, data, false);
    },
    collection: (name: string) => collectionRef(`${path}/${name}`),
  };
}

type Filter = [string, string, unknown];

function fieldOf(data: Record<string, any> | undefined, dotted: string): unknown {
  return dotted.split('.').reduce<any>((o, k) => (o == null ? undefined : o[k]), data);
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function cmp(a: any, b: any): number {
  const av = a && typeof a.toMillis === 'function' ? a.toMillis() : a instanceof Date ? a.getTime() : a;
  const bv = b && typeof b.toMillis === 'function' ? b.toMillis() : b instanceof Date ? b.getTime() : b;
  return av < bv ? -1 : av > bv ? 1 : 0;
}

function matches(data: Record<string, any> | undefined, [field, op, value]: Filter): boolean {
  const v = fieldOf(data, field) as any;
  switch (op) {
    case '==': return v === value;
    case '!=': return v !== undefined && v !== value;
    case 'array-contains': return Array.isArray(v) && v.some((x) => deepEqual(x, value));
    case 'in': return Array.isArray(value) && value.includes(v);
    default:
      if (v === undefined || v === null) return false;
      if (op === '>=') return cmp(v, value) >= 0;
      if (op === '<=') return cmp(v, value) <= 0;
      if (op === '>') return cmp(v, value) > 0;
      if (op === '<') return cmp(v, value) < 0;
      return false;
  }
}

interface QueryState {
  filters: Filter[];
  order?: { field: string; desc: boolean };
  limit?: number;
  afterId?: string;
}

/**
 * Collection / query. 21.10.2026: where() supports ==, !=, <, <=, >, >=,
 * array-contains (deep-equal maps) and in, on dotted paths; orderBy / limit /
 * startAfter(<doc snapshot or id>) / select page like Firestore (doc-id order
 * without orderBy).
 */
function collectionRef(path: string, q: QueryState = { filters: [] }): any {
  const depth = path.split('/').length + 1;
  const docs = () => {
    let all = Array.from(store.keys())
      .filter((k) => k.startsWith(`${path}/`) && k.split('/').length === depth)
      .map(snapOf)
      .filter((s) => q.filters.every((f) => matches(s.data(), f)));
    all = q.order
      ? all.sort((a, b) => cmp(fieldOf(a.data(), q.order!.field), fieldOf(b.data(), q.order!.field)) * (q.order!.desc ? -1 : 1))
      : all.sort((a, b) => a.id.localeCompare(b.id));
    if (q.afterId !== undefined) all = all.slice(all.findIndex((s) => s.id === q.afterId) + 1);
    return q.limit !== undefined ? all.slice(0, q.limit) : all;
  };
  const next = (patch: Partial<QueryState>) => collectionRef(path, { ...q, ...patch });
  return {
    doc: (id: string) => docRef(`${path}/${id}`),
    where: (field: string, op: string, value: unknown) => next({ filters: [...q.filters, [field, op, value]] }),
    orderBy: (field: string, dir?: string) => next({ order: { field, desc: dir === 'desc' } }),
    limit: (n: number) => next({ limit: n }),
    startAfter: (cursor: any) => next({ afterId: typeof cursor === 'string' ? cursor : cursor?.id }),
    select: () => next({}),
    get: async () => { const d = docs(); return { docs: d, size: d.length, empty: d.length === 0, forEach: (fn: any) => d.forEach(fn) }; },
    count: () => ({ get: async () => ({ data: () => ({ count: docs().length }) }) }),
  };
}

export const fakeDb = {
  doc: (path: string) => docRef(path),
  collection: (name: string) => collectionRef(name),
  getAll: async (...refs: any[]) => Promise.all(refs.map((r) => r.get())),
  batch: () => {
    const ops: Array<() => Promise<void>> = [];
    return {
      set: (ref: any, data: any, opts?: any) => { ops.push(() => ref.set(data, opts)); },
      update: (ref: any, data: any) => { ops.push(() => ref.update(data)); },
      delete: (ref: any) => { ops.push(() => ref.delete()); },
      commit: async () => { for (const op of ops) await op(); },
    };
  },
  runTransaction: async (cb: (tx: any) => Promise<unknown>) =>
    cb({ get: (ref: any) => ref.get(), set: (ref: any, d: any, o?: any) => ref.set(d, o), update: (ref: any, d: any) => ref.update(d) }),
};

export function fakeAdminModule() {
  const firestore: any = () => fakeDb;
  firestore.FieldPath = { documentId: () => '__name__' };
  firestore.Timestamp = { fromMillis: (ms: number) => ({ toMillis: () => ms }) };
  firestore.FieldValue = {
    serverTimestamp: (): Sentinel => ({ __fv: 'serverTimestamp' }),
    delete: (): Sentinel => ({ __fv: 'delete' }),
    arrayUnion: (...items: unknown[]): Sentinel => ({ __fv: 'arrayUnion', items }),
    arrayRemove: (...items: unknown[]): Sentinel => ({ __fv: 'arrayRemove', items }),
    increment: (n: number): Sentinel => ({ __fv: 'increment', n }),
  };
  const messaging = () => ({
    sendEachForMulticast: async (msg: { tokens: string[] }) => {
      sentMessages.push(msg as SentMessage);
      return { responses: msg.tokens.map(() => ({ success: true })) };
    },
  });
  return { apps: [{}], initializeApp: () => {}, firestore, messaging };
}

/** Event for an unwrapped onDocumentWritten / onDocumentCreated handler. */
export function writtenEvent(params: Record<string, string>, before?: Record<string, any> | null, after?: Record<string, any> | null) {
  const s = (d?: Record<string, any> | null) => ({ exists: !!d, data: () => d ?? undefined });
  return { params, data: { before: s(before), after: s(after), data: () => after ?? undefined } };
}
