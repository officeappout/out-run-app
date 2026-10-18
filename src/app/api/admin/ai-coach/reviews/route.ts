/**
 * GET /api/admin/ai-coach/reviews?days=14 — the "שיחות קלי" panel: daily stats for the last
 * N days + every flagged turn from reviews in that window. Super admin only (read-only).
 *
 * Returns first names only (no uid, email or phone). The review doc id (which embeds the
 * uid) is returned as the opaque handle the actions route needs.
 */
import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { requireSuperAdminApi } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { getIsraelDateKey } from '@/lib/israelTime';
import { AI_COACH_REVIEWS, AI_COACH_REVIEW_STATS, type ReviewIssue } from '@/lib/ai/review/review-types';
import { averageScore, sumDeltas, topEntries, trend, type StatsDelta } from '@/lib/ai/review/stats';
import { flattenFlagged, type ReviewForList } from '@/lib/ai/review/review-list';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DAY_MS = 86_400_000;

function msOf(v: unknown): number {
  if (v && typeof (v as { toMillis?: unknown }).toMillis === 'function') return (v as Timestamp).toMillis();
  return typeof v === 'number' ? v : 0;
}

export async function GET(request: NextRequest) {
  const denied = await requireSuperAdminApi(request);
  if (denied) return denied;

  try {
    const url = new URL(request.url);
    const days = Math.min(Math.max(Number(url.searchParams.get('days')) || 14, 1), 90);
    const now = Date.now();
    const db = getAdminDb();

    const dayKeys = Array.from({ length: days }, (_, i) => getIsraelDateKey(new Date(now - i * DAY_MS)));
    const statSnaps = await db.getAll(...dayKeys.map((d) => db.collection(AI_COACH_REVIEW_STATS).doc(d)));
    const dayDocs = statSnaps
      .filter((s) => s.exists)
      .map((s) => ({ day: s.id, ...(s.data() as Partial<StatsDelta>) }));
    const total = sumDeltas(dayDocs);

    const rSnap = await db
      .collection(AI_COACH_REVIEWS)
      .where('createdAt', '>=', Timestamp.fromMillis(now - days * DAY_MS))
      .orderBy('createdAt', 'desc')
      .limit(500)
      .get();
    const reviews: ReviewForList[] = rSnap.docs.map((d) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- stored review, read through field guards
      const x = d.data() as Record<string, any>;
      return {
        id: d.id,
        day: typeof x.day === 'string' ? x.day : '',
        createdAtMs: msOf(x.createdAt) || (typeof x.createdAtMs === 'number' ? x.createdAtMs : 0),
        firstName: typeof x.firstName === 'string' ? x.firstName : '',
        score: typeof x.score === 'number' ? x.score : null,
        turns: Array.isArray(x.turns) ? x.turns : [],
        issues: Array.isArray(x.issues) ? (x.issues as ReviewIssue[]) : [],
        issueStatus: x.issueStatus && typeof x.issueStatus === 'object' ? x.issueStatus : {},
      };
    });

    return NextResponse.json({
      days,
      summary: {
        reviews: total.reviews,
        turns: total.turns,
        issues: total.issues,
        flaggedTurns: total.flaggedTurns,
        avgScore: averageScore(total),
        costUsd: Math.round(total.costUsd * 10000) / 10000,
        graderErrors: total.graderErrors,
        topCategories: topEntries(total.byCategory, 6),
        topRootCauses: topEntries(total.byRootCause, 6),
        bySeverity: total.bySeverity,
      },
      trend: trend(dayDocs),
      rows: flattenFlagged(reviews),
    });
  } catch (err) {
    console.error('[ai-review/list] failed', err);
    return NextResponse.json({ error: 'load_failed' }, { status: 500 });
  }
}
