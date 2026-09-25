/**
 * GET /api/units/structure — a unit's own identifying info (name, path,
 * icon) plus its direct children, for the officer panel's unit screens.
 * Slice D of the persona-unit-unification build (25.09.2026, see
 * docs/audit-2026-09/00-MASTER-PLAN.md §13.28).
 *
 * Replaces [unitId]/page.tsx's direct client-SDK reads of
 * tenants/{t}/units/{u} and tenants/{t}/units where parentUnitId==X —
 * both gated by firestore.rules' hasTenant(tenantId), a CUSTOM CLAIM check
 * that's never actually set for any real user in this codebase (confirmed
 * by a full search for setCustomUserClaims — §13.27's finding). David's
 * explicit decision, 25.09.2026: don't build a custom-claims mechanism
 * (requires re-login to take effect) — route officer-panel reads through
 * the server instead, exactly like everything else built this month.
 *
 * Domain resolution: resolveUnitPermissionScope(uid), same as every other
 * route in this build — fail-closed, uid-only, never client input.
 *
 * Downward inheritance (closes docs/audit-2026-09/00-MASTER-PLAN.md
 * §13.17's decision #1): a unit_admin directly manages a BATTALION but not
 * its companies (companies don't carry the officer's uid in their own
 * managerIds) — without this, the officer would see a company listed as a
 * child of their battalion (this endpoint's own response) but get 403
 * navigating INTO it. Originally implemented locally in this file only
 * (a per-request ancestor-walk); moved into resolveUnitPermissionScope
 * itself (25.09.2026, §13.28, David's explicit correction — "מקום אחד, לא
 * שניים") after that created a real, reported inconsistency: a unit_admin
 * could see a descendant unit exists here but still get 403 on
 * /api/units/members for the SAME unit. scope.unitIds now already
 * includes every descendant, for every consumer of this scope uniformly —
 * this file just checks flat membership, same as /api/units/members does.
 */
import { NextRequest, NextResponse } from 'next/server';
import type { Firestore, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { isRateLimited } from '@/lib/rateLimit';
import { RATE_LIMITS } from '@/lib/rateLimitConfig';
import { resolveUnitPermissionScope, type UnitPermissionScope } from '@/lib/unitPermissionScope';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DENIED_MESSAGE = 'אין לך הרשאה לצפות ביחידה זו.';

interface UnitStructureEntry {
  tenantId: string;
  unitId: string;
  name: string;
  unitPath: string[];
  parentUnitId: string | null;
  iconUrl: string | null;
  /**
   * Passthrough of the unit doc's own memberCount field (synced by
   * unit-count-sync.service.ts). Military tenants ignore this client-side
   * in favor of /api/units/members' declared/approved counts — this field
   * exists for the non-military tenant types (educational etc.) that
   * [unitId]/page.tsx's sub-unit rows previously read directly off the
   * raw Firestore doc, before that read moved to this endpoint (Slice D).
   */
  memberCount: number;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function toEntry(tenantId: string, d: QueryDocumentSnapshot): UnitStructureEntry {
  const data = d.data();
  return {
    tenantId,
    unitId: d.id,
    name: typeof data.name === 'string' ? data.name : d.id,
    unitPath: Array.isArray(data.unitPath) ? data.unitPath.filter((s: unknown): s is string => typeof s === 'string') : [],
    parentUnitId: typeof data.parentUnitId === 'string' ? data.parentUnitId : null,
    iconUrl: typeof data.iconUrl === 'string' ? data.iconUrl : null,
    memberCount: typeof data.memberCount === 'number' ? data.memberCount : 0,
  };
}

export type UnitStructureResult =
  | { status: 200; body: { units: UnitStructureEntry[] } }
  | { status: 400 | 403; body: { error: string } };

/**
 * Core computation, factored out of the HTTP handler for direct emulator
 * testability — matches the compute*() split used throughout this build.
 */
export async function computeUnitStructure(
  db: Firestore,
  scope: UnitPermissionScope,
  query: { tenantId?: string | null; unitId?: string | null },
): Promise<UnitStructureResult> {
  if (scope.kind === 'denied') {
    return { status: 403, body: { error: DENIED_MESSAGE } };
  }

  let targetTenantId: string;
  let targetUnitIds: string[] | null; // null = "every unit under targetTenantId"

  if (scope.kind === 'unitAdmin') {
    targetTenantId = scope.tenantId;
    if (query.unitId) {
      // scope.unitIds already includes every descendant of the caller's
      // directly-managed units (resolveUnitPermissionScope, §13.28) — a
      // flat membership check is enough, no local ancestor-walk needed.
      if (!scope.unitIds.includes(query.unitId)) {
        return { status: 403, body: { error: DENIED_MESSAGE } };
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
        return { status: 403, body: { error: DENIED_MESSAGE } };
      }
      targetUnitIds = [query.unitId];
    } else {
      targetUnitIds = null;
    }
  } else {
    // scope.kind === 'root' — no "own" domain to default to.
    if (!query.tenantId) {
      return { status: 400, body: { error: 'tenantId is required' } };
    }
    targetTenantId = query.tenantId;
    if (query.unitId) {
      const unitSnap = await db.collection('tenants').doc(targetTenantId).collection('units').doc(query.unitId).get();
      if (!unitSnap.exists) {
        return { status: 400, body: { error: 'unit not found' } };
      }
      targetUnitIds = [query.unitId];
    } else {
      targetUnitIds = null;
    }
  }

  const unitsCollection = db.collection('tenants').doc(targetTenantId).collection('units');

  let ownDocs: QueryDocumentSnapshot[];
  if (targetUnitIds === null) {
    ownDocs = (await unitsCollection.get()).docs;
  } else {
    const snaps = await Promise.all(targetUnitIds.map((id) => unitsCollection.doc(id).get()));
    ownDocs = snaps.filter((s): s is QueryDocumentSnapshot => s.exists);
  }

  // "everything under it" — direct children of each unit already in the
  // result. Skipped when targetUnitIds === null (tenant_owner/root's
  // whole-tenant fetch already contains every unit, children included).
  let childDocs: QueryDocumentSnapshot[] = [];
  if (targetUnitIds !== null && ownDocs.length > 0) {
    const ownIds = ownDocs.map((d) => d.id);
    const idChunks = chunk(ownIds, 30); // Firestore 'in' cap
    const childSnaps = await Promise.all(
      idChunks.map((ids) => unitsCollection.where('parentUnitId', 'in', ids).get()),
    );
    childDocs = childSnaps.flatMap((s) => s.docs);
  }

  const seen = new Set<string>();
  const units: UnitStructureEntry[] = [];
  for (const d of [...ownDocs, ...childDocs]) {
    if (seen.has(d.id)) continue;
    seen.add(d.id);
    units.push(toEntry(targetTenantId, d));
  }

  return { status: 200, body: { units } };
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

    const db = getAdminDb();

    const rateLimited = await isRateLimited(db, `unit-structure:${uid}`, RATE_LIMITS.unitStructure.uidHourly());
    if (rateLimited) {
      return NextResponse.json({ error: 'יותר מדי בקשות. נסה שוב מאוחר יותר.' }, { status: 429 });
    }

    const scope = await resolveUnitPermissionScope(uid);
    const query = {
      tenantId: request.nextUrl.searchParams.get('tenantId'),
      unitId: request.nextUrl.searchParams.get('unitId'),
    };
    const result = await computeUnitStructure(db, scope, query);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err: any) {
    console.error('[/api/units/structure] error:', err?.message ?? err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
