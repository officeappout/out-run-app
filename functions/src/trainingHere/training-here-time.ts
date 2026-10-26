/**
 * Pure helpers for the "I'm training here later" pushes (owner, 26.10.2026). No Firestore, no clock
 * reads: everything takes `nowMs`, so timing, dedupe and audience rules are unit-testable.
 *
 * Source doc: planned_sessions/{sessionId}, written by the "I'm training here" sheet and the compose
 * flows: userId, displayName, parkId|routeId (+ parkName|routeName), startTime (Timestamp),
 * status ('planned' | 'active' | 'completed' | 'cancelled'), privacyMode ('verified_global' = public,
 * 'squad' = partners, 'ghost'), optional workoutTitle, createdAt (server timestamp).
 */

const MIN_MS = 60_000;

/** app_config/feature_flags key. Default off, fails closed. */
export const TRAINING_HERE_FLAG = 'enableTrainingHereReminders';
/** Marker collection (create() before send = at most once). */
export const TRAINING_HERE_MARKERS = 'training_here_push_fired';

/** The owner reminder goes out this many minutes before the start (same as the sheet's REMINDER_LEAD_MIN). */
export const TH_REMINDER_LEAD_MIN = 15;
/** A tick that missed the mark still reminds until this many minutes before the start. */
export const TH_REMINDER_LATEST_MIN = 5;
/**
 * A share counts as "later" when its start is at least this far after it was created. Below that the
 * user is basically on the way: no partner notice, and no reminder that would land seconds after saving.
 */
export const TH_LATER_MIN_GAP_MIN = 20;
/** Partner notices only for sessions starting within this horizon (the sheet offers today / tonight). */
export const TH_PARTNER_HORIZON_H = 24;

export interface PlannedSessionLike {
  userId?: unknown;
  displayName?: unknown;
  parkId?: unknown;
  parkName?: unknown;
  routeId?: unknown;
  routeName?: unknown;
  startTime?: unknown;
  createdAt?: unknown;
  status?: unknown;
  privacyMode?: unknown;
  workoutTitle?: unknown;
  activityType?: unknown;
}

/** Timestamp | Date | epoch ms | {seconds} → epoch ms, or null. */
export function toMs(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? v.getTime() : null;
  if (typeof v === 'object') {
    const o = v as { toMillis?: () => number; toDate?: () => Date; seconds?: unknown; _seconds?: unknown };
    if (typeof o.toMillis === 'function') return o.toMillis();
    if (typeof o.toDate === 'function') return o.toDate().getTime();
    const s = typeof o.seconds === 'number' ? o.seconds : typeof o._seconds === 'number' ? o._seconds : null;
    if (s != null) return s * 1000;
  }
  return null;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/** 'park' | 'route' | null — the copy condition and the deep link both depend on it. */
export function placeKind(s: PlannedSessionLike): 'park' | 'route' | null {
  if (str(s.parkId)) return 'park';
  if (str(s.routeId)) return 'route';
  return null;
}

export function placeName(s: PlannedSessionLike): string {
  return str(s.parkName) || str(s.routeName);
}

export function workoutTitle(s: PlannedSessionLike): string | undefined {
  return str(s.workoutTitle) || undefined;
}

/** Was this created "for later" (start at least TH_LATER_MIN_GAP_MIN after creation)? Unknown createdAt → false. */
export function isLaterShare(s: PlannedSessionLike, createdMsFallback?: number | null): boolean {
  const start = toMs(s.startTime);
  const created = toMs(s.createdAt) ?? createdMsFallback ?? null;
  if (start == null || created == null) return false;
  return start - created >= TH_LATER_MIN_GAP_MIN * MIN_MS;
}

/**
 * Should the owner be reminded on this tick? Checked against the doc AS IT IS NOW (cancel / edit
 * safe): still 'planned', a known owner, a later share, and inside the 5-15 minute window.
 */
export function ownerReminderDue(s: PlannedSessionLike, nowMs: number): boolean {
  if (s.status !== 'planned') return false;
  if (!str(s.userId)) return false;
  const start = toMs(s.startTime);
  if (start == null) return false;
  const minsUntil = (start - nowMs) / MIN_MS;
  if (minsUntil <= TH_REMINDER_LATEST_MIN || minsUntil > TH_REMINDER_LEAD_MIN) return false;
  return isLaterShare(s);
}

/** The startTime range one scheduler tick reads: (now + LATEST, now + LEAD]. */
export function reminderScanRange(nowMs: number): { fromMs: number; toMs: number } {
  return { fromMs: nowMs + TH_REMINDER_LATEST_MIN * MIN_MS, toMs: nowMs + TH_REMINDER_LEAD_MIN * MIN_MS };
}

/** Partners hear about it only when the share is visible to them: 'squad' (partners) or 'verified_global' (public). */
export function audienceReachesPartners(privacyMode: unknown): boolean {
  return privacyMode === 'squad' || privacyMode === 'verified_global';
}

/** Should a freshly created session notify partners at all? */
export function partnerNoticeEligible(s: PlannedSessionLike, nowMs: number): boolean {
  if (s.status !== undefined && s.status !== 'planned') return false;
  if (!str(s.userId)) return false;
  if (!audienceReachesPartners(s.privacyMode)) return false;
  const start = toMs(s.startTime);
  if (start == null || start <= nowMs) return false;
  if (start - nowMs > TH_PARTNER_HORIZON_H * 3_600_000) return false;
  return isLaterShare(s, nowMs);
}

function stringList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 0) : [];
}

/** connections/{uid} → mutual partners (follows AND is followed), never the owner. */
export function mutualPartners(conn: { followers?: unknown; following?: unknown } | undefined, ownerUid: string): string[] {
  if (!conn) return [];
  const following = new Set(stringList(conn.following));
  return Array.from(new Set(stringList(conn.followers))).filter((u) => following.has(u) && u !== ownerUid);
}

/** Owner reminder marker: one per session per start time, so an edited time gets its own reminder. */
export function ownerReminderMarkerId(sessionId: string, startMs: number): string {
  return `reminder__${sessionId}__${startMs}`;
}

/** Partner notice marker: at most one per partner per session (an edit never re-notifies). */
export function partnerNoticeMarkerId(sessionId: string, partnerUid: string): string {
  return `partner__${sessionId}__${partnerUid}`;
}
