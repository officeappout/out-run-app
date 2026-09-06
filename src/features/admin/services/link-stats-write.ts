/**
 * Link Stats — write side (Admin SDK only, server-only — imported ONLY by
 * `link-click-handler.ts`). Kept in a separate file from `link-stats.ts`
 * (the read side, client SDK, imported by the admin analytics page) so
 * neither the admin bundle ships `firebase-admin` nor the click handler
 * needs the client SDK.
 *
 * See `link-stats.ts`'s doc comment for why a permanent daily rollup
 * exists alongside the 30-day-TTL'd click records.
 */

import { FieldValue } from 'firebase-admin/firestore';
import { getIsraelDateKey, getIsraelDayOfWeek, getIsraelHour } from '@/lib/israelTime';

export const DAILY_STATS_SUBCOLLECTION = 'daily_stats' as const;

/**
 * Builds the `set(..., {merge:true})` payload for one click event. Callers
 * pass real nested objects (not dotted-string keys) — Firestore's
 * merge-write recursively merges nested maps field-by-field, and
 * `FieldValue.increment` inside them is applied atomically per leaf
 * against whatever's already there (0 if absent). One write, whether the
 * day's doc already exists or this is its first click.
 */
export function buildDailyStatsIncrement(params: {
  clickedAt: Date;
  device: 'ios' | 'android' | 'desktop';
  country: string | null;
  city: string | null;
}): { docId: string; data: Record<string, unknown> } {
  const dateKey = getIsraelDateKey(params.clickedAt);
  const hour = getIsraelHour(params.clickedAt);
  const dayOfWeek = getIsraelDayOfWeek(params.clickedAt);

  const data: Record<string, unknown> = {
    date: dateKey,
    total: FieldValue.increment(1),
    byDevice: { [params.device]: FieldValue.increment(1) },
    byHour: { [String(hour)]: FieldValue.increment(1) },
    byDayOfWeek: { [String(dayOfWeek)]: FieldValue.increment(1) },
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (params.country) data.byCountry = { [params.country]: FieldValue.increment(1) };
  if (params.city) data.byCity = { [params.city]: FieldValue.increment(1) };

  return { docId: dateKey, data };
}
