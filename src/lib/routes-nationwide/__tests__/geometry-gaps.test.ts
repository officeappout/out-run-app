import { describe, expect, it } from 'vitest';
import { analyzeGapDoc, checkSegmentWalk, estimateParts, isRepairScope, segmentNodes, type GapDocInput } from '../geometry-gaps';
import { gapArchivePayload, applyGapArchives } from '../../../../scripts/routes-nationwide/lib/geometry-gap-apply.node';

describe('segment ids', () => {
  it('parses seg_<way>_<start>_<end> with an optional dup suffix', () => {
    expect(segmentNodes('seg_100_1_2')).toEqual({ start: 1, end: 2 });
    expect(segmentNodes('seg_100_1_2_1')).toEqual({ start: 1, end: 2 });
    expect(segmentNodes('gen_5')).toBeNull();
  });

  it('a walk where every segment starts at the previous one\'s end node has no bridge', () => {
    expect(checkSegmentWalk(['seg_1_1_2', 'seg_2_2_3', 'seg_3_3_4'], [true, true, true])).toMatchObject({ discontinuities: 0, parsed: true });
    // second segment stored reversed (3→2) but walked backwards, third continues from 3
    expect(checkSegmentWalk(['seg_1_1_2', 'seg_2_3_2', 'seg_3_3_4'], [true, false, true]).discontinuities).toBe(0);
  });

  it('segments that do not meet at a node are a bridge, whatever their distance', () => {
    const r = checkSegmentWalk(['seg_1_1_2', 'seg_2_9_10', 'seg_3_10_11'], [true, true, true]);
    expect(r).toMatchObject({ discontinuities: 1, breaks: [0], parsed: true });
  });

  it('an unparsable id means the exact test is unavailable, not "no bridge"', () => {
    expect(checkSegmentWalk(['seg_1_1_2', 'weird'], [true, true]).parsed).toBe(false);
  });
});

const dense = (x0: number, n: number): Array<[number, number]> => Array.from({ length: n }, (_, i) => [x0 + i * 0.001, 31.9]);
function doc(over: Partial<GapDocInput> = {}): GapDocInput {
  return {
    id: 'osm_rel_1__a', authorityId: 'a', name: 'שביל', origin: 'osm_import', status: 'pending', published: false, km: 5,
    path: [...dense(35.0, 20), ...dense(35.5, 20)], // 0.5° (~47 km) hop in the middle
    trailKind: 'osm_relation', segmentIds: ['seg_1_1_2', 'seg_2_8_9'], segmentForward: [true, true], trailLengthM: 3800,
    ...over,
  };
}

describe('analyzeGapDoc', () => {
  it('flags a bridged relation doc by the exact segment test and measures the bridge', () => {
    const r = analyzeGapDoc(doc());
    expect(r).toMatchObject({ affected: true, basis: 'segment_walk', discontinuities: 1, inRepairScope: true });
    expect(r.maxGapM).toBeGreaterThan(40_000);
    expect(r.gapsOver2k).toBe(1);
    expect(r.bridgeM).toBeGreaterThan(40_000);
  });

  it('does NOT flag a continuous relation even when a vertex step is long (a legitimate sparse straight way)', () => {
    const r = analyzeGapDoc(doc({ path: [...dense(35.0, 20), [35.03, 31.9], ...dense(35.04, 5)], segmentIds: ['seg_1_1_2', 'seg_2_2_3'], trailLengthM: 3000 }));
    expect(r.affected).toBe(false);
    expect(r.basis).toBe('none');
    expect(r.discontinuities).toBe(0);
  });

  it('a doc without segment ids and a 500 m+ step is only "unverified" (reported, never repaired)', () => {
    const r = analyzeGapDoc(doc({ trailKind: 'generated', segmentIds: undefined, segmentForward: undefined, origin: 'osm_import' }));
    expect(r).toMatchObject({ affected: true, basis: 'path_gap_unverified', discontinuities: null });
  });

  it('only pending + unpublished osm_import docs are in repair scope', () => {
    expect(isRepairScope({ origin: 'osm_import', status: 'pending', published: false })).toBe(true);
    expect(isRepairScope({ origin: 'osm_import', status: 'published', published: true })).toBe(false);
    expect(isRepairScope({ origin: 'osm_import', status: 'archived', published: false })).toBe(false);
    expect(isRepairScope({ origin: 'super_admin', status: 'pending', published: false })).toBe(false);
    expect(analyzeGapDoc(doc({ published: true, status: 'published' })).inRepairScope).toBe(false);
  });
});

describe('estimateParts', () => {
  it('cuts at the longest steps and counts what would become routes (300 m main / 800 m parts)', () => {
    const path = [...dense(35.0, 30), ...dense(35.5, 12), ...dense(36.0, 3)]; // ~2.8 km | ~1.0 km | ~0.2 km
    const e = estimateParts(path, 2);
    expect(e.pieceM).toHaveLength(3);
    expect(e.pieceM[0]).toBeGreaterThan(e.pieceM[1]);
    expect(e.expectedRoutes).toBe(2);
    expect(estimateParts(path, 0).pieceM).toHaveLength(1);
  });
});

describe('gap archive writer', () => {
  const ts = { toMillis: () => 1 } as never;
  it('payload is exactly the approval-center reject shape', () => {
    const p = gapArchivePayload({ id: 'x', authorityId: 'a', city: 'c', updateTime: ts }, new Set(['a']));
    expect(p).toEqual({ published: false, status: 'archived', rejectionReason: 'geometry gap — regenerate', reviewedBy: 'script:repair-route-geometry-gaps' });
  });

  it('writes with an updateTime precondition per doc, never deletes, and reports stale docs as conflicts', async () => {
    const calls: Array<{ id: string; opts: unknown; stale?: boolean }> = [];
    const staleIds = new Set(['stale']);
    const mk = (id: string) => ({ id });
    const db = {
      collection: () => ({ doc: (id: string) => mk(id) }),
      batch: () => {
        const ops: Array<{ ref: { id: string }; opts: unknown }> = [];
        return {
          update: (ref: { id: string }, _p: unknown, opts: unknown) => { ops.push({ ref, opts }); },
          commit: async () => { if (ops.some((o) => staleIds.has(o.ref.id))) throw new Error('FAILED_PRECONDITION'); ops.forEach((o) => calls.push({ id: o.ref.id, opts: o.opts })); },
          delete: () => { throw new Error('never delete'); },
        };
      },
    };
    // single-doc fallback path
    (db as any).collection = () => ({ doc: (id: string) => ({ id, update: async (_p: unknown, opts: unknown) => { if (staleIds.has(id)) throw new Error('FAILED_PRECONDITION'); calls.push({ id, opts }); } }) });
    const w = (id: string) => ({ id, authorityId: 'a', city: null, updateTime: ts });
    const res = await applyGapArchives(db as never, [w('ok1'), w('stale'), w('ok2')], new Set(['a']), { log: () => {} });
    expect(res.written).toBe(2);
    expect(res.conflicts).toEqual(['official_routes/stale']);
    expect(calls.every((c) => (c.opts as { lastUpdateTime: unknown }).lastUpdateTime === ts)).toBe(true);
  });
});
