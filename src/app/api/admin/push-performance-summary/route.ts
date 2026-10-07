/**
 * GET /api/admin/push-performance-summary
 *
 * Push-performance instrumentation, Step 2 (07.10.2026) — scope-locked to
 * (a)+(b) only, see the approved plan: no `source_push_id` threading into
 * `analytics_events` yet, no measurement expansion to the remaining 10
 * senders yet. This route answers "of the senders already measured, which
 * TYPE and which COPY VARIANT performs best" — platform-only, same
 * reasoning `push-funnel-summary/route.ts` already applies (push_events
 * docs carry `uid`, never `authorityId`).
 *
 * Row grain is (category, variantId) — ONE row per real copy variant, not
 * per type — per the approved column spec: push type → copy/variant →
 * sent → delivered % → opened % → acted % → avg time-to-action.
 *
 * Percentages are a cascading funnel (each stage as % of the PREVIOUS
 * stage, matching push-funnel-summary's existing "נשלח → נמסר → נפתח"
 * framing): delivered% = delivered/sent, opened% = opened/delivered,
 * acted% = acted/opened.
 *
 * "Acted" reuses pushOutcomeSweeper's EXISTING open-anchored window
 * verdict (`post_push_outcome.goalCompleted === true`) — refinement #1 of
 * the approved plan: deliberately NOT a second, shorter window, so
 * "acted %" and "avg time-to-action" always describe the exact same set of
 * actions. "Avg time-to-action" averages `actionAt - openedAt` (minutes)
 * only over rows where both are present — `actionAt` is a 07.10.2026
 * additive field (see push-events.service.ts); older `daily_step_goal`
 * outcomes and any outcome written before this fix have no actionAt and
 * are excluded from the average, not treated as zero.
 *
 * UI-honesty refinement #2: unmeasured catalog sources (10 of 15 real push
 * types) still appear as rows — sourced from push-catalog.service.ts, NOT
 * reconstructed from push_events (they have no data there at all) — with
 * every numeric field `null`. The client renders `null` as "לא נמדד",
 * never as 0%, so a real "nobody opened these" is never confused with "we
 * don't track opens for this sender at all".
 *
 * Filters (`channel`, `dateFrom`, `dateTo`) are applied in memory, same
 * "read all, filter in memory" pattern `push-funnel-summary/route.ts`
 * already uses at this data volume — no new Firestore index needed.
 */
import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { resolveAdminAnalyticsScope, type AdminAnalyticsScope } from '@/lib/adminAnalyticsScope';
import {
  ALL_PUSH_SOURCES,
  CATEGORY_TO_SOURCE,
  type ChannelKey,
} from '@/features/admin/services/push-catalog.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_ACCESS_MESSAGE = 'אין לך הרשאה לנתונים אלה. פנה למנהל המערכת אם לדעתך זו טעות.';
const NOT_APPLICABLE_MESSAGE = 'נתוני פוש הם תמיד כלל-פלטפורמיים — לא רלוונטי לתפקיד שלך.';

export interface PushPerformanceRow {
  channel: ChannelKey | null; // null only for a category found in push_events that isn't in the catalog — a drift signal, not expected in normal operation
  entryLabel: string;
  sourceLabel: string;
  funnelCategory: string | null;
  measured: boolean;
  variantId: string | null;
  sent: number | null;
  delivered: number | null;
  deliveredPct: number | null;
  opened: number | null;
  openedPct: number | null;
  acted: number | null;
  actedPct: number | null;
  avgTimeToActionMinutes: number | null;
}

export interface PushPerformanceSummaryResponse {
  rows: PushPerformanceRow[];
}

interface GroupAccum {
  sent: number;
  delivered: number;
  opened: number;
  acted: number;
  timeToActionMinutesSum: number;
  timeToActionCount: number;
}

