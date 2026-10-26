/**
 * Pure helpers for retrying "I'm training here" pushes that sendPush held back for quiet hours or
 * Shabbat (review of #827). No Firestore, no clock reads: everything takes `nowMs`.
 *
 * Flow: the marker in training_here_push_fired is still create()d before the send (at most once).
 * When sendPush reports the push was dropped by quiet hours / Shabbat, the marker gets
 * `deferredUntil`; the scheduler tick re-checks it once that time passes and either sends (the push
 * is still relevant), pushes `deferredUntil` forward (still quiet), or drops it (no longer relevant).
 * Every deferred push expires with its session start (at most TH_PARTNER_HORIZON_H ahead), and each
 * tick reads at most TH_DEFER_BATCH markers.
 */
import { audienceReachesPartners, toMs, type PlannedSessionLike } from './training-here-time';

const MIN_MS = 60_000;

export type TrainingHereMarkerKind = 'reminder' | 'partner';

/**
 * A deferred push is re-tried no more often than this. The owner reminder is due 5-15 minutes before
 * the start, so it re-tries every tick (5 min); a partner notice can wait out a whole night, so less often.
 */
export const TH_DEFER_RETRY_MIN: Record<TrainingHereMarkerKind, number> = { reminder: 5, partner: 15 };
/** Deferred markers read per scheduler tick. */
export const TH_DEFER_BATCH = 50;

/** Stored on the marker when it is claimed, so a deferred retry needs nothing else. */
export interface TrainingHereMarkerMeta {
  kind: TrainingHereMarkerKind;
  sessionId: string;
  /** The push recipient: the owner (reminder) or the partner (notice). */
  uid: string;
  /** The session start the push was for (an edited start time never inherits a deferred push). */
  startMs: number;
}

export type DeferReason = 'quiet_hours' | 'shabbat';

/** Did sendPush drop this (single-recipient) push only because of quiet hours / Shabbat? */
export function suppressedByWindow(
  r: { delivered?: number; skippedQuietHours?: number; skippedShabbat?: number } | null | undefined,
): DeferReason | null {
  if (!r || (r.delivered ?? 0) > 0) return null;
  if ((r.skippedQuietHours ?? 0) > 0) return 'quiet_hours';
  if ((r.skippedShabbat ?? 0) > 0) return 'shabbat';
  return null;
}

export function nextRetryMs(kind: TrainingHereMarkerKind, nowMs: number): number {
  return nowMs + TH_DEFER_RETRY_MIN[kind] * MIN_MS;
}

export function parseMarkerMeta(data: Record<string, unknown> | undefined): TrainingHereMarkerMeta | null {
  if (!data) return null;
  const { kind, sessionId, uid, startMs } = data;
  if (kind !== 'reminder' && kind !== 'partner') return null;
  if (typeof sessionId !== 'string' || !sessionId || typeof uid !== 'string' || !uid) return null;
  if (typeof startMs !== 'number' || !Number.isFinite(startMs)) return null;
  return { kind, sessionId, uid, startMs };
}

export type DeferredVerdict = { action: 'send' } | { action: 'drop'; reason: string };

/**
 * Is a deferred push still worth sending, against the session AS IT IS NOW?
 *   - owner reminder: still planned, same owner, same start time, and not started yet.
 *   - partner notice: still planned, still in the future, still shared with partners / public, and
 *     the recipient is still a mutual partner (`stillPartner`, ignored for reminders).
 */
export function deferredVerdict(
  m: TrainingHereMarkerMeta,
  s: PlannedSessionLike | undefined,
  nowMs: number,
  stillPartner: boolean,
): DeferredVerdict {
  if (!s) return { action: 'drop', reason: 'session_gone' };
  if (s.status !== 'planned') return { action: 'drop', reason: 'not_planned' };
  const start = toMs(s.startTime);
  if (start == null || start <= nowMs) return { action: 'drop', reason: 'started' };
  if (m.kind === 'reminder') {
    if (String(s.userId ?? '') !== m.uid) return { action: 'drop', reason: 'owner_changed' };
    if (start !== m.startMs) return { action: 'drop', reason: 'time_changed' };
    return { action: 'send' };
  }
  if (!audienceReachesPartners(s.privacyMode)) return { action: 'drop', reason: 'audience' };
  if (!stillPartner) return { action: 'drop', reason: 'not_partner' };
  return { action: 'send' };
}
