/**
 * POST /api/units/create — creates a new tenants/{tenantId}/units/{unitId}
 * doc with an officer-chosen parent (03.10.2026, 00-MASTER-PLAN.md §13.81).
 *
 * Replaces two prior direct client-SDK setDoc calls (units/page.tsx's
 * handleCreateUnit, [unitId]/page.tsx's handleCreateSubUnit) for two
 * independent reasons:
 *
 * 1. David's explicit requirement: "הקצין בוחר רק מתוך יחידות שבתחום
 *    ההרשאה שלו. אימות בשרת" — a client-side picker alone is not
 *    authorization; the chosen parentUnitId must be checked server-side.
 * 2. firestore.rules' own `allow create: if isAdmin()` on this path (no
 *    tenant_owner/unit_admin branch at all, confirmed by reading the rule)
 *    means BOTH prior direct client writes have only ever succeeded for a
 *    super_admin/root test account — a real tenant_owner/unit_admin's
 *    click has always failed silently (the old handlers' catch blocks
 *    never set a user-visible error). Routing through Admin SDK fixes
 *    this as a byproduct, the same way every other officer-facing mutation
 *    on these pages already migrated off direct client writes.
 *
 * Authorization: resolveUnitPermissionScope + isMemberWithinScope (same
 * shared check /api/units/members/approve|remove use) — reused here by
 * treating the CHOSEN PARENT as the "member unit" being checked:
 *   - root → any parent, any tenant.
 *   - tenantOwner → any unit (or null, i.e. the brigade itself) within
 *     their own tenant — isMemberWithinScope's tenantOwner branch never
 *     inspects the unit id itself.
 *   - unitAdmin → only a unit in their own downward-expanded
 *     scope.unitIds. null (the brigade) is never in that set —
 *     isMemberWithinScope's unitAdmin branch requires memberUnitId to be
 *     a string, so a unit_admin creating directly under the brigade is
 *     correctly denied with zero extra code.
 *
 * The brigade-as-parent trap (David, read twice, verbatim): the brigade is
 * an authorities/{tenantId} doc, never a tenants/{t}/units/{u} doc — its
 * OWN unitDirectory entry (onAuthorityWrite.ts) is keyed by the bare
 * tenantId, never directoryIdForUnit(tenantId, tenantId). If parentUnitId
 * is ever the tenantId itself, normalize to null below — writing it
 * through as a real parentUnitId would make onUnitWrite.ts's existing,
 * untouched fallback (`parentId: parentUnitId ? directoryIdForUnit(...) :
 * tenantId`) compute a directory parent that doesn't exist, and the new
 * unit would silently vanish from the tree. onUnitWrite.ts itself is not
 * touched by this route — the fallback stays exactly as-is; this route's
 * only job is to never hand it a parentUnitId that breaks it.
 */
import { NextRequest, NextResponse } from 'next/server';
import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { isRateLimited } from '@/lib/rateLimit';
import { RATE_LIMITS } from '@/lib/rateLimitConfig';
import { resolveUnitPermissionScope, isMemberWithinScope, UNIT_SCOPE_UNKNOWN_MESSAGE, type UnitPermissionScope } from '@/lib/unitPermissionScope';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DENIED_MESSAGE = 'אין לך הרשאה ליצור יחידה תחת ההורה שנבחר.';

export interface CreateUnitInput {
  tenantId: string;
  name: string;
  /** null/omitted = create directly under the brigade. */
  parentUnitId: string | null;
}

export type CreateUnitResult =
  | { status: 200; body: { unitId: string; name: string; parentUnitId: string | null; unitPath: string[] } }
  | { status: 400 | 403 | 503; body: { error: string } };

/**
 * Core computation, factored out of the HTTP handler for direct emulator
 * testability — matches the compute*() split used throughout this build.
 */
