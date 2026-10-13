/**
 * Shared iCal builders for the personal-schedule calendar feed.
 * Moved verbatim from the legacy /api/calendar/[userId] route (event UIDs
 * still use the first 8 chars of the uid, so existing subscribers don't see
 * duplicate events). Pure — no Firestore, no Next.
 */

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function toISODate(d: Date): string {
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

export interface ScheduleEntry {
  entryId?:             string;
  date?:                string;      // 'YYYY-MM-DD'
  type?:                string;      // 'training' | 'rest' | 'assessment'
  source?:              string;      // 'personal' | 'community' | ...
  groupName?:           string;
  scheduledCategories?: string[];
  startTime?:           string;      // 'HH:MM' (24h)
  completed?:           boolean;
}

export function buildICS(userId: string, entries: ScheduleEntry[], now: Date): string {
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

/**
 * Notice-only feed served by the legacy uid-in-URL route: one all-day event
 * telling the subscriber to re-subscribe from the app. Contains no user data.
 */
export function buildLegacyNoticeICS(now: Date): string {
  const next = new Date(now);
  next.setDate(next.getDate() + 1);
  const ymd = (d: Date) => `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//OutRun//Personal Schedule//HE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:OutRun — לוז האימונים שלי',
    'X-WR-TIMEZONE:Asia/Jerusalem',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
    'BEGIN:VEVENT',
    'UID:outrun-link-updated@outrun.app',
    `DTSTAMP:${utcStamp(now)}`,
    `DTSTART;VALUE=DATE:${ymd(now)}`,
    `DTEND;VALUE=DATE:${ymd(next)}`,
    'SUMMARY:הקישור התעדכן — הירשם מחדש מהאפליקציה',
    'DESCRIPTION:מטעמי אבטחה קישור לוח השנה הוחלף. פתח את האפליקציה והירשם מחדש ללוח השנה.',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}
