/**
 * GET /api/content?type=faq|help|article&locale=he|en — PUBLISHED site_content, for the app
 * (search, help hub) and the marketing website (/faq, /learn). Public, no auth, read-only.
 *
 * Cached at the edge: s-maxage 5 min + stale-while-revalidate 1 day, so an admin edit shows up
 * within ~5 minutes and Firestore sees roughly one read per type/locale per 5 minutes.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { listContentItems } from '@/lib/content-items/store.server';
import { toPublicItem } from '@/lib/content-items/schema';
import { CONTENT_LOCALES, CONTENT_TYPES, type ContentLocale, type ContentType } from '@/lib/content-items/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PUBLIC_CACHE_HEADERS = {
  'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=86400',
  'Access-Control-Allow-Origin': '*',
};

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const typeParam = sp.get('type');
  const localeParam = sp.get('locale') ?? 'he';
  if (typeParam && !(CONTENT_TYPES as readonly string[]).includes(typeParam)) {
    return NextResponse.json({ error: 'bad_type' }, { status: 400 });
  }
  if (!(CONTENT_LOCALES as readonly string[]).includes(localeParam)) {
    return NextResponse.json({ error: 'bad_locale' }, { status: 400 });
  }
  try {
    const items = await listContentItems(getAdminDb(), {
      status: 'published',
      type: (typeParam ?? undefined) as ContentType | undefined,
      locale: localeParam as ContentLocale,
    });
    return NextResponse.json({ items: items.map(toPublicItem) }, { headers: PUBLIC_CACHE_HEADERS });
  } catch (err) {
    console.error('[content] public list failed', err);
    return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }
}
