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
import { NATIONWIDE_APPROVE_DEFAULT_FILTER, authorityKindOf, matchesReviewFilter, parseReviewFilter, type AuthorityKind, type RouteReviewFilter } from './review-filters';

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
    db.collection('authorities').select('name', 'type').get(),
    db.collection('city_inventory').select('city', 'authorityId').get(),
    // NOTE (axiom §33): `published == false` matches only docs where the field is
    // PRESENT and false — a doc with NO `published` field is NOT listed here (same
    // query as the hub table, so counts agree). Sderot was already backfilled; the
    // write guard below uses isPendingRoute, which does treat a missing field as unpublished.
    db.collection('official_routes').where('published', '==', false)
      .select('name', 'authorityId', 'city', 'status', 'published', 'distance', 'origin', 'activityType').get(),
  ]);
  const names = new Map<string, string>();
  const kinds = new Map<string, AuthorityKind>();
  const cityToAuthority = new Map<string, string>();
  for (const d of authSnap.docs) {
    kinds.set(d.id, authorityKindOf((d.data() ?? {}).type));
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
  const lowConf = new Map<string, string>();
  const storedGap = new Map<string, number>();
  for (let i = 0; i < pending.length; i += 300) {
    const snaps = await db.getAll(...pending.slice(i, i + 300).map((p) => db.collection('route_scores').doc(p.id)), { fieldMask: ['score', 'geometryGapM', 'lowConfidenceReason'] });
    for (const s of snaps) {
      const x = s.exists ? (s.data() ?? {}) : {};
      if (typeof x.score === 'number') scores.set(s.id, x.score);
      const lc = str(x.lowConfidenceReason);
      if (lc) lowConf.set(s.id, lc);
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
      lowConfidenceReason: lowConf.get(p.id) ?? null,
      authorityKind: kinds.get(p.authorityId) ?? null,
      city: str(p.d.city),
      activityType: str(p.d.activityType),
    };
  });
  const used = new Set(candidates.map((c) => c.authorityId));
  return { candidates, authorityNames: Object.fromEntries(Array.from(used, (id) => [id, names.get(id) ?? id])), unattributed };
}

export interface BulkApproveRequest {
  authorityId: string;
  ids: string[];
  /**
   * The review filter the admin confirmed (review-filters.ts). When present, every id is
   * re-checked against it at write time — score / low confidence from route_scores, the
   * authority's type, city / activity / name from the route doc — and a mismatch is
   * skipped ('filter_mismatch'), never written. A request with NO filter gets
   * NATIONWIDE_APPROVE_DEFAULT_FILTER (score ≥ 70, low confidence excluded) — never the old
   * unfiltered approve, so an older / scripted caller cannot publish low-score fills by omission.
   */
  filter?: RouteReviewFilter;
}

export function parseBulkApproveRequest(body: unknown): { ok: true; value: BulkApproveRequest } | { ok: false; error: string } {
  const b = body && typeof body === 'object' ? (body as Data) : {};
  const authorityId = validAuthorityId(typeof b.authorityId === 'string' ? b.authorityId : null);
  if (!authorityId) return { ok: false, error: 'invalid authorityId' };
  if (!Array.isArray(b.ids) || b.ids.length === 0 || b.ids.length > BULK_APPROVE_BATCH || !b.ids.every(validDocId)) {
    return { ok: false, error: `ids must be 1..${BULK_APPROVE_BATCH} document ids` };
  }
  let filter: RouteReviewFilter = { ...NATIONWIDE_APPROVE_DEFAULT_FILTER };
  if (b.filter !== undefined && b.filter !== null) {
    const f = parseReviewFilter(b.filter);
    if (!f.ok) return f;
    filter = f.value;
  }
  return { ok: true, value: { authorityId, ids: Array.from(new Set(b.ids as string[])), filter } };
}

export interface BulkRejectRequest extends BulkApproveRequest { reason: string | null }

/** Reject requests always carry a filter (they only come from the filtered "דחה מסוננים" action). */
export function parseBulkRejectRequest(body: unknown): { ok: true; value: BulkRejectRequest } | { ok: false; error: string } {
  const base = parseBulkApproveRequest(body);
  if (!base.ok) return base;
  // Judged on the raw body: the approve parser fills a default filter, a reject never gets one implicitly.
  const rawFilter = (body as Data).filter;
  if (rawFilter === undefined || rawFilter === null) return { ok: false, error: 'filter is required for a bulk reject' };
  const raw = (body as Data).reason;
  if (raw != null && (typeof raw !== 'string' || raw.length > 500)) return { ok: false, error: 'reason must be a string ≤ 500 chars' };
  return { ok: true, value: { ...base.value, reason: typeof raw === 'string' && raw.trim() ? raw.trim() : null } };
}

async function adminNameOf(uid: string): Promise<string> {
  try {
    return str((await getAdminAuth().getUser(uid)).displayName) ?? uid;
  } catch {
    return uid;
  }
}

interface Screened {
  out: BatchOutcome;
  lastUpdate: Map<string, Timestamp | undefined>;
}

/**
 * Write-time screening shared by approve and reject: exists, belongs to the authority, still
 * pending; then (approve only) the straight-bridge guard; then the confirmed review filter.
 * Survivors are in out.updated; everything else is in out.skipped with its reason.
 */
