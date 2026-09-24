// LIVE WRITE SCRIPT — authorized by explicit "GO" from David, 23.08.2026.
// Executes the differentiated Haifa park-loop replacement:
//   1. Referential cleanup: delete the 18 street_segments docs broadcast from the
//      published fake (הקפת גן הזיכרון) — found by the read-only ref-check.
//   2. 7 survivors: in-place geometry update via externalId match, buildValidatedDoc
//      (mode:'update'), moderation fields (status/published) preserved exactly.
//   3. Archive the 1 published fake: published:false, status:'archived' (soft, reversible).
//   4. Hard-delete the 13 pending fakes (last — least reversible, done only after
//      everything else has succeeded).
// Order is deliberately safety-first -> most-reversible-last: cleanup, then updates,
// then archive, then hard delete.
import * as https from 'https';
import * as zlib from 'zlib';
import * as admin from 'firebase-admin';

function initFb() {
  const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
  return admin.firestore();
}

const HAIFA_AUTHORITY_ID = '9ZdWFmlkP0njOyFPceEw';
const HAIFA_LABEL = 'חיפה';
const HAIFA_BBOX = { latMin: 32.734, lonMin: 34.9296, latMax: 32.854, lonMax: 35.0496 };
const BATCH_ID = 'haifa-geodiscovery-2026-08-19';

const DELETE_IDS = [
  '0arTwkOnlK3rvNqh5K9H', '2t8j7BmjwagCOdhqoxBO', '5qd1HWr0fkw6kHsjWzRa', '7HqEKVjbHzMzZbw2OmHc',
  'GPOgLShWca551I0KCInx', 'H0uzsinpKK0jUje6GDVM', 'HymTMD9lckO959MHWpv8', 'PFH1hOgcwPP5CTgsRi6c',
  'PgpBcxXj2HJlmUxkWRXK', 'muF5Jd97zNaHaui8QMxR', 'tDhlGTynusMi4K8H4DBc', 'uJbCVktXixlZqkEEkdW3',
  'xX4gMEr8tleqWd8Q1xjh',
];
const ARCHIVE_ID = '6shDNCtlTqSLfygsjC0b';
const SURVIVOR_IDS: Record<string, string> = {
  'הקפת גן אלכס': 'U9YDRZvG5ZIqcmJL3uYl',
  'הקפת גן המייסדים': 'QEcSKlc2hb8wLTrgg01l',
  'הקפת גן לוקיי': 'IaU8SeGpqVH8ANn5Sxja',
  'הקפת גן קיסלק': 'PsQHH7nAgAnCAAdPedKr',
  'הקפת ספורטק חיפה': 'ccRfP8C8TNCZmbt6zoV2',
  'הקפת גן אופירה': '1cdHqaFSOSHipeQWLpQN',
  'הקפת פארק הלוחם היהודי': '7WlKBvfSaWvWDGde0YpG',
};
const SURVIVOR_PARK_NAMES = ['גן אלכס', 'גן המייסדים', 'גן לוקיי', 'גן קיסלק', 'ספורטק חיפה', 'גן אופירה', 'פארק הלוחם היהודי'];

