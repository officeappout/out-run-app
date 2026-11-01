/**
 * Test harness for the official-routes catalog (data-exposure plan 1.3).
 * `catalogFetch` stands in for the network: it runs the REAL server builder
 * (official-routes-catalog.server.ts) against `fakeAdminDb`, and round-trips
 * the JSON, so a client test still observes the exact Firestore queries the
 * selection makes, in the same `{ type, field, op, value }` shape the
 * client-SDK mocks used before the read moved server-side.
 */
export type Row = { id: string; data: Record<string, unknown> };
export type Recorded = { col: string; constraints: Array<Record<string, unknown>> };
export interface FakeDbState {
  docs: Row[];
  queries?: Recorded[];
  reads?: number;
}

export function fakeAdminDb(state: FakeDbState) {
  const build = (col: string, constraints: Array<Record<string, unknown>>) => ({
    where: (field: string, op: string, value: unknown) => build(col, [...constraints, { type: 'where', field, op, value }]),
    limit: (n: number) => build(col, [...constraints, { type: 'limit', value: n }]),
    get: async () => {
      state.queries?.push({ col, constraints });
      if (state.reads !== undefined) state.reads++;
      let rows = state.docs;
      let lim = Infinity;
      for (const c of constraints) {
        if (c.type === 'limit') lim = c.value as number;
        if (c.type === 'where' && c.op === 'in') rows = rows.filter((d) => (c.value as unknown[]).includes(d.data[c.field as string]));
        if (c.type === 'where' && c.op === '==') rows = rows.filter((d) => d.data[c.field as string] === c.value);
      }
      const docs = rows.slice(0, lim).map((d) => ({ id: d.id, data: () => d.data }));
      return { docs, size: docs.length, empty: docs.length === 0 };
    },
  });
  return { collection: (name: string) => build(name, []) };
}

export async function catalogFetch(input: string | URL | Request): Promise<Response> {
  const { buildOfficialRoutesCatalog, parseCatalogSelection } = await import('@/lib/route-catalog/official-routes-catalog.server');
  const url = new URL(String(input), 'http://test.local');
  if (url.pathname !== '/api/catalog/routes') return new Response('not found', { status: 404 });
  const sel = parseCatalogSelection(url.searchParams);
  if (sel === null) return new Response('{}', { status: 400 });
  return new Response(JSON.stringify(await buildOfficialRoutesCatalog(sel)), { status: 200 });
}
