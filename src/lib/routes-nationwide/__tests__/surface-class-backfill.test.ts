/**
 * surfaceClass on official_routes (owner-approved 23.10.2026): schema (create + update), new
 * docs carry it from birth, the backfill plan + writer against a fake db that reproduces the
 * Admin SDK's read-time coercion (axioms §31: a stored Date reads back as a Timestamp-shaped
 * object — toDate/toMillis present, getTime absent — and every doc has an updateTime).
 */
import { describe, expect, it } from 'vitest';
import { buildValidatedDoc } from '../../route-collections';
import { SurfaceClassSchema } from '../../route-collections/schemas';
import { SURFACE_CLASSES, surfaceClassField } from '../../route-score/surface-class';
import { routeDocPayload } from '../../trail-graph/firestore-docs';
import type { TrailRoute } from '../../trail-graph/types';
import { planSurfaceClass, summarizeSurfaceClassPlans } from '../surface-class-backfill';
import { applySurfaceClassWrites, planSurfaceClassBackfill, surfaceClassPayload } from '../../../../scripts/routes-nationwide/lib/surface-class-apply.node';

// ── schema ────────────────────────────────────────────────────────────────
const KNOWN = new Set(['a1']);
const base = () => ({
  name: 'x', distance: 3, duration: 30, difficulty: 'easy', type: 'walking',
  path: [{ lat: 31, lng: 34 }, { lat: 31.001, lng: 34 }], authorityId: 'a1', city: 'עיר',
});

describe('official_routes surfaceClass schema', () => {
  it('the zod enum is pinned to the SurfaceClass union', () => {
    expect([...SurfaceClassSchema.options].sort()).toEqual([...SURFACE_CLASSES, 'unknown'].sort());
  });
  it('create: accepted with a valid class, optional when absent, bad value rejected', () => {
    for (const c of [...SURFACE_CLASSES, 'unknown']) {
      expect(buildValidatedDoc('official_routes', { ...base(), surfaceClass: c }, { mode: 'create', knownAuthorityIds: KNOWN }).surfaceClass).toBe(c);
    }
    expect('surfaceClass' in buildValidatedDoc('official_routes', base(), { mode: 'create', knownAuthorityIds: KNOWN })).toBe(false);
    expect(() => buildValidatedDoc('official_routes', { ...base(), surfaceClass: 'moderate' }, { mode: 'create', knownAuthorityIds: KNOWN })).toThrow();
    expect(() => buildValidatedDoc('official_routes', { ...base(), surfaceClass: 5 }, { mode: 'create', knownAuthorityIds: KNOWN })).toThrow();
  });
  it('update: {surfaceClass} alone is valid; bad value rejected', () => {
    const ctx = { mode: 'update' as const, knownAuthorityIds: KNOWN, existing: { authorityId: 'a1', city: 'עיר' } };
    expect(buildValidatedDoc('official_routes', { surfaceClass: 'bike_offroad' }, ctx)).toEqual({ surfaceClass: 'bike_offroad' });
    expect(() => buildValidatedDoc('official_routes', { surfaceClass: 'paved' }, ctx)).toThrow();
  });
});

