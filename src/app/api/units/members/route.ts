/**
 * GET /api/units/members — approved members + pending join requests for a
 * manager's own domain (with names — SPEC-PERMISSIONS-MODEL.md §5: unlike
 * the municipal vertical, military/school managers DO see real names of
 * the people in their unit/tenant, because they personally know them and
 * need to grade/evaluate them).
 *
 * Stage 3 of the military/school vertical build (.claude/plans/tenant-
 * military-school-vertical-model.md §ח). Domain is resolved ENTIRELY from
 * the caller's own token via resolveUnitPermissionScope(uid) — the
 * optional `tenantId`/`unitId` query params NEVER expand what a caller can
 * see, only narrow within what their own resolved scope already allows
 * (or, for root, select what to look at — root has no "own" domain to
 * default to).
 *
 *   - unit_admin: sees only unit(s) in their own resolved unitIds. An
 *     explicit ?unitId= outside that set is rejected — same generic
 *     message as every other denial in this route, no existence leak.
 *     No unitId given → all of their own units at once.
 *   - tenant_owner: sees every unit under their own resolved tenantId. An
 *     explicit ?unitId= is checked to actually belong to that tenant.
 *     No unitId given → every unit under the tenant.
 *   - root: no default domain — ?tenantId= is REQUIRED (400, not a
 *     security denial — root has no existence-leak concern). ?unitId=
 *     optional, narrows to one unit under that tenant.
 *   - denied: 403, same generic message.
 *
 * Hard requirement (David, 24.09.2026): no unit-level member-COUNT field
 * may ever reach a public consumer — only the manager of that specific
 * unit. This endpoint is manager-only by construction (every branch above
 * either resolves a real domain or denies) — the array length in the
 * response is only ever visible to someone already authorized to see the
 * full member list it's the length of. Do NOT reuse this response shape
 * (or extract just a count from it) for any public-facing endpoint,
 * including the future unit picker (Stage 4) or unitDirectory.
 */
import { NextRequest, NextResponse } from 'next/server';
import type { Firestore } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { resolveUnitPermissionScope, type UnitPermissionScope } from '@/lib/unitPermissionScope';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DENIED_MESSAGE = 'אין לך הרשאה לצפות ברשימה זו.';

interface MemberEntry {
  uid: string;
  name: string;
}
interface PendingEntry {
  uid: string;
  name: string;
}
interface UnitMembersBlock {
  tenantId: string;
  unitId: string;
  unitName: string;
  approvedMembers: MemberEntry[];
  pendingRequests: PendingEntry[];
}

/**
 * Core computation, factored out of the HTTP handler for direct emulator
 * testability — matches the compute*() split used throughout this build.
 * `scope` is already-resolved (uid-only input, upstream) — this function
 * never reads anything client-supplied for AUTHORIZATION, only
 * `query.tenantId`/`query.unitId` to know which of the caller's own
 * already-allowed units to narrow to.
 */
