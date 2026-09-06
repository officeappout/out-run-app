/**
 * Shared click-handling logic for the Smart Link redirect, used by both
 * public routes that expose it:
 *   • `/r/[id]`               — new, canonical, go-forward tracking URL.
 *   • `/api/links/[id]/click` — kept working for back-compat (whatever
 *     may already be printed/shared using this older path).
 *
 * Every non-bot click writes TWO documents in one batch: a per-click
 * record (`clicks/{autoId}`, 30-day TTL, for future install/user
 * matching) and a permanent daily rollup (`daily_stats/{YYYY-MM-DD}`, no
 * TTL, for the per-link analytics screen at `/admin/links/[id]`) — see
 * `link-stats-write.ts` / `link-stats.ts`.
 *
 * Behaviour
 * ─────────
 *   • Reads `marketing_links/{id}` via the Admin SDK (bypasses client
 *     rules so an anonymous visit can still bump `clicksCount`).
 *   • Bot / link-preview crawlers (WhatsApp, Facebook, Slack, etc. via
 *     `isbot`) are redirected normally but are NEVER counted — no
 *     `clicksCount` increment, no per-click record. A preview fetch is
 *     not a real visit.
 *   • `useSmartLink: true` on the link → device-based routing straight
 *     to the store (`iosUrl`/`androidUrl`/`desktopUrl`/`fallbackUrl`,
 *     falling back to `DEFAULT_LINK_DESTINATIONS`), with an Android
 *     Play Install Referrer string appended. `useSmartLink` absent/false
 *     (every pre-existing link) → untouched legacy behaviour: redirect to
 *     `oneLinkUrl`+utm (today's onelink.to flow).
 *   • All counting/logging is best-effort: a Firestore write failure is
 *     caught and logged, but the redirect still happens. Analytics must
 *     never block a real user reaching the store.
 */

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID, createHash } from 'crypto';
import { isbot } from 'isbot';
import { FieldValue, Timestamp, type DocumentReference } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase-admin';
import {
  buildTrackingUrl,
  DEFAULT_LINK_DESTINATIONS,
} from '@/features/admin/services/marketing-links.service';
import {
  appendAndroidReferrer,
  buildAndroidReferrerRaw,
  detectDeviceBucket,
  resolveDestinationUrl,
} from '@/features/admin/services/link-routing';
import { buildDailyStatsIncrement } from '@/features/admin/services/link-stats-write';

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

interface MarketingLinkRow {
  friendlyName?: string;
  oneLinkUrl?: string;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  clicksCount?: number;
  isActive?: boolean;
  useSmartLink?: boolean;
  iosUrl?: string | null;
  androidUrl?: string | null;
  desktopUrl?: string | null;
  fallbackUrl?: string | null;
}

interface ClickRecordInput {
  linkRef: DocumentReference;
  request: NextRequest;
  clickId: string;
  device: 'ios' | 'android' | 'desktop';
  androidReferrerSent?: string;
}

/** Vercel URL-encodes both headers (city names can contain non-ASCII chars). */
function getRequestGeo(request: NextRequest): { country: string | null; city: string | null } {
  const rawCountry = request.headers.get('x-vercel-ip-country');
  const rawCity = request.headers.get('x-vercel-ip-city');
  return {
    country: rawCountry ? decodeURIComponent(rawCountry) : null,
    city: rawCity ? decodeURIComponent(rawCity) : null,
  };
}

/**
 * Best-effort per-click record (for future install/user matching) PLUS
 * the permanent daily rollup increment (see `link-stats-write.ts`),
 * written together in one batch — one Firestore round-trip, and the two
 * documents can never disagree with each other about whether "this
 * click" happened. Never blocks the redirect; caller wraps this in its
 * own try/catch.
 */