// ─── verbatim geometry/graph logic, matching the committed geo-discovery-routes.ts (ca67b5d3) ───
const MIRRORS = ['https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass-api.de/api/interpreter'];
async function overpass(q: string): Promise<any> {
  for (let a = 0; a < 6; a++) for (const m of MIRRORS) {
    try {
      const buf: Buffer = await new Promise((res, rej) => {
        const req = https.request(m, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'OUT/1.0 (office@appout.co.il) haifa-parkloop-apply' } }, r => { const b: Buffer[] = []; r.on('data', d => b.push(d)); r.on('end', () => r.statusCode === 200 ? res(Buffer.concat(b)) : rej(new Error('HTTP ' + r.statusCode))); });
        req.on('error', rej); req.setTimeout(190000, () => req.destroy(new Error('socket timeout'))); req.write('data=' + encodeURIComponent(q)); req.end();
      });
      return JSON.parse(buf.toString());
    } catch (e: any) { console.error(`  overpass ${m.split('/')[2]} → ${e.message}, retry…`); await new Promise(r => setTimeout(r, 5000)); }
  }
  throw new Error('overpass failed (all mirrors)');
}
const R = 6371000;
function hav(a: number[], b: number[]): number {
  const [la1, lo1] = a, [la2, lo2] = b;
  const dLa = (la2 - la1) * Math.PI / 180, dLo = (lo2 - lo1) * Math.PI / 180;
  const s = Math.sin(dLa / 2) ** 2 + Math.cos(la1 * Math.PI / 180) * Math.cos(la2 * Math.PI / 180) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
function pathLen(pts: number[][]): number { let s = 0; for (let i = 1; i < pts.length; i++) s += hav(pts[i - 1], pts[i]); return s; }
const wayGeom = (e: any): number[][] => (e.geometry || []).map((p: any) => [p.lat, p.lon]);
const toPath = (pts: number[][]) => pts.map(p => ({ lng: p[1], lat: p[0] }));
const B32 = '0123456789bcdefghjkmnpqrstuvwxyz';
function geohash(lat: number, lon: number, prec = 7) { let idx = 0, bit = 0, even = true, h = ''; const la = [-90, 90], lo = [-180, 180]; while (h.length < prec) { if (even) { const m = (lo[0] + lo[1]) / 2; if (lon >= m) { idx = idx * 2 + 1; lo[0] = m; } else { idx = idx * 2; lo[1] = m; } } else { const m = (la[0] + la[1]) / 2; if (lat >= m) { idx = idx * 2 + 1; la[0] = m; } else { idx = idx * 2; la[1] = m; } } even = !even; if (++bit === 5) { h += B32[idx]; bit = 0; idx = 0; } } return h; }

const MIN_ANCHOR_SPACING_M = 35, ANCHOR_SNAP_TOLERANCE_M = 42, MAX_DIST_FROM_POLYGON_M = 90, MAX_LOOP_LENGTH_RATIO = 1.7, DIJKSTRA_NODE_CAP = 20000, DIJKSTRA_BASE_BOUND_M = 850, MAX_LEG_DETOUR_RATIO = 7, LEN_LOOP_MIN = 400, LEN_LOOP_MAX = 15000;
const GRAPH_GRID_DEG = 0.0006;
function graphGridKey(p: number[]): string { return `${Math.floor(p[0] / GRAPH_GRID_DEG)}:${Math.floor(p[1] / GRAPH_GRID_DEG)}`; }
interface WalkGraphEdge { to: number; distM: number; wayId: number }
interface WalkGraph { nodeCoord: Map<number, number[]>; adj: Map<number, WalkGraphEdge[]>; grid: Map<string, number[]>; nextVirtualId: { n: number } }

async function fetchParkGardenRings(): Promise<Array<{ ref: string; name: string; ring: number[][] }>> {
  const bb = `${HAIFA_BBOX.latMin},${HAIFA_BBOX.lonMin},${HAIFA_BBOX.latMax},${HAIFA_BBOX.lonMax}`;
  const data = await overpass(`[out:json][timeout:180];(way["leisure"~"^(park|garden)$"]["name"](${bb});relation["leisure"~"^(park|garden)$"]["name"](${bb}););(._;>;);out geom;`);
  const wayById = new Map<number, number[][]>();
  for (const e of data.elements) if (e.type === 'way' && e.geometry) wayById.set(e.id, wayGeom(e));
  const out: Array<{ ref: string; name: string; ring: number[][] }> = [];
  const seen = new Set<string>();
  for (const e of data.elements) {
    if (e.type === 'way') {
      const t = e.tags || {}; if (!t.name || !e.geometry || e.geometry.length < 3) continue;
      const ref = `way/${e.id}`; if (seen.has(ref)) continue; seen.add(ref);
      out.push({ ref, name: t.name, ring: wayGeom(e) });
    }
  }
  return out;
}

async function fetchWalkableGraphForRings(parkRings: Array<{ ring: number[][] }>): Promise<WalkGraph> {
  const nodeCoord = new Map<number, number[]>(); const adj = new Map<number, WalkGraphEdge[]>(); const grid = new Map<string, number[]>(); const nextVirtualId = { n: 0 };
  const PAD_DEG = 0.0015;
  let latMin = Infinity, latMax = -Infinity, lonMin = Infinity, lonMax = -Infinity;
  for (const p of parkRings) for (const pt of p.ring) { latMin = Math.min(latMin, pt[0]); latMax = Math.max(latMax, pt[0]); lonMin = Math.min(lonMin, pt[1]); lonMax = Math.max(lonMax, pt[1]); }
  latMin -= PAD_DEG; latMax += PAD_DEG; lonMin -= PAD_DEG; lonMax += PAD_DEG;
  const bb = `${latMin},${lonMin},${latMax},${lonMax}`;
  console.log(`  fetching walkable-way graph for ${parkRings.length} park perimeter(s) …`);
  const data = await overpass(`[out:json][timeout:150];(way["highway"~"^(footway|path|track|pedestrian|cycleway|steps|living_street|residential|service|tertiary|unclassified)$"](${bb}););out geom;`);
  const addEdge = (a: number, b: number, distM: number, wayId: number) => { if (!adj.has(a)) adj.set(a, []); adj.get(a)!.push({ to: b, distM, wayId }); };
  for (const e of data.elements) {
    if (e.type !== 'way' || !e.geometry || !e.nodes || e.geometry.length !== e.nodes.length || e.geometry.length < 2) continue;
    for (let i = 1; i < e.nodes.length; i++) {
      const nA = e.nodes[i - 1], nB = e.nodes[i];
      const pA = [e.geometry[i - 1].lat, e.geometry[i - 1].lon], pB = [e.geometry[i].lat, e.geometry[i].lon];
      if (!nodeCoord.has(nA)) { nodeCoord.set(nA, pA); const k = graphGridKey(pA); if (!grid.has(k)) grid.set(k, []); grid.get(k)!.push(nA); }
      if (!nodeCoord.has(nB)) { nodeCoord.set(nB, pB); const k = graphGridKey(pB); if (!grid.has(k)) grid.set(k, []); grid.get(k)!.push(nB); }
      const d = hav(pA, pB); if (d === 0) continue;
      addEdge(nA, nB, d, e.id); addEdge(nB, nA, d, e.id);
    }
  }
  console.log(`  graph: ${nodeCoord.size} nodes, ${adj.size} nodes with edges.`);
  return { nodeCoord, adj, grid, nextVirtualId };
}

function downsampleRing(ring: number[][], spacingM: number): number[][] {
  if (!ring.length) return [];
  const out = [ring[0]];
  for (let i = 1; i < ring.length; i++) if (hav(out[out.length - 1], ring[i]) >= spacingM) out.push(ring[i]);
  if (out.length > 1 && hav(out[out.length - 1], out[0]) < spacingM) out.pop();
  return out;
}
function pointToSegDistAndFrac(p: number[], a: number[], b: number[]): { distM: number; t: number } {
  const refLat = a[0]; const mLat = 111320, mLon = 111320 * Math.cos(refLat * Math.PI / 180);
  const toXY = (q: number[]): [number, number] => [q[1] * mLon, q[0] * mLat];
  const [px, py] = toXY(p), [ax, ay] = toXY(a), [bx, by] = toXY(b);
  const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2; t = Math.max(0, Math.min(1, t));
  return { distM: Math.hypot(px - (ax + t * dx), py - (ay + t * dy)), t };
}
function snapToGraphSegment(p: number[], graph: WalkGraph): { nodeId: number; distM: number } | null {
  const [la, lo] = [Math.floor(p[0] / GRAPH_GRID_DEG), Math.floor(p[1] / GRAPH_GRID_DEG)];
  const nearbyNodes = new Set<number>();
  for (let da = -1; da <= 1; da++) for (let dob = -1; dob <= 1; dob++) { const bucket = graph.grid.get(`${la + da}:${lo + dob}`); if (bucket) for (const id of bucket) nearbyNodes.add(id); }
  let bestDist = Infinity, bestA: number | null = null, bestB: number | null = null, bestWayId = 0, bestT = 0;
  const seenEdges = new Set<string>();
  for (const nodeId of Array.from(nearbyNodes)) {
    for (const edge of graph.adj.get(nodeId) || []) {
      const a = nodeId, b = edge.to; const key = a < b ? `${a}:${b}` : `${b}:${a}`; if (seenEdges.has(key)) continue; seenEdges.add(key);
      const { distM, t } = pointToSegDistAndFrac(p, graph.nodeCoord.get(a)!, graph.nodeCoord.get(b)!);
      if (distM < bestDist) { bestDist = distM; bestA = a; bestB = b; bestWayId = edge.wayId; bestT = t; }
    }
  }
  if (bestA === null) return null;
  if (bestT <= 0.02) return { nodeId: bestA, distM: bestDist };
  if (bestT >= 0.98) return { nodeId: bestB!, distM: bestDist };
  const pa = graph.nodeCoord.get(bestA)!, pb = graph.nodeCoord.get(bestB!)!;
  const projected = [pa[0] + (pb[0] - pa[0]) * bestT, pa[1] + (pb[1] - pa[1]) * bestT];
  const vid = -(++graph.nextVirtualId.n);
  graph.nodeCoord.set(vid, projected);
  const distAB = hav(pa, pb), distToA = distAB * bestT, distToB = distAB * (1 - bestT);
  const addEdge = (x: number, y: number, d: number, w: number) => { if (!graph.adj.has(x)) graph.adj.set(x, []); graph.adj.get(x)!.push({ to: y, distM: d, wayId: w }); };
  addEdge(vid, bestA, distToA, bestWayId); addEdge(bestA, vid, distToA, bestWayId);
  addEdge(vid, bestB!, distToB, bestWayId); addEdge(bestB!, vid, distToB, bestWayId);
  return { nodeId: vid, distM: bestDist };
}
function dijkstraPath(graph: WalkGraph, from: number, to: number, maxDistM: number): { nodeIds: number[]; edgeWayIds: number[]; distM: number } | null {
  if (from === to) return { nodeIds: [from], edgeWayIds: [], distM: 0 };
  const dist = new Map<number, number>([[from, 0]]); const prev = new Map<number, { node: number; wayId: number }>();
  const heap: [number, number][] = [[0, from]];
  const siftDown = (i: number) => { const n = heap.length; while (true) { let s = i, l = 2 * i + 1, r = 2 * i + 2; if (l < n && heap[l][0] < heap[s][0]) s = l; if (r < n && heap[r][0] < heap[s][0]) s = r; if (s === i) break; [heap[i], heap[s]] = [heap[s], heap[i]]; i = s; } };
  const siftUp = (i: number) => { while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[i], heap[p]] = [heap[p], heap[i]]; i = p; } };
  const push = (d: number, n: number) => { heap.push([d, n]); siftUp(heap.length - 1); };
  const pop = (): [number, number] | undefined => { if (!heap.length) return undefined; const top = heap[0]; const last = heap.pop()!; if (heap.length) { heap[0] = last; siftDown(0); } return top; };
  let visited = 0;
  while (heap.length) {
    const top = pop()!; const [d, node] = top;
    if (d > (dist.get(node) ?? Infinity)) continue;
    if (node === to) break;
    if (d > maxDistM || ++visited > DIJKSTRA_NODE_CAP) return null;
    for (const edge of graph.adj.get(node) || []) { const nd = d + edge.distM; if (nd < (dist.get(edge.to) ?? Infinity)) { dist.set(edge.to, nd); prev.set(edge.to, { node, wayId: edge.wayId }); push(nd, edge.to); } }
  }
  if (!dist.has(to) || (dist.get(to) as number) > maxDistM) return null;
  const nodeIds = [to]; const edgeWayIds: number[] = []; let cur = to;
  while (cur !== from) { const p = prev.get(cur); if (!p) return null; edgeWayIds.push(p.wayId); cur = p.node; nodeIds.push(cur); }
  nodeIds.reverse(); edgeWayIds.reverse();
  return { nodeIds, edgeWayIds, distM: dist.get(to)! };
}
function trimBacktrackPath(nodeIds: number[], edgeWayIds: number[]): { nodeIds: number[]; edgeWayIds: number[] } {
  const stackNodes: number[] = [nodeIds[0]]; const stackWays: number[] = [];
  for (let i = 0; i < edgeWayIds.length; i++) {
    const nextNode = nodeIds[i + 1];
    if (stackNodes.length >= 2 && stackNodes[stackNodes.length - 2] === nextNode) { stackNodes.pop(); stackWays.pop(); }
    else { stackNodes.push(nextNode); stackWays.push(edgeWayIds[i]); }
  }
  return { nodeIds: stackNodes, edgeWayIds: stackWays };
}
function maxDistFromRing(pts: number[][], ring: number[][]): number {
  let worst = 0;
  for (const p of pts) { let best = Infinity; for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length]; best = Math.min(best, pointToSegDistAndFrac(p, a, b).distM); } worst = Math.max(worst, best); }
  return worst;
}

