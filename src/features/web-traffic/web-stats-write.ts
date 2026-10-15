/**
 * Web traffic — write side (Admin SDK, server-only; imported only by
 * /api/telemetry/web). One `set(..., {merge:true})` per event into the day's
 * rollup `web_daily_stats/{YYYY-MM-DD}` (Israel time), with
 * `FieldValue.increment` on nested map leaves — the same pattern as the
 * marketing links' `daily_stats` (see link-stats-write.ts). No raw events
 * are stored: the rollup is all the admin screen needs.
 */
import { FieldValue } from 'firebase-admin/firestore';
import { getIsraelDateKey, getIsraelHour } from '@/lib/israelTime';
import { toKey, type WebEvent } from './web-events';

export function buildWebDailyIncrement(
  event: WebEvent,
  ctx: { at: Date; device: 'ios' | 'android' | 'desktop'; country: string | null },
): { docId: string; data: Record<string, unknown> } {
  const dateKey = getIsraelDateKey(ctx.at);
  const inc = FieldValue.increment(1);
  const data: Record<string, unknown> = { date: dateKey, updatedAt: FieldValue.serverTimestamp() };

  if (event.type === 'pv') {
    data.pageviews = inc;
    data.byPath = { [event.pathKey]: inc };
    data.byHour = { [String(getIsraelHour(ctx.at))]: inc };
    if (event.newSession) {
      // per-session dimensions: counted once, on the session's first view
      data.sessions = inc;
      data.bySource = { [event.source]: inc };
      if (event.medium) data.byMedium = { [event.medium]: inc };
      if (event.campaign) data.byCampaign = { [event.campaign]: inc };
      data.byLanding = { [event.pathKey]: inc };
      data.byDevice = { [ctx.device]: inc };
      data.byLocale = { [event.locale]: inc };
      if (ctx.country) data.byCountry = { [toKey(ctx.country)]: inc };
    }
  } else if (event.type === 'cta') {
    data.ctaTotal = inc;
    data.ctaByTarget = { [event.target]: inc };
    data.ctaByPath = { [event.pathKey]: inc };
  } else {
    data.scrollByDepth = { [String(event.depth)]: inc };
  }
  return { docId: dateKey, data };
}
