import type { SessionRef } from './types';

/** `community_groups/{g}/attendance/{a}/member_statuses` — the existing per-session collection. */
export function presenceCollectionPath(ref: SessionRef): string {
  return `community_groups/${ref.groupId}/attendance/${ref.attendanceId}/member_statuses`;
}

/** Firestore rejects `undefined`; drop it (and NaN / Infinity) before writing. */
export function stripUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    if (typeof v === 'number' && !Number.isFinite(v)) continue;
    out[k] = v;
  }
  return out as Partial<T>;
}