describe('new docs carry the class from birth', () => {
  it('surfaceClassField: only a known class is written', () => {
    expect(surfaceClassField('hike_offroad')).toEqual({ surfaceClass: 'hike_offroad' });
    expect(surfaceClassField('unknown')).toEqual({});
    expect(surfaceClassField(undefined)).toEqual({});
    expect(Object.prototype.hasOwnProperty.call(surfaceClassField('unknown'), 'surfaceClass')).toBe(false); // §24: absent, not undefined
  });
  const trail = (activity: 'walking' | 'cycling', surfaceMix: Record<string, number>): TrailRoute => ({
    id: 'osm_rel_1', kind: 'osm_relation', name: 'שביל', nameSource: 'osm_name', needsName: false,
    activity, shape: 'loop', segmentIds: ['s1'], segmentForward: [true], geometry: [[34.5, 31.5], [34.53, 31.5]],
    stats: { lengthM: 2850, gainM: 3, lossM: 0, maxGrade50mPct: 1, maxGrade50mOpenPct: 1, minEleM: 1, maxEleM: 4, builtUpPct: 0, trailPct: 100, litPct: 0, litUnknownPct: 100, surfaceMix },
    difficulty: { npsScore: 1, base: 'easy', technicalReasons: [], urbanCapped: false, final: 'easy' },
    stars: { provenance: 1, scenery: 1, amenities: 0, composition: 1, total: 3 }, settlement: null, license: 'ODbL', attribution: 't',
  } as unknown as TrailRoute);
  const ctx = { authorityId: 'a1', city: 'עיר', osmTimestamp: null, importBatchId: 'b' };
  it('trails routeDocPayload → validated create keeps surfaceClass', () => {
    const doc = (r: TrailRoute) => buildValidatedDoc('official_routes', routeDocPayload(r, ctx).raw, { mode: 'create', knownAuthorityIds: KNOWN });
    expect(doc(trail('walking', { dirt: 1 })).surfaceClass).toBe('hike_offroad');
    expect(doc(trail('cycling', { asphalt: 1 })).surfaceClass).toBe('bike_road');
    expect('surfaceClass' in doc(trail('walking', { unknown: 1 }))).toBe(false);
  });
});

// ── plan (pure) ───────────────────────────────────────────────────────────
describe('planSurfaceClass', () => {
  it('fills from the score; leaves unknown / no-score unset', () => {
    expect(planSurfaceClass('r', {}, { routeId: 'r', routeCollection: 'official_routes', surfaceClass: 'bike_road' })).toEqual({ kind: 'fill', surfaceClass: 'bike_road' });
    expect(planSurfaceClass('r', {}, { surfaceClass: 'unknown' }).kind).toBe('score_unknown');
    expect(planSurfaceClass('r', {}, {}).kind).toBe('score_unknown');
    expect(planSurfaceClass('r', {}, undefined).kind).toBe('no_score');
  });
  it('already-set docs are never planned (idempotent); null counts as absent; garbage is reported', () => {
    expect(planSurfaceClass('r', { surfaceClass: 'hike_offroad' }, { surfaceClass: 'bike_road' })).toEqual({ kind: 'already_set', surfaceClass: 'hike_offroad' });
    expect(planSurfaceClass('r', { surfaceClass: null }, { surfaceClass: 'bike_road' }).kind).toBe('fill');
    expect(planSurfaceClass('r', { surfaceClass: 'moderate' }, { surfaceClass: 'bike_road' }).kind).toBe('invalid_existing');
  });
  it('join cross-checks: wrong routeId / curated collection / bad class are mismatches', () => {
    expect(planSurfaceClass('r', {}, { routeId: 'other', surfaceClass: 'bike_road' }).kind).toBe('score_mismatch');
    expect(planSurfaceClass('r', {}, { routeCollection: 'curated_routes', surfaceClass: 'bike_road' }).kind).toBe('score_mismatch');
    expect(planSurfaceClass('r', {}, { surfaceClass: 'weird' }).kind).toBe('score_mismatch');
  });
  it('summary counts per class', () => {
    const s = summarizeSurfaceClassPlans([
      { kind: 'fill', surfaceClass: 'bike_road' }, { kind: 'fill', surfaceClass: 'bike_road' }, { kind: 'fill', surfaceClass: 'hike_offroad' },
      { kind: 'already_set', surfaceClass: 'bike_road' }, { kind: 'no_score' }, { kind: 'score_unknown' },
    ]);
    expect(s).toMatchObject({ total: 6, fill: 3, alreadySet: 1, noScore: 1, scoreUnknown: 1 });
    expect(s.fillByClass).toMatchObject({ bike_road: 2, hike_offroad: 1, walk_run_paved: 0, bike_offroad: 0 });
  });
});

