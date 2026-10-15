/**
 * POST /api/telemetry/web — anonymous traffic events from the marketing
 * site (outrun.co.il/web, served here through the multi-zone rewrite, so
 * the site posts same-origin with `navigator.sendBeacon`).
 *
 * Unauthenticated by design (visitors aren't users). Gates, in order:
 * IP rate limit (the IP is only a rate-limit key, never stored), bots
 * (isbot — link previews and crawlers are never counted), then a strict
 * closed-list validation (src/features/web-traffic/web-events.ts). Writes
 * one increment into the day's rollup `web_daily_stats/{YYYY-MM-DD}`.
 * Fire-and-forget on the site: always answers fast, never with details.
 */
import { NextRequest, NextResponse } from 'next/server';
import { isbot } from 'isbot';
import { getAdminDb } from '@/lib/firebase-admin';
import { getRequestIp } from '@/lib/requestIp';
import { RATE_LIMITS, isBlockedByAny } from '@/lib/rateLimitConfig';
import { logRateLimitBlock } from '@/lib/rateLimitLog';
import { detectDeviceBucket } from '@/features/admin/services/link-routing';
import { normalizeWebEvent, type RawWebEvent } from '@/features/web-traffic/web-events';
import { buildWebDailyIncrement } from '@/features/web-traffic/web-stats-write';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_CONTENT = () => new NextResponse(null, { status: 204 });

export async function POST(request: NextRequest) {
  try {
    const userAgent = request.headers.get('user-agent');
    if (isbot(userAgent)) return NO_CONTENT();

    const ip = getRequestIp(request);
    const db = getAdminDb();
    const ipCheck = await isBlockedByAny(db, [
      { key: `web-telemetry:ip:${ip}`, window: RATE_LIMITS.webTelemetry.ip() },
    ]);
    if (ipCheck.blocked) {
      logRateLimitBlock({ route: 'web-telemetry', dimension: 'ip', ip });
      return NextResponse.json({ ok: false }, { status: 429 });
    }

    // sendBeacon posts text/plain; parse the body ourselves
    let raw: RawWebEvent | null = null;
    try {
      raw = JSON.parse(await request.text());
    } catch {
      return NextResponse.json({ ok: false }, { status: 400 });
    }
    const event = normalizeWebEvent(raw);
    if (!event) return NextResponse.json({ ok: false }, { status: 400 });

    const rawCountry = request.headers.get('x-vercel-ip-country');
    const { docId, data } = buildWebDailyIncrement(event, {
      at: new Date(),
      device: detectDeviceBucket(userAgent),
      country: rawCountry ? decodeURIComponent(rawCountry) : null,
    });
    await db.collection('web_daily_stats').doc(docId).set(data, { merge: true });
    return NO_CONTENT();
  } catch (err) {
    console.error('[/api/telemetry/web] error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
