import { taskDueDate, taskStartDate } from './wedding.calc';
import { taskOrder } from './wedding.links';
import type { WeddingState } from './wedding.types';

/**
 * The planner's tasks as an iCalendar feed (RFC 5545), for subscribing from
 * Google Calendar ("From URL") as a separate calendar. One all-day event per
 * task spanning its start→due range, plus the wedding day. Read-only: edits
 * happen in the planner and reach Google on its next refresh.
 */

const PAGE = 'https://outrun.co.il/public/wedding';

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
const nextDay = (d: Date) => {
  const x = new Date(d);
  x.setDate(x.getDate() + 1);
  return x;
};
const stamp = (d: Date) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;

export function icsEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Folds a content line at 75 octets without splitting a UTF-8 character (Hebrew is 2 bytes a letter). */
export function foldLine(line: string): string {
  const enc = new TextEncoder();
  const out: string[] = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    const limit = out.length ? 74 : 75; // continuation lines start with a space
    if (bytes + b > limit) {
      out.push(cur);
      cur = '';
      bytes = 0;
    }
    cur += ch;
    bytes += b;
  }
  out.push(cur);
  return out.join('\r\n ');
}

export function buildIcs(s: WeddingState, now = new Date()): string {
  const order = taskOrder(s.tasks);
  const vendors = new Map(s.vendors.map((v) => [v.id, v]));
  const wedding = new Date(`${s.settings.date}T00:00:00`);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//outrun.co.il//wedding planner//HE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsEscape('תכנון החתונה')}`,
    'X-WR-TIMEZONE:Asia/Jerusalem',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
    'BEGIN:VEVENT',
    'UID:wedding-day@outrun.co.il',
    `DTSTAMP:${stamp(now)}`,
    `DTSTART;VALUE=DATE:${ymd(wedding)}`,
    `DTEND;VALUE=DATE:${ymd(nextDay(wedding))}`,
    `SUMMARY:${icsEscape('💍 יום החתונה')}`,
    `URL:${PAGE}`,
    'TRANSP:TRANSPARENT',
    'END:VEVENT',
  ];
  for (const t of s.tasks) {
    const start = taskStartDate(s.settings.date, t);
    const due = taskDueDate(s.settings.date, t.daysBefore);
    const v = t.vendorId ? vendors.get(t.vendorId) : undefined;
    const n = order.get(t.id);
    const desc = [
      t.owners.length ? `מי: ${t.owners.join(', ')}` : 'מי: עוד לא שויך',
      v ? `ספק: ${v.name}${v.supplier ? ` (${v.supplier})` : ''} · ${v.status}` : '',
      start.getTime() !== due.getTime() ? `עד ${due.getDate()}.${due.getMonth() + 1}` : '',
      t.notes ? `הערות: ${t.notes}` : '',
      `לעריכה: ${PAGE}`,
    ].filter(Boolean);
    lines.push(
      'BEGIN:VEVENT',
      `UID:task-${t.id}@outrun.co.il`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART;VALUE=DATE:${ymd(start)}`,
      `DTEND;VALUE=DATE:${ymd(nextDay(due))}`,
      `SUMMARY:${icsEscape(`${t.done ? '✓ ' : ''}#${n ?? ''} ${t.name}${t.owners.length ? ` · ${t.owners.join(', ')}` : ''}`)}`,
      `DESCRIPTION:${icsEscape(desc.join('\n'))}`,
      `URL:${PAGE}`,
      'STATUS:CONFIRMED',
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}
