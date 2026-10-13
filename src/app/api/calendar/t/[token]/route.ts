/**
 * GET /api/calendar/t/[token]
 *
 * Live iCal subscription feed (rolling 90 days) addressed by an HMAC feed
 * token minted via POST /api/calendar/token — NOT by a bare uid.
 *
 * Order matters and is load-bearing:
 *   1. verify the token MAC  → invalid/forged/unconfigured = 404, ZERO Firestore I/O
 *   2. rate-limit calendar:token:{uid} (this itself touches Firestore, so it
 *      must only ever run for a verified token)
 *   3. the 90-day schedule read + ICS
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { getRequestIp } from '@/lib/requestIp';
import { RATE_LIMITS, isBlockedByAny } from '@/lib/rateLimitConfig';
import { logRateLimitBlock } from '@/lib/rateLimitLog';
import { verifyFeedToken } from '@/lib/calendar-feed-token';
import { buildICS, toISODate, type ScheduleEntry } from '@/lib/calendar-feed-ics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: { token: string } },
) {
  const uid = verifyFeedToken(params.token);
  if (!uid) {
    return new NextResponse('Not found', { status: 404 });
  }

  try {
    const db = getAdminDb();

    const { blocked, window } = await isBlockedByAny(db, [
      { key: `calendar:token:${uid}`, window: RATE_LIMITS.calendar.token() },
    ]);
    if (blocked) {
      logRateLimitBlock({
        route: 'calendar',
        dimension: 'token',
        ip: getRequestIp(req),
        identifier: uid,
      });
      return new NextResponse('Too many requests', {
        status: 429,
        headers: { 'Retry-After': String(Math.ceil((window?.windowMs ?? 60_000) / 1000)) },
      });
    }

    // Rolling 90-day window; calendar apps re-poll hourly via REFRESH-INTERVAL.
    // Collection: userSchedule / Document ID: {uid}_{YYYY-MM-DD}
    const now = new Date();
    const DAYS = 90;
    const dates = Array.from({ length: DAYS }, (_, i) => {
      const d = new Date(now);
      d.setDate(now.getDate() + i);
      return toISODate(d);
    });

    const refs = dates.map((d) => db.collection('userSchedule').doc(`${uid}_${d}`));
    const snaps = await Promise.all(refs.map((r) => r.get()));

    const allEntries: ScheduleEntry[] = snaps
      .filter((s) => s.exists)
      .flatMap((s) => {
        const data = s.data()!;
        return Array.isArray(data.entries) ? (data.entries as ScheduleEntry[]) : [];
      });

    return new NextResponse(buildICS(uid, allEntries, now), {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'attachment; filename="outrun-schedule.ics"',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
      },
    });
  } catch (err) {
    // Deliberately no uid / token in the log line.
    console.error('[api/calendar/t] feed failed', err);
    return new NextResponse('Internal server error', { status: 500 });
  }
}
