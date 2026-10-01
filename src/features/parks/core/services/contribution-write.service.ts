/**
 * Server-side contribution approve/reject chokepoint (01.10.2026,
 * 00-MASTER-PLAN.md §13.58, parks Stage 4).
 *
 * Closes the gap David named explicitly: "האישורים נשארו שבורים — חצי
 * מההחלטה של דוד שעדיין לא מומשה." An authority_manager should be able to
 * approve/reject citizen contributions (user_contributions) inside their
 * own jurisdiction. Today they can't: approveEntity/rejectEntity
 * (moderation.service.ts) are client-SDK, gated only by firestore.rules'
 * isAdmin() on both `user_contributions` and `parks` — authority_manager
 * is not admitted by either.
 *
 * This ALSO closes 00-MASTER-PLAN.md §13.58 finding 4, the most severe
 * item in that audit: `contribution.service.ts` imports `createPark`/
 * `updatePark` from the OLD, pre-chokepoint `parks.service.ts` (a relative
 * import, resolved before Stage 2/3 ever existed) — so `approveNewLocation`/
 * `approveSuggestEdit` write parks with ZERO field allowlist, including
 * `editDiff` applied RAW, whatever a citizen's submission happened to
 * contain. Routing contribution-driven park writes through
 * computeParkCreate/computeParkUpdate (park-write.service.ts) closes that
 * exact hole: the same AUTHORITY_MANAGER_ALLOWED_FIELDS /
 * ALWAYS_SERVER_CONTROLLED_FIELDS gate now applies regardless of whether
 * the write came from an admin typing in ParkForm or a citizen's stored
 * contribution being approved.
 *
 * Design, mirroring park-write.service.ts's own pattern exactly:
 *   - resolveParkWriteCaller() is REUSED as-is (park-write.service.ts) —
 *     its root/authority_manager resolution is entity-agnostic despite the
 *     name; a third independent copy of that logic is exactly the drift
 *     this build has already unified once (authorityManagerScope.ts).
 *   - resolveContributionDecisionContext(): the ONE core compute shared by
 *     approve AND reject — David's explicit requirement ("אותו core
 *     compute לשתי הפעולות... דחייה היא כתיבה, לא היעדר כתיבה"). Fetches
 *     the contribution, determines its effective authorityId, and checks
 *     the caller's authorization against it — BEFORE either action decides
 *     what to write.
 *   - computeContributionApprove()/computeContributionReject(): pure w.r.t.
 *     their inputs, same compute*() split as everywhere else in this build.
 *   - Audit written INSIDE both functions, immediately after a successful
 *     write, targetEntity: 'Contribution'.
 *
 * Scope determination — no stored field to trust (shape-verified,
 * 30.09.2026: 0/33 real contribution docs carry authorityId at all):
 *   - suggest_edit / review: both carry linkedParkId, pointing at an
 *     EXISTING park — park.authorityId (shape-verified clean, Stage 2) is
 *     the effective scope. Missing linkedParkId, or a linkedParkId that
 *     doesn't resolve to a real park, is undetermined — denied for anyone
 *     but root, not assumed.
 *   - new_location / report: no existing park to anchor to. Resolved via
 *     the EXISTING, proven geo-resolution helpers
 *     (resolveAuthorityForPoint/parseBoundaryGeoJSON,
 *     src/lib/route-collections/authority-resolution.ts) — never
 *     reimplemented here (David's explicit mandate: a second point-in-
 *     polygon implementation would resurrect the exact regional-council
 *     bug that helper's own test already fixed once). 'ambiguous' (point
 *     inside more than one boundary) is treated as undetermined too, same
 *     as 'unresolved' — both deny for non-root.
 *   - Geometry coverage today (dry-run, owned by a separate chat, not
 *     touched here): 6 of 262 eligible authorities carry a boundary.
 *     Expected, known consequence, not a bug: new_location/report
 *     approval by an authority_manager will deny far more often than
 *     suggest_edit/review's park-anchored resolution, until that
 *     dependency lands. Zero code change required here when it does — the
 *     helper is already the single source geometry coverage improves
 *     against.
 *
 * root: bypasses the scope-match entirely (same as park-write.service.ts),
 * but for new_location specifically still needs a real authorityId to
 * create the resulting park under — computeParkCreate's own existing
 * root-requires-authorityId-in-body requirement already enforces this; an
 * optional `authorityId` in the approve request body is root's one
 * explicit override, read nowhere else, by anyone else.
 *
 * XP is NOT awarded by this chokepoint. David's decision, 30.09.2026:
 * "לא מטפלים בו עכשיו" — awardWorkoutXP (the Guardian) derives uid from
 * request.auth of whoever calls it; a server-side Admin SDK route has no
 * legitimate way to credit an arbitrary contributor's account without new
 * Guardian-side plumbing (functions/, explicitly out of scope). Approval
 * never depends on it and can never fail because of it — xpAwarded is
 * simply left unset by this path, a known, deliberate, tracked gap, not a
 * crash risk.
 */

