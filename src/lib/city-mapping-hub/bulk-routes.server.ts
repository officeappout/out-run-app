/**
 * Server half of the hub's nationwide "approve pending routes" (Admin SDK).
 * Reads are server-side (axioms §25); the approve write is guarded at write
 * time: each id must exist, belong to the given authority and still be
 * pending + unpublished — anything else is skipped and reported, never
 * written. Published / archived / rejected docs are never touched.
 * ≤ 499 ids per call = ONE batch (499 updates + 1 audit_logs row = 500).
 * Each update carries a lastUpdateTime precondition from the read, so a route
 * archived / rejected / edited in between is never flipped back to published. The side effects that
 * live in client-SDK code (street-segment broadcast, adjacency / enrichment
 * recompute, decision log, cache invalidation) run in the browser right after
 * a successful call: InventoryService.runRouteApproveSideEffects.
 */
import 'server-only';
import { FieldValue, type Firestore, type Timestamp } from 'firebase-admin/firestore';
import { getAdminAuth } from '@/lib/firebase-admin';
import { buildValidatedDoc } from '@/lib/route-collections';
import { normCity } from '../city-inventory/overview';
import { validAuthorityId } from './url-state';
import { isPendingRoute } from './rows';
import { BULK_APPROVE_BATCH, classifyGeometry, type BatchOutcome, type PendingRouteCandidate } from './bulk-approve.logic';
import { readAuthorityNames } from './layers.server';

type Data = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null);
const validDocId = (v: unknown): v is string => typeof v === 'string' && !!v && v.length <= 128 && !v.includes('/');

export interface PendingRoutesPreviewData {
  candidates: PendingRouteCandidate[];
  authorityNames: Record<string, string>;
  /** Pending routes we could not attribute to any authority (never guessed, never approved here). */
  unattributed: number;
}

export async function readPendingRoutesNationwide(db: Firestore): Promise<PendingRoutesPreviewData> {
  const [authSnap, invSnap, routesSnap] = await Promise.all([
    db.collection('authorities').select('name').get(),
    db.collection('city_inventory').select('city', 'authorityId').get(),
    // NOTE (axiom §33): `published == false` matches only docs where the field is
    // PRESENT and false — a doc with NO `published` field is NOT listed here (same
    // query as the hub table, so counts agree). Sderot was already backfilled; the
    // write guard below uses isPendingRoute, which does treat a missing field as unpublished.
    db.collection('official_routes').where('published', '==', false)
      .select('name', 'authorityId', 'city', 'status', 'published', 'distance', 'origin').get(),
  ]);
  const names = new Map<string, string>();
  const cityToAuthority = new Map<string, string>();
  for (const d of authSnap.docs) {
    const n = str((d.data() ?? {}).name);
    names.set(d.id, n ?? d.id);
    if (n) cityToAuthority.set(normCity(n), d.id);
  }
  for (const d of invSnap.docs) {
    const x = d.data() ?? {};
    const c = str(x.city);
    if (c) cityToAuthority.set(normCity(c), str(x.authorityId) ?? d.id);
  }
  const pending: Array<{ id: string; authorityId: string; d: Data }> = [];
  let unattributed = 0;
  for (const doc of routesSnap.docs) {
    const d = (doc.data() ?? {}) as Data;
    if (!isPendingRoute(d)) continue;
    const authorityId = str(d.authorityId) ?? cityToAuthority.get(normCity(str(d.city) ?? '')) ?? null;
    if (!authorityId) { unattributed++; continue; }
    pending.push({ id: doc.id, authorityId, d });
  }
  const scores = new Map<string, number>();
  const storedGap = new Map<string, number>();
  for (let i = 0; i < pending.length; i += 300) {
    const snaps = await db.getAll(...pending.slice(i, i + 300).map((p) => db.collection('route_scores').doc(p.id)), { fieldMask: ['score', 'geometryGapM'] });
    for (const s of snaps) {
      const x = s.exists ? (s.data() ?? {}) : {};
      if (typeof x.score === 'number') scores.set(s.id, x.score);
      if (typeof x.geometryGapM === 'number' && Number.isFinite(x.geometryGapM)) storedGap.set(s.id, x.geometryGapM);
    }
  }
  // Straight-bridge guard: no stored gap → measure the stored path now (path only read for those).
  const paths = new Map<string, unknown>();
  const unmeasured = pending.filter((p) => !storedGap.has(p.id));
  for (let i = 0; i < unmeasured.length; i += 100) {
    const snaps = await db.getAll(...unmeasured.slice(i, i + 100).map((p) => db.collection('official_routes').doc(p.id)), { fieldMask: ['path'] });
    for (const s of snaps) if (s.exists) paths.set(s.id, (s.data() ?? {}).path);
  }
  const candidates = pending.map((p): PendingRouteCandidate => {
    const g = classifyGeometry(storedGap.get(p.id), paths.get(p.id));
    return {
      id: p.id,
      authorityId: p.authorityId,
      name: str(p.d.name) ?? '(ללא שם)',
      distanceKm: typeof p.d.distance === 'number' ? p.d.distance : null,
      score: scores.get(p.id) ?? null,
      origin: str(p.d.origin),
      geometry: g.status,
      gapM: g.gapM,
    };
  });
  const used = new Set(candidates.map((c) => c.authorityId));
  return { candidates, authorityNames: Object.fromEntries(Array.from(used, (id) => [id, names.get(id) ?? id])), unattributed };
}

