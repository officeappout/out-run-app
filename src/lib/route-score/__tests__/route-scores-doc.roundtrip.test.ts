/**
 * axioms §31 — first write to a NEW collection (route_scores) needs a
 * write-then-read round trip against a fake that reproduces Firestore's
 * read-time coercion: a Date is stored and read back as a Timestamp-shaped
 * object (toDate/toMillis present, getTime deliberately absent).
 */
import { describe, expect, it } from 'vitest';
import { buildRouteScoreDoc, readRouteScoreDoc, writeRouteScoreDocs, ROUTE_SCORES_COLLECTION, type ScoreStoreDb } from '../route-scores-doc';
import { routeScoreInputFromDoc } from '../from-route-doc';
import { routeScore } from '../score';
import { parkHaMesilaDoc } from './fixtures';

class FakeTimestamp {
  constructor(private readonly ms: number) {}
  toDate() { return new Date(this.ms); }
  toMillis() { return this.ms; }
}

function coerce(v: unknown): unknown {
  if (v instanceof Date) return new FakeTimestamp(v.getTime());
  if (Array.isArray(v)) return v.map(coerce);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, coerce(x)]));
  return v;
}

function fakeDb(): ScoreStoreDb & { store: Map<string, Record<string, unknown>> } {
  const store = new Map<string, Record<string, unknown>>();
  return {
    store,
    collection: (name: string) => ({
      doc: (id: string) => ({
        set: async (data: Record<string, unknown>) => { store.set(`${name}/${id}`, coerce(data) as Record<string, unknown>); },
        get: async () => ({ exists: store.has(`${name}/${id}`), data: () => store.get(`${name}/${id}`) as Record<string, any> | undefined }),
      }),
    }),
  };
}

describe('route_scores round trip (axioms §31)', () => {
  it('writes through the real writer and reads back through the real reader with a real Date', async () => {
    const db = fakeDb();
    const input = routeScoreInputFromDoc('CY5KMrNMD90UAyuU3wom', parkHaMesilaDoc());
    const now = new Date('2026-10-21T10:00:00Z');
    const doc = buildRouteScoreDoc(input, routeScore(input), { decision: 'selected', reason: 'top score' }, { now });
    expect(await writeRouteScoreDocs(db, [doc])).toBe(1);

    const stored = db.store.get(`${ROUTE_SCORES_COLLECTION}/CY5KMrNMD90UAyuU3wom`)!;
    expect((stored.computedAt as any).getTime).toBeUndefined(); // the shape the Admin SDK really returns

    const back = await readRouteScoreDoc(db, 'CY5KMrNMD90UAyuU3wom');
    expect(back).not.toBeNull();
    expect(back!.computedAt).toBeInstanceOf(Date);
    expect(back!.computedAt.getTime()).toBe(now.getTime());
    expect(back).toMatchObject({ routeId: doc.routeId, score: doc.score, band: doc.band, selection: 'selected', sourceTier: 'named_place' });
    expect(back!.components.surface.max).toBe(25);
  });

  it('missing doc reads as null; a sparse stored doc reads with safe defaults', async () => {
    const db = fakeDb();
    expect(await readRouteScoreDoc(db, 'nope')).toBeNull();
    await db.collection(ROUTE_SCORES_COLLECTION).doc('sparse').set({});
    const back = await readRouteScoreDoc(db, 'sparse');
    expect(back).toMatchObject({ band: 'yellow', selection: null, sourceTier: 'unknown' });
    expect(back!.computedAt).toBeInstanceOf(Date);
  });
});