import type { Firestore } from 'firebase-admin/firestore';
import {
  resolveAuthorityForPoint,
  parseBoundaryGeoJSON,
  type AuthorityBoundary,
} from '@/lib/route-collections/authority-resolution';
import {
  type ParkWriteCaller,
  computeParkCreate,
  computeParkUpdate,
} from './park-write.service';

export { resolveParkWriteCaller as resolveContributionWriteCaller } from './park-write.service';

// ── Authority-boundary fetch (Admin SDK) ────────────────────────────────

/**
 * Mirrors contribution.service.ts's own fetchAuthorityBoundaries exactly
 * (same EXCLUDED_AUTHORITY_TYPES denylist, same "include with a warning,
 * never silently drop an unrecognized type" philosophy) — duplicated
 * rather than cross-imported because that one uses the CLIENT SDK
 * (firebase/firestore), incompatible with this file's Admin SDK Firestore
 * type. The RESOLUTION logic itself (resolveAuthorityForPoint,
 * parseBoundaryGeoJSON) is SDK-agnostic and genuinely shared, imported
 * above — only this fetch is duplicated, same precedent as
 * resolveAdminDisplayName in park-write.service.ts ("a 10-line pure
 * helper," its own words).
 */
const EXCLUDED_AUTHORITY_TYPES = new Set(['neighborhood', 'settlement', 'military_unit', 'school']);

async function fetchAuthorityBoundariesAdmin(db: Firestore): Promise<AuthorityBoundary[]> {
  const snap = await db.collection('authorities').get();
  const result: AuthorityBoundary[] = [];
  for (const d of snap.docs) {
    const data = d.data();
    const type = (data.type as string) ?? '(no type)';
    if (EXCLUDED_AUTHORITY_TYPES.has(type)) continue;
    result.push({
      id: d.id,
      name: (data.name as string) ?? '',
      boundaryGeoJSON: parseBoundaryGeoJSON(data.boundaryGeoJSON) ?? undefined,
      coordinates: data.coordinates ?? undefined,
      radiusKm: data.radiusKm ?? undefined,
    });
  }
  return result;
}

// ── Scope determination ─────────────────────────────────────────────────

/**
 * Resolves the contribution's effective authorityId — null means
 * undetermined, which every caller of this function treats as a denial
 * for anyone but root, never a guess or a fallback to the caller's own
 * scope.
 */
