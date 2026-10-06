/**
 * Server-side park write chokepoint (30.09.2026, 00-MASTER-PLAN.md §13.56,
 * stage 2 of the parks permission-model rebuild).
 *
 * Root cause this closes: every park create/update/approve in this
 * codebase went through the client SDK, gated only by firestore.rules'
 * `allow write: if isAdmin()` on the parks collection — which does NOT
 * admit authority_manager. The authority-manager-aware UI/wrapper already
 * existed (src/features/admin/services/parks.service.ts,
 * admin/authority/locations/*) but was structurally broken: any real
 * authority_manager's write failed with permission-denied. Rules alone
 * also cannot protect the scoping invariant itself — a rule that lets
 * authority_manager write parks/{id} at all cannot ALSO restrict which
 * authorityId they write, because the rule has no way to compare
 * "the caller's own authority" against "the value they're trying to set"
 * without a scoped custom claim this app doesn't use (see hasTenant()'s
 * own unresolved custom-claims gap, referenced elsewhere in this repo).
 * A server route can enforce exactly that — which is the actual
 * vulnerability David identified: an authority_manager legitimately
 * allowed to edit parks in their own scope would, under a bare rules
 * relaxation, also be able to rewrite authorityId and effectively steal
 * a park from another city.
 *
 * Design:
 *   - resolveParkWriteCaller(): server-side-only role resolution (Admin
 *     SDK, uid-only) — never trusts a client-supplied role/authorityId.
 *   - computeParkCreate()/computeParkUpdate(): pure w.r.t. their inputs
 *     (db, caller, body) — factored out from the HTTP layer for direct
 *     unit-test coverage, same compute*() split used throughout this
 *     build (computeUnitStructure, computeUnitMembers, ...).
 *   - The audit_logs write happens INSIDE these functions, immediately
 *     after the parks write succeeds — not a separate call a future
 *     editor could forget, David's explicit requirement (30.09.2026).
 *
 * David's decision, 30.09.2026: authority_manager's create/edit publishes
 * immediately — no pending_review gate. "אישור-על לעריכות שלהם מבטל את
 * כל מטרת המהלך... ה-audit הוא מה שמחליף את האישור המוקדם — אמון עם
 * עקיבות, לא שמירת-סף." Approval of CITIZEN-submitted contributions
 * (user_contributions) is a separate, pre-existing flow, untouched here.
 */

import type { Firestore } from 'firebase-admin/firestore';
import { resolveAuthorityManagerScope } from '@/lib/authorityManagerScope';
import { computeNeedsFacilityDetails } from '../utils/park-completeness.util';

// ── Caller resolution ───────────────────────────────────────────────────

export type ParkWriteCaller =
  | { kind: 'root'; uid: string }
  | { kind: 'authority_manager'; uid: string; authorityId: string }
  | { kind: 'denied' };

/**
 * 30.09.2026 — caught while actually wiring the callers up (stage 3), not
 * by the fake-db tests: ParkForm.tsx/LocationEditor.tsx's existing data
 * objects still carry client-SDK-era fields — `createdAt`/`updatedAt` set
 * to Firebase's `serverTimestamp()` sentinel, which JSON-serializes to
 * garbage (a FieldValue is not a plain value); `contentStatus`/
 * `published`/`origin`/`createdByUser` set by the OLD pending_review
 * logic these forms haven't been touched to remove. `root`'s "full field
 * access" design (for genuinely admin-only fields there's no other way to
 * set) must NOT extend to these — they are ALWAYS server-derived, for
 * every caller including root, no exception. Only `authorityId` keeps its
 * caller-kind-specific handling below (root's one real escape hatch, e.g.
 * for the 31 orphan parks).
 */
const ALWAYS_SERVER_CONTROLLED_FIELDS = new Set<string>([
  'id',
  'contentStatus',
  'published',
  'publishedAt',
  'origin',
  'createdByUser',
  'createdAt',
  'updatedAt',
  // David's decision, OSM-import Stage 1 (06.10.2026): computed from
  // gymEquipment/image on every write (computeNeedsFacilityDetails,
  // park-completeness.util.ts) — never settable directly, by anyone,
  // including root. Same pattern as published/contentStatus above.
  'needsFacilityDetails',
]);