async function screenPendingRoutes(db: Firestore, req: BulkApproveRequest, opts: { geometry: boolean }): Promise<Screened> {
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
  if (!out.updated.length || (!opts.geometry && !req.filter)) return { out, lastUpdate };

  // route_scores: the stored gap (straight-bridge guard) + score / low confidence (review filter).
  const scoreDocs = new Map<string, Data>();
  for (let i = 0; i < out.updated.length; i += 300) {
    const sc = await db.getAll(...out.updated.slice(i, i + 300).map((id) => db.collection('route_scores').doc(id)), { fieldMask: ['geometryGapM', 'score', 'lowConfidenceReason'] });
    for (const s of sc) if (s.exists) scoreDocs.set(s.id, (s.data() ?? {}) as Data);
  }

  if (opts.geometry) {
    // Straight-bridge guard, enforced at write time (not just hidden in the UI): same
    // classification as the preview, from the stored route_scores gap or the doc's own path.
    const passing: string[] = [];
    for (const id of out.updated) {
      const g = classifyGeometry(scoreDocs.get(id)?.geometryGapM, docData.get(id)?.path);
      if (g.status === 'ok') passing.push(id);
      else out.skipped.push({ id, reason: g.status === 'gap' ? 'geometry_gap' : 'geometry_unmeasured' });
    }
    out.updated = passing;
  }

  if (req.filter && out.updated.length) {
    const authSnap = await db.collection('authorities').doc(req.authorityId).get();
    const kind = authSnap.exists ? authorityKindOf((authSnap.data() ?? {}).type) : null;
    const passing: string[] = [];
    for (const id of out.updated) {
      const d = docData.get(id) ?? {};
      const sc = scoreDocs.get(id) ?? {};
      const ok = matchesReviewFilter({
        score: typeof sc.score === 'number' && Number.isFinite(sc.score) ? sc.score : null,
        lowConfidenceReason: str(sc.lowConfidenceReason),
        authorityKind: kind,
        city: str(d.city),
        activityType: str(d.activityType),
        name: str(d.name),
      }, req.filter);
      if (ok) passing.push(id);
      else out.skipped.push({ id, reason: 'filter_mismatch' });
    }
    out.updated = passing;
  }
  return { out, lastUpdate };
}

/**
 * Commit `payload` to every id in out.updated in ONE batch (+ one audit row), each with its
 * lastUpdateTime precondition; on any failure redo per doc so a concurrently-changed route is
 * reported as a conflict and never aborts the rest.
 */
async function commitScreened(
  db: Firestore, sc: Screened, payload: Data, audit: (n: number) => Promise<Data>,
): Promise<BatchOutcome> {
  const col = db.collection('official_routes');
  const { out, lastUpdate } = sc;
  const pre = (id: string) => (lastUpdate.get(id) ? { lastUpdateTime: lastUpdate.get(id)! } : undefined);
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

export async function approvePendingRoutes(db: Firestore, uid: string, req: BulkApproveRequest): Promise<BatchOutcome> {
  const sc = await screenPendingRoutes(db, req, { geometry: true });
  const out = sc.out;
  if (!out.updated.length) return out;

  // Static fields go through the route-collections chokepoint (update mode, no authority fields touched);
  // the server timestamps are added after validation (a FieldValue is not a schema value).
  const fixed = buildValidatedDoc('official_routes', { published: true, status: 'published' }, { mode: 'update', knownAuthorityIds: new Set<string>(), existing: {} });
  const payload = { ...fixed, publishedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() };
  const audit = async (n: number) => ({
    adminId: uid,
    adminName: await adminNameOf(uid),
    actionType: 'APPROVE',
    targetEntity: 'Route',
    targetId: n === 1 ? out.updated[0] : req.authorityId,
    details: `Bulk-approved ${n} pending route(s) in authority ${req.authorityId} via ${req.filter ? `a filtered bulk action (${JSON.stringify(req.filter)})` : '/admin/city-mapping/hub (nationwide bulk)'}`,
    timestamp: new Date(),
  });
  return commitScreened(db, sc, payload, audit);
}

/**
 * Filtered bulk REJECT — the approval center's per-route reject, server-side and re-checked:
 * published:false + status:'archived' + rejectionReason / reviewedBy / reviewedAt (exactly
 * moderation.service rejectEntity('route')), so it is reversible the same way (status back
 * to pending). No geometry guard (rejecting a bridged route is fine); the filter is required.
 */
export async function rejectPendingRoutes(db: Firestore, uid: string, req: BulkRejectRequest): Promise<BatchOutcome> {
  const sc = await screenPendingRoutes(db, req, { geometry: false });
  const out = sc.out;
  if (!out.updated.length) return out;
  const fixed = buildValidatedDoc('official_routes', { published: false, status: 'archived', rejectionReason: req.reason, reviewedBy: uid }, { mode: 'update', knownAuthorityIds: new Set<string>(), existing: {} });
  const payload = { ...fixed, reviewedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() };
  const audit = async (n: number) => ({
    adminId: uid,
    adminName: await adminNameOf(uid),
    actionType: 'REJECT',
    targetEntity: 'Route',
    targetId: n === 1 ? out.updated[0] : req.authorityId,
    details: `Bulk-rejected ${n} pending route(s) in authority ${req.authorityId} via a filtered bulk action (${JSON.stringify(req.filter)})${req.reason ? ` — ${req.reason}` : ''}`,
    timestamp: new Date(),
  });
  return commitScreened(db, sc, payload, audit);
}