// ── fake Firestore with Timestamp-shaped values + updateTime preconditions ─
class FakeTimestamp {
  constructor(readonly ms: number) {}
  toDate() { return new Date(this.ms); }
  toMillis() { return this.ms; }
  isEqual(o: FakeTimestamp) { return o.ms === this.ms; }
}
const coerce = (v: unknown): unknown => (v instanceof Date ? new FakeTimestamp(v.getTime()) : Array.isArray(v) ? v.map(coerce) : v && typeof v === 'object' && !(v instanceof FakeTimestamp) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, coerce(x)])) : v);

function fakeDb(seed: Record<string, Record<string, Record<string, any>>>) {
  let clock = 1000;
  const store = new Map<string, { data: Record<string, any>; updateTime: FakeTimestamp }>();
  for (const [col, docs] of Object.entries(seed)) for (const [id, data] of Object.entries(docs)) store.set(`${col}/${id}`, { data: coerce(data) as any, updateTime: new FakeTimestamp(clock++) });
  const writes: Array<{ path: string; payload: Record<string, any> }> = [];
  const doUpdate = (path: string, payload: Record<string, any>, pre?: { lastUpdateTime?: FakeTimestamp }) => {
    const cur = store.get(path);
    if (!cur) throw new Error('NOT_FOUND');
    if (pre?.lastUpdateTime && !pre.lastUpdateTime.isEqual(cur.updateTime)) throw new Error('FAILED_PRECONDITION');
    cur.data = { ...cur.data, ...(coerce(payload) as any) };
    cur.updateTime = new FakeTimestamp(clock++);
    writes.push({ path, payload });
  };
  const db: any = {
    collection: (col: string) => ({
      select: () => ({ get: async () => ({ docs: Array.from(store.entries()).filter(([k]) => k.startsWith(`${col}/`)).map(([k, v]) => ({ id: k.slice(col.length + 1), data: () => v.data, updateTime: v.updateTime })) }) }),
      doc: (id: string) => ({ path: `${col}/${id}`, update: async (p: any, pre: any) => doUpdate(`${col}/${id}`, p, pre) }),
    }),
    batch: () => {
      const ops: Array<() => void> = [];
      return {
        update: (ref: any, p: any, pre: any) => ops.push(() => doUpdate(ref.path, p, pre)),
        commit: async () => {
          // atomic: any failed precondition rolls the whole batch back
          const snapshot = new Map(Array.from(store.entries()).map(([k, v]) => [k, { data: v.data, updateTime: v.updateTime }]));
          const nw = writes.length;
          try { ops.forEach((o) => o()); } catch (e) { store.clear(); snapshot.forEach((v, k) => store.set(k, v)); writes.length = nw; throw e; }
        },
      };
    },
  };
  return { db, store, writes, bump: (path: string) => { store.get(path)!.updateTime = new FakeTimestamp(clock++); } };
}

const route = (over: Record<string, any> = {}) => ({ name: 'מסלול', city: 'עיר', authorityId: 'a1', published: true, status: 'published', createdAt: new Date('2026-01-01'), ...over });
const score = (cls: string, over: Record<string, any> = {}) => ({ routeCollection: 'official_routes', surfaceClass: cls, computedAt: new Date('2026-10-21'), ...over });

