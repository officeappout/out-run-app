import { describe, it, expect } from 'vitest';
import { collectQueryPages, envInt, forEachQueryPage, mapWithConcurrency, type PageableQuery } from '../paginate';

/** Fake ordered query over ids: limit + startAfter(doc) like Firestore. */
function fakeQuery(ids: string[], reads: { n: number } = { n: 0 }, after: string | null = null, lim = Infinity): PageableQuery<{ id: string }> {
  return {
    limit: (n) => fakeQuery(ids, reads, after, n),
    startAfter: (c) => fakeQuery(ids, reads, c.id, lim),
    get: async () => {
      const start = after === null ? 0 : ids.indexOf(after) + 1;
      const docs = ids.slice(start, start + (Number.isFinite(lim) ? lim : ids.length)).map((id) => ({ id }));
      reads.n += docs.length;
      return { docs };
    },
  };
}

const ids = (n: number) => Array.from({ length: n }, (_, i) => `u${String(i).padStart(4, '0')}`);

describe('forEachQueryPage', () => {
  it('reads every doc once, in pages, past the old single-page cap', async () => {
    const seen: string[] = [];
    const stats = await forEachQueryPage(fakeQuery(ids(1234)), { pageSize: 300, maxPages: 20 }, (docs) => {
      seen.push(...docs.map((d) => d.id));
    });
    expect(seen).toEqual(ids(1234));
    expect(stats).toEqual({ pages: 5, read: 1234, truncated: false });
  });

  it('an exact multiple of the page size ends on the empty page', async () => {
    const stats = await forEachQueryPage(fakeQuery(ids(600)), { pageSize: 300, maxPages: 20 }, () => {});
    expect(stats).toEqual({ pages: 3, read: 600, truncated: false });
  });

  it('stops at maxPages and says it was truncated', async () => {
    const reads = { n: 0 };
    const stats = await forEachQueryPage(fakeQuery(ids(1000), reads), { pageSize: 100, maxPages: 3 }, () => {});
    expect(stats).toEqual({ pages: 3, read: 300, truncated: true });
    expect(reads.n).toBe(300);
  });

  it('empty query → one read, no callback', async () => {
    let calls = 0;
    const stats = await forEachQueryPage(fakeQuery([]), { pageSize: 50, maxPages: 5 }, () => {
      calls++;
    });
    expect(calls).toBe(0);
    expect(stats).toEqual({ pages: 1, read: 0, truncated: false });
  });

  it('collectQueryPages returns all docs', async () => {
    const r = await collectQueryPages(fakeQuery(ids(501)), { pageSize: 500, maxPages: 10 });
    expect(r.docs.length).toBe(501);
    expect(r.truncated).toBe(false);
  });
});

describe('mapWithConcurrency', () => {
  it('keeps order and never exceeds the width', async () => {
    let inFlight = 0;
    let peak = 0;
    const out = await mapWithConcurrency(ids(57), 10, async (id, i) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, (i * 7) % 5));
      inFlight--;
      return id.toUpperCase();
    });
    expect(out).toEqual(ids(57).map((s) => s.toUpperCase()));
    expect(peak).toBeLessThanOrEqual(10);
    expect(peak).toBeGreaterThan(1);
  });

  it('empty input', async () => {
    expect(await mapWithConcurrency([], 10, async () => 1)).toEqual([]);
  });
});

describe('envInt', () => {
  it('falls back on missing / invalid / out of range', () => {
    expect(envInt(undefined, 300, 500)).toBe(300);
    expect(envInt('abc', 300, 500)).toBe(300);
    expect(envInt('0', 300, 500)).toBe(300);
    expect(envInt('900', 300, 500)).toBe(300);
    expect(envInt('250', 300, 500)).toBe(250);
  });
});
