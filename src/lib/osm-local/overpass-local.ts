/**
 * A local Overpass interpreter for the QL subset geo-discovery actually sends
 * (scripts/geo-discovery-routes.ts + scripts/lib/route-quality-osm-fetch.node.ts),
 * answered from a LocalOsmStore (Geofabrik PBF / region snapshot) instead of
 * the public Overpass mirrors (RC6 step 4, W1). Returns the same JSON shape
 * (`{ elements: [...] }`, `out geom` geometry as {lat,lon}), so every caller
 * stays unchanged.
 *
 * Supported: `[out:json][timeout:N];` · `area["wikidata"="Q…"]->.a;` ·
 * way/rel/relation/node with `["k"]`, `["k"="v"]`, `["k"!="v"]`, `["k"~"re"]`,
 * `["k"!~"re"]` filters and a `(s,w,n,e)` / `(area.a)` / `(<id>)` scope ·
 * unions `( … );` with `.set` and `>` (recurse down) · `->.name` · `.set out …;`
 * and `out …;` with `tags` / `geom`. Anything else throws — loudly, never a
 * silent empty answer (the "0 that isn't really 0" trap).
 *
 * Scope semantics (documented approximation of Overpass): a way is in a bbox
 * when a vertex is inside or a segment's extent overlaps it; in an area when a
 * vertex is inside; a relation when any member is.
 */
import { createLocalOsmStore, inBbox, inRings, lineTouchesBbox, type Bbox, type LatLon, type LocalOsmStore } from './store';
import type { OsmData } from '../trail-graph/types';

type Kind = 'node' | 'way' | 'relation';
type Ref = `${'n' | 'w' | 'r'}${number}`;
type Filter = { key: string; op: 'exists' | '=' | '!=' | '~' | '!~'; value?: string; re?: RegExp };
type Scope = { kind: 'bbox'; bbox: Bbox } | { kind: 'area'; set: string } | { kind: 'id'; id: number } | null;

export class UnsupportedOverpassQuery extends Error {
  constructor(msg: string, public query: string) {
    super(`local overpass: ${msg} — in: ${query.slice(0, 200)}`);
    this.name = 'UnsupportedOverpassQuery';
  }
}

interface Ctx { store: LocalOsmStore; sets: Map<string, Set<Ref>>; areas: Map<string, LatLon[][]>; q: string }

const refOf = (k: Kind, id: number): Ref => `${k === 'node' ? 'n' : k === 'way' ? 'w' : 'r'}${id}` as Ref;

class Cursor {
  i = 0;
  constructor(public s: string, private q: string) {}
  ws() { while (this.i < this.s.length && /\s/.test(this.s[this.i])) this.i++; }
  peek(str: string) { this.ws(); return this.s.startsWith(str, this.i); }
  eat(str: string) { if (!this.peek(str)) throw new UnsupportedOverpassQuery(`expected "${str}" at ${this.i}`, this.q); this.i += str.length; }
  word(): string { this.ws(); const m = /^[A-Za-z_][A-Za-z0-9_:]*/.exec(this.s.slice(this.i)); if (!m) throw new UnsupportedOverpassQuery(`expected a word at ${this.i}`, this.q); this.i += m[0].length; return m[0]; }
  quoted(): string {
    this.eat('"');
    let out = '';
    while (this.i < this.s.length && this.s[this.i] !== '"') { if (this.s[this.i] === '\\') this.i++; out += this.s[this.i++]; }
    this.eat('"');
    return out;
  }
  until(ch: string): string { const j = this.s.indexOf(ch, this.i); if (j < 0) throw new UnsupportedOverpassQuery(`missing "${ch}"`, this.q); const v = this.s.slice(this.i, j); this.i = j; return v; }
  done() { this.ws(); return this.i >= this.s.length; }
}

function parseFilters(c: Cursor): Filter[] {
  const out: Filter[] = [];
  while (c.peek('[')) {
    c.eat('[');
    const key = c.quoted();
    c.ws();
    let f: Filter = { key, op: 'exists' };
    for (const op of ['!~', '!=', '~', '='] as const) {
      if (c.peek(op)) { c.eat(op); const value = c.quoted(); f = { key, op, value, ...(op.includes('~') ? { re: new RegExp(value) } : {}) }; break; }
    }
    c.eat(']');
    out.push(f);
  }
  return out;
}