describe('planSurfaceClassBackfill + applySurfaceClassWrites (Timestamp-shaped fake db)', () => {
  const seed = () => fakeDb({
    official_routes: {
      fillA: route(), fillB: route(), fillC: route(),
      done: route({ surfaceClass: 'bike_road' }),
      noScore: route(), unk: route(), curatedScore: route(),
    },
    route_scores: {
      fillA: score('walk_run_paved', { routeId: 'fillA' }), fillB: score('bike_offroad', { routeId: 'fillB' }), fillC: score('hike_offroad', { routeId: 'fillC' }),
      done: score('hike_offroad', { routeId: 'done' }), unk: score('unknown', { routeId: 'unk' }),
      curatedScore: score('bike_road', { routeId: 'curatedScore', routeCollection: 'curated_routes' }),
    },
  });

  it('plans only absent docs; counts per class; lists skipped', async () => {
    const f = seed();
    const { writes, summary } = await planSurfaceClassBackfill(f.db, { knownAuthorityIds: KNOWN });
    expect(writes.map((w) => [w.id, w.surfaceClass]).sort()).toEqual([['fillA', 'walk_run_paved'], ['fillB', 'bike_offroad'], ['fillC', 'hike_offroad']]);
    expect(summary).toMatchObject({ total: 7, fill: 3, alreadySet: 1, noScore: 1, scoreUnknown: 1, scoreMismatch: 1 });
    expect(summary.fillByClass).toEqual({ walk_run_paved: 1, hike_offroad: 1, bike_road: 0, bike_offroad: 1 });
    expect(f.writes).toHaveLength(0); // dry-run plan wrote nothing
    expect(writes[0].updateTime).toBeInstanceOf(FakeTimestamp); // §31 shape, not a Date
  });

  it('payload is exactly {surfaceClass}; never unknown; chokepoint rejects a bad value', () => {
    const w = { surfaceClass: 'bike_road' as const, existingAuthorityId: 'a1', existingCity: 'עיר' };
    expect(surfaceClassPayload(w, KNOWN)).toEqual({ surfaceClass: 'bike_road' });
    expect(() => surfaceClassPayload({ ...w, surfaceClass: 'unknown' as any }, KNOWN)).toThrow();
    expect(() => surfaceClassPayload({ ...w, surfaceClass: 'moderate' as any }, KNOWN)).toThrow();
  });

  it('apply writes only {surfaceClass}, leaves published/status untouched, batches ≤ 400, then re-plan is empty (idempotent)', async () => {
    const f = seed();
    const plan = await planSurfaceClassBackfill(f.db, { knownAuthorityIds: KNOWN });
    const res = await applySurfaceClassWrites(f.db, plan.writes, KNOWN, { batchSize: 2, log: () => {} });
    expect(res).toEqual({ written: 3, conflicts: [], batches: 2 });
    for (const w of f.writes) expect(Object.keys(w.payload)).toEqual(['surfaceClass']);
    expect(f.store.get('official_routes/fillA')!.data).toMatchObject({ surfaceClass: 'walk_run_paved', published: true, status: 'published', name: 'מסלול' });
    expect(f.store.get('official_routes/done')!.data.surfaceClass).toBe('bike_road'); // untouched
    expect('surfaceClass' in f.store.get('official_routes/noScore')!.data).toBe(false);
    const again = await planSurfaceClassBackfill(f.db, { knownAuthorityIds: KNOWN });
    expect(again.writes).toHaveLength(0);
  });

  it('a doc edited after the read is skipped as a conflict, the others still land', async () => {
    const f = seed();
    const plan = await planSurfaceClassBackfill(f.db, { knownAuthorityIds: KNOWN });
    f.bump('official_routes/fillB'); // someone edited it in the panel meanwhile
    const res = await applySurfaceClassWrites(f.db, plan.writes, KNOWN, { batchSize: 400, log: () => {} });
    expect(res.written).toBe(2);
    expect(res.conflicts).toEqual(['official_routes/fillB']);
    expect('surfaceClass' in f.store.get('official_routes/fillB')!.data).toBe(false);
  });

  it('--city filter limits the plan', async () => {
    const f = fakeDb({ official_routes: { a: route({ city: 'X' }), b: route({ city: 'Y' }) }, route_scores: { a: score('bike_road'), b: score('bike_road') } });
    const { writes } = await planSurfaceClassBackfill(f.db, { city: 'X', knownAuthorityIds: KNOWN });
    expect(writes.map((w) => w.id)).toEqual(['a']);
  });
});
