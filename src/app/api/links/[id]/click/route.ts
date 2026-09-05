/**
 * GET / POST /api/links/[id]/click
 *
 * Anonymous click-tracking endpoint for the Admin Marketing UTM
 * Registry (see `src/features/admin/services/marketing-links.service.ts`).
 *
 * Behaviour
 * ─────────
 *   • Reads the `marketing_links/{id}` doc via the Admin SDK so the
 *     write succeeds without an authenticated session (Firestore client
 *     rules can stay locked-down to admins).
 *   • Atomically bumps `clicksCount` via `FieldValue.increment(1)` —
 *     concurrent visits never lose a count.
 *   • Honours `?redirect=0` so the link can be used as a pure tracking
 *     beacon (POST or POST-like usage) without forcing a navigation.
 *   • Honours `?append=1` to forward any extra query-string params the
 *     caller appended onto the deep tracking URL (e.g. an A/B variant).
 *   • Returns 302 → resolved tracking URL on a normal GET, JSON on POST
 *     or when `redirect=0` is set. The Admin Panel uses POST for
 *     quick-test pings; campaign HTML uses GET for actual fly-bys.
 *
 * Defensive notes
 * ───────────────
 *   • A missing or inactive link returns a 404 JSON body (instead of
 *     302 → /404) so analytics tools downstream can distinguish
 *     "broken link" from "actual visit".
 *   • All error branches log to `console.error` so Vercel logs surface
 *     the failure context for ops review without breaking the redirect.
 *   • Adds `Cache-Control: no-store` so a proxy never serves a stale
 *     redirect (we MUST run the increment on every visit).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { FieldValue, Timestamp, type DocumentReference } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase-admin';
import { buildTrackingUrl } from '@/features/admin/services/marketing-links.service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const COLLECTION = 'marketing_links' as const;
const NO_STORE_HEADERS = { 'Cache-Control': 'no-store, max-age=0' } as const;

/** Per-click records are analytics detail, not a permanent record — auto-expire. */
const CLICK_RECORD_TTL_DAYS = 30;

/**
 * One-way, salted hash — never persist a raw IP. The salt lives in
 * `LINK_CLICK_IP_SALT`; the literal fallback only degrades the hash's
 * resistance to rainbow-table reversal, it never blocks the write.
 */
function hashIp(ip: string): string {
  const salt = process.env.LINK_CLICK_IP_SALT || 'out-run-unsalted-fallback-do-not-rely-on-this';
  return createHash('sha256').update(`${salt}:${ip}`).digest('hex');
}

function derivePlatform(userAgent: string | null): 'ios' | 'android' | 'web' {
  if (!userAgent) return 'web';
  const ua = userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  if (/android/.test(ua)) return 'android';
  return 'web';
}

/**
 * Best-effort per-click record for future install/user matching (link_id ↔
 * user_id join work). Written to `marketing_links/{id}/clicks/{autoId}` —
 * never blocks the redirect; caller wraps this in its own try/catch.
 */
async function recordClickEvent(
  linkRef: DocumentReference,
  request: NextRequest,
): Promise<void> {
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = (forwarded ? forwarded.split(',')[0] : null)?.trim() || 'unknown';
  const userAgent = request.headers.get('user-agent');

  const expireAt = new Date();
  expireAt.setDate(expireAt.getDate() + CLICK_RECORD_TTL_DAYS);

  await linkRef.collection('clicks').add({
    linkId: linkRef.id,
    timestamp: FieldValue.serverTimestamp(),
    userAgent: userAgent ? userAgent.slice(0, 300) : null,
    ipHash: hashIp(ip),
    platform: derivePlatform(userAgent),
    // Requires a Firestore TTL policy on `clicks.expireAt` (collection
    // group) enabled in the Firebase console/CLI — this field alone does
    // not auto-delete anything; see docs/marketing-attribution.md.
    expireAt: Timestamp.fromDate(expireAt),
  });
}

