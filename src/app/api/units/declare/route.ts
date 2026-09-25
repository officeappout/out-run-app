/**
 * POST /api/units/declare — self-declaration of a military/educational unit
 * (Slice A of the persona-unit-unification build, 25.09.2026 — see
 * docs/audit-2026-09/00-MASTER-PLAN.md §13.25). The persona drawer's
 * "hierarchy_search" question (HierarchySearchStep.tsx) writes
 * military_declarations/{uid} client-side via savePersonaAnswers(), which
 * NEVER touched users/{uid}.core.tenantId/unitId — so a self-declared
 * soldier was invisible to /api/units/members (Task 4 Stage 3) and, for
 * any real unit_admin/tenant_owner, to the officer's own units panel too
 * (firestore.rules gates military_declarations reads to isOwner/isAdmin
 * only — never the scoped tenant_owner/unit_admin roles). This endpoint is
 * the single, server-side writer that closes that gap: core.tenantId/
 * unitId are locked from direct client writes by noTenantFieldsChanged()
 * in firestore.rules (same reason /api/user/update-authority exists), so
 * the client cannot write them itself even if it wanted to.
 *
 * Ownership split with military_declarations (David, 25.09.2026, explicit
 * — avoids the exact class of race P0-2 fixed: two independent writers on
 * the same field): this endpoint owns orgId/unitId/unitPathIds on
 * military_declarations AND core.tenantId/unitId/unitPath/tenantType on
 * users/{uid} — both, atomically, in the same batch. savePersonaAnswers()
 * (persona-answers.service.ts) keeps owning ONLY the `status` field on
 * military_declarations (and everything for every other, non-unit
 * question/persona) — never orgId/unitId/unitPathIds again once Slice B
 * wires HierarchySearchStep to call this endpoint directly instead.
 *
 * Hard requirements (David, 25.09.2026):
 *   - uid from the verified ID token only, never the request body.
 *   - The declared unit must be a real unitDirectory entry — orgId/unitId
 *     are looked up, never trusted as free text.
 *   - unitPathIds is REBUILT server-side from unitDirectory's own parentId
 *     chain — the request body's shape doesn't even accept a client-
 *     submitted unitPathIds field, so there is nothing to "ignore": a
 *     fabricated ancestor chain simply cannot reach this code at all.
 *   - tenantType is derived from the real authorities/{orgId} record via
 *     authorityTypeToTenantType() — imported directly from
 *     @/features/admin/config/tenantLabels, not re-implemented, since this
 *     route lives in the same TS project as that function (unlike
 *     functions/src/onAuthorityWrite.ts, which duplicates the same
 *     precedence logic only because Cloud Functions is a separate
 *     compilation root with no import path back into src/ — see that
 *     file's own header comment, lines 31-38). Never hardcoded to
 *     'military' — SUPPORTED_TENANT_TYPES below is the only place that
 *     needs a second entry when school comes online.
 *   - The write records provenance: core.unitMembershipSource:
 *     'self_declared' and core.unitApprovedByOfficer: false — a redundant,
 *     explicit "not yet manually approved" signal (an officer-approval
 *     flow doesn't exist yet; this is the marker it will flip when it
 *     does).
 *   - core.blockedUnitIds is checked before accepting a declaration — the
 *     field doesn't exist anywhere in production yet (officer-initiated
 *     removal isn't built), so this check always passes today. Built now
 *     rather than deferred, specifically so it isn't forgotten or rushed
 *     the day removal ships (David, explicit). Keyed by directoryId
 *     (`${orgId}__${unitId}`), not bare unitId — a raw unitId is only
 *     unique WITHIN one tenant's units subcollection (see onUnitWrite.ts's
 *     own collision comment: two different brigades could mint the same
 *     raw unitId) — keying a block by bare unitId could silently also
 *     block an unrelated unit under a different brigade that happens to
 *     share the same id.
 *   - Rate-limited (RATE_LIMITS.unitDeclaration, uid-keyed — matches
 *     unitJoinRequest's own precedent, an authenticated low-frequency
 *     action, not IP-keyed abuse-flooding protection).
 *   - Failure is full rejection, never a partial write — both documents
 *     are written in ONE db.batch(), matching this codebase's own
 *     multi-document-write law (CLAUDE.md's "All-or-nothing writes").
 *
 * Deliberately out of scope for this endpoint (David, 25.09.2026):
 *   - Brigade-only declarations (unitId absent) are rejected outright.
 *     /api/units/members and the whole unit_admin scoping model organize
 *     around a real tenants/{t}/units/{u} document — a brigade-only pick
 *     has no such document to point core.unitId at. A brigade-only
 *     self-declaration (status + org, no specific unit) remains possible
 *     exactly as today, through the UNCHANGED ChoiceStep/savePersonaAnswers
 *     path — it just never reaches this endpoint or core.tenantId/unitId.
 *   - "Unit isn't in the list" (pending_units) is untouched — that
 *     submission has no real orgId/unitId yet by definition, so there is
 *     nothing this endpoint could validate; it keeps writing
 *     military_declarations.pendingUnitId exactly as it does today.
 *   - Officer removal / re-declaration blocking is NOT built here — only
 *     the blockedUnitIds READ CHECK above, ready for that future write
 *     path. No UI, no removal action, no way to populate the field today.
 */
