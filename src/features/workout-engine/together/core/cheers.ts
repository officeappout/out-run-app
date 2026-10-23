import type { PresenceEntry } from './types';

/**
 * Cheers (כיף) are cumulative counters in the SENDER's own presence doc
 * (`cheersSent[recipientUid]`) — a member can only write their own doc, and
 * the existing kudos inbox is private to its recipient, so a per-session
 * count nobody could read back would be useless for the summary.
 */

/** Add one cheer from me to `toUid`. */
export function addCheer(sent: Record<string, number> | undefined, toUid: string): Record<string, number> {
  return { ...(sent ?? {}), [toUid]: (sent?.[toUid] ?? 0) + 1 };
}

/** Cheers received per uid, summed over everyone's `cheersSent`. */
export function cheersReceived(entries: PresenceEntry[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of entries) {
    for (const [to, n] of Object.entries(e.cheersSent ?? {})) {
      if (to === e.uid || !(n > 0)) continue;
      out[to] = (out[to] ?? 0) + n;
    }
  }
  return out;
}

export type TogetherEvent =
  | { type: 'cheer'; id: string; fromUid: string; fromName: string; toUid: string; count: number }
  | { type: 'round'; id: string; uid: string; name: string; round: number }
  | { type: 'done'; id: string; uid: string; name: string };

/**
 * What changed between two snapshots, as one-shot events: someone cheered
 * someone, finished a round (AMRAP) or finished the session. The first
 * snapshot (prev = null) only seeds the state — it never replays history.
 * Events about `meUid` itself are dropped (you do not get a toast for your own round).
 */
export function diffTogetherEvents(prev: PresenceEntry[] | null, next: PresenceEntry[], meUid: string | null | undefined): TogetherEvent[] {
  if (!prev) return [];
  const before = new Map(prev.map((e) => [e.uid, e]));
  const events: TogetherEvent[] = [];
  for (const e of next) {
    const old = before.get(e.uid);
    if (!old) continue;
    for (const [to, n] of Object.entries(e.cheersSent ?? {})) {
      const was = old.cheersSent?.[to] ?? 0;
      if (n > was && to === meUid && e.uid !== meUid) {
        events.push({ type: 'cheer', id: `cheer-${e.uid}-${to}-${n}`, fromUid: e.uid, fromName: e.name, toUid: to, count: n - was });
      }
    }
    if (e.uid === meUid) continue;
    const rNow = e.roundsDone ?? 0;
    const rWas = old.roundsDone ?? 0;
    if (rNow > rWas) events.push({ type: 'round', id: `round-${e.uid}-${rNow}`, uid: e.uid, name: e.name, round: rNow });
    if (e.state === 'done' && old.state !== 'done') events.push({ type: 'done', id: `done-${e.uid}`, uid: e.uid, name: e.name });
  }
  return events;
}
