/**
 * trails --apply — Firestore EMULATOR integration test (feat/trails-apply).
 *
 * Runs the real write path (scripts/trails/lib/trails-apply.node.ts, Admin
 * SDK) on a small fixture and checks: name-resolved authority (and refusal on
 * a mismatch), the written shape, create-only for official_routes,
 * IDEMPOTENCY (a second run writes nothing), change detection, the typed-YES
 * gate, and ≤ 400-doc batches.
 *
 * Emulator only — SKIPPED unless FIRESTORE_EMULATOR_HOST is set, and the
 * project id below is not appout-1, which openTarget() refuses to use
 * without an emulator anyway (double guard: this can never reach production).
 *
 * Run:
 *   firebase emulators:start --only firestore --config firebase-audit.json --project appout-1-audit-test
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8089 npx vitest run tests/trails-apply.emulator.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { deleteApp } from 'firebase-admin/app';
import { FieldValue } from 'firebase-admin/firestore';
import { applyTrailSegments, openTarget, type Target } from '../scripts/trails/lib/trails-apply.node';
import { applyNamedRoutes as applyTrailRoutes } from '../scripts/trails/import-named-routes';
import { runElevationBackfill, type BackfillRunOptions, type SamplerFor } from '../scripts/trails/backfill-elevation-profile';
import { computeElevationProfileSamples } from '../src/lib/dem-tile-cache/elevation-profile';
import type { BackfillCheckpoint } from '../src/lib/trail-graph/elevation-backfill';
import { rateDifficulty, starPrior } from '../src/lib/trail-graph/difficulty';
import { routeStats } from '../src/lib/trail-graph/route-stats';
import { OSM_LICENSE, type LngLat, type TrailRoute, type TrailSegment } from '../src/lib/trail-graph/types';

const HOST = process.env.FIRESTORE_EMULATOR_HOST;
const PROJECT = 'trails-apply-test';
const AREA = 'מועצה אזורית שער הנגב';

function seg(id: string, a: number, b: number, pa: LngLat, pb: LngLat, extra: Partial<TrailSegment> = {}): TrailSegment {
  return {
    id, startNode: a, endNode: b, geometry: [pa, pb], lengthM: 1000,
    elevation: { provider: 'copernicus-glo30', gainFwdM: 10, gainRevM: 2, maxGrade50mFwdPct: 4, maxGrade50mRevPct: 1, minEleM: 50, maxEleM: 60 },
    highwayClass: 'track', surface: 'dirt', surfaceRaw: null, surfaceConfidence: 'highway_default', lit: 'no', litSource: 'default_unlit_outside_built_up',
    sacScale: null, mtbScale: null, tracktype: null, colour: 'red', itcRef: null, name: null, inBuiltUp: false,
    osmWayIds: [Number(a)], routeRelationIds: [77], foot: true, bicycle: true, license: 'ODbL-1.0', ...extra,
  };
}

const SEGS: TrailSegment[] = [
  seg('seg_1_1_2', 1, 2, [34.5, 31.5], [34.51, 31.5]),
  seg('seg_2_2_3', 2, 3, [34.51, 31.5], [34.52, 31.5]),
  seg('seg_3_3_4', 3, 4, [34.52, 31.5], [34.53, 31.5]),
];

function route(id: string, kind: TrailRoute['kind'], shape: TrailRoute['shape'], segs: TrailSegment[]): TrailRoute {
  const forward = segs.map(() => true);
  const stats = routeStats(segs, forward);
  return {
    id, kind, name: `מסלול בדיקה ${id}`, nameSource: kind === 'generated' ? 'generated_descriptive' : 'itc_colour_ref_toponym', needsName: false,
    activity: 'walking', shape, segmentIds: segs.map((s) => s.id), segmentForward: forward,
    geometry: segs.flatMap((s, i) => (i ? s.geometry.slice(1) : s.geometry)),
    stats,
    difficulty: rateDifficulty({ gainM: stats.gainM, distM: stats.lengthM, builtUpShare: 0, maxGrade50mPct: stats.maxGrade50mOpenPct, segments: segs }),
    stars: starPrior({ provenance: 'official_unnamed', offBuiltUpShare: 1, nearNamedNature: true, greenShare: 0, amenityTypes: 0, offroadShare: 1, residentialShare: 0 }),
    settlement: 'דורות',
    ...(shape === 'linear' ? { endpoints: { from: 'דורות', to: 'רוחמה' } } : {}),
    ...(kind === 'osm_relation' ? { osm: { relationId: 77, route: 'hiking', operator: 'itc', network: null, ref: null, colour: 'red', officialName: null, clippedToPilotArea: false, continuity: 1 } } : {}),
    license: OSM_LICENSE,
    attribution: '© OpenStreetMap contributors; elevation …',
  };
}

const ROUTES: TrailRoute[] = [route('osm_rel_77', 'osm_relation', 'linear', SEGS), route('gen_900_1', 'generated', 'out_and_back', SEGS.slice(0, 2))];

let target: Target;
const logs: string[] = [];
const log = (s: string) => { logs.push(s); };
const yes = async () => true;

async function clearEmulator() {
  const r = await fetch(`http://${HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  if (!r.ok) throw new Error(`emulator clear failed: ${r.status}`);
}

const base = () => ({ target, authorityId: 'auth_shaar', areaName: AREA, osmTimestamp: '2026-10-17T20:20:51Z', confirm: yes, log });

describe.skipIf(!HOST)('trails --apply on the Firestore emulator', () => {
  beforeAll(async () => {
    target = await openTarget(PROJECT);
    expect(target.emulator).toBe(HOST);
    await clearEmulator();
    await target.db.collection('authorities').doc('auth_shaar').set({ name: 'שער הנגב' });
    await target.db.collection('authorities').doc('auth_decoy').set({ name: 'שער אפרים' });
    await target.db.collection('authorities').doc('auth_b').set({ name: 'בדיקה' });
  });
  afterAll(async () => {
    if (target) await deleteApp(target.app);
  });

  it('refuses when --authority does not match the name lookup (nothing written)', async () => {
    await expect(applyTrailSegments(SEGS, { ...base(), authorityId: 'auth_decoy' })).rejects.toThrow(/does not match the name lookup/);
    expect((await target.db.collection('trail_segments').get()).size).toBe(0);
  });

  it('refuses an ambiguous / unknown area name', async () => {
    await expect(applyTrailSegments(SEGS, { ...base(), areaName: 'מועצה אזורית לא קיימת' })).rejects.toThrow(/matched 0/);
  });

  it('a typed-YES refusal writes nothing', async () => {
    const res = await applyTrailSegments(SEGS, { ...base(), confirm: async () => false });
    expect(res).toMatchObject({ written: 0, aborted: true });
    expect((await target.db.collection('trail_segments').get()).size).toBe(0);
  });

  it('first run: creates every segment and route with the approved shape', async () => {
    const s = await applyTrailSegments(SEGS, base());
    expect(s.written).toBe(3);
    const r = await applyTrailRoutes(ROUTES, { ...base(), importBatchId: 'trails_test' });
    expect(r.written).toBe(2);

    const sd = (await target.db.collection('trail_segments').doc('seg_1_1_2').get()).data()!;
    expect(sd).toMatchObject({ authorityId: 'auth_shaar', license: 'ODbL-1.0', source: 'osm_geofabrik_v1', osmTimestamp: '2026-10-17T20:20:51Z' });
    expect(sd.geometry).toEqual([{ lng: 34.5, lat: 31.5 }, { lng: 34.51, lat: 31.5 }]);
    expect(typeof sd.contentHash).toBe('string');
    expect(sd.createdAt).toBeTruthy();

    const rd = (await target.db.collection('official_routes').doc('osm_rel_77').get()).data()!;
    expect(rd).toMatchObject({
      status: 'pending', published: false, origin: 'osm_import', routeShape: 'point_to_point',
      authorityId: 'auth_shaar', city: 'שער הנגב', type: 'walking', distance: 3,
      provenance: { pipeline: 'trails_v1', osm: { license: 'ODbL-1.0' }, elevation: { provider: 'copernicus-glo30' } },
      trail: { kind: 'osm_relation', endpoints: { from: 'דורות', to: 'רוחמה' } },
      source: { type: 'official_api', externalId: 'osm_rel_77' },
    });
    expect(rd.attribution.osm).toBe('© OpenStreetMap contributors');
    expect((await target.db.collection('official_routes').doc('gen_900_1').get()).data()!.routeShape).toBe('out_and_back');
  });

  it('second run is idempotent: nothing new is written (confirm never asked)', async () => {
    let asked = 0;
    const confirm = async () => { asked++; return true; };
    const s = await applyTrailSegments(SEGS, { ...base(), confirm });
    expect(s.written).toBe(0);
    expect(s.plans[0]).toMatchObject({ unchanged: 3, staleInDb: 0 });
    expect(s.plans[0].create).toHaveLength(0);
    expect(s.plans[0].update).toHaveLength(0);
    const r = await applyTrailRoutes(ROUTES, { ...base(), confirm, importBatchId: 'trails_test' });
    expect(r.written).toBe(0);
    expect(r.plans[0].skippedExisting).toBe(2);
    expect(asked).toBe(0);
  });

  it('official_routes stays create-only: an admin edit is never overwritten', async () => {
    await target.db.collection('official_routes').doc('osm_rel_77').update({ name: 'שם שנערך בפאנל', status: 'published', published: true });
    const changed = ROUTES.map((x) => ({ ...x, name: 'שם חדש מהצינור' }));
    const r = await applyTrailRoutes(changed, { ...base(), importBatchId: 'trails_test' });
    expect(r.written).toBe(0);
    expect((await target.db.collection('official_routes').doc('osm_rel_77').get()).data()).toMatchObject({ name: 'שם שנערך בפאנל', published: true });
  });

  it('a changed segment is updated (createdAt kept); a dropped one is reported stale, not deleted', async () => {
    const before = (await target.db.collection('trail_segments').doc('seg_2_2_3').get()).data()!;
    const next = [SEGS[0], { ...SEGS[1], lengthM: 1001 }];
    const s = await applyTrailSegments(next, base());
    expect(s.plans[0]).toMatchObject({ unchanged: 1, staleInDb: 1 });
    expect(s.plans[0].update.map((d) => d.id)).toEqual(['seg_2_2_3']);
    expect(s.written).toBe(1);
    const after = (await target.db.collection('trail_segments').doc('seg_2_2_3').get()).data()!;
    expect(after.lengthM).toBe(1001);
    expect(after.createdAt.isEqual(before.createdAt)).toBe(true);
    expect((await target.db.collection('trail_segments').doc('seg_3_3_4').get()).exists).toBe(true);
  });

  it('writes in batches of at most 400', async () => {
    logs.length = 0;
    const many = Array.from({ length: 450 }, (_, i) => seg(`seg_b${i}_${i}_${i + 1}`, i, i + 1, [34.6 + i * 1e-4, 31.6], [34.6 + (i + 1) * 1e-4, 31.6]));
    const s = await applyTrailSegments(many, { ...base(), authorityId: 'auth_b', areaName: 'בדיקה' });
    expect(s.written).toBe(450);
    expect(logs.filter((l) => /batch \d+\/2 committed/.test(l))).toHaveLength(2);
    expect(logs.some((l) => l.includes('(400 docs)'))).toBe(true);
    expect(logs.some((l) => l.includes('(50 docs)'))).toBe(true);
  });
});


// ── elevationProfile backfill onto EXISTING official_routes (19.10.2026) ────
// Real Firestore path (listOfficialRoutesPage + updateElevationProfiles) with a
// synthetic DEM: coverage only west of lng 35 (east of it = a coverage gap).
describe.skipIf(!HOST)('elevationProfile backfill on the Firestore emulator', () => {
  const BF_PROJECT = 'trails-elev-backfill-test';
  let t: Target;
  let cpStore: BackfillCheckpoint | null = null;
  const bfLogs: string[] = [];
  const dem = { id: 'copernicus-glo30' as const, attribution: 'test', storable: true, sample: (_lat: number, lng: number) => (lng > 35 ? null : 100 + (lng - 34.5) * 10_000) };
  const sampler: SamplerFor = async () => (p) => computeElevationProfileSamples(p, dem);
  const opts = (over: Partial<BackfillRunOptions> = {}): BackfillRunOptions => ({
    target: t, apply: true, authorityId: null,
    limits: { pageSize: 2, maxRoutes: 100, batchSize: 2, pauseMs: 0 },
    samplerFor: sampler,
    readCheckpoint: () => cpStore,
    writeCheckpoint: (cp) => { cpStore = cp; },
    confirm: async () => true,
    log: (l) => { bfLogs.push(l); },
    ...over,
  });
  const path = (x0: number) => [{ lng: x0, lat: 31.5 }, { lng: x0 + 0.02, lat: 31.5 }];
  const EXISTING = { stepM: 5, elevationsM: [7, 8] };
  const docs: Record<string, Record<string, unknown>> = {
    r_a: { name: 'א', path: path(34.5), authorityId: 'auth_1', city: 'עיר', status: 'published', published: true, distance: 1.9, rating: 4 },
    r_b: { name: 'ב', path: path(34.6), authorityId: 'auth_1', city: 'עיר', elevationProfile: EXISTING },
    r_c: { name: 'ג', path: path(35.1), authorityId: 'auth_1', city: 'עיר' }, // DEM gap
    r_d: { name: 'ד', path: [{ lng: 34.5, lat: 31.5 }], authorityId: 'auth_1', city: 'עיר' }, // unusable path
    r_e: { name: 'ה', path: path(34.7), authorityId: 'auth_2', city: 'עיר אחרת' },
  };
  const get = async (id: string) => (await t.db.collection('official_routes').doc(id).get()).data()!;

  beforeAll(async () => {
    t = await openTarget(BF_PROJECT);
    expect(t.emulator).toBe(HOST);
    const r = await fetch(`http://${HOST}/emulator/v1/projects/${BF_PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
    if (!r.ok) throw new Error(`emulator clear failed: ${r.status}`);
    for (const [id, d] of Object.entries(docs)) await t.db.collection('official_routes').doc(id).set(d);
  });
  afterAll(async () => {
    if (t) await deleteApp(t.app);
  });

  it('dry-run reads only: reports per route, writes nothing, keeps no checkpoint', async () => {
    const res = await runElevationBackfill(opts({ apply: false }));
    expect(res.counts).toEqual({ scanned: 5, write: 2, has_profile: 1, dem_gap: 1, bad_path: 1 });
    expect(res.entries.find((e) => e.id === 'r_a')?.profile?.elevationsM).toHaveLength(64);
    expect(res.written).toBe(0);
    expect(cpStore).toBeNull();
    for (const id of ['r_a', 'r_c', 'r_e']) expect((await get(id)).elevationProfile).toBeUndefined();
  });

  it('a typed-YES refusal writes nothing', async () => {
    const res = await runElevationBackfill(opts({ confirm: async () => false }));
    expect(res).toMatchObject({ aborted: true, written: 0 });
    expect((await get('r_a')).elevationProfile).toBeUndefined();
  });

  it('--apply bounded by --max-routes, then resumes from the checkpoint', async () => {
    const first = await runElevationBackfill(opts({ limits: { pageSize: 2, maxRoutes: 2, batchSize: 2, pauseMs: 0 } }));
    expect(first).toMatchObject({ written: 1, done: false });
    expect(cpStore).toMatchObject({ lastDocId: 'r_b', written: 1, done: false });
    const second = await runElevationBackfill(opts());
    expect(second.counts.scanned).toBe(3); // r_c, r_d, r_e — r_a/r_b not re-read
    expect(second.written).toBe(1);
    expect(cpStore).toMatchObject({ lastDocId: 'r_e', written: 2, done: true });
  });

  it('field-level: only elevationProfile was added; every other field is untouched', async () => {
    const a = await get('r_a');
    const { elevationProfile, ...rest } = a;
    expect(rest).toEqual(docs.r_a);
    expect((elevationProfile as { elevationsM: number[] }).elevationsM).toHaveLength(64);
    expect((elevationProfile as { elevationsM: number[] }).elevationsM[0]).toBeCloseTo(100, 0);
    expect((await get('r_b')).elevationProfile).toEqual(EXISTING); // never overwritten
    expect((await get('r_c')).elevationProfile).toBeUndefined(); // DEM gap — no guessed data
    expect((await get('r_d')).elevationProfile).toBeUndefined();
  });

  it('idempotent: a full re-scan writes nothing; a done checkpoint short-circuits', async () => {
    expect((await runElevationBackfill(opts())).written).toBe(0);
    cpStore = null;
    const rescan = await runElevationBackfill(opts());
    expect(rescan.written).toBe(0);
    expect(rescan.counts).toMatchObject({ has_profile: 3, write: 0 });
  });

  it('--authority filter limits the scan', async () => {
    await t.db.collection('official_routes').doc('r_e').update({ elevationProfile: FieldValue.delete() });
    cpStore = null;
    const res = await runElevationBackfill(opts({ authorityId: 'auth_2' }));
    expect(res.counts.scanned).toBe(1);
    expect(res.written).toBe(1);
  });

  it('a doc edited between read and write is skipped, not clobbered', async () => {
    await t.db.collection('official_routes').doc('r_f').set({ name: 'ו', path: path(34.55), authorityId: 'auth_1', city: 'עיר' });
    cpStore = null;
    const racing: SamplerFor = async () => {
      await t.db.collection('official_routes').doc('r_f').update({ name: 'נערך בזמן הריצה' });
      return (q) => computeElevationProfileSamples(q, dem);
    };
    // One page, so r_f is read BEFORE the racing edit lands (r_c's DEM-gap sampling also triggers it).
    const res = await runElevationBackfill(opts({ samplerFor: racing, limits: { pageSize: 100, maxRoutes: 100, batchSize: 2, pauseMs: 0 } }));
    expect(res.conflicts).toEqual(['r_f']);
    const f = await get('r_f');
    expect(f.name).toBe('נערך בזמן הריצה');
    expect(f.elevationProfile).toBeUndefined();
  });
});

