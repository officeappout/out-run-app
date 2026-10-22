/**
 * GET /api/admin/routes/no-status — official_routes with NO `published` field, for the
 * approval center's routes tab (they are live for users but the page's browser query
 * `published == false` can never see them — axiom §33). The scan + filter lives in
 * src/lib/admin-routes/no-status-routes.server.ts (Admin SDK; Firestore cannot query an absent
 * field from the client or the server, so it is a projected scan).
 *
 * Scope is resolved server-side, the client sends nothing:
 *   - agent key, or core.isSuperAdmin / core.isSystemAdmin (the same "sa" the approval
 *     center uses)                             → every authority;
 *   - an authority manager (authorities.managerIds, resolveAuthorityManagerScope)
 *                                              → only routes whose authorityId is theirs;
 *   - anyone else                              → 403.
 * Read-only. No caching (no-store).
 */
import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { resolveAdminUid } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { resolveAuthorityManagerScope } from '@/lib/authorityManagerScope';
import { computeNoStatusRoutes, type NoStatusScope } from '@/lib/admin-routes/no-status-routes.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function hasAgentKey(request: NextRequest): boolean {
  const agentKey = process.env.AGENT_API_KEY;
  if (!agentKey) return false;
  const presented = request.headers.get('x-agent-key') ?? '';
  if (presented.length !== agentKey.length) return false;
  return timingSafeEqual(Buffer.from(presented), Buffer.from(agentKey));
}

export async function GET(request: NextRequest) {
  try {
    const db = getAdminDb();
    let scope: NoStatusScope | null = null;
    if (hasAgentKey(request)) {
      scope = { kind: 'all' };
    } else {
      const uid = await resolveAdminUid(request);
      if (!uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      const core = ((await db.collection('users').doc(uid).get()).data()?.core ?? {}) as Record<string, unknown>;
      if (core.isSuperAdmin === true || core.isSystemAdmin === true || core.role === 'system_admin') {
        scope = { kind: 'all' };
      } else {
        const mgr = await resolveAuthorityManagerScope(db, uid);
        if (mgr) scope = { kind: 'authority', authorityId: mgr.authorityId };
      }
    }
    if (!scope) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const result = await computeNoStatusRoutes(db, scope);
    return NextResponse.json(result, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[api/admin/routes/no-status GET] failed', err instanceof Error ? err.name : 'unknown');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