function parseScope(c: Cursor): Scope {
  if (!c.peek('(')) return null;
  c.eat('(');
  const body = c.until(')').trim();
  c.eat(')');
  const area = /^area\.([A-Za-z_][A-Za-z0-9_]*)$/.exec(body);
  if (area) return { kind: 'area', set: area[1] };
  const nums = body.split(',').map((x) => Number(x.trim()));
  if (nums.length === 4 && nums.every(Number.isFinite)) return { kind: 'bbox', bbox: { s: nums[0], w: nums[1], n: nums[2], e: nums[3] } };
  if (nums.length === 1 && Number.isInteger(nums[0])) return { kind: 'id', id: nums[0] };
  throw new UnsupportedOverpassQuery(`unsupported scope "(${body})"`, c.s);
}

const tagsMatch = (tags: Record<string, string>, fs: Filter[]) => fs.every((f) => {
  const v = tags[f.key];
  switch (f.op) {
    case 'exists': return v !== undefined;
    case '=': return v === f.value;
    case '!=': return v !== f.value;
    case '~': return v !== undefined && f.re!.test(v);
    case '!~': return v === undefined || !f.re!.test(v);
  }
});

function wayInScope(ctx: Ctx, id: number, scope: Scope): boolean {
  if (!scope) return true;
  const g = ctx.store.wayGeometry(id);
  if (scope.kind === 'bbox') return lineTouchesBbox(g, scope.bbox);
  if (scope.kind === 'area') { const rings = ctx.areas.get(scope.set) ?? []; return g.some((p) => inRings(p, rings)); }
  return id === scope.id;
}

function nodeInScope(ctx: Ctx, id: number, scope: Scope): boolean {
  const n = ctx.store.data.nodes.get(id);
  if (!scope) return !!n;
  if (!n) return false;
  if (scope.kind === 'bbox') return inBbox(n, scope.bbox);
  if (scope.kind === 'area') return inRings(n, ctx.areas.get(scope.set) ?? []);
  return id === scope.id;
}

function runQuery(ctx: Ctx, kind: string, filters: Filter[], scope: Scope): Set<Ref> {
  const { data } = ctx.store;
  const res = new Set<Ref>();
  if (kind === 'way') {
    for (const w of Array.from(data.ways.values())) if (tagsMatch(w.tags, filters) && wayInScope(ctx, w.id, scope)) res.add(refOf('way', w.id));
  } else if (kind === 'rel' || kind === 'relation') {
    for (const r of Array.from(data.relations.values())) {
      if (!tagsMatch(r.tags, filters)) continue;
      if (scope?.kind === 'id') { if (r.id === scope.id) res.add(refOf('relation', r.id)); continue; }
      if (!scope || r.members.some((m) => (m.type === 'w' ? wayInScope(ctx, m.ref, scope) : m.type === 'n' ? nodeInScope(ctx, m.ref, scope) : false))) res.add(refOf('relation', r.id));
    }
  } else if (kind === 'node') {
    for (const n of Array.from(data.nodes.values())) if (tagsMatch(n.tags, filters) && nodeInScope(ctx, n.id, scope)) res.add(refOf('node', n.id));
  } else {
    throw new UnsupportedOverpassQuery(`unsupported element type "${kind}"`, ctx.q);
  }
  return res;
}

function recurseDown(ctx: Ctx, input: Set<Ref>): Set<Ref> {
  const { data } = ctx.store;
  const res = new Set<Ref>();
  const addWayNodes = (id: number) => { for (const n of data.ways.get(id)?.nodes ?? []) res.add(refOf('node', n)); };
  for (const ref of Array.from(input)) {
    const id = Number(ref.slice(1));
    if (ref[0] === 'w') addWayNodes(id);
    else if (ref[0] === 'r') {
      for (const m of data.relations.get(id)?.members ?? []) {
        if (m.type === 'w' && data.ways.has(m.ref)) { res.add(refOf('way', m.ref)); addWayNodes(m.ref); }
        else if (m.type === 'n' && data.nodes.has(m.ref)) res.add(refOf('node', m.ref));
      }
    }
  }
  return res;
}