interface Candidate { externalId: string; osmName: string | null; kind: 'park'; pts: number[][]; lengthM: number; isLoop: true; surface: 'trail'; relRef?: string; sourceWayIds?: string[] }

function buildParkLoopCandidate(ref: string, name: string, ring: number[][], graph: WalkGraph): Candidate {
  const oldPerimeterM = pathLen(ring);
  if (oldPerimeterM < LEN_LOOP_MIN || oldPerimeterM > LEN_LOOP_MAX) throw new Error(`${name}: polygon perimeter ${oldPerimeterM}m outside window — was expected to pass, aborting`);
  const anchors = downsampleRing(ring, MIN_ANCHOR_SPACING_M);
  if (anchors.length < 3) throw new Error(`${name}: only ${anchors.length} anchors — was expected to pass, aborting`);
  const snapped = anchors.map(a => snapToGraphSegment(a, graph));
  const failIdx = snapped.findIndex(s => s === null || s.distM > ANCHOR_SNAP_TOLERANCE_M);
  if (failIdx !== -1) throw new Error(`${name}: anchor ${failIdx + 1}/${anchors.length} failed to snap — was expected to pass, aborting`);
  const snappedIds = snapped.map(s => s!.nodeId);
  const legs: { nodeIds: number[]; edgeWayIds: number[]; distM: number }[] = [];
  for (let i = 0; i < snappedIds.length; i++) {
    const from = snappedIds[i], to = snappedIds[(i + 1) % snappedIds.length];
    const straightM = hav(anchors[i], anchors[(i + 1) % anchors.length]);
    const bound = Math.max(DIJKSTRA_BASE_BOUND_M, straightM * 4);
    const leg = dijkstraPath(graph, from, to, bound);
    if (!leg) throw new Error(`${name}: leg ${i + 1} no path — was expected to pass, aborting`);
    if (leg.distM > straightM * MAX_LEG_DETOUR_RATIO) throw new Error(`${name}: leg ${i + 1} detour ratio exceeded — was expected to pass, aborting`);
    legs.push(leg);
  }
  const allNodeIds: number[] = []; const allEdgeWayIds: number[] = [];
  for (const leg of legs) { const startAt = allNodeIds.length === 0 ? 0 : 1; for (let i = startAt; i < leg.nodeIds.length; i++) allNodeIds.push(leg.nodeIds[i]); allEdgeWayIds.push(...leg.edgeWayIds); }
  const trimmed = trimBacktrackPath(allNodeIds, allEdgeWayIds);
  const pts = trimmed.nodeIds.map(id => graph.nodeCoord.get(id)!);
  const edgeWayIds = trimmed.edgeWayIds;
  const newLengthM = pathLen(pts);
  const maxDistM = maxDistFromRing(pts, ring);
  if (maxDistM > MAX_DIST_FROM_POLYGON_M) throw new Error(`${name}: max-dist-from-polygon ${maxDistM}m exceeded — was expected to pass, aborting`);
  const ratio = newLengthM / oldPerimeterM;
  if (ratio > MAX_LOOP_LENGTH_RATIO) throw new Error(`${name}: ratio ${ratio}x exceeded — was expected to pass, aborting`);
  return { externalId: `osm:${ref}`, osmName: name, kind: 'park', pts, lengthM: Math.round(newLengthM), isLoop: true, surface: 'trail', ...(ref.startsWith('rel/') ? { relRef: ref } : {}), sourceWayIds: Array.from(new Set(edgeWayIds)).map(id => `way/${id}`) };
}

