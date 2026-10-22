/**
 * attention-queue.server — the panel home's "needs attention" counts, extracted from
 * /api/admin/home-today (same queries, same filters) so the page and the assistant share one
 * implementation. Each count fails on its own and returns null ("could not count"), never 0.
 *
 * The 5th home row ("סיימו אונבורדינג ולא התאמנו") comes from the week pulse, which reads the
 * whole users collection; it is not part of this function (the home route still computes it).
 */
import 'server-only';
import type { Firestore } from 'firebase-admin/firestore';
import { DAY_MS, toDateSafe } from './dates';

export const OPEN_REPORT_STATUSES = ['reported', 'in_review', 'in_progress'];

export interface AttentionCounts {
  /** parks published:false that aren't drafts/rejected (routes are listed in the approval center too) */
  pendingParks: number | null;
  /** open maintenance reports older than 7 days */
  staleReports: number | null;
  /** transactions waiting for approval */
  pendingInvoices: number | null;
  /** signup failures in the last 7 days — undefined when the caller is not root */
  signupFailures7d?: number | null;
}

async function count(label: string, fn: () => Promise<number>): Promise<number | null> {
  try {
    return await fn();
  } catch (err) {
    console.error(`[admin-analytics/attention] ${label} failed:`, err);
    return null;
  }
}

export async function computeAttentionCounts(
  db: Firestore,
  opts: { now?: Date; includeSignupFailures: boolean },
): Promise<AttentionCounts> {
  const now = opts.now ?? new Date();
  const [pendingParks, staleReports, pendingInvoices, signupFailures7d] = await Promise.all([
    count('pending parks', async () => {
      const s = await db.collection('parks').where('published', '==', false).get();
      return s.docs.filter((d) => {
        const cs = d.data()?.contentStatus;
        return cs !== 'draft' && cs !== 'rejected';
      }).length;
    }),
    count('stale reports', async () => {
      const s = await db.collection('maintenance_reports').where('status', 'in', OPEN_REPORT_STATUSES).get();
      const weekAgo = now.getTime() - 7 * DAY_MS;
      return s.docs.filter((d) => {
        const at = toDateSafe(d.data()?.reportedAt);
        return !!at && at.getTime() < weekAgo;
      }).length;
    }),
    count('pending invoices', async () => (await db.collection('transactions').where('approval', '==', 'pending').count().get()).data().count),
    opts.includeSignupFailures
      ? count('signup failures', async () => (await db.collection('signup_failures').where('timestamp', '>=', new Date(now.getTime() - 7 * DAY_MS)).count().get()).data().count)
      : Promise.resolve(undefined),
  ]);
  return { pendingParks, staleReports, pendingInvoices, ...(signupFailures7d !== undefined ? { signupFailures7d } : {}) };
}