export async function computeUnitMembers(
  db: Firestore,
  scope: UnitPermissionScope,
  query: { tenantId?: string | null; unitId?: string | null },
) {
  if (scope.kind === 'denied') {
    return { status: 403 as const, body: { error: DENIED_MESSAGE } };
  }

  let targetTenantId: string;
  let targetUnitIds: string[] | null; // null = "every unit under targetTenantId"

  if (scope.kind === 'unitAdmin') {
    targetTenantId = scope.tenantId;
    if (query.unitId) {
      if (!scope.unitIds.includes(query.unitId)) {
        return { status: 403 as const, body: { error: DENIED_MESSAGE } };
      }
      targetUnitIds = [query.unitId];
    } else {
      targetUnitIds = scope.unitIds;
    }
  } else if (scope.kind === 'tenantOwner') {
    targetTenantId = scope.tenantId;
    if (query.unitId) {
      const unitSnap = await db.collection('tenants').doc(targetTenantId).collection('units').doc(query.unitId).get();
      if (!unitSnap.exists) {
        return { status: 403 as const, body: { error: DENIED_MESSAGE } };
      }
      targetUnitIds = [query.unitId];
    } else {
      targetUnitIds = null;
    }
  } else {
    // scope.kind === 'root' — no "own" domain to default to.
    if (!query.tenantId) {
      return { status: 400 as const, body: { error: 'tenantId is required' } };
    }
    targetTenantId = query.tenantId;
    if (query.unitId) {
      const unitSnap = await db.collection('tenants').doc(targetTenantId).collection('units').doc(query.unitId).get();
      if (!unitSnap.exists) {
        return { status: 400 as const, body: { error: 'unit not found' } };
      }
      targetUnitIds = [query.unitId];
    } else {
      targetUnitIds = null;
    }
  }

  const unitsCollection = db.collection('tenants').doc(targetTenantId).collection('units');
  let unitDocs: FirebaseFirestore.QueryDocumentSnapshot[];
  if (targetUnitIds === null) {
    unitDocs = (await unitsCollection.get()).docs;
  } else {
    const snaps = await Promise.all(targetUnitIds.map((id) => unitsCollection.doc(id).get()));
    unitDocs = snaps.filter((s): s is FirebaseFirestore.QueryDocumentSnapshot => s.exists) as unknown as FirebaseFirestore.QueryDocumentSnapshot[];
  }

  // One scoped read for the whole tenant, grouped in memory per unit —
  // mirrors computeStatisticsSummary/computeInsightsSummary's established
  // "fetch once per scope, group in memory" pattern, rather than one query
  // per unit (fewer reads, and equality-only + collection-scoped so no new
  // composite index — see the report for the index analysis).
  const [membersSnap, pendingSnap] = await Promise.all([
    db.collection('users').where('core.tenantId', '==', targetTenantId).get(),
    db.collection('unit_join_requests').where('tenantId', '==', targetTenantId).where('status', '==', 'pending').get(),
  ]);

  const membersByUnit = new Map<string, MemberEntry[]>();
  membersSnap.docs.forEach((d) => {
    const core = d.data()?.core ?? {};
    const unitId = core.unitId;
    if (typeof unitId !== 'string') return;
    if (!membersByUnit.has(unitId)) membersByUnit.set(unitId, []);
    membersByUnit.get(unitId)!.push({ uid: d.id, name: typeof core.name === 'string' ? core.name : '' });
  });

  const pendingByUnit = new Map<string, PendingEntry[]>();
  await Promise.all(
    pendingSnap.docs.map(async (d) => {
      const unitId = d.data()?.unitId;
      if (typeof unitId !== 'string') return;
      const userSnap = await db.collection('users').doc(d.id).get();
      const name = userSnap.data()?.core?.name;
      if (!pendingByUnit.has(unitId)) pendingByUnit.set(unitId, []);
      pendingByUnit.get(unitId)!.push({ uid: d.id, name: typeof name === 'string' ? name : '' });
    }),
  );

  const units: UnitMembersBlock[] = unitDocs.map((d) => ({
    tenantId: targetTenantId,
    unitId: d.id,
    unitName: typeof d.data()?.name === 'string' ? d.data()!.name : '',
    approvedMembers: membersByUnit.get(d.id) ?? [],
    pendingRequests: pendingByUnit.get(d.id) ?? [],
  }));

  return { status: 200 as const, body: { units } };
}

export async function GET(request: NextRequest) {
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

    const scope = await resolveUnitPermissionScope(uid);
    const db = getAdminDb();
    const query = {
      tenantId: request.nextUrl.searchParams.get('tenantId'),
      unitId: request.nextUrl.searchParams.get('unitId'),
    };
    const result = await computeUnitMembers(db, scope, query);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err: any) {
    // computeUnitMembers deliberately does NOT catch its own Firestore
    // query failures — a missing/failed index must surface here as an
    // uncaught error, never get silently absorbed into an empty `units`
    // array. An empty-but-200 response is indistinguishable from "this
    // manager's unit genuinely has no members" to both the caller and
    // whoever reads the logs later — see David's explicit 24.09.2026
    // requirement (this route's two new query shapes — unit_join_requests
    // by tenantId+status, users by core.tenantId — were verified
    // index-free at the emulator, but the emulator doesn't always match
    // production; this is the safety net if that assumption is wrong).
    // FAILED_PRECONDITION (gRPC code 9) is Firestore's missing-index
    // error; its own message already embeds a direct console link to
    // create the index — flagged with a distinct, greppable prefix so it
    // doesn't get lost among ordinary 500s in log aggregation.
    const looksLikeMissingIndex = err?.code === 9 || /requires an index/i.test(String(err?.message ?? ''));
    if (looksLikeMissingIndex) {
      console.error('[/api/units/members] POSSIBLE MISSING FIRESTORE INDEX:', err?.message ?? err);
    } else {
      console.error('[/api/units/members] error:', err?.message ?? err);
    }
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