// ─── DEM (verbatim) ───
const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';
const Z = 14, nTiles = 2 ** Z;
const lon2gx = (lo: number) => (lo + 180) / 360 * 256 * nTiles;
const lat2gy = (la: number) => { const r = la * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 256 * nTiles; };
function decodePNG(buf: Buffer) {
  let p = 8, W = 0, H = 0, ct = 0; const idat: Buffer[] = [];
  while (p < buf.length) { const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8), data = buf.subarray(p + 8, p + 8 + len); if (type === 'IHDR') { W = data.readUInt32BE(0); H = data.readUInt32BE(4); ct = data[9]; } else if (type === 'IDAT') idat.push(data); else if (type === 'IEND') break; p += 12 + len; }
  const raw = zlib.inflateSync(Buffer.concat(idat)); const ch = ct === 6 ? 4 : ct === 2 ? 3 : ct === 0 ? 1 : 4; const stride = W * ch; const out = Buffer.alloc(H * stride); let pos = 0;
  for (let y = 0; y < H; y++) { const ft = raw[pos++]; for (let x = 0; x < stride; x++) { const rv = raw[pos++]; const a = x >= ch ? out[y * stride + x - ch] : 0, b = y > 0 ? out[(y - 1) * stride + x] : 0, c = (x >= ch && y > 0) ? out[(y - 1) * stride + x - ch] : 0; let v = rv; if (ft === 1) v = rv + a; else if (ft === 2) v = rv + b; else if (ft === 3) v = rv + ((a + b) >> 1); else if (ft === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); v = rv + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); } out[y * stride + x] = v & 0xff; } }
  return { width: W, height: H, ch, data: out };
}
const fetchBuf = (url: string): Promise<Buffer> => new Promise((res, rej) => { const req = https.get(url, r => { if (r.statusCode !== 200) { r.resume(); return rej(new Error('HTTP ' + r.statusCode)); } const b: Buffer[] = []; r.on('data', d => b.push(d)); r.on('end', () => res(Buffer.concat(b))); }); req.on('error', rej); req.setTimeout(30000, () => req.destroy(new Error('socket timeout'))); });
const tiles = new Map<string, ReturnType<typeof decodePNG>>();
async function loadTiles() {
  if (!TOKEN) { console.warn('  ⚠ no NEXT_PUBLIC_MAPBOX_TOKEN — DEM enrichment skipped (elevationGain=0)'); return; }
  const txMin = Math.floor(lon2gx(HAIFA_BBOX.lonMin) / 256), txMax = Math.floor(lon2gx(HAIFA_BBOX.lonMax) / 256), tyMin = Math.floor(lat2gy(HAIFA_BBOX.latMax) / 256), tyMax = Math.floor(lat2gy(HAIFA_BBOX.latMin) / 256);
  for (let tx = txMin; tx <= txMax; tx++) for (let ty = tyMin; ty <= tyMax; ty++) { try { tiles.set(`${tx}_${ty}`, decodePNG(await fetchBuf(`https://api.mapbox.com/v4/mapbox.terrain-rgb/${Z}/${tx}/${ty}.pngraw?access_token=${TOKEN}`))); } catch {} }
}
function pxElev(ix: number, iy: number): number | null { const tx = Math.floor(ix / 256), ty = Math.floor(iy / 256), t = tiles.get(`${tx}_${ty}`); if (!t) return null; const idx = ((iy - ty * 256) * t.width + (ix - tx * 256)) * t.ch; return -10000 + (t.data[idx] * 65536 + t.data[idx + 1] * 256 + t.data[idx + 2]) * 0.1; }
function elevAt(lon: number, lat: number): number | null { const gx = lon2gx(lon), gy = lat2gy(lat), x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0; const e00 = pxElev(x0, y0), e10 = pxElev(x0 + 1, y0), e01 = pxElev(x0, y0 + 1), e11 = pxElev(x0 + 1, y0 + 1); if (e00 == null || e10 == null || e01 == null || e11 == null) return e00; return e00 * (1 - fx) * (1 - fy) + e10 * fx * (1 - fy) + e01 * (1 - fx) * fy + e11 * fx * fy; }
function demProfile(pts: number[][]): { gainM: number; maxGrade: number } | null {
  if (!tiles.size) return null;
  const STEP = 15; const rs: number[][] = [pts[0]]; let acc = 0;
  for (let i = 1; i < pts.length; i++) { let from = pts[i - 1], segLen = hav(from, pts[i]); while (acc + segLen >= STEP) { const t = (STEP - acc) / segLen; const np = [from[0] + (pts[i][0] - from[0]) * t, from[1] + (pts[i][1] - from[1]) * t]; rs.push(np); from = np; segLen = hav(from, pts[i]); acc = 0; } acc += segLen; }
  const el = rs.map(p => elevAt(p[1], p[0])); if (el.some(e => e == null)) return null;
  const sm = (el as number[]).map((_, i) => { const w = [el[i - 1], el[i], el[i + 1]].filter(x => x != null) as number[]; return w.reduce((a, b) => a + b, 0) / w.length; });
  let gain = 0, maxG = 0; for (let i = 1; i < sm.length; i++) { const d = sm[i] - sm[i - 1]; if (d > 0) gain += d; maxG = Math.max(maxG, d / STEP); }
  return { gainM: +gain.toFixed(1), maxGrade: +(maxG * 100).toFixed(1) };
}