interface MarketingLinkRow {
  friendlyName?: string;
  oneLinkUrl?: string;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  clicksCount?: number;
  isActive?: boolean;
}

async function handleClick(
  request: NextRequest,
  id: string,
): Promise<NextResponse> {
  if (!id) {
    return NextResponse.json(
      { error: 'id is required' },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  let row: MarketingLinkRow | undefined;
  try {
    const db = getAdminDb();
    const ref = db.collection(COLLECTION).doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json(
        { error: 'link not found', id },
        { status: 404, headers: NO_STORE_HEADERS },
      );
    }
    row = snap.data() as MarketingLinkRow;

    if (row?.isActive === false) {
      // Still increment the counter so admins see the (silent) traffic
      // — but reject the redirect with a 410-style payload so downstream
      // funnels don't pollute the active campaign metrics.
      await ref.update({
        clicksCount: FieldValue.increment(1),
        lastClickAt: FieldValue.serverTimestamp(),
        inactiveClicksCount: FieldValue.increment(1),
      });
      try {
        await recordClickEvent(ref, request);
      } catch (clickErr) {
        console.error('[api/links/click] click-record write failed:', clickErr);
      }
      return NextResponse.json(
        { error: 'link disabled', id },
        { status: 410, headers: NO_STORE_HEADERS },
      );
    }

    await ref.update({
      clicksCount: FieldValue.increment(1),
      lastClickAt: FieldValue.serverTimestamp(),
    });
    try {
      await recordClickEvent(ref, request);
    } catch (clickErr) {
      console.error('[api/links/click] click-record write failed:', clickErr);
    }
  } catch (err) {
    console.error('[api/links/click] increment failed:', err);
    // Fall through — we still want to redirect the user even if the
    // count write failed (analytics must NEVER block UX).
    if (!row) {
      return NextResponse.json(
        { error: 'tracking unavailable' },
        { status: 503, headers: NO_STORE_HEADERS },
      );
    }
  }

  const url = new URL(request.url);
  const shouldRedirect = url.searchParams.get('redirect') !== '0';
  const shouldAppend = url.searchParams.get('append') === '1';

  const baseTrackingUrl = buildTrackingUrl({
    oneLinkUrl: row?.oneLinkUrl ?? '',
    utmSource: row?.utmSource ?? null,
    utmMedium: row?.utmMedium ?? null,
    utmCampaign: row?.utmCampaign ?? null,
  });

  // Always carry our own `link_id` onto the target URL (independent of
  // `append`) so `captureMarketingAttribution` can record it even when a
  // link has no utm_* fields filled in — the common case for a physical
  // QR code where only `friendlyName` + a city/location note are set.
  //
  // Also forward any extra UTM-like params the caller appended onto our
  // URL (other than our own `redirect` / `append` flags, and only when
  // `append=1`) so an A/B variant or sub-source attribution can ride
  // through to the landing page.
  let target = baseTrackingUrl;
  if (target) {
    try {
      const targetUrl = new URL(target);
      if (!targetUrl.searchParams.has('link_id')) {
        targetUrl.searchParams.set('link_id', id);
      }
      if (shouldAppend) {
        url.searchParams.forEach((value, key) => {
          if (key === 'redirect' || key === 'append') return;
          if (!targetUrl.searchParams.has(key)) {
            targetUrl.searchParams.set(key, value);
          }
        });
      }
      target = targetUrl.toString();
    } catch {
      // Non-absolute URL — best-effort, leave as-is.
    }
  }

  if (!shouldRedirect) {
    return NextResponse.json(
      { ok: true, id, target: target || null },
      { status: 200, headers: NO_STORE_HEADERS },
    );
  }

  if (!target) {
    return NextResponse.json(
      { error: 'link missing target URL', id },
      { status: 502, headers: NO_STORE_HEADERS },
    );
  }

  return NextResponse.redirect(target, { status: 302, headers: NO_STORE_HEADERS });
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  return handleClick(request, params.id);
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  return handleClick(request, params.id);
}