export async function computeCreateUnit(
  db: Firestore,
  scope: UnitPermissionScope,
  input: CreateUnitInput,
): Promise<CreateUnitResult> {
  if (scope.kind === 'unknown') {
    return { status: 503, body: { error: UNIT_SCOPE_UNKNOWN_MESSAGE } };
  }
  if (scope.kind === 'denied') {
    return { status: 403, body: { error: DENIED_MESSAGE } };
  }

  const tenantId = typeof input.tenantId === 'string' ? input.tenantId.trim() : '';
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!tenantId || !name) {
    return { status: 400, body: { error: 'tenantId ושם היחידה הם שדות חובה.' } };
  }

  let parentUnitId = typeof input.parentUnitId === 'string' && input.parentUnitId.trim() ? input.parentUnitId.trim() : null;
  // The trap — see this file's header comment.
  if (parentUnitId === tenantId) {
    parentUnitId = null;
  }

  if (!isMemberWithinScope(scope, tenantId, parentUnitId)) {
    return { status: 403, body: { error: DENIED_MESSAGE } };
  }

  let unitPath: string[];
  if (parentUnitId) {
    const parentSnap = await db.collection('tenants').doc(tenantId).collection('units').doc(parentUnitId).get();
    if (!parentSnap.exists) {
      return { status: 400, body: { error: 'ההורה שנבחר לא נמצא.' } };
    }
    const parentData = parentSnap.data() ?? {};
    const parentPath = Array.isArray(parentData.unitPath) ? (parentData.unitPath as unknown[]).filter((p): p is string => typeof p === 'string') : [];
    unitPath = [...parentPath, name];
  } else {
    unitPath = [name];
  }

  // Same slug+random-suffix convention the two prior client handlers
  // already used — kept as-is (not switched to lib/unit-id.ts's
  // computeUnitId, which is deterministic/hash-based and built for the
  // bulk-import + pending-approval flows' dedup needs; this is a single
  // explicit officer action with no dedup requirement, and two units
  // sharing a name is already allowed today). [^a-z0-9_] strips every
  // non-ASCII character (e.g. a Hebrew name collapses to '', falling back
  // to unit_<suffix>) — ASCII-only by construction, same Eventarc-trigger
  // safety unit-id.ts's own header comment documents for its own scheme.
  const slug = name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  const suffix = Math.random().toString(36).substring(2, 6);
  const unitId = slug ? `${slug}_${suffix}` : `unit_${suffix}`;

  const payload: Record<string, unknown> = {
    name,
    memberCount: 0,
    unitPath,
    createdAt: FieldValue.serverTimestamp(),
  };
  // Omitted entirely (not null) when parentUnitId is null — matches the
  // existing convention in unit-import.service.ts/unit-doc.ts (both only
  // set the key when truthy) and is load-bearing for the trap above:
  // onUnitWrite.ts's fallback (`parentUnitId ? ... : tenantId`) treats
  // absent and null identically, so this is purely about matching
  // convention, not a behavior difference.
  if (parentUnitId) {
    payload.parentUnitId = parentUnitId;
  }

  await db.collection('tenants').doc(tenantId).collection('units').doc(unitId).set(payload);

  return { status: 200, body: { unitId, name, parentUnitId, unitPath } };
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization') ?? '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!idToken) {
      return NextResponse.json({ error: 'Missing auth token' }, { status: 401 });
    }

    const adminAuth = getAdminAuth();
    let callerUid: string;
    try {
      const decoded = await adminAuth.verifyIdToken(idToken, true);
      callerUid = decoded.uid;
    } catch {
      return NextResponse.json({ error: 'Invalid auth token' }, { status: 401 });
    }

    const db = getAdminDb();

    const rateLimited = await isRateLimited(db, `unit-create:${callerUid}`, RATE_LIMITS.unitCreate.uidHourly());
    if (rateLimited) {
      return NextResponse.json({ error: 'יותר מדי בקשות. נסה שוב מאוחר יותר.' }, { status: 429 });
    }

    const body = await request.json().catch(() => ({}));
    const input: CreateUnitInput = {
      tenantId: typeof (body as Record<string, unknown>)?.tenantId === 'string' ? (body as Record<string, unknown>).tenantId as string : '',
      name: typeof (body as Record<string, unknown>)?.name === 'string' ? (body as Record<string, unknown>).name as string : '',
      parentUnitId: typeof (body as Record<string, unknown>)?.parentUnitId === 'string' ? (body as Record<string, unknown>).parentUnitId as string : null,
    };

    const scope = await resolveUnitPermissionScope(callerUid);
    const result = await computeCreateUnit(db, scope, input);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err: any) {
    console.error('[/api/units/create] error:', err?.message ?? err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
