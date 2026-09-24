// READ-ONLY audit. No Firestore writes, no --apply, no push, no changes to
// geo-discovery-routes.ts's committed behavior (6637d719). This script duplicates that
// commit's park-loop-rebuild functions VERBATIM (so the audit is of the actual committed
// logic, not a reinterpretation) and adds diagnostic instrumentation on top: per-leg
// geometry dumps, backtrack/self-overlap detection, distance-from-polygon measurement,
// connected-component analysis, and broader/looser probe queries — to answer, per dropped
// park, whether the drop is a genuine "no real loop" or an artifact of our own tolerances.
import * as https from 'https';
import * as admin from 'firebase-admin';

function initFb() {
  const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
  return admin.firestore();
}

const MIRRORS = ['https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass-api.de/api/interpreter'];
async function overpass(q: string): Promise<any> {
  for (let a = 0; a < 6; a++) for (const m of MIRRORS) {
    try {
      const buf: Buffer = await new Promise((res, rej) => {
        const req = https.request(m, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'OUT/1.0 (office@appout.co.il) drop-audit' } }, r => { const b: Buffer[] = []; r.on('data', d => b.push(d)); r.on('end', () => r.statusCode === 200 ? res(Buffer.concat(b)) : rej(new Error('HTTP ' + r.statusCode))); });
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

// ─── verbatim from geo-discovery-routes.ts (6637d719) — same constants ───
const MIN_ANCHOR_SPACING_M = 35;
const ANCHOR_SNAP_TOLERANCE_M = 28;
const MAX_LOOP_LENGTH_RATIO = 1.3;
const DIJKSTRA_NODE_CAP = 20000;
const GRAPH_GRID_DEG = 0.0006;
function graphGridKey(p: number[]): string { return `${Math.floor(p[0] / GRAPH_GRID_DEG)}:${Math.floor(p[1] / GRAPH_GRID_DEG)}`; }

interface WalkGraphEdge { to: number; distM: number; wayId: number }
interface WalkGraph { nodeCoord: Map<number, number[]>; adj: Map<number, WalkGraphEdge[]>; grid: Map<string, number[]> }

async function fetchWalkableGraph(bb: string): Promise<WalkGraph> {
  const nodeCoord = new Map<number, number[]>();
  const adj = new Map<number, WalkGraphEdge[]>();
  const grid = new Map<string, number[]>();
  const data = await overpass(`[out:json][timeout:150];(way["highway"~"^(footway|path|track|pedestrian|cycleway|steps|living_street|residential|service|tertiary|unclassified)$"](${bb}););out geom;`);
  const addEdge = (a: number, b: number, distM: number, wayId: number) => { if (!adj.has(a)) adj.set(a, []); adj.get(a)!.push({ to: b, distM, wayId }); };
  let wayCount = 0;
  for (const e of data.elements) {
    if (e.type !== 'way' || !e.geometry || !e.nodes || e.geometry.length !== e.nodes.length || e.geometry.length < 2) continue;
    wayCount++;
    for (let i = 1; i < e.nodes.length; i++) {
      const nA = e.nodes[i - 1], nB = e.nodes[i];
      const pA = [e.geometry[i - 1].lat, e.geometry[i - 1].lon], pB = [e.geometry[i].lat, e.geometry[i].lon];
      if (!nodeCoord.has(nA)) { nodeCoord.set(nA, pA); const k = graphGridKey(pA); if (!grid.has(k)) grid.set(k, []); grid.get(k)!.push(nA); }
      if (!nodeCoord.has(nB)) { nodeCoord.set(nB, pB); const k = graphGridKey(pB); if (!grid.has(k)) grid.set(k, []); grid.get(k)!.push(nB); }
      const d = hav(pA, pB);
      if (d === 0) continue;
      addEdge(nA, nB, d, e.id); addEdge(nB, nA, d, e.id);
    }
  }
  console.log(`  graph: ${wayCount} ways, ${nodeCoord.size} nodes, ${adj.size} nodes with edges.`);
  return { nodeCoord, adj, grid };
}

function downsampleRing(ring: number[][], spacingM: number): number[][] {
  if (!ring.length) return [];
  const out = [ring[0]];
  for (let i = 1; i < ring.length; i++) if (hav(out[out.length - 1], ring[i]) >= spacingM) out.push(ring[i]);
  if (out.length > 1 && hav(out[out.length - 1], out[0]) < spacingM) out.pop();
  return out;
}

function snapToGraph(p: number[], graph: WalkGraph): { nodeId: number; distM: number } | null {
  const [la, lo] = [Math.floor(p[0] / GRAPH_GRID_DEG), Math.floor(p[1] / GRAPH_GRID_DEG)];
  let best = Infinity, bestId: number | null = null;
  for (let da = -1; da <= 1; da++) for (let dob = -1; dob <= 1; dob++) {
    const bucket = graph.grid.get(`${la + da}:${lo + dob}`);
    if (!bucket) continue;
    for (const nodeId of bucket) { const d = hav(p, graph.nodeCoord.get(nodeId)!); if (d < best) { best = d; bestId = nodeId; } }
  }
  return bestId === null ? null : { nodeId: bestId, distM: best };
}

function dijkstraPath(graph: WalkGraph, from: number, to: number, maxDistM: number): { nodeIds: number[]; edgeWayIds: number[]; distM: number } | null {
  if (from === to) return { nodeIds: [from], edgeWayIds: [], distM: 0 };
  const dist = new Map<number, number>([[from, 0]]);
  const prev = new Map<number, { node: number; wayId: number }>();
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
    for (const edge of graph.adj.get(node) || []) {
      const nd = d + edge.distM;
      if (nd < (dist.get(edge.to) ?? Infinity)) { dist.set(edge.to, nd); prev.set(edge.to, { node, wayId: edge.wayId }); push(nd, edge.to); }
    }
  }
  if (!dist.has(to) || (dist.get(to) as number) > maxDistM) return null;
  const nodeIds = [to]; const edgeWayIds: number[] = [];
  let cur = to;
  while (cur !== from) { const p = prev.get(cur); if (!p) return null; edgeWayIds.push(p.wayId); cur = p.node; nodeIds.push(cur); }
  nodeIds.reverse(); edgeWayIds.reverse();
  return { nodeIds, edgeWayIds, distM: dist.get(to)! };
}
// ─── end verbatim block ───

// Union-Find for connected-component analysis (Bucket B).
class DSU {
  parent = new Map<number, number>();
  find(x: number): number {
    if (!this.parent.has(x)) this.parent.set(x, x);
    let r = x; while (this.parent.get(r) !== r) r = this.parent.get(r)!;
    let c = x; while (this.parent.get(c) !== c) { const next = this.parent.get(c)!; this.parent.set(c, r); c = next; }
    return r;
  }
  union(a: number, b: number) { const ra = this.find(a), rb = this.find(b); if (ra !== rb) this.parent.set(ra, rb); }
}
function buildComponents(graph: WalkGraph): DSU {
  const dsu = new DSU();
  for (const [node, edges] of graph.adj) for (const e of edges) dsu.union(node, e.to);
  return dsu;
}

function pointToSegDistM(p: number[], a: number[], b: number[], refLat: number): number {
  const mLat = 111320, mLon = 111320 * Math.cos(refLat * Math.PI / 180);
  const toXY = (q: number[]): [number, number] => [q[1] * mLon, q[0] * mLat];
  const [px, py] = toXY(p), [ax, ay] = toXY(a), [bx, by] = toXY(b);
  const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
function maxDistFromRing(pts: number[][], ring: number[][]): number {
  const refLat = ring[0][0];
  let worst = 0;
  for (const p of pts) {
    let best = Infinity;
    for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length]; best = Math.min(best, pointToSegDistM(p, a, b, refLat)); }
    worst = Math.max(worst, best);
  }
  return worst;
}

async function fetchParkRings(): Promise<Array<{ ref: string; name: string; ring: number[][] }>> {
  const bb = `32.734,34.9296,32.854,35.0496`; // Haifa region bbox, same as REGIONS.haifa
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
    } else if (e.type === 'relation') {
      const t = e.tags || {}; if (!t.name) continue;
      const outerWays: number[][][] = [];
      for (const m of e.members || []) if (m.type === 'way' && m.role !== 'inner' && wayById.has(m.ref)) outerWays.push(wayById.get(m.ref)!);
      if (!outerWays.length) continue;
      // Simple concat fallback (fine for this audit — relation parks are rare in the target set below)
      const ring = outerWays.reduce((a, b) => a.length > b.length ? a : b);
      const ref = `rel/${e.id}`; if (seen.has(ref)) continue; seen.add(ref);
      out.push({ ref, name: t.name, ring });
    }
  }
  return out;
}