// ─── buildRouteDoc (verbatim) ───
async function surfaceTypeMapper() { const { mapOsmSurfaceToType } = await import('../src/lib/route-collections/surface-type'); return mapOsmSurfaceToType; }
function buildRouteDoc(c: Candidate, dem: { gainM: number; maxGrade: number } | null, authorityId: string, mapOsmSurfaceToType: (s?: string) => string) {
  const distance = c.lengthM;
  const activityTypes = ['walking', 'running'];
  const activityType = 'walking';
  const name = `הקפת ${c.osmName ?? HAIFA_LABEL}`;
  const distanceKm = distance / 1000;
  const mid = c.pts[Math.floor(c.pts.length / 2)];
  const gain = dem?.gainM ?? 0;
  const difficulty: 'easy' | 'medium' | 'hard' = (distanceKm > 8 || gain > 200) ? 'hard' : (distanceKm > 3.5 || gain > 80) ? 'medium' : 'easy';
  return {
    name,
    description: `מסלול שטח ב${HAIFA_LABEL}${c.osmName ? ` — ${c.osmName}` : ''}`,
    distance,
    duration: Math.round(distance / 90),
    score: Math.round(distanceKm * 10),
    rating: 5,
    calories: Math.round(distanceKm * 65),
    type: activityType, activityType, activityTypes, difficulty,
    path: toPath(c.pts),
    segments: [],
    features: { hasGym: false, hasBenches: false, scenic: true, lit: false, terrain: 'dirt', environment: 'nature', trafficLoad: 'none', surface: c.surface },
    source: { type: 'official_api', name: 'OSM Geo-Discovery', externalId: c.externalId, ...(c.relRef ? { osmRef: c.relRef } : {}) },
    ...(c.sourceWayIds ? { sourceWayIds: c.sourceWayIds } : {}),
    elevationGain: gain,
    maxGrade: dem?.maxGrade ?? 0,
    surfaceType: mapOsmSurfaceToType(undefined),
    routeShape: 'loop' as const,
    geohash: geohash(mid[0], mid[1]),
    city: HAIFA_LABEL,
    authorityId,
    importBatchId: BATCH_ID,
    origin: 'osm_import',
  };
}

