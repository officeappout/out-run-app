/**
 * GET /api/admin/bunny/diag
 *
 * DIAGNOSTIC endpoint — bypasses the entire upload flow and pings the
 * simplest Bunny Stream endpoint (`GET /library/{id}`) using the current
 * env credentials. Returns Bunny's raw status + body so we can see exactly
 * what's wrong with the credentials.
 *
 * Use:
 *   curl http://localhost:3000/api/admin/bunny/diag
 *   or open in browser
 *
 * REMOVE THIS ROUTE BEFORE PRODUCTION DEPLOY (or gate it behind admin auth).
 *
 * Possible outcomes:
 *   200 + ok:true               → credentials work, library reachable
 *   200 + ok:false + 401        → API key wrong/disabled for this library
 *   200 + ok:false + 403        → API key valid but lacks permission
 *   200 + ok:false + 404        → Library ID does not exist
 *   200 + ok:false + 0          → Network/DNS failure (proxy/firewall)
 */

import { NextResponse } from 'next/server';
import { BUNNY_API_BASE_URL } from '@/lib/bunny/bunny.config';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  // Read env directly here so we can also report what the route SEES
  // (in case there's any module-load-order weirdness with bunny.service).
  const rawKey       = process.env.BUNNY_API_KEY    ?? '';
  const rawLibraryId = process.env.BUNNY_LIBRARY_ID ?? '';
  const apiKey       = rawKey.trim();
  const libraryId    = rawLibraryId.trim();

  const env = {
    libraryId,
    libraryIdHadWhitespace: rawLibraryId !== libraryId,
    keyLength:   apiKey.length,
    keyMasked:   apiKey.length > 8 ? `${apiKey.slice(0, 4)}…${apiKey.slice(-4)}` : '<short>',
    keyHadWhitespace: rawKey !== apiKey,
    keyHasNonHexChar: /[^0-9a-f-]/i.test(apiKey),
    cdnHostname: process.env.BUNNY_CDN_HOSTNAME ?? '',
  };

  if (!apiKey || !libraryId) {
    return NextResponse.json(
      { ok: false, reason: 'missing_env', env },
      { status: 200 },
    );
  }

  const endpoint = `${BUNNY_API_BASE_URL}/library/${libraryId}`;

  try {
    const res = await fetch(endpoint, {
      method: 'GET',
      headers: {
        AccessKey: apiKey,
        Accept: 'application/json',
      },
      cache: 'no-store',
    });

    const bodyText = await res.text().catch(() => '');
    let bodyJson: unknown = null;
    try { bodyJson = JSON.parse(bodyText); } catch { /* keep as text */ }

    return NextResponse.json({
      ok: res.ok,
      endpoint,
      upstreamStatus: res.status,
      upstreamStatusText: res.statusText,
      upstreamBody: bodyJson ?? bodyText,
      env,
      hint: hintFromStatus(res.status),
    }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({
      ok: false,
      endpoint,
      upstreamStatus: 0,
      networkError: message,
      env,
      hint: 'Network failure (DNS/proxy/firewall) — check internet access from the dev server.',
    }, { status: 200 });
  }
}

function hintFromStatus(status: number): string {
  switch (status) {
    case 200: return 'Credentials work. The library is reachable.';
    case 401: return 'Bunny rejected the AccessKey. The key is wrong, expired, or belongs to a different library. Re-copy from dashboard → Stream Library → API tab.';
    case 403: return 'Key authenticated but lacks permission for this library.';
    case 404: return `Library ID ${process.env.BUNNY_LIBRARY_ID} does not exist on this Bunny account.`;
    case 429: return 'Rate-limited. Wait 60s and retry.';
    default:  return `Unexpected status ${status} — check upstreamBody for Bunny's reason.`;
  }
}
