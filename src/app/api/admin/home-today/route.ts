/**
 * GET /api/admin/home-today — the panel home: the week's growth pulse plus
 * what needs attention (pending approvals, stale maintenance reports,
 * invoices waiting, users to nudge, signup failures). Platform scope only;
 * each attention count fails independently and says so (count: null) rather
 * than reading as 0.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { resolveAdminAnalyticsScope } from '@/lib/adminAnalyticsScope';
import { isTestOrMockUser } from '@/lib/testAccountFilter';
import { isRealWorkoutCompletion } from '@/lib/workout-completion-kpi';
import { isRootAdmin } from '@/config/feature-flags';
import { computeWeekPulse, type HomeUser, type HomeWorkout } from '@/features/admin/services/home-today';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DAY = 24 * 60 * 60 * 1000;
const OPEN_REPORT_STATUSES = ['reported', 'in_review', 'in_progress'];

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

type Attention = { key: string; label: string; count: number | null; href: string; tone: 'warn' | 'bad' | 'info' };

async function count(label: string, fn: () => Promise<number>): Promise<number | null> {
  try {
    return await fn();
  } catch (err) {
    console.error(`[/api/admin/home-today] ${label} failed:`, err);
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization') ?? '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!idToken) return NextResponse.json({ error: 'Missing auth token' }, { status: 401 });

    let uid: string;
    let email: string | undefined;
    try {
      const decoded = await getAdminAuth().verifyIdToken(idToken, true);
      uid = decoded.uid;
      email = decoded.email;
    } catch {
      return NextResponse.json({ error: 'Invalid auth token' }, { status: 401 });
    }

    const scope = await resolveAdminAnalyticsScope(uid);
    if (scope.kind !== 'platform') {
      return NextResponse.json({ error: 'דף הבית הזה מציג את כל הפלטפורמה — זמין לצוות OUT בלבד.' }, { status: 403 });
    }

    const db = getAdminDb();
    const now = new Date();

    // ── pulse ──
    const [usersSnap, workoutsSnap] = await Promise.all([
      db.collection('users').get(),
      db.collection('workouts').where('date', '>=', new Date(now.getTime() - 35 * DAY)).get(),
    ]);
    const realUids = new Set<string>();
    const users: HomeUser[] = [];
    for (const d of usersSnap.docs) {
      const data = d.data();
      if (isTestOrMockUser(data?.core as Record<string, unknown> | undefined)) continue;
      realUids.add(d.id);
      const createdAt = toDateSafe(data.createdAt);
      if (!createdAt || createdAt < new Date(now.getTime() - 35 * DAY)) continue;
      const attr = (data.marketingAttribution ?? {}) as Record<string, unknown>;
      users.push({
        uid: d.id,
        createdAt,
        source: typeof attr.source === 'string' ? attr.source : null,
        linkId: typeof attr.linkId === 'string' && attr.linkId ? attr.linkId : null,
        onboardingDone: data.onboardingStatus === 'COMPLETED' || data.onboardingStep === 'COMPLETED',
        onboardingCompletedAt: toDateSafe(data.onboardingCompletedAt),
      });
    }
    const workouts: HomeWorkout[] = [];
    for (const w of workoutsSnap.docs) {
      const data = w.data();
      const at = toDateSafe(data.date);
      if (!at || typeof data.userId !== 'string' || !realUids.has(data.userId) || !isRealWorkoutCompletion(data)) continue;
      workouts.push({ uid: data.userId, at });
    }
    const pulse = computeWeekPulse(users, workouts, now);

    // ── needs attention ──
    const [parks, staleReports, invoices, failures] = await Promise.all([
      count('pending parks', async () => {
        const s = await db.collection('parks').where('published', '==', false).get();
        return s.docs.filter((d) => {
          const cs = d.data()?.contentStatus;
          return cs !== 'draft' && cs !== 'rejected';
        }).length;
      }),
      // (no pending-routes count here: route collections are read/written only
      // through the approved route-collection files — scripts/safety-check.sh.
      // The approval center the parks row links to lists routes too.)
      count('stale reports', async () => {
        const s = await db.collection('maintenance_reports').where('status', 'in', OPEN_REPORT_STATUSES).get();
        const weekAgo = now.getTime() - 7 * DAY;
        return s.docs.filter((d) => {
          const at = toDateSafe(d.data()?.reportedAt);
          return !!at && at.getTime() < weekAgo;
        }).length;
      }),
      count('pending invoices', async () => (await db.collection('transactions').where('approval', '==', 'pending').count().get()).data().count),
      isRootAdmin(email)
        ? count('signup failures', async () => (await db.collection('signup_failures').where('timestamp', '>=', new Date(now.getTime() - 7 * DAY)).count().get()).data().count)
        : Promise.resolve(undefined),
    ]);

    const attention: Attention[] = [
      { key: 'parks', label: 'מיקומים ממתינים לאישור (וגם מסלולים במרכז האישורים)', count: parks, href: '/admin/approval-center', tone: 'warn' },
      { key: 'reports', label: 'דיווחי תקלה פתוחים יותר משבוע', count: staleReports, href: '/admin/authority/reports', tone: 'bad' },
      { key: 'invoices', label: 'חשבוניות ממתינות לאישור', count: invoices, href: '/admin/finance/approvals', tone: 'info' },
      { key: 'nudge', label: 'סיימו אונבורדינג ולא התאמנו', count: pulse.toNudge, href: '/admin/journey', tone: 'info' },
      ...(failures !== undefined ? [{ key: 'failures', label: 'כשלי הרשמה השבוע', count: failures, href: '/admin/signup-failures', tone: 'bad' as const }] : []),
    ];

    return NextResponse.json({ pulse, attention });
  } catch (err) {
    console.error('[/api/admin/home-today] error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
