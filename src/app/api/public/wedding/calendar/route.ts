import 'server-only';
import { NextResponse } from 'next/server';
import { readWedding } from '@/features/wedding/wedding.server';
import { buildIcs } from '@/features/wedding/wedding.ics';

/**
 * /api/public/wedding/calendar — the wedding tasks as an .ics feed, for
 * subscribing from Google Calendar. Open like the planner itself (David's
 * explicit choice, 02.10.2026); read-only.
 */

export const dynamic = 'force-dynamic';

export async function GET() {
  const { state } = await readWedding();
  return new NextResponse(buildIcs(state), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="wedding.ics"',
      'Cache-Control': 'public, max-age=300',
    },
  });
}