import { NextRequest, NextResponse } from 'next/server';
import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { isRateLimited } from '@/lib/rateLimit';
import { RATE_LIMITS } from '@/lib/rateLimitConfig';
import { authorityTypeToTenantType } from '@/features/admin/config/tenantLabels';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The only tenantTypes this self-declaration flow supports. Not the full
// TenantType union (municipal/company/youth_movement have no persona-
// drawer unit-hierarchy question at all today) — an org that resolves to
// one of those is rejected even if, somehow, a unitDirectory entry exists
// for it (defense in depth; onAuthorityWrite.ts's own gate should already
// prevent that, but this endpoint doesn't assume that gate holds forever).
const SUPPORTED_TENANT_TYPES = new Set(['military', 'educational']);

const NOT_FOUND_MESSAGE = 'היחידה לא נמצאה. בחר מהרשימה.';
const UNSUPPORTED_ORG_MESSAGE = 'ארגון זה אינו נתמך בהצהרה עצמית כרגע.';
const BLOCKED_MESSAGE = 'לא ניתן להצטרף ליחידה זו כרגע. פנה למפקד היחידה.';
const RATE_LIMITED_MESSAGE = 'יותר מדי בקשות. נסה שוב מאוחר יותר.';
const SAVE_FAILED_MESSAGE = 'שמירת ההצהרה נכשלה. נסה שוב.';

interface DirectoryEntryRecord {
  directoryId: string;
  name: string;
  unitId: string | null;
  parentId: string | null;
  orgId: string;
}

/**
 * Walks unitDirectory's own parentId chain UP from the selected entry to
 * the brigade (parentId === null), top-down in the returned array. Never
 * reads anything the client sent — the chain is entirely reconstructed
 * from unitDirectory's own synced data (onUnitWrite.ts/onAuthorityWrite.ts
 * are the only writers of parentId, both Cloud Functions mirroring the
 * real tenants/{t}/units and authorities collections).
 *
 * A cycle (shouldn't exist in synced data, but this endpoint doesn't
 * assume that guarantee holds forever) or a dangling parentId reference
 * stops the walk rather than looping/crashing — the caller treats a
 * chain that doesn't reach a real root (parentId eventually null) the
 * same as "not found", since it means the directory data is inconsistent.
 */
async function resolveAncestorChain(
  db: Firestore,
  startDirectoryId: string,
): Promise<{ chain: DirectoryEntryRecord[]; reachedRoot: boolean }> {
  const chain: DirectoryEntryRecord[] = [];
  const seen = new Set<string>();
  let currentId: string | null = startDirectoryId;

  while (currentId) {
    if (seen.has(currentId)) {
      return { chain, reachedRoot: false }; // cycle — malformed data
    }
    seen.add(currentId);

    const snap = await db.collection('unitDirectory').doc(currentId).get();
    if (!snap.exists) {
      return { chain, reachedRoot: false }; // dangling reference
    }
    const data = snap.data()!;
    const entry: DirectoryEntryRecord = {
      directoryId: currentId,
      name: typeof data.name === 'string' ? data.name : '',
      unitId: typeof data.unitId === 'string' ? data.unitId : null,
      parentId: typeof data.parentId === 'string' ? data.parentId : null,
      orgId: typeof data.orgId === 'string' ? data.orgId : '',
    };
    chain.unshift(entry);
    currentId = entry.parentId;
  }

  return { chain, reachedRoot: true };
}

export interface DeclareUnitInput {
  orgId: unknown;
  unitId: unknown;
}

export type DeclareUnitResult =
  | {
      status: 200;
      body: { tenantId: string; unitId: string; unitPath: string[]; tenantType: string };
    }
  | { status: 400 | 403 | 429 | 500; body: { error: string } };

/**
 * Core computation, factored out of the HTTP handler for direct emulator
 * testability — matches the compute*() split used throughout this build
 * (e.g. computeUnitMembers in ../members/route.ts).
 */
