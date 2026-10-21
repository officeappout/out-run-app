import { describe, expect, it } from 'vitest';
import { readCityInventory, readCityInventoryRun, writeCityInventory, type InventoryDb } from '../store';
import { computeReadiness } from '../readiness';
import type { CityInventoryInput } from '../doc';
import { NOW, allMeasured, measuredLayer } from './fixtures';

/**
 * axioms §31 — the FIRST write path to a new collection needs a test that
 * runs the real write function and the real read function against a fake
 * db that reproduces Firestore's read-time coercion: every Date (at any
 * depth) comes back as a Timestamp-shaped object with .toDate()/.toMillis()
 * and deliberately NO .getTime(); the serverTimestamp sentinel resolves to
 * a Timestamp too. A reader that forgets to normalise throws here exactly
 * as it would in production.
 */

class FakeTimestamp {
  constructor(private readonly ms: number) {}
  toDate(): Date { return new Date(this.ms); }
  toMillis(): number { return this.ms; }
}

const SERVER_TS = Symbol('serverTimestamp');
const SERVER_NOW = new Date('2026-10-21T09:30:00Z');

/** What Firestore stores/returns: Dates ⇒ Timestamps, sentinel ⇒ Timestamp, undefined rejected. */
function coerce(v: unknown, path: string): unknown {
  if (v === undefined) throw new Error(`Firestore rejects undefined at ${path}`);
  if (v === SERVER_TS) return new FakeTimestamp(SERVER_NOW.getTime());
  if (v instanceof Date) return new FakeTimestamp(v.getTime());
  if (Array.isArray(v)) {
    return v.map((x, i) => {
      if (Array.isArray(x)) throw new Error(`Firestore rejects nested arrays at ${path}[${i}]`);
      return coerce(x, `${path}[${i}]`);
    });
  }
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) out[k] = coerce(x, `${path}.${k}`);
    return out;
  }
  return v;
}

function makeFakeDb(opts: { failCommit?: boolean } = {}) {
  const store = new Map<string, unknown>();
  const db: InventoryDb & { store: Map<string, unknown> } = {
    store,
    doc: (path: string) => ({
      path,
      get: async () => ({ exists: store.has(path), data: () => store.get(path) }),
    }) as never,
    batch: () => {
      const ops: Array<[string, unknown]> = [];
      return {
        set: (ref: unknown, data: Record<string, unknown>) => { ops.push([(ref as { path: string }).path, coerce(data, (ref as { path: string }).path)]); },
        commit: async () => {
          if (opts.failCommit) throw new Error('commit failed');
          for (const [p, d] of ops) store.set(p, d);
        },
      };
    },
  };
  return db;
}

function input(): CityInventoryInput {
  const layers = allMeasured();
  layers.lap_loops = measuredLayer({ count: 7, lengthKm: 4.2 });
  layers.big_parks = measuredLayer({
    count: 14,
    areaKm2: 3.1,
    files: [{ path: 'city-inventory/auth_bsv/2026-10-01/osm/big_parks.geojson.gz', bytes: 51_200, sha256: 'deadbeef' }],
  });
  layers.toilets = measuredLayer({ count: 28, density: 0.034, method: 'osm_density_vs_peers', coveragePct: null });
  const readiness = computeReadiness({ hasBoundary: true, osmSnapshotDate: '2026-10-01', approvedRoutes: 26, authorityType: 'city', population: 215_000, layers });
  return {
    authorityId: 'auth_bsv',
    city: 'באר שבע',
    authorityType: 'city',
    areaKm2: 117.5,
    snapshot: { osmPbfDate: '2026-10-01', builtAt: NOW, builtBy: 'city-inventory-i1', runId: 'run_20261021T0800' },
    layers,
    readiness,
  };
}

describe('city_inventory write ⇒ read round-trip (axioms §31)', () => {
  it('the stored shape really carries Timestamps without getTime()', async () => {
    const db = makeFakeDb();
    await writeCityInventory(db, input(), SERVER_TS);
    const raw = db.store.get('city_inventory/auth_bsv') as any;
    expect(raw.snapshot.builtAt).toBeInstanceOf(FakeTimestamp);
    expect(raw.snapshot.builtAt.getTime).toBeUndefined();
    expect(raw.layers.benches.lastRefreshAt).toBeInstanceOf(FakeTimestamp);
    expect(raw.updatedAt).toBeInstanceOf(FakeTimestamp);
  });

  it('summary doc reads back to the same domain model with real Dates', async () => {
    const db = makeFakeDb();
    const inv = input();
    await writeCityInventory(db, inv, SERVER_TS);
    const back = await readCityInventory(db, 'auth_bsv');
    expect(back).not.toBeNull();
    expect(back!.snapshot.builtAt).toBeInstanceOf(Date);
    expect(back!.snapshot.builtAt.getTime()).toBe(NOW.getTime());
    expect(back!.updatedAt?.getTime()).toBe(SERVER_NOW.getTime());
    expect(back!.layers.benches.lastRefreshAt?.getTime()).toBe(NOW.getTime());
    expect(back!.layers.lap_loops.lengthKm).toBe(4.2);
    expect(back!.layers.big_parks.files).toEqual(inv.layers.big_parks.files);
    expect(back!.layers.toilets.coveragePct).toBeNull();
    expect(back!.layers.shade.method).toBe('technion_si_daily');
    expect(back!.readiness).toEqual(inv.readiness);
    const { updatedAt: _u, schemaVersion: _s, ...rest } = back!;
    expect(rest).toEqual(inv);
  });

  it('run row reads back without files', async () => {
    const db = makeFakeDb();
    await writeCityInventory(db, input(), SERVER_TS);
    const run = await readCityInventoryRun(db, 'auth_bsv', 'run_20261021T0800');
    expect(run?.createdAt?.getTime()).toBe(SERVER_NOW.getTime());
    expect(run?.snapshot.builtAt.getTime()).toBe(NOW.getTime());
    expect(run?.layers.big_parks.count).toBe(14);
    expect(Object.prototype.hasOwnProperty.call(run!.layers.big_parks, 'files')).toBe(false);
  });

  it('summary + run are all-or-nothing', async () => {
    const db = makeFakeDb({ failCommit: true });
    await expect(writeCityInventory(db, input(), SERVER_TS)).rejects.toThrow('commit failed');
    expect(db.store.size).toBe(0);
    expect(await readCityInventory(db, 'auth_bsv')).toBeNull();
  });

  it('missing doc / empty id read as null', async () => {
    const db = makeFakeDb();
    expect(await readCityInventory(db, 'nope')).toBeNull();
    expect(await readCityInventory(db, '')).toBeNull();
    expect(await readCityInventoryRun(db, 'nope', 'r')).toBeNull();
  });
});
