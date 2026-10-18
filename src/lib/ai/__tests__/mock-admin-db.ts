/**
 * Minimal in-memory stand-in for the Admin SDK Firestore surface src/lib/ai/ uses:
 * collection().doc().get(), batch().set(merge)+commit(), runTransaction(get/set).
 * FieldValue is mocked by the tests as { __inc: n } / { __ts: true } markers, which
 * applyMerge() resolves the way Firestore would. Synthetic data only.
 */

type Data = Record<string, unknown>;

function isPlainObject(v: unknown): v is Data {
  return typeof v === 'object' && v !== null && !Array.isArray(v) && !(v instanceof Date);
}

function resolveValue(prev: unknown, next: unknown): unknown {
  if (isPlainObject(next) && '__inc' in next) {
    return (typeof prev === 'number' ? prev : 0) + (next.__inc as number);
  }
  if (isPlainObject(next) && '__ts' in next) return new Date(0);
  if (isPlainObject(next)) return applyMerge(isPlainObject(prev) ? prev : {}, next);
  return next;
}

export function applyMerge(prev: Data, next: Data): Data {
  const out: Data = { ...prev };
  for (const [k, v] of Object.entries(next)) out[k] = resolveValue(prev[k], v);
  return out;
}

export interface MockDbOptions {
  /** Paths ('collection/doc') whose get() rejects. */
  failGets?: Set<string>;
  failTransactions?: boolean;
  failBatch?: boolean;
}

export function createMockDb(seed: Record<string, Data> = {}, opts: MockDbOptions = {}) {
  const docs = new Map<string, Data>(Object.entries(seed));

  const ref = (path: string) => ({
    __path: path,
    get: async () => {
      if (opts.failGets?.has(path)) throw new Error(`simulated read failure: ${path}`);
      const data = docs.get(path);
      return { exists: data !== undefined, data: () => data };
    },
  });

  const db = {
    docs,
    collection: (name: string) => ({
      doc: (id: string) => ref(`${name}/${id}`),
    }),
    batch: () => {
      const ops: Array<{ path: string; data: Data; merge: boolean }> = [];
      return {
        set: (r: { __path: string }, data: Data, o?: { merge?: boolean }) => {
          ops.push({ path: r.__path, data, merge: !!o?.merge });
        },
        commit: async () => {
          if (opts.failBatch) throw new Error('simulated batch failure');
          for (const op of ops) {
            const prev = op.merge ? (docs.get(op.path) ?? {}) : {};
            docs.set(op.path, applyMerge(prev, op.data));
          }
        },
      };
    },
    runTransaction: async <T>(fn: (tx: any) => Promise<T>): Promise<T> => {
      if (opts.failTransactions) throw new Error('simulated transaction failure');
      const tx = {
        get: async (r: { __path: string }) => {
          const data = docs.get(r.__path);
          return { exists: data !== undefined, data: () => data };
        },
        set: (r: { __path: string }, data: Data) => {
          docs.set(r.__path, data);
        },
      };
      return fn(tx);
    },
  };
  return db;
}

export const fieldValueMock = {
  increment: (n: number) => ({ __inc: n }),
  serverTimestamp: () => ({ __ts: true }),
};