export async function computeUnitDeclaration(
  db: Firestore,
  uid: string,
  input: DeclareUnitInput,
): Promise<DeclareUnitResult> {
  const orgId = typeof input.orgId === 'string' ? input.orgId.trim() : '';
  const unitId = typeof input.unitId === 'string' ? input.unitId.trim() : '';
  if (!orgId || !unitId) {
    // Brigade-only (unitId absent) is a deliberate rejection — see this
    // file's header comment on why. Not the generic NOT_FOUND_MESSAGE:
    // this is a request-shape problem, not "we looked and it doesn't
    // exist", worth distinguishing for anyone debugging a caller.
    return { status: 400, body: { error: 'orgId and unitId are required' } };
  }

  // The unit must be a real, currently-synced unitDirectory entry.
  // directoryId scheme matches onUnitWrite.ts's own directoryIdForUnit()
  // exactly — never re-derived differently.
  const directoryId = `${orgId}__${unitId}`;
  const leafSnap = await db.collection('unitDirectory').doc(directoryId).get();
  if (!leafSnap.exists) {
    return { status: 400, body: { error: NOT_FOUND_MESSAGE } };
  }
  const leafData = leafSnap.data()!;
  if (leafData.orgId !== orgId) {
    // Defense in depth — a mismatched (orgId, unitId) pair. unitDirectory
    // is world-readable (`allow read: if true`), so this reveals nothing
    // an attacker couldn't already see by reading the collection directly.
    return { status: 400, body: { error: NOT_FOUND_MESSAGE } };
  }

  const { chain, reachedRoot } = await resolveAncestorChain(db, directoryId);
  if (!reachedRoot || chain.length === 0) {
    return { status: 400, body: { error: NOT_FOUND_MESSAGE } };
  }
  // Brigade-level entry (unitId: null) is excluded from both arrays —
  // matches MilitaryPersonaAnswers.unitPathIds' own documented shape
  // (sub-unit ids only, orgId tracks the brigade separately) and the
  // existing core.unitPath convention access-code-granted members already
  // use (unit-import.service.ts: sub-unit names only, brigade name is a
  // separate entity under authorities/{orgId}, never part of this array).
  const subChain = chain.filter((e): e is DirectoryEntryRecord & { unitId: string } => e.unitId !== null);
  const resolvedUnitPathIds = subChain.map((e) => e.unitId);
  const resolvedUnitPath = subChain.map((e) => e.name);

  const authoritySnap = await db.collection('authorities').doc(orgId).get();
  if (!authoritySnap.exists) {
    return { status: 400, body: { error: NOT_FOUND_MESSAGE } };
  }
  const tenantType = authorityTypeToTenantType(authoritySnap.data() as any);
  if (!SUPPORTED_TENANT_TYPES.has(tenantType)) {
    return { status: 400, body: { error: UNSUPPORTED_ORG_MESSAGE } };
  }

  const userSnap = await db.collection('users').doc(uid).get();
  const blockedUnitIds: unknown = userSnap.data()?.core?.blockedUnitIds;
  if (Array.isArray(blockedUnitIds) && blockedUnitIds.includes(directoryId)) {
    return { status: 403, body: { error: BLOCKED_MESSAGE } };
  }

  const batch = db.batch();
  batch.update(db.collection('users').doc(uid), {
    'core.tenantId': orgId,
    'core.unitId': unitId,
    'core.unitPath': resolvedUnitPath,
    'core.tenantType': tenantType,
    'core.unitMembershipSource': 'self_declared',
    'core.unitApprovedByOfficer': false,
    'core.unitDeclaredAt': FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  batch.set(
    db.collection('military_declarations').doc(uid),
    {
      orgId,
      unitId,
      unitPathIds: resolvedUnitPathIds,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  try {
    await batch.commit();
  } catch (err) {
    console.error('[/api/units/declare] batch commit failed:', err);
    return { status: 500, body: { error: SAVE_FAILED_MESSAGE } };
  }

  return {
    status: 200,
    body: { tenantId: orgId, unitId, unitPath: resolvedUnitPath, tenantType },
  };
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization') ?? '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!idToken) {
      return NextResponse.json({ error: 'Missing auth token' }, { status: 401 });
    }

    const adminAuth = getAdminAuth();
    let uid: string;
    try {
      const decoded = await adminAuth.verifyIdToken(idToken, true);
      uid = decoded.uid;
    } catch {
      return NextResponse.json({ error: 'Invalid auth token' }, { status: 401 });
    }

    const db = getAdminDb();

    const rateLimited = await isRateLimited(
      db,
      `unit-declaration:${uid}`,
      RATE_LIMITS.unitDeclaration.uidHourly(),
    );
    if (rateLimited) {
      return NextResponse.json({ error: RATE_LIMITED_MESSAGE }, { status: 429 });
    }

    const body = await request.json().catch(() => ({}));
    const result = await computeUnitDeclaration(db, uid, {
      orgId: (body as Record<string, unknown>)?.orgId,
      unitId: (body as Record<string, unknown>)?.unitId,
    });
    return NextResponse.json(result.body, { status: result.status });
  } catch (err: any) {
    console.error('[/api/units/declare] error:', err?.message ?? err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
