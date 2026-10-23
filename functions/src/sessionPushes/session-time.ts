/**
 * Pure helpers for the group-session pushes (reminder / cancellation / waitlist promotion).
 * No Firestore, no clock reads: everything takes `nowMs`, so it is testable.
 *
 * Session docs live at community_groups/{groupId}/attendance/{YYYY-MM-DD_HH-mm} with the fields
 * date ('YYYY-MM-DD'), time ('HH:mm', Israel local), attendees[], waitlist[], and (new, written by
 * the organizer's cancel flow) cancelled: true.
 */

const TZ = 'Asia/Jerusalem';
const MIN_MS = 60_000;

/** Minutes ahead of the start the reminder goes out. */
export const SESSION_REMINDER_LEAD_MIN = 15;
/** A tick that missed the exact mark still reminds until this many minutes before the start. */
export const SESSION_REMINDER_LATEST_MIN = 5;

export interface AttendanceLike {
  date?: unknown;
  time?: unknown;
  attendees?: unknown;
  waitlist?: unknown;
  cancelled?: unknown;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function offsetMinutes(ms: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(new Date(ms));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
  return Math.round((asUtc - ms) / MIN_MS);
}

/** 'YYYY-MM-DD' + 'HH:mm' in Israel local time -> epoch ms. null on a malformed value. */
export function sessionStartMs(date: unknown, time: unknown): number | null {
  if (typeof date !== 'string' || typeof time !== 'string' || !DATE_RE.test(date) || !TIME_RE.test(time)) return null;
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  // Two passes settle the DST edge (the offset at the guess vs at the corrected instant).
  const first = guess - offsetMinutes(guess) * MIN_MS;
  return guess - offsetMinutes(first) * MIN_MS;
}

/** 'YYYY-MM-DD' in Israel for an instant. */
export function israelDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-CA', { timeZone: TZ });
}

/** The Israel dates a reminder scan has to read: today, plus tomorrow when the lead window crosses midnight. */
export function reminderScanDates(nowMs: number): string[] {
  const dates = new Set([israelDate(nowMs), israelDate(nowMs + SESSION_REMINDER_LEAD_MIN * MIN_MS)]);
  return Array.from(dates);
}

export function stringList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 0) : [];
}

/** Is this (not cancelled) session inside the reminder window, and who should be reminded? */
export function reminderRecipients(att: AttendanceLike, nowMs: number): string[] {
  if (att.cancelled === true) return [];
  const start = sessionStartMs(att.date, att.time);
  if (start == null) return [];
  const minsUntil = (start - nowMs) / MIN_MS;
  if (minsUntil <= SESSION_REMINDER_LATEST_MIN || minsUntil > SESSION_REMINDER_LEAD_MIN) return [];
  return stringList(att.attendees);
}

/** uids that moved from the waitlist into attendees between two snapshots of the same session. */
export function newlyPromoted(before: AttendanceLike | undefined, after: AttendanceLike | undefined): string[] {
  if (!before || !after || after.cancelled === true) return [];
  const wasWaiting = new Set(stringList(before.waitlist));
  const wasIn = new Set(stringList(before.attendees));
  const nowWaiting = new Set(stringList(after.waitlist));
  return stringList(after.attendees).filter((u) => wasWaiting.has(u) && !wasIn.has(u) && !nowWaiting.has(u));
}

/** Everyone to tell when a session flips to cancelled (attendees first, then the waitlist), else []. */
export function cancellationRecipients(before: AttendanceLike | undefined, after: AttendanceLike | undefined): string[] {
  if (!after || after.cancelled !== true || before?.cancelled === true) return [];
  return Array.from(new Set([...stringList(after.attendees), ...stringList(after.waitlist)]));
}

/** 'HH:mm' as shown in the copy. */
export function displayTime(time: unknown): string {
  return typeof time === 'string' && TIME_RE.test(time) ? time : '';
}

/** Idempotency marker id: one push of one kind per person per session. */
export function sessionPushMarkerId(kind: string, groupId: string, sessionId: string, uid: string): string {
  return `${kind}__${groupId}__${sessionId}__${uid}`;
}
