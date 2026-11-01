/**
 * GET /api/catalog/routes — public, edge-cached official-routes catalog
 * (data-exposure plan phase 1.3, 01.11.2026).
 *
 * Replaces the app's direct browser reads of `official_routes`, the same way
 * /api/catalog/parks (SPEC-07) replaced the browser read of `parks`. Selection
 * and caps live in src/lib/route-catalog/official-routes-catalog.server.ts.
 *
 *   GET /api/catalog/routes                       → legacy set (limit 200, published !== false)
 *   GET /api/catalog/routes?scoped=1&authorityIds=a,b → scoped set (enable_scoped_official_routes;
 *                                                      no ids → published-only fallback)
 *
 * Same cache policy as /api/catalog/parks: 10 min at the edge, 24h
 * stale-while-revalidate, 60s in the browser/WebView, ETag + 304. Authority
 * ids keep the client's order (the scoped read's result order follows it).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { buildOfficialRoutesCatalog, parseCatalogSelection } from '@/lib/route-catalog/official-routes-catalog.server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CATALOG_MAX_AGE_SECONDS = 600;
const CATALOG_SWR_SECONDS = 86400;
const CATALOG_CLIENT_MAX_AGE_SECONDS = 60;

export async function GET(request: NextRequest) {
  const selection = parseCatalogSelection(request.nextUrl.searchParams);
  if (selection === null) {
    return NextResponse.json({ error: 'invalid authorityIds' }, { status: 400 });
  }

  let body: string;
  try {
    body = JSON.stringify(await buildOfficialRoutesCatalog(selection));
  } catch (err) {
    console.error('[catalog/routes] build failed:', err);
    return NextResponse.json({ error: 'catalog unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }

  const etag = `"${createHash('sha256').update(body).digest('hex').slice(0, 32)}"`;
  const cacheHeaders = {
    'Cache-Control': `public, max-age=${CATALOG_CLIENT_MAX_AGE_SECONDS}, s-maxage=${CATALOG_MAX_AGE_SECONDS}, stale-while-revalidate=${CATALOG_SWR_SECONDS}`,
    ETag: etag,
  };
  if (request.headers.get('if-none-match') === etag) {
    return new NextResponse(null, { status: 304, headers: cacheHeaders });
  }
  return new NextResponse(body, { headers: { ...cacheHeaders, 'Content-Type': 'application/json' } });
}
