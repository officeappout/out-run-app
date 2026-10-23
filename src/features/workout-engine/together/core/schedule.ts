import { TOGETHER_CONFIG } from './config';

/** "YYYY-MM-DD_HH-mm" → local start instant (ms), or null when malformed. */
export function sessionStartMs(attendanceId: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})$/.exec(attendanceId);
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const dt = new Date(y, mo - 1, d, h, mi, 0, 0);
  return Number.isNaN(dt.getTime()) ? null : dt.getTime();
}

export function lobbyOpensAtMs(startMs: number): number {
  return startMs - TOGETHER_CONFIG.lobbyOpensMinBefore * 60_000;
}

export function reminderAtMs(startMs: number): number {
  return startMs - TOGETHER_CONFIG.reminderMinBefore * 60_000;
}

/** Joined too early to be in a lobby: show "registered · we'll remind you" instead. */
export function isJoinedForLater(startMs: number | null, nowMs: number): boolean {
  return startMs != null && nowMs < lobbyOpensAtMs(startMs);
}

const pad = (n: number) => String(n).padStart(2, '0');
const icsUtc = (ms: number) => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
};
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** One-event iCalendar file with a reminder `reminderMinBefore` minutes ahead. */
export function buildSessionIcs(input: {
  uid: string;
  title: string;
  startMs: number;
  durationMin?: number;
  description?: string;
  url?: string;
  nowMs?: number;
  reminderLabel?: string;
}): string {
  const end = input.startMs + (input.durationMin ?? 60) * 60_000;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//OUT//Together//HE',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${input.uid}@out-together`,
    `DTSTAMP:${icsUtc(input.nowMs ?? Date.now())}`,
    `DTSTART:${icsUtc(input.startMs)}`,
    `DTEND:${icsUtc(end)}`,
    `SUMMARY:${esc(input.title)}`,
    ...(input.description ? [`DESCRIPTION:${esc(input.description)}`] : []),
    ...(input.url ? [`URL:${input.url}`] : []),
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${esc(input.reminderLabel ?? input.title)}`,
    `TRIGGER:-PT${TOGETHER_CONFIG.reminderMinBefore}M`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.join('\r\n') + '\r\n';
}

/** Google Calendar "add event" link — the no-download fallback. */
export function googleCalendarUrl(input: { title: string; startMs: number; durationMin?: number; details?: string }): string {
  const end = input.startMs + (input.durationMin ?? 60) * 60_000;
  const qs = new URLSearchParams({
    action: 'TEMPLATE',
    text: input.title,
    dates: `${icsUtc(input.startMs)}/${icsUtc(end)}`,
    ...(input.details ? { details: input.details } : {}),
  });
  return `https://calendar.google.com/calendar/render?${qs}`;
}

/** "YYYY-MM-DD_HH-mm" → { date: "YYYY-MM-DD", time: "HH:mm" } (empty strings when malformed). */
export function sessionDateTimeOf(attendanceId: string): { date: string; time: string } {
  const [date, timePart] = attendanceId.split('_');
  return { date: date ?? '', time: (timePart ?? '').replace('-', ':') };
}
