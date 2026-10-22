/**
 * Amenity approve / reject from the city-mapping hub (CITY-MAPPING-HUB-DESIGN.md
 * §3.4 / §6.4). Server-side because osm_amenities has no rule of its own (it
 * falls to the root-only catch-all), so a non-root super admin's client write
 * would fail — and the rule is NOT opened (verification rule 7).
 *
 * The status payload is byte-for-byte moderation.service.ts's `amenity` case
 * (approve: status published + reviewedBy / reviewedAt / updatedAt; reject: +
 * rejectionReason). Every write is scoped: each id must exist, belong to the
 * given authority and still be `pending` — anything else is skipped and
 * reported, never written. ≤ 500 ids per call = ONE batch, all-or-nothing,
 * with ONE audit_logs row in the same batch (same row shape as the audit
 * Callable / park-write.service).
 */
import 'server-only';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { validAuthorityId } from './url-state';

export const MAX_MODERATE_IDS = 500;
export const MAX_REASON_CHARS = 500;

export interface ModerateRequest {
  authorityId: string;
  action: 'approve' | 'reject';
  ids: string[];
  reason: string | null;
}

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

const validDocId = (v: unknown): v is string => typeof v === 'string' && !!v && v.length <= 128 && !v.includes('/');

export function parseModerateRequest(body: unknown): Parsed<ModerateRequest> {
  const b = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const authorityId = validAuthorityId(typeof b.authorityId === 'string' ? b.authorityId : null);
  if (!authorityId) return { ok: false, error: 'invalid authorityId' };
  if (b.action !== 'approve' && b.action !== 'reject') return { ok: false, error: 'invalid action' };
  if (!Array.isArray(b.ids) || b.ids.length === 0 || b.ids.length > MAX_MODERATE_IDS || !b.ids.every(validDocId)) {
    return { ok: false, error: `ids must be 1..${MAX_MODERATE_IDS} document ids` };
  }
  if (b.reason != null && (typeof b.reason !== 'string' || b.reason.length > MAX_REASON_CHARS)) return { ok: false, error: 'invalid reason' };
  const reason = typeof b.reason === 'string' && b.reason.trim() ? b.reason.trim() : null;
  return { ok: true, value: { authorityId, action: b.action, ids: Array.from(new Set(b.ids as string[])), reason } };
}

export interface ModerateResult {
  updated: string[];
  skipped: Array<{ id: string; reason: 'not_found' | 'other_authority' | 'not_pending' }>;
}

async function adminNameOf(db: Firestore, uid: string): Promise<string> {
  const snap = await db.collection('users').doc(uid).get();
  const core = (snap.data()?.core ?? {}) as Record<string, unknown>;
  const name = [core.name, core.displayName, core.email].find((v) => typeof v === 'string' && v.trim());
  return typeof name === 'string' ? name : uid;
}

export async function moderateAmenities(db: Firestore, uid: string, req: ModerateRequest): Promise<ModerateResult> {
  const col = db.collection('osm_amenities');
  const snaps = await db.getAll(...req.ids.map((id) => col.doc(id)));
  const result: ModerateResult = { updated: [], skipped: [] };
  for (const s of snaps) {
    const d = s.data();
    if (!s.exists || !d) result.skipped.push({ id: s.id, reason: 'not_found' });
    else if (d.authorityId !== req.authorityId) result.skipped.push({ id: s.id, reason: 'other_authority' });
    else if (d.status !== 'pending') result.skipped.push({ id: s.id, reason: 'not_pending' });
    else result.updated.push(s.id);
  }
  if (!result.updated.length) return result;

  const review = { reviewedBy: uid, reviewedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() };
  const payload = req.action === 'approve'
    ? { status: 'published', ...review }
    : { status: 'rejected', rejectionReason: req.reason, ...review };
  const batch = db.batch();
  for (const id of result.updated) batch.update(col.doc(id), payload);
  const verb = req.action === 'approve' ? 'Approved' : 'Rejected';
  batch.set(db.collection('audit_logs').doc(), {
    adminId: uid,
    adminName: await adminNameOf(db, uid),
    actionType: req.action === 'approve' ? 'APPROVE' : 'REJECT',
    targetEntity: 'Amenity',
    targetId: result.updated.length === 1 ? result.updated[0] : req.authorityId,
    details: `${verb} ${result.updated.length} amenit${result.updated.length === 1 ? 'y' : 'ies'} in authority ${req.authorityId} via /admin/city-mapping/hub${req.reason ? ` — ${req.reason}` : ''}`,
    timestamp: new Date(),
  });
  await batch.commit();
  return result;
}