/**
 * `admin`/`scope` are already resolved server-side by the caller (via
 * resolveIdentity(idToken) in firebase-admin.ts, the same Bearer-token
 * verification every other admin-UI-facing route in this build uses) —
 * this function only decides what WRITE capability that identity gets
 * for parks specifically. tenant_owner/unit_admin/any other scope, or no
 * scope at all, is 'denied' — nothing found across this codebase gives
 * either of those two roles any real involvement with parks.
 */
export async function resolveParkWriteCaller(
  db: Firestore,
  uid: string,
  admin: boolean,
  scope: string | undefined,
): Promise<ParkWriteCaller> {
  if (admin) return { kind: 'root', uid };
  if (scope !== 'authority_manager') return { kind: 'denied' };

  const managerScope = await resolveAuthorityManagerScope(db, uid);
  if (!managerScope) return { kind: 'denied' };
  return { kind: 'authority_manager', uid, authorityId: managerScope.authorityId };
}

// ── Field allowlist ──────────────────────────────────────────────────────

/**
 * authority_manager's writable fields — content only. Deliberately
 * excludes: authorityId (ownership — enforced separately, never via this
 * list), id, needsAuthorityTagging, neighborhoodId/neighborhoodName,
 * contentStatus/published/publishedAt (server-derived below, not
 * client-settable even though authority_manager's writes now publish
 * immediately — the VALUE is server-decided, the caller doesn't get to
 * set it directly), createdByUser/origin (server-derived, attribution),
 * needsFacilityDetails/linkedOsmAmenityIds (OSM-pipeline bookkeeping),
 * hasUsableEquipment/isPrimaryFitness/isMinor/stopRole (computed fields,
 * never hand-written), terrainType/environment/externalSourceId
 * (route-classification/GIS-import bookkeeping, out of scope for a park
 * content edit), rating/ratingAvg/reviewCount (review-derived aggregates,
 * a separate pipeline entirely), primaryBrand (equipment-majority-derived,
 * per-equipment override takes precedence — not a hand-set field),
 * maximumTime/segmentEndpoints (narrow legacy/linear-park support, no
 * evidence any current editor UI sets these).
 *
 * 30.09.2026 — David's shape-verification ask, after the first version of
 * this list was built by hand from the Park type alone: cross-checked
 * against the TWO existing, proven write paths (createPark's own
 * parkData object AND buildParkUpdateFields.ts, which has its own
 * regression test for a real prior bug — images silently dropped on
 * save). That caught a genuine gap this list had missed on the first
 * pass: hasWaterFountain (and the rest of the "MapPark-specific
 * features" flag group) is real, currently editable via
 * ParkForm.tsx/LocationEditor.tsx, and read on the display side
 * (park-preview/index.tsx) — it simply wasn't reached in the first,
 * incomplete read of the Park type. `address` was removed — declared on
 * the Park type but absent from BOTH existing write paths, no evidence
 * it's actually wired for a park document specifically.
 */
const AUTHORITY_MANAGER_ALLOWED_FIELDS = new Set<string>([
  'name',
  'description',
  'city',
  'location',
  'facilityType',
  'sportTypes',
  'featureTags',
  'natureType',
  'communityType',
  'urbanType',
  'stairsDetails',
  'benchDetails',
  'parkingDetails',
  'isDogFriendly',
  'courtType',
  'image',
  'images',
  'imageUrl',
  'imagePosition',
  'facilities',
  'gymEquipment',
  'amenities',
  'status',
  'hasDogPark',
  'hasWaterFountain',
  'hasLights',
  'isShaded',
  'hasNaturalShade',
  'hasBikeRacks',
  'hasNearbyShelter',
  'neighborhoodId',
  'neighborhoodName',
]);

// ── Audit ────────────────────────────────────────────────────────────────

/** Mirrors functions/src/lib/resolveAdminDisplayName.ts's own logic —
 * duplicated rather than cross-imported from functions/src (a separate
 * compilation project from the Next.js app) for a 10-line pure helper. */
async function resolveDisplayName(db: Firestore, uid: string, tokenEmail: string | undefined): Promise<string> {
  try {
    const snap = await db.collection('users').doc(uid).get();
    const core = (snap.exists ? snap.data()?.core : undefined) as { name?: string } | undefined;
    if (typeof core?.name === 'string' && core.name.trim().length > 0) {
      return core.name.trim().slice(0, 200);
    }
  } catch { /* fall through */ }
  return tokenEmail || 'Admin';
}

