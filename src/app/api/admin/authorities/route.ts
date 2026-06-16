import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/api-auth';
import { getAllAuthorities } from '@/features/admin/services/authority.service';
import { SESSION_COOKIE_NAME, verifyAdminSession } from '@/lib/admin-session';

function tenantTypeOf(type: string): string {
  const t = (type ?? '').toLowerCase();
  if (t === 'military' || t === 'military_unit') return 'military';
  if (t === 'educational' || t === 'school') return 'educational';
  return 'municipal';
}

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  const authorities = await getAllAuthorities();

  // Enforce vertical scoping for vertical admins — server-side filter
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (cookie) {
    const session = await verifyAdminSession(cookie);
    if (session?.uid) {
      const { getAdminDb } = await import('@/lib/firebase-admin');
      const snap = await getAdminDb().collection('users').doc(session.uid).get();
      const core = (snap.data()?.core ?? {}) as Record<string, unknown>;
      if (core.isVerticalAdmin === true && core.isSuperAdmin !== true && core.managedVertical) {
        const vertical = core.managedVertical as string;
        return NextResponse.json(authorities.filter(a => tenantTypeOf(a.type) === vertical));
      }
    }
  }

  return NextResponse.json(authorities);
}