async function recordClickEvent(input: ClickRecordInput): Promise<void> {
  const { linkRef, request, clickId, device, androidReferrerSent } = input;
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = (forwarded ? forwarded.split(',')[0] : null)?.trim() || 'unknown';
  const userAgent = request.headers.get('user-agent');
  const referrer = request.headers.get('referer'); // HTTP Referer — where the visitor came from, NOT the Android Play referrer param
  const { country, city } = getRequestGeo(request);
  const clickedAt = new Date();

  const expireAt = new Date(clickedAt);
  expireAt.setDate(expireAt.getDate() + CLICK_RECORD_TTL_DAYS);

  const batch = linkRef.firestore.batch();

  batch.set(linkRef.collection('clicks').doc(), {
    linkId: linkRef.id,
    clickId,
    timestamp: FieldValue.serverTimestamp(),
    userAgent: userAgent ? userAgent.slice(0, 300) : null,
    ipHash: hashIp(ip),
    platform: device, // kept for back-compat with the Stage-1 field name
    device,
    country,
    city,
    referrer: referrer ? referrer.slice(0, 500) : null,
    androidReferrerSent: androidReferrerSent ?? null,
    // Requires a Firestore TTL policy on `clicks.expireAt` (collection
    // group) enabled in the Firebase console/CLI — this field alone does
    // not auto-delete anything; see docs/architecture/marketing-attribution.md.
    expireAt: Timestamp.fromDate(expireAt),
  });

  const { docId, data } = buildDailyStatsIncrement({ clickedAt, device, country, city });
  batch.set(linkRef.collection('daily_stats').doc(docId), data, { merge: true });

  await batch.commit();
}

export async function handleLinkClick(
  request: NextRequest,
  id: string,
): Promise<NextResponse> {
  if (!id) {
    return NextResponse.json(
      { error: 'id is required' },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const userAgent = request.headers.get('user-agent');
  const isBotRequest = isbot(userAgent);
  const device = detectDeviceBucket(userAgent);
  const clickId = randomUUID();

  let row: MarketingLinkRow | undefined;
  let ref: DocumentReference | undefined;
  try {
    const db = getAdminDb();
    ref = db.collection(COLLECTION).doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json(
        { error: 'link not found', id },
        { status: 404, headers: NO_STORE_HEADERS },
      );
    }
    row = snap.data() as MarketingLinkRow;

    if (row?.isActive === false) {
      // Real (non-bot) traffic still bumps the counter so admins see the
      // (silent) volume — but the redirect below is rejected with a
      // 410-style payload so downstream funnels don't pollute active
      // campaign metrics.
      if (!isBotRequest) {
        await ref.update({
          clicksCount: FieldValue.increment(1),
          lastClickAt: FieldValue.serverTimestamp(),
          inactiveClicksCount: FieldValue.increment(1),
        });
        try {
          await recordClickEvent({ linkRef: ref, request, clickId, device });
        } catch (clickErr) {
          console.error('[link-click-handler] click-record write failed:', clickErr);
        }
      }
      return NextResponse.json(
        { error: 'link disabled', id },
        { status: 410, headers: NO_STORE_HEADERS },
      );
    }

    if (!isBotRequest) {
      await ref.update({
        clicksCount: FieldValue.increment(1),
        lastClickAt: FieldValue.serverTimestamp(),
      });
    }
  } catch (err) {
    console.error('[link-click-handler] increment failed:', err);
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

  let target: string;
  let androidReferrerSent: string | undefined;

  if (row?.useSmartLink) {
    // ── Smart Link: device-based routing, no onelink.to hop ────────────
    const resolved = resolveDestinationUrl(
      device,
      {
        iosUrl: row.iosUrl ?? null,
        androidUrl: row.androidUrl ?? null,
        desktopUrl: row.desktopUrl ?? null,
        fallbackUrl: row.fallbackUrl ?? null,
      },
      DEFAULT_LINK_DESTINATIONS,
    );
    target = resolved ?? '';

    if (target && device === 'android') {
      const referrerRaw = buildAndroidReferrerRaw({ linkId: id, clickId });
      target = appendAndroidReferrer(target, referrerRaw);
      androidReferrerSent = referrerRaw;
    }
  } else {
    // ── Legacy: redirect through oneLinkUrl+utm (today's onelink.to flow) ─
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
    target = baseTrackingUrl;
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
  }

  // Write the click record AFTER target resolution so it can carry the
  // Android referrer string actually sent — still best-effort, still
  // never blocks the redirect below.
  if (!isBotRequest && ref) {
    try {
      await recordClickEvent({ linkRef: ref, request, clickId, device, androidReferrerSent });
    } catch (clickErr) {
      console.error('[link-click-handler] click-record write failed:', clickErr);
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
