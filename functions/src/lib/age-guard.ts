/**
 * Age guard for pushes that put a user in touch with strangers
 * (push-lifecycle audit, gap 12; owner-approved 21.10.2026).
 *
 * onPlannedActivityCreated's radius axis ("someone 3 km from you is going
 * for a run at …") must never reach a minor, and a minor's own public
 * session must never be announced to strangers. HARD guard, fails CLOSED:
 * only a user positively known to be an adult passes —
 *   users/{uid}.core.ageGroup === 'adult' (the same field userPublicSync
 *   mirrors for the minor-DM gate, where an unresolved age is also 'minor'),
 *   AND core.birthDate, when present, does not put them under 18.
 * Unknown age → treated as a minor.
 */
import { ageBandFromBirthDate } from '../shared/push-library.core';

function toMillis(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (v instanceof Date) return v.getTime();
  if (v && typeof (v as { toMillis?: unknown }).toMillis === 'function') return (v as { toMillis: () => number }).toMillis();
  if (typeof v === 'string') {
    const ms = Date.parse(v);
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

export function isConfirmedAdult(userData: Record<string, unknown> | undefined, now: Date = new Date()): boolean {
  const core = userData?.core as { ageGroup?: unknown; birthDate?: unknown } | undefined;
  if (core?.ageGroup !== 'adult') return false;
  const band = ageBandFromBirthDate(toMillis(core.birthDate), now);
  return band !== 'under_18';
}