async function resolveContributionScope(
  db: Firestore,
  contribution: Record<string, unknown>,
): Promise<string | null> {
  const type = contribution.type;

  if (type === 'suggest_edit' || type === 'review') {
    const linkedParkId = contribution.linkedParkId;
    if (typeof linkedParkId !== 'string' || !linkedParkId) return null;
    const parkSnap = await db.collection('parks').doc(linkedParkId).get();
    if (!parkSnap.exists) return null;
    const authorityId = parkSnap.data()?.authorityId;
    return typeof authorityId === 'string' && authorityId ? authorityId : null;
  }

  if (type === 'new_location' || type === 'report') {
    const location = contribution.location as { lat?: unknown; lng?: unknown } | undefined;
    if (!location || typeof location.lat !== 'number' || typeof location.lng !== 'number') return null;
    const boundaries = await fetchAuthorityBoundariesAdmin(db);
    const resolution = resolveAuthorityForPoint({ lat: location.lat, lng: location.lng }, boundaries);
    // 'ambiguous' (more than one boundary matches) is undetermined too —
    // never guess which of several candidates is "right."
    if (resolution.status !== 'resolved') return null;
    return resolution.authorityId;
  }

  return null; // unrecognized/missing type — undetermined, deny
}

function isAuthorized(caller: ParkWriteCaller, effectiveAuthorityId: string | null): boolean {
  if (caller.kind === 'root') return true;
  if (caller.kind !== 'authority_manager') return false;
  if (effectiveAuthorityId === null) return false;
  return effectiveAuthorityId === caller.authorityId;
}

// ── Shared decision context — approve AND reject both start here ───────

type DecisionContext =
  | { ok: true; contribution: Record<string, unknown> }
  | { ok: false; status: 403 | 404; error: string };

async function resolveContributionDecisionContext(
  db: Firestore,
  caller: ParkWriteCaller,
  contributionId: string,
): Promise<DecisionContext> {
  if (caller.kind === 'denied') {
    return { ok: false, status: 403, error: 'אין לך הרשאה לפעול על תרומה זו.' };
  }

  const snap = await db.collection('user_contributions').doc(contributionId).get();
  if (!snap.exists) {
    return { ok: false, status: 404, error: 'תרומה לא נמצאה.' };
  }
  const contribution = snap.data() as Record<string, unknown>;

  const effectiveAuthorityId = await resolveContributionScope(db, contribution);
  if (!isAuthorized(caller, effectiveAuthorityId)) {
    return { ok: false, status: 403, error: 'אין הרשאה לפעול על תרומה זו.' };
  }

  return { ok: true, contribution };
}

// ── Audit ────────────────────────────────────────────────────────────────

/** Duplicated from park-write.service.ts's own resolveDisplayName/
 * clampAuditValue — same "10-line pure helper" precedent, not worth a
 * shared extraction for this size. */
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

async function writeContributionAuditLog(
  db: Firestore,
  params: {
    uid: string;
    tokenEmail: string | undefined;
    actionType: 'APPROVE' | 'REJECT';
    targetId: string;
    details: string;
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
    targetEntity: 'Contribution',
    targetId: params.targetId,
    details: params.details,
    oldValue: clampAuditValue(params.oldValue),
    newValue: clampAuditValue(params.newValue),
    sourceIp: params.sourceIp,
    timestamp: new Date(),
  });
}

export interface ContributionWriteContext {
  tokenEmail: string | undefined;
  sourceIp: string;
}

// ── Approve ──────────────────────────────────────────────────────────────

export type ContributionApproveResult =
  | { status: 200; body: { approvedParkId?: string } }
  | { status: 400 | 403 | 404; body: { error: string } };

