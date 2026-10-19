/**
 * GET /api/admin/content?type=&locale=&status= — every site_content doc (drafts included) for
 * the /admin/content editor. Super admin only.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdminApi } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { listContentItems } from '@/lib/content-items/store.server';
import { CONTENT_LOCALES, CONTENT_TYPES, type ContentLocale, type ContentStatus, type ContentType } from '@/lib/content-items/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const denied = await requireSuperAdminApi(request);
  if (denied) return denied;
  const sp = request.nextUrl.searchParams;
  const type = sp.get('type');
  const locale = sp.get('locale');
  const status = sp.get('status');
  try {
    const items = await listContentItems(getAdminDb(), {
      type: type && (CONTENT_TYPES as readonly string[]).includes(type) ? (type as ContentType) : undefined,
      locale: locale && (CONTENT_LOCALES as readonly string[]).includes(locale) ? (locale as ContentLocale) : undefined,
      status: status === 'draft' || status === 'published' ? (status as ContentStatus) : undefined,
    });
    return NextResponse.json({ items });
  } catch (err) {
    console.error('[admin/content] list failed', err);
    return NextResponse.json({ error: 'load_failed' }, { status: 500 });
  }
}
