/**
 * GET /api/calendar/[userId]
 *
 * Live iCal subscription feed for a user's personal OutRun schedule.
 *
 * Designed for `webcal://` deep-linking from the app:
 *   - iOS: Safari opens Apple Calendar → "Subscribe" prompt
 *   - Android: Opens Google Calendar / any calendar app
 *   - Desktop: Opens Outlook, macOS Calendar, etc.
 *
 * The feed covers a rolling 7-day window starting today so calendar apps
 * always show upcoming sessions without stale recurring events.
 *
 * Security: The userId is the opaque Firebase UID (28-char base62 string).
 * For a public calendar subscription the URL itself is the credential,
 * consistent with Apple Calendar, Google Calendar, and Notion's approach.
 */

import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';

export const runtime = 'nodejs';
export const dynamic  = 'force-dynamic';

// ── Helpers ────────────────────────────────────────────────────────────────

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Format a Date as a UTC DTSTAMP string: 20260528T143000Z */
function utcStamp(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}` +
    `T${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}00Z`
  );
}

/** Format a local datetime as an iCal floating-time string: 20260528T063000 */
function localDtString(year: number, month: number, day: number, hh: number, mm: number): string {
  return `${year}${pad2(month)}${pad2(day)}T${pad2(hh)}${pad2(mm)}00`;
}

const CATEGORY_LABEL: Record<string, string> = {
  push:          'אימון דחיפה',
  pull:          'אימון משיכה',
  legs:          'אימון רגליים',
  core:          'אימון ליבה',
  strength:      'אימון כוח',
  running:       'ריצה',
  cardio:        'אימון קרדיו',
  maintenance:   'שמירה',
  walking:       'הליכה',
  training:      'אימון',
  rest:          'מנוחה פעילה',
  easy_run:      'ריצה קלה',
  tempo_run:     'ריצת טמפו',
  long_run:      'ריצה ארוכה',
  interval_run:  'ריצת אינטרוולים',
};

interface ScheduleEntry {
  entryId?:             string;
  date?:                string;      // 'YYYY-MM-DD'
  type?:                string;      // 'training' | 'rest' | 'assessment'
  source?:              string;      // 'personal' | 'community' | ...
  groupName?:           string;
  scheduledCategories?: string[];
  startTime?:           string;      // 'HH:MM' (24h)
  completed?:           boolean;
}

function buildICS(userId: string, entries: ScheduleEntry[], now: Date): string {
  const stamp = utcStamp(now);

  const header = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//OutRun//Personal Schedule//HE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:OutRun — לוז האימונים שלי',
    'X-WR-TIMEZONE:Asia/Jerusalem',
    // Ask calendar clients to re-poll every hour
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ];

  const events: string[] = [];

  for (const entry of entries) {
    // Skip rest days and entries without a date
    if (!entry.date || entry.type === 'rest') continue;

    const [yearStr, monthStr, dayStr] = entry.date.split('-');
    const year  = Number(yearStr);
    const month = Number(monthStr);
    const day   = Number(dayStr);

    const [hh, mm] = (entry.startTime ?? '07:00').split(':').map(Number);

    const dtStart = localDtString(year, month, day, hh, mm);

    // 60-minute session default
    const endDate = new Date(year, month - 1, day, hh, mm + 60, 0);
    const dtEnd   = localDtString(
      endDate.getFullYear(),
      endDate.getMonth() + 1,
      endDate.getDate(),
      endDate.getHours(),
      endDate.getMinutes(),
    );

    const category = entry.scheduledCategories?.[0] ?? entry.type ?? 'training';
    const summary  =
      entry.source === 'community' && entry.groupName
        ? entry.groupName
        : (CATEGORY_LABEL[category] ?? 'אימון');

    const description =
      entry.source === 'community'
        ? `מפגש קהילתי — ${CATEGORY_LABEL[category] ?? category}`
        : (CATEGORY_LABEL[category] ?? 'אימון אישי');

    // Stable UID so calendar apps de-duplicate on refresh
    const uid = `outrun-${userId.slice(0, 8)}-${entry.date}-${entry.entryId ?? entry.source ?? 'e'}@outrun.app`;

    events.push(
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;TZID=Asia/Jerusalem:${dtStart}`,
      `DTEND;TZID=Asia/Jerusalem:${dtEnd}`,
      `SUMMARY:${summary}`,
      `DESCRIPTION:${description}`,
      'END:VEVENT',
    );
  }

  return [...header, ...events, 'END:VCALENDAR'].join('\r\n');
}

// ── Route Handler ──────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: { userId: string } },
) {
  const { userId } = params;

  if (!userId || typeof userId !== 'string' || userId.length < 6) {
    return new NextResponse('Bad request', { status: 400 });
  }

  try {
    const db = getAdminDb();

    // Build a rolling 7-day window starting today
    const now   = new Date();
    const dates = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now);
      d.setDate(now.getDate() + i);
      return toISODate(d);
    });

    // Fetch all 7 schedule day-documents in parallel
    // Collection: userSchedule / Document ID: {userId}_{YYYY-MM-DD}
    const refs  = dates.map((d) => db.collection('userSchedule').doc(`${userId}_${d}`));
    const snaps = await Promise.all(refs.map((r) => r.get()));

    const allEntries: ScheduleEntry[] = snaps
      .filter((s) => s.exists)
      .flatMap((s) => {
        const data = s.data()!;
        return Array.isArray(data.entries) ? (data.entries as ScheduleEntry[]) : [];
      });

    const icsBody = buildICS(userId, allEntries, now);

    return new NextResponse(icsBody, {
      status: 200,
      headers: {
        'Content-Type':        'text/calendar; charset=utf-8',
        'Content-Disposition': 'attachment; filename="outrun-schedule.ics"',
        // No caching — always serve a fresh 7-day window on every poll
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma':        'no-cache',
      },
    });
  } catch (err) {
    console.error('[api/calendar] failed for user', userId, err);
    return new NextResponse('Internal server error', { status: 500 });
  }
}