function clampAuditValue(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  try {
    const json = JSON.stringify(v);
    if (typeof json !== 'string') return null;
    return json.length > 10_000 ? json.slice(0, 10_000) + '…[truncated]' : json;
  } catch {
    return null;
  }
}

/** Same document shape functions/src/auditLogger.ts's logAuditAction
 * Callable writes — this route writes audit_logs DIRECTLY via Admin SDK
 * (bypassing that Callable entirely; we're already server-side, no need
 * for the extra hop) so existing readers (audit.service.ts's
 * getAuditLogs/getAuditLogsForEntity) see identical rows regardless of
 * which write path produced them. */
async function writeParkAuditLog(
  db: Firestore,
  params: {
    uid: string;
    tokenEmail: string | undefined;
    actionType: 'CREATE' | 'UPDATE';
    targetId: string;
    oldValue: unknown;
    newValue: unknown;
    sourceIp: string;
  },
): Promise<void> {
  const adminName = await resolveDisplayName(db, params.uid, params.tokenEmail);
  await db.collection('audit_logs').add({
    adminId: params.uid,
    adminName,
    actionType: params.actionType,
    targetEntity: 'Park',
    targetId: params.targetId,
    details: `${params.actionType === 'CREATE' ? 'Created' : 'Updated'} park via /api/admin/parks`,
    oldValue: clampAuditValue(params.oldValue),
    newValue: clampAuditValue(params.newValue),
    sourceIp: params.sourceIp,
    timestamp: new Date(),
  });
}

// ── Create ───────────────────────────────────────────────────────────────

export type ParkCreateResult =
  | { status: 200; body: { parkId: string } }
  | { status: 400 | 403; body: { error: string } };

export interface ParkCreateContext {
  tokenEmail: string | undefined;
  sourceIp: string;
}

