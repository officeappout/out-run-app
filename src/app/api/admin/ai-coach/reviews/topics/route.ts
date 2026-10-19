/**
 * GET /api/admin/ai-coach/reviews/topics?days=7|30 — "נושאים מובילים" in the שיחות קלי panel
 * (Kelly phase 2, flag ai_coach_phase2): what users ask Kelly about, from the review docs'
 * question-topic tags, with up to 3 example questions per topic. Super admin only, read-only.
 *
 * Anonymized: examples carry no name, uid or review id; typed emails / phone numbers and long
 * digit runs are masked (topics.ts anonymizeQuestion).
 */
import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { requireSuperAdminApi } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { AI_COACH_REVIEWS } from '@/lib/ai/review/review-types';
import { topicSummary } from '@/lib/ai/review/topics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DAY_MS = 86_400_000;

export async function GET(request: NextRequest) {
  const denied = await requireSuperAdminApi(request);
  if (denied) return denied;
  try {
    const days = Number(new URL(request.url).searchParams.get('days')) === 30 ? 30 : 7;
    const snap = await getAdminDb()
      .collection(AI_COACH_REVIEWS)
      .where('createdAt', '>=', Timestamp.fromMillis(Date.now() - days * DAY_MS))
      .orderBy('createdAt', 'desc')
      .limit(500)
      .get();
    const reviews = snap.docs.map((d) => {
      const x = d.data() as { topics?: unknown; turns?: unknown };
      return { topics: x.topics, turns: Array.isArray(x.turns) ? (x.turns as Array<{ turnIndex: number; userText?: string }>) : [] };
    });
    const { total, rows } = topicSummary(reviews, 3);
    return NextResponse.json({ days, total, rows });
  } catch (err) {
    console.error('[ai-review/topics] failed', err);
    return NextResponse.json({ error: 'load_failed' }, { status: 500 });
  }
}