export interface BulkApproveRequest { authorityId: string; ids: string[] }

export function parseBulkApproveRequest(body: unknown): { ok: true; value: BulkApproveRequest } | { ok: false; error: string } {
  const b = body && typeof body === 'object' ? (body as Data) : {};
  const authorityId = validAuthorityId(typeof b.authorityId === 'string' ? b.authorityId : null);
  if (!authorityId) return { ok: false, error: 'invalid authorityId' };
  if (!Array.isArray(b.ids) || b.ids.length === 0 || b.ids.length > BULK_APPROVE_BATCH || !b.ids.every(validDocId)) {
    return { ok: false, error: `ids must be 1..${BULK_APPROVE_BATCH} document ids` };
  }
  return { ok: true, value: { authorityId, ids: Array.from(new Set(b.ids as string[])) } };
}

async function adminNameOf(uid: string): Promise<string> {
  try {
    return str((await getAdminAuth().getUser(uid)).displayName) ?? uid;
  } catch {
    return uid;
  }
}

export async function approvePendingRoutes(db: Firestore, uid: string, req: BulkApproveRequest): Promise<BatchOutcome> {
  const col = db.collection('official_routes');
  const { names } = await readAuthorityNames(db, req.authorityId);
  const mine = new Set(names.map(normCity));
  const snaps = await db.getAll(...req.ids.map((id) => col.doc(id)));
  const out: BatchOutcome = { updated: [], skipped: [] };
  const lastUpdate = new Map<string, Timestamp | undefined>();
  const docData = new Map<string, Data>();
  for (const s of snaps) {
    const d = s.data() as Data | undefined;
    if (!s.exists || !d) out.skipped.push({ id: s.id, reason: 'not_found' });
    else if (!(d.authorityId === req.authorityId || (!str(d.authorityId) && mine.has(normCity(str(d.city) ?? ''))))) out.skipped.push({ id: s.id, reason: 'other_authority' });
    else if (!isPendingRoute(d)) out.skipped.push({ id: s.id, reason: 'not_pending' });
    else { out.updated.push(s.id); lastUpdate.set(s.id, s.updateTime); docData.set(s.id, d); }
  }
  if (!out.updated.length) return out;

  // Straight-bridge guard, enforced at write time (not just hidden in the UI): same
  // classification as the preview, from the stored route_scores gap or the doc's own path.
  const stored = new Map<string, unknown>();
  for (let i = 0; i < out.updated.length; i += 300) {
    const sc = await db.getAll(...out.updated.slice(i, i + 300).map((id) => db.collection('route_scores').doc(id)), { fieldMask: ['geometryGapM'] });
    for (const s of sc) if (s.exists) stored.set(s.id, (s.data() ?? {}).geometryGapM);
  }
  const passing: string[] = [];
  for (const id of out.updated) {
    const g = classifyGeometry(stored.get(id), docData.get(id)?.path);
    if (g.status === 'ok') passing.push(id);
    else out.skipped.push({ id, reason: g.status === 'gap' ? 'geometry_gap' : 'geometry_unmeasured' });
  }
  out.updated = passing;
  if (!out.updated.length) return out;

  // Static fields go through the route-collections chokepoint (update mode, no authority fields touched);
  // the server timestamps are added after validation (a FieldValue is not a schema value).
  const fixed = buildValidatedDoc('official_routes', { published: true, status: 'published' }, { mode: 'update', knownAuthorityIds: new Set<string>(), existing: {} });
  const payload = { ...fixed, publishedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() };
  const pre = (id: string) => (lastUpdate.get(id) ? { lastUpdateTime: lastUpdate.get(id)! } : undefined);
  const audit = async (n: number) => ({
    adminId: uid,
    adminName: await adminNameOf(uid),
    actionType: 'APPROVE',
    targetEntity: 'Route',
    targetId: n === 1 ? out.updated[0] : req.authorityId,
    details: `Bulk-approved ${n} pending route(s) in authority ${req.authorityId} via /admin/city-mapping/hub (nationwide bulk)`,
    timestamp: new Date(),
  });
  const ids = out.updated;
  try {
    const batch = db.batch();
    for (const id of ids) batch.update(col.doc(id), payload, pre(id) as never);
    batch.set(db.collection('audit_logs').doc(), await audit(ids.length));
    await batch.commit();
    return out;
  } catch (err) {
    console.warn('[hub/bulk-routes] batch failed, falling back to per-doc updates:', (err as Error)?.message);
  }
  // A precondition failed (or the batch failed atomically): redo per doc, so one
  // concurrently-changed route is reported as a conflict and never aborts the rest.
  const done: string[] = [];
  for (const id of ids) {
    try {
      await col.doc(id).update(payload, pre(id) as never);
      done.push(id);
    } catch {
      out.skipped.push({ id, reason: 'conflict' });
    }
  }
  out.updated = done;
  if (done.length) await db.collection('audit_logs').doc().set(await audit(done.length));
  return out;
}