export async function computeParkCreate(
  db: Firestore,
  caller: ParkWriteCaller,
  requestBody: Record<string, unknown>,
  ctx: ParkCreateContext,
): Promise<ParkCreateResult> {
  if (caller.kind === 'denied') {
    return { status: 403, body: { error: 'אין לך הרשאה ליצור פארק.' } };
  }

  let authorityId: string;
  if (caller.kind === 'root') {
    const requested = requestBody.authorityId;
    if (typeof requested !== 'string' || !requested.trim()) {
      return { status: 400, body: { error: 'authorityId is required' } };
    }
    // axiom §23's rule (route-collections) applied identically here — no
    // CREATE without a resolved, real authority.
    const authSnap = await db.collection('authorities').doc(requested).get();
    if (!authSnap.exists) {
      return { status: 400, body: { error: 'authorityId does not exist' } };
    }
    authorityId = requested;
  } else {
    // authority_manager — their OWN resolved authority, never whatever
    // the request body claims. A client-supplied authorityId here is
    // simply never read.
    authorityId = caller.authorityId;
  }

  const name = requestBody.name;
  if (typeof name !== 'string' || !name.trim()) {
    return { status: 400, body: { error: 'name is required' } };
  }
  const location = requestBody.location as { lat?: unknown; lng?: unknown } | undefined;
  if (!location || typeof location.lat !== 'number' || typeof location.lng !== 'number') {
    return { status: 400, body: { error: 'location {lat, lng} is required' } };
  }

  const doc: Record<string, unknown> = {
    authorityId,
    // David's decision, 30.09.2026: authority_manager's own creates
    // publish immediately — no pending_review gate. origin still
    // records WHO created it (existing field, unrelated meaning
    // elsewhere in the codebase not touched here — flagged in the
    // completion report).
    contentStatus: 'published',
    published: true,
    origin: caller.kind === 'root' ? 'super_admin' : 'authority_admin',
    createdByUser: caller.uid,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const rejectedFields: string[] = [];
  for (const [key, value] of Object.entries(requestBody)) {
    if (key === 'authorityId') continue; // already resolved above, server-side
    if (ALWAYS_SERVER_CONTROLLED_FIELDS.has(key)) continue; // silently dropped, for every caller — see the set's own comment
    if (caller.kind === 'root') {
      doc[key] = value;
      continue;
    }
    if (!AUTHORITY_MANAGER_ALLOWED_FIELDS.has(key)) {
      rejectedFields.push(key);
      continue;
    }
    doc[key] = value;
  }
  if (rejectedFields.length > 0) {
    return { status: 400, body: { error: `שדות לא מורשים: ${rejectedFields.join(', ')}` } };
  }

  doc.needsFacilityDetails = computeNeedsFacilityDetails(doc);

  const ref = await db.collection('parks').add(doc);

  await writeParkAuditLog(db, {
    uid: caller.uid,
    tokenEmail: ctx.tokenEmail,
    actionType: 'CREATE',
    targetId: ref.id,
    oldValue: null,
    newValue: doc,
    sourceIp: ctx.sourceIp,
  });

  return { status: 200, body: { parkId: ref.id } };
}

// ── Update ───────────────────────────────────────────────────────────────

export type ParkUpdateResult =
  | { status: 200; body: { updatedFields: string[] } }
  | { status: 400 | 403 | 404; body: { error: string } };

export async function computeParkUpdate(
  db: Firestore,
  caller: ParkWriteCaller,
  parkId: string,
  requestBody: Record<string, unknown>,
  ctx: ParkCreateContext,
): Promise<ParkUpdateResult> {
  if (caller.kind === 'denied') {
    return { status: 403, body: { error: 'אין לך הרשאה לערוך פארק זה.' } };
  }

  const parkSnap = await db.collection('parks').doc(parkId).get();
  if (!parkSnap.exists) {
    return { status: 404, body: { error: 'פארק לא נמצא.' } };
  }
  const existingPark = parkSnap.data() as Record<string, unknown>;

  if (caller.kind === 'authority_manager') {
    // The orphan case (authorityId null/missing) is included by this
    // same check, not a special case — an authority_manager can never
    // "claim" an unassigned park by editing it. Only root can (by
    // setting authorityId directly, below).
    if (existingPark.authorityId !== caller.authorityId) {
      return { status: 403, body: { error: 'אין הרשאה לערוך פארק זה.' } };
    }
  }

  const updates: Record<string, unknown> = {};
  const rejectedFields: string[] = [];
  for (const [key, value] of Object.entries(requestBody)) {
    if (key === 'authorityId') {
      // Silently dropped for anyone but root — never written, the rest
      // of a valid request still proceeds. Root MAY reassign it (the
      // manual-assignment path for the pre-existing null-authorityId
      // parks, per David's decision — no automated resolution exists).
      if (caller.kind === 'root') updates.authorityId = value;
      continue;
    }
    // Same rule as create, applied to update too (30.09.2026, caught
    // wiring up the real callers) — createdAt/createdByUser/origin are
    // immutable after creation for anyone; contentStatus/published/
    // publishedAt aren't toggleable through THIS route by any caller
    // today (neither existing form's UI offers an unpublish action) — if
    // that becomes a real need later it's a deliberate, explicit feature
    // to design, not a side effect of root's field access here.
    if (ALWAYS_SERVER_CONTROLLED_FIELDS.has(key)) continue;
    if (caller.kind === 'root') {
      updates[key] = value;
      continue;
    }
    if (!AUTHORITY_MANAGER_ALLOWED_FIELDS.has(key)) {
      rejectedFields.push(key);
      continue;
    }
    updates[key] = value;
  }
  if (rejectedFields.length > 0) {
    return { status: 400, body: { error: `שדות לא מורשים: ${rejectedFields.join(', ')}` } };
  }
  if (Object.keys(updates).length === 0) {
    return { status: 400, body: { error: 'אין שדות לעדכון.' } };
  }

  const oldSnapshot: Record<string, unknown> = {};
  for (const key of Object.keys(updates)) {
    oldSnapshot[key] = existingPark[key] ?? null;
  }

  // Recomputed from the RESULTING state (existing doc + this patch merged),
  // not just the patch alone — an update that doesn't touch gymEquipment/
  // image must still reflect the park's real current completeness.
  updates.needsFacilityDetails = computeNeedsFacilityDetails({ ...existingPark, ...updates });

  updates.updatedAt = new Date();
  await db.collection('parks').doc(parkId).update(updates);

  await writeParkAuditLog(db, {
    uid: caller.uid,
    tokenEmail: ctx.tokenEmail,
    actionType: 'UPDATE',
    targetId: parkId,
    oldValue: oldSnapshot,
    newValue: updates,
    sourceIp: ctx.sourceIp,
  });

  return { status: 200, body: { updatedFields: Object.keys(updates) } };
}
