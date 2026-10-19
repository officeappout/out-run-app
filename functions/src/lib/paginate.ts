/**
 * Bounded pagination + bounded concurrency for scheduled functions
 * (architecture audit, 19.10.2026).
 *
 * Same cursor pattern as retentionScheduler.collectRetentionCandidates: read
 * a query in pages of `pageSize`, each page starting after the last doc of
 * the previous one, and stop at `maxPages` so one run can never read an
 * unbounded number of docs. No Firebase import — the query only has to offer
 * limit / startAfter / get, so the helpers are unit-testable with a fake.
 *
 * Ordering: without an explicit orderBy, Firestore orders by document id, and
 * startAfter(<last doc snapshot>) continues from that doc — so an equality /
 * array-contains query pages correctly with no composite index.
 */

export interface PageableQuery<D> {
  limit(n: number): PageableQuery<D>;
  startAfter(cursor: D): PageableQuery<D>;
  get(): Promise<{ docs: D[] }>;
}

export interface PageOpts {
  pageSize: number;
  maxPages: number;
}

export interface PageRunStats {
  /** Pages actually read. */
  pages: number;
  /** Docs read over all pages. */
  read: number;
  /** The last page was full when maxPages stopped the run — there may be more. */
  truncated: boolean;
}

/**
 * Calls `onPage` for every page of `query` (in order, one page at a time, so
 * at most one page of docs is in memory at once). A failing page read throws;
 * pages already handed to onPage stay handled.
 */
export async function forEachQueryPage<D>(
  query: PageableQuery<D>,
  o: PageOpts,
  onPage: (docs: D[], pageIndex: number) => Promise<void> | void,
): Promise<PageRunStats> {
  const pageSize = Math.max(1, Math.floor(o.pageSize));
  const maxPages = Math.max(1, Math.floor(o.maxPages));
  let cursor: D | null = null;
  let read = 0;
  for (let page = 0; page < maxPages; page++) {
    let q = query.limit(pageSize);
    if (cursor !== null) q = q.startAfter(cursor);
    const snap = await q.get();
    read += snap.docs.length;
    if (snap.docs.length > 0) await onPage(snap.docs, page);
    if (snap.docs.length < pageSize) return { pages: page + 1, read, truncated: false };
    cursor = snap.docs[snap.docs.length - 1];
  }
  return { pages: maxPages, read, truncated: true };
}

/** Every doc of every page (bounded by maxPages) — for small docs only. */
export async function collectQueryPages<D>(query: PageableQuery<D>, o: PageOpts): Promise<{ docs: D[] } & PageRunStats> {
  const all: D[] = [];
  const stats = await forEachQueryPage(query, o, (docs) => {
    all.push(...docs);
  });
  return { ...stats, docs: all };
}

/**
 * Runs `fn` over `items` with at most `concurrency` calls in flight, and
 * returns the results in input order. A rejected call rejects the whole run —
 * callers that want per-item isolation catch inside `fn` (as every scheduler
 * here does, so one user's failure never stops the rest).
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  const width = Math.max(1, Math.min(Math.floor(concurrency) || 1, items.length));
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: width }, worker));
  return out;
}

/** Positive integer from an env var, or the fallback (clamped to [1, max]). */
export function envInt(raw: string | undefined, fallback: number, max: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 && n <= max ? Math.floor(n) : fallback;
}