function element(ctx: Ctx, ref: Ref, geom: boolean): unknown {
  const { data } = ctx.store;
  const id = Number(ref.slice(1));
  if (ref[0] === 'n') { const n = data.nodes.get(id)!; return { type: 'node', id, lat: n.lat, lon: n.lon, ...(Object.keys(n.tags).length ? { tags: n.tags } : {}) }; }
  if (ref[0] === 'w') {
    const w = data.ways.get(id)!;
    return { type: 'way', id, ...(geom ? { nodes: w.nodes, geometry: ctx.store.wayGeometry(id) } : {}), ...(Object.keys(w.tags).length ? { tags: w.tags } : {}) };
  }
  const r = data.relations.get(id)!;
  const members = geom
    ? r.members.map((m) => {
      const type = m.type === 'n' ? 'node' : m.type === 'w' ? 'way' : 'relation';
      if (m.type === 'w') return { type, ref: m.ref, role: m.role, geometry: ctx.store.wayGeometry(m.ref) };
      if (m.type === 'n') { const n = data.nodes.get(m.ref); return { type, ref: m.ref, role: m.role, ...(n ? { lat: n.lat, lon: n.lon } : {}) }; }
      return { type, ref: m.ref, role: m.role };
    })
    : undefined;
  return { type: 'relation', id, ...(members ? { members } : {}), ...(Object.keys(r.tags).length ? { tags: r.tags } : {}) };
}

function emit(ctx: Ctx, set: Set<Ref>, opts: string[], list: unknown[]) {
  const geom = opts.includes('geom');
  if (opts.some((o) => o !== 'geom' && o !== 'tags' && o !== 'body')) throw new UnsupportedOverpassQuery(`unsupported out option(s) ${opts.join(' ')}`, ctx.q);
  const order = { n: 0, w: 1, r: 2 } as const;
  const refs = Array.from(set).sort((a, b) => order[a[0] as 'n'] - order[b[0] as 'n'] || Number(a.slice(1)) - Number(b.slice(1)));
  for (const ref of refs) list.push(element(ctx, ref, geom));
}

function outOpts(c: Cursor): string[] {
  // `out tags` = tags only (no geometry/members); `out geom` / `out geom tags` = full.
  const raw = c.until(';').trim();
  return raw ? raw.split(/\s+/) : [];
}

/** One statement inside a union: a query, `.set`, or `>`. */
function unionMember(ctx: Ctx, c: Cursor, last: Set<Ref>): Set<Ref> {
  if (c.peek('>')) { c.eat('>'); return recurseDown(ctx, last); }
  if (c.peek('.')) { c.eat('.'); const name = c.peek('_') ? (c.eat('_'), '_') : c.word(); return new Set(ctx.sets.get(name) ?? []); }
  const kind = c.word();
  return runQuery(ctx, kind, parseFilters(c), parseScope(c));
}

export function runLocalOverpass(ql: string, storeOrData: LocalOsmStore | OsmData): { elements: unknown[] } {
  const store = 'wayGeometry' in storeOrData ? storeOrData : createLocalOsmStore(storeOrData);
  const ctx: Ctx = { store, sets: new Map(), areas: new Map(), q: ql };
  const c = new Cursor(ql, ql);
  const list: unknown[] = [];
  const assign = (res: Set<Ref>) => {
    if (c.peek('->')) { c.eat('->'); c.eat('.'); ctx.sets.set(c.word(), res); } else ctx.sets.set('_', res);
  };
  while (c.peek('[')) { c.eat('['); c.until(']'); c.eat(']'); }
  if (c.peek(';')) c.eat(';');
  while (!c.done()) {
    if (c.peek('(')) {
      c.eat('(');
      const acc = new Set<Ref>();
      let last = new Set(ctx.sets.get('_') ?? []);
      while (!c.peek(')')) {
        last = unionMember(ctx, c, last);
        last.forEach((r) => acc.add(r));
        c.eat(';');
      }
      c.eat(')');
      assign(acc);
    } else if (c.peek('.')) {
      c.eat('.');
      const name = c.peek('_') ? (c.eat('_'), '_') : c.word();
      if (!c.peek('out')) throw new UnsupportedOverpassQuery(`expected "out" after .${name}`, ql);
      c.eat('out');
      emit(ctx, ctx.sets.get(name) ?? new Set(), outOpts(c), list);
    } else if (c.peek('out')) {
      c.eat('out');
      emit(ctx, ctx.sets.get('_') ?? new Set(), outOpts(c), list);
    } else {
      const kind = c.word();
      const filters = parseFilters(c);
      if (kind === 'area') {
        const wd = filters.find((f) => f.key === 'wikidata' && f.op === '=');
        if (!wd || filters.length !== 1) throw new UnsupportedOverpassQuery('area[] supports only ["wikidata"="Q…"]', ql);
        c.eat('->'); c.eat('.');
        ctx.areas.set(c.word(), store.areaRings(wd.value!));
      } else {
        assign(runQuery(ctx, kind, filters, parseScope(c)));
      }
    }
    c.eat(';');
  }
  return { elements: list };
}