function ringBbox(ring: number[][], padDeg: number): string {
  let latMin = Infinity, latMax = -Infinity, lonMin = Infinity, lonMax = -Infinity;
  for (const p of ring) { latMin = Math.min(latMin, p[0]); latMax = Math.max(latMax, p[0]); lonMin = Math.min(lonMin, p[1]); lonMax = Math.max(lonMax, p[1]); }
  return `${latMin - padDeg},${lonMin - padDeg},${latMax + padDeg},${lonMax + padDeg}`;
}

const BUCKET_A = ['ספורטק חיפה', 'גן המייסדים', 'גן אופירה', 'פארק הלוחם היהודי', 'טכניון הגן האקולוגי', 'גן לוקיי', 'גן דורון'];
const BUCKET_B = ['פארק הכט', 'חוף שקמונה', 'גן דניאל'];
const BUCKET_C_SAMPLE = ['פארק שקמונה', 'גן חסידי אומות העולם', 'גן האם'];

async function main() {
  console.log('Fetching Haifa named park/garden rings …');
  const allRings = await fetchParkRings();
  console.log(`Found ${allRings.length} named rings.\n`);

  const targetNames = new Set([...BUCKET_A, ...BUCKET_B, ...BUCKET_C_SAMPLE]);
  // Disambiguate duplicate names by picking the ring whose perimeter matches the length
  // reported in the prior dry-run (some names appear twice in Haifa's OSM data at very
  // different scales — e.g. two separate "גן אלי כהן" polygons).
  const EXPECTED_PERIM: Record<string, number> = {
    'ספורטק חיפה': 482, 'גן המייסדים': 980, 'גן אופירה': 968, 'פארק הלוחם היהודי': 566,
    'טכניון הגן האקולוגי': 802, 'גן לוקיי': 603, 'גן דורון': 957,
    'פארק הכט': 2147, 'חוף שקמונה': 2353, 'גן דניאל': 1249,
    'פארק שקמונה': 3442, 'גן חסידי אומות העולם': 1046, 'גן האם': 720,
  };
  const targets = new Map<string, { ref: string; name: string; ring: number[][] }>();
  for (const name of targetNames) {
    const candidates = allRings.filter(r => r.name === name);
    if (!candidates.length) { console.log(`⚠️ no ring found for "${name}"`); continue; }
    const best = candidates.reduce((a, b) => Math.abs(pathLen(a.ring) - EXPECTED_PERIM[name]) <= Math.abs(pathLen(b.ring) - EXPECTED_PERIM[name]) ? a : b);
    targets.set(name, best);
    console.log(`${name}: matched ring ${best.ref}, perimeter ${Math.round(pathLen(best.ring))}m (expected ~${EXPECTED_PERIM[name]}m)`);
  }

  // Original-bbox graph — SAME construction as the committed run (union bbox of ALL 53
  // rings + 150m padding) — this is the graph the actual committed drops were computed
  // against, so bucket A/B baselines must use the exact same graph, not a cherry-picked one.
  const PAD_DEG = 0.0015;
  let latMin = Infinity, latMax = -Infinity, lonMin = Infinity, lonMax = -Infinity;
  for (const r of allRings) for (const p of r.ring) { latMin = Math.min(latMin, p[0]); latMax = Math.max(latMax, p[0]); lonMin = Math.min(lonMin, p[1]); lonMax = Math.max(lonMax, p[1]); }
  const originalBB = `${latMin - PAD_DEG},${lonMin - PAD_DEG},${latMax + PAD_DEG},${lonMax + PAD_DEG}`;
  console.log(`\nFetching ORIGINAL walkable graph (same bbox as the committed run: ${originalBB}) …`);
  const originalGraph = await fetchWalkableGraph(originalBB);
  const dsu = buildComponents(originalGraph);

  // ═══════════════════════════ BUCKET A ═══════════════════════════
  console.log(`\n\n════════ BUCKET A — ratio-gate rejections: geometry + backtrack audit ════════`);
  for (const name of BUCKET_A) {
    const t = targets.get(name); if (!t) continue;
    const oldPerimeterM = pathLen(t.ring);
    const anchors = downsampleRing(t.ring, MIN_ANCHOR_SPACING_M);
    const snapped = anchors.map(a => snapToGraph(a, originalGraph));
    if (snapped.some(s => s === null || s.distM > ANCHOR_SNAP_TOLERANCE_M)) { console.log(`\n${name}: an anchor failed to snap in this re-run — inconsistent with the committed run, skipping.`); continue; }
    const snappedIds = snapped.map(s => s!.nodeId);
    const legs: { nodeIds: number[]; edgeWayIds: number[]; distM: number }[] = [];
    let legOk = true;
    for (let i = 0; i < snappedIds.length; i++) {
      const from = snappedIds[i], to = snappedIds[(i + 1) % snappedIds.length];
      const straightM = hav(anchors[i], anchors[(i + 1) % anchors.length]);
      const leg = dijkstraPath(originalGraph, from, to, Math.max(600, straightM * 4));
      if (!leg) { legOk = false; break; }
      legs.push(leg);
    }
    if (!legOk) { console.log(`\n${name}: a leg failed in this re-run — inconsistent with the committed run, skipping.`); continue; }

    const pts: number[][] = [];
    const edgeWayIds: number[] = [];
    for (const leg of legs) { const startAt = pts.length === 0 ? 0 : 1; for (let i = startAt; i < leg.nodeIds.length; i++) pts.push(originalGraph.nodeCoord.get(leg.nodeIds[i])!); edgeWayIds.push(...leg.edgeWayIds); }
    const newLengthM = pathLen(pts);

    // Backtrack / self-overlap detection: an undirected edge (nodeA-nodeB, order-independent)
    // used more than once in the SAME assembled loop is a structural out-and-back — the
    // Dijkstra path had to double back along itself to reach an anchor (typically a dead-end
    // spur near the anchor), not a real perimeter continuing forward.
    const edgeUseCount = new Map<string, number>();
    let cursor = 0;
    const allNodeIds: number[] = [];
    for (const leg of legs) { const startAt = allNodeIds.length === 0 ? 0 : 1; for (let i = startAt; i < leg.nodeIds.length; i++) allNodeIds.push(leg.nodeIds[i]); }
    let backtrackM = 0;
    for (let i = 1; i < allNodeIds.length; i++) {
      const a = allNodeIds[i - 1], b = allNodeIds[i];
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      const segLen = hav(originalGraph.nodeCoord.get(a)!, originalGraph.nodeCoord.get(b)!);
      const n = (edgeUseCount.get(key) || 0) + 1;
      edgeUseCount.set(key, n);
      if (n > 1) backtrackM += segLen;
    }
    const backtrackPct = Math.round((backtrackM / newLengthM) * 1000) / 10;

    const distFromPolygonM = Math.round(maxDistFromRing(pts, t.ring));
    const ratio = newLengthM / oldPerimeterM;

    console.log(`\n── ${name} — polygon ${Math.round(oldPerimeterM)}m, assembled ${Math.round(newLengthM)}m (${ratio.toFixed(2)}x) ──`);
    console.log(`  anchors: ${anchors.length}, legs: ${legs.length}`);
    console.log(`  per-leg: ${legs.map((l, i) => `${Math.round(l.distM)}m(straight ${Math.round(hav(anchors[i], anchors[(i + 1) % anchors.length]))}m)`).join(' | ')}`);
    console.log(`  backtrack (edges reused within this loop): ${Math.round(backtrackM)}m of ${Math.round(newLengthM)}m (${backtrackPct}%)`);
    console.log(`  max distance of any assembled point from the original polygon ring: ${distFromPolygonM}m`);
    if (name === 'ספורטק חיפה') {
      console.log(`  full geometry dump (lat,lon), ${pts.length} points:`);
      console.log('  ' + pts.map(p => `[${p[0].toFixed(6)},${p[1].toFixed(6)}]`).join(', '));
    }
  }

  // ═══════════════════════════ BUCKET B ═══════════════════════════
  console.log(`\n\n════════ BUCKET B — "no path between anchors": graph-connectivity audit ════════`);
  for (const name of BUCKET_B) {
    const t = targets.get(name); if (!t) continue;
    const anchors = downsampleRing(t.ring, MIN_ANCHOR_SPACING_M);
    const snapped = anchors.map(a => snapToGraph(a, originalGraph));
    console.log(`\n── ${name} — ${anchors.length} anchors ──`);
    let failedPair: [number, number] | null = null;
    for (let i = 0; i < snapped.length; i++) {
      const s = snapped[i];
      if (!s || s.distM > ANCHOR_SNAP_TOLERANCE_M) { console.log(`  anchor ${i + 1}: FAILED TO SNAP (inconsistent with committed run)`); continue; }
      const j = (i + 1) % snapped.length;
      const s2 = snapped[j];
      if (!s2) continue;
      const straightM = hav(anchors[i], anchors[j]);
      const bound = Math.max(600, straightM * 4);
      const leg = dijkstraPath(originalGraph, s.nodeId, s2.nodeId, bound);
      const sameComponent = dsu.find(s.nodeId) === dsu.find(s2.nodeId);
      if (!leg) {
        failedPair = [i + 1, j + 1];
        // Unbounded search to see if a path exists at all, regardless of distance.
        const unbounded = dijkstraPath(originalGraph, s.nodeId, s2.nodeId, 50000);
        console.log(`  anchor ${i + 1}→${j + 1}: NO PATH within bound ${Math.round(bound)}m (straight-line ${Math.round(straightM)}m). Same graph component: ${sameComponent}. Unbounded (≤50km) search: ${unbounded ? `FOUND, ${Math.round(unbounded.distM)}m — bound was the blocker` : 'still not found — genuinely disconnected in this graph'}.`);
      }
    }
    if (!failedPair) { console.log(`  (all legs resolved in this re-run — inconsistent with the committed drop, worth re-checking)`); continue; }

    // Wide-bbox test: does a larger fetch radius around just this park connect the graph?
    const wideBB = ringBbox(t.ring, 0.005); // ~550m padding
    console.log(`  fetching WIDE graph around ${name} (bbox ${wideBB}, ~550m padding) …`);
    const wideGraph = await fetchWalkableGraph(wideBB);
    const wideDsu = buildComponents(wideGraph);
    const [ai, bi] = failedPair;
    const wa = snapToGraph(anchors[ai - 1], wideGraph), wb = snapToGraph(anchors[(bi - 1) % anchors.length], wideGraph);
    if (wa && wb) {
      const wideSame = wideDsu.find(wa.nodeId) === wideDsu.find(wb.nodeId);
      const wideLeg = dijkstraPath(wideGraph, wa.nodeId, wb.nodeId, 50000);
      console.log(`  WIDE graph: anchor ${ai} snaps ${Math.round(wa.distM)}m, anchor ${bi} snaps ${Math.round(wb.distM)}m. Same component in wide graph: ${wideSame}. Path found: ${wideLeg ? `YES, ${Math.round(wideLeg.distM)}m` : 'NO — still disconnected even with ~550m more context'}.`);
    } else {
      console.log(`  WIDE graph: one or both anchors failed to snap even in the wider fetch.`);
    }

    // If genuinely disconnected in both graphs: how close are the two components' nearest
    // nodes, physically? A very small gap (a few meters) suggests a real-world connection
    // OSM just didn't map as topologically joined (e.g. an unmapped plaza crossing), not an
    // actual barrier.
    const compA = dsu.find(snapped[ai - 1]!.nodeId);
    let minCrossDist = Infinity;
    for (const [nodeId, coord] of originalGraph.nodeCoord) {
      if (dsu.find(nodeId) !== compA) continue;
      const d = hav(coord, anchors[(bi - 1) % anchors.length]);
      if (d < minCrossDist) minCrossDist = d;
    }
    console.log(`  nearest node in anchor-${ai}'s OWN component to anchor ${bi}'s location: ${Math.round(minCrossDist)}m away (a small value here would mean "physically close, topologically unjoined").`);
  }

  // ═══════════════════════════ BUCKET C ═══════════════════════════
  console.log(`\n\n════════ BUCKET C — "no walkable way within 28m": tolerance vs. genuine gap ════════`);
  for (const name of BUCKET_C_SAMPLE) {
    const t = targets.get(name); if (!t) continue;
    const anchors = downsampleRing(t.ring, MIN_ANCHOR_SPACING_M);
    const snapped = anchors.map(a => snapToGraph(a, originalGraph));
    const failIdx = snapped.findIndex(s => s === null || s.distM > ANCHOR_SNAP_TOLERANCE_M);
    console.log(`\n── ${name} — ${anchors.length} anchors ──`);
    if (failIdx === -1) { console.log('  (all anchors snapped in this re-run — inconsistent with the committed drop)'); continue; }
    const anchor = anchors[failIdx];
    const snap = snapped[failIdx];
    console.log(`  failing anchor ${failIdx + 1}/${anchors.length} at [${anchor[0].toFixed(6)},${anchor[1].toFixed(6)}]. Nearest node in our graph: ${snap ? `${Math.round(snap.distM)}m away` : 'NONE found at all'}.`);

    const probeBB = `${anchor[0] - 0.0015},${anchor[1] - 0.0015},${anchor[0] + 0.0015},${anchor[1] + 0.0015}`; // ~165m box
    console.log(`  probing ANY highway=* + barrier=* + natural=* within ~165m of this anchor (broader than our restricted vocabulary) …`);
    const probe = await overpass(`[out:json][timeout:60];(way["highway"](${probeBB});way["barrier"](${probeBB});way["natural"](${probeBB}););out geom;`);
    const found: Array<{ id: number; distM: number; tags: any }> = [];
    for (const e of probe.elements) {
      if (e.type !== 'way' || !e.geometry) continue;
      let best = Infinity;
      const pts = e.geometry.map((p: any) => [p.lat, p.lon]);
      for (let i = 1; i < pts.length; i++) best = Math.min(best, pointToSegDistM(anchor, pts[i - 1], pts[i], anchor[0]));
      if (pts.length === 1) best = hav(anchor, pts[0]);
      found.push({ id: e.id, distM: best, tags: e.tags || {} });
    }
    found.sort((a, b) => a.distM - b.distM);
    console.log(`  ${found.length} features found within ~165m; nearest 6:`);
    for (const f of found.slice(0, 6)) console.log(`    ${Math.round(f.distM)}m — way/${f.id} — ${JSON.stringify(f.tags)}`);
  }

  console.log('\n\n=== AUDIT COMPLETE — read-only, no writes, no code changes ===');
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