async function main() {
  const db = initFb();
  console.log('=== Haifa park-loop replacement — LIVE APPLY (authorized) ===\n');

  // ── Phase 1: referential cleanup — street_segments broadcast from the published fake ──
  console.log('── Phase 1: referential cleanup ──');
  const segs = await db.collection('street_segments').where('officialRouteId', '==', ARCHIVE_ID).get();
  console.log(`  found ${segs.size} street_segments docs broadcast from ${ARCHIVE_ID} (הקפת גן הזיכרון)`);
  if (segs.size > 0) {
    let b = db.batch(), n = 0;
    for (const d of segs.docs) { b.delete(d.ref); if (++n % 450 === 0) { await b.commit(); b = db.batch(); } }
    await b.commit();
    console.log(`  ✅ deleted ${segs.size} street_segments docs`);
  }

  // ── Phase 2: build corrected geometry for the 7 survivors ──
  console.log('\n── Phase 2: building corrected walkable-graph geometry for 7 survivors ──');
  const allRings = await fetchParkGardenRings();
  const targetRings = allRings.filter(r => SURVIVOR_PARK_NAMES.includes(r.name));
  console.log(`  matched ${targetRings.length}/7 target park rings from ${allRings.length} named Haifa park/garden polygons`);
  if (targetRings.length !== 7) throw new Error(`Expected 7 target rings, got ${targetRings.length} — aborting before any write.`);
  const graph = await fetchWalkableGraphForRings(targetRings);
  await loadTiles();

  const mapOsmSurfaceToType = await surfaceTypeMapper();
  const { buildValidatedDoc } = await import('../src/lib/route-collections');
  const authoritySnap = await db.collection('authorities').get();
  const knownAuthorityIds = new Set(authoritySnap.docs.map(d => d.id));

  const candidates = targetRings.map(r => buildParkLoopCandidate(r.ref, r.name, r.ring, graph));
  console.log(`  ✅ all 7 candidates built successfully (no gate failures — matches the last dry-run's prediction)`);

  // ── Phase 3: in-place update the 7 survivors, preserving status/published ──
  console.log('\n── Phase 3: in-place geometry update — 7 survivors ──');
  const updateResults: Array<{ name: string; id: string; oldDistance: number; newDistance: number; status: string; published: boolean }> = [];
  for (const c of candidates) {
    const id = SURVIVOR_IDS[`הקפת ${c.osmName}`];
    if (!id) throw new Error(`No known doc id for candidate "${c.osmName}" — aborting.`);
    const ref = db.collection('official_routes').doc(id);
    const existingSnap = await ref.get();
    if (!existingSnap.exists) throw new Error(`Doc ${id} (${c.osmName}) does not exist — aborting.`);
    const existing = existingSnap.data()!;
    const dem = demProfile(c.pts);
    const newFields = buildRouteDoc(c, dem, HAIFA_AUTHORITY_ID, mapOsmSurfaceToType);
    const validated = buildValidatedDoc('official_routes', newFields, { mode: 'update', knownAuthorityIds, existing: { authorityId: existing.authorityId, city: existing.city } }) as typeof newFields;
    const preservedStatus = existing.status;
    const preservedPublished = existing.published === true;
    await ref.set({ ...validated, status: preservedStatus, published: preservedPublished, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    updateResults.push({ name: `הקפת ${c.osmName}`, id, oldDistance: existing.distance, newDistance: c.lengthM, status: preservedStatus, published: preservedPublished });
    console.log(`  ✅ ${id}  הקפת ${c.osmName}  ${existing.distance}m -> ${c.lengthM}m  (status=${preservedStatus} published=${preservedPublished} preserved)`);
  }

  // ── Phase 4: archive the published fake ──
  console.log('\n── Phase 4: archive published fake — הקפת גן הזיכרון ──');
  await db.collection('official_routes').doc(ARCHIVE_ID).set({
    published: false,
    status: 'archived',
    rejectionReason: 'Traced the park polygon boundary, not a real walkable path — corrected-gate-set audit confirmed no genuine local perimeter path exists here (8.6x detour on the real walkable graph). See .claude/knowledge/city-mapping-learnings.md.',
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  console.log(`  ✅ ${ARCHIVE_ID} archived (published:false, status:'archived')`);

  // ── Phase 5: hard-delete the 13 pending fakes (last, least reversible) ──
  console.log('\n── Phase 5: hard-delete 13 pending fakes ──');
  let delBatch = db.batch(), delN = 0;
  for (const id of DELETE_IDS) { delBatch.delete(db.collection('official_routes').doc(id)); if (++delN % 450 === 0) { await delBatch.commit(); delBatch = db.batch(); } }
  await delBatch.commit();
  console.log(`  ✅ deleted ${DELETE_IDS.length} pending fake park-loop docs`);

  // ── Verification ──
  console.log('\n── Verification ──');
  const finalSnap = await db.collection('official_routes').where('authorityId', '==', HAIFA_AUTHORITY_ID).get();
  const finalDocs = finalSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  console.log(`  Total Haifa official_routes now: ${finalDocs.length} (expected 118 - 13 = 105)`);
  const finalParkLoops = finalDocs.filter(d => typeof d.name === 'string' && d.name.startsWith('הקפת '));
  console.log(`  "הקפת" park loops now: ${finalParkLoops.length} (expected 8 = 7 survivors + 1 archived)`);
  for (const d of finalParkLoops) console.log(`    ${d.id}  ${d.name}  status=${d.status} published=${d.published} distance=${d.distance}m`);

  const halom = await db.collection('official_routes').doc('7WlKBvfSaWvWDGde0YpG').get();
  const hd = halom.data()!;
  console.log(`\n  === פארק הלוחם היהודי — final live doc ===`);
  console.log(`  distance: ${hd.distance}m, status: ${hd.status}, published: ${hd.published}`);
  console.log(`  path points: ${hd.path.length}`);
  console.log(`  first 3 points: ${JSON.stringify(hd.path.slice(0, 3))}`);
  console.log(`  last 3 points: ${JSON.stringify(hd.path.slice(-3))}`);
  const closeM = hav([hd.path[0].lat, hd.path[0].lng], [hd.path[hd.path.length - 1].lat, hd.path[hd.path.length - 1].lng]);
  console.log(`  closure gap (first vs last point): ${closeM.toFixed(1)}m`);

  console.log('\n=== APPLY COMPLETE ===');
}
main().then(() => process.exit(0)).catch(e => { console.error('FATAL:', e); process.exit(1); });
