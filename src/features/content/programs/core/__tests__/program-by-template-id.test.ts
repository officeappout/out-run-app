import { describe, it, expect, vi, beforeEach } from 'vitest';

// Prod `programs` snapshot (read-only recon 2026-10-19): several programs share
// movementPattern 'push' / 'pull'; the base program is NOT the first by doc id.
const DOCS: Array<{ id: string; data: Record<string, unknown> }> = [
  { id: 'EtY8YCol0qpF6DzgcTx1', data: { name: 'דגל אנושי', movementPattern: 'push', slug: 'human_flag' } },
  { id: 'H2279XsRGDg9G370J7S9', data: { name: 'כל הגוף', slug: 'full_body', isMaster: true } },
  { id: 'IOfBZFeorTTDkcz3tOA6', data: { name: 'עמידת ידיים', movementPattern: 'push', slug: 'handstand' } },
  { id: 'J0fLpmJhG0KDN2tQouxh', data: { name: 'דחיפה', movementPattern: 'push', slug: 'push' } },
  { id: 'OrAmOH3F375dVio5yGdU', data: { name: 'רגליים', movementPattern: 'legs', slug: 'legs' } },
  { id: 'UPDBtTdCvX748dtBlWYj', data: { name: 'משיכה', movementPattern: 'pull', slug: 'pull' } },
  { id: 'cC0BOmm6KIqYAyQynEIo', data: { name: 'מתח יד אחת', movementPattern: 'pull', slug: 'one_arm_pullup' } },
  { id: 'fTLWzjP9gH2VNpamyCZF', data: { name: 'עליית כוח', movementPattern: 'pull', slug: 'muscle_up' } },
  { id: 'kDMpobbKsuVTByTIKUpe', data: { name: 'ליבה', movementPattern: 'core', slug: 'core' } },
  { id: 'pCI5NHXpowu2ySucqDn8', data: { name: 'פלאנץ׳', movementPattern: 'push', slug: 'planche' } },
];

let docs = DOCS;

vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => {
  const toSnap = (list: typeof DOCS) => ({
    empty: list.length === 0,
    docs: list.map((d) => ({ id: d.id, data: () => d.data })),
  });
  return {
    collection: () => ({ __col: true }),
    doc: (_db: unknown, _col: string, id: string) => ({ __id: id }),
    getDoc: async (ref: { __id: string }) => {
      const d = docs.find((x) => x.id === ref.__id);
      return { id: ref.__id, exists: () => !!d, data: () => d?.data ?? {} };
    },
    where: (field: string, _op: string, value: unknown) => ({ field, value }),
    limit: (n: number) => ({ limit: n }),
    query: (_c: unknown, ...cs: Array<{ field?: string; value?: unknown; limit?: number }>) => ({ cs }),
    getDocs: async (q: { cs?: Array<{ field?: string; value?: unknown; limit?: number }> }) => {
      let list = [...docs].sort((a, b) => a.id.localeCompare(b.id));
      for (const c of q.cs ?? []) {
        if (c.field) list = list.filter((d) => d.data[c.field!] === c.value);
        if (c.limit) list = list.slice(0, c.limit);
      }
      return toSnap(list);
    },
    addDoc: vi.fn(), updateDoc: vi.fn(), deleteDoc: vi.fn(), orderBy: vi.fn(),
    serverTimestamp: () => 'TS', Timestamp: class {},
  };
});

import { getProgramByTemplateId, pickMovementPatternMatch } from '../program.service';

beforeEach(() => { docs = DOCS; });

describe('getProgramByTemplateId — shared movementPattern', () => {
  it.each([
    ['push', 'דחיפה'],
    ['pull', 'משיכה'],
    ['legs', 'רגליים'],
    ['core', 'ליבה'],
    ['human_flag', 'דגל אנושי'],
    ['one_arm_pullup', 'מתח יד אחת'],
    ['handstand', 'עמידת ידיים'],
    ['muscle_up', 'עליית כוח'],
    ['full_body', 'כל הגוף'],
  ])('%s resolves to its own program (%s)', async (slug, name) => {
    expect((await getProgramByTemplateId(slug))?.name).toBe(name);
  });

  it('never returns a sibling skill when the base program is missing', async () => {
    docs = DOCS.filter((d) => d.data.slug !== 'push');
    const p = await getProgramByTemplateId('push');
    expect(p).toBeNull();
  });

  it('still resolves a legacy slug-less doc via movementPattern', async () => {
    docs = [
      DOCS[0],
      { id: 'zzLegacyPush', data: { name: 'דחיפה', movementPattern: 'push' } },
    ];
    expect((await getProgramByTemplateId('push'))?.id).toBe('zzLegacyPush');
  });
});

describe('pickMovementPatternMatch', () => {
  it('prefers exact slug, then slug-less, never a foreign slug', () => {
    const a = { id: 'a', data: { slug: 'human_flag' } };
    const b = { id: 'b', data: {} };
    const c = { id: 'c', data: { slug: 'push' } };
    expect(pickMovementPatternMatch([a, b, c], 'push')).toBe(c);
    expect(pickMovementPatternMatch([a, b], 'push')).toBe(b);
    expect(pickMovementPatternMatch([a], 'push')).toBeNull();
  });
});