function pct(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

export async function computePushPerformanceSummary(
  db: FirebaseFirestore.Firestore,
  scope: AdminAnalyticsScope,
  params: { channel?: string; dateFrom?: Date; dateTo?: Date },
) {
  if (scope.kind === 'denied') {
    return { status: 403 as const, body: { error: NO_ACCESS_MESSAGE } };
  }
  if (scope.kind !== 'platform') {
    return { status: 403 as const, body: { error: NOT_APPLICABLE_MESSAGE } };
  }

  let sentDocs: FirebaseFirestore.DocumentData[] = [];
  try {
    const snap = await db.collection('push_events').where('eventType', '==', 'push_sent').get();
    sentDocs = snap.docs.map((d) => d.data());
  } catch (err) {
    console.error('[/api/admin/push-performance-summary] push_sent query failed:', err);
    sentDocs = [];
  }

  let outcomeDocs: FirebaseFirestore.DocumentData[] = [];
  try {
    const snap = await db.collection('push_events').where('eventType', '==', 'post_push_outcome').get();
    outcomeDocs = snap.docs.map((d) => d.data());
  } catch (err) {
    console.error('[/api/admin/push-performance-summary] post_push_outcome query failed:', err);
    outcomeDocs = [];
  }

  // post_push_outcome's docId is deterministic (`${pushId}_${uid}_post_push_outcome`)
  // — at most one outcome doc per push_sent doc, safe to key by pushId+uid.
  const outcomeByKey = new Map<string, FirebaseFirestore.DocumentData>();
  outcomeDocs.forEach((d) => {
    if (typeof d.pushId === 'string' && typeof d.uid === 'string') {
      outcomeByKey.set(`${d.pushId}_${d.uid}`, d);
    }
  });

  const dateFromMillis = params.dateFrom?.getTime() ?? null;
  const dateToMillis = params.dateTo?.getTime() ?? null;

  const filteredSentDocs = sentDocs.filter((d) => {
    if (params.channel) {
      const source = typeof d.category === 'string' ? CATEGORY_TO_SOURCE[d.category] : undefined;
      if (source?.channel !== params.channel) return false;
    }
    if (dateFromMillis == null && dateToMillis == null) return true;
    const sentAt = d.sentAt;
    if (!(sentAt instanceof Timestamp)) return true; // malformed doc — keep rather than silently drop
    const millis = sentAt.toMillis();
    if (dateFromMillis != null && millis < dateFromMillis) return false;
    if (dateToMillis != null && millis > dateToMillis) return false;
    return true;
  });

  const groups = new Map<string, GroupAccum>();

  filteredSentDocs.forEach((d) => {
    const category = typeof d.category === 'string' && d.category ? d.category : 'ללא קטגוריה';
    const variantId = typeof d.variantId === 'string' && d.variantId ? d.variantId : 'ללא גרסה';
    const key = `${category}__${variantId}`;
    const g = groups.get(key) ?? {
      sent: 0, delivered: 0, opened: 0, acted: 0, timeToActionMinutesSum: 0, timeToActionCount: 0,
    };

    g.sent++;
    if (d.delivered === true) g.delivered++;

    const openedAt = d.openedAt;
    const hasOpened = openedAt instanceof Timestamp;
    if (hasOpened) g.opened++;

    if (typeof d.pushId === 'string' && typeof d.uid === 'string') {
      const outcome = outcomeByKey.get(`${d.pushId}_${d.uid}`);
      if (outcome?.goalCompleted === true) {
        g.acted++;
        const actionAt = outcome.actionAt;
        if (hasOpened && actionAt instanceof Timestamp) {
          const minutes = (actionAt.toMillis() - (openedAt as Timestamp).toMillis()) / 60_000;
          if (minutes >= 0) {
            g.timeToActionMinutesSum += minutes;
            g.timeToActionCount++;
          }
        }
      }
    }

    groups.set(key, g);
  });

  const measuredRows: PushPerformanceRow[] = Array.from(groups.entries()).map(([key, g]) => {
    const [category, variantId] = key.split('__');
    const source = CATEGORY_TO_SOURCE[category];
    return {
      channel: source?.channel ?? null,
      entryLabel: source?.entryLabel ?? category,
      sourceLabel: source?.source.label ?? 'קטגוריה לא מזוהה בקטלוג',
      funnelCategory: category,
      measured: true,
      variantId,
      sent: g.sent,
      delivered: g.delivered,
      deliveredPct: pct(g.delivered, g.sent),
      opened: g.opened,
      openedPct: pct(g.opened, g.delivered),
      acted: g.acted,
      actedPct: pct(g.acted, g.opened),
      avgTimeToActionMinutes: g.timeToActionCount > 0
        ? Math.round((g.timeToActionMinutesSum / g.timeToActionCount) * 10) / 10
        : null,
    };
  }).sort((a, b) => (b.sent ?? 0) - (a.sent ?? 0));

  // Unmeasured catalog sources — real types with zero push_events data,
  // shown honestly rather than silently omitted (refinement #2).
  const unmeasuredRows: PushPerformanceRow[] = ALL_PUSH_SOURCES
    .filter((s) => !s.source.measured)
    .filter((s) => !params.channel || s.channel === params.channel)
    .map((s) => ({
      channel: s.channel,
      entryLabel: s.entryLabel,
      sourceLabel: s.source.label,
      funnelCategory: null,
      measured: false,
      variantId: null,
      sent: null,
      delivered: null,
      deliveredPct: null,
      opened: null,
      openedPct: null,
      acted: null,
      actedPct: null,
      avgTimeToActionMinutes: null,
    }));

  return {
    status: 200 as const,
    body: {
      rows: [...measuredRows, ...unmeasuredRows],
    },
  };
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization') ?? '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!idToken) {
      return NextResponse.json({ error: 'Missing auth token' }, { status: 401 });
    }

    const adminAuth = getAdminAuth();
    let uid: string;
    try {
      const decoded = await adminAuth.verifyIdToken(idToken, true);
      uid = decoded.uid;
    } catch {
      return NextResponse.json({ error: 'Invalid auth token' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const channel = searchParams.get('channel') ?? undefined;
    const dateFromRaw = searchParams.get('dateFrom');
    const dateToRaw = searchParams.get('dateTo');
    const dateFrom = dateFromRaw ? new Date(dateFromRaw) : undefined;
    const dateTo = dateToRaw ? new Date(dateToRaw) : undefined;

    const scope = await resolveAdminAnalyticsScope(uid);
    const db = getAdminDb();
    const result = await computePushPerformanceSummary(db, scope, {
      channel,
      dateFrom: dateFrom && !isNaN(dateFrom.getTime()) ? dateFrom : undefined,
      dateTo: dateTo && !isNaN(dateTo.getTime()) ? dateTo : undefined,
    });
    return NextResponse.json(result.body, { status: result.status });
  } catch (err: unknown) {
    console.error('[/api/admin/push-performance-summary] error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
