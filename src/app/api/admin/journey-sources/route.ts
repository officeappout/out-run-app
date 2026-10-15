/**
 * GET /api/admin/journey-sources?from=ISO&to=ISO — Journey "מקורות הגעה".
 *
 * Reads (Admin SDK, platform scope only — this is a whole-platform growth
 * view, like growth-metrics/retention-depth):
 *   - users created in [from, to] (real accounts only — isTestOrMockUser)
 *   - their workouts (by userId, chunks of 30) → first REAL workout
 *     (isRealWorkoutCompletion) for the 7-day activation flag
 *   - referrals joined in [from, to] → invitees
 *   - marketing_links + each link's daily_stats in the range → clicks
 *   - web_daily_stats in the range → site sessions, download clicks,
 *     instagram-referred sessions
 * and hands them to the pure aggregateJourneySources().
 * Default range: the last 30 days.
 */
import { NextRequest, NextResponse } from 'next/server';
import { FieldPath } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { resolveAdminAnalyticsScope, type AdminAnalyticsScope } from '@/lib/adminAnalyticsScope';
import { isTestOrMockUser } from '@/lib/testAccountFilter';
import { isRealWorkoutCompletion } from '@/lib/workout-completion-kpi';
import {
  aggregateJourneySources,
  parseRange,
  type SourceLink,
  type SourceUser,
  type WebDay,
} from '@/features/admin/services/journey-sources';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_ACCESS_MESSAGE = 'אין לך הרשאה לנתונים אלה. פנה למנהל המערכת אם לדעתך זו טעות.';
const NOT_APPLICABLE_MESSAGE = 'מקורות ההגעה משקפים את כל הפלטפורמה — זמין לצוות OUT בלבד.';

function toDateSafe(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof (v as { toDate?: () => Date })?.toDate === 'function') return (v as { toDate: () => Date }).toDate();
  if (typeof v === 'string' || typeof v === 'number') {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

const chunk = <T,>(arr: T[], n: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const sumMatching = (m: unknown, test: (k: string) => boolean) =>
  m && typeof m === 'object'
    ? Object.entries(m as Record<string, unknown>).reduce((s, [k, v]) => (test(k) ? s + num(v) : s), 0)
    : 0;


export async function computeJourneySources(
  db: FirebaseFirestore.Firestore,
  scope: AdminAnalyticsScope,
  range: { from: Date; to: Date },
) {
  if (scope.kind === 'denied') return { status: 403 as const, body: { error: NO_ACCESS_MESSAGE } };
  if (scope.kind !== 'platform') return { status: 403 as const, body: { error: NOT_APPLICABLE_MESSAGE } };

  const { from, to } = range;
  const fromKey = from.toISOString().slice(0, 10);
  const toKey = to.toISOString().slice(0, 10);

  // ── signups in range (real accounts only) ──
  // read all users and filter in memory (same as growth-metrics/retention-
  // depth): createdAt isn't stored uniformly (Timestamp / Date / string), and
  // a Firestore range query would silently skip the non-Timestamp ones
  const usersSnap = await db.collection('users').get();
  const userDocs = usersSnap.docs.filter((d) => {
    const data = d.data();
    if (isTestOrMockUser(data?.core as Record<string, unknown> | undefined)) return false;
    const created = toDateSafe(data?.createdAt);
    return !!created && created >= from && created <= to;
  });

  // ── their first real workout ──
  const firstWorkout = new Map<string, Date>();
  const uids = userDocs.map((d) => d.id);
  const workoutSnaps = await Promise.all(chunk(uids, 30).map((b) => db.collection('workouts').where('userId', 'in', b).get()));
  for (const snap of workoutSnaps) {
    for (const w of snap.docs) {
      const data = w.data();
      if (!isRealWorkoutCompletion(data)) continue;
      const uid = data.userId as string;
      const date = toDateSafe(data.date);
      if (!date) continue;
      const prev = firstWorkout.get(uid);
      if (!prev || date < prev) firstWorkout.set(uid, date);
    }
  }

  const users: SourceUser[] = [];
  for (const d of userDocs) {
    const data = d.data();
    const createdAt = toDateSafe(data.createdAt);
    if (!createdAt) continue;
    const attr = (data.marketingAttribution ?? {}) as Record<string, unknown>;
    users.push({
      uid: d.id,
      createdAt,
      source: typeof attr.source === 'string' ? attr.source : null,
      linkId: typeof attr.linkId === 'string' && attr.linkId ? attr.linkId : null,
      firstWorkoutAt: firstWorkout.get(d.id) ?? null,
    });
  }

  // ── invites ──
  const inviteeUids = new Set<string>();
  try {
    const refSnap = await db.collection('referrals').where('joinedAt', '>=', from).get();
    refSnap.docs.forEach((r) => {
      const invitee = r.data()?.inviteeUid;
      if (typeof invitee === 'string') inviteeUids.add(invitee);
    });
  } catch (err) {
    console.error('[/api/admin/journey-sources] referrals read failed:', err);
  }

  // ── smart links + their clicks in range ──
  const linksSnap = await db.collection('marketing_links').get();
  const links: SourceLink[] = await Promise.all(
    linksSnap.docs.map(async (l) => {
      const data = l.data();
      const statsSnap = await l.ref
        .collection('daily_stats')
        .where(FieldPath.documentId(), '>=', fromKey)
        .where(FieldPath.documentId(), '<=', toKey)
        .get();
      return {
        id: l.id,
        name: (typeof data.friendlyName === 'string' && data.friendlyName) || l.id,
        utmSource: typeof data.utmSource === 'string' ? data.utmSource : null,
        utmMedium: typeof data.utmMedium === 'string' ? data.utmMedium : null,
        linkType: typeof data.linkType === 'string' ? data.linkType : null,
        clicks: statsSnap.docs.reduce((s, x) => s + num(x.data()?.total), 0),
      };
    }),
  );

  // ── the marketing site ──
  const webSnap = await db
    .collection('web_daily_stats')
    .where(FieldPath.documentId(), '>=', fromKey)
    .where(FieldPath.documentId(), '<=', toKey)
    .get();
  const webDays: WebDay[] = webSnap.docs.map((w) => {
    const data = w.data();
    return {
      date: w.id,
      sessions: num(data.sessions),
      downloadClicks: sumMatching(data.ctaByTarget, (k) => k === 'appstore' || k === 'play' || k === 'onelink'),
      instagramSessions: sumMatching(data.bySource, (k) => k.toLowerCase().includes('instagram')),
    };
  });

  return {
    status: 200 as const,
    body: aggregateJourneySources({ from, to, users, links, inviteeUids, webDays }),
  };
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization') ?? '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!idToken) return NextResponse.json({ error: 'Missing auth token' }, { status: 401 });

    let uid: string;
    try {
      uid = (await getAdminAuth().verifyIdToken(idToken, true)).uid;
    } catch {
      return NextResponse.json({ error: 'Invalid auth token' }, { status: 401 });
    }

    const scope = await resolveAdminAnalyticsScope(uid);
    const sp = request.nextUrl.searchParams;
    const range = parseRange(sp.get('from'), sp.get('to'));
    const result = await computeJourneySources(getAdminDb(), scope, range);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    console.error('[/api/admin/journey-sources] error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