export async function computeContributionApprove(
  db: Firestore,
  caller: ParkWriteCaller,
  contributionId: string,
  requestBody: Record<string, unknown>,
  ctx: ContributionWriteContext,
): Promise<ContributionApproveResult> {
  if (caller.kind === 'denied') {
    return { status: 403, body: { error: 'אין לך הרשאה לפעול על תרומה זו.' } };
  }
  const decision = await resolveContributionDecisionContext(db, caller, contributionId);
  if (!decision.ok) return { status: decision.status, body: { error: decision.error } };
  const { contribution } = decision;
  const type = contribution.type;

  const contributionUpdate: Record<string, unknown> = {
    status: 'approved',
    reviewedBy: caller.uid,
    reviewedAt: new Date(),
    updatedAt: new Date(),
  };
  let approvedParkId: string | undefined;

  if (type === 'new_location') {
    const parkRequestBody: Record<string, unknown> = {
      name: contribution.parkName ?? 'מיקום חדש',
      location: contribution.location,
      facilityType: contribution.facilityType,
      featureTags: contribution.featureTags ?? [],
      gymEquipment: contribution.gymEquipment ?? [],
      image: contribution.photoUrl,
      status: 'open',
    };
    if (caller.kind === 'root') {
      // root's one explicit override — read nowhere else, by anyone else.
      // If absent, computeParkCreate's own existing requirement (root must
      // supply a real authorityId) surfaces naturally as a 400 below.
      const override = requestBody.authorityId;
      if (typeof override === 'string' && override.trim()) {
        parkRequestBody.authorityId = override;
      }
    }
    // authority_manager: computeParkCreate uses caller.authorityId
    // directly regardless of parkRequestBody.authorityId — not set here.

    const createResult = await computeParkCreate(db, caller, parkRequestBody, ctx);
    if (createResult.status !== 200) {
      return { status: createResult.status, body: createResult.body };
    }
    approvedParkId = createResult.body.parkId;
    contributionUpdate.approvedParkId = approvedParkId;
  } else if (type === 'suggest_edit') {
    const linkedParkId = contribution.linkedParkId;
    const editDiff = contribution.editDiff;
    if (typeof linkedParkId !== 'string' || !linkedParkId || !editDiff || typeof editDiff !== 'object') {
      return { status: 400, body: { error: 'תרומה חסרה linkedParkId או editDiff.' } };
    }
    const updateResult = await computeParkUpdate(db, caller, linkedParkId, editDiff as Record<string, unknown>, ctx);
    if (updateResult.status !== 200) {
      return { status: updateResult.status, body: updateResult.body };
    }
  }
  // report / review: no entity write beyond the contribution doc itself.

  await db.collection('user_contributions').doc(contributionId).update(contributionUpdate);

  await writeContributionAuditLog(db, {
    uid: caller.uid,
    tokenEmail: ctx.tokenEmail,
    actionType: 'APPROVE',
    targetId: contributionId,
    details: `Approved ${type} contribution${approvedParkId ? ` -> park ${approvedParkId}` : ''}`,
    oldValue: { status: contribution.status },
    newValue: contributionUpdate,
    sourceIp: ctx.sourceIp,
  });

  return { status: 200, body: approvedParkId ? { approvedParkId } : {} };
}

// ── Reject ───────────────────────────────────────────────────────────────

export type ContributionRejectResult =
  | { status: 200; body: Record<string, never> }
  | { status: 403 | 404; body: { error: string } };

export async function computeContributionReject(
  db: Firestore,
  caller: ParkWriteCaller,
  contributionId: string,
  requestBody: Record<string, unknown>,
  ctx: ContributionWriteContext,
): Promise<ContributionRejectResult> {
  if (caller.kind === 'denied') {
    return { status: 403, body: { error: 'אין לך הרשאה לפעול על תרומה זו.' } };
  }
  const decision = await resolveContributionDecisionContext(db, caller, contributionId);
  if (!decision.ok) return { status: decision.status, body: { error: decision.error } };
  const { contribution } = decision;

  const reason = typeof requestBody.reason === 'string' ? requestBody.reason.slice(0, 2000) : null;
  const contributionUpdate = {
    status: 'rejected',
    rejectionReason: reason,
    reviewedBy: caller.uid,
    reviewedAt: new Date(),
    updatedAt: new Date(),
  };

  await db.collection('user_contributions').doc(contributionId).update(contributionUpdate);

  await writeContributionAuditLog(db, {
    uid: caller.uid,
    tokenEmail: ctx.tokenEmail,
    actionType: 'REJECT',
    targetId: contributionId,
    details: `Rejected ${contribution.type} contribution${reason ? ` — ${reason}` : ''}`,
    oldValue: { status: contribution.status },
    newValue: contributionUpdate,
    sourceIp: ctx.sourceIp,
  });

  return { status: 200, body: {} };
}
