import { describe, expect, it } from 'vitest';
import { disambiguateByKm, geometryOverlap, isTrueDuplicate, planCleanup, shortAuthorityName, stripOsmCode, type CleanupDoc } from '../dedupe';
import { runAuthorityStages, type CandidateRoute, type StageProvider } from '../stages';

const line = (lng0: number, n: number, lat = 31): [number, number][] => Array.from({ length: n }, (_, i) => [lng0 + i * 0.0005, lat] as [number, number]); // ≈ 47 m / step
const doc = (id: string, name: string, auth: string, path: [number, number][], inside: number | null = 1): CleanupDoc => ({ id, name, authorityId: auth, authorityShort: shortAuthorityName(`מועצה אזורית ${auth}`), km: path.length * 0.047, path, insideShare: inside });

describe('stripOsmCode', () => {
  it.each([
    ['שביל אדום 10340 · נחל שורק', 'שביל אדום · נחל שורק'],
    ['שביל כחול 12135 · נחל גוברין', 'שביל כחול · נחל גוברין'],
    ['שביל שחור 3628 · בית המוכתר', 'שביל שחור · בית המוכתר'],
    ['שביל ירוק 4380', 'שביל ירוק'],
    ['שביל אדום · נחל שורק · 10340', 'שביל אדום · נחל שורק'],
  ])('%s', (a, b) => expect(stripOsmCode(a)).toBe(b));
  it('keeps real short numbers and non-trail names', () => {
    for (const n of ['מסלול 5', 'אהוד 10', 'לאורך אהוד 10 · הלוך-חזור', 'שביל מספר 5 · נחל', 'לולאת דורות · 7.5 ק״מ', 'שביל ישראל', 'כביש 6677 הישן']) expect(stripOsmCode(n)).toBe(n);
  });
});

describe('geometry classification', () => {
  it('same geometry = true duplicate; disjoint sections of the same trail are not', () => {
    expect(isTrueDuplicate(line(34, 40), line(34, 40))).toBe(true);
    expect(geometryOverlap(line(34, 40), line(34.1, 40))).toBe(0);
    expect(isTrueDuplicate(line(34, 40), line(34.1, 40))).toBe(false);
  });
  it('a short piece lying on a long route counts as duplicate; 30% overlap does not', () => {
    expect(isTrueDuplicate(line(34, 60), line(34.005, 20))).toBe(true);
    expect(isTrueDuplicate(line(34, 40), line(34.0135, 40))).toBe(false);
  });
});

describe('planCleanup', () => {
  it('true duplicate: keeps the copy with the larger inside-boundary share, archives the other', () => {
    const { actions, groups } = planCleanup([doc('a', 'שביל גולני', 'גולן', line(34, 40), 0.4), doc('b', 'שביל גולני', 'לכיש', line(34, 40), 0.9)]);
    expect(actions.get('b')!.kind).toBe('untouched');
    expect(actions.get('a')).toMatchObject({ kind: 'duplicate', duplicateOf: 'b' });
    expect(groups[0]).toMatchObject({ trueDuplicates: 1, keptDistinct: 1 });
  });
  it('different sections: all kept, names disambiguated with the council', () => {
    const { actions } = planCleanup([doc('a', 'שביל ישראל', 'גולן', line(34, 40)), doc('b', 'שביל ישראל', 'לכיש', line(34.2, 40)), doc('c', 'שביל ישראל', 'עמק חפר', line(34.4, 40))]);
    expect(actions.get('a')).toMatchObject({ kind: 'rename_disambiguated', rename: 'שביל ישראל · קטע גולן' });
    expect(actions.get('b')!.rename).toBe('שביל ישראל · קטע לכיש');
    expect(Array.from(actions.values()).filter((x) => x.kind === 'duplicate')).toHaveLength(0);
  });
  it('code stripping that collides inside one council falls back to km, unique names', () => {
    const { actions } = planCleanup([doc('a', 'שביל אדום 10340 · נחל שורק', 'שורק', line(34, 30)), doc('b', 'שביל אדום 10341 · נחל שורק', 'שורק', line(34.3, 50))]);
    const names = [actions.get('a')!.rename, actions.get('b')!.rename];
    expect(new Set(names).size).toBe(2);
    expect(names.every((n) => /^שביל אדום · נחל שורק · \d+\.\d ק״מ$/.test(n!))).toBe(true);
  });
  it('unique names: code-only rename, others untouched', () => {
    const { actions } = planCleanup([doc('a', 'שביל כחול 12135 · נחל גוברין', 'x', line(34, 30)), doc('b', 'מסלול 5', 'x', line(35, 30))]);
    expect(actions.get('a')).toMatchObject({ kind: 'rename_code', rename: 'שביל כחול · נחל גוברין' });
    expect(actions.get('b')!.kind).toBe('untouched');
  });
});

describe('disambiguateByKm', () => {
  it('only colliding names change', () => {
    const m = disambiguateByKm([{ id: 'a', name: 'X', km: 1.25 }, { id: 'b', name: 'X', km: 3 }, { id: 'c', name: 'Y', km: 2 }]);
    expect(Array.from(m.keys()).sort()).toEqual(['a', 'b']);
  });
});

describe('runAuthorityStages externalDuplicate + regional cap', () => {
  const cand = (id: string, k: number): CandidateRoute => ({ id, stage: 'osm', isNew: true, data: { name: `שביל ${id}`, distance: 5, routeShape: 'loop', activityType: 'walking', path: line(34 + k * 0.01, 60).map(([lng, lat]) => ({ lng, lat })) } });
  const prov = (routes: CandidateRoute[]): StageProvider => ({ key: 'osm', run: async () => ({ routes }) });
  it('drops a candidate the hook flags and counts it as a duplicate', async () => {
    const r = await runAuthorityStages({ id: 'A', type: 'regional_council' }, [prov([cand('t1', 1), cand('t2', 2)])], new Date(), { externalDuplicate: async (c) => (c.id === 't2' ? 'other' : null) });
    expect(r.pool.map((p) => p.id)).toEqual(['t1']);
    expect(r.stages.find((s) => s.key === 'osm')!.droppedDuplicate).toBe(1);
  });
});
