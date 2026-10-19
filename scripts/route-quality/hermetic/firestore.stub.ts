/**
 * 'firebase/firestore' stub for the route-quality measurement runner —
 * the shared hermetic stub (tests/invariants/hermetic/firestore.stub.ts)
 * plus REAL orderBy/startAt/endAt/limit semantics, so the generator's
 * geohash range queries return what production would, and a per-query
 * document counter (= Firestore reads billed). Read-only, offline corpus.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
export * from '../../../tests/invariants/hermetic/firestore.stub';

const CORPUS = process.env.HERMETIC_CORPUS_DIR || join(process.cwd(), 'tests/invariants/hermetic/corpus');
const cache: Record<string, any[]> = {};
function rows(col: string): any[] {
  if (cache[col]) return cache[col];
  const p = join(CORPUS, `${col.split('/').join('__')}.json`);
  cache[col] = existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : [];
  return cache[col];
}

export const READS = { docs: 0, queries: 0 };
(globalThis as any).__RQ_READS = READS;

export const startAt = (v: any) => ({ kind: 'startAt', v });
export const endAt = (v: any) => ({ kind: 'endAt', v });
export const startAfter = (v: any) => ({ kind: 'startAfter', v });
export const endBefore = (v: any) => ({ kind: 'endBefore', v });

const get = (o: any, f: string) => f.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
function match(r: any, c: any) {
  const v = get(r, c.field);
  switch (c.op) {
    case '==': return v === c.value;
    case '!=': return v !== c.value;
    case 'in': return c.value.includes(v);
    case '>=': return v >= c.value; case '<=': return v <= c.value;
    case '>': return v > c.value; case '<': return v < c.value;
    default: return true;
  }
}

export async function getDocs(q: any) {
  READS.queries++;
  let out = [...rows(q.path)];
  const cons: any[] = q.cons ?? [];
  for (const c of cons) if (c.kind === 'where') out = out.filter(r => match(r, c));
  const ob = cons.find(c => c.kind === 'orderBy');
  if (ob) {
    out = out.filter(r => get(r, ob.field) != null);
    out.sort((a, b) => (get(a, ob.field) < get(b, ob.field) ? -1 : get(a, ob.field) > get(b, ob.field) ? 1 : 0) * (ob.dir === 'desc' ? -1 : 1));
    for (const c of cons) {
      const v = (r: any) => get(r, ob.field);
      if (c.kind === 'startAt') out = out.filter(r => v(r) >= c.v);
      if (c.kind === 'startAfter') out = out.filter(r => v(r) > c.v);
      if (c.kind === 'endAt') out = out.filter(r => v(r) <= c.v);
      if (c.kind === 'endBefore') out = out.filter(r => v(r) < c.v);
    }
  }
  const lim = cons.find(c => c.kind === 'limit');
  if (lim) out = out.slice(0, lim.n);
  READS.docs += Math.max(1, out.length); // an empty query is billed as one read
  const docs = out.map(r => ({ id: r.id, data: () => (({ id: _id, ...d }) => d)(r), exists: () => true }));
  return { docs, size: docs.length, empty: docs.length === 0, forEach: (fn: any) => docs.forEach(fn) };
}
