/**
 * GET /api/calendar/[userId]  — LEGACY, phase 1 (notice only)
 *
 * This route used to serve a user's 90-day schedule to anyone who knew the uid
 * (no auth; uids leak via public surfaces — SEC-04/05, minors included). It now
 * reads NOTHING: it ignores `userId`, performs zero Firestore I/O (no
 * rate-limit lookup either, since that is a Firestore read), and returns a
 * one-event ICS telling existing subscribers to re-subscribe from the app,
 * which uses the token feed at /api/calendar/t/[token].
 *
 * Phase 2 (later): replace the body below with a 410 Gone.
 */

import 'server-only';
import { NextResponse } from 'next/server';
import { buildLegacyNoticeICS } from '@/lib/calendar-feed-ics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return new NextResponse(buildLegacyNoticeICS(new Date()), {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="outrun-schedule.ics"',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
    },
  });
}
