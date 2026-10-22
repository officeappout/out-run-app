/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * A tiny in-memory stand-in for the Admin SDK query surface the admin-analytics functions use:
 * collection().where(f, '=='|'in'|'>=', v)….select().orderBy().limit().get() / .count().get(),
 * doc().get(), getAll(). Field paths may be dotted. Dates compare by time. Synthetic data only.
 */
type Data = Record<string, unknown>;

function field(d: Data, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Data)[k] : undefined), d);
}
const cmp = (v: unknown) => (v instanceof Date ? v.getTime() : v);

export function createFakeDb(collections: Record<string, Record<string, Data>>, opts: { failCollections?: Set<string> } = {}) {
  const query = (name: string, filters: Array<(d: Data) => boolean> = [], lim?: number) => {
    const run = () => {
      if (opts.failCollections?.has(name)) throw new Error(`simulated failure: ${name}`);
      const rows = Object.entries(collections[name] ?? {}).filter(([, d]) => filters.every((f) => f(d)));
      const sliced = lim ? rows.slice(0, lim) : rows;
      return sliced.map(([id, d]) => ({ id, data: () => d, exists: true }));
    };
    const q = {
      where: (f: string, op: string, v: unknown) =>
        query(name, [
          ...filters,
          (d: Data) => {
            const x = cmp(field(d, f));
            if (op === '==') return x === cmp(v);
            if (op === 'in') return Array.isArray(v) && v.includes(x);
            if (op === '>=') return (x as number) >= (cmp(v) as number);
            throw new Error(`op ${op} not supported`);
          },
        ], lim),
      select: () => q,
      orderBy: () => q,
      limit: (n: number) => query(name, filters, n),
      get: async () => {
        const docs = run();
        return { docs, size: docs.length, empty: docs.length === 0 };
      },
      count: () => ({ get: async () => ({ data: () => ({ count: run().length }) }) }),
      doc: (id: string) => ({
        id,
        get: async () => {
          if (opts.failCollections?.has(name)) throw new Error(`simulated failure: ${name}`);
          const d = collections[name]?.[id];
          return { id, exists: d !== undefined, data: () => d };
        },
      }),
    };
    return q;
  };
  return {
    collection: (name: string) => query(name),
    getAll: async (...refs: Array<{ get: () => Promise<unknown> }>) => Promise.all(refs.map((r) => r.get())),
  } as any;
}
